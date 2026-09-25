// ---------------- balances ledger (per-user cash boxes, advisory, transfers, expenses) ----------------
function findCashBox(id){ return state.cashBoxes.find(b=>b.id===id); }
function mainBoxOf(username, type){ return state.cashBoxes.find(b=>b.owner===username && b.type===type && b.isMain); }
function userBoxes(username){ return state.cashBoxes.filter(b=>b.owner===username); }
function boxTotal(box){ return (box.openingBalance||0) + (box.balance||0); }
function applyGarmentAdvisory(g){
  if(g.advisoryApplied) return;
  const s=state.settings;
  const credit = {
    fabric: garmentFabricCost(g),
    padding: s.padding,
    wages: s.wage,
    embroidery: g.hasEmbroidery ? s.embroideryWage : 0,
  };
  state.advisory.fabric += credit.fabric;
  state.advisory.padding += credit.padding;
  state.advisory.wages += credit.wages;
  state.advisory.embroidery += credit.embroidery;
  g.advisoryCredit = credit;
  g.advisoryApplied = true;
}
function reverseGarmentAdvisory(g){
  if(!g.advisoryApplied || !g.advisoryCredit) return;
  state.advisory.fabric -= g.advisoryCredit.fabric;
  state.advisory.padding -= g.advisoryCredit.padding;
  state.advisory.wages -= g.advisoryCredit.wages;
  state.advisory.embroidery -= g.advisoryCredit.embroidery;
  g.advisoryApplied = false;
}
function applyPaymentToBalances(p, ownerUsername){
  if(p.appliedToBalances) return;
  const owner = ownerUsername || p.recordedBy || (currentUser&&currentUser.username);
  if(!owner) return;
  p.recordedBy = owner;
  if(p.cash){ const box=mainBoxOf(owner,"cash"); if(box) box.balance += p.cash; }
  if(p.network){ const fee = state.settings.bankFeePercent||0; const box=mainBoxOf(owner,"network"); if(box) box.balance += p.network*(1-fee/100); }
  p.appliedToBalances = true;
}
function reversePaymentFromBalances(p){
  if(!p.appliedToBalances) return;
  const owner = p.recordedBy;
  if(p.cash && owner){ const box=mainBoxOf(owner,"cash"); if(box) box.balance -= p.cash; }
  if(p.network && owner){ const fee = state.settings.bankFeePercent||0; const box=mainBoxOf(owner,"network"); if(box) box.balance -= p.network*(1-fee/100); }
  p.appliedToBalances = false;
}
function nextVoucherNo(){ const n=state.settings.nextVoucherNumber||1; state.settings.nextVoucherNumber=n+1; return n; }
function nextCustomerCode(){ const n=state.settings.nextCustomerCode||1; state.settings.nextCustomerCode=n+1; return n; }
function nextItemCode(){ const n=state.settings.nextItemCode||1; state.settings.nextItemCode=n+1; return n; }

