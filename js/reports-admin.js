// ---------------- broadcast campaign (marketing lists) ----------------
const BROADCAST_PAGE_SIZE = 50;
let broadcastPage = 0;
function customerDisplayName(cust){ return cust.individuals.map(i=>i.name).join(" / ") || "—"; }
function customerLastInvoiceDate(mobile){
  let last = null;
  state.invoices.forEach(inv=>{ if(inv.customerMobile===mobile && (!last || inv.date>last)) last = inv.date; });
  return last;
}
function customerIsOverdue(mobile){
  const alert = getCustomerStandingAlert(mobile);
  return !!alert;
}
function buildBroadcastList(){
  const tierFilter = $("bcTierFilter").value;
  const activityFilter = $("bcActivityFilter").value;
  const debtFilter = $("bcDebtFilter").value;
  const q = ($("bcSearchInput").value||"").trim();
  let list = state.customers.slice();
  if(q) list = list.filter(c=> c.mobile.includes(q) || customerDisplayName(c).includes(q));
  if(tierFilter!=="all") list = list.filter(c=> customerTier(c.mobile)===tierFilter);
  if(activityFilter!=="all"){
    list = list.filter(c=>{
      const lastDate = customerLastInvoiceDate(c.mobile);
      const dormant = isDormant(lastDate);
      return activityFilter==="dormant" ? dormant : !dormant;
    });
  }
  if(debtFilter==="overdue") list = list.filter(c=> customerIsOverdue(c.mobile));
  if(debtFilter==="clean") list = list.filter(c=> !customerIsOverdue(c.mobile));
  list.sort((a,b)=> (a.code||0)-(b.code||0));
  return list;
}
function renderBroadcastList(){
  const wrap = $("broadcastListView");
  if(!wrap) return;
  const list = buildBroadcastList();
  $("broadcastCountLabel").textContent = `عدد النتائج: ${list.length}`;
  const totalPages = Math.max(1, Math.ceil(list.length/BROADCAST_PAGE_SIZE));
  if(broadcastPage >= totalPages) broadcastPage = totalPages-1;
  if(broadcastPage < 0) broadcastPage = 0;
  const pageItems = list.slice(broadcastPage*BROADCAST_PAGE_SIZE, (broadcastPage+1)*BROADCAST_PAGE_SIZE);
  const template = $("bcMessageInput").value || state.settings.waPromoMessage;
  wrap.innerHTML = pageItems.length ? pageItems.map(c=>{
    const sent = state.broadcastCampaign.sentMobiles.includes(c.mobile);
    const greetName = c.individuals[0]?.name || "";
    const personalizedMsg = `مرحباً ${greetName}، ${template}`;
    return `<div class="item-row" style="justify-content:space-between;">
      <span>${c.code} — ${esc(customerDisplayName(c))} — ${esc(c.mobile)}</span>
      <span style="display:flex;align-items:center;gap:8px;">
        ${sent ? `<span style="color:var(--profit);font-weight:700;">أُرسلت</span>` : ""}
        <a href="${waLink(c.mobile, personalizedMsg)}" target="_blank" class="icon-btn" style="${sent?'opacity:0.5;':''}" onclick="markBroadcastSent('${c.mobile}')" title="إرسال واتساب"><i data-lucide="message-circle"></i></a>
      </span>
    </div>`;
  }).join("") : `<p class="sub">ما فيه عملاء مطابقين لهذا الفلتر.</p>`;
  $("broadcastPageLabel").textContent = `صفحة ${broadcastPage+1} من ${totalPages}`;
}
function markBroadcastSent(mobile){
  if(!state.broadcastCampaign.sentMobiles.includes(mobile)) state.broadcastCampaign.sentMobiles.push(mobile);
  saveState(); renderBroadcastList();
}
function exportBroadcastToExcel(){
  const list = buildBroadcastList();
  if(!list.length){ showToast("ما فيه عملاء بالقائمة الحالية للتصدير"); return; }
  const template = $("bcMessageInput").value || state.settings.waPromoMessage;
  const rows = [["الكود","الاسم","رقم الجوال","نص الرسالة"]];
  list.forEach(c=>{
    const greetName = c.individuals[0]?.name || "";
    const personalizedMsg = `مرحباً ${greetName}، ${template}`;
    rows.push([c.code, customerDisplayName(c), c.mobile, personalizedMsg]);
  });
  const csvContent = rows.map(r=> r.map(cell=> `"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF"+csvContent], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `broadcast-campaign-${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`تم تصدير ${list.length} عميل لملف إكسل`);
}
async function resetBroadcastCampaign(){
  if(!await showConfirm("متأكد تبي تبدأ حملة جديدة؟ بيتصفر مؤشر (تم الإرسال) لكل العملاء.")) return;
  state.broadcastCampaign.sentMobiles = [];
  saveState(); renderBroadcastList();
  showToast("بدأت حملة جديدة");
}
function renderCustomers(){
  $("totalCustomersCount").textContent = `إجمالي عدد العملاء المسجّلين: ${state.customers.length}`;
  const q=($("customerSearch").value||"").trim(); const filter=$("customerFilter").value;
  let customers = getCustomers().filter(c=>customerMatchesFilter(c, filter));
  if(q) customers = customers.filter(c=>c.mobile.includes(q));
  const tbody=$("customersBody"); tbody.innerHTML="";
  if(customers.length===0){ tbody.innerHTML=`<tr><td colspan="7">${emptyStateHtml("users","لا نتائج")}</td></tr>`; refreshLucideIcons(); return; }
  const isAdmin = currentUser && currentUser.role==="مدير";
  customers.forEach(c=>{
    const waBtn = filter==="dormant" ? `<a href="${waLink(c.mobile, state.settings.waPromoMessage)}" target="_blank" class="icon-btn" title="إرسال عرض واتساب"><i data-lucide="message-circle"></i></a>` : "";
    const cust = findCustomerByMobile(c.mobile);
    const individual = cust ? cust.individuals.find(i=>i.name===c.name) : null;
    const displayCode = individual ? individual.subCode : (cust ? cust.code : "—");
    let loyaltyCell;
    if(cust && cust.vip){
      loyaltyCell = isAdmin ? `<label style="display:flex;align-items:center;gap:4px;font-size:12px;">VIP <input type="checkbox" class="cust-vip-toggle" data-mobile="${c.mobile}" checked></label>` : `VIP`;
    } else {
      const tier = customerTier(c.mobile);
      const pts = cust ? (cust.loyaltyPoints||0) : 0;
      loyaltyCell = `${tierLabel(tier)}<br><span class="sub">${pts} نقطة</span>${isAdmin?`<br><label style="display:flex;align-items:center;gap:4px;font-size:11px;"><input type="checkbox" class="cust-vip-toggle" data-mobile="${c.mobile}"> اجعله VIP</label>`:""}`;
    }
    tbody.innerHTML += `<tr><td>${esc(displayCode)}</td><td>${esc(c.name)} ${c.mobile?`<a href="${waLink(c.mobile)}" target="_blank" class="icon-btn" title="فتح واتساب"><i data-lucide="message-circle"></i></a>`:""}</td><td>${esc(c.mobile)}</td><td>${c.lastDate||"—"}</td><td>${c.count}</td><td>${loyaltyCell}</td><td><button class="btn btn-ghost btn-sm" onclick="showCustomerReport('${c.mobile}','${esc(c.name).replace(/'/g,"\\'")}')">تقرير العميل</button> ${waBtn}</td></tr>`;
  });
  document.querySelectorAll(".cust-vip-toggle").forEach(cb=> cb.addEventListener("change", ()=>{
    const mobile = cb.dataset.mobile;
    let cust = findCustomerByMobile(mobile);
    if(!cust){ cust = {id:newId(), code:nextCustomerCode(), mobile, individuals:[], loyaltyPoints:0, vip:false}; state.customers.push(cust); }
    cust.vip = cb.checked;
    if(cust.vip) cust.loyaltyPoints = 0;
    saveState(); renderAll();
    showToast(cust.vip ? "تم تفعيل VIP لهذا العميل" : "تم إلغاء VIP لهذا العميل");
  }));
  refreshLucideIcons();
}
function saveCustomerNotes(mobile){
  let cust = findCustomerByMobile(mobile);
  if(!cust){ cust = {id:newId(), code:nextCustomerCode(), mobile, individuals:[], loyaltyPoints:0, vip:false}; state.customers.push(cust); }
  cust.notes = $("customerNotesInput").value;
  saveState();
  showToast("تم حفظ الملاحظات");
}
function showCustomerReport(mobile, filterName){
  const invs = state.invoices.filter(i=>(i.customerMobile||"").trim()===mobile && (!filterName || i.customerName===filterName));
  if(!invs.length){ $("customerReportView").innerHTML=`<p class="sub">ما فيه فواتير لهذا العميل.</p>`; return; }
  const name = filterName || invs.find(i=>i.customerName)?.customerName || "—";
  let totalSale=0, totalPaid=0, totalDiscount=0;
  const cust = findCustomerByMobile(mobile);
  const lastInvDate = invs.reduce((max,i)=> (i.date||"")>max ? i.date : max, "");
  const lastGarment = findLastGarmentDataForCustomer(mobile, filterName);
  const measurementsHtml = lastGarment ? `<div class="order-summary-card" style="margin-top:12px;">
      <div class="order-summary-head"><span class="order-summary-number" style="font-size:14px;">آخر قياسات مسجّلة</span></div>
      <div class="order-summary-grid" style="grid-template-columns:repeat(4,1fr);">
        ${MEASUREMENT_FIELDS.filter(f=> lastGarment.measurements[f.key]!==undefined && lastGarment.measurements[f.key]!==null && lastGarment.measurements[f.key]!=="")
          .map(f=> `<div><div class="order-summary-lbl">${esc(f.label)}</div><div class="order-summary-val">${esc(lastGarment.measurements[f.key])}</div></div>`).join("")}
      </div>
    </div>` : "";
  const notesHtml = `<div class="order-summary-card" style="margin-top:12px;">
      <div class="order-summary-head"><span class="order-summary-number" style="font-size:14px;">ملاحظات عن العميل</span></div>
      <textarea id="customerNotesInput" rows="3" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:9px 12px;color:var(--ivory);font-family:inherit;font-size:13px;">${esc(cust?.notes||"")}</textarea>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="saveCustomerNotes('${mobile}')">حفظ الملاحظات</button>
    </div>`;
  const profileHtml = `<div class="order-summary-card">
      <div class="order-summary-head"><span class="order-summary-number">${esc(name)}</span>${mobile?`<a href="${waLink(mobile)}" target="_blank" class="icon-btn" title="فتح واتساب" style="margin-right:8px;"><i data-lucide="message-circle"></i></a>`:""}</div>
      <div class="order-summary-grid">
        <div><div class="order-summary-lbl">رقم الجوال</div><div class="order-summary-val">${esc(mobile)}</div></div>
        <div><div class="order-summary-lbl">عدد الطلبات</div><div class="order-summary-val">${invs.length}</div></div>
        <div><div class="order-summary-lbl">آخر طلب</div><div class="order-summary-val">${lastInvDate||"—"}</div></div>
        <div><div class="order-summary-lbl">المستوى</div><div class="order-summary-val">${cust&&cust.vip?"VIP":tierLabel(customerTier(mobile))}</div></div>
      </div>
    </div>`;
  let html = profileHtml + measurementsHtml;
  html += `<div class="stitch"></div><h3 style="font-size:14px;margin:0 0 10px;">الطلبات السابقة</h3>`;
  invs.slice().sort((a,b)=> (a.date||"").localeCompare(b.date||"")).forEach(inv=>{
    const s=invoiceSaleTotal(inv), paid=invoicePaid(inv), disc=invoiceDiscountTotal(inv);
    totalSale+=s; totalPaid+=paid; totalDiscount+=disc;
    html += `<div class="garment-card"><span class="tag">فاتورة ${esc(inv.number)} — ${inv.date||"—"} (${monthDisplay(inv.originMonth)})</span>
      <table style="margin-top:8px;"><thead><tr><th>نوع القماش</th><th>السعر</th><th>الحالة</th></tr></thead><tbody>
      ${inv.garments.map(g=>`<tr><td>${esc(g.fabricType)}</td><td>${garmentSalePrice(g).toFixed(0)} ﷼</td><td>${STATUSES.find(x=>x.v===g.status)?.label||g.status}</td></tr>`).join("")}
      </tbody></table>
      <p class="sub" style="margin:8px 0 4px;">الدفعات:</p>
      ${(inv.payments&&inv.payments.length) ? `<table><thead><tr><th>التاريخ</th><th>كاش</th><th>سند الكاش</th><th>شبكة</th><th>سند الشبكة</th><th>خصم</th></tr></thead><tbody>
        ${inv.payments.map(p=>`<tr><td>${p.date||"—"}</td><td>${(p.cash||0).toFixed(0)} ﷼</td><td>${p.cashReceiptNo||"—"}</td><td>${(p.network||0).toFixed(0)} ﷼</td><td>${p.networkReceiptNo||p.receipt||"—"}</td><td>${p.discount?p.discount.toFixed(0)+" ﷼":"—"}</td></tr>`).join("")}
        </tbody></table>` : `<p class="sub">ما فيه دفعات مسجّلة.</p>`}
      <p class="sub" style="margin-top:6px;">إجمالي الفاتورة: ${s.toFixed(0)} ﷼ — المدفوع: ${paid.toFixed(0)} ﷼${disc?` — خصم: ${disc.toFixed(0)} ﷼`:""} — المتبقي: ${invoiceRemaining(inv).toFixed(0)} ﷼</p>
    </div>`;
  });
  html += `<div class="remaining-box"><span>إجمالي كل الفواتير: ${totalSale.toFixed(0)} ﷼ — إجمالي المدفوع: ${totalPaid.toFixed(0)} ﷼${totalDiscount?` — إجمالي الخصم: ${totalDiscount.toFixed(0)} ﷼`:""}</span><span class="amt">إجمالي المتبقي: ${(totalSale-totalPaid-totalDiscount).toFixed(0)} ﷼</span></div>`;
  html += notesHtml;
  $("customerReportView").innerHTML = html;
  refreshLucideIcons();
}

// ---------------- daily report ----------------
function buildDailyReport(day){
  const newInvoices = state.invoices.filter(i=>i.date===day);
  const deliveredThisMonth = [];
  const deliveredOverdue = [];
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{
    if(g.deliveredDate===day){
      if(inv.originMonth===state.settings.currentMonth) deliveredThisMonth.push({inv,g});
      else deliveredOverdue.push({inv,g});
    }
  }));
  const legacyDelivered = state.legacyItems.filter(x=>x.lastDeliveryDate===day || x.deliveredDate===day);
  const vouchersToday = state.vouchers.filter(v=>v.date===day);
  const expensesToday = state.expenses.filter(e=>e.date===day);
  const expensesTotal = expensesToday.reduce((a,e)=>a+e.amount,0);
  const openingAdjustmentsToday = (state.openingBalanceAdjustments||[]).filter(a=>a.date===day);
  let cash=0, network=0, discount=0; const paymentRows=[];
  state.invoices.forEach(inv=> (inv.payments||[]).forEach(p=>{
    if(p.date===day){ cash+=p.cash||0; network+=p.network||0; discount+=p.discount||0; paymentRows.push({inv,p}); }
  }));
  // ready-made sales, their returns and tailoring refunds of the day — none of these were in the report
  const salesToday = state.salesInvoices.filter(s=>(s.payment&&s.payment.date||s.date)===day);
  const saleReturnsToday = (state.salesReturns||[]).filter(r=>r.date===day);
  const refundsToday = state.invoiceReturns.filter(r=>r.date===day && r.refundAmount);
  // every box movement of the day, split by box type — the real in/out of cash and of network
  const boxType = id=> (findCashBox(id)||{}).type;
  const moves = collectBoxMovements().filter(m=>m.date===day);
  const sumType = (t, sign)=> moves.filter(m=>boxType(m.boxId)===t && Math.sign(m.amount)===sign).reduce((a,m)=>a+m.amount,0);
  const flows = {cashIn:sumType("cash",1), cashOut:-sumType("cash",-1), netIn:sumType("network",1), netOut:-sumType("network",-1)};
  return {newInvoices, deliveredThisMonth, deliveredOverdue, legacyDelivered, vouchersToday, expensesToday, expensesTotal, openingAdjustmentsToday, cash, network, discount, paymentRows, salesToday, saleReturnsToday, refundsToday, flows, moves};
}
function renderDailyPreview(){
  const day = $("dailyDate").value || todayStr();
  const r = buildDailyReport(day);
  $("dailyPreview").innerHTML = `
    <div class="report-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="report-card"><div class="st">فواتير جديدة</div><div class="amt">${r.newInvoices.length}</div></div>
      <div class="report-card"><div class="st">تسليم هذا الشهر</div><div class="amt">${r.deliveredThisMonth.length}</div></div>
      <div class="report-card"><div class="st">تسليم متعثر سابق</div><div class="amt">${r.deliveredOverdue.length}</div></div>
      <div class="report-card"><div class="st">كاش / شبكة / خصم اليوم</div><div class="amt" style="font-size:13px;">${r.cash.toFixed(0)} / ${r.network.toFixed(0)} / ${r.discount.toFixed(0)} ﷼</div></div>
    </div>`;
  $("dailyReportView").innerHTML = buildDailyReportHtml(day, r);
  const searchInp = $("dailyReceiptSearchInput");
  if(searchInp) searchInp.addEventListener("input", ()=>{
    const q = searchInp.value.trim();
    document.querySelectorAll("#dailyPaymentsTable tbody tr").forEach(tr=>{
      tr.style.display = (!q || (tr.dataset.receipt||"").includes(q)) ? "" : "none";
    });
  });
}
function buildDailyReportHtml(day, r){
  let html = `<h2>التقرير اليومي — ${day}</h2>`;
  html += `<h3>فواتير جديدة اليوم (${r.newInvoices.length})</h3><table><thead><tr><th>رقم</th><th>العميل</th><th>عدد الثياب</th><th>الإجمالي</th></tr></thead><tbody>`;
  r.newInvoices.forEach(inv=> html+=`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${inv.garments.length}</td><td>${invoiceSaleTotal(inv).toFixed(0)} ﷼</td></tr>`);
  if(!r.newInvoices.length) html+=`<tr><td colspan="4">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3>تسليمات اليوم — من الشهر الحالي (${r.deliveredThisMonth.length})</h3><table><thead><tr><th>رقم الفاتورة</th><th>نوع القماش</th><th>السعر</th><th>رقم الإيصال</th></tr></thead><tbody>`;
  r.deliveredThisMonth.forEach(({inv,g})=> html+=`<tr><td>${esc(inv.number)}</td><td>${esc(g.fabricType)}</td><td>${garmentSalePrice(g).toFixed(0)} ﷼</td><td>${g.deliveryReceipt||"—"}</td></tr>`);
  if(!r.deliveredThisMonth.length) html+=`<tr><td colspan="4">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3>تسليمات اليوم — متعثرة من أشهر سابقة (${r.deliveredOverdue.length})</h3><table><thead><tr><th>رقم الفاتورة</th><th>الشهر الأصلي</th><th>نوع القماش</th><th>السعر</th><th>رقم الإيصال</th></tr></thead><tbody>`;
  r.deliveredOverdue.forEach(({inv,g})=> html+=`<tr><td>${esc(inv.number)}</td><td>${monthDisplay(inv.originMonth)}</td><td>${esc(g.fabricType)}</td><td>${garmentSalePrice(g).toFixed(0)} ﷼</td><td>${g.deliveryReceipt||"—"}</td></tr>`);
  if(!r.deliveredOverdue.length) html+=`<tr><td colspan="5">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3>تسليمات الجرد الافتتاحي اليوم (${r.legacyDelivered.length})</h3><table><thead><tr><th>اسم العميل</th><th>الجوال</th><th>الوصف</th><th>المتبقي وقت التسليم</th></tr></thead><tbody>`;
  r.legacyDelivered.forEach(x=> html+=`<tr><td>${esc(x.name)}</td><td>${esc(x.mobile)}</td><td>${esc(x.desc)}</td><td>${x.remaining?x.remaining.toFixed(0)+" ﷼":"—"}</td></tr>`);
  if(!r.legacyDelivered.length) html+=`<tr><td colspan="4">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3>سندات القبض والصرف اليوم (${r.vouchersToday.length})</h3><table><thead><tr><th>رقم السند</th><th>النوع</th><th>المبلغ</th><th>الطرف</th><th>السبب</th></tr></thead><tbody>`;
  r.vouchersToday.forEach(v=> html+=`<tr><td>${v.voucherNo}</td><td>${v.type==="receipt"?"قبض":"صرف"}</td><td>${v.amount.toFixed(0)} ﷼</td><td>${esc(v.party)}</td><td>${esc(v.reason)}</td></tr>`);
  if(!r.vouchersToday.length) html+=`<tr><td colspan="5">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3>المصروفات اليوم (${r.expensesToday.length}) — الإجمالي: ${r.expensesTotal.toFixed(0)} ﷼</h3><table><thead><tr><th>البند</th><th>المبلغ</th><th>صُرف لـ</th><th>ملاحظات</th></tr></thead><tbody>`;
  r.expensesToday.forEach(e=>{ const cat = state.expenseCategories.find(c=>c.id===e.categoryId); html+=`<tr><td>${cat?esc(cat.label):"—"}</td><td>${e.amount.toFixed(0)} ﷼</td><td>${esc(e.paidTo||"—")}</td><td>${esc(e.notes||"—")}</td></tr>`; });
  if(!r.expensesToday.length) html+=`<tr><td colspan="4">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3>تعديلات رصيد أول المدة اليوم (${r.openingAdjustmentsToday.length})</h3><table><thead><tr><th>الصنف</th><th>من</th><th>إلى</th><th>بواسطة</th></tr></thead><tbody>`;
  r.openingAdjustmentsToday.forEach(a=> html+=`<tr><td>${esc(a.cardName)}</td><td>${a.oldValue.toFixed(1)}</td><td>${a.newValue.toFixed(1)}</td><td>${esc(a.username)}</td></tr>`);
  if(!r.openingAdjustmentsToday.length) html+=`<tr><td colspan="4">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<div id="dailyReceiptSearchWrap" class="no-print"><div class="field"><label>بحث برقم الإيصال (كاش أو شبكة)</label><input type="text" id="dailyReceiptSearchInput" placeholder="اكتب رقم الإيصال..."></div></div>`;
  html += `<h3>الدفعات اليوم — كاش: ${r.cash.toFixed(0)} ﷼ / شبكة: ${r.network.toFixed(0)} ﷼ / خصم: ${r.discount.toFixed(0)} ﷼</h3><table id="dailyPaymentsTable"><thead><tr><th>رقم الفاتورة</th><th>كاش</th><th>سند الكاش</th><th>شبكة</th><th>سند الشبكة</th><th>خصم</th></tr></thead><tbody>`;
  r.paymentRows.forEach(({inv,p})=> html+=`<tr data-receipt="${esc((p.cashReceiptNo||"")+" "+(p.networkReceiptNo||p.receipt||""))}"><td>${esc(inv.number)}</td><td>${p.cash.toFixed(0)} ﷼</td><td>${p.cashReceiptNo||"—"}</td><td>${p.network.toFixed(0)} ﷼</td><td>${p.networkReceiptNo||p.receipt||"—"}</td><td>${p.discount?p.discount.toFixed(0)+" ﷼":"—"}</td></tr>`);
  if(!r.paymentRows.length) html+=`<tr><td colspan="6">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  const saleTotal = s=> saleNetTotal(s);
  html += `<h3>فواتير المبيعات (أصناف جاهزة) اليوم (${r.salesToday.length})</h3><table><thead><tr><th>رقم</th><th>العميل</th><th>كاش</th><th>شبكة</th><th>الإجمالي</th></tr></thead><tbody>`;
  r.salesToday.forEach(s=> html+=`<tr><td>${esc(s.number)}</td><td>${esc(s.customerName||"—")}</td><td>${((s.payment||{}).cash||0).toFixed(0)} ﷼</td><td>${((s.payment||{}).network||0).toFixed(0)} ﷼</td><td>${saleTotal(s).toFixed(0)} ﷼</td></tr>`);
  if(!r.salesToday.length) html+=`<tr><td colspan="5">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3>المرتجعات والمبالغ المستردة اليوم (${r.refundsToday.length + r.saleReturnsToday.length})</h3><table><thead><tr><th>النوع</th><th>الفاتورة</th><th>المبلغ المسترد</th><th>السبب</th></tr></thead><tbody>`;
  r.refundsToday.forEach(x=> html+=`<tr><td>مرتجع فاتورة تفصيل</td><td>${esc(x.invoiceNumber)}</td><td>${x.refundAmount.toFixed(0)} ﷼</td><td>${esc(x.reason||"—")}</td></tr>`);
  r.saleReturnsToday.forEach(x=> html+=`<tr><td>مرتجع مبيعات</td><td>${esc(x.saleInvoiceNumber)}</td><td>${x.refundAmount.toFixed(0)} ﷼</td><td>${esc(x.reason||"—")}</td></tr>`);
  if(!r.refundsToday.length && !r.saleReturnsToday.length) html+=`<tr><td colspan="4">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  // real movement of every box today (all sources: payments, sales, vouchers, expenses, refunds,
  // purchases, suppliers, salaries, transfers) — the old "net = cash − expenses" ignored most of these
  const f = r.flows;
  html += `<div class="report-grid" style="grid-template-columns:repeat(3,1fr);margin-top:14px;">
    <div class="report-card"><div class="st">الكاش — داخل / خارج</div><div class="amt" style="font-size:14px;">${f.cashIn.toFixed(0)} / ${f.cashOut.toFixed(0)} ﷼</div></div>
    <div class="report-card"><div class="st">الشبكة — داخل / خارج (بعد رسوم البنك)</div><div class="amt" style="font-size:14px;">${f.netIn.toFixed(0)} / ${f.netOut.toFixed(0)} ﷼</div></div>
    <div class="report-card"><div class="st">صافي حركة الصناديق اليوم</div><div class="amt">${(f.cashIn-f.cashOut+f.netIn-f.netOut).toFixed(0)} ﷼</div></div>
  </div>
  <p class="sub" style="margin-top:6px;">صافي الكاش اليوم: ${(f.cashIn-f.cashOut).toFixed(0)} ﷼ — يشمل كل الحركات المسجّلة (دفعات، مبيعات، سندات، مصروفات، مرتجعات، مشتريات، موردين، رواتب، تحويلات).</p>`;
  return html;
}
function printDaily(){
  const day = $("dailyDate").value || todayStr();
  const r = buildDailyReport(day);
  const html = buildDailyReportHtml(day, r);
  $("dailyReportView").innerHTML = html;
  printHtml(html);
}
function findMissingReceiptInvoices(){
  const rows=[];
  state.invoices.forEach(inv=> (inv.payments||[]).forEach(p=>{
    const missingCash = (p.cash||0)>0 && !p.cashReceiptNo;
    const missingNetwork = (p.network||0)>0 && !((p.networkReceiptNo||p.receipt)+"").trim();
    if(missingCash || missingNetwork) rows.push({inv,p});
  }));
  let html;
  if(!rows.length){
    html = `<p class="sub" style="margin-top:10px;">ما فيه دفعات ناقصة رقم سند.</p>`;
  } else {
    html = `<div class="table-wrap" style="margin-top:10px;"><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>تاريخ الدفعة</th><th>كاش</th><th>شبكة</th></tr></thead><tbody>`;
    rows.forEach(({inv,p})=> html+=`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${p.date||"—"}</td><td>${(p.cash||0).toFixed(0)} ﷼</td><td>${(p.network||0).toFixed(0)} ﷼</td></tr>`);
    html += `</tbody></table></div>`;
  }
  $("missingReceiptView").innerHTML = html;
}

