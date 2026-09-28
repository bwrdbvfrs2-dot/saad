// ---------------- وطني بوت — المرحلة 1: قائمة العملاء المحتملين، الإعدادات، وقائمة الإرسال التجريبية ----------------
// Everything the bot keeps lives in its own collections, never inside shop/state (that document has a hard size
// limit and the conversations would outgrow it):
//   leads/{mobile}         numbers imported from Excel — people who never ordered here
//   bot/settings           daily cap, dormancy threshold, attribution window, campaigns on/off
//   bot_contacts/{mobile}  outreach state per number (contacted / opted out) — written only by the server
//                          (Cloud Functions, phase 2); the browser only reads it
const LEADS_COL = db.collection("leads");
const BOT_SETTINGS_DOC = db.collection("bot").doc("settings");
const BOT_CONTACTS_COL = db.collection("bot_contacts");
const BOT_DEFAULTS = {dailyCap:20, dormantMonths:6, attributionDays:30, campaignsEnabled:false,
  // phase 2 — WhatsApp link and AI replies (the server reads the same document: functions/index.js BOT_DEFAULTS)
  testMode:true, testNumbers:[], phoneNumberId:"", templateCustomer:"", templateLead:"", templateLang:"ar",
  aiRepliesEnabled:false, aiDailyPerNumber:10};
const BOT_FUNCTIONS_REGION = "europe-west1";
const BOT_RUNS_COL = db.collection("bot_runs");
const BOT_CONV_COL = db.collection("bot_conversations");
const LEADS_IMPORT_MAX_ROWS = 5000;
let botData = {loaded:false, settings:{...BOT_DEFAULTS}, leads:[], contacts:{}, runs:[]};
let leadsImportPending = null;