// ---------------- shift closing: cash audit & smart assistant ----------------
function seasonGarmentCount(season){
  let count = 0;
  state.invoices.forEach(inv=>{
    if(inv.date < season.startDate || inv.date > season.endDate) return;
    count += inv.garments.filter(g=>g.status!=="ملغي").length;
  });
  return count;
}
function seasonEffectiveCapacity(season){
  const tailorTotal = state.users.filter(u=>u.role==="خياط").reduce((a,u)=>a+(u.productionCapacity||0),0);
  return (season.capacity||0) + tailorTotal;
}
function renderSeasonsList(){
  const el = $("seasonsListView");
  if(!el) return;
  if(!state.seasons.length){ el.innerHTML = `<p class="sub">ما فيه مواسم معرّفة بعد.</p>`; return; }
  el.innerHTML = state.seasons.slice().reverse().map(season=>{
    const idx = state.seasons.indexOf(season);
    const used = seasonGarmentCount(season);
    const effCapacity = seasonEffectiveCapacity(season);
    const remaining = effCapacity - used;
    const pct = Math.min(100, (used/effCapacity)*100);
    const overCapacity = remaining < 0;
    const tailorTotal = effCapacity - season.capacity;
    return `<div class="garment-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <b>${esc(season.name||"موسم بدون اسم")}</b>
        <button class="icon-btn" onclick="removeSeason(${idx})" title="حذف الموسم">حذف</button>
      </div>
      <p class="sub" style="margin:4px 0;">من ${season.startDate} إلى ${season.endDate}</p>
      <div style="background:var(--surface2);border-radius:8px;height:10px;overflow:hidden;margin:8px 0;">
        <div style="background:${overCapacity?'var(--loss)':'var(--gold)'};height:100%;width:${pct}%;"></div>
      </div>
      <p style="margin:0;font-size:13px;${overCapacity?'color:var(--loss);font-weight:700;':''}">
        ${used} / ${effCapacity} قطعة مستقبَلة ${overCapacity?`— تجاوزت طاقتك بـ${Math.abs(remaining)} قطعة`:`— المتبقي: ${remaining} قطعة`}
        <span class="sub" style="font-size:11px;">(محسوبة من قدرة ${state.users.filter(u=>u.role==="خياط" && (u.productionCapacity||0)>0).length} خياط نشط)</span>
      </p>
    </div>`;
  }).join("");
}
function addSeason(){
  const name = $("seasonName").value.trim();
  const startDate = $("seasonStart").value;
  const endDate = $("seasonEnd").value;
  if(!startDate || !endDate){ showToast("حدد تاريخ البداية والنهاية"); return; }
  if(endDate < startDate){ showToast("تاريخ النهاية قبل البداية؟"); return; }
  state.seasons.push({id:newId(), name, startDate, endDate, capacity:0});
  saveState(); renderAll();
  $("seasonName").value=""; $("seasonStart").value=""; $("seasonEnd").value="";
  showToast("تم إضافة الموسم — حدد قدرة كل خياط من شاشة المستخدمين عشان تحتسب الطاقة");
}
async function removeSeason(i){
  if(!await showConfirm("متأكد تبي تحذف هذا الموسم؟")) return;
  state.seasons.splice(i,1); saveState(); renderAll();
}
function renderProductionTracking(){
  const el = $("productionTrackingView");
  if(!el) return;
  const day = $("productionDate").value || todayStr();
  const [y,m] = day.split("-").map(Number);
  const monthLabel = day.slice(0,7);
  const lastDayOfMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = new Date(day+"T00:00:00").getDate();
  const remainingDaysInMonth = lastDayOfMonth - dayOfMonth + 1; // including the selected day itself

  const tailors = state.users.filter(u=>u.role==="خياط");
  if(!tailors.length){ el.innerHTML = `<p class="sub">ما فيه حسابات خياطين مضافة بعد.</p>`; return; }

  const rows = tailors.map(t=>{
    let todayCount=0, monthCount=0;
    state.invoices.forEach(inv=> inv.garments.forEach(g=>{
      if(g.tailor!==t.username || !g.tailorCompletedDate) return;
      if(g.tailorCompletedDate===day) todayCount++;
      if(g.tailorCompletedDate.slice(0,7)===monthLabel) monthCount++;
    }));
    const target = t.dailyCapacity||0;
    const diff = todayCount - target;
    const rawRemainingCapacity = target * remainingDaysInMonth;
    return {t, todayCount, monthCount, target, diff, rawRemainingCapacity};
  });
  const totalTodayTarget = rows.reduce((a,r)=>a+r.target,0);
  const totalTodayActual = rows.reduce((a,r)=>a+r.todayCount,0);
  const totalRemainingCapacity = rows.reduce((a,r)=>a+r.rawRemainingCapacity,0);

  el.innerHTML = `<div class="remaining-box"><span>إجمالي إنتاج اليوم مقابل الهدف</span><span class="amt">${totalTodayActual} / ${totalTodayTarget}</span></div>
    <div class="remaining-box" style="margin-top:8px;"><span>إجمالي القدرة المتبقية للمحل حتى نهاية الشهر</span><span class="amt">${totalRemainingCapacity} ثوب</span></div>
    <div class="table-wrap" style="margin-top:14px;"><table><thead><tr>
    <th>الخياط</th><th>الهدف اليومي</th><th>الإنتاج الفعلي اليوم</th><th>الحالة</th><th>الإنتاج الفعلي هذا الشهر</th><th>القدرة المتبقية لباقي الشهر</th>
    </tr></thead><tbody>` +
    rows.map(r=>{
      let statusHtml;
      if(r.target<=0) statusHtml = `<span class="sub">ما حُدّدت له قدرة إنتاجية</span>`;
      else if(r.diff>=0) statusHtml = `<span class="badge b-done">حقق الهدف${r.diff>0?" (+"+r.diff+")":""}</span>`;
      else statusHtml = `<span class="badge b-pending">ناقص ${Math.abs(r.diff)}</span>`;
      return `<tr><td>${esc(r.t.username)}</td><td>${r.target||"—"}</td><td>${r.todayCount}</td><td>${statusHtml}</td><td>${r.monthCount}</td><td>${r.target>0?r.rawRemainingCapacity+" ثوب":"—"}</td></tr>`;
    }).join("") +
    `</tbody></table></div>`;
}
function computeShiftExpected(username, date){
  let sysCash=0, sysNetwork=0;
  const payRefs = [];
  state.invoices.forEach(inv=> (inv.payments||[]).forEach(p=>{
    if(p.recordedBy===username && p.date===date){
      sysCash+=p.cash||0; sysNetwork+=p.network||0;
      payRefs.push({source:"فاتورة تفصيل", invNumber:inv.number, cash:p.cash||0, network:p.network||0, cashReceiptNo:p.cashReceiptNo, networkReceiptNo:p.networkReceiptNo});
    }
  }));
  state.salesInvoices.forEach(inv=>{
    if(inv.recordedBy===username && inv.date===date && inv.payment){
      sysCash += inv.payment.cash||0; sysNetwork += inv.payment.network||0;
      payRefs.push({source:"فاتورة مبيعات", invNumber:inv.number, cash:inv.payment.cash||0, network:inv.payment.network||0, cashReceiptNo:null, networkReceiptNo:inv.payment.receipt});
    }
  });
  const sysTransfers = state.transferRequests.filter(r=>r.status==="accepted" && r.toOwner===username && r.resolvedAt===date).reduce((a,r)=>a+r.amount,0);
  // a cross-user transfer this user SENT is deducted from their box the instant it's sent (see
  // transferFunds()), not when it's accepted/rejected — so it must reduce today's expected cash too,
  // whatever happens to it afterwards. If it's later rejected and the money is returned, that return
  // is dated by resolvedAt, so it only offsets the expected total on the day it actually comes back.
  const sysTransfersOut = state.transferRequests.filter(r=>r.fromOwner===username && r.createdAt===date).reduce((a,r)=>a+r.amount,0);
  const sysTransfersReturned = state.transferRequests.filter(r=>r.status==="rejected" && r.fromOwner===username && r.resolvedAt===date).reduce((a,r)=>a+r.amount,0);
  // expenses already formally recorded (شاشة المصروفات) and paid out of this user's own box(es) on this
  // date — that cash/network amount legitimately left the box for a documented reason. Without this, the
  // shift audit falsely reports a shortage equal to every such expense, since it only ever summed money
  // coming IN (payments/transfers) and had no idea money could also legitimately go OUT via a real expense.
  let recordedCashExpenses = 0, recordedNetworkExpenses = 0;
  state.expenses.forEach(e=>{
    if(e.date!==date) return;
    const box = findCashBox(e.sourceBoxId);
    if(!box || box.owner!==username) return;
    if(box.type==="cash") recordedCashExpenses += e.amount;
    else if(box.type==="network") recordedNetworkExpenses += e.amount;
  });
  // every other documented movement in/out of this user's boxes today — vouchers, customer refunds,
  // paid purchases and supplier payments, salaries/advances, cash back from a supplier return.
  // These all move real money but were left out, so each one showed up as a false shortage/surplus.
  const ownBox = id=>{ const b=findCashBox(id); return !!b && b.owner===username; };
  const otherMoves = [];
  state.vouchers.forEach(v=>{ if(v.date===date && ownBox(v.boxId)) otherMoves.push({label:`سند ${v.type==="receipt"?"قبض":"صرف"} ${v.voucherNo}`, amount: v.type==="receipt" ? v.amount : -v.amount}); });
  state.invoiceReturns.forEach(r=>{ if(r.date===date && r.refundAmount && ownBox(r.boxId)) otherMoves.push({label:`استرداد مرتجع فاتورة ${r.invoiceNumber}`, amount:-r.refundAmount}); });
  (state.salesReturns||[]).forEach(r=>{ if(r.date===date && r.refundAmount && ownBox(r.boxId)) otherMoves.push({label:`استرداد مرتجع مبيعات ${r.saleInvoiceNumber}`, amount:-r.refundAmount}); });
  (state.legacyPayments||[]).forEach(l=>{ if(l.date===date && l.recordedBy===username) otherMoves.push({label:"تحصيل قطعة قديمة (سجل سابق)", amount:l.amount}); });
  state.purchases.forEach(p=>{ if(p.date===date && p.payStatus==="paid" && ownBox(p.sourceBoxId)) otherMoves.push({label:`فاتورة شراء ${p.invoiceNo}`, amount:-p.total}); });
  state.purchaseReturns.forEach(r=>{ if(r.date===date && r.payStatus==="paid" && ownBox(r.boxId)) otherMoves.push({label:"مرتجع مشتريات (مبلغ مسترد)", amount:r.value}); });
  state.suppliers.forEach(s=> (s.payments||[]).forEach(sp=>{ if(sp.date===date && ownBox(sp.boxId)) otherMoves.push({label:`تسديد مورد ${s.name}`, amount:-sp.amount}); }));
  state.payrollLedger.forEach(e=>{ if(e.date===date && (e.type==="payment"||e.type==="advance") && ownBox(e.boxId)) otherMoves.push({label:`${e.type==="advance"?"سلفة":"راتب"} ${e.username}`, amount:-e.amount}); });
  const sysOtherNet = otherMoves.reduce((a,m)=>a+m.amount,0);
  const total = sysCash+sysNetwork+sysTransfers-sysTransfersOut+sysTransfersReturned-recordedCashExpenses-recordedNetworkExpenses+sysOtherNet;
  return {sysCash, sysNetwork, sysTransfers, sysTransfersOut, sysTransfersReturned, recordedCashExpenses, recordedNetworkExpenses, sysOtherNet, otherMoves, total, payRefs};
}
function runShiftAudit(){
  const date = $("shiftAuditDate").value || todayStr();
  const actualCash = parseFloat($("shiftActualCash").value)||0;
  const networkActual = parseFloat($("shiftNetworkActual").value)||0;
  const transfersActual = parseFloat($("shiftTransfersActual").value)||0;
  const pettyExpenses = parseFloat($("shiftPettyExpenses").value)||0;
  const expected = computeShiftExpected(currentUser.username, date);
  const physicalTotal = actualCash + pettyExpenses + networkActual + transfersActual;
  const diff = physicalTotal - expected.total;
  window.__lastShiftAudit = {date, actualCash, networkActual, transfersActual, pettyExpenses, expected, physicalTotal, diff};
  const recordedExpTotal = expected.recordedCashExpenses + expected.recordedNetworkExpenses;
  const netTransfersOut = expected.sysTransfersOut - expected.sysTransfersReturned;
  let html = `<div class="remaining-box"><span>المتوقع من النظام (كاش ${expected.sysCash.toFixed(0)} + شبكة ${expected.sysNetwork.toFixed(0)} + تحويلات مستلمة ${expected.sysTransfers.toFixed(0)}${netTransfersOut>0?` − تحويلات مرسلة ${netTransfersOut.toFixed(0)}`:""}${recordedExpTotal>0?` − مصروفات مسجّلة ${recordedExpTotal.toFixed(0)}`:""}${Math.abs(expected.sysOtherNet)>0.001?` ${expected.sysOtherNet>0?"+":"−"} حركات صندوق أخرى ${Math.abs(expected.sysOtherNet).toFixed(0)}`:""})</span><span class="amt">${expected.total.toFixed(2)} ريال</span></div>`;
  if(netTransfersOut>0){
    html += `<p class="sub" style="margin:4px 0;">ℹ تم خصم ${netTransfersOut.toFixed(0)} ريال تحويلات أرسلتها من صندوقك اليوم لمستخدم آخر (ما رجعت لك حتى الآن).</p>`;
  }
  if(recordedExpTotal>0){
    html += `<p class="sub" style="margin:4px 0;">ℹ تم خصم ${recordedExpTotal.toFixed(0)} ريال مصروفات مسجّلة رسمياً من صندوقك اليوم تلقائياً — لا تكتبها مرة ثانية بخانة "المصروفات النثرية" تحت، إلا لو فيه مصروف ثاني ما سجّلته رسمياً بعد.</p>`;
  }
  if(expected.otherMoves.length){
    html += `<p class="sub" style="margin:4px 0;">ℹ حركات صندوق أخرى اليوم محسوبة تلقائياً: ${expected.otherMoves.map(m=>`${esc(m.label)} (${m.amount>0?"+":"−"}${Math.abs(m.amount).toFixed(0)})`).join("، ")}</p>`;
  }
  html += `<div class="remaining-box" style="margin-top:6px;"><span>الإجمالي الفعلي (من واقع الدرج)</span><span class="amt">${physicalTotal.toFixed(2)} ريال</span></div>`;
  if(Math.abs(diff)<0.5){
    html += `<div class="remaining-box" style="margin-top:6px;border-color:var(--profit);"><span><b>متوافق</b></span><span class="amt" style="color:var(--profit);">لا يوجد فرق</span></div>`;
  } else {
    const label = diff>0 ? "زيادة" : "عجز";
    html += `<div class="remaining-box" style="margin-top:6px;border-color:var(--loss);"><span><b>يوجد ${label} بمبلغ</b></span><span class="amt" style="color:var(--loss);">${Math.abs(diff).toFixed(2)} ريال</span></div>`;
    html += `<button class="btn btn-ghost btn-sm" id="startInvestigationBtn" style="margin-top:8px;">هل تريد المساعدة في البحث عن ${label==="عجز"?"العجز":"الزيادة"}؟</button>`;
    html += `<div id="investigationTool" style="display:none;margin-top:10px;"></div>`;
  }
  html += `<button class="btn btn-gold btn-sm" id="saveShiftClosingBtn" style="margin-top:10px;">حفظ سجل الإقفال</button>`;
  $("shiftAuditResult").innerHTML = html;
  if($("startInvestigationBtn")) $("startInvestigationBtn").addEventListener("click", showInvestigationTool);
  $("saveShiftClosingBtn").addEventListener("click", saveShiftClosing);
}
function showInvestigationTool(){
  const el = $("investigationTool");
  el.style.display = "";
  el.innerHTML = `<p class="sub">اكتب أرقام السندات أو الفواتير اللي عندك بالدفتر أو الدرج، وحدة بكل سطر أو مفصولة بفاصلة.</p>
    <textarea id="investigationInput" rows="3" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:var(--ivory);font-family:inherit;font-size:14px;" placeholder="مثلاً: 12, 13, NET-4021"></textarea>
    <button class="btn btn-ghost btn-sm" id="runInvestigationBtn" style="margin-top:8px;">تحقّق</button>
    <div id="investigationResults" style="margin-top:10px;"></div>`;
  $("runInvestigationBtn").addEventListener("click", runInvestigation);
}
function runInvestigation(){
  const raw = $("investigationInput").value.trim();
  if(!raw){ showToast("أدخل رقم واحد على الأقل"); return; }
  const tokens = raw.split(/[\n,،]/).map(t=>t.trim()).filter(Boolean);
  const audit = window.__lastShiftAudit;
  const results = tokens.map(tok=>{
    const match = audit.expected.payRefs.find(r=> String(r.cashReceiptNo)===tok || String(r.networkReceiptNo)===tok || r.invNumber===tok);
    if(match){
      return `<div class="item-row"><span>${tok} — موجود بالنظام (${match.source} #${match.invNumber} — كاش ${match.cash.toFixed(0)} / شبكة ${match.network.toFixed(0)})</span></div>`;
    }
    return `<div class="item-row" style="color:var(--loss);"><span>${tok} — غير مسجّل بالنظام لهذا اليوم — محتمل يكون هو سبب الفرق، تأكد منه يدوياً</span></div>`;
  }).join("");
  $("investigationResults").innerHTML = results + `<p class="sub" style="margin-top:8px;">ℹ هذي أداة إرشادية بس — ما تعدّل أي شي بحسابات النظام تلقائياً. أي تصحيح تسويه بنفسك يدوياً (مصروف، دفعة ناقصة، إلخ).</p>`;
}
async function saveShiftClosing(){
  const a = window.__lastShiftAudit;
  if(!a){ showToast("اضغط احسب أولاً"); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  state.shiftClosings.push({
    id: newId(), username: currentUser.username, date: a.date,
    actualCash:a.actualCash, networkActual:a.networkActual, transfersActual:a.transfersActual, pettyExpenses:a.pettyExpenses,
    systemCash:a.expected.sysCash, systemNetwork:a.expected.sysNetwork, systemTransfers:a.expected.sysTransfers,
    systemTotal:a.expected.total, physicalTotal:a.physicalTotal, diff:a.diff, timestamp:serverDate().toISOString(),
  });
  if(!await saveStateWithRollback(snapshot)) return; // don't claim success below if the closing record never actually made it to the cloud
  logAudit("shift_closing_saved", {date:a.date, systemTotal:a.expected.total, physicalTotal:a.physicalTotal, diff:a.diff});
  showToast("تم حفظ سجل الإقفال");
}
function renderShiftClosingsLog(){
  const el = $("shiftClosingsLog");
  if(!el) return;
  const mine = state.shiftClosings.filter(c=> currentUser.role==="مدير" || c.username===currentUser.username).slice(-20).reverse();
  el.innerHTML = mine.length ? `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>المستخدم</th><th>المتوقع</th><th>الفعلي</th><th>الفرق</th></tr></thead><tbody>` +
    mine.map(c=>`<tr><td>${c.date}</td><td>${c.username}</td><td>${c.systemTotal.toFixed(0)} ﷼</td><td>${c.physicalTotal.toFixed(0)} ﷼</td><td style="color:${Math.abs(c.diff)<0.5?'var(--profit)':'var(--loss)'}">${c.diff>=0?"+":""}${c.diff.toFixed(0)} ﷼</td></tr>`).join("") +
    `</tbody></table></div>` : `<p class="sub">ما فيه سجلات إقفال بعد.</p>`;
}
function nextReceiptVoucherNo(){ const n=state.settings.nextReceiptVoucherNumber||1; state.settings.nextReceiptVoucherNumber=n+1; return n; }
function nextPaymentVoucherNo(){ const n=state.settings.nextPaymentVoucherNumber||1; state.settings.nextPaymentVoucherNumber=n+1; return n; }
function renderVouchersTab(){
  const boxSel = $("voucherBox");
  if(!boxSel) return;
  boxSel.innerHTML = userBoxes(currentUser.username).map(b=>`<option value="${b.id}">${esc(b.name)} (${typeLabel(b.type)})</option>`).join("");
  if(!$("voucherPeriodWrap").innerHTML){ $("voucherPeriodWrap").innerHTML = periodPickerHtml("voucher"); bindPeriodPicker("voucher"); }
  renderVouchersLog();
}
async function submitVoucher(){
  const type = $("voucherType").value;
  const amount = parseFloat($("voucherAmount").value)||0;
  const party = $("voucherParty").value.trim();
  const boxId = $("voucherBox").value;
  const reason = $("voucherReason").value.trim();
  if(amount<=0){ showToast("أدخل مبلغ صحيح"); return; }
  if(!party){ showToast(type==="receipt" ? "أدخل اسم من استلمنا منه المبلغ" : "أدخل اسم من صرفنا له المبلغ"); return; }
  if(!reason){ showToast("أدخل سبب السند"); return; }
  const box = state.cashBoxes.find(b=>b.id===boxId);
  if(!box){ showToast("اختر الصندوق"); return; }
  if(type==="payment" && box.balance < amount){
    showToast(`رصيد الصندوق (${box.balance.toFixed(0)} ريال) أقل من المبلغ المطلوب صرفه`); return;
  }
  const snapshot = JSON.parse(JSON.stringify(state));
  box.balance += (type==="receipt" ? amount : -amount);
  const voucherNo = type==="receipt" ? nextReceiptVoucherNo() : nextPaymentVoucherNo();
  state.vouchers.push({id:newId(), voucherNo, type, amount, party, reason, boxId, boxName:box.name, date:todayStr(), recordedBy:currentUser.username});
  if(await saveStateWithRollback(snapshot)){
    logAudit("voucher_recorded", {voucherNo, type, amount, party, reason, boxName:box.name});
    $("voucherAmount").value=""; $("voucherParty").value=""; $("voucherReason").value="";
    showToast(`تم تسجيل سند ${type==="receipt"?"قبض":"صرف"} رقم ${voucherNo}`);
  }
}
function renderVouchersLog(){
  const el = $("vouchersLog");
  if(!el || !currentUser) return;
  const q = ($("voucherSearch")?.value||"").trim().toLowerCase();
  const typeFilter = $("voucherFilterType")?.value||"";
  const mine = state.vouchers.filter(v=>{
    if(currentUser.role!=="مدير" && v.recordedBy!==currentUser.username) return false;
    if(typeFilter && v.type!==typeFilter) return false;
    if($("voucherPeriodMode") && !dateMatchesPeriod("voucher", v.date)) return false;
    if(q && !(String(v.voucherNo).includes(q) || v.party.toLowerCase().includes(q) || v.reason.toLowerCase().includes(q))) return false;
    return true;
  }).slice().reverse();
  el.innerHTML = mine.length ? `<div class="table-wrap"><table><thead><tr><th>رقم السند</th><th>النوع</th><th>المبلغ</th><th>الطرف</th><th>السبب</th><th>التاريخ</th><th></th></tr></thead><tbody>` +
    mine.map(v=>`<tr><td>${v.voucherNo}</td><td>${v.type==="receipt"?"قبض":"صرف"}</td><td>${v.amount.toFixed(0)} ﷼</td><td>${esc(v.party)}</td><td>${esc(v.reason)}</td><td>${v.date}</td><td><button class="icon-btn" onclick="printVoucher('${v.id}')" title="طباعة السند"><i data-lucide="printer"></i></button></td></tr>`).join("") +
    `</tbody></table></div>` : `<p class="sub">ما فيه سندات مطابقة.</p>`;
}
function printVoucher(id){
  const v = state.vouchers.find(x=>x.id===id);
  if(!v) return;
  const s = state.settings;
  const title = v.type==="receipt" ? "سند قبض" : "سند صرف";
  const partyLabel = v.type==="receipt" ? "استلمنا من" : "صرفنا إلى";
  const rootWidth = (s.thermalPaperWidth||58)===80 ? 280 : 200;
  const html = `<div id="receiptShareRoot" style="width:100%;max-width:${rootWidth}px;font-family:var(--font-main);direction:rtl;text-align:right;font-size:12px;margin:0 auto;background:#fff;color:#000;padding:2px 8px 8px;">
    <div style="text-align:center;">
      ${s.shopLogo?`<img src="${s.shopLogo}" style="max-width:50px;max-height:50px;">`:""}
      <h3 style="margin:6px 0;">${esc(s.shopName)||"—"}</h3>
      <h3 style="margin:0 0 8px;border:2px solid #000;display:inline-block;padding:3px 12px;border-radius:6px;">${title}</h3>
    </div>
    <p style="margin:3px 0;">رقم السند: <b>${v.voucherNo}</b></p>
    <p style="margin:3px 0;">التاريخ: <b>${v.date}</b></p>
    <hr>
    <p style="margin:3px 0;">${partyLabel}: <b>${esc(v.party)}</b></p>
    <p style="margin:3px 0;">المبلغ: <b>${v.amount.toFixed(2)} ريال</b></p>
    <p style="margin:3px 0;">البيان / السبب: ${esc(v.reason)}</p>
    <p style="margin:3px 0;">الصندوق: ${esc(v.boxName)}</p>
    <hr>
    <div style="margin-top:20px;">
      <p style="margin:10px 0 3px;">توقيع المستلم: __________</p>
      <p style="margin:10px 0 3px;">توقيع المسؤول: __________</p>
    </div>
  </div>`;
  // "auto" for the page height silently makes some print/PDF engines (verified: Chromium's own
  // print-to-PDF) drop the whole @page size and fall back to a default Letter/A4-sized page —
  // which is what was actually causing thermal receipts/labels/vouchers to print at the wrong
  // size with clipped tables. An explicit, generous fixed height is reliably honored instead;
  // thermal printers just cut the roll once the content ends, so the extra unused length is harmless.
  $("dynamicPageSize").textContent = `@media print{ @page{ size:${state.settings.thermalPaperWidth||58}mm 2000mm; margin:0; } }`;
  $("printArea").innerHTML = html;
  safePrint();
}
function transferFunds(fromBoxId, toOwnerUsername, toBoxId, amount, purpose){
  const fromBox = findCashBox(fromBoxId);
  if(!fromBox) return {ok:false,msg:"صندوق المصدر غير موجود"};
  if(amount<=0) return {ok:false,msg:"أدخل مبلغ صحيح"};
  if(boxTotal(fromBox) < amount) return {ok:false,msg:`الرصيد غير كافٍ (المتاح ${boxTotal(fromBox).toFixed(0)} ريال)`};
  fromBox.balance -= amount;
  logAudit("funds_transferred", {amount, fromOwner:fromBox.owner, toOwner:toOwnerUsername, purpose:purpose||""});
  if(fromBox.owner===toOwnerUsername){
    // same-user transfer: instant, direct
    const toBox = findCashBox(toBoxId);
    if(!toBox){ fromBox.balance += amount; return {ok:false,msg:"صندوق الوجهة غير موجود"}; }
    toBox.balance += amount;
    // kept so each box's balance can be traced back to its movements (this used to leave no record
    // at all besides the audit log, so cash vs network per box couldn't be reconciled)
    if(!state.boxTransfers) state.boxTransfers = [];
    state.boxTransfers.push({id:newId(), date:todayStr(), owner:fromBox.owner, fromBoxId, toBoxId, amount, purpose:purpose||"", recordedBy:currentUser.username});
    return {ok:true, instant:true};
  } else {
    // cross-user transfer: pending request, amount already reserved (deducted) from sender
    state.transferRequests.push({
      id: newId(), seq: null,
      fromBoxId, fromOwner: fromBox.owner, toOwner: toOwnerUsername,
      amount, purpose: purpose||"", status:"pending",
      createdAt: todayStr(), resolvedAt: null, voucherNumber: null,
    });
    return {ok:true, instant:false};
  }
}
async function acceptTransferRequest(id){
  const req = state.transferRequests.find(r=>r.id===id); if(!req || req.status!=="pending") return;
  const snapshot = JSON.parse(JSON.stringify(state));
  const toBox = mainBoxOf(req.toOwner,"cash");
  if(toBox) toBox.balance += req.amount;
  req.status="accepted"; req.resolvedAt=todayStr(); req.voucherNumber=nextVoucherNo();
  if(await saveStateWithRollback(snapshot)){
    logAudit("transfer_accepted", {amount:req.amount, fromOwner:req.fromOwner, toOwner:req.toOwner, voucherNumber:req.voucherNumber});
    showToast(`تم استلام المبلغ — سند رقم ${req.voucherNumber}`);
  }
}
async function rejectTransferRequest(id){
  const req = state.transferRequests.find(r=>r.id===id); if(!req || req.status!=="pending") return;
  if(!await showConfirm("متأكد ترفض هذا التحويل؟ المبلغ يرجع للمرسل.")) return;
  const snapshot = JSON.parse(JSON.stringify(state));
  const fromBox = findCashBox(req.fromBoxId);
  if(fromBox) fromBox.balance += req.amount;
  req.status="rejected"; req.resolvedAt=todayStr();
  if(await saveStateWithRollback(snapshot)){
    logAudit("transfer_rejected", {amount:req.amount, fromOwner:req.fromOwner, toOwner:req.toOwner});
    showToast("تم رفض التحويل وإرجاع المبلغ للمرسل");
  }
}
function addExpense(data){
  const box = findCashBox(data.sourceBoxId);
  if(!box) return {ok:false,msg:"اختر مصدر الدفع"};
  if(boxTotal(box) < data.amount) return {ok:false,msg:`الرصيد غير كافٍ بمصدر الدفع (المتاح ${boxTotal(box).toFixed(0)} ريال)`};
  box.balance -= data.amount;
  const cat = state.expenseCategories.find(c=>c.id===data.categoryId);
  if(cat && cat.advisoryKey) state.advisory[cat.advisoryKey] -= data.amount;
  // snapshot the sub-item's label so this expense's history stays readable even if the sub-item is later renamed/deleted
  const subItem = cat && data.subItemId ? (cat.subItems||[]).find(s=>s.id===data.subItemId) : null;
  state.expenses.push({
    id: newId(), invoiceNumber:data.invoiceNumber, taxNumber:data.taxNumber, date:data.date,
    categoryId:data.categoryId, subItemId: subItem?subItem.id:"", subItemLabel: subItem?subItem.label:"",
    amount:data.amount, paidTo:data.paidTo, storeName:data.storeName,
    notes:data.notes, sourceBoxId:data.sourceBoxId, recordedBy: currentUser.username, vatStatus:data.vatStatus,
  });
  logAudit("expense_recorded", {amount:data.amount, paidTo:data.paidTo, categoryId:data.categoryId, subItemLabel: subItem?subItem.label:undefined, date:data.date});
  return {ok:true};
}

// ---------------- garment form ----------------
function defaultFabricQty(){ return state.settings.defaultFabricQty; }
function fabricQtyBuffer(){ return state.settings.fabricQtyBuffer; }
function renderGarmentFields(prefill=null){
  closeMeasPanel();
  const holder=$("garmentsHolder"); holder.innerHTML="";
  const n = parseInt($("invCount").value)||1;
  const cards = activeFabricCards();
  const NO_FABRIC_LABEL = "أجرة تفصيل (بدون قماش)";
  for(let i=0;i<n;i++){
    const g=(prefill&&prefill[i])||{itemCardId:"", category:BODY_CATEGORIES[0], price:0, qtyUsed:0, hasEmbroidery:false, embroideryPrice:0, addons:[], measurements:{}, urgent:false, sample:false, cutter: currentUser?currentUser.username:""};
    const div=document.createElement("div"); div.className="garment-card";
    const currentCard = g.itemCardId ? findItemCard(g.itemCardId) : null;
    const currentFabricName = currentCard ? currentCard.name : ((g.itemCardId==="__none__" || (editingId && !g.itemCardId)) ? NO_FABRIC_LABEL : "");
    const addonsHtml = state.addonDefs.filter(a=>a.active!==false).map(a=>{
      const checked = (g.addons||[]).includes(a.id);
      return `<label style="display:flex;align-items:center;gap:6px;margin:4px 0;font-size:13px;"><input type="checkbox" class="g-addon" data-addon="${a.id}" ${checked?"checked":""}> ${esc(a.name)} (${addonUnitPrice(a).toFixed(0)} ريال)</label>`;
    }).join("");
    div.innerHTML=`
      <span class="tag">ثوب ${i+1}</span>
      <div class="row-2">
        <div class="field"><label>نوع القماش (من المشتريات)</label>
          <input type="text" class="g-itemCard-search" list="fabricDatalist" value="${esc(currentFabricName)}" placeholder="اختر القماش من المخزون (أو بدون قماش)..." autocomplete="off">
          <input type="hidden" class="g-itemCard" value="${g.itemCardId || (editingId ? "__none__" : "")}">
          <p class="g-avail-note sub" style="display:none;margin:4px 0 0;font-size:11px;"></p>
        </div>
        <div class="field"><label>الفئة</label>
          <select class="g-category">${BODY_CATEGORIES.map(c=>`<option value="${c}" ${c===g.category?"selected":""}>${c}</option>`).join("")}</select>
        </div>
      </div>
      <div class="row-2">
        <div class="field"><label>سعر البيع الأساسي (ريال)</label><input type="number" class="g-price" min="0" placeholder="0" value="${g.price?g.price:""}"></div>
        <div class="field"><label>الكمية المستهلكة (${unitLabel()})</label><input type="number" class="g-qty" min="0" step="0.1" value="${g.qtyUsed?g.qtyUsed:""}"></div>
      </div>
      <div class="embro-toggle"><input type="checkbox" class="g-hasEmbro" ${g.hasEmbroidery?"checked":""}><label style="margin:0;">فيه تطريز</label></div>
      <div class="field g-embro-wrap" style="${g.hasEmbroidery?"":"display:none;"}"><label>سعر التطريز (ريال)</label><input type="number" class="g-embroPrice" min="0" placeholder="0" value="${g.embroideryPrice?g.embroideryPrice:""}"></div>
      <button type="button" class="btn btn-ghost btn-sm meas-toggle-btn" data-idx="${i}">كرت المقاس (اضغط للفتح)</button>
      ${renderMeasurementPanelHtml(g, i)}
      ${addonsHtml ? `<div class="stitch" style="margin:10px 0;"></div><label style="font-size:12px;color:var(--muted);">ملحقات وخدمات إضافية</label>${addonsHtml}` : ""}
    `;
    holder.appendChild(div);
    div.querySelector(".meas-toggle-btn").addEventListener("click", ()=> openMeasPanel(i));
    div.querySelectorAll(".meas-close-btn").forEach(btn=> btn.addEventListener("click", closeMeasPanel));
    div.querySelectorAll(".meas-save-btn").forEach(btn=> btn.addEventListener("click", ()=>{
      saveMeasurementSnapshotToHistory(i);
      closeMeasPanel();
    }));
    div.querySelectorAll(".meas-fetch-season-btn").forEach(btn=> btn.addEventListener("click", ()=>{
      loadMeasurementSnapshotIntoGarment(parseInt(btn.dataset.idx), btn.dataset.season);
    }));
    div.querySelectorAll(".meas-choice").forEach(sel=> sel.addEventListener("change", ()=>{
      const idx = parseInt(sel.dataset.idx);
      const wasOpen = openMeasPanelIdx === idx;
      // renderGarmentFields() below rebuilds the whole panel as a fresh DOM node (scrollTop resets to 0),
      // so picking a type near the bottom of a long panel used to jump you back to its top every time —
      // save the current scroll position and restore it on the rebuilt panel
      const oldPanel = wasOpen ? sel.closest(".meas-panel") : null;
      const savedScrollTop = oldPanel ? oldPanel.scrollTop : 0;
      const savedPageScrollY = window.scrollY;
      renderGarmentFields(readGarmentFields());
      // re-open the same panel after re-render (rebuilds the DOM) so picking an option doesn't close it, and refreshes the mannequin preview
      if(wasOpen){
        openMeasPanel(idx);
        const newPanel = $("garmentsHolder").children[idx].querySelector(".meas-panel");
        if(newPanel) newPanel.scrollTop = savedScrollTop;
      }
      // replacing the changed <select> with a fresh DOM node makes some mobile browsers auto-scroll the
      // whole page back to the top (treating it like a newly-focused field) — put it back where it was
      if(window.scrollY !== savedPageScrollY) window.scrollTo(0, savedPageScrollY);
    }));
    const cb = div.querySelector(".g-hasEmbro"), wrap = div.querySelector(".g-embro-wrap");
    cb.addEventListener("change", ()=>{ wrap.style.display = cb.checked?"":"none"; updateLiveTotals(); });
    div.querySelector(".g-price").addEventListener("input", updateLiveTotals);
    div.querySelector(".g-embroPrice").addEventListener("input", updateLiveTotals);
    div.querySelectorAll(".g-addon").forEach(cbx=> cbx.addEventListener("change", updateLiveTotals));
    const itemSel = div.querySelector(".g-itemCard"), catSel = div.querySelector(".g-category"), priceInp = div.querySelector(".g-price"), qtyInp = div.querySelector(".g-qty");
    function applyDefaults(forceUpdate){
      const c = findItemCard(itemSel.value);
      const availNote = div.querySelector(".g-avail-note");
      if(c && c.type==="fabric"){
        if(!priceInp.value || forceUpdate) priceInp.value = c.prices[catSel.value]||"";
        const standardQty = c.qty[catSel.value] || defaultFabricQty()[catSel.value] || 0;
        if(standardQty>0){
          qtyInp.dataset.standardQty = standardQty;
          qtyInp.max = (standardQty + fabricQtyBuffer()).toFixed(2);
        } else {
          delete qtyInp.dataset.standardQty; qtyInp.removeAttribute("max");
        }
        if(!qtyInp.value || forceUpdate) qtyInp.value = standardQty || "";
        if(availNote){
          const avail = (c.stockQty||0) - (c.reservedQty||0);
          availNote.style.display = "";
          availNote.textContent = `الرصيد المتاح من "${c.name}": ${avail.toFixed(2)} ${unitLabel()}`;
          availNote.style.color = avail>0 ? "var(--profit)" : "var(--loss)";
        }
      } else {
        if(itemSel.value==="__none__"){
          const t = state.settings.tailoringOnly;
          if(t && (!priceInp.value || forceUpdate) && t.prices[catSel.value]) priceInp.value = t.prices[catSel.value];
        }
        if(availNote) availNote.style.display = "none";
      }
      renderInvoiceOffersSelector();
    }
    qtyInp.addEventListener("input", ()=>{
      const standard = parseFloat(qtyInp.dataset.standardQty);
      if(!standard) return;
      const maxAllowed = standard + fabricQtyBuffer();
      const val = parseFloat(qtyInp.value);
      if(val > maxAllowed){
        qtyInp.value = maxAllowed;
        showToast(`ما تقدر تتجاوز ${maxAllowed.toFixed(2)} ${unitLabel()} لهذي الفئة (الأساسي ${standard} + هامش ${fabricQtyBuffer().toFixed(2)})`);
      }
    });
    itemSel.addEventListener("change", ()=>applyDefaults(true));
    catSel.addEventListener("change", ()=>applyDefaults(true));
    const searchInp = div.querySelector(".g-itemCard-search");
    searchInp.addEventListener("input", ()=>{
      const val = searchInp.value.trim();
      if(val===NO_FABRIC_LABEL){ itemSel.value="__none__"; applyDefaults(true); return; }
      const match = activeFabricCards().find(c=>c.name===val);
      itemSel.value = match ? match.id : "";
      if(match) applyDefaults();
    });
    if(!prefill) applyDefaults();
  }
  updateFixedShareNote(); updateLiveTotals(); updatePriceFieldsLockState();
  refreshLucideIcons();
}
function readGarmentFields(existing){
  return Array.from($("garmentsHolder").children).map((card,i)=>{
    const itemCardIdRaw = card.querySelector(".g-itemCard").value;
    const itemCardId = itemCardIdRaw==="__none__" ? "" : itemCardIdRaw;
    const category = card.querySelector(".g-category").value;
    const itemCard = findItemCard(itemCardId);
    const fabricType = itemCard ? itemCard.name : "أجرة تفصيل";
    const price = parseFloat(card.querySelector(".g-price").value)||0;
    const qtyUsed = parseFloat(card.querySelector(".g-qty").value)||0;
    const hasEmbroidery = card.querySelector(".g-hasEmbro").checked;
    const embroideryPrice = parseFloat(card.querySelector(".g-embroPrice").value)||0;
    const addons = Array.from(card.querySelectorAll(".g-addon:checked")).map(cbx=>cbx.dataset.addon);
    const measurementNotes = card.querySelector(".meas-notes") ? card.querySelector(".meas-notes").value.trim() : "";
    const urgent = card.querySelector(".meas-urgent") ? card.querySelector(".meas-urgent").checked : false;
    const sample = card.querySelector(".meas-sample") ? card.querySelector(".meas-sample").checked : false;
    const cutter = card.querySelector(".meas-cutter") ? card.querySelector(".meas-cutter").value.trim() : "";
    const measurements = {};
    card.querySelectorAll(".meas-field").forEach(inp=>{ if(inp.value) measurements[inp.dataset.key] = parseFloat(inp.value)||0; });
    card.querySelectorAll(".meas-choice").forEach(sel=>{ if(sel.value) measurements[sel.dataset.key] = sel.value; });
    const old = existing && existing[i] ? existing[i] : {};
    return {
      fabricType, itemCardId, category, price, qtyUsed, hasEmbroidery, embroideryPrice, addons, measurementNotes,
      measurements, urgent, sample, cutter,
      tailor: old.tailor||"", status: old.status||"جديد", deliveryReceipt: old.deliveryReceipt||"",
      deliveredDate: old.deliveredDate||null, costSnapshot: old.costSnapshot,
      advisoryApplied: false, advisoryCredit: null, stockApplied: old.stockApplied||null, addonsStockApplied: old.addonsStockApplied||false,
    };
  });
}
function updateFixedShareNote(){
  const extra = editingId? 0 : (parseInt($("invCount").value)||0);
  $("fixedShareNote").textContent = `حصة الثوب الواحد من التكاليف الثابتة (الشهر الحالي): ${currentFixedShare(extra).toFixed(2)} ريال (إجمالي التكاليف الثابتة الشهرية ${totalFixed().toFixed(0)} ريال ÷ ${garmentsCutInMonth(state.settings.currentMonth)+extra} ثوب مقطوع بالشهر الحالي).`;
}
function updateLiveTotals(){
  const prices = Array.from($("garmentsHolder").children).reduce((a,card)=>{
    const p = parseFloat(card.querySelector(".g-price").value)||0;
    const emb = card.querySelector(".g-hasEmbro").checked ? (parseFloat(card.querySelector(".g-embroPrice").value)||0) : 0;
    const addonIds = Array.from(card.querySelectorAll(".g-addon:checked")).map(cbx=>cbx.dataset.addon);
    const addonsTotal = addonIds.reduce((s,id)=>{ const def = state.addonDefs.find(x=>x.id===id); return s + (def ? addonUnitPrice(def) : 0); },0);
    return a+p+emb+addonsTotal;
  },0);
  const paid = paymentsListTemp.reduce((a,p)=>a+p.cash+p.network+(p.discount||0),0);
  const redeemInp = $("loyaltyRedeemInput");
  const pointsToRedeem = (redeemInp && !editingId) ? (parseInt(redeemInp.value)||0) : 0;
  const loyaltyDiscount = pointsToRedeem * (state.settings.loyaltyRedeemRate||1);
  const promoDiscount = currentPromoDiscountAmount(prices);
  const directDiscountInp = $("directDiscountInput");
  let directDiscount = directDiscountInp ? (parseFloat(directDiscountInp.value)||0) : 0;
  const directDiscountVip = isCustomerVip(($("custMobile")?.value||"").trim());
  const remainingForDirectDiscount = Math.max(0, prices - loyaltyDiscount - promoDiscount);
  const maxDirectDiscount = directDiscountVip ? remainingForDirectDiscount : Math.min(remainingForDirectDiscount, userMaxDiscountAmount(currentUser, prices));
  if($("directDiscountLabel")) $("directDiscountLabel").textContent = directDiscountVip
    ? "خصم مباشر (ريال) — عميل VIP: أي موظف يقدر يخصم بدون حد (حتى 100%)"
    : userDiscountEnabled(currentUser) ? `خصم مباشر (ريال) — حدّك الأقصى ${maxDirectDiscount.toFixed(0)} ريال` : "خصم مباشر (ريال) — ما عندك صلاحية خصم (إلا لعميل VIP)";
  if(directDiscount > maxDirectDiscount){ directDiscount = maxDirectDiscount; if(directDiscountInp) directDiscountInp.value = maxDirectDiscount.toFixed(0); }
  const totalDiscount = loyaltyDiscount + promoDiscount + directDiscount;
  $("liveInvoiceTotal").textContent = prices.toFixed(0)+" ﷼";
  $("livePaid").textContent = paid.toFixed(0)+" ﷼";
  $("liveRemaining").textContent = (prices-paid-totalDiscount).toFixed(0)+" ﷼";
  if(totalDiscount>0.01){
    const parts = [];
    if(loyaltyDiscount>0.01) parts.push(`نقاط ولاء: ${loyaltyDiscount.toFixed(0)} ﷼`);
    if(promoDiscount>0.01) parts.push(`كود خصم: ${promoDiscount.toFixed(0)} ﷼`);
    if(directDiscount>0.01) parts.push(`خصم مباشر: ${directDiscount.toFixed(0)} ﷼`);
    $("liveDiscountNote").style.display = "";
    $("liveDiscountNote").textContent = `خصم مطبّق: ${parts.join(" + ")}`;
  } else if($("liveDiscountNote")) {
    $("liveDiscountNote").style.display = "none";
  }
  renderInvoiceOffersSelector();
}

// ---------------- promotional offers: invoice-form selector ----------------
let selectedOfferIds = [];
function checkOfferEligibility(garments, offer){
  if(offer.type==="quantity_discount") return findCheapestMatchingGarment(garments, offer)!==null;
  return garments.filter(g=>g.status!=="ملغي").length >= offer.minGarments;
}
function renderInvoiceOffersSelector(){
  const wrap = $("invoiceOffersWrap");
  if(!wrap || editingId) { if(wrap) wrap.innerHTML=""; return; }
  const activeOffers = state.offers.filter(o=>o.active);
  if(!activeOffers.length){ wrap.innerHTML=""; return; }
  const garments = readGarmentFields();
  wrap.innerHTML = `<div class="stitch"></div><label style="font-size:12px;color:var(--muted);">باقات العروض المتاحة (اختر واحدة بحد أقصى — ما يمكن الجمع بين عرضين)</label>` +
    activeOffers.map(o=>{
      const eligible = checkOfferEligibility(garments, o);
      const checked = selectedOfferIds.includes(o.id);
      return `<div class="embro-toggle" style="margin:6px 0;">
        <input type="radio" name="offer-select-radio" class="offer-select" data-offer="${o.id}" ${checked?"checked":""} ${!eligible?"disabled":""}>
        <label style="margin:0;font-size:13px;${!eligible?"color:var(--muted);":""}">${esc(o.name)} ${eligible?"ينطبق":"— ما ينطبق حالياً"}</label>
      </div>`;
    }).join("") + (selectedOfferIds.length ? `<button type="button" class="btn btn-ghost btn-sm" id="clearSelectedOfferBtn" style="margin-top:4px;">إلغاء اختيار العرض</button>` : "");
  document.querySelectorAll(".offer-select").forEach(cb=> cb.addEventListener("change", ()=>{
    if(cb.checked){ selectedOfferIds = [cb.dataset.offer]; resetGarmentPricesToBase(); }
    renderInvoiceOffersSelector(); updatePriceFieldsLockState(); updateLiveTotals();
  }));
  const clearBtn = $("clearSelectedOfferBtn");
  if(clearBtn) clearBtn.addEventListener("click", ()=>{ selectedOfferIds = []; renderInvoiceOffersSelector(); updatePriceFieldsLockState(); updateLiveTotals(); });
  updatePriceFieldsLockState();
}

// ---------------- payments (form-local list before save) ----------------
let paymentsListTemp = [];
function renderPaymentsList(){
  const el = $("paymentsList");
  if(paymentsListTemp.length===0){ el.innerHTML = `<p class="sub">ما فيه دفعات مسجّلة بعد.</p>`; }
  else {
    el.innerHTML = paymentsListTemp.map((p,i)=>`<div class="payment-row">
      <span>كاش: ${p.cash.toFixed(0)} ﷼${p.cashReceiptNo?` (سند ${p.cashReceiptNo})`:""}</span><span>شبكة: ${p.network.toFixed(0)} ﷼${p.networkReceiptNo?` (سند ${p.networkReceiptNo})`:""}</span>
      ${p.discount?`<span>خصم: ${p.discount.toFixed(0)} ﷼</span>`:""}
      <span style="color:var(--muted)">${p.date}</span>
      <button class="icon-btn" onclick="removePaymentTemp(${i})">حذف</button></div>`).join("");
  }
  updateLiveTotals();
}
function removePaymentTemp(i){ paymentsListTemp.splice(i,1); renderPaymentsList(); }
function addPaymentTemp(){
  const cash = parseFloat($("newPayCash").value)||0;
  const network = parseFloat($("newPayNetwork").value)||0;
  const networkReceiptNo = $("newPayReceipt").value.trim();
  if(cash<=0 && network<=0){ showToast("أدخل مبلغ كاش أو شبكة"); return; }
  if(network>0 && !networkReceiptNo){ showToast("أدخل رقم سند الشبكة"); return; }
  const cashReceiptNo = cash>0 ? nextVoucherNo() : null;
  paymentsListTemp.push({id:newId(), date:todayStr(), cash, network, cashReceiptNo, networkReceiptNo});
  $("newPayCash").value=""; $("newPayNetwork").value=""; $("newPayReceipt").value="";
  renderPaymentsList();
  if(cashReceiptNo) showToast(`تم إصدار سند كاش رقم ${cashReceiptNo} تلقائياً`);
}

// ---------------- form actions ----------------
function formatDateInput(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function computeExpectedDeliveryDate(newGarmentsCount){
  const tailors = state.users.filter(u=>u.role==="خياط" && (u.dailyCapacity||0)>0);
  const totalCapacity = tailors.reduce((a,t)=>a+(t.dailyCapacity||0),0);
  const d = serverDate();
  if(totalCapacity<=0){
    d.setDate(d.getDate() + (state.settings.defaultDeliveryDays||3));
    return d;
  }
  const pendingCount = state.invoices.reduce((a,inv)=> a + inv.garments.filter(g=>g.status!=="تسليم" && g.status!=="ملغي").length, 0);
  const totalToProcess = pendingCount + Math.max(1, newGarmentsCount||1);
  const daysNeeded = Math.max(1, Math.ceil(totalToProcess / totalCapacity));
  d.setDate(d.getDate() + daysNeeded);
  return d;
}
function resetForm(){
  editingId=null; paymentsListTemp=[]; selectedOfferIds=[]; appliedPromoCode=null;
  $("formTitle").textContent="فاتورة جديدة";
  $("invNumber").value = state.settings.nextInvoiceNumber;
  $("invDate").value = todayStr();
  $("invCount").value=1;
  $("invDeliveryDate").value = formatDateInput(computeExpectedDeliveryDate(1));
  $("custName").value=""; $("custMobile").value=""; $("custPickerWrap").style.display="none"; $("custPickerWrap").innerHTML=""; $("loyaltyInfoWrap").style.display="none"; $("loyaltyInfoWrap").innerHTML=""; $("customerAlertWrap").style.display="none"; $("customerAlertWrap").innerHTML=""; $("invNotes").value=""; $("promoCodeInput").value=""; $("directDiscountInput").value="";
  renderGarmentFields(); renderPaymentsList(); updateLiveTotals();
}
function editInvoice(id){
  if(!currentUser || currentUser.role!=="مدير"){ showToast("تعديل الفواتير متاح للمدير فقط"); return; }
  const inv = state.invoices.find(i=>i.id===id); if(!inv) return;
  if(isMonthClosed(inv.originMonth)){ showToast("هذا الشهر مقفول — ما يمكن التعديل"); return; }
  switchTab("invoice");
  editingId=id; paymentsListTemp = JSON.parse(JSON.stringify(inv.payments||[]));
  $("formTitle").textContent="تعديل الفاتورة: "+inv.number;
  $("invNumber").value=inv.number; $("invDate").value=inv.date; $("invCount").value=inv.garments.length;
  $("invDeliveryDate").value = inv.expectedDeliveryDate || "";
  $("custName").value=inv.customerName||""; $("custMobile").value=inv.customerMobile||"";
  $("invNotes").value=inv.notes||"";
  renderGarmentFields(inv.garments); renderPaymentsList();
  window.scrollTo({top:$("formTitle").getBoundingClientRect().top+window.scrollY-20, behavior:"smooth"});
}
async function createInvoiceReturn(invId){
  const inv = state.invoices.find(i=>i.id===invId);
  if(!inv) return;
  if(currentUser.role!=="مدير"){ showToast("تسجيل المرتجعات متاح للمدير فقط"); return; }
  switchTab("report-returns");
  setTimeout(()=>{
    $("returnInvNumber").value = inv.number;
    $("returnReason").value=""; $("returnAmount").value="";
    $("returnInvNumber").scrollIntoView({behavior:"smooth", block:"center"});
  }, 150);
}
function renderReturnResponsibleSelect(){
  const hidden = $("returnResponsible");
  if(!hidden) return;
  const current = hidden.value;
  const employees = state.users.filter(u=>u.role!=="مدير");
  $("returnResponsibleDatalist").innerHTML = employees.map(u=>`<option value="${esc(u.username)}"></option>`).join("");
  if(current){ const u = employees.find(x=>x.username===current); if(u) $("returnResponsibleSearch").value = u.username; }
}
// cancels every not-yet-delivered garment on the invoice (reversing stock, fabric and advisory
// credits) and records the return — shared by the returns screen and a manager's decision on an
// employee-filed defect request, so both leave the invoice, stock and reports in the same state.
// Moving the refund out of a cash box is the caller's job.
function applyInvoiceReturn(inv, {reason, refundAmount, boxId, responsibleUsername, loyaltyNote}){
  // fabric already CUT (not just reserved) is a real loss, not a stock credit
  let lostCost = 0;
  const wasCut = [];
  const wageClawbacks = [];
  inv.garments.forEach(g=>{
    if(g.status==="تسليم" || g.status==="ملغي") return; // already handled / no inventory impact
    if(g.stockApplied==="consumed"){
      lostCost += computeCostSnapshot(g, currentFixedShare());
      wasCut.push(g.fabricType);
    }
    // avoid double-deduction: only auto-claw back an already-paid tailor wage when NO responsible party is being sent to the manager for a decision — a manager decision (any type) is considered to already handle this
    if(g.wagePaidOut && !responsibleUsername && g.tailor){
      const wage = tailorWageFor(g);
      if(wage>0.01){
        addPayrollEntry(g.tailor, "deduction", wage, null, `استرداد أجرة تفصيل ثوب — فاتورة #${inv.number} انترجعت بعد صرف الأجرة`);
        wageClawbacks.push(`${g.tailor}: ${wage.toFixed(0)} ﷼`);
      }
      g.wagePaidOut = false;
    }
    reverseGarmentAdvisory(g); returnFabricForGarment(g); reverseAddonsStock(g);
    g.status = "ملغي"; g.cancelledDate = todayStr();
  });
  state.invoiceReturns.push({id:newId(), invoiceId:inv.id, invoiceNumber:inv.number, reason, refundAmount, boxId, lostCost, date:todayStr(), recordedBy:currentUser.username});
  reverseInvoiceLoyaltyIfNeeded(inv, loyaltyNote);
  return {lostCost, wasCut, wageClawbacks};
}
async function submitInvoiceReturn(){
  const num = $("returnInvNumber").value.trim();
  const inv = state.invoices.find(i=>i.number===num);
  if(!inv){ showToast("ما فيه فاتورة بهذا الرقم"); return; }
  const reason = $("returnReason").value.trim();
  const refundAmount = parseFloat($("returnAmount").value)||0;
  const boxId = $("returnSourceBox").value;
  if(!reason){ showToast("أدخل سبب المرتجع"); return; }
  // a second return on the same invoice would refund the customer again
  if(state.invoiceReturns.some(r=>r.invoiceId===inv.id)){ showToast(`الفاتورة ${num} مسجّل لها مرتجع مسبقاً — ما يمكن ترجيعها مرة ثانية`); return; }
  const refundable = invoicePaid(inv) - invoiceRefunded(inv);
  if(refundAmount - refundable > 0.01){ showToast(`المبلغ المرتجع أكبر من اللي دفعه العميل فعلياً (${refundable.toFixed(0)} ريال)`); return; }
  const responsibleUsername = $("returnResponsible").value;
  const pendingRequest = responsibleUsername && state.mailRequests.find(m=>m.type==="invoice_return_defect" && m.invoiceId===inv.id && m.status==="pending");
  const preReturnSaleTotal = invoiceSaleTotal(inv);
  let refundBox = null;
  if(refundAmount>0){
    if(!boxId){ showToast("اختر الصندوق اللي يخصم منه المبلغ المرتجع"); return; }
    refundBox = state.cashBoxes.find(b=>b.id===boxId);
    if(!refundBox){ showToast("الصندوق المختار غير موجود"); return; }
    if(boxTotal(refundBox) < refundAmount){ showToast(`رصيد الصندوق (${boxTotal(refundBox).toFixed(0)} ريال) أقل من المبلغ المرتجع`); return; }
  }
  const returnSnapshot = JSON.parse(JSON.stringify(state));
  if(refundBox) refundBox.balance -= refundAmount;
  const {lostCost, wasCut, wageClawbacks} = applyInvoiceReturn(inv, {reason, refundAmount, boxId, responsibleUsername, loyaltyNote:"مرتجع فاتورة"});
  let requestMsg = "";
  if(pendingRequest){
    requestMsg = ` — فيه طلب قرار مسؤولية مفتوح مسبقاً لهذي الفاتورة (طلب #${pendingRequest.seq}) بشاشة البريد`;
  } else if(responsibleUsername){
    const amount = preReturnSaleTotal;
    // returnRecorded: the refund and cancellation are done right here, so the manager's decision
    // must only settle who bears it — never refund the customer a second time
    state.mailRequests.push({id:Date.now()+"-ret", seq:nextMailRequestNo(), type:"invoice_return_defect", invoiceId:inv.id, invoiceNumber:inv.number, amount, responsibleUsername, reason, status:"pending", createdBy:currentUser.username, date:todayStr(), returnRecorded:true});
    requestMsg = ` — تم فتح طلب قرار مسؤولية تلقائياً لـ${responsibleUsername} بشاشة البريد`;
  }
  if(wageClawbacks.length) requestMsg += ` — تم استرداد أجرة مصروفة مسبقاً: ${wageClawbacks.join("، ")}`;
  if(!await saveStateWithRollback(returnSnapshot)) return;
  logAudit("invoice_returned", {invoiceNumber:num, reason, refundAmount, lostCost, responsibleUsername: responsibleUsername||null});
  $("returnInvNumber").value=""; $("returnReason").value=""; $("returnAmount").value=""; $("returnResponsible").value=""; $("returnResponsibleSearch").value="";
  showToast((lostCost>0 ? `تم تسجيل المرتجع — خسارة قماش/تصنيع مقصوص فعلياً: ${lostCost.toFixed(0)} ريال (${wasCut.join("، ")})` : "تم تسجيل المرتجع") + requestMsg);
}