function isStandalone(){ return window.navigator.standalone===true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
function safePrint(){ try{ window.print(); }catch(e){} }
function printHtml(html){ $("dynamicPageSize").textContent = ""; $("printArea").innerHTML = html; safePrint(); }
// ---------------- reusable period filter (this month / all / custom range) ----------------
// ---------------- comprehensive activity log (all sections, extended periods) ----------------
function extendedPeriodPickerHtml(prefix){
  return `<div class="row-2">
    <div class="field"><label>الفترة</label><select id="${prefix}Mode">
      <option value="all" selected>كل الفترات</option>
      <option value="day">يوم محدد</option>
      <option value="month">هذا الشهر</option>
      <option value="quarter">ربعي (آخر 3 أشهر)</option>
      <option value="half">نصفي (آخر 6 أشهر)</option>
      <option value="year">سنوي (آخر 12 شهر)</option>
      <option value="custom">فترة محددة (من - إلى)</option>
    </select></div>
    <div class="field" id="${prefix}DayWrap" style="display:none;"><label>اليوم</label><input type="date" id="${prefix}Day"></div>
  </div>
  <div class="row-2" id="${prefix}RangeWrap" style="display:none;">
    <div class="field"><label>من تاريخ</label><input type="date" id="${prefix}From"></div>
    <div class="field"><label>إلى تاريخ</label><input type="date" id="${prefix}To"></div>
  </div>`;
}
function bindExtendedPeriodPicker(prefix){
  $(`${prefix}Mode`).addEventListener("change", ()=>{
    const mode = $(`${prefix}Mode`).value;
    $(`${prefix}DayWrap`).style.display = mode==="day" ? "" : "none";
    $(`${prefix}RangeWrap`).style.display = mode==="custom" ? "" : "none";
  });
  $(`${prefix}Day`).value = todayStr();
}
function extendedPeriodRange(prefix){
  const mode = $(`${prefix}Mode`).value;
  const fmt = d=> d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const today = serverDate();
  if(mode==="day"){ const d = $(`${prefix}Day`).value || todayStr(); return {from:d, to:d, label:`يوم ${d}`}; }
  if(mode==="month"){
    const [y,m] = state.settings.currentMonth.split("-").map(Number);
    const from = `${y}-${String(m).padStart(2,"0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
    return {from, to, label:`الشهر الحالي (${monthDisplay(state.settings.currentMonth)})`};
  }
  if(mode==="quarter"){ const from=new Date(today); from.setMonth(from.getMonth()-3); return {from:fmt(from), to:fmt(today), label:"ربعي — آخر 3 أشهر"}; }
  if(mode==="half"){ const from=new Date(today); from.setMonth(from.getMonth()-6); return {from:fmt(from), to:fmt(today), label:"نصفي — آخر 6 أشهر"}; }
  if(mode==="year"){ const from=new Date(today); from.setFullYear(from.getFullYear()-1); return {from:fmt(from), to:fmt(today), label:"سنوي — آخر 12 شهر"}; }
  if(mode==="all") return {from:null, to:null, label:"كل الفترات"};
  const from = $(`${prefix}From`).value || null, to = $(`${prefix}To`).value || null;
  return {from, to, label:`من ${from||"البداية"} إلى ${to||"اليوم"}`};
}
function inDateRange(dateStr, from, to){
  if(!dateStr) return false;
  if(from && dateStr < from) return false;
  if(to && dateStr > to) return false;
  return true;
}
function buildFullActivityLog(from, to){
  const rows = [];
  state.invoices.forEach(inv=>{
    const cust = inv.customerMobile ? findCustomerByMobile(inv.customerMobile) : null;
    const custTag = cust ? ` [كود ${cust.code} — ${inv.customerMobile}]` : (inv.customerMobile ? ` [${inv.customerMobile}]` : "");
    if(inDateRange(inv.date, from, to)) rows.push({date:inv.date, section:"فواتير تفصيل", desc:`فاتورة جديدة #${esc(inv.number)} — ${esc(inv.customerName||"—")}${custTag}`, amount: invoiceSaleTotal(inv)});
    (inv.payments||[]).forEach(p=>{
      if(inDateRange(p.date, from, to)){
        const amt = (p.cash||0)+(p.network||0)+(p.discount||0);
        if(amt>0.001) rows.push({date:p.date, section:"دفعات", desc:`دفعة على فاتورة #${esc(inv.number)} — ${esc(inv.customerName||"—")}${custTag}${p.note?" — "+p.note:""} (كاش ${(p.cash||0).toFixed(0)}${p.cashReceiptNo?` سند ${p.cashReceiptNo}`:""} / شبكة ${(p.network||0).toFixed(0)}${p.discount?` / خصم ${p.discount.toFixed(0)}`:""})`, amount:amt});
      }
    });
    inv.garments.forEach(g=>{
      if(g.tailorCompletedDate && inDateRange(g.tailorCompletedDate, from, to)) rows.push({date:g.tailorCompletedDate, section:"التوزيع", desc:`فاتورة #${esc(inv.number)} — ثوب تحول لـ"تم التفصيل" (${esc(g.tailor||"—")})`, amount:0});
      if(g.readyDate && inDateRange(g.readyDate, from, to)) rows.push({date:g.readyDate, section:"التوزيع", desc:`فاتورة #${esc(inv.number)} — ثوب صار "جاهز للتسليم"`, amount:0});
      if(g.deliveredDate && inDateRange(g.deliveredDate, from, to)) rows.push({date:g.deliveredDate, section:"التوزيع", desc:`فاتورة #${esc(inv.number)} — ثوب "تم التسليم"`, amount:0});
    });
  });
  state.salesInvoices.forEach(inv=>{
    if(inDateRange(inv.date, from, to)){
      const total = saleNetTotal(inv);
      rows.push({date:inv.date, section:"فواتير مبيعات", desc:`فاتورة مبيعات #${esc(inv.number)} — ${esc(inv.customerName||"—")}`, amount: total});
    }
  });
  (state.salesReturns||[]).forEach(r=>{
    if(inDateRange(r.date, from, to)) rows.push({date:r.date, section:"مرتجعات مبيعات", desc:`مرتجع فاتورة مبيعات #${esc(r.saleInvoiceNumber)} — ${r.lines.map(l=>`${esc(l.name)} ×${l.qty}`).join("، ")}`, amount:-(r.refundAmount||0)});
  });
  state.purchases.forEach(p=>{
    if(inDateRange(p.date, from, to)){
      const card = findItemCard(p.itemCardId); const sup = state.suppliers.find(s=>s.id===p.supplierId);
      rows.push({date:p.date, section:"مشتريات", desc:`شراء ${p.quantity} ${card?card.name:"—"} من ${sup?sup.name:"—"} (${p.payStatus==="paid"?"مدفوعة":"آجلة"})`, amount:p.total});
    }
  });
  state.purchaseReturns.forEach(r=>{
    if(inDateRange(r.date, from, to)){
      const card = findItemCard(r.itemCardId);
      rows.push({date:r.date, section:"مرتجع مشتريات", desc:`مرتجع ${r.quantity} ${card?card.name:"—"}`, amount:r.value});
    }
  });
  state.expenses.forEach(e=>{
    if(inDateRange(e.date, from, to)){
      const cat = state.expenseCategories.find(c=>c.id===e.categoryId);
      rows.push({date:e.date, section:"مصروفات", desc:`مصروف ${cat?cat.label:"—"}${e.paidTo?" — "+e.paidTo:""}`, amount:e.amount});
    }
  });
  state.transferRequests.forEach(t=>{
    if(inDateRange(t.createdAt, from, to)){
      const statusTxt = t.status==="pending"?"بانتظار القبول":t.status==="accepted"?"مقبول":"مرفوض";
      rows.push({date:t.createdAt, section:"تحويلات", desc:`تحويل ${t.amount.toFixed(0)} ريال من ${t.fromOwner} إلى ${t.toOwner} (${statusTxt})`, amount:t.amount});
    }
  });
  state.payrollLedger.forEach(e=>{
    if(inDateRange(e.date, from, to)){
      const typeLbl = e.type==="entitlement"?"استحقاق":e.type==="payment"?"دفعة راتب":e.type==="advance"?"سلفة":"خصم";
      rows.push({date:e.date, section:"الرواتب", desc:`${typeLbl} — ${e.username}${e.note?" — "+e.note:""}`, amount:e.amount});
    }
  });
  state.alterations.forEach(a=>{
    if(inDateRange(a.dateReceived, from, to)) rows.push({date:a.dateReceived, section:"تعديلات", desc:`استلام تعديل — فاتورة ${a.invoiceNumber} — ${a.reason}`, amount:0});
    if(a.dateCompleted && inDateRange(a.dateCompleted, from, to)) rows.push({date:a.dateCompleted, section:"تعديلات", desc:`إكمال تعديل — فاتورة ${a.invoiceNumber}`, amount:0});
  });
  (state.openingBalanceAdjustments||[]).forEach(a=>{
    if(inDateRange(a.date, from, to)) rows.push({date:a.date, section:"تعديل المخزون", desc:`تعديل رصيد أول المدة لصنف "${esc(a.cardName)}" من ${a.oldValue.toFixed(1)} إلى ${a.newValue.toFixed(1)} — بواسطة ${esc(a.username)}`, amount:0});
  });
  state.stockWriteOffs.forEach(w=>{
    if(inDateRange(w.date, from, to)){
      const card = findItemCard(w.itemCardId);
      rows.push({date:w.date, section:"إتلاف", desc:`إتلاف ${w.qty.toFixed(1)} من ${card?card.name:"—"}`, amount: card ? w.qty*(card.currentCost||0) : 0});
    }
  });
  state.loyaltyLedger.forEach(l=>{
    if(inDateRange(l.date, from, to)) rows.push({date:l.date, section:"نقاط الولاء", desc:`${l.type==="earn"?"كسب":"استبدال"} ${l.points} نقطة — فاتورة ${l.invoiceNumber||"—"}`, amount:0});
  });
  state.vouchers.forEach(v=>{
    if(inDateRange(v.date, from, to)) rows.push({date:v.date, section: v.type==="receipt"?"سندات قبض":"سندات صرف", desc:`سند ${v.type==="receipt"?"قبض":"صرف"} #${v.voucherNo} — ${esc(v.party)} — ${esc(v.reason)}`, amount:v.amount});
  });
  rows.sort((a,b)=> (a.date||"").localeCompare(b.date||""));
  return rows;
}
function showFullActivityLog(){
  const {from, to, label} = extendedPeriodRange("fullLog");
  let rows = buildFullActivityLog(from, to);
  const sectionFilter = $("fullLogSectionFilter").value;
  if(sectionFilter) rows = rows.filter(r=>r.section===sectionFilter);
  const bySection = {};
  rows.forEach(r=>{ bySection[r.section] = (bySection[r.section]||0)+1; });
  let html = `<h2>السجل الشامل لكل الحركات — ${label}${sectionFilter?` — قسم: ${esc(sectionFilter)}`:""}</h2>`;
  html += `<p>إجمالي الحركات: <b>${rows.length}</b> — ${Object.entries(bySection).map(([k,v])=>`${k}: ${v}`).join(" | ")}</p>`;
  html += `<table><thead><tr><th>التاريخ</th><th>القسم</th><th>التفاصيل</th><th>المبلغ</th></tr></thead><tbody>`;
  rows.forEach(r=> html += `<tr><td>${r.date||"—"}</td><td>${esc(r.section)}</td><td>${esc(r.desc)}</td><td>${r.amount?r.amount.toFixed(2)+" ريال":"—"}</td></tr>`);
  if(!rows.length) html += `<tr><td colspan="4" style="text-align:center;">ما فيه حركات بهذي الفترة</td></tr>`;
  html += `</tbody></table>`;
  $("fullActivityLogView").innerHTML = html + `<div class="actions-row" style="margin-top:10px;">
    <button class="btn btn-ghost btn-sm" id="printFullLogBtn">طباعة / حفظ PDF</button>
    <button class="btn btn-ghost btn-sm" id="exportFullLogExcelBtn">تصدير إكسل</button>
  </div>`;
  $("printFullLogBtn").addEventListener("click", ()=>{ printHtml(html); });
  $("exportFullLogExcelBtn").addEventListener("click", ()=> exportActivityLogExcel(rows, label));
}
function exportActivityLogExcel(rows, label){
  let html = `<html><head><meta charset="UTF-8"></head><body dir="rtl"><table border="1"><tr><th>التاريخ</th><th>القسم</th><th>التفاصيل</th><th>المبلغ (ريال)</th></tr>`;
  rows.forEach(r=> html += `<tr><td>${r.date||""}</td><td>${esc(r.section)}</td><td>${esc(r.desc)}</td><td>${r.amount?r.amount.toFixed(2):""}</td></tr>`);
  html += `</table></body></html>`;
  const blob = new Blob([html], {type:"application/vnd.ms-excel"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `السجل-الشامل-${todayStr()}.xls`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function periodPickerHtml(prefix){
  return `<div class="row-3">
    <div class="field"><label>الفترة</label><select id="${prefix}PeriodMode">
      <option value="month">هذا الشهر</option>
      <option value="all">كل الفترات</option>
      <option value="custom">فترة مخصصة</option>
    </select></div>
    <div class="field" id="${prefix}FromWrap" style="display:none;"><label>من تاريخ</label><input type="date" id="${prefix}From"></div>
    <div class="field" id="${prefix}ToWrap" style="display:none;"><label>إلى تاريخ</label><input type="date" id="${prefix}To"></div>
  </div>`;
}
function bindPeriodPicker(prefix){
  $(`${prefix}PeriodMode`).addEventListener("change", ()=>{
    const isCustom = $(`${prefix}PeriodMode`).value==="custom";
    $(`${prefix}FromWrap`).style.display = isCustom?"":"none";
    $(`${prefix}ToWrap`).style.display = isCustom?"":"none";
  });
}
function periodLabel(prefix){
  const mode = $(`${prefix}PeriodMode`).value;
  if(mode==="month") return `الشهر الحالي (${monthDisplay(state.settings.currentMonth)})`;
  if(mode==="all") return "كل الفترات";
  const from=$(`${prefix}From`).value, to=$(`${prefix}To`).value;
  return `من ${from||"البداية"} إلى ${to||"اليوم"}`;
}
function dateMatchesPeriod(prefix, dateStr, originMonth){
  const mode = $(`${prefix}PeriodMode`).value;
  if(mode==="all") return true;
  if(mode==="month") return originMonth ? originMonth===state.settings.currentMonth : (dateStr||"").slice(0,7)===state.settings.currentMonth;
  const from=$(`${prefix}From`).value, to=$(`${prefix}To`).value;
  return (!from || (dateStr||"") >= from) && (!to || (dateStr||"") <= to);
}

function showGarmentInventory(){
  const statusFilter = $("garmentInventoryStatus").value;
  const rows = [];
  state.invoices.forEach(inv=>{
    if(!dateMatchesPeriod("garmInv", inv.date, inv.originMonth)) return;
    inv.garments.forEach(g=>{
      if(statusFilter && g.status!==statusFilter) return;
      rows.push({inv,g});
    });
  });
  const statusTxt = statusFilter ? `الحالة: ${STATUSES.find(s=>s.v===statusFilter)?.label||statusFilter}` : "كل الحالات";
  const title = `جرد الثياب — ${statusTxt} — ${periodLabel("garmInv")}`;
  let html = `<h2>${title}</h2>`;
  html += `<p>إجمالي العدد: <b>${rows.length}</b></p>`;
  html += `<table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الجوال</th><th>نوع القماش</th><th>الخياط</th><th>السعر</th><th>الحالة</th><th>شهر الإصدار</th></tr></thead><tbody>`;
  rows.forEach(({inv,g})=> html+=`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${esc(inv.customerMobile||"—")}</td><td>${esc(g.fabricType)}</td><td>${esc(g.tailor||"—")}</td><td>${garmentSalePrice(g).toFixed(0)} ﷼</td><td>${STATUSES.find(s=>s.v===g.status)?.label||g.status}</td><td>${monthDisplay(inv.originMonth)}</td></tr>`);
  if(!rows.length) html+=`<tr><td colspan="8" style="text-align:center;">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  $("garmentInventoryView").innerHTML = html + `<button class="btn btn-ghost btn-sm" id="printGarmentInventoryBtn" style="margin-top:10px;">طباعة الجرد</button>`;
  $("printGarmentInventoryBtn").addEventListener("click", ()=>{ printHtml(html); });
}
function showNoFabricWageReport(){
  const rows = [];
  state.invoices.forEach(inv=>{
    if(!dateMatchesPeriod("noFabricWage", inv.date, inv.originMonth)) return;
    inv.garments.forEach(g=>{ if(!g.itemCardId && g.status!=="ملغي") rows.push({inv,g}); });
  });
  const title = `تقرير أجرة تفصيل بدون قماش — ${periodLabel("noFabricWage")}`;
  let html = `<h2>${title}</h2>`;
  html += `<p>إجمالي عدد الثياب: <b>${rows.length}</b> — إجمالي الأجرة: <b>${rows.reduce((a,{g})=>a+garmentSalePrice(g),0).toFixed(0)} ﷼</b></p>`;
  html += `<table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الجوال</th><th>الخياط</th><th>الأجرة</th><th>الحالة</th><th>شهر الإصدار</th></tr></thead><tbody>`;
  rows.forEach(({inv,g})=> html+=`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${esc(inv.customerMobile||"—")}</td><td>${esc(g.tailor||"—")}</td><td>${garmentSalePrice(g).toFixed(0)} ﷼</td><td>${STATUSES.find(s=>s.v===g.status)?.label||g.status}</td><td>${monthDisplay(inv.originMonth)}</td></tr>`);
  if(!rows.length) html+=`<tr><td colspan="7" style="text-align:center;">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  $("noFabricWageView").innerHTML = html + `<button class="btn btn-ghost btn-sm" id="printNoFabricWageBtn" style="margin-top:10px;">طباعة التقرير</button>`;
  $("printNoFabricWageBtn").addEventListener("click", ()=>{ printHtml(html); });
}
function showExpenseSubItemsReport(){
  const groups = {};
  state.expenses.forEach(e=>{
    if(!dateMatchesPeriod("expSub", e.date)) return;
    const cat = state.expenseCategories.find(c=>c.id===e.categoryId);
    const catLabel = cat ? cat.label : "—";
    const subLabel = e.subItemLabel || "بدون بند فرعي";
    const key = catLabel+"|"+subLabel;
    if(!groups[key]) groups[key] = {catLabel, subLabel, count:0, total:0};
    groups[key].count++; groups[key].total += e.amount;
  });
  const list = Object.values(groups).sort((a,b)=> b.total-a.total);
  const grandTotal = list.reduce((a,g)=>a+g.total,0);
  const title = `تقرير المصروفات حسب البند الفرعي — ${periodLabel("expSub")}`;
  let html = `<h2>${title}</h2>`;
  html += `<p>إجمالي المصروفات: <b>${grandTotal.toFixed(0)} ﷼</b></p>`;
  html += `<table><thead><tr><th>التصنيف</th><th>البند الفرعي</th><th>عدد المصروفات</th><th>الإجمالي</th></tr></thead><tbody>`;
  list.forEach(g=> html+=`<tr><td>${esc(g.catLabel)}</td><td>${esc(g.subLabel)}</td><td>${g.count}</td><td>${g.total.toFixed(0)} ﷼</td></tr>`);
  if(!list.length) html+=`<tr><td colspan="4" style="text-align:center;">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  $("expenseSubItemsReportView").innerHTML = html + `<button class="btn btn-ghost btn-sm" id="printExpenseSubItemsBtn" style="margin-top:10px;">طباعة التقرير</button>`;
  $("printExpenseSubItemsBtn").addEventListener("click", ()=>{ printHtml(html); });
}
function printUndelivered(){
  const rows=[];
  state.invoices.forEach(inv=>{
    if(!dateMatchesPeriod("undel", inv.date, inv.originMonth)) return;
    inv.garments.forEach(g=>{ if(g.status!=="تسليم"&&g.status!=="ملغي") rows.push({inv,g}); });
  });
  let html = `<h2>تقرير الثياب غير المسلّمة — ${periodLabel("undel")}</h2><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الجوال</th><th>نوع القماش</th><th>الخياط</th><th>السعر</th><th>الحالة</th><th>شهر الإصدار</th></tr></thead><tbody>`;
  rows.forEach(({inv,g})=> html+=`<tr><td>${esc(inv.number)}</td><td>${esc(inv.customerName||"—")}</td><td>${esc(inv.customerMobile||"—")}</td><td>${esc(g.fabricType)}</td><td>${esc(g.tailor||"—")}</td><td>${garmentSalePrice(g).toFixed(0)} ﷼</td><td>${STATUSES.find(s=>s.v===g.status).label}</td><td>${monthDisplay(inv.originMonth)}</td></tr>`);
  if(!rows.length) html+=`<tr><td colspan="8">لا يوجد</td></tr>`;
  html += `</tbody></table><p>إجمالي: ${rows.length}</p>`;
  $("undeliveredReportView").innerHTML = html + `<button class="btn btn-ghost btn-sm" id="printUndeliveredNowBtn" style="margin-top:10px;">طباعة</button>`;
  $("printUndeliveredNowBtn").addEventListener("click", ()=>{ printHtml(html); });
}
function printCustomers(){
  const filter=$("customerFilter").value;
  const customers = getCustomers().filter(c=>customerMatchesFilter(c, filter));
  let html = `<h2>قائمة العملاء — ${CUSTOMER_FILTER_LABELS[filter]||filter}</h2><table><thead><tr><th>اسم العميل</th><th>رقم الجوال</th><th>آخر فاتورة</th><th>عدد الفواتير</th></tr></thead><tbody>`;
  customers.forEach(c=> html+=`<tr><td>${esc(c.name)}</td><td>${c.mobile}</td><td>${c.lastDate||"—"}</td><td>${c.count}</td></tr>`);
  if(!customers.length) html+=`<tr><td colspan="4">لا يوجد</td></tr>`;
  html += `</tbody></table>`; printHtml(html);
}
function exportCustomersCsv(){
  const filter=$("customerFilter").value;
  const customers = getCustomers().filter(c=>customerMatchesFilter(c, filter));
  const rows=[["اسم العميل","رقم الجوال","آخر فاتورة","عدد الفواتير"]];
  customers.forEach(c=> rows.push([c.name,c.mobile,c.lastDate||"",c.count]));
  const csv="\uFEFF"+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="customers-"+filter+".csv"; a.click();
}
function buildCsvString(){
  const rows=[["رقم الفاتورة","العميل","الجوال","التاريخ","شهر الإصدار","نوع القماش","تطريز","سعر البيع","تكلفة الثوب","الحالة","الخياط","رقم إيصال التسليم"]];
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{
    rows.push([inv.number, inv.customerName||"", inv.customerMobile||"", inv.date, inv.originMonth, g.fabricType, g.hasEmbroidery?("نعم - "+g.embroideryPrice):"لا", garmentSalePrice(g), garmentCostFor(g,inv).toFixed(2), g.status, g.tailor||"", g.deliveryReceipt||""]);
  }));
  return "\uFEFF"+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
}
function exportCsv(){
  const blob=new Blob([buildCsvString()],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="khayyat-alwatani-invoices.csv"; a.click();
  showToast("تم تصدير ملف CSV");
}
function showToast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.remove("show"),2200); }
function showConfirm(message){
  return new Promise(resolve=>{
    $("confirmModalText").textContent = message;
    $("confirmModalOverlay").classList.remove("hidden");
    const yesBtn=$("confirmModalYes"), noBtn=$("confirmModalNo");
    function cleanup(v){
      $("confirmModalOverlay").classList.add("hidden");
      yesBtn.removeEventListener("click", onYes); noBtn.removeEventListener("click", onNo);
      resolve(v);
    }
    function onYes(){ cleanup(true); }
    function onNo(){ cleanup(false); }
    yesBtn.addEventListener("click", onYes); noBtn.addEventListener("click", onNo);
  });
}
function confirmWithPassword(message){
  return new Promise(resolve=>{
    $("passwordModalText").textContent = message;
    $("passwordModalInput").value = "";
    $("passwordModalError").style.display = "none";
    $("passwordModalOverlay").classList.remove("hidden");
    $("passwordModalInput").focus();
    const yesBtn=$("passwordModalYes"), noBtn=$("passwordModalNo"), input=$("passwordModalInput");
    function cleanup(v){
      $("passwordModalOverlay").classList.add("hidden");
      yesBtn.removeEventListener("click", onYes); noBtn.removeEventListener("click", onNo); input.removeEventListener("keydown", onKey);
      resolve(v);
    }
    async function onYes(){
      try{
        const cred = firebase.auth.EmailAuthProvider.credential(currentUser.authEmail, input.value);
        await fbAuth.currentUser.reauthenticateWithCredential(cred);
        cleanup(true);
      }catch(e){ $("passwordModalError").style.display = ""; input.value=""; input.focus(); }
    }
    function onNo(){ cleanup(false); }
    function onKey(e){ if(e.key==="Enter") onYes(); }
    yesBtn.addEventListener("click", onYes); noBtn.addEventListener("click", onNo); input.addEventListener("keydown", onKey);
  });
}

// ---------------- users ----------------
function renderUsers(){
  const managerCount = state.users.filter(u=>u.role==="مدير").length;
  $("usersList").innerHTML = state.users.map((u,i)=>{
    const isLastManager = u.role==="مدير" && managerCount<=1;
    return `<div class="user-row"><div class="row-3" style="margin-bottom:0;align-items:end;">
        <div class="field" style="margin-bottom:0;"><label>اسم المستخدم</label><input type="text" class="edit-username" data-idx="${i}" value="${u.username}"></div>
        <div class="field" style="margin-bottom:0;"><label>كلمة مرور جديدة</label><input type="text" class="edit-password" data-idx="${i}" value="" placeholder="اتركه فارغاً لعدم تغيير كلمة المرور"></div>
        <div class="field" style="margin-bottom:0;"><label>الدور</label><select class="edit-role" data-idx="${i}"><option value="محاسب" ${u.role==="محاسب"?"selected":""}>محاسب</option><option value="كاشير" ${u.role==="كاشير"?"selected":""}>كاشير</option><option value="خياط" ${u.role==="خياط"?"selected":""}>خياط</option><option value="فاحص جودة" ${u.role==="فاحص جودة"?"selected":""}>فاحص جودة</option><option value="مدير" ${u.role==="مدير"?"selected":""}>مدير</option></select></div>
      </div>
      ${u.role==="خياط" ? `<div class="row-2" style="margin-top:8px;">
        <div class="field" style="margin-bottom:0;"><label>القدرة الإنتاجية اليومية (ثوب/يوم)</label><input type="number" class="edit-capacity" data-idx="${i}" min="0" value="${u.dailyCapacity||""}" placeholder="مثلاً: 5"></div>
        <div class="field" style="margin-bottom:0;"><label>القدرة الإنتاجية الموسمية (قطعة) — تُضاف تلقائياً لطاقة أي موسم نشط</label><input type="number" class="edit-season-capacity" data-idx="${i}" min="0" value="${u.productionCapacity||""}" placeholder="مثلاً: 100"></div>
      </div>
      <div class="row-3" style="margin-top:8px;">
        <div class="field" style="margin-bottom:0;"><label>أجرة تفصيل رجال (ريال/ثوب)</label><input type="number" class="edit-wage-men" data-idx="${i}" min="0" value="${u.wageMen||""}" placeholder="0"></div>
        <div class="field" style="margin-bottom:0;"><label>أجرة تفصيل ولادي (ريال/ثوب)</label><input type="number" class="edit-wage-child" data-idx="${i}" min="0" value="${u.wageChild||""}" placeholder="0"></div>
        <div class="field" style="margin-bottom:0;"><label>أجرة تفصيل طفل (ريال/ثوب)</label><input type="number" class="edit-wage-childsmall" data-idx="${i}" min="0" value="${u.wageChildSmall||""}" placeholder="0"></div>
      </div>
      <div class="note-box" style="margin-top:8px;">أجرة الخياط تُحسب تلقائياً حسب فئة كل ثوب أكمله هذا الشهر × السعر المحدد له أعلاه — كل خياط له أسعاره الخاصة. لو ما حددت له سعر فئة معيّنة، يُستخدم مؤقتاً "السعر الافتراضي" من إعدادات التكلفة أعلاه.</div>` : `
      <div class="row-3" style="margin-top:8px;">
        <div class="field" style="margin-bottom:0;"><label>الراتب الأساسي (ريال)</label><input type="number" class="edit-basesalary" data-idx="${i}" min="0" value="${u.baseSalary||""}" placeholder="0"></div>
        <div class="field" style="margin-bottom:0;"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="edit-commission" data-idx="${i}" ${u.commissionEnabled?"checked":""}> تفعيل عمولة</label></div>
        <div class="field" style="margin-bottom:0;"><label>قيمة العمولة لكل ثوب (ريال)</label><input type="number" class="edit-commrate" data-idx="${i}" min="0" value="${u.commissionRate||""}" placeholder="0"></div>
      </div>`}
      <div class="row-2" style="margin-top:8px;">
        <div class="field" style="margin-bottom:0;"><label>تاريخ بداية العمل (تُمنع السلف قبل إقفال أول شهر عمل)</label><input type="date" class="edit-joined" data-idx="${i}" value="${u.joinedDate||""}"></div>
      </div>
      <div class="row-3" style="margin-top:8px;">
        <div class="field" style="margin-bottom:0;"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="edit-discount-enabled" data-idx="${i}" ${u.discountEnabled?"checked":""}> تفعيل صلاحية الخصم</label></div>
        <div class="field" style="margin-bottom:0;"><label>نوع الحد</label><select class="edit-discount-type" data-idx="${i}"><option value="amount" ${u.discountType==="amount"?"selected":""}>مبلغ ثابت</option><option value="percent" ${u.discountType==="percent"?"selected":""}>نسبة %</option></select></div>
        <div class="field" style="margin-bottom:0;"><label>قيمة الحد</label><input type="number" class="edit-discount-value" data-idx="${i}" min="0" value="${u.discountValue||""}" placeholder="0"></div>
      </div>
      <div class="actions-row" style="margin-top:8px;">
        <button class="btn btn-ghost btn-sm" onclick="saveUserEdit(${i})">حفظ</button>
        ${isLastManager?`<span class="sub">لازم يبقى مدير واحد على الأقل</span>`:`<button class="btn btn-danger btn-sm" onclick="removeUser(${i})">حذف</button>`}
      </div></div>`;
  }).join("");
}
const REPORT_SECTION_DEFS = [
  {key:"fullLog", label:"السجل الشامل لكل الحركات"},
  {key:"search", label:"البحث والحالات + التطريز"},
  {key:"undelivered", label:"تقرير الثياب غير المسلّمة"},
  {key:"garmentInventory", label:"جرد الثياب حسب الحالة"},
  {key:"salesRanking", label:"الأكثر والأقل مبيعاً"},
  {key:"vatCalc", label:"حاسبة الضريبة"},
  {key:"returns", label:"المرتجعات والفواتير المحذوفة"},
  {key:"customers", label:"تقرير العملاء"},
  {key:"daily", label:"التقرير اليومي"},
  {key:"missingReceipt", label:"فواتير بدون رقم سند"},
  {key:"tailorMonthly", label:"تقرير الخياط الشهري"},
  {key:"broadcastCampaign", label:"قوائم البث والعروض الخاصة"},
  {key:"stuckInvoices", label:"الثياب المتعثرة (7 أيام من الجاهزية)"},
];
const EDITABLE_ROLES = ["مدير","محاسب","كاشير"];
const SETTINGS_TABS = ["settingsShop","settingsFinance","settingsUsers","settingsProducts","settingsMarketing"];
function renderPermissionsEditor(){
  const el = $("permissionsEditor");
  if(!el || !currentUser || currentUser.role!=="مدير") return;
  el.innerHTML = EDITABLE_ROLES.map(role=>{
    const perm = state.permissions[role] || {tabs:[],reportSections:[]};
    const groupsHtml = NAV_GROUPS.map(group=>`
      <div style="margin-bottom:10px;">
        <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:4px;">${group.title}</div>
        ${group.items.map(it=>{
          const checked = perm.tabs.includes(it.tab);
          const isSettingsForAdmin = role==="مدير" && SETTINGS_TABS.includes(it.tab);
          return `<div class="embro-toggle" style="margin:6px 0;"><input type="checkbox" class="perm-tab" data-role="${role}" data-tab="${it.tab}" ${checked?"checked":""} ${isSettingsForAdmin?"disabled":""}><label style="margin:0;font-size:14px;"><i data-lucide="${navIcon(it.tab)}" style="width:14px;height:14px;vertical-align:middle;"></i> ${it.label}${isSettingsForAdmin?` <span style="color:var(--muted);font-size:11px;">(ثابت للمدير دائماً)</span>`:""}</label></div>`;
        }).join("")}
      </div>`).join("");
    return `<div class="garment-card"><span class="tag">${role}</span>${groupsHtml}</div>`;
  }).join("");
  refreshLucideIcons();
  document.querySelectorAll(".perm-tab").forEach(cb=> cb.addEventListener("change", ()=>{
    const role=cb.dataset.role, tab=cb.dataset.tab;
    const perm = state.permissions[role];
    if(cb.checked){ if(!perm.tabs.includes(tab)) perm.tabs.push(tab); }
    else { if(role==="مدير" && SETTINGS_TABS.includes(tab)) return; perm.tabs = perm.tabs.filter(t=>t!==tab); }
    saveState(); renderPermissionsEditor(); applyRolePermissions();
    logAudit("permission_changed", {role, tab, granted:cb.checked});
    showToast("تم تحديث الصلاحيات");
  }));
}
async function saveUserEdit(i){
  const username=document.querySelector(`.edit-username[data-idx="${i}"]`).value.trim();
  const newPassword=document.querySelector(`.edit-password[data-idx="${i}"]`).value; // blank = keep the existing password
  const role=document.querySelector(`.edit-role[data-idx="${i}"]`).value;
  if(!username){ showToast("أدخل اسم المستخدم"); return; }
  if(state.users.some((u,idx)=>idx!==i&&u.username===username)){ showToast("اسم المستخدم مستخدم من قبل"); return; }
  const managerCount = state.users.filter((u,idx)=>idx!==i&&u.role==="مدير").length + (role==="مدير"?1:0);
  if(managerCount<1){ showToast("لازم يبقى مدير واحد على الأقل"); return; }
  const oldUsername=state.users[i].username;
  const baseInp = document.querySelector(`.edit-basesalary[data-idx="${i}"]`);
  const baseSalary = baseInp ? (parseFloat(baseInp.value)||0) : 0;
  const commInp = document.querySelector(`.edit-commission[data-idx="${i}"]`);
  const commissionEnabled = commInp ? commInp.checked : false;
  const commRateInp = document.querySelector(`.edit-commrate[data-idx="${i}"]`);
  const commissionRate = commRateInp ? (parseFloat(commRateInp.value)||0) : 0;
  const discountEnabled = document.querySelector(`.edit-discount-enabled[data-idx="${i}"]`).checked;
  const discountType = document.querySelector(`.edit-discount-type[data-idx="${i}"]`).value;
  const discountValue = parseFloat(document.querySelector(`.edit-discount-value[data-idx="${i}"]`).value)||0;
  const capInp = document.querySelector(`.edit-capacity[data-idx="${i}"]`);
  const dailyCapacity = capInp ? (parseFloat(capInp.value)||0) : 0;
  const seasonCapInp = document.querySelector(`.edit-season-capacity[data-idx="${i}"]`);
  const productionCapacity = seasonCapInp ? (parseFloat(seasonCapInp.value)||0) : 0;
  const wageMenInp = document.querySelector(`.edit-wage-men[data-idx="${i}"]`);
  const wageMen = wageMenInp ? (parseFloat(wageMenInp.value)||0) : 0;
  const wageChildInp = document.querySelector(`.edit-wage-child[data-idx="${i}"]`);
  const wageChild = wageChildInp ? (parseFloat(wageChildInp.value)||0) : 0;
  const wageChildSmallInp = document.querySelector(`.edit-wage-childsmall[data-idx="${i}"]`);
  const wageChildSmall = wageChildSmallInp ? (parseFloat(wageChildSmallInp.value)||0) : 0;
  if(newPassword && newPassword.length<6){ showToast("كلمة المرور لازم تكون ٦ أحرف على الأقل"); return; }
  const prevUser = state.users[i];
  const joinedInp = document.querySelector(`.edit-joined[data-idx="${i}"]`);
  const joinedDate = joinedInp && joinedInp.value ? joinedInp.value : (prevUser.joinedDate||undefined);
  const updatedUser = {...prevUser, username,role,joinedDate,baseSalary,commissionEnabled,commissionRate,discountEnabled,discountType,discountValue,dailyCapacity,productionCapacity,wageMen,wageChild,wageChildSmall};
  if(newPassword){
    // client-side Firebase Auth can't set another account's password directly — create a fresh
    // login account carrying the new password and retire the old one
    const email = synthEmailForNewAccount();
    let uid;
    try{
      const cred = await secondaryAuth().createUserWithEmailAndPassword(email, newPassword);
      uid = cred.user.uid;
      await secondaryAuth().signOut();
    }catch(e){
      console.error("password reset — new auth account creation failed", e);
      showToast(e && e.code==="auth/weak-password" ? "كلمة المرور ضعيفة جداً" : "تعذّر تحديث كلمة المرور (" + (e && e.code || "بدون رمز") + ") — حاول مرة ثانية");
      return;
    }
    try{
      await ROLES_COL.doc(uid).set({role});
    }catch(e){
      console.error("role registration after password reset failed", e);
      if(e && e.code==="permission-denied"){
        alert("تعذّر تحديث كلمة المرور (permission-denied) — معرف حسابك:\n" + (fbAuth.currentUser ? fbAuth.currentUser.uid : "غير معروف"));
        return;
      }
      showToast("تعذّر تحديث كلمة المرور (" + (e && e.code || "بدون رمز") + ") — حاول مرة ثانية");
      return;
    }
    updatedUser.authUid = uid; updatedUser.authEmail = email;
  } else if(prevUser.authUid && role!==prevUser.role){
    try{ await ROLES_COL.doc(prevUser.authUid).set({role}); }
    catch(e){ console.error("role update failed", e); showToast("تعذّر تحديث الصلاحية — حاول مرة ثانية"); return; }
  }
  if(username!==oldUsername || newPassword){
    // a password change points the username at a brand-new synthetic email (new auth account) —
    // the login lookup has to be repointed even when the username itself didn't change, or the
    // new password silently can't be logged in with (it still resolves to the OLD account's email)
    try{
      await USERNAMES_COL.doc(username).set({authEmail: updatedUser.authEmail});
      if(username!==oldUsername) await USERNAMES_COL.doc(oldUsername).delete();
    }catch(e){ console.error("username/login-email update failed", e); showToast("تعذّر تحديث بيانات الدخول — حاول مرة ثانية"); return; }
  }
  state.users[i]=updatedUser;
  if(currentUser && currentUser.username===oldUsername){ currentUser=state.users[i]; $("curUserLbl").textContent=currentUser.username+" ("+currentUser.role+")"; applyRolePermissions(); }
  normalizeState();
  const saved = await saveState();
  // retire the OLD login account only after the state write lands — deleting its roles/{uid}
  // doc any earlier can make the CURRENTLY signed-in admin fail isAdmin() mid-function (their own
  // session is still on the old uid until they log back in), rejecting that very saveState() call.
  if(saved && newPassword && prevUser.authUid) await ROLES_COL.doc(prevUser.authUid).delete().catch(()=>{});
  showToast("تم حفظ التعديل"); // no renderAll() here on purpose — re-rendering the whole list would wipe unsaved edits typed into OTHER users' rows
}
async function removeUser(i){
  const managerCount = state.users.filter(u=>u.role==="مدير").length;
  if(state.users[i].role==="مدير" && managerCount<=1){ showToast("لازم يبقى مدير واحد على الأقل"); return; }
  if(!await showConfirm("متأكد تبي تحذف هذا المستخدم؟")) return;
  const removedUser = state.users[i];
  const removedUsername = removedUser.username, removedRole = removedUser.role;
  const wasCapacity = removedUser.productionCapacity||0;
  try{
    await USERNAMES_COL.doc(removedUsername).delete();
    if(removedUser.authUid) await ROLES_COL.doc(removedUser.authUid).delete();
  }catch(e){ console.error("failed to revoke removed user's login access", e); showToast("تعذّر إلغاء دخول المستخدم — حاول مرة ثانية"); return; }
  state.users.splice(i,1);
  saveState(); renderAll();
  logAudit("user_removed", {removedUsername, removedRole});
  showToast(wasCapacity>0 ? `تم حذف المستخدم — انخفضت الطاقة الإنتاجية للمواسم بمقدار ${wasCapacity} قطعة تلقائياً` : "تم حذف المستخدم");
}
async function addUser(){
  const username=$("newUserName").value.trim(), password=$("newUserPass").value, role=$("newUserRole").value;
  if(!username||!password){ showToast("أدخل اسم المستخدم وكلمة المرور"); return; }
  if(password.length<6){ showToast("كلمة المرور لازم تكون ٦ أحرف على الأقل"); return; }
  if(state.users.some(u=>u.username===username)){ showToast("اسم المستخدم موجود مسبقاً"); return; }
  const email = synthEmailForNewAccount();
  let uid;
  try{
    const cred = await secondaryAuth().createUserWithEmailAndPassword(email, password);
    uid = cred.user.uid;
    await secondaryAuth().signOut();
  }catch(e){
    console.error("new-user auth account creation failed", e);
    showToast(e && e.code==="auth/weak-password" ? "كلمة المرور ضعيفة جداً" : "تعذّر إنشاء حساب الدخول — حاول مرة ثانية");
    return;
  }
  try{
    await USERNAMES_COL.doc(username).set({authEmail: email});
    await ROLES_COL.doc(uid).set({role});
  }catch(e){
    console.error("failed to register username/role for new user", e);
    showToast("تعذّر تسجيل المستخدم الجديد — حاول مرة ثانية");
    return;
  }
  const newUser = {username,role,authUid:uid,authEmail:email,joinedDate:todayStr(),baseSalary:0,commissionEnabled:false,commissionRate:0,commissionThreshold:0,discountEnabled:false,discountType:"amount",discountValue:0,dailyCapacity:0,productionCapacity:0,wageMen:0,wageChild:0,wageChildSmall:0};
  state.users.push(newUser); ensureUserBoxes(username);
  // fully normalize before saving so the server copy already has every per-user default field —
  // otherwise the new user's OWN client would backfill a missing field locally on first login,
  // and every one of their writes afterward would be rejected by the rules' "users must be
  // unchanged for non-admins" check (they'd never be able to save anything, ever).
  normalizeState();
  saveState(); renderAll();
  logAudit("user_added", {newUsername:username, role});
  $("newUserName").value=""; $("newUserPass").value=""; showToast("تم إضافة المستخدم");
}

// ---------------- backups ----------------
async function renderBackupsList(){
  const el = $("backupsList");
  if(!el) return;
  el.innerHTML = `<p class="sub">جاري التحميل...</p>`;
  try{
    const snap = await BACKUPS_COL.get();
    const dates = snap.docs.map(d=>d.id).sort().reverse();
    if(!dates.length){ el.innerHTML = `<p class="sub">ما فيه نسخ محفوظة بعد.</p>`; return; }
    el.innerHTML = dates.map(d=>`<div class="garment-card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span>${d}</span>
      <button class="btn btn-ghost btn-sm restore-backup-btn" data-date="${d}">استرجاع هذي النسخة</button>
    </div>`).join("");
    el.querySelectorAll(".restore-backup-btn").forEach(btn=> btn.addEventListener("click", ()=> restoreBackup(btn.dataset.date)));
  }catch(e){ console.error("failed to list backups", e); el.innerHTML = `<p class="sub">تعذّر تحميل قائمة النسخ.</p>`; }
}

// ---------------- events ----------------
$("loginBtn").addEventListener("click", tryLogin);
$("loginPass").addEventListener("keydown", e=>{ if(e.key==="Enter") tryLogin(); });
$("firstSetupBtn").addEventListener("click", trySetupFirstAccount);
$("setupPassConfirm").addEventListener("keydown", e=>{ if(e.key==="Enter") trySetupFirstAccount(); });
$("logoutBtn").addEventListener("click", logout);
$("resetForGoLiveBtn").addEventListener("click", resetForGoLive);
$("hamburgerBtn").addEventListener("click", openNavDrawer);
$("globalSearchInput").addEventListener("input", renderGlobalSearchResults);
$("globalSearchInput").addEventListener("focus", renderGlobalSearchResults);
$("globalSearchInput").addEventListener("keydown", e=>{ if(e.key==="Escape"){ $("globalSearchResults").classList.remove("show"); e.target.blur(); } });
document.addEventListener("click", e=>{
  if(!e.target.closest(".global-search")) $("globalSearchResults").classList.remove("show");
});
$("quickMenuToggleBtn").addEventListener("click", ()=>{
  const bar = $("quickMenuBar");
  bar.style.display = bar.style.display==="none" ? "" : "none";
});
$("closeDrawerBtn").addEventListener("click", closeNavDrawer);
$("navDrawerOverlay").addEventListener("click", e=>{ if(e.target.id==="navDrawerOverlay") closeNavDrawer(); });
$("measModalBackdrop").addEventListener("click", closeMeasPanel);
$("invCount").addEventListener("input", ()=>{
  renderGarmentFields();
  if(!editingId) $("invDeliveryDate").value = formatDateInput(computeExpectedDeliveryDate(parseInt($("invCount").value)||1));
});
function renderCustomerAlert(mobile){ renderCustomerStandingAlerts(mobile, "customerAlertWrap"); }
$("custMobile").addEventListener("input", ()=>{
  renderCustomerPicker("custMobile","custName","custPickerWrap"); renderLoyaltyInfo();
  const mobile = $("custMobile").value.trim();
  $("custNewBadge").style.display = (/^[0-9]{10}$/.test(mobile) && !findCustomerByMobile(mobile)) ? "" : "none";
  if(!editingId) renderCustomerAlert(mobile); else { $("customerAlertWrap").style.display="none"; $("customerAlertWrap").innerHTML=""; }
});
$("custName").addEventListener("input", ()=>{
  const mobile = $("custMobile").value.trim();
  if(mobile){ refreshMeasurementsForCustomer(mobile, $("custName").value.trim()); return; } // don't override a mobile the user already typed themselves
  const match = findCustomerByIndividualName($("custName").value.trim());
  if(match){ $("custMobile").value = match.mobile; $("custMobile").dispatchEvent(new Event("input")); }
});
// confirm adding a new individual to an already-registered mobile right when the name is typed,
// instead of silently registering it later as a side effect of saving the whole invoice — that used
// to mean a typo could add a bogus "individual" with nobody noticing until it was too late to undo easily
$("custName").addEventListener("blur", ()=>{
  const mobile = $("custMobile").value.trim();
  const name = $("custName").value.trim();
  if(!/^[0-9]{10}$/.test(mobile) || !name || editingId) return;
  const cust = findCustomerByMobile(mobile);
  if(!cust || cust.individuals.some(i=>i.name===name)) return;
  showConfirm(`الرقم ${mobile} مسجل عليه اسم آخر (${cust.individuals.map(i=>i.name).join("، ")}).\nهل ترغب بإضافة "${name}" كفرد جديد على نفس الرقم؟`).then(ok=>{
    if($("custName").value.trim()!==name) return; // the field changed again while the dialog was open — stale, ignore
    if(ok){
      ensureCustomerIndividual(mobile, name);
      showToast(`تمت إضافة "${name}" كفرد جديد على هذا الرقم`);
      renderCustomerPicker("custMobile","custName","custPickerWrap");
    } else {
      $("custName").value = "";
      showToast("تم إلغاء الإضافة — اختر اسم من القائمة أو أعد كتابته للتأكيد");
    }
  });
});
$("saleCustMobile").addEventListener("input", ()=>{
  renderCustomerPicker("saleCustMobile","saleCustName","salePickerWrap");
  const mobile = $("saleCustMobile").value.trim();
  $("saleCustNewBadge").style.display = (/^[0-9]{10}$/.test(mobile) && !findCustomerByMobile(mobile)) ? "" : "none";
  renderCustomerStandingAlerts(mobile, "saleCustomerAlertWrap");
  updateSaleTotal();
});
$("saleApplyPromoBtn").addEventListener("click", applySalePromo);
$("odSaveBtn").addEventListener("click", addOpeningDebtCustomer);
$("saleDirectDiscount").addEventListener("input", updateSaleTotal);
$("saleCustName").addEventListener("input", ()=>{
  if($("saleCustMobile").value.trim()) return;
  const match = findCustomerByIndividualName($("saleCustName").value.trim());
  if(match){ $("saleCustMobile").value = match.mobile; $("saleCustMobile").dispatchEvent(new Event("input")); }
});
$("addSaleLineBtn").addEventListener("click", ()=>{ renderSaleLine(); updateSaleTotal(); });
$("saveSaleBtn").addEventListener("click", saveSaleInvoice);
$("saleReturnLoadBtn").addEventListener("click", loadSaleReturnLines);
$("quickLabelBtn").addEventListener("click", openQuickLabelModal);
$("quickLabelCancelBtn").addEventListener("click", closeQuickLabelModal);
$("quickLabelPrintBtn").addEventListener("click", printQuickLabel);
$("quickLabelSearch").addEventListener("input", updateQuickLabelPreview);
$("quickLabelSearch").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); if(quickLabelFind($("quickLabelSearch").value)) printQuickLabel(); } });
$("saleScanInput").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); addSaleLineByBarcode($("saleScanInput").value); } });
$("saleCash").addEventListener("input", ()=>{ saleCashTouched = true; });
$("saleNetwork").addEventListener("input", updateSaleTotal);
$("saveInvoiceBtn").addEventListener("click", saveInvoice);
$("saveAndPrintBtn").addEventListener("click", saveInvoiceAndPrint);
$("saveAndSendBtn").addEventListener("click", saveInvoiceAndSend);
$("resetFormBtn").addEventListener("click", async ()=>{
  if(isInvoiceFormDirty()){
    const wantsSave = await showConfirm("عندك فاتورة لسا ما انحفظت. تبي تحفظها قبل ما تفرّغ النموذج؟");
    if(wantsSave){ await saveInvoice(); return; } // saveInvoice() itself calls resetForm() on success
  }
  resetForm();
});
$("addPaymentBtn").addEventListener("click", addPaymentTemp);
$("exportCsvBtn").addEventListener("click", exportCsv);
$("closeMonthBtn").addEventListener("click", performCloseMonth);
$("searchBox").addEventListener("input", renderSearch);
$("searchScope").addEventListener("change", renderSearch);
$("customerSearch").addEventListener("input", renderCustomers);
$("customerFilter").addEventListener("change", renderCustomers);
$("printUndeliveredBtn").addEventListener("click", printUndelivered);
$("showGarmentInventoryBtn").addEventListener("click", showGarmentInventory);
$("showNoFabricWageBtn").addEventListener("click", showNoFabricWageReport);
$("showExpenseSubItemsBtn").addEventListener("click", showExpenseSubItemsReport);
$("showSalesRankingBtn").addEventListener("click", showSalesRankingReport);
$("printCustomersBtn").addEventListener("click", printCustomers);
$("exportCustomersBtn").addEventListener("click", exportCustomersCsv);
$("dailyDate").addEventListener("change", renderDailyPreview);
$("printDailyBtn").addEventListener("click", printDaily);
$("findMissingReceiptBtn").addEventListener("click", findMissingReceiptInvoices);
$("addLegacyBtn").addEventListener("click", addLegacyItem);
function isInvoiceFormDirty(){
  if(editingId || !currentUser) return false;
  const name = $("custName").value.trim();
  const mobile = $("custMobile").value.trim();
  if(name || mobile) return true;
  const cards = Array.from($("garmentsHolder").children);
  return cards.some(card => card.querySelector(".g-price") && parseFloat(card.querySelector(".g-price").value)>0);
}
async function handleUnsavedInvoiceGuard(targetTab){
  const wantsSave = await showConfirm("عندك فاتورة جديدة لسا ما انحفظت. تبي تحفظها قبل ما تطلع؟");
  if(wantsSave){
    await saveInvoice();
    if(!isInvoiceFormDirty()) performTabSwitch(targetTab);
    // if still dirty, saveInvoice() already showed a validation error toast — stay put so they can fix it
  } else {
    resetForm();
    performTabSwitch(targetTab);
  }
}
function switchTab(name){
  if(currentUser && currentUser.role==="خياط" && name!=="scan" && name!=="mail"){ showToast("حساب الخياط يقدر يدخل شاشة المسح والبريد بس"); return; }
  if(currentUser && currentUser.role==="فاحص جودة" && name!=="qc" && name!=="mail"){ showToast("حساب فاحص الجودة يقدر يدخل شاشة الفحص والبريد بس"); return; }
  if(currentUser && currentUser.role!=="خياط" && currentUser.role!=="فاحص جودة" && !(state.permissions[currentUser.role]?.tabs||[]).includes(name)){ showToast("هذا القسم غير متاح لدورك — راجع المدير"); return; }
  const invoiceTabActive = $("tab-invoice").classList.contains("active");
  if(invoiceTabActive && name!=="invoice" && isInvoiceFormDirty()){
    handleUnsavedInvoiceGuard(name);
    return;
  }
  performTabSwitch(name);
}
function performTabSwitch(name){
  if(name==="invoice" && editingId) resetForm(); // safety net: any external navigation to "فاتورة تفصيل جديدة" always starts fully fresh — editInvoice() re-populates its own fields right after this call, so it is unaffected
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===name));
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.toggle("active", p.id==="tab-"+name));
  window.scrollTo({top:0,behavior:"instant"});
  renderNavDrawer();
  renderSidebar();
  renderBottomNav();
  if(name==="sensitiveFinancials") renderSensitiveGate();
  if(name==="bot") renderBotTab();
  if(name==="invoice" && !editingId){
    // refresh dropdowns (e.g. newly-added measurement options) without discarding data already entered
    renderGarmentFields(readGarmentFields());
    // only recompute the auto-estimated delivery date if the form is still fresh (untouched) — don't clobber a manual edit in progress
    if(!isInvoiceFormDirty()) $("invDeliveryDate").value = formatDateInput(computeExpectedDeliveryDate(parseInt($("invCount").value)||1));
  }
}
// idle reminder: periodically check if the invoice form has unsaved data sitting untouched
let invoiceDirtySince = null;
let idleReminderShownAt = null;
function checkAgedUndeliveredLoyalty(){
  const now = Date.now();
  const thirtyDaysMs = 30*24*60*60*1000;
  let changed = false;
  state.invoices.forEach(inv=>{
    if(!inv.loyaltyPointsEarned || inv.loyaltyReversed) return;
    const invDate = new Date(inv.date).getTime();
    if(isNaN(invDate) || now - invDate < thirtyDaysMs) return;
    const hasUndelivered = inv.garments.some(g=> g.status!=="تسليم" && g.status!=="ملغي");
    if(hasUndelivered){ reverseInvoiceLoyaltyIfNeeded(inv, "مضى أكثر من شهر بدون تسليم"); changed = true; }
  });
  if(changed){ saveState(); renderAll(); }
}
function checkReadyForSaleConversions(){
  const now = Date.now();
  const thresholdMs = 67*24*60*60*1000; // 7 days (overdue threshold) + ~2 months (60 days)
  let changed = false;
  state.invoices.forEach(inv=>{
    inv.garments.forEach(g=>{
      if(g.status!=="جاهز" || !g.readyDate || g.convertedToSale) return;
      const readyTime = new Date(g.readyDate).getTime();
      if(isNaN(readyTime) || now - readyTime < thresholdMs) return;
      convertGarmentToSaleItem(g, inv);
      changed = true;
    });
  });
  if(changed){ saveState(); renderAll(); }
}
function convertGarmentToSaleItem(g, inv){
  const card = {id:Date.now()+"-cv"+Math.random().toString(36).slice(2,6), code:nextItemCode(), name:`ثوب جاهز — فاتورة #${inv.number} (${inv.customerName||"—"})`,
    type:"product", unit:"piece", currentCost: garmentFabricCost(g)+tailorWageFor(g)+(state.settings.padding||0),
    openingBalance:0, stockQty:1, reservedQty:0, active:true, minSalePrice:0, salePrice: garmentSalePrice(g)};
  state.itemCards.push(card);
  g.convertedToSale = true;
  g.saleConversionDate = todayStr();
  g.linkedSaleCardId = card.id;
}
setInterval(checkReadyForSaleConversions, 60000);
setInterval(()=>{
  if(!currentUser) return;
  const dirty = isInvoiceFormDirty();
  if(!dirty){ invoiceDirtySince = null; idleReminderShownAt = null; return; }
  if(!invoiceDirtySince){ invoiceDirtySince = Date.now(); return; }
  const thresholdMs = (state.settings.invoiceSaveReminderMinutes||3)*60*1000;
  if(Date.now()-invoiceDirtySince >= thresholdMs && Date.now()-(idleReminderShownAt||0) >= thresholdMs){
    idleReminderShownAt = Date.now();
    showToast("عندك فاتورة لسا ما انحفظت — لا تنسى تضغط حفظ الفاتورة");
  }
}, 15000);
document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    if(btn.dataset.tab==="invoice" && editingId){
      const wantsLeave = await showConfirm("عندك فاتورة قيد التعديل. تبي تطلع منها وتبدأ فاتورة جديدة؟ أي تغيير لسا ما حفظته بينحذف.");
      if(!wantsLeave) return;
    }
    switchTab(btn.dataset.tab);
  });
});
$("addUserBtn").addEventListener("click", addUser);
$("refreshBackupsBtn").addEventListener("click", renderBackupsList);
$("addSubBoxBtn").addEventListener("click", ()=>{
  const name = $("newSubBoxName").value.trim();
  if(!name){ showToast("أدخل اسم الصندوق الفرعي"); return; }
  const owner = (currentUser.role==="مدير") ? ($("newSubBoxOwner").value||currentUser.username) : currentUser.username;
  state.cashBoxes.push({id:"sub-"+owner+"-"+Date.now(), name, owner, type:"cash", isMain:false, balance:0, openingBalance:0});
  saveState(); renderAll(); $("newSubBoxName").value=""; showToast(`تم إنشاء الصندوق الفرعي لـ${owner}`);
});
$("transferToKind").addEventListener("change", ()=>{
  const kind = $("transferToKind").value;
  $("transferToMineWrap").style.display = kind==="mine" ? "" : "none";
  $("transferToUserWrap").style.display = kind==="other" ? "" : "none";
});
$("doTransferBtn").addEventListener("click", ()=>{
  const fromBoxId = $("transferFromBox").value;
  const kind = $("transferToKind").value;
  const amount = parseFloat($("transferAmount").value)||0;
  const purpose = $("transferPurpose").value.trim();
  if(amount<=0){ showToast("أدخل مبلغ صحيح"); return; }
  let toOwner, toBoxId;
  if(kind==="mine"){
    toBoxId = $("transferToMyBox").value; const toBox=findCashBox(toBoxId);
    if(!toBox){ showToast("اختر الصندوق المستلم"); return; }
    toOwner = toBox.owner;
    if(toBoxId===fromBoxId){ showToast("اختر صندوق مختلف عن صندوق المصدر"); return; }
  } else {
    toOwner = $("transferToUser").value;
    if(!toOwner){ showToast("اختر المستخدم المستلم"); return; }
    toBoxId = null;
  }
  const transferSnapshot = JSON.parse(JSON.stringify(state));
  const result = transferFunds(fromBoxId, toOwner, toBoxId, amount, purpose);
  if(!result.ok){ showToast(result.msg); return; }
  saveStateWithRollback(transferSnapshot).then(saved=>{
    if(!saved) return;
    $("transferAmount").value=""; $("transferPurpose").value="";
    showToast(result.instant ? "تم التحويل بنجاح" : "تم إرسال طلب التحويل، بانتظار تأكيد الاستلام");
  });
});
$("expCategory").addEventListener("change", updateExpSubItemOptions);
$("addExpenseBtn").addEventListener("click", ()=>{
  const invoiceNumber = $("expInvNumber").value.trim();
  const taxNumber = $("expTaxNumber").value.trim();
  const date = $("expDate").value || todayStr();
  const categoryId = $("expCategory").value;
  const subItemId = $("expSubItem").value;
  const amount = parseFloat($("expAmount").value)||0;
  const paidTo = $("expPaidTo").value.trim();
  const storeName = $("expStoreName").value.trim();
  const notes = $("expNotes").value.trim();
  const sourceBoxId = $("expSourceBox").value;
  const vatStatus = $("expVatStatus").value;
  if(amount<=0){ showToast("أدخل مبلغ صحيح"); return; }
  if(!sourceBoxId){ showToast("اختر مصدر الدفع"); return; }
  const expenseSnapshot = JSON.parse(JSON.stringify(state));
  const result = addExpense({invoiceNumber, taxNumber, date, categoryId, subItemId, amount, paidTo, storeName, notes, sourceBoxId, vatStatus});
  if(!result.ok){ showToast(result.msg); return; }
  saveStateWithRollback(expenseSnapshot).then(saved=>{
    if(!saved) return;
    $("expInvNumber").value=""; $("expTaxNumber").value=""; $("expAmount").value=""; $("expPaidTo").value=""; $("expStoreName").value=""; $("expNotes").value=""; $("expSubItem").value="";
    showToast("تم حفظ المصروف");
  });
});

