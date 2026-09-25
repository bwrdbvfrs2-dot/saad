// ---------------- stage-based revenue & cost recognition ----------------
function garmentPriceShare(g, inv){
  const totalPrice = inv.garments.reduce((a,gg)=>a+(gg.status==="ملغي"?0:garmentSalePrice(gg)),0);
  return totalPrice>0 ? garmentSalePrice(g)/totalPrice : 0;
}
// a cancelled garment's share of the payments as it stood when it was cancelled — among the
// garments still active at that moment (itself and anything cancelled together with or after it).
// garmentPriceShare() leaves every cancelled garment out, so for a cancelled garment it gave 0 (or,
// on a partial return, the wrong share) and the revenue it had earned was never reversed.
function garmentShareAtCancellation(g, inv){
  const at = g.cancelledDate || "";
  const totalPrice = inv.garments.reduce((a,gg)=> a + ((gg.status!=="ملغي" || (gg.cancelledDate||"") >= at) ? garmentSalePrice(gg) : 0), 0);
  return totalPrice>0 ? garmentSalePrice(g)/totalPrice : 0;
}
function garmentRevenueEvents(g, inv, shareOverride){
  // returns [{month, amount}] — deposits collected pre-cut accumulate and release at cutDate's month;
  // anything paid on/after cutDate is recognized in its own payment month.
  const share = shareOverride!==undefined ? shareOverride : garmentPriceShare(g, inv);
  const events = [];
  let preCutAccumulated = 0;
  (inv.payments||[]).forEach(p=>{
    const portion = ((p.cash||0)+(p.network||0)) * share;
    if(g.cutDate && p.date >= g.cutDate){ events.push({month:p.date.slice(0,7), amount:portion}); }
    else { preCutAccumulated += portion; }
  });
  if(g.cutDate && preCutAccumulated>0.001) events.push({month:g.cutDate.slice(0,7), amount:preCutAccumulated});
  return events;
}
function garmentRevenueForMonth(g, inv, monthLabel){
  return garmentRevenueEvents(g, inv).filter(e=>e.month===monthLabel).reduce((a,e)=>a+e.amount,0);
}
function garmentPendingCustody(g, inv){
  // amount collected so far but NOT yet recognized as revenue (still جديد, not cut)
  if(g.cutDate) return 0;
  const share = garmentPriceShare(g, inv);
  return (inv.payments||[]).reduce((a,p)=>a+((p.cash||0)+(p.network||0))*share, 0);
}
function garmentCostForMonth(g, inv, monthLabel){
  let cost = 0;
  if(g.cutDate && g.cutDate.slice(0,7)===monthLabel){ cost += garmentFabricCost(g) + currentFixedShare(0, monthLabel); }
  if(g.tailorCompletedDate && g.tailorCompletedDate.slice(0,7)===monthLabel){
    cost += tailorWageFor(g) + (state.settings.padding||0) + (g.hasEmbroidery?(state.settings.embroideryWage||0):0) + garmentAddonsCost(g);
  }
  return cost;
}
function totalOperationalLossesForMonth(monthLabel){
  return (state.operationalLosses||[]).filter(l=>l.date.slice(0,7)===monthLabel).reduce((a,l)=>a+l.amount,0);
}
function generalExpensesForMonth(monthLabel){
  return state.expenses
    .filter(e=>{
      const cat = state.expenseCategories.find(c=>c.id===e.categoryId);
      return !cat || !cat.advisoryKey; // not linked to an advisory balance (fabric/wages/padding/embroidery)
    })
    .filter(e=>(e.date||"").slice(0,7)===monthLabel)
    .reduce((sum,e)=>sum+(e.amount||0),0);
}
async function loadAndRenderAuditLog(){
  const el = $("auditLogView");
  if(!el) return;
  el.innerHTML = `<p class="sub">جاري التحميل...</p>`;
  const userFilter = $("auditFilterUser").value;
  const actionFilter = $("auditFilterAction").value;
  const fromFilter = $("auditFilterFrom").value;
  try{
    let query = AUDIT_LOG_COL.orderBy("timestamp", "desc").limit(200);
    if(actionFilter) query = AUDIT_LOG_COL.where("action","==",actionFilter).orderBy("timestamp","desc").limit(200);
    const snap = await query.get();
    let rows = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(userFilter) rows = rows.filter(r=>r.username===userFilter);
    if(fromFilter) rows = rows.filter(r=>(r.clientDate||"")>=fromFilter);
    if(!rows.length){ el.innerHTML = `<p class="sub">ما فيه سجلات مطابقة.</p>`; return; }
    const actionLabels = {expense_recorded:"مصروف", month_closed:"إقفال شهر", price_changed:"تعديل سعر", funds_transferred:"تحويل أموال", invoice_returned:"مرتجع فاتورة", sale_invoice_returned:"مرتجع فاتورة مبيعات", user_added:"إضافة مستخدم", user_removed:"حذف مستخدم", permission_changed:"تغيير صلاحية", opening_balance_changed:"تعديل رصيد أول المدة"};
    el.innerHTML = rows.map(r=>{
      const when = r.timestamp && r.timestamp.toDate ? r.timestamp.toDate().toLocaleString("ar-SA") : (r.clientDate||"—");
      return `<div class="garment-card">
        <span class="tag">${actionLabels[r.action]||r.action}</span>
        <p style="margin:6px 0;font-weight:700;">${esc(r.username||"—")} — ${when}</p>
        <p class="sub" style="font-size:11px;">${esc(JSON.stringify(r.details||{}))}</p>
      </div>`;
    }).join("");
  }catch(e){
    el.innerHTML = `<p class="sub">تعذّر تحميل السجل: ${esc(e.message||"خطأ غير معروف")}</p>`;
  }
}
// ---------------- accounts & inventory integrity check ----------------
// Rebuilds every box balance, supplier balance and stock figure purely from the recorded movements
// and compares them with the stored figures. Read-only. A difference means money/stock moved
// without a record (or a record without the movement) — exactly what an audit has to surface.
// every recorded movement of money into or out of a box, with its date — the single source both
// the integrity check (all dates) and the daily report (one day) are built from
function collectBoxMovements(){
  const fee = state.settings.bankFeePercent||0;
  const out = [];
  const mainId = (u,t)=>{ const b=mainBoxOf(u,t); return b ? b.id : null; };
  const add = (boxId, amount, label, date)=> out.push({boxId, amount, label, date});
  const pay = (p, label, date)=>{
    if((p.cash||0)+(p.network||0)<=0) return;
    if(!p.recordedBy){ out.push({boxId:null, amount:(p.cash||0)+(p.network||0), label, date}); return; }
    if(p.cash) add(mainId(p.recordedBy,"cash"), p.cash, label, date);
    if(p.network) add(mainId(p.recordedBy,"network"), p.network*(1-fee/100), label, date);
  };
  state.invoices.forEach(inv=> (inv.payments||[]).forEach(p=> pay(p, `دفعة فاتورة ${inv.number}`, p.date)));
  state.salesInvoices.forEach(s=>{ if(s.payment) pay(s.payment, `فاتورة مبيعات ${s.number}`, s.payment.date||s.date); });
  (state.legacyPayments||[]).forEach(l=> add(l.recordedBy ? mainId(l.recordedBy,"cash") : null, l.amount, l.recordedBy ? "تحصيل قطعة قديمة" : "تحصيل قطعة قديمة (سجل قديم بدون مستخدم)", l.date));
  state.vouchers.forEach(v=> add(v.boxId, v.type==="receipt" ? v.amount : -v.amount, `سند ${v.type==="receipt"?"قبض":"صرف"} ${v.voucherNo}`, v.date));
  state.expenses.forEach(e=> add(e.sourceBoxId, -e.amount, "مصروف", e.date));
  state.invoiceReturns.forEach(r=>{ if(r.refundAmount) add(r.boxId, -r.refundAmount, `استرداد مرتجع فاتورة ${r.invoiceNumber}`, r.date); });
  (state.salesReturns||[]).forEach(r=> add(r.boxId, -r.refundAmount, `استرداد مرتجع مبيعات ${r.saleInvoiceNumber}`, r.date));
  state.purchases.forEach(p=>{ if(p.payStatus==="paid") add(p.sourceBoxId, -p.total, `فاتورة شراء ${p.invoiceNo}`, p.date); });
  state.purchaseReturns.forEach(r=>{ if(r.payStatus==="paid") add(r.boxId, r.value, "مرتجع مشتريات", r.date); });
  state.suppliers.forEach(s=> (s.payments||[]).forEach(sp=> add(sp.boxId, -sp.amount, `تسديد مورد ${s.name}`, sp.date)));
  state.payrollLedger.forEach(e=>{ if(e.type==="payment"||e.type==="advance") add(e.boxId, -e.amount, `${e.type==="advance"?"سلفة":"راتب"} ${e.username}`, e.date); });
  state.transferRequests.forEach(t=>{
    add(t.fromBoxId, -t.amount, "تحويل مرسل", t.createdAt);
    if(t.status==="accepted") add(mainId(t.toOwner,"cash"), t.amount, "تحويل مستلم", t.resolvedAt);
    if(t.status==="rejected") add(t.fromBoxId, t.amount, "تحويل مرفوض راجع", t.resolvedAt);
  });
  (state.boxTransfers||[]).forEach(t=>{ add(t.fromBoxId, -t.amount, "تحويل بين صناديقك", t.date); add(t.toBoxId, t.amount, "تحويل بين صناديقك", t.date); });
  return out;
}
function computeIntegrityCheck(){
  const exp = {}; state.cashBoxes.forEach(b=> exp[b.id]=0);
  const untraceable = [];
  collectBoxMovements().forEach(m=>{
    if(!m.boxId || exp[m.boxId]===undefined){ untraceable.push({why:m.label, amount:m.amount}); return; }
    exp[m.boxId] += m.amount;
  });
  const boxes = state.cashBoxes.map(b=>({name:`${b.owner} — ${b.name} (${typeLabel(b.type)})`, actual:b.balance, rebuilt:exp[b.id], diff:b.balance-exp[b.id]}));
  const suppliers = state.suppliers.map(s=>{
    let e = 0;
    state.purchases.forEach(p=>{ if(p.supplierId===s.id && p.payStatus==="deferred") e += p.total; });
    state.purchaseReturns.forEach(r=>{ if(r.supplierId===s.id && r.payStatus==="deferred") e -= r.value; });
    (s.payments||[]).forEach(sp=> e -= sp.amount);
    return {name:s.name, actual:s.balance, rebuilt:e, diff:s.balance-e};
  });
  const st = {}, rs = {};
  state.itemCards.forEach(c=>{ st[c.id]=0; rs[c.id]=0; });
  const bump = (m,id,q)=>{ if(m[id]!==undefined) m[id]+=q; };
  state.purchases.forEach(p=> bump(st, p.itemCardId, p.quantity));
  state.purchaseReturns.forEach(r=> bump(st, r.itemCardId, -r.quantity));
  state.salesInvoices.forEach(s=>{ s.items.forEach(it=> bump(st, it.itemCardId, -it.qty)); (s.freeGifts||[]).forEach(f=> bump(st, f.itemCardId, -f.qty)); });
  (state.salesReturns||[]).forEach(r=> r.lines.forEach(l=> bump(st, l.itemCardId, l.qty)));
  (state.stockWriteOffs||[]).forEach(w=> bump(st, w.itemCardId, -w.qty));
  state.invoices.forEach(inv=>{
    (inv.freeGifts||[]).forEach(f=> bump(st, f.itemCardId, -f.qty));
    inv.garments.forEach(g=>{
      if(g.itemCardId && (g.stockApplied==="consumed" || (g.status==="ملغي" && g.cutDate && !g.stockApplied))) bump(st, g.itemCardId, -(g.qtyUsed||0));
      if(g.itemCardId && g.stockApplied==="reserved") bump(rs, g.itemCardId, g.qtyUsed||0);
      if(g.addonsStockApplied) garmentAddonsInfo(g).filter(a=>a.kind==="physical").forEach(a=> bump(st, a.itemCardId, -(a.qtyPerGarment||1)));
    });
  });
  const stock = state.itemCards.map(c=>({name:c.name, actual:c.stockQty||0, rebuilt:st[c.id], diff:(c.stockQty||0)-st[c.id], reserved:c.reservedQty||0, reservedRebuilt:rs[c.id], reservedDiff:(c.reservedQty||0)-rs[c.id], available:cardAvailableQty(c)}));
  const seenPay = {}, dupPayroll = [];
  state.payrollLedger.filter(e=>e.type==="entitlement").forEach(e=>{ const k=e.username+" — "+e.monthLabel; if(seenPay[k]) dupPayroll.push(k); seenPay[k]=1; });
  const seenNum = {}, dupNumbers = [];
  state.invoices.forEach(i=>{ if(seenNum[i.number]) dupNumbers.push(i.number); seenNum[i.number]=1; });
  const twins = [];
  state.invoices.forEach((a,ai)=> state.invoices.slice(ai+1).forEach(b=>{
    if(a.customerMobile && a.customerMobile===b.customerMobile && a.date===b.date &&
       a.garments.map(g=>g.price||0).sort().join()===b.garments.map(g=>g.price||0).sort().join()) twins.push(`${a.number} و ${b.number}`);
  }));
  const deliveredUnpaid = [];
  state.invoices.forEach(inv=> inv.garments.forEach((g,i)=>{
    if(g.status==="تسليم" && !g.creditDelivered && garmentRemaining(g, inv) > 0.5) deliveredUnpaid.push(`فاتورة ${inv.number} ثوب ${i+1}: ${garmentRemaining(g, inv).toFixed(0)} ﷼`);
  }));
  const pendingTransfers = state.transferRequests.filter(t=>t.status==="pending");
  const pendingRequests = state.mailRequests.filter(r=>r.status==="pending");
  const negativeBoxes = state.cashBoxes.filter(b=>boxTotal(b) < -0.01);
  const negativeStock = state.itemCards.filter(c=>cardAvailableQty(c) < -0.001);
  return {boxes, suppliers, stock, untraceable, dupPayroll, dupNumbers, twins, deliveredUnpaid, pendingTransfers, pendingRequests, negativeBoxes, negativeStock,
    openingAdjustments:(state.openingBalanceAdjustments||[]).length};
}
function renderIntegrityCheck(){
  const el = $("integrityCheckView");
  if(!el) return;
  const r = computeIntegrityCheck();
  const ok = v=> Math.abs(v) < 0.01;
  const mark = good=> good ? `<span style="color:var(--profit);font-weight:800;">✓</span>` : `<span style="color:var(--loss);font-weight:800;">✗</span>`;
  const table = (head, rows)=> `<div class="table-wrap"><table><thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")||`<tr><td colspan="${head.length}">—</td></tr>`}</tbody></table></div>`;
  const list = (title, items, goodText, reviewOnly)=> `<p style="margin:10px 0 4px;font-weight:700;">${items.length && reviewOnly ? `<span style="color:var(--gold);font-weight:800;">⚠</span>` : mark(!items.length)} ${title}</p>` + (items.length ? `<p class="sub" style="margin:0;">${items.map(esc).join("<br>")}</p>` : `<p class="sub" style="margin:0;">${goodText}</p>`);
  const badBoxes = r.boxes.filter(b=>!ok(b.diff)).length, badSup = r.suppliers.filter(s=>!ok(s.diff)).length, badStock = r.stock.filter(s=>!ok(s.diff)||!ok(s.reservedDiff)).length;
  const issues = badBoxes + badSup + badStock + r.dupPayroll.length + r.dupNumbers.length + r.negativeBoxes.length + r.negativeStock.length;
  let html = `<div class="remaining-box" style="border-color:${issues?"var(--loss)":"var(--profit)"};"><span><b>${issues ? `يوجد ${issues} ملاحظة تحتاج مراجعة` : "كل الأرصدة مطابقة للحركات المسجّلة"}</b></span><span class="amt">${todayStr()}</span></div>`;
  html += `<h4 style="margin:14px 0 6px;">1) الصناديق — الرصيد الفعلي مقابل المعاد بناؤه من الحركات</h4>` +
    table(["","الصندوق","الفعلي","من الحركات","الفرق"], r.boxes.map(b=>`<tr><td>${mark(ok(b.diff))}</td><td>${esc(b.name)}</td><td>${fmtSar(b.actual)}</td><td>${fmtSar(b.rebuilt)}</td><td style="color:${ok(b.diff)?"inherit":"var(--loss)"};">${fmtSar(b.diff)}</td></tr>`));
  if(r.untraceable.length){
    const total = r.untraceable.reduce((a,u)=>a+u.amount,0);
    html += `<p class="sub" style="margin:6px 0;">ℹ حركات قديمة بدون صندوق محدد (سُجّلت قبل تحديث التتبع — تفسّر جزءاً من أي فرق أعلاه): ${r.untraceable.length} حركة بصافي ${fmtSar(total)} ﷼.</p>`;
  }
  html += `<h4 style="margin:14px 0 6px;">2) مستحقات الموردين</h4>` +
    table(["","المورد","الفعلي","من الحركات","الفرق"], r.suppliers.map(s=>`<tr><td>${mark(ok(s.diff))}</td><td>${esc(s.name)}</td><td>${fmtSar(s.actual)}</td><td>${fmtSar(s.rebuilt)}</td><td>${fmtSar(s.diff)}</td></tr>`));
  html += `<h4 style="margin:14px 0 6px;">3) المخزون — الرصيد والمحجوز مقابل الحركات</h4>` +
    table(["","الصنف","الرصيد","من الحركات","المحجوز","المحجوز من الفواتير","المتاح"], r.stock.map(s=>`<tr><td>${mark(ok(s.diff)&&ok(s.reservedDiff))}</td><td>${esc(s.name)}</td><td>${fmtSar(s.actual)}</td><td>${fmtSar(s.rebuilt)}</td><td>${fmtSar(s.reserved)}</td><td>${fmtSar(s.reservedRebuilt)}</td><td>${fmtSar(s.available)}</td></tr>`));
  html += list("أرصدة صناديق بالسالب", r.negativeBoxes.map(b=>`${b.owner} — ${b.name}: ${fmtSar(boxTotal(b))} ﷼`), "ما فيه صندوق بالسالب");
  html += list("أصناف رصيدها المتاح بالسالب", r.negativeStock.map(c=>`${c.name}: ${fmtSar(cardAvailableQty(c))}`), "ما فيه صنف بالسالب");
  html += list("استحقاق راتب مكرر لنفس الموظف ونفس الشهر", r.dupPayroll, "ما فيه تكرار");
  html += list("أرقام فواتير مكررة", r.dupNumbers, "ما فيه تكرار");
  html += `<h4 style="margin:14px 0 6px;">للمراجعة (ليست بالضرورة أخطاء)</h4>`;
  html += list("فواتير محتملة الازدواجية (نفس العميل ونفس اليوم ونفس الأسعار)", r.twins, "ما فيه", true);
  html += list("ثياب مسلّمة وعليها مبلغ غير مسدد بدون تسجيلها كتسليم بدين", r.deliveredUnpaid, "ما فيه", true);
  html += list("مبالغ قيد التحويل (خصمت من المرسل ولم يستلمها أحد بعد)", r.pendingTransfers.map(t=>`${t.fromOwner} ← ${t.toOwner}: ${fmtSar(t.amount)} ﷼ منذ ${t.createdAt}`), "ما فيه", true);
  html += list("طلبات بريد معلقة بانتظار قرار", r.pendingRequests.map(q=>`طلب #${q.seq} (${q.type==="advance"?"سلفة":q.type==="leave"?"إجازة":"مرتجع خلل"})${q.amount?` — ${fmtSar(q.amount)} ﷼`:""}`), "ما فيه", true);
  html += `<p class="sub" style="margin-top:10px;">تعديلات يدوية مسجلة على أرصدة أول المدة للأصناف: ${r.openingAdjustments} (تفاصيلها بسجل التدقيق أدناه).</p>`;
  el.innerHTML = html;
}
function renderTopExpensesReport(){
  const el = $("topExpensesView");
  if(!el) return;
  const monthLabel = state.settings.currentMonth;
  const monthExpenses = state.expenses.filter(e=>(e.date||"").slice(0,7)===monthLabel);
  if(!monthExpenses.length){ el.innerHTML = `<p class="sub">ما فيه مصاريف مسجّلة.</p>`; return; }
  const byCategory = {};
  monthExpenses.forEach(e=>{
    const cat = state.expenseCategories.find(c=>c.id===e.categoryId);
    const key = cat ? cat.id : "__none__";
    const label = cat ? cat.label : "بدون تصنيف";
    if(!byCategory[key]) byCategory[key] = {label, total:0};
    byCategory[key].total += (e.amount||0);
  });
  const rows = Object.values(byCategory).sort((a,b)=>b.total-a.total);
  const grandTotal = rows.reduce((a,r)=>a+r.total,0);
  el.innerHTML = `<p style="font-weight:700;font-size:16px;margin-bottom:12px;">إجمالي المصاريف (${monthDisplay(monthLabel)}): ${grandTotal.toFixed(0)} ﷼</p>` +
    rows.map(r=>{
      const pct = grandTotal>0 ? (r.total/grandTotal*100) : 0;
      return `<div class="garment-card" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-weight:700;"><span>${esc(r.label)}</span><span>${r.total.toFixed(0)} ﷼ (${pct.toFixed(1)}%)</span></div>
        <div style="background:var(--surface2);border-radius:6px;height:8px;margin-top:6px;overflow:hidden;"><div style="background:var(--gold-soft);height:100%;width:${pct.toFixed(1)}%;"></div></div>
      </div>`;
    }).join("");
}
function computeMonthlyFinancials(monthLabel){
  let revenue=0, cost=0, garmentsCut=0;
  state.invoices.forEach(inv=>{
    inv.garments.forEach(g=>{
      if(g.status==="ملغي"){
        // clean reversal if never cut; permanent fabric+fixed-share loss if it WAS cut before cancellation
        if(g.cutDate && g.cutDate.slice(0,7)===monthLabel) cost += garmentFabricCost(g) + currentFixedShare(0, monthLabel);
        if(g.cancelledDate && g.cancelledDate.slice(0,7)===monthLabel && g.cutDate){
          // revenue that had been recognized in EARLIER months is reversed as a return/loss THIS month
          // (a cancelled garment is skipped entirely in its own and later months, so anything dated
          // from this month on was never counted and must not be taken off again)
          const alreadyRecognized = garmentRevenueEvents(g, inv, garmentShareAtCancellation(g, inv))
            .filter(e=>e.month < monthLabel).reduce((a,e)=>a+e.amount,0);
          revenue -= alreadyRecognized;
        }
        return;
      }
      revenue += garmentRevenueForMonth(g, inv, monthLabel);
      cost += garmentCostForMonth(g, inv, monthLabel);
      if(g.cutDate && g.cutDate.slice(0,7)===monthLabel) garmentsCut++;
    });
  });
  const operationalLosses = totalOperationalLossesForMonth(monthLabel);
  const generalExpenses = generalExpensesForMonth(monthLabel);
  cost += operationalLosses + generalExpenses;
  const rawFixed = totalFixed();
  const salesProfit = totalSalesProfitForMonth(monthLabel);
  // fixed costs normally ride on the garments cut this month; with none cut they still have to be
  // paid — charge them (net of ready-made sales profit) as a lump instead of letting them vanish
  if(garmentsCutInMonth(monthLabel)===0) cost += Math.max(0, rawFixed - salesProfit);
  const excessSalesProfit = Math.max(0, salesProfit - rawFixed); // ready-made sales profit beyond what's needed to fully cover fixed costs adds straight to net profit
  cost -= excessSalesProfit;
  return {revenue, cost, profit:revenue-cost, garmentsCut, generalExpenses, operationalLosses, salesProfit, excessSalesProfit};
}
function totalPendingCustody(){
  let total = 0;
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{
    if(g.status!=="جديد") return;
    total += garmentPendingCustody(g, inv);
  }));
  return total;
}
function invoiceRecognizedRevenueToDate(inv){
  return inv.garments.reduce((a,g)=>{
    if(g.status==="ملغي") return a;
    return a + garmentRevenueEvents(g, inv).reduce((s,e)=>s+e.amount,0);
  },0);
}
function invoiceRecognizedCostToDate(inv){
  return inv.garments.reduce((a,g)=>{
    if(g.status==="ملغي" && !g.cutDate) return a; // clean reversal, nothing recognized
    let c=0;
    if(g.cutDate) c += garmentFabricCost(g) + currentFixedShare(0, g.cutDate.slice(0,7));
    if(g.tailorCompletedDate) c += tailorWageFor(g) + (state.settings.padding||0) + (g.hasEmbroidery?(state.settings.embroideryWage||0):0) + garmentAddonsCost(g);
    return a+c;
  },0);
}
// ---------------- invoice-list profit column: direct-cost-only, full cost recognized immediately at cutting, no fixed-share ----------------
function garmentDirectCostOnly(g){
  return garmentFabricCost(g) + tailorWageFor(g) + (state.settings.padding||0) + (g.hasEmbroidery?(state.settings.embroideryWage||0):0) + garmentAddonsCost(g);
}
function invoiceProfitColumnData(inv){
  const activeGarments = inv.garments.filter(g=>g.status!=="ملغي");
  if(!activeGarments.length) return null;
  const cutGarments = activeGarments.filter(g=>g.cutDate);
  if(!cutGarments.length) return null; // deposit is still just a trust before cutting — show nothing
  const totalDirectCost = cutGarments.reduce((a,g)=>a+garmentDirectCostOnly(g),0);
  const allDelivered = activeGarments.every(g=>g.status==="تسليم");
  if(allDelivered){
    const totalPrice = activeGarments.reduce((a,g)=>a+garmentSalePrice(g),0);
    return {mode:"expected", value: totalPrice - totalDirectCost};
  }
  const recognizedRevenue = invoiceRecognizedRevenueToDate(inv);
  return {mode:"actual", value: recognizedRevenue - totalDirectCost};
}
function OVERDUE_READY_DAYS(){ return 7; }
function totalReadyGarmentsCount(){
  let n = 0;
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{ if(g.status==="جاهز") n++; }));
  return n;
}
function overdueReadyGarments(){
  const today = serverDate();
  const rows = [];
  state.invoices.forEach(inv=>{
    inv.garments.forEach((g,idx)=>{
      if(g.status!=="جاهز" || !g.readyDate) return;
      const deadline = new Date(g.readyDate); deadline.setDate(deadline.getDate()+OVERDUE_READY_DAYS());
      if(today < deadline) return;
      const daysOverdue = Math.floor((today - deadline) / (1000*60*60*24));
      rows.push({inv, g, idx, deadline, daysOverdue, remaining: garmentRemaining(g, inv)});
    });
  });
  return rows.sort((a,b)=> b.daysOverdue - a.daysOverdue);
}
let sensitiveUnlocked = false;
function renderSensitiveGate(){
  const gate = $("sensitivePinGate"), content = $("sensitiveContent");
  if(!gate || !content) return;
  const pin = state.settings.sensitivePin;
  if(!pin || sensitiveUnlocked){ gate.style.display="none"; content.style.display=""; renderSensitiveFinancials(); return; }
  gate.style.display=""; content.style.display="none";
}
function submitSensitivePin(){
  if($("sensitivePinInput").value === state.settings.sensitivePin){
    sensitiveUnlocked = true; $("sensitivePinInput").value="";
    renderSensitiveGate();
  } else {
    showToast("رقم سري غلط");
  }
}
function readyForSaleReport(){
  const today = todayStr().slice(0,7);
  const all = state.writtenOffLosses||[];
  const thisMonth = all.filter(w=>w.date.slice(0,7)===today);
  return { all, thisMonth, allTotal: all.reduce((a,w)=>a+w.amount,0), thisMonthTotal: thisMonth.reduce((a,w)=>a+w.amount,0) };
}
function computeIssuedInvoicesStats(monthLabel){
  let total=0, paid=0;
  state.invoices.filter(i=>i.originMonth===monthLabel).forEach(inv=>{
    total += invoiceSaleTotal(inv);
    paid += invoicePaid(inv);
  });
  return {total, paid, remaining: total-paid};
}
function renderSensitiveFinancials(){
  const monthlyFin = computeMonthlyFinancials(state.settings.currentMonth);
  const pendingCustody = totalPendingCustody();
  const curInvoicesCount = state.invoices.filter(i=>i.originMonth===state.settings.currentMonth).length;
  const curGarmentsCount = state.invoices.filter(i=>i.originMonth===state.settings.currentMonth).reduce((a,inv)=>a+inv.garments.filter(g=>g.status!=="ملغي").length,0);
  const issued = computeIssuedInvoicesStats(state.settings.currentMonth);
  const rfs = readyForSaleReport();
  const fixedCosts = totalFixed();
  // break-even = the month's revenue covers its direct costs AND all fixed costs, i.e. profit ≥ 0
  // (it compared revenue alone with fixed costs, ignoring fabric, wages and every other direct cost)
  const remainingToBreakEven = -monthlyFin.profit;
  $("sensitiveStatsGrid").innerHTML = `
    <div class="stat-card sales"><div class="lbl">إجمالي المبيعات المحقّقة (الشهر الحالي)</div><div class="val">${monthlyFin.revenue.toFixed(0)} ﷼</div></div>
    <div class="stat-card cost"><div class="lbl">إجمالي التكاليف المحقّقة (الشهر الحالي)</div><div class="val">${monthlyFin.cost.toFixed(0)} ﷼</div></div>
    <div class="stat-card cost"><div class="lbl">منها: مصاريف عامة (غير مرتبطة برصيد إرشادي)</div><div class="val">${monthlyFin.generalExpenses.toFixed(0)} ﷼</div></div>
    <div class="stat-card profit"><div class="lbl">صافي الأرباح المحقّقة (الشهر الحالي)</div><div class="val" style="color:${monthlyFin.profit>=0?'var(--profit)':'var(--loss)'}">${monthlyFin.profit.toFixed(0)} ﷼</div></div>
    <div class="stat-card count"><div class="lbl">عدد الفواتير (الشهر الحالي)</div><div class="val">${curInvoicesCount} فاتورة / ${curGarmentsCount} ثوب</div></div>
    <div class="stat-card" style="border-color:var(--gold-soft);"><div class="lbl">أمانات معلّقة (عربونات لم تتحرر بعد)</div><div class="val" style="color:var(--gold-soft);">${pendingCustody.toFixed(0)} ﷼</div></div>
    <div class="stat-card sales"><div class="lbl">إجمالي قيمة الفواتير الصادرة (هذا الشهر)</div><div class="val">${issued.total.toFixed(0)} ﷼</div></div>
    <div class="stat-card" style="border-color:var(--gold-soft);"><div class="lbl">عربون الفواتير الصادرة (هذا الشهر)</div><div class="val" style="color:var(--gold-soft);">${issued.paid.toFixed(0)} ﷼</div></div>
    <div class="stat-card cost"><div class="lbl">باقي الفواتير الصادرة (هذا الشهر)</div><div class="val">${issued.remaining.toFixed(0)} ﷼</div></div>
    <div class="stat-card"><div class="lbl">جاهزة للبيع (لكل الفترات)</div><div class="val" style="font-size:16px;">${rfs.all.length} ثوب<br><span style="font-size:12px;color:var(--muted);">${rfs.allTotal.toFixed(0)} ﷼ مشطوبة</span></div></div>
    <div class="stat-card"><div class="lbl">جاهزة للبيع (هذا الشهر)</div><div class="val" style="font-size:16px;">${rfs.thisMonth.length} ثوب<br><span style="font-size:12px;color:var(--muted);">${rfs.thisMonthTotal.toFixed(0)} ﷼</span></div></div>
    <div class="stat-card" style="grid-column:span 2;"><div class="lbl">نقطة التعادل (الشهر الحالي)</div><div class="val" style="font-size:15px;color:${remainingToBreakEven>0?'var(--loss)':'var(--profit)'};">${remainingToBreakEven>0?`لسا محتاج ${remainingToBreakEven.toFixed(0)} ﷼`:`تجاوزتها بـ${Math.abs(remainingToBreakEven).toFixed(0)} ﷼`}</div></div>`;
  renderStuckInvoicesReportInto("sensitiveStuckInvoicesView");
}
function renderStuckInvoicesReportInto(targetId){
  const el = $(targetId);
  if(!el) return;
  const all = overdueReadyGarments();
  const thisMonth = todayStr().slice(0,7);
  const thisMonthRows = all.filter(r=> r.deadline.toISOString().slice(0,7)===thisMonth);
  const table = (rows, emptyMsg)=>{
    if(!rows.length) return `<p class="sub">${emptyMsg}</p>`;
    const total = rows.reduce((a,r)=>a+r.remaining,0);
    return `<div class="table-wrap"><table><thead><tr><th>فاتورة</th><th>العميل</th><th>تاريخ الجاهزية</th><th>أيام التعثر</th><th>المتبقي</th><th></th></tr></thead><tbody>
      ${rows.map(({inv,g,daysOverdue,remaining})=>`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")} ${inv.customerMobile?`<a href="${waLink(inv.customerMobile)}" target="_blank" class="icon-btn" title="فتح واتساب"><i data-lucide="message-circle"></i></a>`:""}</td><td>${g.readyDate}</td><td style="color:var(--loss);font-weight:700;">${daysOverdue} يوم</td><td>${remaining.toFixed(0)} ﷼</td><td><button class="btn btn-ghost btn-sm" onclick="switchTab('distribution'); setTimeout(()=>openDistributionInvoiceByNumber('${inv.number.replace(/'/g,"\\'")}'),150);">↩ فتح للتسوية</button></td></tr>`).join("")}
    </tbody></table></div>
    <p style="margin-top:8px;font-weight:700;">إجمالي: ${rows.length} ثوب متعثر — ${total.toFixed(0)} ﷼ متبقي</p>`;
  };
  el.innerHTML = `
    <h4 style="margin:0 0 8px;font-size:13px;">لكل الفترات</h4>
    ${table(all, "ما فيه ثياب متعثرة حالياً (7 أيام فأكثر من الجاهزية بدون استلام).")}
    <div class="stitch" style="margin:12px 0;"></div>
    <h4 style="margin:0 0 8px;font-size:13px;">لهذا الشهر</h4>
    ${table(thisMonthRows, "ما فيه ثياب دخلت حالة التعثر هذا الشهر.")}
  `;
  refreshLucideIcons();
}
function buildTailorMonthlyReport(username, monthLabel){
  if(!username) return `<p class="sub">اختر خياط.</p>`;
  const rows = [];
  let totalGarments = 0;
  const cancelled = [];
  state.invoices.forEach(inv=>{
    const sewn = inv.garments.filter(g=> g.tailor===username && g.tailorCompletedDate && g.tailorCompletedDate.slice(0,7)===monthLabel && g.status!=="قص" && g.status!=="جديد");
    // a garment cancelled before the month closes earns no wage, even though it was sewn — listed
    // apart so the tailor isn't led to expect pay for it
    const matching = sewn.filter(g=>g.status!=="ملغي");
    sewn.filter(g=>g.status==="ملغي").forEach(()=> cancelled.push(inv.number));
    if(matching.length){ rows.push({inv, count:matching.length}); totalGarments += matching.length; }
  });
  const cancelledNote = cancelled.length ? `<p class="sub" style="margin-top:6px;color:var(--loss);">ثياب ملغاة بدون أجر: ${cancelled.length} (فاتورة ${[...new Set(cancelled)].map(n=>"#"+esc(n)).join("، ")}) — أي ثوب يُلغى قبل إقفال الشهر ما يُصرف عليه أجر حتى لو تمت خياطته.</p>` : "";
  if(!rows.length) return `<p class="sub">ما فيه ثياب فصّلها هذا الخياط هذا الشهر.</p>` + cancelledNote;
  const tableRows = rows.map(({inv,count})=>`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${inv.date}</td><td>${count}</td></tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th><th>عدد الثياب</th></tr></thead><tbody>${tableRows}</tbody></table></div>
    <p style="margin-top:8px;font-weight:700;">إجمالي: ${rows.length} فاتورة — ${totalGarments} ثوب هذا الشهر</p>` + cancelledNote;
}
function buildInvoiceStatusReport(inv){
  const rows = inv.garments.map((g,idx)=>{
    const statusLabel = STATUSES.find(s=>s.v===g.status)?.label || g.status;
    const tailorNote = (g.status==="تفصيل"||g.status==="جاهز"||g.status==="تسليم") && g.tailor ? ` — الخياط: ${esc(g.tailor)}` : "";
    return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);"><span>ثوب ${idx+1} — ${esc(g.fabricType||"—")}</span><span><b>${statusLabel}</b>${tailorNote}</span></div>`;
  }).join("");
  const remaining = invoiceRemaining(inv);
  return `<div class="garment-card" style="margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;"><b>فاتورة ${esc(inv.number)}</b><span class="sub">${esc(inv.customerName||"—")}</span></div>
    <div style="margin-top:6px;">${rows}</div>
    ${Math.abs(remaining)>0.01 ? `<p style="margin:6px 0 0;color:var(--loss);font-size:12px;">متبقي عليها: ${remaining.toFixed(0)} ريال</p>` : `<p style="margin:6px 0 0;color:var(--profit);font-size:12px;">مسددة بالكامل</p>`}
  </div>`;
}
function handleQuickScan(){
  const number = $("quickScanInput").value.trim();
  if(!number){ showToast("أدخل رقم الفاتورة"); return; }
  const inv = state.invoices.find(i=>i.number===number);
  if(!inv){ showToast("ما فيه فاتورة بهذا الرقم"); return; }
  if($("quickScanWaReadyBanner")) $("quickScanWaReadyBanner").style.display = "none";
  const report = buildInvoiceStatusReport(inv);
  const eligible = inv.garments.map((g,idx)=>({g,idx})).filter(({g})=> g.status!=="تسليم" && g.status!=="ملغي");
  if(!eligible.length){ $("quickScanPicker").innerHTML = report; return; }
  if(eligible.length===1){
    $("quickScanPicker").innerHTML = report;
    advanceGarmentStatus(inv, eligible[0].idx);
    $("quickScanInput").value="";
    return;
  }
  $("quickScanPicker").innerHTML = report + `<p class="sub" style="margin-bottom:8px;">هذي الفاتورة فيها أكثر من ثوب — اختر أي وحد ترحّله:</p>` +
    eligible.map(({g,idx})=>`<button class="btn btn-ghost btn-sm" style="margin:4px;" onclick="advanceGarmentStatus(state.invoices.find(i=>i.number==='${number}'), ${idx});">ثوب ${idx+1} — ${esc(g.fabricType)} (${STATUSES.find(s=>s.v===g.status)?.label})</button>`).join("");
}
async function advanceGarmentStatus(inv, idx){
  const g = inv.garments[idx];
  const next = nextStatusOf(g.status);
  if(!next){ showToast("هذا الثوب وصل آخر مرحلة أصلاً"); return; }
  if(next==="تفصيل"){ showToast("هذي الخطوة تخص حساب الخياط بس — يمسحها من شاشته الخاصة"); return; }
  if(next==="جاهز" && state.settings.qcEnabled){ showToast("هذا الثوب ينتظر فحص الجودة — يصير \"جاهز\" من شاشة فحص الجودة بعد اجتيازه"); return; }
  if(next==="تسليم"){
    const remaining = invoiceRemaining(inv);
    if(Math.abs(remaining)>0.01){ showQuickDeliveryPayment(inv, idx, remaining); return; }
    // invoice is already fully paid, so nothing stops this from completing instantly — still require
    // an explicit confirm before finalizing the delivery, so a duplicate scan (scanner double-fires,
    // or the same barcode gets scanned twice by mistake) can never silently deliver a garment unattended
    if(!await showConfirm(`تأكيد تسليم الثوب "${esc(g.fabricType)}" — فاتورة رقم ${esc(inv.number)} (الفاتورة مسددة بالكامل، ما فيه مبلغ متبقي). متابعة؟`)) return;
  }
  completeGarmentAdvance(inv, idx, next);
}
async function completeGarmentAdvance(inv, idx, next, snapshot){
  const g = inv.garments[idx];
  const old = g.status;
  // open now, still inside the synchronous click/keydown chain that led here, before any await below
  const waPopup = (next==="جاهز") ? openReadyWaPopup(inv) : null;
  if(!snapshot) snapshot = JSON.parse(JSON.stringify(state)); // no snapshot passed in => nothing prior to protect, snapshot fresh here
  if(next==="قص" && g.itemCardId && g.stockApplied==="reserved") consumeFabricForGarment(g, g.qtyUsed||0);
  g.status = next;
  if(g.status==="قص" && !g.cutDate) g.cutDate = todayStr();
  if(g.status==="جاهز" && !g.readyDate) g.readyDate = todayStr();
  if(g.status==="تسليم" && !g.deliveredDate) g.deliveredDate = todayStr();
  if(!await saveStateWithRollback(snapshot)){ if(waPopup) waPopup.close(); return false; }
  $("quickScanInput").value=""; $("quickScanPicker").innerHTML="";
  showToast(`تم التحويل من "${STATUSES.find(s=>s.v===old)?.label}" إلى "${STATUSES.find(s=>s.v===next)?.label}"`);
  if(next==="جاهز") finishReadyWaPopup(waPopup, "quickScanWaReadyBanner", inv);
  else if($("quickScanWaReadyBanner")) $("quickScanWaReadyBanner").style.display = "none";
  return true;
}
function showQuickDeliveryPayment(inv, idx, remaining){
  $("quickScanPicker").innerHTML = `<div class="garment-card">
    <p style="margin:0 0 10px;color:var(--loss);font-weight:700;">متبقي على الفاتورة ${remaining.toFixed(0)} ريال — حصّل المبلغ عشان تكمل التسليم</p>
    <div class="row-2">
      <div class="field"><label>كاش (ريال)</label><input type="number" id="quickPayCash" min="0" value="${remaining.toFixed(0)}"></div>
      <div class="field"><label>شبكة (ريال)</label><input type="number" id="quickPayNetwork" min="0" value="0"></div>
    </div>
    <div class="field"><label>رقم سند الشبكة (إلزامي لو فيه شبكة)</label><input type="text" id="quickPayReceipt"></div>
    <button class="btn btn-gold btn-sm" onclick="confirmQuickDeliveryPayment('${inv.id}', ${idx})">تحصيل وتسليم</button>
    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('quickScanPicker').innerHTML='';">إلغاء</button>
  </div>`;
}
function confirmQuickDeliveryPayment(invId, idx){
  const inv = state.invoices.find(i=>i.id===invId);
  if(!inv) return;
  const cash = parseFloat($("quickPayCash").value)||0;
  const network = parseFloat($("quickPayNetwork").value)||0;
  const receipt = $("quickPayReceipt").value.trim();
  if(network>0 && !receipt){ showToast("أدخل رقم سند الشبكة"); return; }
  const remaining = invoiceRemaining(inv);
  if(Math.abs((cash+network)-remaining)>0.01){ showToast(`المبلغ لازم يساوي المتبقي بالضبط (${remaining.toFixed(0)} ريال)`); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  const payment = {cash, network, discount:0, receiptNo:receipt||undefined, date:todayStr()};
  inv.payments = inv.payments||[]; inv.payments.push(payment);
  applyPaymentToBalances(payment);
  completeGarmentAdvance(inv, idx, "تسليم", snapshot);
}
// best-effort camera QR scanning (needs live device testing — cannot verify camera in sandbox)
let scanCameraStream = null;
async function openCameraScan(videoId, wrapId, inputId){
  try{
    if(!window.jsQR){
      await new Promise((resolve,reject)=>{
        const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js";
        s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
      });
    }
    const video = $(videoId);
    scanCameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
    video.srcObject = scanCameraStream; await video.play();
    $(wrapId).style.display = "";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    function tick(){
      if(!scanCameraStream) return;
      if(video.readyState===video.HAVE_ENOUGH_DATA){
        canvas.width=video.videoWidth; canvas.height=video.videoHeight;
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const img = ctx.getImageData(0,0,canvas.width,canvas.height);
        const code = window.jsQR(img.data, img.width, img.height);
        if(code && code.data){ $(inputId).value = code.data.trim(); closeCameraScan(videoId, wrapId); showToast("تم قراءة الباركود"); return; }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }catch(e){
    console.error("Camera access failed", e);
    let msg = "تعذّر الوصول للكاميرا — تأكد من صلاحية الكاميرا بالمتصفح";
    if(location.protocol!=="https:" && location.hostname!=="localhost") msg = "تعذّر الوصول للكاميرا — الموقع لازم يفتح بصيغة https:// (وليس http://) عشان الكاميرا تشتغل";
    else if(e && e.name==="NotAllowedError") msg = "رفضت صلاحية الكاميرا — روح إعدادات المتصفح/الجوال وفعّل صلاحية الكاميرا لهذا الموقع يدوياً";
    else if(e && e.name==="NotFoundError") msg = "ما فيه كاميرا متاحة على هذا الجهاز";
    else if(e && e.name==="NotReadableError") msg = "الكاميرا مستخدمة حالياً من تطبيق ثاني — أغلق أي تطبيق ثاني يستخدمها وحاول مرة ثانية";
    else if(e && e.name==="OverconstrainedError") msg = "تعذّر فتح الكاميرا الخلفية تحديداً — جرّب جهاز ثاني";
    showToast(msg);
  }
}
function closeCameraScan(videoId, wrapId){
  if(scanCameraStream){ scanCameraStream.getTracks().forEach(t=>t.stop()); scanCameraStream=null; }
  $(wrapId).style.display = "none";
}

function renderDebtsTab(){
  const el = $("debtsList");
  const debts = [];
  state.invoices.forEach(inv=> inv.garments.forEach((g,i)=>{
    if(g.creditDelivered && creditGarmentOwed(g, inv) > 0.01) debts.push({inv, g, idx:i});
  }));
  if(!debts.length){ el.innerHTML = emptyStateHtml("credit-card","ما فيه ديون مسجّلة حالياً."); return; }
  el.innerHTML = debts.map(({inv,g,idx})=>{
    const owed = creditGarmentOwed(g, inv);
    return `<div class="garment-card">
      <span class="tag">فاتورة ${esc(inv.number)} — ${esc(inv.customerName||"—")} (${esc(g.fabricType)})</span>
      <p class="sub" style="margin:6px 0;">القيمة الأصلية: ${g.creditAmount.toFixed(0)} ﷼ — المسدد: ${g.creditPaid.toFixed(0)} ﷼</p>
      <p style="margin:4px 0 10px;font-weight:700;color:var(--loss);">المتبقي عليه: ${owed.toFixed(0)} ﷼</p>
      <div class="row-3">
        <div class="field"><label>كاش (ريال)</label><input type="number" class="debt-cash" data-inv="${inv.id}" data-idx="${idx}" min="0" placeholder="0"></div>
        <div class="field"><label>شبكة (ريال)</label><input type="number" class="debt-network" data-inv="${inv.id}" data-idx="${idx}" min="0" placeholder="0"></div>
        <div class="field"><label>رقم السند</label><input type="text" class="debt-receipt" data-inv="${inv.id}" data-idx="${idx}"></div>
      </div>
      <button class="btn btn-gold btn-sm" onclick="payCreditDebt('${inv.id}', ${idx})">تسديد الدين</button>
    </div>`;
  }).join("");
}
function customerDebtInvoices(){
  return state.invoices.filter(inv=>{
    const activeGarments = inv.garments.filter(g=>g.status!=="ملغي");
    if(!activeGarments.length) return false;
    const allDelivered = activeGarments.every(g=>g.status==="تسليم");
    return allDelivered && invoiceRemaining(inv) > 0.01;
  }).sort((a,b)=> invoiceRemaining(b)-invoiceRemaining(a));
}
function buildDebtReminderMessage(inv){
  return `مرحباً ${esc(inv.customerName||"")} 👋\nتذكير بخصوص فاتورتك رقم ${esc(inv.number)} بمحل ${state.settings.shopName||"محلنا"}.\nالمبلغ المتبقي عليك: ${invoiceRemaining(inv).toFixed(0)} ريال.\nنكون شاكرين لو تفضلت بسداده بأقرب فرصة 🌹`;
}
function renderCustomerDebts(){
  const el = $("customerDebtsList");
  const debts = customerDebtInvoices();
  if(!debts.length){ el.innerHTML = emptyStateHtml("wallet","ما فيه مديونيات حالياً."); return; }
  const totalOwed = debts.reduce((a,inv)=>a+invoiceRemaining(inv),0);
  el.innerHTML = `<p class="sub" style="margin-bottom:10px;">عدد العملاء: <b>${debts.length}</b> — إجمالي المتبقي: <b style="color:var(--loss);">${totalOwed.toFixed(0)} ﷼</b></p>` +
    debts.map(inv=>{
      const remaining = invoiceRemaining(inv);
      return `<div class="garment-card">
        <span class="tag">فاتورة ${esc(inv.number)} — ${esc(inv.customerName||"—")}</span>
        <p class="sub" style="margin:6px 0;">الجوال: ${esc(inv.customerMobile||"—")} — التاريخ: ${inv.date}</p>
        <p style="font-weight:700;color:var(--loss);margin:6px 0;">المبلغ المتبقي: ${remaining.toFixed(0)} ﷼</p>
        <div class="row-2">
          <div class="field" style="margin-bottom:0;"><label>مبلغ السداد (ريال)</label><input type="number" class="debt-settle-amount" data-inv="${inv.id}" min="0" max="${remaining}" placeholder="${remaining.toFixed(0)}"></div>
          <div class="field" style="margin-bottom:0;"><label>طريقة السداد</label><select class="debt-settle-method" data-inv="${inv.id}"><option value="cash">كاش</option><option value="network">شبكة</option></select></div>
        </div>
        <div class="actions-row" style="margin-top:8px;">
          <button class="btn btn-gold btn-sm" onclick="settleCustomerDebt('${inv.id}')">سداد</button>
          ${inv.customerMobile?`<a class="btn btn-ghost btn-sm" target="_blank" href="${waLink(inv.customerMobile, buildDebtReminderMessage(inv))}">تذكير</a>`:""}
        </div>
      </div>`;
    }).join("") +
    `<div class="actions-row" style="margin-top:10px;"><button class="btn btn-ghost btn-sm" id="printCustomerDebtsBtn">طباعة / حفظ PDF</button></div>`;
  const printBtn = $("printCustomerDebtsBtn");
  if(printBtn) printBtn.addEventListener("click", ()=>{
    const html = `<h2>مديونيات العملاء — ${todayStr()}</h2><p>عدد العملاء: ${debts.length} — إجمالي المتبقي: ${totalOwed.toFixed(0)} ريال</p>
      <table style="width:100%;border-collapse:collapse;"><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الجوال</th><th>التاريخ</th><th>المبلغ المتبقي</th></tr></thead><tbody>` +
      debts.map(inv=>`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${esc(inv.customerMobile||"—")}</td><td>${inv.date}</td><td>${invoiceRemaining(inv).toFixed(0)} ريال</td></tr>`).join("") +
      `</tbody></table>`;
    printHtml(html);
  });
}
async function settleCustomerDebt(invId){
  const inv = state.invoices.find(i=>i.id===invId);
  if(!inv) return;
  const amountInp = document.querySelector(`.debt-settle-amount[data-inv="${invId}"]`);
  const methodSel = document.querySelector(`.debt-settle-method[data-inv="${invId}"]`);
  const remaining = invoiceRemaining(inv);
  const amount = parseFloat(amountInp.value) || remaining;
  if(amount<=0){ showToast("أدخل مبلغ سداد صحيح"); return; }
  if(amount - remaining > 0.01){ showToast(`المبلغ أكبر من المتبقي (${remaining.toFixed(0)} ريال)`); return; }
  const method = methodSel.value;
  if(!inv.payments) inv.payments=[];
  const snapshot = JSON.parse(JSON.stringify(state));
  const payment = {id:Date.now()+"-settle", date:todayStr(), cash: method==="cash"?amount:0, network: method==="network"?amount:0, receipt:"", recordedBy: currentUser.username, note:"سداد من شاشة مديونيات العملاء"};
  inv.payments.push(payment);
  applyPaymentToBalances(payment); // this was missing entirely before — the cash/network was never credited to any box
  if(await saveStateWithRollback(snapshot)){
    logAudit("customer_debt_settled", {invoiceNumber:inv.number, amount, method});
    showToast(`تم تسجيل سداد ${amount.toFixed(0)} ريال لفاتورة ${inv.number}`);
  }
}
async function payCreditDebt(invId, idx){
  const inv = state.invoices.find(i=>i.id===invId); if(!inv) return;
  const g = inv.garments[idx]; if(!g || !g.creditDelivered) return;
  const cashInp = document.querySelector(`.debt-cash[data-inv="${invId}"][data-idx="${idx}"]`);
  const networkInp = document.querySelector(`.debt-network[data-inv="${invId}"][data-idx="${idx}"]`);
  const receiptInp = document.querySelector(`.debt-receipt[data-inv="${invId}"][data-idx="${idx}"]`);
  const cash = parseFloat(cashInp.value)||0;
  const network = parseFloat(networkInp.value)||0;
  const receipt = receiptInp.value.trim();
  if(cash<=0 && network<=0){ showToast("أدخل مبلغ كاش أو شبكة"); return; }
  if(network>0 && !receipt){ showToast("أدخل رقم السند لدفعة الشبكة"); return; }
  const owed = creditGarmentOwed(g, inv);
  if((cash+network) - owed > 0.01){ showToast(`المبلغ أكبر من المتبقي على هذا الثوب (${owed.toFixed(0)} ريال)`); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  const payment = {id:newId(), date:todayStr(), cash, network, receipt, discount:0};
  inv.payments = inv.payments || [];
  inv.payments.push(payment);
  applyPaymentToBalances(payment);
  g.creditPaid += (cash+network);
  if(await saveStateWithRollback(snapshot)){
    logAudit("credit_debt_settled", {invoiceNumber:inv.number, garmentIdx:idx, cash, network});
    showToast("تم تسجيل السداد");
  }
}
async function saveDistribution(inv){
  const isAdmin = currentUser.role==="مدير";
  const intents = inv.garments.map((g,i)=>{
    const sSel=document.querySelector(`.dist-status[data-idx="${i}"]`), tInp=document.querySelector(`.dist-tailor[data-idx="${i}"]`);
    return { newStatus: sSel&&!sSel.disabled?sSel.value:g.status, newTailor: tInp&&!tInp.disabled?tInp.value.trim():g.tailor };
  });
  const prospectiveSale = inv.garments.reduce((a,g,i)=> a+(intents[i].newStatus==="ملغي"?0:garmentSalePrice(g)),0);
  const remaining = prospectiveSale - invoicePaid(inv) - invoiceDiscountTotal(inv);
  for(let i=0;i<inv.garments.length;i++){
    const g=inv.garments[i], intent=intents[i];
    if(intent.newStatus===g.status) continue;
    if((g.status==="تسليم"||g.status==="ملغي") && !isAdmin){ showToast("لا يمكن للمحاسب تغيير حالة ثوب مُسلَّم أو ملغي"); return; }
    if(g.status==="تفصيل"){ showToast("لا يمكن تغيير حالة ثوب \"تم التفصيل\" من هنا — يخص حساب الخياط فقط"); return; }
    if(intent.newStatus==="ملغي" && !isAdmin){ showToast("إلغاء الثوب متاح للمدير فقط"); return; }
    if(intent.newStatus==="تفصيل"){ showToast("الانتقال لـ\"تم التفصيل\" يخص حساب الخياط بس — يمسحها من شاشته الخاصة"); return; }
    if(intent.newStatus==="جاهز" && g.status!=="جاهز"){ showToast(`لا يمكن تحويل ثوب ${i+1} إلى "جاهز" مباشرة — لازم يخلص "تم التفصيل" من شاشة الخياط أولاً`); return; }
    if(intent.newStatus==="جاهز" && state.settings.qcEnabled && !g.qcPassedDate){ showToast(`ثوب ${i+1} لازم يجتاز فحص الجودة (من شاشة فحص الجودة) قبل ما يصير "جاهز"`); return; }
    if(intent.newStatus==="تسليم"){
      if(g.status!=="جاهز"){ showToast(`لا يمكن تسليم ثوب ${i+1} قبل اكتمال التفصيل فعلياً ووصوله لمرحلة "جاهز"`); return; }
      if(Math.abs(remaining)>0.01){ showToast(`لا يمكن التسليم قبل سداد كامل الفاتورة (المتبقي ${remaining.toFixed(0)} ريال)`); return; }
    }
  }
  const changes = inv.garments.map((g,i)=>({g, i, newStatus: intents[i].newStatus})).filter(c=>c.newStatus!==c.g.status);
  if(!changes.length){ showToast("ما فيه أي تغيير بالحالة لتسجيله"); return; }
  const changeLines = changes.map(c=>{
    const oldLabel = STATUSES.find(s=>s.v===c.g.status)?.label||c.g.status;
    const newLabel = STATUSES.find(s=>s.v===c.newStatus)?.label||c.newStatus;
    const tailorNote = c.newStatus==="تفصيل" ? ` (تُنسب لحساب الخياط ${esc(intents[c.i].newTailor||"—")})` : "";
    return `ثوب ${c.i+1}: ${oldLabel} ← ${newLabel}${tailorNote}`;
  }).join("\n");
  if(!await showConfirm(`تأكيد تحويل حالة فاتورة رقم ${esc(inv.number)}:\n\n${changeLines}\n\nمتابعة؟`)) return;
  const becameReady = changes.some(c=>c.newStatus==="جاهز");
  // open the tab NOW — right off the confirm-dialog click, our last fresh user gesture — before the
  // async save below, so it isn't popup-blocked; we navigate it to the real link once save succeeds
  const waPopup = becameReady ? openReadyWaPopup(inv) : null;
  const snapshot = JSON.parse(JSON.stringify(state));
  inv.garments.forEach((g,i)=>{
    const newStatus = intents[i].newStatus;
    if(newStatus!==g.status){
      if(newStatus==="ملغي"){ reverseGarmentAdvisory(g); returnFabricForGarment(g); reverseAddonsStock(g); g.cancelledDate = todayStr(); }
      else if(g.status==="ملغي") { applyGarmentAdvisory(g); if(g.itemCardId) reserveFabricForGarment(g); applyAddonsStock(g); }
      if(newStatus==="قص" && g.itemCardId && g.stockApplied==="reserved") consumeFabricForGarment(g, g.qtyUsed||0);
    }
    g.status=newStatus; g.tailor=intents[i].newTailor;
    if(g.status==="قص" && !g.cutDate) g.cutDate = todayStr();
    if(g.status==="جاهز" && !g.readyDate) g.readyDate = todayStr();
    if(g.status==="تسليم" && !g.deliveredDate) g.deliveredDate = todayStr();
  });
  if(!await saveStateWithRollback(snapshot)){ if(waPopup) waPopup.close(); return; }
  showToast("تم حفظ التوزيع");
  if(becameReady) finishReadyWaPopup(waPopup, "distWaReadyBanner", inv);
  else $("distWaReadyBanner").style.display = "none";
  $("distInvNumber").value=""; $("distArea").innerHTML=""; $("distInvNumber").focus();
}

// ---------------- monthly closing ----------------
// Shared close logic used by both the manual button (after password confirmation) and the
// automatic end-of-month close (no prompt, runs silently on login — see checkAutoCloseMonth).
// Never mutates state.users/state.permissions, so it's safe to save from any signed-in user,
// not just an admin.
async function closeMonthNow(m){
  if(isMonthClosed(m)) return false;
  const stateSnapshot = JSON.parse(JSON.stringify(state));
  const invs = state.invoices.filter(i=>i.originMonth===m);
  const monthlyFin = computeMonthlyFinancials(m);
  const readyCount = totalReadyGarmentsCount(); // snapshot BEFORE status mutation below turns undelivered "جاهز" garments into "معلقة"
  const overdueCount = overdueReadyGarments().length;
  let garmentCount=0, embroCount=0, embroRevenue=0;
  invs.forEach(inv=>{
    inv.garments.forEach(g=>{ if(g.status!=="ملغي") g.costSnapshot = liveGarmentCost(g); });
    inv.garments.forEach(g=>{
      if(g.status==="ملغي") return;
      garmentCount++;
      if(g.hasEmbroidery){ embroCount++; embroRevenue += (g.embroideryPrice||0); }
      // only a garment that was READY and not picked up is "معلقة" (stuck) — that's what every screen
      // reads it as. One still being cut/sewn/checked keeps its real stage so it can carry on normally
      // (turning it into معلقة froze it: no next step, and it showed as ready when it wasn't)
      if(g.status==="جاهز") g.status="معلقة";
    });
  });
  const pendingCustodyCarried = totalPendingCustody();
  // money actually received in the month (tailoring payments + ready-made sales + old-stock
  // collections, minus refunds) — this field just repeated the recognized revenue before
  const inMonth = d=> (d||"").slice(0,7)===m;
  const collectedTotal = state.invoices.reduce((a,inv)=> a + (inv.payments||[]).filter(p=>inMonth(p.date)).reduce((s,p)=>s+(p.cash||0)+(p.network||0),0), 0)
    + state.salesInvoices.filter(s=>inMonth(s.date) && s.payment).reduce((a,s)=>a+(s.payment.cash||0)+(s.payment.network||0),0)
    + (state.legacyPayments||[]).filter(l=>inMonth(l.date)).reduce((a,l)=>a+l.amount,0)
    - state.invoiceReturns.filter(r=>inMonth(r.date)).reduce((a,r)=>a+(r.refundAmount||0),0)
    - (state.salesReturns||[]).filter(r=>inMonth(r.date)).reduce((a,r)=>a+(r.refundAmount||0),0);
  state.closingReports.push({
    monthLabel:m, closedAt:serverDate().toISOString(), invoicedTotal:monthlyFin.revenue, costTotal:monthlyFin.cost, collectedTotal,
    profitInvoiced: monthlyFin.profit, profitCollected: monthlyFin.profit,
    garmentCount, embroCount, embroRevenue, invoiceCount: invs.length, pendingCustodyCarried,
    readyCount, overdueCount,
  });
  runPayrollForMonth(m);
  state.settings.currentMonth = nextMonthLabel(m);
  const saved = await saveState();
  if(!saved){
    if(!stateSaveConflict) state = stateSnapshot; // roll back the in-memory close/payroll so a retry starts clean (a conflict already reloaded the latest data)
    renderAll();
    return false;
  }
  logAudit("month_closed", {monthLabel:m, profit:monthlyFin.profit, garmentCount, invoiceCount:invs.length});
  return true;
}
async function performCloseMonth(){
  const m = state.settings.currentMonth;
  if(isMonthClosed(m)){ showToast("هذا الشهر مقفول أصلاً — ما يمكن إقفاله مرة ثانية"); return; }
  const isAdmin = currentUser.role==="مدير";
  if(!isAdmin){
    const [y,mo] = m.split("-").map(Number);
    const lastDayOfMonth = new Date(y, mo, 0);
    if(serverDate() <= lastDayOfMonth){ showToast("ما يمكن إقفال الشهر قبل انتهائه فعلياً — هذا متاح للمدير بس قبل نهاية الشهر"); return; }
  }
  if(!await confirmWithPassword(`بيتم إقفال شهر ${monthDisplay(m)}:\n- يتجمّد تقرير أرباح/خسائر نهائي لهذا الشهر.\n- أي ثوب جاهز ما انسلّم يتحول لحالة "معلقة" وينتقل لقائمة المتعثرة (الثياب اللي لسا بالإنتاج تكمل مرحلتها).\nأدخل كلمة مرورك للتأكيد.`)) return;
  // guard against a double-click (or a retry after a silent save failure) re-closing the same
  // month and re-running payroll a second time while the first close is still in flight
  const btn = $("closeMonthBtn");
  if(btn) btn.disabled = true;
  try{
    const ok = await closeMonthNow(m);
    if(!ok){
      if(isMonthClosed(m)){ showToast("هذا الشهر مقفول أصلاً — ما يمكن إقفاله مرة ثانية"); return; }
      showToast("تعذّر حفظ إقفال الشهر بالسحابة — لم يُقفل الشهر، تأكد من الاتصال بالإنترنت وحاول مرة ثانية");
      return;
    }
    renderAll();
    showToast("تم إقفال الشهر وتجميد التقرير");
  } finally {
    if(btn) btn.disabled = false;
  }
}
// Runs on every login (any role) — closes any month(s) whose last calendar day has already
// passed, with no prompt. Safe to run from a non-admin session: closeMonthNow() never touches
// state.users/permissions, so the write isn't admin-gated. Loops in case the app wasn't opened
// for more than one month.
let autoCloseInFlight = false;
async function checkAutoCloseMonth(){
  if(autoCloseInFlight) return;
  autoCloseInFlight = true;
  try{
    let closedAny = false;
    for(let guard=0; guard<24; guard++){ // hard cap so a bug can't loop forever
      const m = state.settings.currentMonth;
      if(isMonthClosed(m)) break;
      const [y,mo] = m.split("-").map(Number);
      const lastDayOfMonth = new Date(y, mo, 0);
      if(serverDate() <= lastDayOfMonth) break; // month hasn't ended yet
      const label = monthDisplay(m);
      const ok = await closeMonthNow(m);
      if(!ok) break; // save failed (offline, etc.) — try again next login
      closedAny = true;
      showToast(`تم إقفال شهر ${label} تلقائياً`);
    }
    if(closedAny) renderAll();
  } finally {
    autoCloseInFlight = false;
  }
}
// when the sewing counts as done: the quality-check pass when there is one; a garment sent back
// for repair (back at قص) or still waiting for its check doesn't count yet
function garmentSewnDate(g){
  if(g.qcPassedDate) return g.qcPassedDate;
  if(!g.tailorCompletedDate) return null;
  if(g.status==="جديد" || g.status==="قص") return null;
  if(state.settings.qcEnabled && g.status==="تفصيل") return null;
  return g.tailorCompletedDate;
}
function garmentQualifiesForCommission(g){
  const basis = state.settings.commissionBasis||"تسليم";
  return basis==="تفصيل" ? !!garmentSewnDate(g) : g.status==="تسليم";
}
function commissionQualifyingDate(g){
  const basis = state.settings.commissionBasis||"تسليم";
  return basis==="تفصيل" ? garmentSewnDate(g) : g.deliveredDate;
}
// a garment's wage is paid in exactly one month: once payroll has run for it, a later date change
// (re-sewn after a failed check, then passed in a later month) must not pay it a second time
function garmentWagePaidElsewhere(g, monthLabel){
  return !!(g.wagePaidOut && g.wagePaidMonth && g.wagePaidMonth!==monthLabel);
}
function computeEmployeeEntitlement(user, monthLabel){
  let garmentCount = 0, commission = 0, base = 0;
  if(user.role==="خياط"){
    state.invoices.forEach(inv=> inv.garments.forEach(g=>{
      // policy: a garment cancelled before the month is closed earns no wage — even if cutting or
      // sewing had already started. Payroll runs only at month close, so its status then decides.
      if(g.tailor!==user.username || g.status==="ملغي") return;
      if(!garmentQualifiesForCommission(g) || garmentWagePaidElsewhere(g, monthLabel)) return;
      const qd = commissionQualifyingDate(g);
      if(qd && qd.slice(0,7)===monthLabel){
        garmentCount++;
        commission += tailorWageFor(g);
      }
    }));
  } else {
    state.invoices.forEach(inv=>{
      if(inv.createdBy!==user.username) return;
      inv.garments.forEach(g=>{
        if(g.status==="ملغي") return;
        if(!garmentQualifiesForCommission(g)) return;
        const qd = commissionQualifyingDate(g);
        if(qd && qd.slice(0,7)===monthLabel) garmentCount++;
      });
    });
    state.salesInvoices.forEach(inv=>{
      if(inv.recordedBy===user.username && (inv.date||"").slice(0,7)===monthLabel) garmentCount += inv.items.reduce((a,it)=>a+it.qty,0);
    });
    (state.salesReturns||[]).forEach(r=>{
      if(r.saleRecordedBy===user.username && (r.date||"").slice(0,7)===monthLabel) garmentCount -= r.lines.reduce((a,l)=>a+l.qty,0);
    });
    base = user.baseSalary||0;
    if(user.commissionEnabled) commission = garmentCount * (user.commissionRate||0);
  }
  return { base, commission, garmentCount, total: base+commission };
}
function runPayrollForMonth(monthLabel){
  state.users.forEach(u=>{
    const ent = computeEmployeeEntitlement(u, monthLabel);
    if(ent.total>0.001){
      let detail;
      if(u.role==="خياط") detail = ` (${ent.garmentCount} ثوب — إجمالي ${ent.commission.toFixed(0)} ريال حسب فئة كل ثوب)`;
      else if(ent.commission) detail = ` (أساسي ${ent.base.toFixed(0)} + عمولة ${ent.commission.toFixed(0)} عن ${ent.garmentCount} ثوب)`;
      else detail = "";
      state.payrollLedger.push({id:Date.now()+"-"+u.username, username:u.username, type:"entitlement", amount:ent.total, date:todayStr(), monthLabel, garmentCount:ent.garmentCount, note:`استحقاق ${monthDisplay(monthLabel)}${detail}`});
      if(u.role==="خياط"){
        state.invoices.forEach(inv=> inv.garments.forEach(g=>{
          if(g.tailor===u.username && garmentQualifiesForCommission(g)){
            const qd = commissionQualifyingDate(g);
            if(qd && qd.slice(0,7)===monthLabel && !garmentWagePaidElsewhere(g, monthLabel)){ g.wagePaidOut = true; g.wagePaidMonth = monthLabel; }
          }
        }));
      }
    }
  });
}
function employeeBalance(username){
  return state.payrollLedger.filter(e=>e.username===username).reduce((sum,e)=> (e.type==="entitlement"||e.type==="bonus") ? sum+e.amount : sum-e.amount, 0);
}
// Advance policy: no advance until the employee's first month of work has been fully completed
// AND closed (payroll run), and only against a balance actually due to them.
// Employees added before the start date was recorded qualify once any month has been closed with
// an entitlement for them (their first month is by then necessarily behind them).
function advanceEligibility(username){
  const u = state.users.find(x=>x.username===username);
  if(!u) return {ok:false, msg:"الموظف غير موجود"};
  if(u.joinedDate){
    const firstMonth = u.joinedDate.slice(0,7);
    if(!isMonthClosed(firstMonth)) return {ok:false, msg:`ما يمكن صرف سلفة لـ${username} قبل إتمام وإقفال أول شهر عمل له (${monthDisplay(firstMonth)})`};
  } else if(!state.payrollLedger.some(e=>e.username===username && e.type==="entitlement")){
    return {ok:false, msg:`ما يمكن صرف سلفة لـ${username} قبل إقفال أول شهر له وتسجيل استحقاق (حدّد تاريخ بداية عمله من إعدادات المستخدمين)`};
  }
  const balance = employeeBalance(username);
  if(balance <= 0.01) return {ok:false, msg:`ما يمكن صرف سلفة لـ${username} — ما له رصيد مستحق حالياً`};
  return {ok:true, balance};
}
function addPayrollEntry(username, type, amount, boxId, note){
  if(amount<=0) return {ok:false,msg:"أدخل مبلغ صحيح"};
  if(type==="advance"){ const el = advanceEligibility(username); if(!el.ok) return el; }
  if(type==="deduction" && !note.trim()) return {ok:false,msg:"أدخل ملاحظة توضح سبب الخصم"};
  const balance = employeeBalance(username);
  if((type==="payment"||type==="advance") && amount - balance > 0.01) return {ok:false,msg:`المبلغ أكبر من المستحق (${balance.toFixed(0)} ريال)`};
  if(type==="payment"||type==="advance"){
    const box = findCashBox(boxId);
    if(!box) return {ok:false,msg:"اختر صندوق الدفع"};
    if(boxTotal(box) < amount) return {ok:false,msg:`الرصيد غير كافٍ بالصندوق (المتاح ${boxTotal(box).toFixed(0)} ريال)`};
    box.balance -= amount;
  }
  state.payrollLedger.push({id:newId(), username, type, amount, date:todayStr(), note, recordedBy:currentUser.username, boxId:(type==="payment"||type==="advance") ? boxId : null});
  // tailors are paid through payroll, not the expenses screen — so their pay has to draw the
  // "wages" guideline balance down here, or it only ever grew
  const payee = state.users.find(u=>u.username===username);
  if(payee && payee.role==="خياط" && (type==="payment"||type==="advance")) state.advisory.wages -= amount;
  return {ok:true};
}

