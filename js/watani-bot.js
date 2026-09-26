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
const BOT_DEFAULTS = {dailyCap:20, dormantMonths:6, attributionDays:30, campaignsEnabled:false};
const LEADS_IMPORT_MAX_ROWS = 5000;
let botData = {loaded:false, settings:{...BOT_DEFAULTS}, leads:[], contacts:{}};
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
  botData.loaded = true;
  await markConvertedLeads();
}
// a lead whose number now has an invoice became a real customer — mark it once so it leaves the lead campaigns
async function markConvertedLeads(){
  const customerMobiles = new Set(state.customers.map(c=>c.mobile));
  const newlyConverted = botData.leads.filter(l=>l.status!=="converted" && customerMobiles.has(l.mobile));
  if(!newlyConverted.length) return;
  const at = new Date().toISOString();
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
    <div class="embro-toggle" style="margin:4px 0 10px;"><input type="checkbox" id="botCampaignsEnabled" disabled ${s.campaignsEnabled?"checked":""}><label style="margin:0;color:var(--muted);">تشغيل الحملات — يتفعّل بعد ربط واتساب (المرحلة 2)</label></div>
    <button class="btn btn-gold btn-sm" id="botSaveSettingsBtn">حفظ الإعدادات</button>
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
  $("leadsTemplateBtn").addEventListener("click", downloadLeadsTemplate);
  $("leadsImportFile").addEventListener("change", ()=>{ const f=$("leadsImportFile").files[0]; if(f) previewLeadsImport(f); });
}
async function saveBotSettings(){
  if(!isBotAdmin()){ showToast("للمدير فقط"); return; }
  const dailyCap = parseInt($("botDailyCap").value), dormantMonths = parseInt($("botDormantMonths").value), attributionDays = parseInt($("botAttributionDays").value);
  if(!(dailyCap>=1 && dailyCap<=1000)){ showToast("السقف اليومي بين 1 و1000"); return; }
  if(!(dormantMonths>=1 && dormantMonths<=36)){ showToast("مدة الخمول بين 1 و36 شهر"); return; }
  if(!(attributionDays>=1 && attributionDays<=180)){ showToast("مدة الاحتساب بين 1 و180 يوم"); return; }
  const old = {...botData.settings};
  try{ await BOT_SETTINGS_DOC.set({dailyCap, dormantMonths, attributionDays, updatedAt:new Date().toISOString(), updatedBy:currentUser.username}, {merge:true}); }
  catch(e){ showToast("تعذّر الحفظ — تأكد من الاتصال وقواعد الحماية"); return; }
  logAudit("bot_settings_changed", {from:{dailyCap:old.dailyCap, dormantMonths:old.dormantMonths, attributionDays:old.attributionDays}, to:{dailyCap, dormantMonths, attributionDays}});
  showToast("تم حفظ إعدادات البوت");
  renderBotTab();
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
  const batchId = newId(), importedAt = new Date().toISOString();
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