$("addSupplierBtn").addEventListener("click", addSupplier);
$("addManualCardBtn").addEventListener("click", addManualItemCard);
$("showStockReportBtn").addEventListener("click", showStockReport);
$("manualCardType").addEventListener("change", updateManualCardLabels);
$("itemImportTemplateBtn").addEventListener("click", downloadItemImportTemplate);
$("itemImportFile").addEventListener("change", ()=>{ const f=$("itemImportFile").files[0]; if(f) previewItemImport(f); });
$("purchType").addEventListener("change", refreshPurchaseForm);
$("purchItemName").addEventListener("input", updatePurchItemStatus);
$("purchSupplierSearch").addEventListener("input", ()=>{
  const val = $("purchSupplierSearch").value.trim();
  const match = state.suppliers.find(s=>s.name===val);
  $("purchSupplier").value = match ? match.id : "";
});
$("returnResponsibleSearch").addEventListener("input", ()=>{
  const val = $("returnResponsibleSearch").value.trim();
  const match = state.users.find(u=>u.username===val && u.role!=="مدير");
  $("returnResponsible").value = match ? match.username : "";
});
$("mailReturnResponsibleSearch").addEventListener("input", ()=>{
  const val = $("mailReturnResponsibleSearch").value.trim();
  const match = state.users.find(u=>u.username===val && u.role!=="مدير");
  $("mailReturnResponsible").value = match ? match.username : "";
});
$("mailAdvanceEmployeeSearch").addEventListener("input", ()=>{
  const val = $("mailAdvanceEmployeeSearch").value.trim();
  const match = state.users.find(u=>u.username===val);
  $("mailAdvanceEmployee").value = match ? match.username : "";
});
$("bonusEmployeeSearch").addEventListener("input", ()=>{
  const val = $("bonusEmployeeSearch").value.trim();
  const match = state.users.find(u=>u.username===val && u.role!=="مدير");
  $("bonusEmployee").value = match ? match.username : "";
});
$("newSubBoxOwnerSearch").addEventListener("input", ()=>{
  const val = $("newSubBoxOwnerSearch").value.trim();
  const match = state.users.find(u=>u.username===val);
  $("newSubBoxOwner").value = match ? match.username : "";
});
$("transferToUserSearch").addEventListener("input", ()=>{
  const val = $("transferToUserSearch").value.trim();
  const match = state.users.find(u=>u.username===val && u.username!==currentUser.username);
  $("transferToUser").value = match ? match.username : "";
});
$("purchQty").addEventListener("input", updatePurchTotal);
$("purchUnitPrice").addEventListener("input", updatePurchTotal);
$("purchPayStatus").addEventListener("change", ()=>{
  $("purchSourceBoxWrap").style.display = $("purchPayStatus").value==="paid" ? "" : "none";
});
$("addPurchaseBtn").addEventListener("click", addPurchase);
$("returnCard").addEventListener("change", refreshReturnForm);
$("returnPayStatus").addEventListener("change", refreshReturnForm);
$("addReturnBtn").addEventListener("click", addPurchaseReturn);
$("addItemBtn").addEventListener("click", addFixedItem);
$("addCatBtn").addEventListener("click", addExpenseCategory);
$("newAddonKind").addEventListener("change", ()=>{
  const isService = $("newAddonKind").value==="service";
  $("newAddonServicePriceWrap").style.display = isService ? "" : "none";
  $("newAddonCardWrap").style.display = isService ? "none" : "";
  $("newAddonQtyWrap").style.display = isService ? "none" : "";
  $("newAddonMarkupWrap").style.display = isService ? "none" : "";
});
$("addAddonBtn").addEventListener("click", addAddonDef);
$("addAlterReasonBtn").addEventListener("click", addAlterReason);
$("addAlterResponsibleBtn").addEventListener("click", addAlterResponsible);
$("alterSearchBtn").addEventListener("click", searchInvoiceForAlteration);
$("alterInvNumber").addEventListener("keydown", e=>{ if(e.key==="Enter") searchInvoiceForAlteration(); });
$("alterLogSearch").addEventListener("input", renderAlterationsLog);
$("tailorScanBtn").addEventListener("click", handleTailorScan);
$("tailorScanInput").addEventListener("keydown", e=>{ if(e.key==="Enter") handleTailorScan(); });
$("tailorCameraBtn").addEventListener("click", ()=> openCameraScan("tailorCameraVideo","tailorCameraWrap","tailorScanInput"));
$("tailorCameraCloseBtn").addEventListener("click", ()=> closeCameraScan("tailorCameraVideo","tailorCameraWrap"));
$("quickScanBtn").addEventListener("click", handleQuickScan);
$("quickScanInput").addEventListener("keydown", e=>{ if(e.key==="Enter") handleQuickScan(); });
$("quickCameraBtn").addEventListener("click", ()=> openCameraScan("quickCameraVideo","quickCameraWrap","quickScanInput"));
$("quickCameraCloseBtn").addEventListener("click", ()=> closeCameraScan("quickCameraVideo","quickCameraWrap"));
$("distSearchBtn").addEventListener("click", searchInvoiceForDistribution);
$("distInvNumber").addEventListener("keydown", e=>{ if(e.key==="Enter") searchInvoiceForDistribution(); });
["setPadding","setEmbroWage"].forEach(id=>{
  $(id).addEventListener("input", ()=>{
    state.settings.padding=parseFloat($("setPadding").value)||0;
    state.settings.embroideryWage=parseFloat($("setEmbroWage").value)||0;
    saveState(); renderAll();
  });
});
$("setMinDepositType").addEventListener("change", ()=>{
  state.settings.minDepositType = $("setMinDepositType").value;
  saveState(); renderAll();
});
$("setQcEnabled").addEventListener("change", ()=>{
  state.settings.qcEnabled = $("setQcEnabled").checked;
  saveState(); applyRolePermissions(); renderAll();
  logAudit("qc_setting_changed", {enabled: state.settings.qcEnabled});
});
$("qcLoadBtn").addEventListener("click", ()=> loadQcInvoice($("qcInvNumber").value.trim()));
$("qcInvNumber").addEventListener("keydown", e=>{ if(e.key==="Enter") loadQcInvoice($("qcInvNumber").value.trim()); });
$("setCommissionBasis").addEventListener("change", ()=>{
  state.settings.commissionBasis = $("setCommissionBasis").value;
  saveState(); renderAll();
});
$("setCuttingCardTemplate").addEventListener("change", ()=>{
  state.settings.cuttingCardTemplate = $("setCuttingCardTemplate").value;
  saveState(); renderAll();
});
$("setMinDepositValue").addEventListener("input", ()=>{
  state.settings.minDepositValue = parseFloat($("setMinDepositValue").value)||0;
  saveState();
});
$("setMeasureUnit").addEventListener("change", ()=>{
  const newUnit = $("setMeasureUnit").value;
  if(newUnit===state.settings.measureUnit) return;
  const factor = newUnit==="yard" ? (1/0.9144) : 0.9144; // meter->yard or yard->meter
  state.itemCards.forEach(c=>{
    if(c.type!=="fabric") return;
    c.currentCost = c.currentCost / factor;
    c.stockQty = c.stockQty * factor;
    c.reservedQty = c.reservedQty * factor;
    c.openingBalance = c.openingBalance * factor;
    if(c.qty) BODY_CATEGORIES.forEach(cat=> c.qty[cat] = (c.qty[cat]||0) * factor);
  });
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{ if(g.qtyUsed) g.qtyUsed = g.qtyUsed * factor; }));
  // purchase history too — otherwise a linked supplier return compares the converted stock against
  // quantities still in the old unit (and values it at a per-old-unit price)
  const isFabric = id=> (findItemCard(id)||{}).type==="fabric";
  state.purchases.forEach(p=>{ if(isFabric(p.itemCardId)){ p.quantity = p.quantity * factor; p.unitPrice = p.unitPrice / factor; } });
  state.purchaseReturns.forEach(r=>{ if(isFabric(r.itemCardId)) r.quantity = r.quantity * factor; });
  (state.stockWriteOffs||[]).forEach(w=>{ if(isFabric(w.itemCardId)) w.qty = w.qty * factor; });
  state.salesInvoices.forEach(s=> s.items.forEach(it=>{ if(isFabric(it.itemCardId)){ it.qty = it.qty * factor; it.price = it.price / factor; it.costAtSale = (it.costAtSale||0) / factor; } }));
  (state.salesReturns||[]).forEach(r=> r.lines.forEach(l=>{ if(isFabric(l.itemCardId)){ l.qty = l.qty * factor; l.price = l.price / factor; l.costAtSale = (l.costAtSale||0) / factor; } }));
  BODY_CATEGORIES.forEach(cat=> state.settings.defaultFabricQty[cat] = (state.settings.defaultFabricQty[cat]||0) * factor);
  state.settings.fabricQtyBuffer = state.settings.fabricQtyBuffer * factor;
  state.settings.measureUnit = newUnit;
  saveState(); renderAll();
  showToast(`تم تحويل كل الكميات إلى ${newUnit==="yard"?"اليارده":"المتر"}`);
});
$("setLoyEarnRate").addEventListener("input", ()=>{ state.settings.loyaltyEarnRate=parseFloat($("setLoyEarnRate").value)||1; saveState(); });
$("setLoyRedeemRate").addEventListener("input", ()=>{ state.settings.loyaltyRedeemRate=parseFloat($("setLoyRedeemRate").value)||0; saveState(); });
$("setLoyMinRedeem").addEventListener("input", ()=>{ state.settings.loyaltyMinRedeem=parseFloat($("setLoyMinRedeem").value)||0; saveState(); });
$("setLoySilverThreshold").addEventListener("input", ()=>{ state.settings.loyaltySilverThreshold=parseFloat($("setLoySilverThreshold").value)||0; saveState(); });
$("setLoyGoldThreshold").addEventListener("input", ()=>{ state.settings.loyaltyGoldThreshold=parseFloat($("setLoyGoldThreshold").value)||0; saveState(); });
$("setLoySilverMultiplier").addEventListener("input", ()=>{ state.settings.loyaltySilverMultiplier=parseFloat($("setLoySilverMultiplier").value)||1; saveState(); });
$("setLoySilverDiscount").addEventListener("input", ()=>{ state.settings.loyaltySilverDiscountPercent=parseFloat($("setLoySilverDiscount").value)||0; saveState(); });
$("setLoyGoldMultiplier").addEventListener("input", ()=>{ state.settings.loyaltyGoldMultiplier=parseFloat($("setLoyGoldMultiplier").value)||1; saveState(); });
$("setLoyGoldDiscount").addEventListener("input", ()=>{ state.settings.loyaltyGoldDiscountPercent=parseFloat($("setLoyGoldDiscount").value)||0; saveState(); });
$("setShopName").addEventListener("input", ()=>{ state.settings.shopName=$("setShopName").value.trim(); saveState(); applyShopBranding(); });
$("setShopNumber").addEventListener("input", ()=>{ state.settings.shopNumber=$("setShopNumber").value.trim(); saveState(); });
$("setCommercialReg").addEventListener("input", ()=>{ state.settings.commercialRegistration=$("setCommercialReg").value.trim(); saveState(); });
$("setMunicipalLicense").addEventListener("input", ()=>{ state.settings.municipalLicense=$("setMunicipalLicense").value.trim(); saveState(); });
$("setShopAddress").addEventListener("input", ()=>{ state.settings.shopAddress=$("setShopAddress").value.trim(); saveState(); });
$("setShopPhone").addEventListener("input", ()=>{ state.settings.shopPhone=$("setShopPhone").value.trim(); saveState(); });
$("setShopLogoInput").addEventListener("change", ()=>{
  const file = $("setShopLogoInput").files[0];
  if(!file) return;
  if(file.size > 1024*1024){ showToast("حجم الصورة كبير — اختر صورة أقل من 1 ميجابايت"); return; }
  const reader = new FileReader();
  reader.onload = ()=>{ state.settings.shopLogo = reader.result; saveState(); renderAll(); showToast("تم رفع الشعار"); };
  reader.readAsDataURL(file);
});
$("setTakhaleesIconInput").addEventListener("change", ()=>{
  const file = $("setTakhaleesIconInput").files[0];
  if(!file) return;
  if(file.size > 512*1024){ showToast("حجم الصورة كبير — اختر صورة أقل من 512 كيلوبايت"); return; }
  const reader = new FileReader();
  reader.onload = ()=>{ state.settings.takhaleesIcon = reader.result; saveState(); showToast("تم رفع أيقونة التخاليص"); };
  reader.readAsDataURL(file);
});
$("setThemeMode").addEventListener("change", ()=>{
  state.settings.themeMode = $("setThemeMode").value;
  applyThemeMode();
  saveState();
});
$("addCustomFieldBtn").addEventListener("click", addCustomShopField);
$("addFabricOriginBtn").addEventListener("click", addFabricOrigin);
$("addCustomMeasFieldBtn").addEventListener("click", addCustomMeasurementField);
$("setPrintOriginOnLabel").addEventListener("change", ()=>{
  state.settings.printOriginOnLabel = $("setPrintOriginOnLabel").checked; saveState();
});
$("newOfferType").addEventListener("change", ()=>{
  const isQty = $("newOfferType").value==="quantity_discount";
  $("offerQtyFields").style.display = isQty?"":"none";
  $("offerGiftFields").style.display = isQty?"none":"";
});
$("offerMatchBy").addEventListener("change", renderOffers);
$("addOfferBtn").addEventListener("click", addOffer);
$("addPromoCodeBtn").addEventListener("click", savePromoCodeForm);
$("applyPromoCodeBtn").addEventListener("click", applyPromoCodeInput);
$("directDiscountInput").addEventListener("input", updateLiveTotals);
$("promoNewType").addEventListener("change", ()=>{
  const t = $("promoNewType").value;
  $("promoNewGiftWrap").style.display = t==="gift" ? "" : "none";
  $("promoNewValueWrap").style.display = t==="gift" ? "none" : "";
  $("promoNewValueLabel").textContent = t==="percentage" ? "النسبة % (1-100)" : "قيمة القسيمة (ريال)";
});
$("purchType").addEventListener("change", ()=>{ $("purchOrigin").value=""; $("purchSeason").value=""; });
$("setInvoiceFooter").addEventListener("input", ()=>{ state.settings.invoiceFooterText=$("setInvoiceFooter").value; saveState(); });
$("setSaveReminderMinutes").addEventListener("input", ()=>{ state.settings.invoiceSaveReminderMinutes=parseFloat($("setSaveReminderMinutes").value)||3; saveState(); });
$("setDefaultDeliveryDays").addEventListener("input", ()=>{ state.settings.defaultDeliveryDays=parseInt($("setDefaultDeliveryDays").value)||3; saveState(); });
$("setCuttingOverdueDays").addEventListener("input", ()=>{ state.settings.cuttingOverdueDays=parseInt($("setCuttingOverdueDays").value)||3; saveState(); renderAll(); });
$("setReceiptTerms").addEventListener("input", ()=>{ state.settings.receiptTerms=$("setReceiptTerms").value; saveState(); });
$("setVatEnabled").addEventListener("change", ()=>{ state.settings.vatEnabled=$("setVatEnabled").checked; saveState(); showToast(state.settings.vatEnabled?"تم تفعيل ضريبة القيمة المضافة":"تم إيقاف ضريبة القيمة المضافة"); });
$("setEinvoiceEnabled").addEventListener("change", ()=>{ state.settings.einvoiceEnabled=$("setEinvoiceEnabled").checked; saveState(); showToast(state.settings.einvoiceEnabled?"تم تفعيل الفوترة الإلكترونية على الفواتير الجديدة":"تم إيقاف الفوترة الإلكترونية"); });
$("setVatNumber").addEventListener("input", ()=>{ state.settings.vatNumber=$("setVatNumber").value.trim(); saveState(); });
$("setShopLegalName").addEventListener("input", ()=>{ state.settings.shopLegalName=$("setShopLegalName").value.trim(); saveState(); });
$("setVatRate").addEventListener("input", ()=>{ state.settings.vatRate=parseFloat($("setVatRate").value)||0; saveState(); });
$("setPricesIncludeVat").addEventListener("change", ()=>{ state.settings.pricesIncludeVat = $("setPricesIncludeVat").value==="yes"; saveState(); renderAll(); });
$("setNextInv").addEventListener("input", ()=>{
  state.settings.nextInvoiceNumber=parseInt($("setNextInv").value)||1; saveState();
  if(!editingId) $("invNumber").value=state.settings.nextInvoiceNumber;
});
$("setNextSaleInv").addEventListener("input", ()=>{
  state.settings.nextSalesInvoiceNumber=parseInt($("setNextSaleInv").value)||1; saveState();
  $("saleNumber").value=state.settings.nextSalesInvoiceNumber;
});
$("setThermalWidth").addEventListener("change", ()=>{
  state.settings.thermalPaperWidth = parseInt($("setThermalWidth").value)||58; saveState();
});
$("setSensitivePin").addEventListener("input", ()=>{
  state.settings.sensitivePin = $("setSensitivePin").value.trim(); saveState();
  sensitiveUnlocked = false; renderSensitiveGate();
});
$("sensitivePinSubmitBtn").addEventListener("click", submitSensitivePin);
$("setBankFee").addEventListener("input", ()=>{
  state.settings.bankFeePercent = parseFloat($("setBankFee").value)||0; saveState();
});
$("setWaWelcome").addEventListener("change", ()=>{
  state.settings.waWelcomeEnabled = $("setWaWelcome").checked; saveState();
});
$("setWaPromo").addEventListener("input", ()=>{
  state.settings.waPromoMessage = $("setWaPromo").value; saveState();
});

