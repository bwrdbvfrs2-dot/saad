// وطني بوت — المرحلة 2: الإرسال اليومي عبر واتساب، استقبال الردود، إيقاف من يطلب، والرد الآلي بالذكاء الاصطناعي.
// Everything here runs on the server with the Admin SDK: the WhatsApp token and the AI key never reach a browser,
// and bot_contacts / bot_conversations / bot_runs are written only from here (the security rules refuse clients).
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const { normalizeSaudiMobile, toWhatsApp, firstName } = require("./lib/mobile");
const { riyadhToday } = require("./lib/time");
const { computeDailyList } = require("./lib/eligibility");
const { sendTemplate, sendText, validSignature } = require("./lib/whatsapp");
const { isOptOut } = require("./lib/optout");
const { buildCustomerContext } = require("./lib/customerContext");
const { draftReply, MODEL } = require("./lib/ai");

initializeApp();
const db = getFirestore();

const REGION = "europe-west1";
const WHATSAPP_TOKEN = defineSecret("WHATSAPP_TOKEN");
const WHATSAPP_APP_SECRET = defineSecret("WHATSAPP_APP_SECRET");
const WHATSAPP_VERIFY_TOKEN = defineSecret("WHATSAPP_VERIFY_TOKEN");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// same defaults as the app's settings screen (js/watani-bot.js BOT_DEFAULTS) plus the WhatsApp/AI switches
const BOT_DEFAULTS = { dailyCap:20, dormantMonths:6, attributionDays:30, campaignsEnabled:false,
  testMode:true, testNumbers:[], phoneNumberId:"", templateCustomer:"", templateLead:"", templateLang:"ar",
  aiRepliesEnabled:false, aiDailyPerNumber:10 };
const OPT_OUT_REPLY = "تم، ما راح نرسل لك رسائل بعد اليوم. إذا احتجت شي حنا بالخدمة.";
const HANDOFF_REPLY = "استلمنا رسالتك، وبيتواصل معك أحد موظفينا قريب إن شاء الله.";

async function loadSettings(){
  const snap = await db.doc("bot/settings").get();
  return { ...BOT_DEFAULTS, ...(snap.exists ? snap.data() : {}) };
}
const sleep = ms=> new Promise(r=> setTimeout(r, ms));
const convRef = (mobile, id)=> db.collection("bot_conversations").doc(mobile).collection("messages").doc(id);

// ---------------- the daily outreach ----------------
// scheduled: runs once a day; manual (the manager's "send now" button): may run again the same day.
// In test mode only the manager's test numbers get the message — nobody on the real list is touched.
async function runOutreach({ manual = false, by = "schedule" } = {}){
  const settings = await loadSettings();
  if(!manual && !settings.campaignsEnabled) return { skipped:"الحملات موقفة من الإعدادات" };
  if(!settings.phoneNumberId || !settings.templateCustomer) return { skipped:"إعدادات واتساب ناقصة (معرّف الرقم أو اسم القالب)" };
  const today = riyadhToday();
  const runRef = db.collection("bot_runs").doc(manual ? `${today}-يدوي-${Date.now()}` : today);
  if(!manual){
    try{ await runRef.create({ date:today, startedAt:FieldValue.serverTimestamp(), by, status:"running" }); }
    catch(e){ return { skipped:"تم تشغيل إرسال اليوم من قبل" }; }            // a retried schedule never sends twice
  }
  const token = WHATSAPP_TOKEN.value();
  const results = { sent:0, failed:0, errors:[], testMode:!!settings.testMode, recipients:[] };

  let targets;
  if(settings.testMode){
    targets = (settings.testNumbers || []).map(normalizeSaudiMobile).filter(Boolean).slice(0, settings.dailyCap)
      .map(mobile=>({ kind:"test", mobile, name:"" }));
  }else{
    const [stateSnap, leadsSnap, contactsSnap] = await Promise.all([ db.doc("shop/state").get(), db.collection("leads").get(), db.collection("bot_contacts").get() ]);
    const contacts = {}; contactsSnap.forEach(d=>{ contacts[d.id] = d.data(); });
    targets = computeDailyList({ state:stateSnap.exists ? stateSnap.data() : {}, leads:leadsSnap.docs.map(d=> d.data()), contacts, settings, today }).list;
  }

  for(const t of targets){
    const to = toWhatsApp(t.mobile);
    const template = t.kind === "lead" && settings.templateLead ? settings.templateLead : settings.templateCustomer;
    const name = firstName(t.name) || "عميلنا";
    try{
      const wamid = await sendTemplate({ phoneNumberId:settings.phoneNumberId, token, to, template, lang:settings.templateLang, bodyParams:[name] });
      results.sent++; results.recipients.push({ mobile:t.mobile, kind:t.kind });
      const at = new Date().toISOString();
      await convRef(t.mobile, wamid || `out-${Date.now()}`).set({ direction:"out", kind:"template", template, text:`[قالب ${template}] ${name}`, at:FieldValue.serverTimestamp(), status:"sent" });
      if(t.kind !== "test"){
        await db.collection("bot_contacts").doc(t.mobile).set({ mobile:t.mobile, kind:t.kind, lastContactAt:at, lastTemplate:template,
          contactCount:FieldValue.increment(1), lastStatus:"sent" }, { merge:true });
        if(t.kind === "lead") await db.collection("leads").doc(t.mobile).set({ status:"contacted", contactedAt:at }, { merge:true });
      }
    }catch(e){
      results.failed++; results.errors.push({ mobile:t.mobile, error:String(e.message).slice(0, 200) });
      logger.warn("template send failed", { mobile:t.mobile, status:e.status, code:e.code });
      if(e.status === 401 || e.code === 190) break;                                 // bad/expired token: stop, don't hammer
    }
    await sleep(300);
  }
  await runRef.set({ date:today, by, finishedAt:FieldValue.serverTimestamp(), status:"done", ...results }, { merge:true });
  return results;
}

