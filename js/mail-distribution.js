// ---------------- mail / internal requests inbox ----------------
function nextMailRequestNo(){ const n=state.settings.nextMailRequestNumber||1; state.settings.nextMailRequestNumber=n+1; return n; }
function switchMailComposeForm(type){
  ["Return","Advance","Leave"].forEach(t=> $(`mailCompose${t}Form`).style.display = "none");
  if(type) $(`mailCompose${type}Form`).style.display = "";
}
function renderMailTab(){
  if(!currentUser) return;
  const tailorUsers = state.users.filter(u=>u.role!=="مدير");
  const respSel = $("mailReturnResponsible");
  if(respSel){ $("mailReturnResponsibleDatalist").innerHTML = tailorUsers.map(u=>`<option value="${esc(u.username)}"></option>`).join(""); }
  const advSel = $("mailAdvanceEmployee");
  if(advSel){ $("mailAdvanceEmployeeDatalist").innerHTML = state.users.map(u=>`<option value="${esc(u.username)}"></option>`).join(""); if(!advSel.value) { advSel.value = currentUser.username; $("mailAdvanceEmployeeSearch").value = currentUser.username; } }

  const isAdmin = currentUser.role==="مدير";
  $("mailAdminToolsWrap").style.display = isAdmin ? "" : "none";
  if(isAdmin){
    $("bonusEmployeeDatalist").innerHTML = state.users.filter(u=>u.role!=="مدير").map(u=>`<option value="${esc(u.username)}"></option>`).join("");
  }

  // personal notifications: decisions addressed to me, regardless of who filed the underlying request
  const myNotifications = state.decisions.filter(d=>d.recipientUsername===currentUser.username).slice().reverse();
  $("myNotificationsList").innerHTML = myNotifications.length ? myNotifications.map(d=>`<div class="item-row" style="flex-direction:column;align-items:stretch;"><b>قرار رقم ${d.seq}</b><span class="sub">${esc(d.message)} — ${d.date}</span></div>`).join("") : `<p class="sub">ما فيه إشعارات لك.</p>`;

  const all = state.mailRequests.slice().reverse();
  const pending = all.filter(r=>r.status==="pending" && (isAdmin || r.createdBy===currentUser.username));
  const resolved = all.filter(r=>r.status==="decided" && (isAdmin || r.createdBy===currentUser.username)).slice(0,30);

  const typeLabel = t=> t==="invoice_return_defect"?"فاتورة مرتجعة (خلل)" : t==="advance"?"طلب سلفة" : "طلب إجازة";
  const detailLine = r=>{
    if(r.type==="invoice_return_defect") return `فاتورة ${esc(r.invoiceNumber)} — ${r.amount.toFixed(0)} ﷼ — المتسبّب: ${esc(r.responsibleUsername)} — السبب: ${esc(r.reason)}`;
    if(r.type==="advance") return `${esc(r.employeeUsername)} — ${r.amount.toFixed(0)} ﷼ — ${esc(r.reason||"—")}`;
    if(r.type==="leave") return `${esc(r.employeeUsername)} — من ${r.fromDate} إلى ${r.toDate} — ${esc(r.reason||"—")}`;
    return "—";
  };

  $("mailPendingList").innerHTML = pending.length ? pending.map(r=>{
    let actions = "";
    if(isAdmin){
      if(r.type==="invoice_return_defect") actions = `<button class="btn btn-gold btn-sm" onclick="openMailDecisionModal('${r.id}')">اتخاذ قرار</button>`;
      else actions = `<button class="btn btn-gold btn-sm" onclick="decideSimpleMailRequest('${r.id}', true)">موافقة</button> <button class="btn btn-danger btn-sm" onclick="decideSimpleMailRequest('${r.id}', false)">رفض</button>`;
    } else {
      actions = `<span class="badge b-pending">قيد الانتظار</span>`;
    }
    return `<div class="item-row" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:flex;justify-content:space-between;"><b>${typeLabel(r.type)}</b><span class="sub">${r.date}</span></div>
      <div class="sub">${detailLine(r)}</div>
      <div style="display:flex;gap:6px;">${actions}</div>
    </div>`;
  }).join("") : `<p class="sub">ما فيه طلبات قيد الانتظار.</p>`;

  $("mailResolvedList").innerHTML = resolved.length ? `<div class="table-wrap"><table><thead><tr><th>النوع</th><th>التفاصيل</th><th>القرار</th><th>التاريخ</th></tr></thead><tbody>` +
    resolved.map(r=>`<tr><td>${typeLabel(r.type)}</td><td>${detailLine(r)}</td><td>${esc(r.decisionLabel||"—")}</td><td>${r.decidedAt||r.date}</td></tr>`).join("") +
    `</tbody></table></div>` : `<p class="sub">ما فيه طلبات منتهية بعد.</p>`;

  const pendingCountForAdmin = state.mailRequests.filter(r=>r.status==="pending").length;
  const badge = $("mailBadge");
  if(badge){
    if(isAdmin && pendingCountForAdmin>0){ badge.style.display=""; badge.textContent = pendingCountForAdmin>9?"9+":pendingCountForAdmin; }
    else badge.style.display = "none";
  }
}
function submitMailReturnRequest(){
  const invoiceNumber = $("mailReturnInvNumber").value.trim();
  const inv = state.invoices.find(i=>i.number===invoiceNumber);
  if(!inv){ showToast("ما فيه فاتورة بهذا الرقم"); return; }
  const responsibleUsername = $("mailReturnResponsible").value;
  const reason = $("mailReturnReason").value.trim();
  if(!responsibleUsername){ showToast("اختر الموظف المتسبّب من الاقتراحات"); return; }
  if(!reason){ showToast("أدخل سبب الخلل"); return; }
  if(state.mailRequests.some(m=>m.type==="invoice_return_defect" && m.invoiceId===inv.id && m.status==="pending")){ showToast(`فيه طلب مفتوح مسبقاً لفاتورة ${invoiceNumber} بانتظار قرار المدير`); return; }
  const amount = invoiceSaleTotal(inv);
  state.mailRequests.push({id:newId(), seq:nextMailRequestNo(), type:"invoice_return_defect", invoiceId:inv.id, invoiceNumber:inv.number, amount, responsibleUsername, reason, status:"pending", createdBy:currentUser.username, date:todayStr()});
  saveState(); renderAll();
  $("mailReturnInvNumber").value=""; $("mailReturnReason").value=""; switchMailComposeForm(null);
  showToast("تم إرسال الطلب للمدير");
}
function submitMailAdvanceRequest(){
  const employeeUsername = $("mailAdvanceEmployee").value;
  const amount = parseFloat($("mailAdvanceAmount").value)||0;
  const reason = $("mailAdvanceReason").value.trim();
  if(amount<=0){ showToast("أدخل مبلغ صحيح"); return; }
  const eligibility = advanceEligibility(employeeUsername);
  if(!eligibility.ok){ showToast(eligibility.msg); return; }
  if(amount - eligibility.balance > 0.01){ showToast(`المبلغ أكبر من الرصيد المستحق (${eligibility.balance.toFixed(0)} ريال)`); return; }
  state.mailRequests.push({id:newId(), seq:nextMailRequestNo(), type:"advance", employeeUsername, amount, reason, status:"pending", createdBy:currentUser.username, date:todayStr()});
  saveState(); renderAll();
  $("mailAdvanceAmount").value=""; $("mailAdvanceReason").value=""; switchMailComposeForm(null);
  showToast("تم إرسال طلب السلفة للمدير");
}
function submitMailLeaveRequest(){
  const fromDate = $("mailLeaveFrom").value;
  const toDate = $("mailLeaveTo").value;
  const reason = $("mailLeaveReason").value.trim();
  if(!fromDate || !toDate){ showToast("حدد تاريخ البداية والنهاية"); return; }
  if(toDate < fromDate){ showToast("تاريخ النهاية قبل البداية؟"); return; }
  state.mailRequests.push({id:newId(), seq:nextMailRequestNo(), type:"leave", employeeUsername:currentUser.username, fromDate, toDate, reason, status:"pending", createdBy:currentUser.username, date:todayStr()});
  saveState(); renderAll();
  $("mailLeaveFrom").value=""; $("mailLeaveTo").value=""; $("mailLeaveReason").value=""; switchMailComposeForm(null);
  showToast("تم إرسال طلب الإجازة للمدير");
}
async function decideSimpleMailRequest(reqId, approved){
  const r = state.mailRequests.find(x=>x.id===reqId);
  if(!r) return;
  if(r.status!=="pending"){ showToast("هذا الطلب تم البت فيه مسبقاً"); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  if(r.type==="advance" && approved){
    const boxId = userBoxes(currentUser.username)[0]?.id;
    if(!boxId){ showToast("ما فيه صندوق متاح لك لصرف السلفة منه"); return; }
    const result = addPayrollEntry(r.employeeUsername, "advance", r.amount, boxId, `سلفة معتمدة عبر البريد — طلب #${r.seq}${r.reason?" — "+r.reason:""}`);
    if(!result.ok){ showToast(result.msg); return; }
  }
  r.status = "decided"; r.decidedBy = currentUser.username; r.decidedAt = todayStr();
  r.decisionLabel = approved ? "تمت الموافقة" : "مرفوض";
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("mail_request_decided", {type:r.type, seq:r.seq, approved, employeeUsername:r.employeeUsername, amount:r.amount||0});
  showToast(approved ? "تمت الموافقة على الطلب" : "تم رفض الطلب");
}
let mailDecisionTargetId = null;
function openMailDecisionModal(reqId){
  const r = state.mailRequests.find(x=>x.id===reqId);
  if(!r) return;
  mailDecisionTargetId = reqId;
  const alreadyReturned = state.invoiceReturns.some(x=>x.invoiceId===r.invoiceId);
  $("mailDecisionSummary").textContent = `فاتورة ${r.invoiceNumber} — مبلغ ${r.amount.toFixed(0)} ريال — المتسبّب: ${r.responsibleUsername}` + (alreadyReturned ? " — المرتجع واسترداد العميل مسجّلين مسبقاً، القرار يحدد التحميل فقط" : "");
  $("mailDecisionBoxWrap").style.display = alreadyReturned ? "none" : "";
  $("mailDecisionBox").innerHTML = userBoxes(currentUser.username).map(b=>`<option value="${b.id}">${esc(b.name)} (${typeLabel(b.type)})</option>`).join("");
  $("mailDecisionChoice").value = "full";
  $("mailDecisionPartialWrap").style.display = "none";
  $("mailDecisionPartialAmount").value = "";
  $("mailDecisionModalOverlay").classList.remove("hidden");
}
function closeMailDecisionModal(){ $("mailDecisionModalOverlay").classList.add("hidden"); mailDecisionTargetId=null; }
function nextDecisionNo(){ const n=state.settings.nextDecisionNumber||1; state.settings.nextDecisionNumber=n+1; return n; }
async function confirmMailDecision(){
  const r = state.mailRequests.find(x=>x.id===mailDecisionTargetId);
  if(!r) return;
  if(r.status!=="pending"){ showToast("هذا الطلب تم البت فيه مسبقاً"); closeMailDecisionModal(); return; }
  const choice = $("mailDecisionChoice").value;
  if(choice==="reject"){
    const rejectSnapshot = JSON.parse(JSON.stringify(state));
    const seq = nextDecisionNo();
    const message = `تم رفض طلب الترجيع الخاص بفاتورة #${r.invoiceNumber} — لن يتم استرداد أي مبلغ ولا خصم عليك.`;
    state.decisions.push({id:newId(), seq, type:"return_defect", recipientUsername:r.responsibleUsername, amount:0, reason:r.reason, message, decidedBy:currentUser.username, date:todayStr()});
    r.status="decided"; r.decidedBy=currentUser.username; r.decidedAt=todayStr(); r.decisionLabel=`قرار رقم ${seq} — رفض الترجيع، بدون أي خصم من أي صندوق`;
    if(!await saveStateWithRollback(rejectSnapshot)) return;
    logAudit("mail_decision_resolved", {seq, choice:"reject", invoiceNumber:r.invoiceNumber, responsibleUsername:r.responsibleUsername});
    closeMailDecisionModal();
    showToast(`تم رفض الترجيع رقم ${seq} — ما انخصم أي مبلغ`);
    return;
  }
  const inv = state.invoices.find(i=>i.id===r.invoiceId);
  // when the return was already recorded (from the returns screen) the customer was refunded and
  // the garments cancelled there, so this decision only settles who bears it: no second refund and
  // no second return record
  const alreadyReturned = state.invoiceReturns.some(x=>x.invoiceId===r.invoiceId);
  // cancelled garments drop out of revenue on their own, so the shop's share is booked as an
  // "operational loss" only when the return leaves the garments standing (already delivered) —
  // booking it on top of a cancellation counted the same money twice
  const revenueReversedByCancel = !!inv && inv.garments.some(g=> g.status==="ملغي" || (!alreadyReturned && g.status!=="تسليم"));
  // otherwise the customer gets back what they actually paid, never more
  const refundDue = alreadyReturned || !inv ? 0 : Math.max(0, Math.min(r.amount, invoicePaid(inv) - invoiceRefunded(inv)));
  const boxId = alreadyReturned ? "" : $("mailDecisionBox").value;
  const box = alreadyReturned ? null : findCashBox(boxId);
  if(!alreadyReturned && !box){ showToast("اختر الصندوق"); return; }
  if(box && boxTotal(box) < refundDue){ showToast(`رصيد الصندوق (${boxTotal(box).toFixed(0)} ريال) أقل من مبلغ الاسترداد`); return; }
  // validate the partial-amount input BEFORE any mutation below — this used to run after the
  // refund was already deducted from the box, so an invalid amount here left that deduction
  // applied with no ledger entry to explain it (and applied a second time on a valid retry)
  let partialAmount = 0;
  if(choice==="partial"){
    partialAmount = parseFloat($("mailDecisionPartialAmount").value)||0;
    if(partialAmount<0 || partialAmount>r.amount){ showToast(`أدخل مبلغ صحيح بين 0 و${r.amount.toFixed(0)} ريال`); return; }
  }
  const decisionSnapshot = JSON.parse(JSON.stringify(state));
  // 1) refund the customer
  if(box) box.balance -= refundDue;
  let decisionLabel = "", deductedAmount = 0;
  const seq = nextDecisionNo();
  if(choice==="full"){
    addPayrollEntry(r.responsibleUsername, "deduction", r.amount, null, `خصم كامل مبلغ فاتورة مرتجعة #${inv?inv.number:r.invoiceNumber} بسبب خلل — طلب بريد #${r.seq}`);
    deductedAmount = r.amount;
    decisionLabel = `خصم كامل المبلغ (${r.amount.toFixed(0)} ﷼) من ${r.responsibleUsername}`;
  } else if(choice==="cost_only"){
    const costTotal = inv ? invoiceRecognizedCostToDate(inv) : 0;
    addPayrollEntry(r.responsibleUsername, "deduction", costTotal, null, `خصم التكاليف المباشرة فقط فاتورة مرتجعة #${inv?inv.number:r.invoiceNumber} بسبب خلل — طلب بريد #${r.seq}`);
    deductedAmount = costTotal;
    decisionLabel = `خصم التكاليف المباشرة فقط (${costTotal.toFixed(0)} ﷼) من ${r.responsibleUsername}`;
  } else if(choice==="partial"){
    if(partialAmount>0) addPayrollEntry(r.responsibleUsername, "deduction", partialAmount, null, `خصم جزئي فاتورة مرتجعة #${inv?inv.number:r.invoiceNumber} بسبب خلل — طلب بريد #${r.seq}`);
    deductedAmount = partialAmount;
    const shopShare = r.amount - partialAmount;
    if(shopShare>0.01 && !revenueReversedByCancel){
      state.operationalLosses.push({id:newId(), date:todayStr(), amount:shopShare, invoiceNumber:r.invoiceNumber, reason:`فرق قرار جزئي #${seq} — ${r.reason}`});
    }
    decisionLabel = `خصم جزئي (${partialAmount.toFixed(0)} ﷼) من ${r.responsibleUsername} — والمحل يتحمّل الباقي (${shopShare.toFixed(0)} ﷼)`;
  } else {
    if(!revenueReversedByCancel) state.operationalLosses.push({id:newId(), date:todayStr(), amount:r.amount, invoiceNumber:r.invoiceNumber, reason:`تجاوز كامل — ${r.reason}`});
    decisionLabel = `تحمّلها المحل بالكامل (تجاوز) — بدون خصم على ${r.responsibleUsername}`;
  }
  // 2) an employee-filed request: record the return itself now, exactly as the returns screen does
  // (cancel the garments, reverse stock/loyalty) — the invoice used to stay open, still showing the
  // customer as owing its full price after they'd been refunded
  if(!alreadyReturned && inv){
    applyInvoiceReturn(inv, {reason:`خلل موظف: ${r.reason}`, refundAmount:refundDue, boxId, responsibleUsername:r.responsibleUsername, loyaltyNote:"مرتجع بسبب خلل موظف"});
  }
  const message = deductedAmount>0
    ? `تم إصدار قرار رقم ${seq} بخصم مبلغ ${deductedAmount.toFixed(0)} ريال بحقك بسبب: ${r.reason}`
    : `تم إصدار قرار رقم ${seq} بخصوص فاتورة مرتجعة بسببك (${r.reason}) — قرر المدير تحمّل المحل للمبلغ، بدون خصم عليك.`;
  state.decisions.push({id:newId(), seq, type:"return_defect", recipientUsername:r.responsibleUsername, amount:deductedAmount, reason:r.reason, message, decidedBy:currentUser.username, date:todayStr()});
  r.status="decided"; r.decidedBy=currentUser.username; r.decidedAt=todayStr(); r.decisionLabel=`قرار رقم ${seq} — ${decisionLabel}`;
  if(!await saveStateWithRollback(decisionSnapshot)) return;
  logAudit("mail_decision_resolved", {seq, choice, invoiceNumber:r.invoiceNumber, responsibleUsername:r.responsibleUsername, refundAmount:refundDue, deductedAmount});
  closeMailDecisionModal();
  showToast(`تم تنفيذ القرار رقم ${seq} مالياً`);
}
async function submitBonusOrDeduction(){
  const username = $("bonusEmployee").value;
  const type = $("bonusType").value;
  const amount = parseFloat($("bonusAmount").value)||0;
  const reason = $("bonusReason").value.trim();
  if(amount<=0){ showToast("أدخل مبلغ صحيح"); return; }
  if(!reason){ showToast("أدخل السبب"); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  const result = addPayrollEntry(username, type, amount, null, reason);
  if(!result.ok){ showToast(result.msg); return; }
  const seq = nextDecisionNo();
  const message = type==="bonus"
    ? `تم إصدار قرار رقم ${seq} — تمت مكافأتك بمبلغ ${amount.toFixed(0)} ريال نظير: ${reason}`
    : `تم إصدار قرار رقم ${seq} بخصم مبلغ ${amount.toFixed(0)} ريال بحقك بسبب: ${reason}`;
  state.decisions.push({id:newId(), seq, type, recipientUsername:username, amount, reason, message, decidedBy:currentUser.username, date:todayStr()});
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("bonus_or_deduction", {seq, type, username, amount, reason});
  $("bonusAmount").value=""; $("bonusReason").value="";
  showToast(`تم تنفيذ القرار رقم ${seq}`);
}
function renderReturnsLog(){
  const el = $("returnsLogView");
  if(!el || !currentUser) return;
  $("returnSourceBox").innerHTML = `<option value="">-- بدون خصم مالي --</option>` + userBoxes(currentUser.username).map(b=>`<option value="${b.id}">${b.name} (${typeLabel(b.type)})</option>`).join("");
  const returns = state.invoiceReturns.slice().reverse();
  const deleted = state.deletedInvoicesLog.slice().reverse();
  let html = `<h4 style="margin:0 0 8px;font-size:14px;">سجل المرتجعات (${returns.length})</h4>`;
  html += returns.length ? `<div class="table-wrap"><table><thead><tr><th>الفاتورة</th><th>السبب</th><th>المبلغ المرتجع</th><th>خسارة قماش/تصنيع</th><th>التاريخ</th><th>بواسطة</th></tr></thead><tbody>` +
    returns.map(r=>`<tr><td>${r.invoiceNumber}</td><td>${esc(r.reason)}</td><td>${r.refundAmount?r.refundAmount.toFixed(0)+" ﷼":"—"}</td><td>${r.lostCost?`<span style="color:var(--loss);">${r.lostCost.toFixed(0)} ﷼</span>`:"—"}</td><td>${r.date}</td><td>${r.recordedBy}</td></tr>`).join("") +
    `</tbody></table></div>` : `<p class="sub">ما فيه مرتجعات مسجّلة بعد.</p>`;
  html += `<div class="stitch"></div><h4 style="margin:0 0 8px;font-size:14px;">سجل الفواتير المحذوفة (${deleted.length})</h4>`;
  html += deleted.length ? `<div class="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الإجمالي</th><th>تاريخ الحذف</th><th>بواسطة</th></tr></thead><tbody>` +
    deleted.map(d=>`<tr><td>${esc(d.invoiceSnapshot.number)}</td><td>${esc(d.invoiceSnapshot.customerName||"—")}</td><td>${invoiceSaleTotal(d.invoiceSnapshot).toFixed(0)} ﷼</td><td>${new Date(d.deletedAt).toLocaleString("ar-SA")}</td><td>${d.deletedBy}</td></tr>`).join("") +
    `</tbody></table></div>` : `<p class="sub">ما فيه فواتير محذوفة.</p>`;
  el.innerHTML = html;
}
async function saveInvoice(){
  const isNewInvoice = !editingId;
  // the number box is read-only and auto-filled; take the live counter for a new invoice so a number
  // another device used after this form was opened isn't reused (it'd be rejected as a duplicate)
  if(isNewInvoice) $("invNumber").value = state.settings.nextInvoiceNumber;
  const number = $("invNumber").value.trim();
  if(!number){ showToast("أدخل رقم الفاتورة"); return; }
  const duplicateInv = state.invoices.find(i=>i.number===number && i.id!==editingId);
  if(duplicateInv){ showToast(`رقم الفاتورة ${number} مستخدم مسبقاً (فاتورة العميل: ${duplicateInv.customerName||"—"}) — اختر رقم ثاني`); return; }
  const date = $("invDate").value || todayStr();
  if(!date){ showToast("أدخل تاريخ الفاتورة"); return; }
  const custName = $("custName").value.trim();
  const custMobile = $("custMobile").value.trim();
  if(!custName){ showToast("أدخل اسم العميل"); return; }
  if(!custMobile){ showToast("أدخل رقم جوال العميل"); return; }
  if(!/^[0-9]{10}$/.test(custMobile)){ showToast("رقم الجوال لازم يكون 10 أرقام بالضبط"); return; }
  const garmentCards = Array.from($("garmentsHolder").children);
  for(let i=0;i<garmentCards.length;i++){
    const rawVal = garmentCards[i].querySelector(".g-itemCard").value;
    if(!rawVal){ showToast(`اختر القماش لثوب ${i+1} من المخزون (أو اختر "أجرة تفصيل بدون قماش" صراحة) قبل الحفظ`); return; }
    if(rawVal!=="__none__" && !findItemCard(rawVal)){ showToast(`القماش المحدد لثوب ${i+1} غير موجود بالمخزون — اختر قماشاً حقيقياً من القائمة`); return; }
  }
  const redeemInp = $("loyaltyRedeemInput");
  const pointsToRedeem = (redeemInp && isNewInvoice) ? (parseInt(redeemInp.value)||0) : 0;
  if(pointsToRedeem>0){
    const cust = findCustomerByMobile(custMobile);
    if(!cust || cust.vip){ showToast("لا يمكن استخدام نقاط لهذا العميل"); return; }
    if(pointsToRedeem < (state.settings.loyaltyMinRedeem||0)){ showToast(`الحد الأدنى لاستخدام النقاط: ${state.settings.loyaltyMinRedeem} نقطة`); return; }
    if(pointsToRedeem > (cust.loyaltyPoints||0)){ showToast(`رصيد النقاط غير كافٍ (المتاح ${cust.loyaltyPoints} نقطة)`); return; }
  }
  const pendingCash = parseFloat($("newPayCash").value)||0;
  const pendingNetwork = parseFloat($("newPayNetwork").value)||0;
  if(pendingCash>0 || pendingNetwork>0){ showToast("فيه دفعة لم تُضف بعد — اضغط 'إضافة دفعة' أو فرّغ حقول الدفعة قبل الحفظ"); return; }
  const cards = Array.from($("garmentsHolder").children);
  if(!cards.length){ showToast("أضف ثوب واحد على الأقل"); return; }
  for(const [gi,card] of cards.entries()){
    const priceVal = card.querySelector(".g-price").value;
    if(!priceVal || parseFloat(priceVal)<=0){ showToast("أدخل سعر البيع لكل ثوب"); return; }
    const hasEmbro = card.querySelector(".g-hasEmbro").checked;
    if(hasEmbro){
      const embroVal = card.querySelector(".g-embroPrice").value;
      if(!embroVal || parseFloat(embroVal)<=0){ showToast("أدخل سعر التطريز للثوب المطرّز"); return; }
    }
    const itemCardIdRaw = card.querySelector(".g-itemCard").value;
    const itemCard = itemCardIdRaw!=="__none__" ? findItemCard(itemCardIdRaw) : null;
    const garmentCategory = card.querySelector(".g-category").value;
    const tailoringOnly = itemCardIdRaw==="__none__";
    const effectiveMinPrice = itemCard ? ((itemCard.minPrices && itemCard.minPrices[garmentCategory]) || 0)
      : tailoringOnly ? (((state.settings.tailoringOnly||{}).minPrices||{})[garmentCategory] || 0) : 0;
    // a VIP customer can be given any price by anyone — no minimum, no per-user discount limit
    if((itemCard || tailoringOnly) && effectiveMinPrice>0 && !isCustomerVip(custMobile)){
      const enteredPrice = parseFloat(priceVal)||0;
      if(enteredPrice < effectiveMinPrice){
        const shortfall = effectiveMinPrice - enteredPrice;
        if(!userDiscountEnabled(currentUser)){
          showToast(`سعر ثوب ${gi+1} أقل من الحد الأدنى (${effectiveMinPrice} ريال) — ما عندك صلاحية خصم`); return;
        }
        const maxAllowed = userMaxDiscountAmount(currentUser, effectiveMinPrice);
        if(shortfall - maxAllowed > 0.01){
          showToast(`سعر ثوب ${gi+1} أقل من حدّك المسموح — أقصى خصم لك ${maxAllowed.toFixed(0)} ريال، والفرق المطلوب ${shortfall.toFixed(0)} ريال`); return;
        }
      }
    }
  }
  // the same order entered twice (double submit, or two employees entering it) — same customer, same
  // day, same garments and prices as an invoice that already exists. Not blocked (a customer can
  // legitimately order the same again) but it must be a conscious choice.
  if(isNewInvoice){
    const newPrices = cards.map(c=>parseFloat(c.querySelector(".g-price").value)||0).sort((a,b)=>a-b).join(",");
    const twin = state.invoices.find(i=> i.customerMobile===custMobile && i.date===date &&
      i.garments.map(g=>g.price||0).sort((a,b)=>a-b).join(",")===newPrices);
    if(twin && !await showConfirm(`تنبيه ازدواجية: فيه فاتورة لنفس العميل اليوم بنفس الثياب والأسعار (فاتورة رقم ${twin.number}).\nمتأكد إنها طلب جديد مختلف وتبي تحفظها؟`)) return;
  }
  const originMonth = editingId ? state.invoices.find(i=>i.id===editingId).originMonth : date.slice(0,7);
  if(isMonthClosed(originMonth) && editingId){ showToast("هذا الشهر مقفول"); return; }
  // snapshot the whole state before any mutation below (advisory credits, fabric reservation,
  // loyalty points, cash box balances, the invoice itself...) so a failed cloud save can be
  // rolled back cleanly instead of leaving these applied only in this tab's memory
  const stateSnapshotBeforeSave = JSON.parse(JSON.stringify(state));
  const oldInv = editingId ? state.invoices.find(i=>i.id===editingId) : null;
  const garments = readGarmentFields(oldInv? oldInv.garments : null);
  inheritEmptyMeasurements(garments);
  // freeze cost snapshot for garments that don't yet have one, or recompute since still open
  const extraCount = garments.filter(g=>g.status!=="ملغي").length - (oldInv? oldInv.garments.filter(g=>g.status!=="ملغي").length:0);
  const fixedShare = currentFixedShare(Math.max(extraCount,0), originMonth);
  // freeze the addon sale total too (same reasoning as costSnapshot below, but for what the
  // customer is actually charged) — recomputed fresh on every save, including edits, so an edit
  // re-freezes at the addon prices in effect at the moment of that edit
  garments.forEach(g=>{ g.addonsSaleSnapshot = garmentAddonsInfo(g).reduce((sum,a)=> sum+addonUnitPrice(a), 0); });
  garments.forEach(g=>{ g.costSnapshot = computeCostSnapshot(g, fixedShare); });
  // advisory balances: reverse old garment credits (if editing), then re-apply fresh for current garments
  if(oldInv) oldInv.garments.forEach(g=>{ reverseGarmentAdvisory(g); returnFabricForGarment(g); reverseAddonsStock(g); });
  // the re-read garments carry over the OLD stock flags, but the lines above just reversed that
  // stock — clear the flags so it's re-applied below. Otherwise every edit released the fabric
  // reservation and handed the garments' physical addons (buttons...) back to stock for good.
  // Fabric already cut ("consumed") stays consumed: it was never given back above.
  if(oldInv) garments.forEach(g=>{ if(g.stockApplied==="reserved") g.stockApplied = null; g.addonsStockApplied = false; });
  garments.forEach(g=>{
    if(g.status!=="ملغي"){
      applyGarmentAdvisory(g);
      if(g.itemCardId) reserveFabricForGarment(g);
      applyAddonsStock(g);
    }
  });
  const appliedOffers = [];
  const freeGifts = [];
  if(isNewInvoice){
    selectedOfferIds.forEach(offerId=>{
      const offer = state.offers.find(o=>o.id===offerId && o.active);
      if(!offer) return;
      if(offer.type==="quantity_discount"){
        const idx = findCheapestMatchingGarment(garments, offer);
        if(idx!==null){
          const g = garments[idx];
          const discountAmt = garmentSalePrice(g)*offer.discountPercent/100;
          g.price = Math.max(0, g.price - discountAmt);
          appliedOffers.push(`${offer.name} (خصم ${offer.discountPercent}% على ثوب ${idx+1})`);
        }
      } else {
        if(garments.filter(g=>g.status!=="ملغي").length >= offer.minGarments){
          const giftCard = findItemCard(offer.giftItemCard);
          if(giftCard){
            giftCard.stockQty = (giftCard.stockQty||0) - offer.giftQty;
            freeGifts.push({itemCardId: giftCard.id, name: giftCard.name, qty: offer.giftQty, costAtSale: giftCard.currentCost||0});
            appliedOffers.push(`${offer.name} (هدية: ${offer.giftQty} × ${giftCard.name})`);
          }
        }
      }
    });
  }
  const activeGarmentsForDeposit = garments.filter(g=>g.status!=="ملغي");
  const allNoFabric = activeGarmentsForDeposit.length>0 && activeGarmentsForDeposit.every(g=>!g.itemCardId);
  if(isNewInvoice && state.settings.minDepositType!=="none" && !allNoFabric){
    const saleTotalCheck = garments.filter(g=>g.status!=="ملغي").reduce((a,g)=>a+garmentSalePrice(g),0);
    const paidCheck = paymentsListTemp.reduce((a,p)=>a+p.cash+p.network+(p.discount||0),0);
    const minRequired = state.settings.minDepositType==="percent" ? saleTotalCheck*(state.settings.minDepositValue||0)/100 : (state.settings.minDepositValue||0);
    if(minRequired>0 && paidCheck < minRequired - 0.01){
      showToast(`لازم تحصّل عربون لا يقل عن ${minRequired.toFixed(0)} ريال قبل حفظ الفاتورة (الحد الأدنى المحدد من الإعدادات)`);
      return;
    }
  }
  const invData = {
    id: editingId || (newId()),
    number, date, originMonth,
    customerName: custName, customerMobile: custMobile,
    payments: JSON.parse(JSON.stringify(paymentsListTemp)),
    garments,
    createdBy: oldInv ? oldInv.createdBy : currentUser.username,
    notes: $("invNotes").value.trim(),
    expectedDeliveryDate: $("invDeliveryDate").value || null,
    appliedOffers, freeGifts,
    loyaltyPointsEarned: oldInv ? (oldInv.loyaltyPointsEarned||0) : 0,
  };
  ensureCustomerIndividual(invData.customerMobile, invData.customerName);
  if(isNewInvoice){
    const vip = isCustomerVip(custMobile);
    const saleTotal = garments.filter(g=>g.status!=="ملغي").reduce((a,g)=>a+garmentSalePrice(g),0);
    if(!vip){
      const tier = customerTier(custMobile);
      const tierPct = tierAutoDiscountPercent(tier);
      if(tierPct>0){
        const tierDiscountAmt = saleTotal*tierPct/100;
        invData.payments.push({id:Date.now()+"-tier", date, cash:0, network:0, receipt:"", discount:tierDiscountAmt, auto:true, note:`خصم مستوى ${tierLabel(tier)}`});
      }
      if(pointsToRedeem>0){
        const redeemAmt = pointsToRedeem*(state.settings.loyaltyRedeemRate||1);
        invData.payments.push({id:Date.now()+"-pts", date, cash:0, network:0, receipt:"", discount:redeemAmt, auto:true, note:`استبدال ${pointsToRedeem} نقطة ولاء`});
        reverseLoyaltyPoints(custMobile, pointsToRedeem);
        state.loyaltyLedger.push({id:Date.now()+"-r", date, mobile:custMobile, type:"redeem", points:pointsToRedeem, invoiceNumber:number});
      }
      invData.loyaltyPointsEarned = appliedPromoCode ? 0 : earnLoyaltyPoints(custMobile, saleTotal);
      if(invData.loyaltyPointsEarned>0) state.loyaltyLedger.push({id:Date.now()+"-e", date, mobile:custMobile, type:"earn", points:invData.loyaltyPointsEarned, invoiceNumber:number});
    }
    // promo codes and the direct discount apply to every customer — VIPs are only kept out of the
    // loyalty program (tiers / points) above. This used to sit inside that VIP exclusion, so a VIP's
    // discount showed on screen and was silently dropped on save.
    if(appliedPromoCode){
      invData.promoCodeUsed = appliedPromoCode.code;
      if(appliedPromoCode.type!=="gift"){
        const promoDiscountAmt = currentPromoDiscountAmount(saleTotal);
        if(promoDiscountAmt>0.01) invData.payments.push({id:Date.now()+"-promo", date, cash:0, network:0, receipt:"", discount:promoDiscountAmt, auto:true, note:`كود خصم: ${appliedPromoCode.code}`});
      } else {
        invData.promoGiftDescription = appliedPromoCode.giftDescription;
      }
    }
    let directDiscountVal = parseFloat($("directDiscountInput")?.value)||0;
    if(directDiscountVal>0.01 && !vip){
      // re-check the per-user discount cap here too — the live UI clamps it on input, but that
      // must not be the only guard against a cashier saving more discount than they're allowed
      const alreadyDiscounted = invData.payments.reduce((a,p)=>a+(p.discount||0),0);
      const maxAllowed = userMaxDiscountAmount(currentUser, saleTotal);
      const remainingAllowance = Math.max(0, maxAllowed - alreadyDiscounted);
      if(directDiscountVal > remainingAllowance) directDiscountVal = remainingAllowance;
    }
    if(directDiscountVal>0.01){
      invData.payments.push({id:Date.now()+"-direct", date, cash:0, network:0, receipt:"", discount:directDiscountVal, auto:true, note:"خصم مباشر", recordedBy:currentUser.username});
    }
  }
  if(isNewInvoice && state.settings.einvoiceEnabled){
    invData.einvoice = await generateEinvoiceForNewInvoice(invData);
  }
  invData.payments.forEach(p=> applyPaymentToBalances(p));
  if(editingId){
    const idx = state.invoices.findIndex(i=>i.id===editingId);
    state.invoices[idx]=invData;
  } else {
    state.invoices.push(invData);
    state.settings.nextInvoiceNumber++;
  }
  if(!editingId && invData.customerMobile){
    $("printReceiptBanner").innerHTML = `<p class="sub" style="text-align:center;">جاري حفظ الفاتورة بالسحابة...</p>`;
    $("printReceiptBanner").style.display = "";
  }
  if(isNewInvoice && state.settings.waWelcomeEnabled && invData.customerMobile){
    const link = waLink(invData.customerMobile, buildWelcomeMessage(invData));
    $("waWelcomeBanner").innerHTML = `<div class="note-box" style="text-align:center;"><a href="${link}" target="_blank" class="btn btn-gold btn-sm" style="display:inline-block;text-decoration:none;">إرسال رسالة واتساب ترحيبية للعميل</a></div>`;
    $("waWelcomeBanner").style.display = "";
  } else {
    $("waWelcomeBanner").style.display = "none";
  }
  const saved = await saveState();
  if(saved){
    logAudit(editingId ? "invoice_edited" : "invoice_created", {invoiceNumber:number, saleTotal: invoiceSaleTotal(invData), paid: invoicePaid(invData)});
    if(!editingId){ selectedOfferIds = []; appliedPromoCode = null; }
    showToast(editingId ? "تم تحديث الفاتورة" : (appliedOffers.length ? `تم حفظ الفاتورة — تطبيق: ${appliedOffers.join("، ")}` : "تم حفظ الفاتورة"));
    if(!editingId){
      $("printReceiptBanner").innerHTML = `<button class="btn btn-gold btn-sm" style="width:100%;" onclick="printCustomerReceipt('${invData.id}')">طباعة فاتورة العميل</button>
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px;" onclick="shareReceiptViaWhatsApp('${invData.id}')">إرسال الفاتورة واتساب</button>` +
        invData.garments.map((g,i)=>`<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px;" onclick="printCuttingCard('${invData.id}', ${i})">طباعة كرت القصاص — ثوب ${i+1}</button>`).join("");
    }
    resetForm(); renderAll();
    return invData.id;
  } else {
    // the cloud save failed — roll back every local mutation (advisory credits, fabric
    // reservation, loyalty points, cash box balances, the invoice itself...) instead of
    // leaving them applied only in this tab's memory, and keep the form filled in as-is
    // so the cashier can just retry instead of re-entering everything from scratch
    if(stateSaveConflict){
      // `state` is already the freshly reloaded server copy; only the form stays as the cashier left it
      if(!editingId) $("invNumber").value = state.settings.nextInvoiceNumber;
      $("printReceiptBanner").innerHTML = `<p class="sub" style="text-align:center;color:var(--loss);">ما انحفظت الفاتورة — مستخدم ثاني حفظ بنفس اللحظة. البيانات لسا موجودة بالفورم، اضغط "حفظ" مرة ثانية.</p>`;
      $("printReceiptBanner").style.display = "";
      renderAll();
      return null;
    }
    state = stateSnapshotBeforeSave;
    $("printReceiptBanner").innerHTML = `<p class="sub" style="text-align:center;color:var(--loss);">تعذّر حفظ الفاتورة بالسحابة — ما انحفظ شي، البيانات لسا موجودة بالفورم. تأكد من الاتصال بالإنترنت وجرّب "حفظ" مرة ثانية.</p>`;
    $("printReceiptBanner").style.display = "";
    renderAll();
    return null;
  }
}
async function saveInvoiceAndPrint(){
  const id = await saveInvoice();
  if(id) printCustomerReceipt(id);
}
async function saveInvoiceAndSend(){
  const id = await saveInvoice();
  if(id) shareReceiptViaWhatsApp(id);
}

// ---------------- unified work distribution + overdue ----------------
function allPendingGarments(){
  const rows=[];
  state.invoices.forEach(inv=> inv.garments.forEach((g,idx)=>{
    if(g.status!=="تسليم" && g.status!=="ملغي") rows.push({inv,g,idx});
  }));
  return rows;
}
function computeOverdueLists(){
  const today = todayStr();
  const tomorrow = (()=>{ const d=serverDate(); d.setDate(d.getDate()+1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); })();
  const pending = allPendingGarments();
  const cutBufferDays = state.settings.cuttingOverdueDays||3;
  const cuttingOverdue = pending.filter(({inv,g})=>{
    if(g.status!=="جديد" || !inv.expectedDeliveryDate) return false;
    const cutDeadline = new Date(inv.expectedDeliveryDate); cutDeadline.setDate(cutDeadline.getDate()-cutBufferDays);
    return serverDate() > cutDeadline;
  }).sort((a,b)=> a.inv.expectedDeliveryDate.localeCompare(b.inv.expectedDeliveryDate));
  const deliveryOverdue = pending.filter(({inv})=> inv.expectedDeliveryDate && inv.expectedDeliveryDate<today)
    .sort((a,b)=> a.inv.expectedDeliveryDate.localeCompare(b.inv.expectedDeliveryDate));
  const dueToday = pending.filter(({inv})=> inv.expectedDeliveryDate===today);
  const dueTomorrow = pending.filter(({inv})=> inv.expectedDeliveryDate===tomorrow);
  return {pending, cuttingOverdue, deliveryOverdue, dueToday, dueTomorrow};
}
function renderOverdueDashboard(targetId, withOpenBtn){
  const el = $(targetId||"overdueDashboard");
  if(!el) return;
  const {cuttingOverdue, deliveryOverdue, dueToday, dueTomorrow} = computeOverdueLists();
  const panel = (title, rows, emptyMsg, reasonFn)=>{
    let html = `<div class="garment-card"><span class="tag">${title} (${rows.length})</span>`;
    if(!rows.length){ html += `<p class="sub" style="margin-top:8px;">${emptyMsg}</p>`; }
    else {
      html += `<div class="table-wrap" style="margin-top:8px;"><table><thead><tr><th>فاتورة</th><th>العميل</th><th>التاريخ</th><th>الحالة</th>${reasonFn?"<th>سبب التأخير</th>":""}${withOpenBtn?"<th></th>":""}</tr></thead><tbody>`;
      rows.slice(0,15).forEach(({inv,g})=>{
        const st = STATUSES.find(s=>s.v===g.status);
        html += `<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${inv.expectedDeliveryDate||inv.date}</td><td><span class="badge ${st?st.cls:""}">${st?st.label:g.status}</span></td>${reasonFn?`<td class="sub">${reasonFn({inv,g})}</td>`:""}${withOpenBtn?`<td><button type="button" class="btn btn-ghost btn-sm open-overdue-btn" data-number="${esc(inv.number)}">فتح</button></td>`:""}</tr>`;
      });
      html += `</tbody></table></div>`;
      if(rows.length>15) html += `<p class="sub" style="margin-top:6px;">+${rows.length-15} أكثر...</p>`;
    }
    return html+`</div>`;
  };
  // one list under the other, full width — side by side, the second column got squeezed and cut its rows off
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">
    ${panel("متأخرة على القص", cuttingOverdue, "ما فيه ثياب متأخرة على القص", ()=>"تجاوز الموعد المحدد لبدء القص")}
    ${panel("متأخرة عن التسليم", deliveryOverdue, "ما فيه ثياب متأخرة عن التسليم", ({inv})=>`تجاوز تاريخ التسليم المتوقع (${inv.expectedDeliveryDate})`)}
    ${panel("تسليم اليوم", dueToday, "ما فيه ثياب تسليمها اليوم")}
    ${panel("تسليم غداً", dueTomorrow, "ما فيه ثياب تسليمها غداً")}
  </div>`;
  if(withOpenBtn){
    el.querySelectorAll(".open-overdue-btn").forEach(btn=> btn.addEventListener("click", ()=>{
      switchTab("distribution");
      setTimeout(()=> openDistributionInvoiceByNumber(btn.dataset.number), 150);
    }));
  }
}
function renderDashboardKPIs(){
  const el = $("dashboardKpiGrid");
  if(!el) return;
  const today = todayStr();
  const todaysInvoices = state.invoices.filter(i=>i.date===today);
  const todaysSalesInvoices = state.salesInvoices.filter(i=>i.date===today);
  const salesToday = state.invoices.reduce((a,inv)=> a + (inv.payments||[]).filter(p=>p.date===today).reduce((s,p)=>s+(p.cash||0)+(p.network||0),0), 0)
    + todaysSalesInvoices.reduce((a,inv)=> a + (inv.payment?(inv.payment.cash||0)+(inv.payment.network||0):0), 0)
    - (state.salesReturns||[]).filter(r=>r.date===today).reduce((a,r)=>a+(r.refundAmount||0),0)
    - state.invoiceReturns.filter(r=>r.date===today).reduce((a,r)=>a+(r.refundAmount||0),0)
    + (state.legacyPayments||[]).filter(l=>l.date===today).reduce((a,l)=>a+l.amount,0)
    + (state.openingDebtPayments||[]).filter(p=>p.date===today).reduce((a,p)=>a+(p.cash||0)+(p.network||0),0);
  const {cuttingOverdue, deliveryOverdue, dueToday} = computeOverdueLists();
  const overdueCount = cuttingOverdue.length + deliveryOverdue.length;
  const pending = allPendingGarments();
  const readyCount = pending.filter(({g})=> g.status==="جاهز").length;
  const inProgressCount = pending.length - readyCount;
  const totalDue = state.invoices.reduce((a,inv)=> a + Math.max(0, invoiceRemaining(inv)), 0) + totalOpeningDebtRemaining();
  const kpi = (cls, icon, lbl, val)=> `<div class="kpi-card ${cls}"><div class="kpi-top"><div class="kpi-icon"><i data-lucide="${icon}"></i></div></div><div class="kpi-lbl">${lbl}</div><div class="kpi-val">${val}</div></div>`;
  el.innerHTML =
    kpi("c-sales","banknote","مبيعات اليوم", salesToday.toFixed(0)+" ﷼") +
    kpi("c-count","file-text","فواتير اليوم", todaysInvoices.length) +
    kpi("c-progress","loader","قيد التنفيذ", inProgressCount) +
    kpi("c-ready","check-circle-2","جاهز للتسليم", readyCount) +
    kpi("c-overdue","alert-triangle","متأخر", overdueCount) +
    kpi("c-due","wallet","مبالغ مستحقة", totalDue.toFixed(0)+" ﷼");
  refreshLucideIcons();
}
function renderDashboardWorkDistribution(){
  const el = $("dashboardWorkDistribution");
  if(!el) return;
  const counts = {};
  STATUSES.forEach(s=> counts[s.v]=0);
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{ if(counts[g.status]!==undefined) counts[g.status]++; }));
  const visible = STATUSES.filter(s=> s.v!=="ملغي" && s.v!=="معلقة");
  el.innerHTML = visible.map(s=> `<div class="report-card"><div class="st"><span class="badge ${s.cls}">${s.label}</span></div><div class="amt">${counts[s.v]}</div><div class="cnt">ثوب</div></div>`).join("");
}
function renderPendingList(){
  const rows = allPendingGarments();
  const tbody = $("pendingBody"); tbody.innerHTML="";
  if(rows.length===0){ tbody.innerHTML=`<tr><td colspan="6">${emptyStateHtml("check-circle-2","ما فيه ثياب متعثرة")}</td></tr>`; return; }
  rows.forEach(({inv,g,idx})=>{
    const st = STATUSES.find(s=>s.v===g.status);
    const waBtn = inv.customerMobile ? `<a href="${waLink(inv.customerMobile, buildReminderMessage(inv,g))}" target="_blank" class="btn btn-ghost btn-sm" style="white-space:nowrap;" title="تذكير واتساب">تذكير</a>` : "";
    tbody.innerHTML += `<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${esc(g.fabricType)}</td>
      <td><span class="badge ${st.cls}">${st.label}</span></td><td>${monthDisplay(inv.originMonth)}</td>
      <td style="white-space:nowrap;"><button class="btn btn-ghost btn-sm jump-to-invoice-btn" data-number="${inv.number.replace(/"/g,"&quot;")}">فتح</button> <button class="btn btn-ghost btn-sm" onclick="printCuttingCard('${inv.id}', ${idx})" title="طباعة كرت القصاص">كرت القصاص</button> ${waBtn}</td></tr>`;
  });
  document.querySelectorAll(".jump-to-invoice-btn").forEach(btn=> btn.addEventListener("click", ()=> jumpToInvoice(btn.dataset.number)));
}
function jumpToInvoice(number){
  $("distInvNumber").value = number;
  searchInvoiceForDistribution();
  window.scrollTo({top:$("distInvNumber").getBoundingClientRect().top+window.scrollY-20, behavior:"smooth"});
}
function searchInvoiceForDistribution(){
  const q = $("distInvNumber").value.trim();
  const statusFilter = $("distStatusFilter").value;
  const area = $("distArea"), resultsList = $("distResultsList");
  area.innerHTML=""; resultsList.innerHTML="";
  $("distWaReadyBanner").style.display = "none";
  if(!q && !statusFilter) return;
  const legacyMatches = q ? state.legacyItems.filter(x=> x.status!=="تم التسليم" && (x.name.toLowerCase().includes(q.toLowerCase()) || x.mobile.includes(q))) : [];
  const legacyHtml = legacyMatches.length ? `<div class="stitch"></div><h4 style="font-size:13px;margin:10px 0;color:var(--gold-soft);">أمانات قديمة من الجرد الافتتاحي (لسا ما تسلّمت)</h4>
    <div class="table-wrap"><table><thead><tr><th>العميل</th><th>الجوال</th><th>الوصف</th><th>المتبقي تسليمه</th><th></th></tr></thead><tbody>
    ${legacyMatches.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.mobile)}</td><td>${esc(x.desc)}</td><td>${x.count-(x.deliveredCount||0)} من ${x.count}</td><td><button class="btn btn-ghost btn-sm" onclick="openLegacyDeliverModal('${x.id}')">تسليم</button></td></tr>`).join("")}
    </tbody></table></div>` : "";
  // exact invoice number match -> open directly (keeps barcode-scan flow instant)
  const exact = q ? state.invoices.find(i=>i.number===q) : null;
  if(exact && !statusFilter){ openDistributionInvoice(exact); if(legacyHtml) resultsList.innerHTML = legacyHtml; return; }
  const qLower = q.toLowerCase();
  const matches = state.invoices.filter(inv=>{
    const textMatch = !q || inv.number.includes(q) || (inv.customerName||"").toLowerCase().includes(qLower) || (inv.customerMobile||"").includes(q);
    const statusMatch = !statusFilter || inv.garments.some(g=>g.status===statusFilter);
    return textMatch && statusMatch;
  }).slice(0,30);
  if(!matches.length){ resultsList.innerHTML = legacyHtml || emptyStateHtml("search-x","ما فيه نتائج مطابقة."); refreshLucideIcons(); return; }
  if(matches.length===1 && !legacyMatches.length){ openDistributionInvoice(matches[0]); return; }
  resultsList.innerHTML = `<div class="table-wrap"><table><thead><tr><th>الفاتورة</th><th>العميل</th><th>الجوال</th><th>التاريخ</th><th></th></tr></thead><tbody>` +
    matches.map(inv=>`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${esc(inv.customerMobile||"—")}</td><td>${inv.date}</td><td><button class="btn btn-ghost btn-sm open-dist-inv-btn" data-number="${inv.number.replace(/"/g,"&quot;")}">فتح</button></td></tr>`).join("") +
    `</tbody></table></div>` + legacyHtml;
  document.querySelectorAll(".open-dist-inv-btn").forEach(btn=> btn.addEventListener("click", ()=> openDistributionInvoiceByNumber(btn.dataset.number)));
}
function openDistributionInvoiceByNumber(num){
  const inv = state.invoices.find(i=>i.number===num);
  if(inv) openDistributionInvoice(inv);
}
function openDistributionInvoice(inv){
  $("distResultsList").innerHTML="";
  $("distWaReadyBanner").style.display = "none";
  renderDistributionArea(inv);
}
function buildStepperHtml(status){
  if(status==="ملغي") return `<div class="badge b-cancel" style="margin:6px 0 10px;">ملغي</div>`;
  const stages = [
    {v:"جديد", lbl:"استلام الطلب"},
    {v:"قص", lbl:"القص"},
    {v:"تفصيل", lbl:"الخياطة"},
    {v:"جاهز", lbl:"جاهز"},
    {v:"تسليم", lbl:"تم التسليم"},
  ];
  const effectiveStatus = status==="معلقة" ? "جاهز" : status; // "معلقة" = كان جاهز بس ما انسلّم قبل إقفال الشهر
  const idx = stages.findIndex(s=>s.v===effectiveStatus);
  const stepsHtml = stages.map((s,i)=>{
    const cls = i<idx ? "done" : i===idx ? "current" : "";
    const mark = i<idx ? "✓" : (i+1);
    return `<div class="stepper-step ${cls}"><div class="dot">${mark}</div><div class="lbl">${esc(s.lbl)}</div></div>`;
  }).join("");
  return `<div class="stepper">${stepsHtml}</div>` + (status==="معلقة" ? `<p class="locked-note" style="color:var(--warn);">معلّقة — جاهزة بس تجاوزت إقفال الشهر بدون تسليم</p>` : "");
}
function renderDistributionArea(inv){
  const area = $("distArea");
  const isAdmin = currentUser.role==="مدير";
  const availableStatusesBase = STATUSES.filter(s=> s.v!=="معلقة" && (s.v!=="ملغي" || isAdmin) && s.v!=="تفصيل");
  const paid = invoicePaid(inv), discountTotal = invoiceDiscountTotal(inv), total = invoiceSaleTotal(inv), remaining = invoiceRemaining(inv);
  const activeGarmentCount = inv.garments.filter(g=>g.status!=="ملغي").length;
  const paymentsHtml = (inv.payments&&inv.payments.length) ? inv.payments.map(p=>`<div class="payment-row">
      <span>${(p.cash||0).toFixed(0)} ﷼${p.cashReceiptNo?` (سند ${p.cashReceiptNo})`:""}</span><span>${(p.network||0).toFixed(0)} ﷼${(p.networkReceiptNo||p.receipt)?` (سند ${p.networkReceiptNo||p.receipt})`:""}</span>${p.discount?`<span>خصم: ${p.discount.toFixed(0)} ﷼</span>`:""}
      <span style="color:var(--muted)">${p.date}</span></div>`).join("")
    : `<p class="sub">ما فيه دفعات مسجّلة بعد.</p>`;
  const summaryField = (lbl, val)=> `<div><div class="order-summary-lbl">${lbl}</div><div class="order-summary-val">${val}</div></div>`;
  const summaryHtml = `<div class="order-summary-card">
    <div class="order-summary-head"><span class="order-summary-number">${esc(inv.number)}</span><span class="sub" style="margin-right:8px;">${monthDisplay(inv.originMonth)}</span></div>
    <div class="order-summary-grid">
      ${summaryField("العميل", esc(inv.customerName||"—"))}
      ${summaryField("رقم الجوال", esc(inv.customerMobile||"—"))}
      ${summaryField("تاريخ الطلب", inv.date)}
      ${summaryField("تاريخ التسليم المتوقع", inv.expectedDeliveryDate||"—")}
      ${summaryField("عدد الثياب", activeGarmentCount)}
      ${summaryField("الإجمالي", total.toFixed(0)+" ﷼")}
      ${summaryField("المدفوع", paid.toFixed(0)+" ﷼")}
      ${summaryField("المتبقي", remaining.toFixed(0)+" ﷼")}
    </div>
  </div>`;
  area.innerHTML = summaryHtml + `${inv.notes?`<p class="sub" style="margin:10px 0;">ملاحظات الفاتورة: ${esc(inv.notes)}</p>`:""}${(inv.appliedOffers&&inv.appliedOffers.length)?`<p class="sub" style="margin-bottom:10px;color:var(--gold-soft);">عروض مطبّقة: ${inv.appliedOffers.join("، ")}</p>`:""}` +
    inv.garments.map((g,i)=>{
      const locked = (g.status==="تسليم"||g.status==="ملغي") && !isAdmin;
      const tailorLocked = g.status==="تفصيل"; // "تم التفصيل" is exclusively set via the tailor's own scan screen — no one edits it here, admin included
      const dis = (locked||tailorLocked)?"disabled":"";
      // "جاهز" is reached exclusively by finishing "تم التفصيل" first (tailor scan screen) — never offered
      // here as a pickable jump from "جديد"/"قص", so this screen can't skip the cutting/sewing stages
      const availableStatuses = g.status==="تفصيل" ? STATUSES.filter(s=>s.v==="تفصيل") : availableStatusesBase.filter(s=> {
        if(s.v==="جاهز") return g.status==="جاهز";
        if(s.v==="تسليم") return g.status==="جاهز" || g.status==="تسليم";
        return true;
      });
      const canCreditDeliver = isAdmin && g.status!=="تسليم" && g.status!=="ملغي" && g.status!=="جديد" && g.status!=="قص";
      const creditBadge = g.creditDelivered ? `<p class="locked-note" style="color:var(--loss);">مسلَّم بدين — متبقٍ عليه ${creditGarmentOwed(g, inv).toFixed(0)} ﷼ (تابعه من "مديونية الثياب")</p>` : "";
      return `<div class="garment-card"><span class="tag">ثوب ${i+1} — ${esc(g.fabricType)}</span>
        ${buildStepperHtml(g.status)}
        <div class="row-2">
          <div class="field"><label>اسم الخياط</label><input type="text" class="dist-tailor" data-idx="${i}" value="${esc(g.tailor||"")}" ${dis}></div>
          <div class="field"><label>الحالة</label><select class="dist-status" data-idx="${i}" ${dis}>${availableStatuses.map(s=>`<option value="${s.v}" ${s.v===g.status?"selected":""}>${s.label}</option>`).join("")}</select></div>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="printCuttingCard('${inv.id}', ${i})">طباعة كرت القصاص</button>
        ${g.measurementNotes?`<p class="sub">ملاحظات المقاسات: ${esc(g.measurementNotes)}</p>`:""}
        ${locked?`<p class="locked-note">${g.status==="تسليم"?"تم التسليم":"ملغي"} — لا يمكن للمحاسب التغيير</p>`:""}
        ${tailorLocked?`<p class="locked-note">تم التفصيل — يخص حساب الخياط فقط (يُعدَّل من شاشة المسح الخاصة به)</p>`:""}
        ${creditBadge}
        ${canCreditDeliver?`<button class="btn btn-ghost btn-sm" style="border-color:var(--loss);color:var(--loss);margin-top:8px;" onclick="creditDeliverGarment('${inv.id}', ${i})">تسليم بدين (تجاوز المتبقي)</button>`:""}
      </div>`;
    }).join("") +
    `<div class="stitch"></div>
    <h4 style="margin:0 0 10px;font-size:14px;">تسوية الدفع والتسليم</h4>
    <div id="distPaymentsList">${paymentsHtml}</div>
    <div class="remaining-box">
      <span>الإجمالي: ${total.toFixed(0)} ﷼ — المدفوع: ${paid.toFixed(0)} ﷼${discountTotal?` — الخصم: ${discountTotal.toFixed(0)} ﷼`:""}</span>
      <span class="amt">المتبقي: ${remaining.toFixed(0)} ﷼</span>
    </div>
    <div class="row-3">
      <div class="field"><label>كاش (ريال)</label><input type="number" id="distPayCash" min="0" placeholder="0"></div>
      <div class="field"><label>شبكة (ريال)</label><input type="number" id="distPayNetwork" min="0" placeholder="0"></div>
      <div class="field"><label>رقم سند الشبكة (إلزامي لو فيه شبكة)</label><input type="text" id="distPayReceipt"></div>
    </div>
    ${(userDiscountEnabled(currentUser)||isCustomerVip(inv.customerMobile))?`<div class="field"><label>خصم (ريال)${isCustomerVip(inv.customerMobile)?` — عميل VIP: بدون حد أقصى`:` — الحد الأقصى لك: ${userMaxDiscountAmount(currentUser,total).toFixed(0)} ريال`}</label><input type="number" id="distPayDiscount" min="0" placeholder="0"></div>`:""}
    <button class="btn btn-ghost btn-sm" id="addDistPaymentBtn">إضافة دفعة</button>
    <div class="stitch"></div>
    <button class="btn btn-gold btn-sm" id="saveDistBtn">حفظ التوزيع</button>`;
  $("saveDistBtn").addEventListener("click", ()=> saveDistribution(inv));
  $("addDistPaymentBtn").addEventListener("click", ()=> addDistPayment(inv));
}
async function addDistPayment(inv){
  const cash = parseFloat($("distPayCash").value)||0;
  const network = parseFloat($("distPayNetwork").value)||0;
  const networkReceiptNo = $("distPayReceipt").value.trim();
  const vip = isCustomerVip(inv.customerMobile);
  const discount = (userDiscountEnabled(currentUser)||vip) ? (parseFloat($("distPayDiscount")?.value)||0) : 0;
  const maxDiscount = vip ? Infinity : userMaxDiscountAmount(currentUser, invoiceSaleTotal(inv));
  if(discount - maxDiscount > 0.01){ showToast(`الخصم أكبر من حدّك المسموح (${maxDiscount.toFixed(0)} ريال)`); return; }
  if(cash<=0 && network<=0 && discount<=0){ showToast("أدخل مبلغ كاش أو شبكة أو خصم"); return; }
  if(network>0 && !networkReceiptNo){ showToast("أدخل رقم سند الشبكة"); return; }
  const remaining = invoiceRemaining(inv);
  if((cash+network+discount) - remaining > 0.01){ showToast(`المبلغ أكبر من المتبقي (${remaining.toFixed(0)} ريال)`); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  // capture any tailor values currently typed in the garment cards so they aren't lost on refresh
  const isAdmin = currentUser.role==="مدير";
  inv.garments.forEach((g,i)=>{
    const locked = (g.status==="تسليم"||g.status==="ملغي") && !isAdmin;
    if(locked) return;
    const tInp=document.querySelector(`.dist-tailor[data-idx="${i}"]`);
    if(tInp) g.tailor = tInp.value.trim();
  });
  inv.payments = inv.payments || [];
  const cashReceiptNo = cash>0 ? nextVoucherNo() : null;
  const newPayment = {id:newId(), date:todayStr(), cash, network, cashReceiptNo, networkReceiptNo, discount};
  inv.payments.push(newPayment);
  applyPaymentToBalances(newPayment);
  let autoDelivered=0;
  if(invoiceRemaining(inv) <= 0.01){
    inv.garments.forEach(g=>{
      if(g.status==="ملغي" || g.status==="تسليم" || g.status==="معلقة") return;
      if(g.status==="جديد" || g.status==="قص") return; // ما تفصّل بعد — ما يصير يتسلم تلقائياً حتى لو الفاتورة اتسددت بالكامل
      if(g.status==="تفصيل" && state.settings.qcEnabled) return; // ينتظر فحص الجودة
      g.status="تسليم"; if(!g.readyDate) g.readyDate=todayStr(); if(!g.deliveredDate) g.deliveredDate=todayStr(); autoDelivered++;
    });
  }
  if(!await saveStateWithRollback(snapshot)) return; // form (payment inputs) stays as-is so the cashier can just retry
  if(autoDelivered>0) showToast(`تم تسجيل الدفعة وتحويل ${autoDelivered} ثوب إلى "تم التسليم" تلقائياً`);
  else showToast(discount>0 ? "تم تسجيل الدفعة والخصم" : "تم تسجيل الدفعة");
  $("distInvNumber").value = inv.number;
  searchInvoiceForDistribution();
}
async function creditDeliverGarment(invId, idx){
  if(!currentUser || currentUser.role!=="مدير"){ showToast("تسليم بدين متاح للمدير فقط"); return; }
  const inv = state.invoices.find(i=>i.id===invId); if(!inv) return;
  const g = inv.garments[idx]; if(!g) return;
  if(g.status==="تسليم" || g.status==="ملغي"){ showToast("لا يمكن تطبيق هذا على ثوب مُسلَّم أو ملغي"); return; }
  if(g.status==="جديد" || g.status==="قص"){ showToast("ما يصير تسليم الثوب بدين قبل ما يخلص التفصيل — عشان ما يضيع حق القصاص وما تفقد بيانات التكاليف مصداقيتها"); return; }
  if(g.status==="تفصيل" && state.settings.qcEnabled){ showToast("هذا الثوب ينتظر فحص الجودة — ما يتسلّم قبل ما يجتازه"); return; }
  const amount = garmentSalePrice(g);
  if(!await showConfirm(`تأكيد: بيتم تسليم هذا الثوب الآن رغم وجود دين عليه بقيمة ${amount.toFixed(0)} ريال. الثوب بينتقل لقائمة "مديونية الثياب" حتى يُسدد المبلغ. متابعة؟`)) return;
  const snapshot = JSON.parse(JSON.stringify(state));
  g.status="تسليم";
  if(!g.readyDate) g.readyDate=todayStr();
  if(!g.deliveredDate) g.deliveredDate=todayStr();
  if(!g.creditDelivered){ g.creditDelivered=true; g.creditAmount=amount; g.creditPaid=0; }
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("garment_credit_delivered", {invoiceNumber:inv.number, garmentIdx:idx, amount});
  showToast("تم التسليم بدين — انتقل الثوب لقائمة مديونية الثياب");
  searchInvoiceForDistribution();
}
// ---------------- barcode scanning (tailor claim + general quick-advance) ----------------
function renderScanTab(){
  if(!currentUser) return;
  const isTailor = currentUser.role==="خياط";
  $("scanPanelTailor").style.display = isTailor ? "" : "none";
  $("scanPanelGeneral").style.display = isTailor ? "none" : "";
  if(isTailor){
    renderTailorScanHistory();
    renderTailorQcReturns();
    $("myTailorMonthlyReport").innerHTML = buildTailorMonthlyReport(currentUser.username, todayStr().slice(0,7));
  }
}
function renderTailorScanHistory(){
  const mine = state.tailorScans.filter(s=>s.tailorUsername===currentUser.username).slice().reverse().slice(0,20);
  $("tailorScanHistory").innerHTML = mine.length ? mine.map(s=>`<div class="item-row"><span>فاتورة ${s.invoiceNumber} — ${s.claimedCount} ثوب — ${s.date}</span></div>`).join("")
    : `<p class="sub">ما مسحت أي فاتورة بعد.</p>`;
}
function handleTailorScan(){
  const number = $("tailorScanInput").value.trim();
  if(!number){ showToast("أدخل رقم الفاتورة"); return; }
  const inv = state.invoices.find(i=>i.number===number);
  if(!inv){ showToast("ما فيه فاتورة بهذا الرقم"); return; }
  $("tailorScanPicker").innerHTML = "";
  const conflicts = [];
  const eligible = [];
  inv.garments.forEach((g,idx)=>{
    if(g.status==="تسليم" || g.status==="ملغي") return;
    if(g.qcReturnedTo && g.qcReturnedTo!==currentUser.username){ conflicts.push(g.qcReturnedTo); return; } // sent back to its own tailor for repair
    if(g.status==="تفصيل" || g.status==="جاهز"){
      if(g.tailor && g.tailor!==currentUser.username) conflicts.push(g.tailor);
      return; // already claimed (by this tailor or another) or progressed further
    }
    eligible.push(idx);
  });
  // the barcode only carries the invoice number, identical on every garment's cutting card within it —
  // it can't tell us which specific garment was physically scanned. With exactly one unclaimed garment
  // that's not ambiguous, so claim it directly; with more than one (e.g. different tailors sewing
  // different garments on the same invoice), auto-claiming them ALL for whoever scans first would
  // wrongly credit one tailor for another's work — so show a picker and let the tailor pick which one.
  if(eligible.length===1){
    claimSingleTailorGarment(inv, eligible[0], number, conflicts);
  } else if(eligible.length>1){
    $("tailorScanPicker").innerHTML = `<div class="garment-card">
      <p class="sub" style="margin-bottom:8px;">هذي الفاتورة فيها أكثر من ثوب غير مسجّل — اختر أي ثوب تبي تسجّله لك:</p>
      ${eligible.map(idx=>`<button class="btn btn-ghost btn-sm" style="margin:4px;" onclick="claimSingleTailorGarment(state.invoices.find(i=>i.number==='${number}'), ${idx}, '${number}', []);">ثوب ${idx+1} — ${esc(inv.garments[idx].fabricType)}</button>`).join("")}
    </div>`;
  } else {
    resolvePendingAlterationsForTailor(inv);
    $("tailorScanInput").value="";
    const parts = [];
    if(conflicts.length) parts.push(`تنبيه: باقي الثياب مسجّلة مسبقاً لصالح ${[...new Set(conflicts)].join("، ")}`);
    showToast(parts.length ? parts.join(" — ") : "ما فيه ثياب تحتاج تسجيل بهذي الفاتورة");
  }
}
function resolvePendingAlterationsForTailor(inv){
  let alterationsCompleted = 0;
  state.alterations.forEach(a=>{
    if(a.invoiceId!==inv.id || a.status!=="pending") return;
    const g = inv.garments[a.garmentIndex];
    if(g && g.tailor===currentUser.username){ a.status="completed"; a.dateCompleted=todayStr(); alterationsCompleted++; }
  });
  return alterationsCompleted;
}
function claimSingleTailorGarment(inv, idx, number, conflicts){
  const g = inv.garments[idx];
  if(!g || g.status==="تسليم" || g.status==="ملغي" || g.status==="تفصيل" || g.status==="جاهز"){ showToast("هذا الثوب ما عاد متاح للتسجيل — يمكن سجّله خياط ثاني قبلك"); $("tailorScanPicker").innerHTML=""; return; }
  if(g.qcReturnedTo && g.qcReturnedTo!==currentUser.username){ showToast(`هذا الثوب راجع للخياط ${g.qcReturnedTo} لإصلاحه`); $("tailorScanPicker").innerHTML=""; return; }
  const wasRepair = !!g.qcReturnedTo;
  g.tailor = currentUser.username; g.status = "تفصيل"; g.tailorCompletedDate = todayStr();
  delete g.qcReturnedTo;
  if(wasRepair) g.qcRepairedDate = todayStr();
  const alterationsCompleted = resolvePendingAlterationsForTailor(inv);
  state.tailorScans.push({id:newId(), tailorUsername:currentUser.username, invoiceNumber:number, date:todayStr(), claimedCount:1});
  saveState(); renderAll();
  $("tailorScanInput").value=""; $("tailorScanPicker").innerHTML="";
  const parts = [`تم تسجيل ثوب لصالحك`];
  if(alterationsCompleted>0) parts.push(`تم تأكيد إكمال تعديل ${alterationsCompleted} ثوب`);
  if(conflicts && conflicts.length) parts.push(`تنبيه: باقي الثياب مسجّلة مسبقاً لصالح ${[...new Set(conflicts)].join("، ")}`);
  showToast(parts.join(" — "));
}
const STATUS_ORDER = ["جديد","قص","تفصيل","جاهز","تسليم"];
function nextStatusOf(status){ const i=STATUS_ORDER.indexOf(status); return i>=0 && i<STATUS_ORDER.length-1 ? STATUS_ORDER[i+1] : null; }
function garmentProportionalPaid(g, inv){
  const totalPrice = inv.garments.reduce((a,gg)=>a+(gg.status==="ملغي"?0:garmentSalePrice(gg)),0);
  if(totalPrice<=0) return 0;
  // a discount settles part of the price just like a payment (inv.discountTotal never existed — discounts
  // live on each payment — so every discounted invoice showed its discount as a debt the customer owed)
  const paidTotal = invoicePaid(inv) + invoiceDiscountTotal(inv);
  return paidTotal * (garmentSalePrice(g)/totalPrice);
}
function garmentRemaining(g, inv){ return garmentSalePrice(g) - garmentProportionalPaid(g, inv); }