// any Saudi mobile written the usual ways (05…, 5…, +9665…, 009665…, spaces, dashes, Arabic digits) → 05XXXXXXXX
function normalizeSaudiMobile(v){
  let s = String(v??"").trim().replace(/[٠-٩]/g, d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  if(typeof v==="number") s = String(Math.round(v));
  s = s.replace(/[\s\-().]/g, "");
  if(s.startsWith("+")) s = s.slice(1);
  if(s.startsWith("00")) s = s.slice(2);
  if(s.startsWith("966")) s = "0" + s.slice(3);
  if(/^5\d{8}$/.test(s)) s = "0" + s;
  return /^05\d{8}$/.test(s) ? s : null;
}
function botFirstName(name){ return String(name||"").trim().split(/\s+/)[0] || ""; }
function botGreeting(name){ const f = botFirstName(name); return f ? `مرحبا ${f}` : "مرحبا"; }
function isBotAdmin(){ return !!currentUser && currentUser.role==="مدير"; }

async function loadBotData(){
  const [settingsSnap, leadsSnap, contactsSnap] = await Promise.all([BOT_SETTINGS_DOC.get(), LEADS_COL.get(), BOT_CONTACTS_COL.get()]);
  botData.settings = {...BOT_DEFAULTS, ...(settingsSnap.exists ? settingsSnap.data() : {})};
  botData.leads = leadsSnap.docs.map(d=>d.data());
  botData.contacts = {}; contactsSnap.docs.forEach(d=>{ botData.contacts[d.id] = d.data(); });
  // the send log appears once the server part is running (and its rules are published) — optional until then
  try{ const runsSnap = await BOT_RUNS_COL.get(); botData.runs = runsSnap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> b.id.localeCompare(a.id)).slice(0,7); }
  catch(e){ botData.runs = []; }
  botData.loaded = true;
  await markConvertedLeads();
}
// a lead whose number now has an invoice became a real customer — mark it once so it leaves the lead campaigns
async function markConvertedLeads(){
  const customerMobiles = new Set(state.customers.map(c=>c.mobile));
  const newlyConverted = botData.leads.filter(l=>l.status!=="converted" && customerMobiles.has(l.mobile));
  if(!newlyConverted.length) return;
  const at = serverNowIso();
  for(let i=0;i<newlyConverted.length;i+=400){
    const batch = db.batch();
    newlyConverted.slice(i,i+400).forEach(l=>{ batch.update(LEADS_COL.doc(l.mobile), {status:"converted", convertedAt:at}); l.status="converted"; l.convertedAt=at; });
    await batch.commit();
  }
}
async function renderBotTab(){
  const wrap = $("botTabBody");
  if(!wrap) return;
  if(!isBotAdmin()){ wrap.innerHTML = `<p class="sub">هذا القسم للمدير فقط.</p>`; return; }
  wrap.innerHTML = `<p class="sub">جاري التحميل…</p>`;
  try{ await loadBotData(); }
  catch(e){ wrap.innerHTML = `<p class="locked-note" style="color:var(--loss);">تعذّر تحميل بيانات البوت — تأكد إن قواعد الحماية الجديدة منشورة في Firebase.</p>`; return; }
  const s = botData.settings;
  const counts = {total:botData.leads.length, fresh:0, contacted:0, optedOut:0, converted:0};
  botData.leads.forEach(l=>{ if(l.status==="converted") counts.converted++; else if(l.status==="opted_out") counts.optedOut++; else if(l.status==="contacted") counts.contacted++; else counts.fresh++; });
  wrap.innerHTML = `
    <h3 style="margin:0 0 10px;font-size:14px;">الإعدادات</h3>
    <div class="row-3">
      <div class="field"><label>السقف اليومي للرسائل</label><input type="number" id="botDailyCap" min="1" max="1000" value="${s.dailyCap}"></div>
      <div class="field"><label>العميل خامل بعد (شهر)</label><input type="number" id="botDormantMonths" min="1" max="36" value="${s.dormantMonths}"></div>
      <div class="field"><label>احتساب الفاتورة نتيجة للحملة خلال (يوم)</label><input type="number" id="botAttributionDays" min="1" max="180" value="${s.attributionDays}"></div>
    </div>
    <h3 style="margin:14px 0 6px;font-size:13px;">ربط واتساب</h3>
    <p class="sub" style="margin-bottom:8px;">القيم من حسابك في Meta (WhatsApp Manager). المفتاح السري ما ينحط هنا أبد — مكانه Secret Manager في Google Cloud.</p>
    <div class="row-3">
      <div class="field"><label>معرّف رقم الواتساب (Phone number ID)</label><input type="text" id="botPhoneNumberId" dir="ltr" value="${esc(s.phoneNumberId||"")}"></div>
      <div class="field"><label>اسم قالب العملاء الخاملين</label><input type="text" id="botTemplateCustomer" dir="ltr" value="${esc(s.templateCustomer||"")}"></div>
      <div class="field"><label>اسم قالب العملاء المحتملين</label><input type="text" id="botTemplateLead" dir="ltr" placeholder="نفس قالب العملاء إذا فاضي" value="${esc(s.templateLead||"")}"></div>
    </div>
    <div class="row-3">
      <div class="field"><label>لغة القوالب</label><input type="text" id="botTemplateLang" dir="ltr" value="${esc(s.templateLang||"ar")}"></div>
      <div class="field" style="grid-column:span 2;"><label>أرقام التجربة (يفصل بينها فاصلة)</label><input type="text" id="botTestNumbers" dir="ltr" value="${esc((s.testNumbers||[]).join(", "))}"></div>
    </div>
    <div class="embro-toggle" style="margin:4px 0;"><input type="checkbox" id="botTestMode" ${s.testMode?"checked":""}><label style="margin:0;">وضع التجربة — الرسائل تروح لأرقام التجربة بس، وما يوصل شي للعملاء</label></div>
    <div class="embro-toggle" style="margin:4px 0;"><input type="checkbox" id="botCampaignsEnabled" ${s.campaignsEnabled?"checked":""}><label style="margin:0;">تشغيل الإرسال اليومي التلقائي (كل يوم الساعة 10 الصبح)</label></div>
    <h3 style="margin:14px 0 6px;font-size:13px;">الرد الآلي بالذكاء الاصطناعي</h3>
    <div class="embro-toggle" style="margin:4px 0;"><input type="checkbox" id="botAiReplies" ${s.aiRepliesEnabled?"checked":""}><label style="margin:0;">البوت يرد على رسائل العملاء (من معلومات المحل وطلبات العميل نفسه بس)</label></div>
    <div class="row-3"><div class="field"><label>أقصى عدد ردود آلية لكل رقم في اليوم</label><input type="number" id="botAiDailyPerNumber" min="1" max="50" value="${s.aiDailyPerNumber}"></div></div>
    <button class="btn btn-gold btn-sm" id="botSaveSettingsBtn">حفظ الإعدادات</button>
    <button class="btn btn-ghost btn-sm" id="botRunNowBtn" style="margin-inline-start:6px;">إرسال الآن ${s.testMode?"(لأرقام التجربة)":"(للعملاء فعلياً)"}</button>
    <div id="botRunNowResult" style="margin-top:8px;"></div>
    <div class="stitch"></div>
    <h3 style="margin:0 0 6px;font-size:14px;">محادثات تحتاج موظف</h3>
    <div id="botNeedsHuman">${renderBotNeedsHumanHtml()}</div>
    <div class="stitch"></div>
    <h3 style="margin:0 0 6px;font-size:14px;">آخر عمليات الإرسال</h3>
    ${renderBotRunsHtml()}
    <div class="stitch"></div>
    <h3 style="margin:0 0 10px;font-size:14px;">قائمة العملاء المحتملين</h3>
    <p class="sub" style="margin-bottom:8px;">أرقام ناس ما فصّلوا عندك قبل. أول ما يسجّل أي رقم منها فاتورة، يتحوّل لعميل ويطلع من القائمة تلقائياً.</p>
    <div class="report-grid" style="margin-bottom:10px;">
      <div class="report-card"><div class="st">الإجمالي</div><div class="amt">${counts.total}</div></div>
      <div class="report-card"><div class="st">لم يُتواصل معهم</div><div class="amt">${counts.fresh}</div></div>
      <div class="report-card"><div class="st">تم التواصل</div><div class="amt">${counts.contacted}</div></div>
      <div class="report-card"><div class="st">طلبوا الإيقاف</div><div class="amt">${counts.optedOut}</div></div>
      <div class="report-card"><div class="st">تحوّلوا لعملاء</div><div class="amt">${counts.converted}</div></div>
    </div>
    <p class="sub" style="margin-bottom:8px;">الملف يكفي فيه عمود الجوال، والاسم اختياري. البرنامج يتعرف على الأعمدة بنفسه، ويقبل الأرقام بأي صيغة سعودية (05… أو 5… أو ‎+966…).</p>
    <div class="actions-row" style="margin-bottom:10px;"><button class="btn btn-ghost btn-sm" id="leadsTemplateBtn">تحميل قالب الإكسل</button></div>
    <div class="field"><label>ملف الأرقام (xlsx أو csv)</label><input type="file" id="leadsImportFile" accept=".xlsx,.xlsb,.csv"></div>
    <div id="leadsImportPreview"></div>
    <div class="stitch"></div>
    <h3 style="margin:0 0 6px;font-size:14px;">قائمة إرسال اليوم (تجريبية)</h3>
    <p class="sub" style="margin-bottom:10px;">هذي الأرقام اللي بيرسل لها البوت اليوم لو كان شغال — <b>ما ينرسل شي فعلياً</b>. الأولوية للعملاء الخاملين (الأقدم خمولاً أولاً)، والباقي يتعبى من قائمة العملاء المحتملين.</p>
    <div id="botDryRun">${renderBotDryRunHtml()}</div>`;
  $("botSaveSettingsBtn").addEventListener("click", saveBotSettings);
  $("botRunNowBtn").addEventListener("click", botRunNow);
  wrap.querySelectorAll(".bot-conv-btn").forEach(b=> b.addEventListener("click", ()=> showBotConversation(b.dataset.mobile)));
  wrap.querySelectorAll(".bot-done-btn").forEach(b=> b.addEventListener("click", ()=> clearBotNeedsHuman(b.dataset.mobile)));
  $("leadsTemplateBtn").addEventListener("click", downloadLeadsTemplate);
  $("leadsImportFile").addEventListener("change", ()=>{ const f=$("leadsImportFile").files[0]; if(f) previewLeadsImport(f); });
}
async function saveBotSettings(){
  if(!isBotAdmin()){ showToast("للمدير فقط"); return; }
  const dailyCap = parseInt($("botDailyCap").value), dormantMonths = parseInt($("botDormantMonths").value), attributionDays = parseInt($("botAttributionDays").value);
  if(!(dailyCap>=1 && dailyCap<=1000)){ showToast("السقف اليومي بين 1 و1000"); return; }
  if(!(dormantMonths>=1 && dormantMonths<=36)){ showToast("مدة الخمول بين 1 و36 شهر"); return; }
  if(!(attributionDays>=1 && attributionDays<=180)){ showToast("مدة الاحتساب بين 1 و180 يوم"); return; }
  const phoneNumberId = $("botPhoneNumberId").value.trim(), templateCustomer = $("botTemplateCustomer").value.trim(), templateLead = $("botTemplateLead").value.trim();
  const templateLang = $("botTemplateLang").value.trim() || "ar";
  const rawTest = $("botTestNumbers").value.split(/[,،\n]/).map(x=>x.trim()).filter(Boolean);
  const testNumbers = rawTest.map(normalizeSaudiMobile);
  if(testNumbers.some(x=>!x)){ showToast("في رقم تجربة غير صحيح — اكتبها بصيغة 05XXXXXXXX"); return; }
  const testMode = $("botTestMode").checked, campaignsEnabled = $("botCampaignsEnabled").checked, aiRepliesEnabled = $("botAiReplies").checked;
  const aiDailyPerNumber = parseInt($("botAiDailyPerNumber").value);
  if(!(aiDailyPerNumber>=1 && aiDailyPerNumber<=50)){ showToast("حد الردود الآلية بين 1 و50"); return; }
  if(campaignsEnabled && (!phoneNumberId || !templateCustomer)){ showToast("لتشغيل الإرسال لازم معرّف الرقم واسم القالب"); return; }
  if(testMode && campaignsEnabled && !testNumbers.length){ showToast("وضع التجربة شغال — أضف رقم تجربة واحد على الأقل"); return; }
  const old = {...botData.settings};
  // switching real sending on is the one change that reaches customers — ask once, clearly
  if(campaignsEnabled && !testMode && !(old.campaignsEnabled && !old.testMode)){
    if(!await showConfirm(`تأكيد: البوت بيبدأ يرسل للعملاء فعلياً كل يوم الساعة 10 الصبح — حتى ${dailyCap} رسالة يومياً. متأكد؟`)) return;
  }
  const next = {dailyCap, dormantMonths, attributionDays, phoneNumberId, templateCustomer, templateLead, templateLang, testNumbers, testMode, campaignsEnabled, aiRepliesEnabled, aiDailyPerNumber};
  try{ await BOT_SETTINGS_DOC.set({...next, updatedAt:serverNowIso(), updatedBy:currentUser.username}, {merge:true}); }
  catch(e){ showToast("تعذّر الحفظ — تأكد من الاتصال وقواعد الحماية"); return; }
  const from = {}, to = {};
  Object.keys(next).forEach(k=>{ if(JSON.stringify(old[k])!==JSON.stringify(next[k])){ from[k]=old[k]; to[k]=next[k]; } });
  logAudit("bot_settings_changed", {from, to});
  showToast("تم حفظ إعدادات البوت");
  renderBotTab();
}

