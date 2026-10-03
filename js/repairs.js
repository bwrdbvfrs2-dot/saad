// ---------------- صيانة خارجية: ثياب من برا المحل تدخل تعديل أو صيانة ----------------
// A repair has its own numbering (ص-1, ص-2… — barcode "R1"), a price the employee types each time, and
// payments that land in the recorder's boxes exactly like invoice payments (paid at receipt, at delivery,
// or both). Stages: استلام → جاهز → تسليم. The tailor's wage is the price × the percentage in the settings,
// earned the day the repair is marked جاهز (like "تم التفصيل" for a thobe) and paid through payroll.
// Revenue is recognised on delivery. No staff commission. Cancelling hands back what was paid, from the
// boxes that took it.
const REPAIR_STATUS_LABELS = {"استلام":"تم الاستلام", "جاهز":"جاهز للتسليم", "تسليم":"تم التسليم", "ملغي":"ملغي"};
let repairsFilter = "open";

function repairLabel(r){ return "ص-" + r.number; }
function repairBarcodeText(r){ return "R" + r.number; }
function repairPaid(r){ return (r.payments||[]).reduce((a,p)=> a + (p.cash||0) + (p.network||0), 0); }
function repairRemaining(r){ return r.status==="ملغي" ? 0 : Math.max(0, (r.price||0) - repairPaid(r)); }
function repairWagePercent(){ return parseFloat(state.settings.repairWagePercent)||0; }
function repairWage(r){ return r.tailorWage!==undefined ? r.tailorWage : Math.round((r.price||0) * repairWagePercent()) / 100; }
function nextRepairNumber(){ const n = state.settings.nextRepairNumber||1; state.settings.nextRepairNumber = n+1; return n; }
function findRepairByAny(q){
  const s = String(q||"").trim().replace(/^ص\s*-?\s*/,"").replace(/^R/i,"");
  return (state.repairs||[]).find(r=> String(r.number)===s);
}

// a payment typed into one of the repair forms — validated against what's still owed
function readRepairPayment(prefix, maxAmount){
  const cash = parseFloat(($(prefix+"Cash")||{}).value)||0, network = parseFloat(($(prefix+"Net")||{}).value)||0;
  const networkReceiptNo = (($(prefix+"Rec")||{}).value||"").trim();
  if(cash<0 || network<0) return {error:"المبالغ لازم تكون موجبة"};
  if(cash+network > maxAmount + 0.001) return {error:`المبلغ أكبر من المتبقي (${maxAmount.toFixed(0)} ريال)`};
  if(network>0 && !networkReceiptNo) return {error:"أدخل رقم إيصال الشبكة"};
  if(cash+network<=0) return {payment:null};
  return {payment:{id:newId(), date:todayStr(), cash, network, networkReceiptNo:network>0?networkReceiptNo:"", cashReceiptNo: cash>0 ? nextVoucherNo() : null, cardType: network>0 ? readCardType(prefix+"Card") : undefined}};
}