exports.botDailyOutreach = onSchedule({ schedule:"every day 10:00", timeZone:"Asia/Riyadh", region:REGION, secrets:[WHATSAPP_TOKEN], timeoutSeconds:540 },
  async ()=>{ const r = await runOutreach(); logger.info("daily outreach", r); });

// the manager's "send now" button (in test mode: only to the test numbers)
exports.botRunNow = onCall({ region:REGION, secrets:[WHATSAPP_TOKEN], timeoutSeconds:540 }, async (request)=>{
  if(!request.auth) throw new HttpsError("unauthenticated", "سجّل دخولك أولاً");
  const role = await db.doc(`roles/${request.auth.uid}`).get();
  if(!role.exists || role.data().role !== "مدير") throw new HttpsError("permission-denied", "هذا للمدير فقط");
  return runOutreach({ manual:true, by:request.auth.uid });
});

// ---------------- incoming messages and delivery receipts from WhatsApp ----------------
async function handleInbound(msg, contactName, settings){
  const mobile = normalizeSaudiMobile(msg.from);
  if(!mobile || !msg.id) return;
  const ref = convRef(mobile, msg.id);
  if((await ref.get()).exists) return;                                              // Meta retries: handle each message once
  const text = msg.type === "text" ? (msg.text && msg.text.body) || ""
    : msg.type === "button" ? (msg.button && msg.button.text) || ""
    : msg.type === "interactive" ? ((msg.interactive.button_reply || msg.interactive.list_reply || {}).title || "")
    : "";
  await ref.set({ direction:"in", kind:msg.type, text:text || `[رسالة ${msg.type}]`, at:FieldValue.serverTimestamp() });
  const contactRef = db.collection("bot_contacts").doc(mobile);
  await contactRef.set({ mobile, lastInboundAt:new Date().toISOString(), ...(contactName ? { waName:contactName } : {}) }, { merge:true });
  const token = WHATSAPP_TOKEN.value();
  const reply = async (body, kind)=>{
    const wamid = await sendText({ phoneNumberId:settings.phoneNumberId, token, to:toWhatsApp(mobile), text:body });
    await convRef(mobile, wamid || `out-${Date.now()}`).set({ direction:"out", kind, text:body, at:FieldValue.serverTimestamp(), status:"sent" });
  };
  const optOut = async ()=>{
    const at = new Date().toISOString();
    await contactRef.set({ optedOut:true, optedOutAt:at }, { merge:true });
    await db.collection("leads").doc(mobile).get().then(s=> s.exists && s.ref.update({ status:"opted_out", optedOutAt:at }));
  };

  if(text && isOptOut(text)){ await optOut(); await reply(OPT_OUT_REPLY, "optout"); return; }
  if(!text){ await contactRef.set({ needsHuman:true, needsHumanAt:new Date().toISOString(), needsHumanReason:"رسالة غير نصية" }, { merge:true }); return; }
  if(!settings.aiRepliesEnabled){ await contactRef.set({ needsHuman:true, needsHumanAt:new Date().toISOString(), needsHumanReason:"الرد الآلي موقف" }, { merge:true }); return; }

  // a cap on AI replies per number per day keeps a runaway conversation from running up a bill
  const today = riyadhToday();
  const counted = await db.runTransaction(async tx=>{
    const c = (await tx.get(contactRef)).data() || {};
    const used = c.aiDate === today ? (c.aiCount || 0) : 0;
    if(used >= settings.aiDailyPerNumber) return false;
    tx.set(contactRef, { aiDate:today, aiCount:used + 1 }, { merge:true });
    return true;
  });
  if(!counted){ await contactRef.set({ needsHuman:true, needsHumanAt:new Date().toISOString(), needsHumanReason:"تجاوز حد الردود الآلية اليومي" }, { merge:true }); return; }

  let draft = null;
  try{
    const [stateSnap, histSnap] = await Promise.all([
      db.doc("shop/state").get(),
      db.collection("bot_conversations").doc(mobile).collection("messages").orderBy("at", "desc").limit(12).get(),
    ]);
    const ctx = buildCustomerContext(stateSnap.exists ? stateSnap.data() : {}, mobile);
    const history = histSnap.docs.map(d=> d.data()).reverse().filter(m=> m.text).map(m=>({ direction:m.direction, text:m.text }));
    draft = await draftReply({ apiKey:ANTHROPIC_API_KEY.value(), ctx, history });
  }catch(e){ logger.error("AI reply failed", { mobile, error:String(e.message) }); }

  if(!draft){
    await reply(HANDOFF_REPLY, "handoff");
    await contactRef.set({ needsHuman:true, needsHumanAt:new Date().toISOString(), needsHumanReason:"تعذّر الرد الآلي" }, { merge:true });
    return;
  }
  await reply(draft.reply, "ai");
  if(draft.optOut) await optOut();
  if(draft.needsHuman) await contactRef.set({ needsHuman:true, needsHumanAt:new Date().toISOString(), needsHumanReason:"طلب موظف أو سؤال خارج معلومات البوت" }, { merge:true });
}
async function handleStatus(st){
  const mobile = normalizeSaudiMobile(st.recipient_id);
  if(!mobile || !st.id) return;
  const upd = { status:st.status, statusAt:FieldValue.serverTimestamp() };
  if(st.errors && st.errors.length) upd.error = String(st.errors[0].title || st.errors[0].message || st.errors[0].code).slice(0, 200);
  await convRef(mobile, st.id).set(upd, { merge:true });
  await db.collection("bot_contacts").doc(mobile).set({ lastStatus:st.status, ...(upd.error ? { lastError:upd.error } : {}) }, { merge:true });
}