// ---- phase 2: send now, conversations that need a person, the send log ----
async function botRunNow(){
  if(!isBotAdmin()){ showToast("للمدير فقط"); return; }
  const s = botData.settings;
  if(!s.phoneNumberId || !s.templateCustomer){ showToast("احفظ معرّف الرقم واسم القالب أولاً"); return; }
  if(!s.testMode && !await showConfirm(`وضع التجربة موقف — هذا بيرسل للعملاء فعلياً الحين (حتى ${s.dailyCap} رسالة). متأكد؟`)) return;
  const out = $("botRunNowResult");
  out.innerHTML = `<p class="sub">جاري الإرسال…</p>`;
  try{
    if(!firebase.functions) throw new Error("مكتبة الاتصال بالسيرفر ما تحمّلت");
    const res = await firebase.app().functions(BOT_FUNCTIONS_REGION).httpsCallable("botRunNow")({});
    const r = res.data || {};
    logAudit("bot_run_now", {testMode:!!s.testMode, sent:r.sent||0, failed:r.failed||0});
    out.innerHTML = r.skipped ? `<p class="locked-note">${esc(r.skipped)}</p>`
      : `<p class="sub">انرسلت <b>${r.sent||0}</b> رسالة${r.failed?` — وفشلت <b style="color:var(--loss);">${r.failed}</b>: ${esc((r.errors||[]).slice(0,3).map(e=>e.mobile+": "+e.error).join(" | "))}`:""}${r.testMode?" (وضع التجربة)":""}.</p>`;
  }catch(e){
    out.innerHTML = `<p class="locked-note" style="color:var(--loss);">تعذّر التشغيل — ${esc(e.message||"")}. تأكد إن السيرفر (Cloud Functions) منشور.</p>`;
  }
}
function renderBotNeedsHumanHtml(){
  const list = Object.entries(botData.contacts).filter(([,c])=> c.needsHuman).sort((a,b)=> String(b[1].needsHumanAt||"").localeCompare(String(a[1].needsHumanAt||"")));
  if(!list.length) return `<p class="sub">ما فيه محادثات تنتظر موظف.</p>`;
  const nameOf = m=>{ const c = state.customers.find(x=>x.mobile===m); return (c && (c.individuals[0]||{}).name) || (botData.contacts[m]||{}).waName || ""; };
  return list.map(([m,c])=>`<div class="garment-card" style="margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
        <span><b>${esc(nameOf(m)||"—")}</b> — ${esc(m)} <span class="sub">(${esc(c.needsHumanReason||"")}${c.needsHumanAt?" — "+esc(new Date(c.needsHumanAt).toLocaleString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh",dateStyle:"short",timeStyle:"short"})):""})</span></span>
        <span>
          <a href="${waLink(m)}" target="_blank" class="btn btn-ghost btn-sm">فتح واتساب</a>
          <button class="btn btn-ghost btn-sm bot-conv-btn" data-mobile="${m}">المحادثة</button>
          <button class="btn btn-gold btn-sm bot-done-btn" data-mobile="${m}">تم الرد</button>
        </span>
      </div>
      <div id="botConv-${m}"></div>
    </div>`).join("");
}
async function showBotConversation(mobile){
  const el = $("botConv-"+mobile);
  if(!el) return;
  el.innerHTML = `<p class="sub">جاري التحميل…</p>`;
  try{
    const snap = await BOT_CONV_COL.doc(mobile).collection("messages").orderBy("at","desc").limit(10).get();
    const msgs = snap.docs.map(d=>d.data()).reverse();
    el.innerHTML = msgs.length ? msgs.map(m=>`<div style="margin:4px 0;padding:6px 8px;border-radius:8px;max-width:85%;${m.direction==="in"?"background:var(--card2,#f3f3f3);":"background:rgba(201,162,39,.15);margin-inline-start:auto;"}">
        <div style="font-size:12px;">${esc(m.text||"")}</div>
        <div class="sub" style="font-size:10px;">${m.direction==="in"?"العميل":(m.kind==="ai"?"البوت (ذكاء اصطناعي)":m.kind==="template"?"رسالة الحملة":"البوت")}${m.at&&m.at.toDate?" — "+m.at.toDate().toLocaleString("ar-SA-u-ca-gregory-nu-latn",{timeZone:"Asia/Riyadh",dateStyle:"short",timeStyle:"short"}):""}${m.status&&m.direction==="out"?" — "+esc(m.status):""}</div>
      </div>`).join("") : `<p class="sub">ما فيه رسائل.</p>`;
  }catch(e){ el.innerHTML = `<p class="sub">تعذّر تحميل المحادثة.</p>`; }
}
async function clearBotNeedsHuman(mobile){
  try{ await BOT_CONTACTS_COL.doc(mobile).update({needsHuman:false, needsHumanClearedAt:serverNowIso(), needsHumanClearedBy:currentUser.username}); }
  catch(e){ showToast("تعذّر الحفظ — تأكد إن قواعد الحماية الجديدة منشورة"); return; }
  logAudit("bot_conversation_handled", {mobile});
  if(botData.contacts[mobile]) botData.contacts[mobile].needsHuman = false;
  $("botNeedsHuman").innerHTML = renderBotNeedsHumanHtml();
  $("botNeedsHuman").querySelectorAll(".bot-conv-btn").forEach(b=> b.addEventListener("click", ()=> showBotConversation(b.dataset.mobile)));
  $("botNeedsHuman").querySelectorAll(".bot-done-btn").forEach(b=> b.addEventListener("click", ()=> clearBotNeedsHuman(b.dataset.mobile)));
}
function renderBotRunsHtml(){
  if(!botData.runs.length) return `<p class="sub">ما فيه عمليات إرسال بعد.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>اليوم</th><th>النوع</th><th>انرسل</th><th>فشل</th></tr></thead><tbody>${
    botData.runs.map(r=>`<tr><td>${esc(r.date||r.id)}</td><td>${r.id.includes("يدوي")?"يدوي":"تلقائي"}${r.testMode?" — تجربة":""}</td><td>${r.sent||0}</td><td style="${r.failed?"color:var(--loss);font-weight:700;":""}">${r.failed||0}</td></tr>`).join("")
  }</tbody></table></div>`;
}