(async function init(){
  await syncServerTime();
  applyThemeMode(); // shop-specific theme isn't known before sign-in; falls back to the default dark theme
  const shopExists = await checkShopExists();
  $("loginLoadingState").classList.add("hidden");
  if(shopExists) $("loginFormState").classList.remove("hidden");
  else $("firstSetupFormState").classList.remove("hidden");
  $("dailyDate").value = todayStr();
  $("expDate").value = todayStr();
  $("distStatusFilter").innerHTML += STATUSES.map(s=>`<option value="${s.v}">${s.label}</option>`).join("");
  $("shiftAuditDate").value = todayStr();
  $("productionDate").value = todayStr();
  $("productionDate").addEventListener("change", renderProductionTracking);
  $("runShiftAuditBtn").addEventListener("click", runShiftAudit);
  $("voucherType").addEventListener("change", ()=>{
    $("voucherPartyLabel").textContent = $("voucherType").value==="receipt" ? "استلمنا من (الاسم)" : "صرفنا إلى (الاسم)";
  });
  $("submitVoucherBtn").addEventListener("click", submitVoucher);
  $("legDeliverConfirmBtn").addEventListener("click", confirmLegacyDeliver);
  $("mailComposeReturnBtn").addEventListener("click", ()=> switchMailComposeForm("Return"));
  $("mailComposeAdvanceBtn").addEventListener("click", ()=> switchMailComposeForm("Advance"));
  $("mailComposeLeaveBtn").addEventListener("click", ()=> switchMailComposeForm("Leave"));
  $("mailSubmitReturnBtn").addEventListener("click", submitMailReturnRequest);
  $("mailSubmitAdvanceBtn").addEventListener("click", submitMailAdvanceRequest);
  $("mailSubmitLeaveBtn").addEventListener("click", submitMailLeaveRequest);
  $("mailDecisionConfirmBtn").addEventListener("click", confirmMailDecision);
  $("mailDecisionChoice").addEventListener("change", ()=>{
    const choice = $("mailDecisionChoice").value;
    $("mailDecisionPartialWrap").style.display = choice==="partial" ? "" : "none";
    $("mailDecisionBoxWrap").style.display = choice==="reject" ? "none" : "";
  });
  $("mailDecisionCancelBtn").addEventListener("click", closeMailDecisionModal);
  $("printLabelConfirmBtn").addEventListener("click", confirmPrintLabel);
  $("printLabelCancelBtn").addEventListener("click", closePrintLabelModal);
  $("mailToggleBtn").addEventListener("click", ()=> switchTab("mail"));
  $("payrollToggleBtn").addEventListener("click", ()=> switchTab("payroll"));
  $("itemCardSearchInput").addEventListener("input", renderItemCards);
  $("submitBonusBtn").addEventListener("click", submitBonusOrDeduction);
  $("addSeasonBtn").addEventListener("click", addSeason);
  $("tailorReportSelect").addEventListener("change", ()=>{ $("tailorReportView").innerHTML = buildTailorMonthlyReport($("tailorReportSelect").value, todayStr().slice(0,7)); });
  ["bcTierFilter","bcActivityFilter","bcDebtFilter"].forEach(id=> $(id).addEventListener("change", ()=>{ broadcastPage=0; renderBroadcastList(); }));
  $("bcSearchInput").addEventListener("input", ()=>{ broadcastPage=0; renderBroadcastList(); });
  $("bcMessageInput").addEventListener("input", renderBroadcastList);
  $("resetBroadcastBtn").addEventListener("click", resetBroadcastCampaign);
  $("exportBroadcastExcelBtn").addEventListener("click", exportBroadcastToExcel);
  $("bcPrevPageBtn").addEventListener("click", ()=>{ broadcastPage--; renderBroadcastList(); });
  $("bcNextPageBtn").addEventListener("click", ()=>{ broadcastPage++; renderBroadcastList(); });
  $("cuttingImgFrontInput").addEventListener("change", (e)=> handleCuttingImageUpload("front", e.target.files[0]));
  $("cuttingImgBackInput").addEventListener("change", (e)=> handleCuttingImageUpload("back", e.target.files[0]));
  $("cuttingImgViewFront").addEventListener("click", ()=>{ cuttingImgCurrentView="front"; cuttingImgArmedField=null; renderCuttingImageEditor(); });
  $("cuttingImgViewBack").addEventListener("click", ()=>{ cuttingImgCurrentView="back"; cuttingImgArmedField=null; renderCuttingImageEditor(); });
  $("cuttingImgCanvas").addEventListener("click", handleCuttingImageClick);
  $("legDeliverCancelBtn").addEventListener("click", closeLegacyDeliverModal);
  $("searchVouchersBtn").addEventListener("click", renderVouchersLog);
  $("voucherSearch").addEventListener("input", renderVouchersLog);
  $("voucherFilterType").addEventListener("change", renderVouchersLog);
  $("returnPeriodWrap").innerHTML = periodPickerHtml("return"); bindPeriodPicker("return");
  $("searchReturnsBtn").addEventListener("click", renderReturns);
  $("returnSearch").addEventListener("input", renderReturns);
  $("garmInvPeriodWrap").innerHTML = periodPickerHtml("garmInv"); bindPeriodPicker("garmInv");
  $("noFabricWagePeriodWrap").innerHTML = periodPickerHtml("noFabricWage"); bindPeriodPicker("noFabricWage");
  $("expenseSubItemsPeriodWrap").innerHTML = periodPickerHtml("expSub"); bindPeriodPicker("expSub");
  $("undelPeriodWrap").innerHTML = periodPickerHtml("undel"); bindPeriodPicker("undel");
  $("fullLogPeriodWrap").innerHTML = extendedPeriodPickerHtml("fullLog"); bindExtendedPeriodPicker("fullLog");
  $("showFullLogBtn").addEventListener("click", showFullActivityLog);
  $("vatCalcPeriodWrap").innerHTML = extendedPeriodPickerHtml("vatCalc"); bindExtendedPeriodPicker("vatCalc");
  $("showVatCalcBtn").addEventListener("click", showVatCalculator);
  $("addVatPaymentBtn").addEventListener("click", ()=>{
    const date = $("vatPaymentDate").value || todayStr();
    const amount = parseFloat($("vatPaymentAmount").value)||0;
    const note = $("vatPaymentNote").value.trim();
    if(amount<=0){ showToast("أدخل مبلغ صحيح"); return; }
    state.vatPayments.push({id:newId(), date, amount, note, recordedBy:currentUser.username});
    saveState(); renderVatLedger();
    $("vatPaymentAmount").value=""; $("vatPaymentNote").value="";
    showToast("تم تسجيل دفعة الضريبة");
  });
  $("loadAuditLogBtn").addEventListener("click", loadAndRenderAuditLog);
  $("runIntegrityCheckBtn").addEventListener("click", renderIntegrityCheck);
  $("submitReturnBtn").addEventListener("click", submitInvoiceReturn);
})();