async function saveNewRepair(){
  const name = $("rpName").value.trim(), mobile = $("rpMobile").value.trim(), description = $("rpDesc").value.trim();
  const price = parseFloat($("rpPrice").value)||0;
  if(!name){ showToast("اكتب اسم العميل"); return; }
  if(!/^05\d{8}$/.test(mobile)){ showToast("اكتب جوال العميل بصيغة 05XXXXXXXX"); return; }
  if(!description){ showToast("اكتب وش المطلوب بالصيانة"); return; }
  if(!(price>0)){ showToast("اكتب سعر الصيانة"); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  const {payment, error} = readRepairPayment("rpPay", price);
  if(error){ state = snapshot; showToast(error); return; }
  const r = {
    id:newId(), number:nextRepairNumber(), date:todayStr(), createdAt:serverNowIso(), createdBy:currentUser.username,
    customerName:name, customerMobile:mobile, description, price,
    expectedDate:$("rpExpected").value||"", tailor:$("rpTailor").value||"", notes:$("rpNotes").value.trim(),
    status:"استلام", payments:[],
  };
  if(payment){ r.payments.push(payment); applyPaymentToBalances(payment); }
  if(!state.repairs) state.repairs = [];
  state.repairs.push(r);
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("repair_received", {number:r.number, price, paid:repairPaid(r)});
  showToast(`تم تسجيل الصيانة ${repairLabel(r)}`);
  ["rpName","rpMobile","rpDesc","rpPrice","rpNotes","rpPayCash","rpPayNet","rpPayRec"].forEach(id=>{ if($(id)) $(id).value=""; });
  renderRepairsList();
  printRepairReceipt(r.id);
}

async function addRepairPayment(id){
  const r = (state.repairs||[]).find(x=>x.id===id);
  if(!r || r.status==="ملغي") return;
  const snapshot = JSON.parse(JSON.stringify(state));
  const {payment, error} = readRepairPayment("rpp-"+id+"-", repairRemaining(r));
  if(error){ state = snapshot; showToast(error); return; }
  if(!payment){ state = snapshot; showToast("اكتب مبلغ الدفعة"); return; }
  r.payments.push(payment); applyPaymentToBalances(payment);
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("repair_payment", {number:r.number, cash:payment.cash, network:payment.network});
  showToast(`تم تسجيل دفعة ${(payment.cash+payment.network).toFixed(0)} ريال — المتبقي ${repairRemaining(r).toFixed(0)}`);
  renderRepairsList();
}

// جاهز: the work is done — the tailor's wage is fixed now (price × the current percentage)
async function markRepairReady(id){
  const r = (state.repairs||[]).find(x=>x.id===id);
  if(!r || r.status!=="استلام") return;
  const tailor = ($("rpt-"+id)||{}).value || r.tailor;
  if(!tailor){ showToast("اختر الخياط اللي سوّى الصيانة"); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  r.tailor = tailor; r.status = "جاهز"; r.readyDate = todayStr();
  r.tailorWage = Math.round((r.price||0) * repairWagePercent()) / 100;
  // the wages guideline balance grows by what payroll will pay for it (see applyGarmentAdvisory)
  if(r.tailorWage>0){ state.advisory.wages += r.tailorWage; r.advisoryWage = r.tailorWage; }
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("repair_ready", {number:r.number, tailor, wage:r.tailorWage});
  showToast(`${repairLabel(r)} جاهز للتسليم${r.tailorWage?` — أجر ${tailor}: ${r.tailorWage.toFixed(0)} ريال`:""}`);
  renderRepairsList();
}

// تسليم: whatever is still owed is collected now — a repair doesn't leave the shop on credit
async function deliverRepair(id){
  const r = (state.repairs||[]).find(x=>x.id===id);
  if(!r || r.status!=="جاهز") return;
  const snapshot = JSON.parse(JSON.stringify(state));
  const owed = repairRemaining(r);
  if(owed>0.001){
    const {payment, error} = readRepairPayment("rpp-"+id+"-", owed);
    if(error){ state = snapshot; showToast(error); return; }
    const got = payment ? payment.cash + payment.network : 0;
    if(got < owed - 0.001){ state = snapshot; showToast(`باقي على العميل ${owed.toFixed(0)} ريال — اكتبه بخانات الدفع قبل التسليم`); return; }
    r.payments.push(payment); applyPaymentToBalances(payment);
  }
  r.status = "تسليم"; r.deliveredDate = todayStr(); r.deliveredBy = currentUser.username;
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("repair_delivered", {number:r.number, price:r.price});
  showToast(`تم تسليم ${repairLabel(r)}`);
  renderRepairsList();
}

async function cancelRepair(id){
  const r = (state.repairs||[]).find(x=>x.id===id);
  if(!r || r.status==="تسليم" || r.status==="ملغي") return;
  const paid = repairPaid(r);
  if(paid>0 && currentUser.role!=="مدير"){ showToast("الصيانة عليها مدفوعات — إلغاؤها واسترداد المبلغ للمدير بس"); return; }
  if(!await showConfirm(`إلغاء ${repairLabel(r)}؟${paid>0?` بيرجع للعميل ${paid.toFixed(0)} ريال من نفس الصناديق اللي استلمته.`:""}`)) return;
  const snapshot = JSON.parse(JSON.stringify(state));
  r.refunds = [];
  (r.payments||[]).forEach(p=>{
    if(!p.appliedToBalances) return;
    r.refunds.push({date:todayStr(), cash:p.cash||0, network:p.network||0, bankFee: networkFeeOf(p), owner:p.recordedBy});
    reversePaymentFromBalances(p);
  });
  if(r.advisoryWage){ state.advisory.wages -= r.advisoryWage; r.advisoryWage = 0; }
  // a wage already paid out for this repair is taken back, the same way a returned thobe's is
  if(r.wagePaidOut && r.tailor && (r.tailorWage||0)>0){
    const res = addPayrollEntry(r.tailor, "deduction", r.tailorWage, null, `استرداد أجر صيانة ${repairLabel(r)} — انلغت بعد صرف الأجر`);
    if(res && !res.ok){ state = snapshot; showToast(res.msg); return; }
  }
  r.status = "ملغي"; r.cancelledDate = todayStr(); r.cancelledBy = currentUser.username;
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("repair_cancelled", {number:r.number, refunded:paid});
  showToast(`تم إلغاء ${repairLabel(r)}${paid>0?` واسترداد ${paid.toFixed(0)} ريال`:""}`);
  renderRepairsList();
}

// ---- screen ----
function renderRepairsTab(){
  const tailors = state.users.filter(u=>u.role==="خياط");
  const sel = $("rpTailor");
  if(sel){ const cur = sel.value; sel.innerHTML = `<option value="">-- يتحدد لاحقاً --</option>` + tailors.map(u=>`<option value="${esc(u.username)}" ${u.username===cur?"selected":""}>${esc(u.username)}</option>`).join(""); }
  if($("rpExpected") && !$("rpExpected").value){ const d = serverDate(); d.setDate(d.getDate()+2); $("rpExpected").value = formatDateInput(d); }
  if($("rpWageNote")) $("rpWageNote").textContent = repairWagePercent() ? `أجر الخياط ${repairWagePercent()}% من سعر الصيانة (من الإعدادات المالية).` : "ما تحددت نسبة أجر الخياط للصيانة بعد — حددها من الإعدادات المالية.";
  renderRepairsList();
}
function renderRepairsList(){
  const el = $("repairsList");
  if(!el) return;
  const q = (($("repairsSearch")||{}).value||"").trim();
  let list = (state.repairs||[]).slice().reverse();
  if(repairsFilter==="open") list = list.filter(r=> r.status==="استلام" || r.status==="جاهز");
  else if(repairsFilter==="done") list = list.filter(r=> r.status==="تسليم" || r.status==="ملغي");
  if(q){
    const byNum = findRepairByAny(q);
    list = byNum ? [byNum] : list.filter(r=> (r.customerName||"").includes(q) || (r.customerMobile||"").includes(q) || (r.description||"").includes(q));
  }
  document.querySelectorAll(".repairs-filter-btn").forEach(b=> b.classList.toggle("btn-gold", b.dataset.f===repairsFilter));
  if(!list.length){ el.innerHTML = `<p class="sub">ما فيه صيانات${repairsFilter==="open"?" مفتوحة":""}.</p>`; return; }
  const tailors = state.users.filter(u=>u.role==="خياط");
  el.innerHTML = list.slice(0,100).map(r=>{
    const owed = repairRemaining(r), open = r.status==="استلام" || r.status==="جاهز";
    const payFields = open && owed>0.001 ? `<div class="row-3" style="margin-top:6px;">
        <div class="field"><label>كاش</label><input type="number" min="0" id="rpp-${r.id}-Cash" placeholder="0"></div>
        <div class="field"><label>شبكة</label><input type="number" min="0" id="rpp-${r.id}-Net" placeholder="0"></div>
        <div class="field"><label>رقم إيصال الشبكة</label><input type="text" id="rpp-${r.id}-Rec"></div>
      </div><div class="row-3"><div class="field"><label>نوع البطاقة</label><select id="rpp-${r.id}-Card" class="card-type-select">${cardTypeOptionsHtml()}</select></div></div>` : "";
    return `<div class="garment-card" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
        <span class="tag">${repairLabel(r)} — ${esc(REPAIR_STATUS_LABELS[r.status]||r.status)}</span>
        <span class="sub">${r.date}${r.expectedDate?` — التسليم المتوقع ${r.expectedDate}`:""}</span>
      </div>
      <p style="margin:6px 0;"><b>${esc(r.customerName)}</b> — ${esc(r.customerMobile)} <a href="${waLink(r.customerMobile)}" target="_blank" class="icon-btn" title="واتساب"><i data-lucide="message-circle"></i></a></p>
      <p style="margin:4px 0;white-space:pre-line;">${esc(r.description)}</p>
      ${r.notes?`<p class="sub" style="margin:4px 0;">ملاحظات: ${esc(r.notes)}</p>`:""}
      <p style="margin:4px 0;">السعر: <b>${(r.price||0).toFixed(0)} ﷼</b> — المدفوع: ${repairPaid(r).toFixed(0)} ﷼ — <span style="color:${owed>0.001?"var(--loss)":"var(--profit)"};font-weight:700;">المتبقي: ${owed.toFixed(0)} ﷼</span></p>
      ${r.status==="استلام" ? `<div class="field" style="max-width:220px;"><label>الخياط</label><select id="rpt-${r.id}"><option value="">-- اختر --</option>${tailors.map(u=>`<option value="${esc(u.username)}" ${u.username===r.tailor?"selected":""}>${esc(u.username)}</option>`).join("")}</select></div>`
        : `<p class="sub" style="margin:4px 0;">الخياط: ${esc(r.tailor||"—")}${r.readyDate?` — جاهز ${r.readyDate}`:""}${r.deliveredDate?` — تسلّم ${r.deliveredDate}`:""}${r.cancelledDate?` — انلغى ${r.cancelledDate}`:""}</p>`}
      ${payFields}
      <div class="actions-row" style="margin-top:6px;flex-wrap:wrap;gap:6px;">
        ${open && owed>0.001 ? `<button class="btn btn-ghost btn-sm" onclick="addRepairPayment('${r.id}')">تسجيل دفعة</button>` : ""}
        ${r.status==="استلام" ? `<button class="btn btn-gold btn-sm" onclick="markRepairReady('${r.id}')">جاهز</button>` : ""}
        ${r.status==="جاهز" ? `<button class="btn btn-gold btn-sm" onclick="deliverRepair('${r.id}')">تسليم${owed>0.001?` وتحصيل ${owed.toFixed(0)} ﷼`:""}</button>` : ""}
        <button class="btn btn-ghost btn-sm" onclick="printRepairReceipt('${r.id}')">إيصال العميل</button>
        <button class="btn btn-ghost btn-sm" onclick="printRepairTag('${r.id}')">بطاقة الثوب</button>
        ${open ? `<button class="btn btn-ghost btn-sm" style="color:var(--loss);" onclick="cancelRepair('${r.id}')">إلغاء</button>` : ""}
      </div>
    </div>`;
  }).join("");
  refreshLucideIcons();
}

// ---- printing: the customer's receipt, and a small tag that stays on the thobe ----
async function drawRepairBarcode(sel, r, opts){
  try{ await loadBarcodeLib(); window.JsBarcode(sel, repairBarcodeText(r), {format:"CODE128", margin:2, ...opts}); }
  catch(e){ /* barcode lib needs internet on first use — the printout still shows the number */ }
}
async function printRepairReceipt(id){
  const r = (state.repairs||[]).find(x=>x.id===id);
  if(!r) return;
  const s = state.settings, w = (s.thermalPaperWidth||58)===80 ? 300 : 220;
  $("printArea").innerHTML = `
  <div style="width:100%;max-width:${w}px;font-family:var(--font-main);direction:rtl;text-align:right;font-size:15px;line-height:1.5;margin:0 auto;background:#fff;color:#000;padding:2px 8px 8px;">
    <div style="text-align:center;">
      ${s.shopLogo?`<img src="${s.shopLogo}" style="max-width:70px;max-height:70px;">`:""}
      <h3 style="margin:6px 0;">${esc(s.shopName||"—")}</h3>
      <p style="margin:2px 0;">${esc(s.shopPhone||"")}</p>
    </div>
    <hr>
    <p style="text-align:center;font-weight:700;margin:2px 0;">إيصال صيانة</p>
    <div style="text-align:center;"><svg id="repairReceiptBarcode" style="max-width:90%;height:auto;"></svg></div>
    <p style="margin:2px 0;">رقم الصيانة: <b>${repairLabel(r)}</b></p>
    <p style="margin:2px 0;">التاريخ: ${r.date}</p>
    ${r.expectedDate?`<p style="margin:2px 0;">التسليم المتوقع: ${r.expectedDate}</p>`:""}
    <p style="margin:2px 0;">العميل: ${esc(r.customerName)}</p>
    <p style="margin:2px 0;">الجوال: ${esc(r.customerMobile)}</p>
    <hr>
    <p style="margin:2px 0;white-space:pre-line;">${esc(r.description)}</p>
    <hr>
    <p style="margin:2px 0;font-weight:700;">السعر: ${(r.price||0).toFixed(2)}</p>
    <p style="margin:2px 0;">المدفوع: ${repairPaid(r).toFixed(2)}</p>
    <p style="margin:2px 0;font-weight:700;">المتبقي: ${repairRemaining(r).toFixed(2)}</p>
    <hr>
    <p style="font-size:13px;white-space:pre-line;">${esc(s.receiptTerms||"")}</p>
  </div>`;
  await drawRepairBarcode("#repairReceiptBarcode", r, {width:1.3, height:36, fontSize:11});
  $("dynamicPageSize").textContent = `@media print{ @page{ size:${s.thermalPaperWidth||58}mm 2000mm; margin:0; } }`;
  setTimeout(()=> safePrint(), 300);
}
async function printRepairTag(id){
  const r = (state.repairs||[]).find(x=>x.id===id);
  if(!r) return;
  const s = state.settings, w = (s.thermalPaperWidth||58)===80 ? 300 : 220;
  $("printArea").innerHTML = `
  <div style="width:100%;max-width:${w}px;font-family:var(--font-main);direction:rtl;text-align:center;font-size:15px;line-height:1.4;margin:0 auto;background:#fff;color:#000;padding:4px;">
    <div style="font-weight:700;font-size:18px;">${repairLabel(r)}</div>
    <svg id="repairTagBarcode" style="max-width:95%;height:auto;"></svg>
    <div>${esc(r.customerName)} — ${esc(r.customerMobile)}</div>
    <div style="font-size:13px;white-space:pre-line;text-align:right;margin-top:4px;">${esc(r.description)}</div>
    ${r.expectedDate?`<div style="font-size:13px;margin-top:4px;">التسليم: ${r.expectedDate}</div>`:""}
    <div style="font-size:13px;font-weight:700;margin-top:4px;">المتبقي: ${repairRemaining(r).toFixed(0)} ﷼</div>
  </div>`;
  await drawRepairBarcode("#repairTagBarcode", r, {width:1.4, height:40, fontSize:12});
  $("dynamicPageSize").textContent = `@media print{ @page{ size:${s.thermalPaperWidth||58}mm 2000mm; margin:0; } }`;
  setTimeout(()=> safePrint(), 300);
}

// ---- what repairs add to the accounts ----
// revenue and the tailor's wage both land in the month the repair is delivered
function repairsFinancialsForMonth(monthLabel){
  let revenue = 0, cost = 0, count = 0;
  (state.repairs||[]).forEach(r=>{
    if(r.status!=="تسليم" || (r.deliveredDate||"").slice(0,7)!==monthLabel) return;
    revenue += r.price||0; cost += repairWage(r); count++;
  });
  return {revenue, cost, count};
}
// the tailor's repair wages for a payroll month: repairs marked جاهز that month, plus any from an
// already-closed month that were never paid (same carry-over rule as thobes)
function tailorRepairsForMonth(username, monthLabel){
  return (state.repairs||[]).filter(r=>{
    if(r.tailor!==username || r.status==="ملغي" || !r.readyDate) return false;
    if(r.wagePaidOut) return r.wagePaidMonth===monthLabel;
    const m = r.readyDate.slice(0,7);
    return m===monthLabel || (m < monthLabel && isMonthClosed(m));
  });
}