// ---- who the bot would message today: dormant real customers first (oldest first), then fresh leads ----
function monthsSince(dateStr){
  const d = new Date(dateStr), now = serverDate();
  return (now.getFullYear()-d.getFullYear())*12 + (now.getMonth()-d.getMonth()) - (now.getDate()<d.getDate() ? 1 : 0);
}
function computeBotDailyList(){
  const s = botData.settings, cap = s.dailyCap;
  const lastInvoice = {};
  state.invoices.forEach(inv=>{ const m=inv.customerMobile; if(m && (!lastInvoice[m] || inv.date>lastInvoice[m])) lastInvoice[m]=inv.date; });
  const dormant = state.customers.filter(c=>{
    const last = lastInvoice[c.mobile];
    if(!last || monthsSince(last) < s.dormantMonths) return false;  // never ordered, or not dormant yet
    const ct = botData.contacts[c.mobile];
    if(ct && ct.optedOut) return false;                                // opt-out is permanent
    if(ct && ct.lastContactAt && ct.lastContactAt.slice(0,10) >= last) return false; // already contacted since the last order
    return true;
  }).sort((a,b)=> lastInvoice[a.mobile].localeCompare(lastInvoice[b.mobile]))
    .map(c=>({kind:"customer", mobile:c.mobile, name:(c.individuals[0]||{}).name||"", lastInvoice:lastInvoice[c.mobile]}));
  const customerMobiles = new Set(state.customers.map(c=>c.mobile));
  const leads = botData.leads.filter(l=>{
    if(l.status && l.status!=="new") return false;
    if(customerMobiles.has(l.mobile)) return false;
    const ct = botData.contacts[l.mobile];
    return !(ct && (ct.optedOut || ct.lastContactAt));
  }).sort((a,b)=>(a.importedAt||"").localeCompare(b.importedAt||""))
    .map(l=>({kind:"lead", mobile:l.mobile, name:l.name||"", lastInvoice:null}));
  const list = dormant.slice(0, cap);
  if(list.length < cap) list.push(...leads.slice(0, cap - list.length));
  return {list, dormantTotal:dormant.length, leadsTotal:leads.length};
}
function renderBotDryRunHtml(){
  const {list, dormantTotal, leadsTotal} = computeBotDailyList();
  const cap = botData.settings.dailyCap;
  const daysLeft = Math.ceil((dormantTotal+leadsTotal)/cap);
  let html = `<p class="sub" style="margin-bottom:8px;">مؤهلون الآن: <b>${dormantTotal}</b> عميل خامل + <b>${leadsTotal}</b> عميل محتمل — بالسقف الحالي (${cap} يومياً) تخلص القائمة خلال <b>${daysLeft||0}</b> يوم تقريباً.</p>`;
  if(!list.length) return html + `<p class="sub">ما فيه أحد مؤهل اليوم.</p>`;
  html += `<div style="max-height:360px;overflow:auto;"><table><thead><tr><th>#</th><th>النوع</th><th>الاسم</th><th>الجوال</th><th>التحية</th><th>آخر فاتورة</th></tr></thead><tbody>` +
    list.map((r,i)=>`<tr><td>${i+1}</td><td>${r.kind==="customer"?"عميل خامل":"عميل محتمل"}</td><td>${esc(r.name||"—")}</td><td>${esc(r.mobile)}</td><td>${esc(botGreeting(r.name))}</td><td>${r.lastInvoice||"—"}</td></tr>`).join("") +
    `</tbody></table></div>`;
  return html;
}