exports.whatsappWebhook = onRequest({ region:REGION, secrets:[WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, ANTHROPIC_API_KEY], timeoutSeconds:120 },
  async (req, res)=>{
    if(req.method === "GET"){                                                         // Meta's one-time subscription check
      const ok = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === WHATSAPP_VERIFY_TOKEN.value();
      return ok ? res.status(200).send(String(req.query["hub.challenge"] || "")) : res.sendStatus(403);
    }
    if(req.method !== "POST") return res.sendStatus(405);
    if(!validSignature(req.rawBody, req.get("x-hub-signature-256"), WHATSAPP_APP_SECRET.value())) return res.sendStatus(403);
    const settings = await loadSettings();
    try{
      for(const entry of (req.body.entry || [])){
        for(const change of (entry.changes || [])){
          const v = change.value || {};
          const names = {}; (v.contacts || []).forEach(c=>{ names[c.wa_id] = c.profile && c.profile.name; });
          for(const st of (v.statuses || [])) await handleStatus(st);
          for(const msg of (v.messages || [])) await handleInbound(msg, names[msg.from], settings);
        }
      }
    }catch(e){ logger.error("webhook processing failed", { error:String(e.message) }); }
    res.sendStatus(200);                                                              // always ack, so Meta doesn't redeliver forever
  });

exports._internal = { runOutreach, handleInbound, MODEL };