// ---- leads import from Excel/CSV: tolerant of the owner's own files (header or not, name optional) ----
async function downloadLeadsTemplate(){
  try{ await loadXlsxLib(); } catch(e){ showToast("تعذّر تحميل مكتبة الإكسل — تأكد من الاتصال"); return; }
  const ws = XLSX.utils.aoa_to_sheet([["الجوال","الاسم","ملاحظة"],["0551234567","محمد العتيبي","قائمة 2024"],["0569876543","",""]]);
  ws["!cols"] = [{wch:16},{wch:22},{wch:18}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "العملاء المحتملين");
  const blob = new Blob([XLSX.write(wb, {type:"array", bookType:"xlsx"})], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "leads-import-template.xlsx";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
}
// finds the phone / name / note columns by header words, or — with no header row — by content
function detectLeadColumns(aoa){
  const first = (aoa[0]||[]).map(v=>String(v??"").trim());
  const find = re => first.findIndex(h=>re.test(h));
  let phone = find(/جوال|رقم|هاتف|موبايل|mobile|phone/i);
  if(phone>=0) return {phone, name:find(/اسم|name/i), note:find(/ملاحظ|مصدر|note|source/i), headerRow:true};
  // no header: the phone column is the one where most of the first rows are valid mobiles
  const sample = aoa.slice(0, 20), width = Math.max(0, ...sample.map(r=>r.length));
  let best = -1, bestHits = 0;
  for(let c=0;c<width;c++){ const hits = sample.filter(r=>normalizeSaudiMobile(r[c])).length; if(hits>bestHits){ bestHits=hits; best=c; } }
  if(best<0) return null;
  let name = -1;
  for(let c=0;c<width && name<0;c++){ if(c!==best && sample.some(r=>/[؀-ۿA-Za-z]/.test(String(r[c]??"")) && !normalizeSaudiMobile(r[c]))) name = c; }
  return {phone:best, name, note:-1, headerRow:false};
}
function buildLeadsImportRows(aoa){
  const cols = detectLeadColumns(aoa);
  if(!cols) return {error:"ما لقيت عمود فيه أرقام جوالات سعودية في الملف"};
  const body = (cols.headerRow ? aoa.slice(1) : aoa).map((r,i)=>({r, line:i+(cols.headerRow?2:1)})).filter(({r})=>r.some(v=>String(v??"").trim()!==""));
  if(body.length > LEADS_IMPORT_MAX_ROWS) return {error:`الملف فيه ${body.length} سطر — الحد ${LEADS_IMPORT_MAX_ROWS} في المرة الواحدة`};
  const customerMobiles = new Set(state.customers.map(c=>c.mobile));
  const existing = new Set(botData.leads.map(l=>l.mobile));
  const seen = new Set();
  const rows = body.map(({r,line})=>{
    const raw = String(r[cols.phone]??"").trim();
    const mobile = normalizeSaudiMobile(r[cols.phone]);
    const name = cols.name>=0 ? String(r[cols.name]??"").trim().slice(0,80) : "";
    const note = cols.note>=0 ? String(r[cols.note]??"").trim().slice(0,120) : "";
    let error = null;
    if(!mobile) error = raw ? "رقم غير صحيح أو غير سعودي" : "بدون رقم";
    else if(customerMobiles.has(mobile)) error = "عميل فعلي عندك — يدخل من مسار العملاء الخاملين";
    else if(existing.has(mobile)) error = "موجود في القائمة من قبل";
    else if(seen.has(mobile)) error = "مكرر داخل الملف";
    if(!error) seen.add(mobile);
    return {line, raw, mobile, name, note, error};
  });
  return {rows, headerRow:cols.headerRow};
}
async function previewLeadsImport(file){
  const wrap = $("leadsImportPreview");
  if(!isBotAdmin()){ showToast("الاستيراد للمدير فقط"); return; }
  if(file.size > 5*1024*1024){ showToast("حجم الملف أكبر من 5 ميجا"); return; }
  try{ await loadXlsxLib(); } catch(e){ showToast("تعذّر تحميل مكتبة الإكسل — تأكد من الاتصال"); return; }
  let aoa;
  try{
    const wb = XLSX.read(await file.arrayBuffer(), {type:"array"});
    aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:"", raw:true});
  } catch(e){ showToast("تعذّرت قراءة الملف — تأكد إنه ملف إكسل أو CSV"); return; }
  const res = buildLeadsImportRows(aoa);
  if(res.error){ leadsImportPending = null; wrap.innerHTML = `<p class="locked-note" style="color:var(--loss);">${esc(res.error)}</p>`; return; }
  const ok = res.rows.filter(r=>!r.error), bad = res.rows.filter(r=>r.error);
  leadsImportPending = {fileName:file.name, rows:res.rows};
  const shown = res.rows.slice(0, 500);
  wrap.innerHTML = `<p class="sub" style="margin:8px 0;">الملف: <b>${esc(file.name)}</b> — سليم: <b style="color:var(--profit);">${ok.length}</b> — مرفوض: <b style="color:var(--loss);">${bad.length}</b>${res.rows.length>shown.length?` — المعروض أول ${shown.length} سطر`:""}</p>
    <div style="max-height:320px;overflow:auto;"><table><thead><tr><th>سطر</th><th>الرقم في الملف</th><th>الجوال</th><th>الاسم</th><th>التحية</th><th>الحالة</th></tr></thead><tbody>` +
    shown.map(r=>`<tr><td>${r.line}</td><td>${esc(r.raw)}</td><td>${r.mobile||"—"}</td><td>${esc(r.name||"—")}</td><td>${r.error?"—":esc(botGreeting(r.name))}</td><td style="color:${r.error?"var(--loss)":"var(--profit)"};">${r.error?esc(r.error):"✓ جاهز"}</td></tr>`).join("") +
    `</tbody></table></div>
    <div class="field" style="margin-top:8px;"><label>مصدر القائمة (اختياري)</label><input type="text" id="leadsImportSource" placeholder="مثلاً: البرنامج القديم / ملف الأرقام 2024" maxlength="120"></div>
    <div class="actions-row">
      <button class="btn btn-gold btn-sm" id="leadsImportConfirmBtn" ${ok.length?"":"disabled"}>إضافة ${ok.length} رقم للقائمة</button>
      <button class="btn btn-ghost btn-sm" id="leadsImportCancelBtn">إلغاء</button>
    </div>`;
  $("leadsImportConfirmBtn").addEventListener("click", confirmLeadsImport);
  $("leadsImportCancelBtn").addEventListener("click", cancelLeadsImport);
}
function cancelLeadsImport(){ leadsImportPending = null; $("leadsImportPreview").innerHTML = ""; $("leadsImportFile").value = ""; }
async function confirmLeadsImport(){
  if(!isBotAdmin()){ showToast("الاستيراد للمدير فقط"); return; }
  if(!leadsImportPending) return;
  const source = ($("leadsImportSource")?.value||"").trim().slice(0,120);
  // re-checked against what is there now — a number may have ordered or been imported since the preview
  const customerMobiles = new Set(state.customers.map(c=>c.mobile));
  const existing = new Set(botData.leads.map(l=>l.mobile));
  const rows = leadsImportPending.rows.filter(r=>!r.error && !customerMobiles.has(r.mobile) && !existing.has(r.mobile));
  if(!rows.length){ showToast("ما فيه أرقام جديدة للإضافة"); return; }
  if(!await showConfirm(`إضافة ${rows.length} رقم لقائمة العملاء المحتملين؟`)) return;
  const batchId = newId(), importedAt = serverNowIso();
  try{
    for(let i=0;i<rows.length;i+=400){
      const batch = db.batch();
      rows.slice(i,i+400).forEach(r=> batch.set(LEADS_COL.doc(r.mobile), {mobile:r.mobile, name:r.name, note:r.note, source, status:"new", importedAt, importedBy:currentUser.username, batchId}));
      await batch.commit();
    }
  } catch(e){ showToast("تعذّر الحفظ — تأكد من الاتصال وقواعد الحماية"); return; }
  logAudit("leads_imported", {batchId, fileName:leadsImportPending.fileName, source, count:rows.length});
  showToast(`تمت إضافة ${rows.length} رقم لقائمة العملاء المحتملين`);
  leadsImportPending = null;
  renderBotTab();
}
