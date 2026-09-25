// ---------------- inventory: item cards, suppliers, purchases, returns ----------------
// manual expand/collapse overrides, keyed by card id — falls back to isItemCardIncomplete() when a card has no override yet
let itemCardExpandOverrides = {};
// item-card ids this browser session is allowed to edit the opening balance of (admin-approved, one-time use) —
// lives only in memory so it's naturally gone on refresh, and is explicitly cleared on logout
let openingBalanceSessionGrants = new Set();
// pulls any admin-approved requests for the signed-in user into this session's live grants
function checkOpeningBalanceGrants(){
  if(!currentUser || currentUser.role==="مدير") return;
  (state.openingBalanceEditRequests||[]).forEach(r=>{
    if(r.status==="approved" && r.requestedBy===currentUser.username) openingBalanceSessionGrants.add(r.cardId);
  });
}
function requestOpeningBalanceEdit(cardId){
  const card = findItemCard(cardId);
  if(!card) return;
  if(!state.openingBalanceEditRequests) state.openingBalanceEditRequests=[];
  if(state.openingBalanceEditRequests.some(r=>r.cardId===cardId && r.requestedBy===currentUser.username && r.status==="pending")){
    showToast("فيه طلب سابق لنفس الصنف بانتظار موافقة المدير");
    return;
  }
  state.openingBalanceEditRequests.push({id:newId(), cardId, cardName:card.name, requestedBy:currentUser.username, requestedAt:new Date().toISOString(), status:"pending"});
  saveState(); renderAll();
  showToast("تم إرسال طلب التعديل للمدير");
}
function renderOpeningBalanceRequestsPanel(){
  const el = $("adminOnly_openingBalanceRequests");
  if(!el) return;
  const pending = (state.openingBalanceEditRequests||[]).filter(r=>r.status==="pending");
  if(!pending.length){ el.innerHTML=""; return; }
  el.innerHTML = `<div class="garment-card" style="border-color:var(--gold-soft);">
    <span class="tag">طلبات تعديل رصيد أول المدة (${pending.length})</span>
    ${pending.map(r=>`<div class="item-row"><span>${esc(r.requestedBy)} — الصنف: ${esc(r.cardName)}</span>
      <button class="btn btn-ghost btn-sm" onclick="approveOpeningBalanceRequest('${r.id}')">قبول</button>
      <button class="btn btn-ghost btn-sm" onclick="denyOpeningBalanceRequest('${r.id}')">رفض</button></div>`).join("")}
  </div>`;
}
function approveOpeningBalanceRequest(reqId){
  const req = (state.openingBalanceEditRequests||[]).find(r=>r.id===reqId);
  if(!req) return;
  req.status="approved"; req.approvedBy=currentUser.username; req.approvedAt=new Date().toISOString();
  saveState(); renderAll();
  showToast(`تمت الموافقة — يقدر ${req.requestedBy} يعدّل رصيد "${req.cardName}" مرة وحدة قبل ما يسجّل خروج`);
}
function denyOpeningBalanceRequest(reqId){
  const req = (state.openingBalanceEditRequests||[]).find(r=>r.id===reqId);
  if(!req) return;
  req.status="denied"; req.approvedBy=currentUser.username; req.approvedAt=new Date().toISOString();
  saveState(); renderAll();
  showToast("تم رفض الطلب");
}
function isItemCardIncomplete(c){
  if(c.type==="fabric"){
    if(!c.origin || !c.season) return true;
    if(BODY_CATEGORIES.some(cat=> !(c.prices[cat]>0))) return true;
    if(BODY_CATEGORIES.some(cat=> !(c.qty[cat]>0))) return true;
    return false;
  }
  if(c.type==="product") return !(c.salePrice>0);
  return false;
}
function isItemCardExpanded(c){
  return itemCardExpandOverrides.hasOwnProperty(c.id) ? itemCardExpandOverrides[c.id] : isItemCardIncomplete(c);
}
function toggleItemCardExpand(cardId){
  itemCardExpandOverrides[cardId] = !isItemCardExpanded(findItemCard(cardId));
  renderItemCards();
}
// price card for "أجرة تفصيل (بدون قماش)": sale price + minimum price per category (no stock — the
// customer brings the fabric). The invoice form fills the price from here and enforces the minimum
// exactly like a fabric's, so a cashier can't go below it without discount permission.
function renderTailoringOnlyCard(){
  const el = $("tailoringOnlyCard");
  if(!el) return;
  const t = state.settings.tailoringOnly;
  el.innerHTML = `<div class="garment-card" style="border-color:var(--gold);">
    <span class="tag">كرت صنف: أجرة تفصيل (بدون قماش)</span>
    <p class="sub" style="margin:6px 0;">للثوب اللي يجيب العميل قماشه — سعر البيع يتعبّى تلقائياً بالفاتورة حسب الفئة، والحد الأدنى يمنع البيع بأقل منه إلا لمن عنده صلاحية خصم (وضمن حدّه). تعديل سعر الرجال يحسب الولادي والطفل تلقائياً.</p>
    <div class="row-3">${BODY_CATEGORIES.map(cat=>`<div class="field"><label>سعر ${cat} (ريال)</label><input type="number" class="to-price" data-cat="${cat}" min="0" value="${t.prices[cat]||""}" placeholder="0"></div>`).join("")}</div>
    <div class="row-3">${BODY_CATEGORIES.map(cat=>`<div class="field"><label>الحد الأدنى ${cat} (ريال)</label><input type="number" class="to-minprice" data-cat="${cat}" min="0" step="5" value="${t.minPrices[cat]||""}" placeholder="0"></div>`).join("")}</div>
  </div>`;
  const bind = (cls, field)=> el.querySelectorAll(cls).forEach(inp=> inp.addEventListener("change", ()=>{
    // read it fresh: any save reloads `state`, so an object captured at render time goes stale and
    // a second edit would be written to a copy that's no longer saved
    const t = state.settings.tailoringOnly;
    const old = t[field][inp.dataset.cat];
    t[field][inp.dataset.cat] = parseFloat(inp.value)||0;
    if(inp.dataset.cat==="رجال"){
      autoCalcCategoryPricing(t, field, true);
      el.querySelectorAll(cls).forEach(sib=>{ if(sib!==inp) sib.value = t[field][sib.dataset.cat]||""; });
    }
    saveState();
    logAudit("price_changed", {cardName:"أجرة تفصيل (بدون قماش)", field, category:inp.dataset.cat, oldPrice:old, newPrice:t[field][inp.dataset.cat]});
  }));
  bind(".to-price", "prices");
  bind(".to-minprice", "minPrices");
}
function renderItemCards(){
  renderTailoringOnlyCard();
  checkOpeningBalanceGrants();
  if(currentUser && currentUser.role==="مدير") renderOpeningBalanceRequestsPanel();
  const el = $("itemCardsList");
  if(!state.itemCards.length){ el.innerHTML = `<p class="sub">ما فيه أصناف بعد — تُنشأ تلقائياً أول ما تسجّل فاتورة شراء.</p>`; return; }
  const query = ($("itemCardSearchInput")?.value||"").trim().toLowerCase();
  const filtered = query ? state.itemCards.filter(c=>c.name.toLowerCase().includes(query)) : state.itemCards;
  if(!filtered.length){ el.innerHTML = `<p class="sub">ما فيه أصناف مطابقة لبحثك.</p>`; return; }
  el.innerHTML = filtered.map(c=>{
    const avail = cardAvailableQty(c);
    const incomplete = isItemCardIncomplete(c);
    const expanded = isItemCardExpanded(c);
    const fabricExtraFields = c.type==="fabric" ? `
      <div class="row-2">
        <div class="field"><label>الصناعة (بلد المنشأ) ${!c.origin?"— إلزامي":""}</label><select class="card-origin" data-card="${c.id}">
          <option value="">-- اختر --</option>
          ${state.fabricOrigins.map(o=>`<option value="${esc(o)}" ${c.origin===o?"selected":""}>${esc(o)}</option>`).join("")}
        </select></div>
        <div class="field"><label>الموسم ${!c.season?"— إلزامي":""}</label><select class="card-season" data-card="${c.id}">
          <option value="">-- اختر --</option>
          <option value="صيفي" ${c.season==="صيفي"?"selected":""}>صيفي</option>
          <option value="شتوي" ${c.season==="شتوي"?"selected":""}>شتوي</option>
        </select></div>
      </div>` : "";
    const priceFields = c.type==="fabric" ? `
      <div class="row-3" style="margin-top:8px;">
        ${BODY_CATEGORIES.map(cat=>`<div class="field"><label>سعر ${cat} (ريال)</label><input type="number" class="card-price" data-card="${c.id}" data-cat="${cat}" value="${c.prices[cat]||""}" placeholder="0"></div>`).join("")}
      </div>
      <div class="row-3">
        ${BODY_CATEGORIES.map(cat=>`<div class="field"><label>كمية ${cat} (${unitLabel()})</label><input type="number" class="card-qty" data-card="${c.id}" data-cat="${cat}" step="0.1" value="${c.qty[cat]||""}" placeholder="0"></div>`).join("")}
      </div>` : c.type==="product" ? `<div class="field"><label>سعر البيع (ريال)</label><input type="number" class="card-saleprice" data-card="${c.id}" value="${c.salePrice||""}" placeholder="0"></div>` : "";
    const typeLabelAr = c.type==="fabric"?"قماش":c.type==="product"?"منتج جاهز":"ملحق فعلي";
    const originSeasonBadge = c.type==="fabric" && (c.origin||c.season) ? ` — ${c.origin||""}${c.origin&&c.season?" / ":""}${c.season||""}` : "";
    const isAdmin = currentUser && currentUser.role==="مدير";
    const needsPermission = !isAdmin && c.openingBalance && !openingBalanceSessionGrants.has(c.id);
    const myPendingReq = needsPermission && (state.openingBalanceEditRequests||[]).find(r=>r.cardId===c.id && r.requestedBy===currentUser.username && r.status==="pending");
    const openingRequestHtml = needsPermission ? (myPendingReq
        ? `<p class="sub" style="color:var(--gold-soft);">بانتظار موافقة المدير على طلب التعديل</p>`
        : `<button class="btn btn-ghost btn-sm" onclick="requestOpeningBalanceEdit('${c.id}')">طلب إذن تعديل رصيد أول المدة من المدير</button>`) : "";
    const bodyHtml = expanded ? `
      ${fabricExtraFields}
      <div class="row-2">
        <div class="field"><label>رصيد أول المدة (${c.type==="fabric"?unitLabel():"قطعة"})</label><input type="number" class="card-opening" data-card="${c.id}" step="0.1" value="${c.openingBalance||""}" placeholder="0" ${needsPermission?"readonly":""}></div>
        <div class="field"><label>تكلفة الوحدة لرصيد أول المدة (ريال) — عدّلها يدوياً لو ما فيه فاتورة شراء</label><input type="number" class="card-cost" data-card="${c.id}" step="0.01" value="${c.currentCost||""}" placeholder="0"></div>
      </div>
      ${openingRequestHtml}
      <div class="field"><label>حد أدنى للمخزون (${c.type==="fabric"?unitLabel():"قطعة"}) — تنبيه لو نزل تحته</label><input type="number" class="card-minstock" data-card="${c.id}" min="0" step="0.1" value="${c.minStock||""}" placeholder="0 = بدون تنبيه"></div>
      ${c.type==="fabric" ? `<div class="row-3">
        ${BODY_CATEGORIES.map(cat=>`<div class="field"><label>الحد الأدنى ${cat} (ريال)</label><input type="number" class="card-minprice-cat" data-card="${c.id}" data-cat="${cat}" min="0" step="5" value="${(c.minPrices&&c.minPrices[cat])||""}" placeholder="0"></div>`).join("")}
      </div>` : ""}
      ${c.type==="fabric" ? `<div class="field"><label>سعر بيع القماش مباشرةً بالمتر (ريال) — يُستخدم بفاتورة "بيع قماش"، منفصل عن أسعار التفصيل أعلاه</label><input type="number" class="card-fabric-saleprice" data-card="${c.id}" min="0" step="0.5" value="${c.salePrice||""}" placeholder="0"></div>` : ""}
      ${priceFields}
      <div class="actions-row" style="margin-top:8px;">
        <button class="btn btn-ghost btn-sm" onclick="toggleItemCardActive('${c.id}')">${c.active?"⏸ إيقاف":"▶ تفعيل"}</button>
        <button class="btn btn-ghost btn-sm" onclick="showItemStatement('${c.id}')">كشف حساب الصنف</button>
        ${c.type==="fabric"||c.type==="product" ? `<button class="btn btn-ghost btn-sm" onclick="openPrintLabelModal('${c.id}')">طباعة ملصق السعر والباركود</button>` : ""}
        <button class="btn btn-danger btn-sm" onclick="writeOffItemCard('${c.id}')">إتلاف الصنف</button>
      </div>` : "";
    return `<div class="garment-card">
      <div class="ic-header" data-card="${c.id}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;">
        <span class="tag">#${c.code!==undefined?c.code:"—"} — ${esc(c.name)} — ${typeLabelAr}${originSeasonBadge}${c.active?"":" (متوقف)"}${incomplete?` — <b style="color:var(--loss);">بيانات ناقصة</b>`:""}</span>
        <i data-lucide="${expanded?"chevron-up":"chevron-down"}" style="flex-shrink:0;"></i>
      </div>
      <p class="sub" style="margin:6px 0;">التكلفة الحالية: ${c.currentCost.toFixed(2)} ريال / ${c.type==="fabric"?unitLabel():"قطعة"} — المتاح: ${avail.toFixed(1)} ${c.type==="fabric"?unitLabel():"قطعة"}${c.reservedQty?` (محجوز: ${c.reservedQty.toFixed(1)})`:""} — إجمالي القيمة: <b>${(avail*(c.currentCost||0)).toFixed(2)} ريال</b></p>
      ${avail<=0 ? `<p style="color:var(--loss);font-weight:700;margin:4px 0;">المخزون منتهٍ أو سالب</p>` : (c.minStock>0 && avail<c.minStock) ? `<p style="color:var(--loss);font-weight:700;margin:4px 0;">تحت الحد الأدنى (${c.minStock} ${c.type==="fabric"?unitLabel():"قطعة"})</p>` : ""}
      ${bodyHtml}
    </div>`;
  }).join("") + `<div id="itemStatementView" style="margin-top:14px;"></div>`;
  document.querySelectorAll(".card-opening").forEach(inp=> inp.addEventListener("change", async ()=>{
    const card = findItemCard(inp.dataset.card);
    const oldVal = card.openingBalance||0;
    const newVal = parseFloat(inp.value)||0;
    const isFirstEntry = !oldVal; // any user can enter it the first time while setting up the card
    const isAdmin = currentUser && currentUser.role==="مدير";
    const hasSessionGrant = openingBalanceSessionGrants.has(card.id);
    if(!isFirstEntry && !isAdmin && !hasSessionGrant){
      showToast("تعديل رصيد أول المدة بعد إدخاله يحتاج إذن من المدير — اطلبه بالزر بجانب الحقل");
      inp.value = oldVal||"";
      return;
    }
    if(!isFirstEntry){
      const ok = await confirmWithPassword(`تأكيد تغيير رصيد أول المدة لصنف "${card.name}" من ${oldVal.toFixed(1)} إلى ${newVal.toFixed(1)}.\nأدخل كلمة مرورك للتأكيد.`);
      if(!ok){ inp.value = oldVal||""; return; }
    }
    card.openingBalance = newVal;
    if(!isFirstEntry){
      if(!state.openingBalanceAdjustments) state.openingBalanceAdjustments=[];
      state.openingBalanceAdjustments.push({id:newId(), date:todayStr(), cardId:card.id, cardName:card.name, oldValue:oldVal, newValue:newVal, username:currentUser.username});
      if(hasSessionGrant){
        openingBalanceSessionGrants.delete(card.id); // single use — the one-time admin approval is now spent
        const req = (state.openingBalanceEditRequests||[]).find(r=>r.cardId===card.id && r.requestedBy===currentUser.username && r.status==="approved");
        if(req) req.status="used";
      }
    }
    saveState(); renderAll();
    if(!isFirstEntry) logAudit("opening_balance_changed", {cardId:card.id, cardName:card.name, oldValue:oldVal, newValue:newVal});
    showToast("تم تحديث رصيد أول المدة");
  }));
  document.querySelectorAll(".card-cost").forEach(inp=> inp.addEventListener("change", ()=>{
    findItemCard(inp.dataset.card).currentCost = parseFloat(inp.value)||0; saveState(); renderAll();
  }));
  document.querySelectorAll(".card-minstock").forEach(inp=> inp.addEventListener("change", ()=>{
    const c = findItemCard(inp.dataset.card);
    c.minStock = parseFloat(inp.value)||0;
    c.lowStockAlertedDate = null; // reset so a new threshold can re-trigger an alert
    saveState(); renderAll();
  }));
  document.querySelectorAll(".card-price").forEach(inp=> inp.addEventListener("change", ()=>{
    const c = findItemCard(inp.dataset.card);
    const oldPrice = c.prices[inp.dataset.cat];
    c.prices[inp.dataset.cat] = parseFloat(inp.value)||0;
    if(inp.dataset.cat==="رجال"){
      autoCalcCategoryPricing(c, "prices");
      // patch sibling price fields in place instead of a full renderAll() — a re-render mid-entry steals focus
      // and misdirects the next keystrokes into the wrong field while tabbing through رجال/ولادي/طفل
      document.querySelectorAll(`.card-price[data-card="${c.id}"]`).forEach(sib=>{ if(sib!==inp) sib.value = c.prices[sib.dataset.cat]||""; });
    }
    saveState();
    logAudit("price_changed", {cardId:c.id, cardName:c.name, category:inp.dataset.cat, oldPrice, newPrice:c.prices[inp.dataset.cat]});
  }));
  document.querySelectorAll(".card-qty").forEach(inp=> inp.addEventListener("change", ()=>{
    const c = findItemCard(inp.dataset.card);
    c.qty[inp.dataset.cat] = parseFloat(inp.value)||0;
    if(inp.dataset.cat==="رجال"){
      autoCalcCategoryPricing(c, "qty", false);
      document.querySelectorAll(`.card-qty[data-card="${c.id}"]`).forEach(sib=>{ if(sib!==inp) sib.value = c.qty[sib.dataset.cat]||""; });
    }
    saveState();
  }));
  document.querySelectorAll(".card-saleprice").forEach(inp=> inp.addEventListener("change", ()=>{
    findItemCard(inp.dataset.card).salePrice = parseFloat(inp.value)||0; saveState();
  }));
  document.querySelectorAll(".card-origin").forEach(sel=> sel.addEventListener("change", ()=>{
    findItemCard(sel.dataset.card).origin = sel.value; saveState(); renderAll();
  }));
  document.querySelectorAll(".card-season").forEach(sel=> sel.addEventListener("change", ()=>{
    findItemCard(sel.dataset.card).season = sel.value; saveState(); renderAll();
  }));
  document.querySelectorAll(".card-minprice-cat").forEach(inp=> inp.addEventListener("change", ()=>{
    const c = findItemCard(inp.dataset.card);
    if(!c.minPrices) c.minPrices = {};
    c.minPrices[inp.dataset.cat] = parseFloat(inp.value)||0;
    if(inp.dataset.cat==="رجال") autoCalcCategoryPricing(c, "minPrices");
    saveState(); renderAll();
  }));
  document.querySelectorAll(".card-fabric-saleprice").forEach(inp=> inp.addEventListener("change", ()=>{
    findItemCard(inp.dataset.card).salePrice = parseFloat(inp.value)||0; saveState();
  }));
  document.querySelectorAll(".ic-header").forEach(h=> h.addEventListener("click", ()=> toggleItemCardExpand(h.dataset.card)));
  refreshLucideIcons();
}
const CATEGORY_PRICE_RATIOS = {"ولادي":0.80, "طفل":0.65};
function autoCalcCategoryPricing(c, field, roundToNearest5=true){
  const menPrice = c[field]["رجال"]||0;
  if(menPrice<=0) return;
  Object.entries(CATEGORY_PRICE_RATIOS).forEach(([cat, ratio])=>{
    const raw = menPrice*ratio;
    c[field][cat] = roundToNearest5 ? Math.round(raw/5)*5 : Math.round(raw*100)/100;
  });
}
let printLabelTargetId = null;
function openPrintLabelModal(cardId){
  const c = findItemCard(cardId);
  if(!c) return;
  printLabelTargetId = cardId;
  $("printLabelCardName").textContent = c.name;
  $("printLabelCopies").value = 6;
  $("printLabelModalOverlay").classList.remove("hidden");
}
function closePrintLabelModal(){ $("printLabelModalOverlay").classList.add("hidden"); printLabelTargetId=null; }
function confirmPrintLabel(){
  const copies = parseInt($("printLabelCopies").value)||1;
  if(copies<1){ showToast("أدخل عدد نسخ صحيح (1 على الأقل)"); return; }
  printItemCardLabel(printLabelTargetId, copies);
  closePrintLabelModal();
}
// what an item's barcode encodes: "P" + its unique item code — can't be mistaken for an invoice
// number (plain digits) when scanned into any of the scan fields
function itemBarcodeValue(c){ return "P" + (c.code!==undefined ? c.code : c.id); }
function findItemCardByBarcode(text){
  const t = String(text||"").trim().toUpperCase();
  const m = t.match(/^P?(\d+)$/);
  return m ? state.itemCards.find(c=>String(c.code)===m[1]) : null;
}
async function printItemCardLabel(cardId, copies){
  const c = findItemCard(cardId);
  if(!c) return;
  const rootWidth = (state.settings.thermalPaperWidth||58)===80 ? 280 : 200;
  const showOrigin = state.settings.printOriginOnLabel && c.origin;
  const priceRows = c.type==="fabric" && c.prices
    ? BODY_CATEGORIES.map(cat=>`<tr><td style="text-align:right;padding:2px;font-weight:700;">${cat}</td><td style="text-align:left;padding:2px;">${(c.prices[cat]||0).toFixed(0)} ﷼</td></tr>`).join("")
    : `<tr><td style="text-align:right;padding:2px;font-weight:700;">السعر</td><td style="text-align:left;padding:2px;font-size:14px;font-weight:800;">${(c.salePrice||0).toFixed(0)} ﷼</td></tr>`;
  const oneLabel = i=> `
    <div style="width:100%;max-width:${rootWidth}px;font-family:'Cairo',sans-serif;direction:rtl;text-align:center;font-size:12px;margin:0 auto;background:#fff;color:#000;padding:8px;border-bottom:1px dashed #999;">
      <h3 style="margin:0 0 4px;font-size:14px;">${esc(c.name)}</h3>
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;">كود الصنف: #${c.code!==undefined?c.code:"—"}</p>
      ${showOrigin ? `<p style="margin:2px 0;font-size:11px;">الصناعة: ${esc(c.origin)}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">${priceRows}</table>
      <div style="margin-top:6px;"><svg class="item-label-barcode" id="itemLabelBarcode${i}"></svg></div>
    </div>`;
  const fullHtml = `<div id="labelShareRoot">${Array.from({length:copies},(_,i)=>oneLabel(i)).join("")}</div>`;
  $("printArea").innerHTML = fullHtml;
  try{
    await loadBarcodeLib();
    if(window.JsBarcode) document.querySelectorAll("#labelShareRoot .item-label-barcode").forEach(svg=>
      window.JsBarcode(svg, itemBarcodeValue(c), {format:"CODE128", width:1.6, height:34, fontSize:11, margin:2}));
  }catch(e){ console.error("label barcode failed", e); }
  // "auto" for the page height silently makes some print/PDF engines (verified: Chromium's own
  // print-to-PDF) drop the whole @page size and fall back to a default Letter/A4-sized page —
  // which is what was actually causing thermal receipts/labels/vouchers to print at the wrong
  // size with clipped tables. An explicit, generous fixed height is reliably honored instead;
  // thermal printers just cut the roll once the content ends, so the extra unused length is harmless.
  $("dynamicPageSize").textContent = `@media print{ @page{ size:${state.settings.thermalPaperWidth||58}mm 2000mm; margin:0; } }`;
  setTimeout(()=> safePrint(), 300);
}
// ---- quick price-label printing from the top bar (accountant, cashier, manager) ----
function quickLabelCards(){ return state.itemCards.filter(c=>c.active!==false && (c.type==="product" || c.type==="fabric")); }
function quickLabelFind(text){
  const t = (text||"").trim();
  if(!t) return null;
  return findItemCardByBarcode(t) || quickLabelCards().find(c=>c.name===t || `${c.name} — #${c.code}`===t) || null;
}
function openQuickLabelModal(){
  $("quickLabelDatalist").innerHTML = quickLabelCards().map(c=>`<option value="${esc(c.name)} — #${c.code}"></option>`).join("");
  $("quickLabelSearch").value = ""; $("quickLabelCopies").value = 1; $("quickLabelPreview").textContent = "";
  $("quickLabelModalOverlay").classList.remove("hidden");
  setTimeout(()=> $("quickLabelSearch").focus(), 50);
}
function closeQuickLabelModal(){ $("quickLabelModalOverlay").classList.add("hidden"); }
function updateQuickLabelPreview(){
  const c = quickLabelFind($("quickLabelSearch").value);
  $("quickLabelPreview").innerHTML = c ? `${esc(c.name)} — كود #${c.code} — ${c.type==="fabric" ? BODY_CATEGORIES.map(cat=>`${cat} ${((c.prices||{})[cat]||0).toFixed(0)} ﷼`).join(" / ") : `السعر ${(c.salePrice||0).toFixed(0)} ﷼`}` : "";
}
function printQuickLabel(){
  const c = quickLabelFind($("quickLabelSearch").value);
  if(!c){ showToast("اختر صنف من القائمة أو امسح باركوده"); return; }
  const copies = parseInt($("quickLabelCopies").value)||1;
  if(copies<1){ showToast("أدخل عدد نسخ صحيح"); return; }
  closeQuickLabelModal();
  printItemCardLabel(c.id, copies);
}
function toggleItemCardActive(id){ const c=findItemCard(id); if(c){ c.active=!c.active; saveState(); renderAll(); } }
async function writeOffItemCard(id){
  const card = findItemCard(id);
  if(!card) return;
  const avail = cardAvailableQty(card);
  if(avail<=0){ showToast("ما فيه رصيد متبقٍ يحتاج إتلاف"); return; }
  const unitTxt = card.type==="fabric" ? unitLabel() : "قطعة";
  if(!await confirmWithPassword(`تأكيد إتلاف "${card.name}"؟ سيتم تصفير الرصيد المتاح (${avail.toFixed(1)} ${unitTxt}) وإيقاف الصنف عن الظهور بالمشتريات والفواتير الجديدة. الصنف يبقى بسجل التاريخ ولا ينحذف — أي فاتورة سابقة استخدمته يفضل اسمه ظاهر فيها بدون تغيير.\nهذا إجراء حساس — أدخل كلمة مرورك للتأكيد.`)) return;
  const snapshot = JSON.parse(JSON.stringify(state));
  card.stockQty = (card.stockQty||0) - avail; // brings cardAvailableQty(card) to exactly 0
  card.active = false;
  state.stockWriteOffs.push({id:newId(), itemCardId:id, date:todayStr(), qty:avail, recordedBy:currentUser.username});
  if(await saveStateWithRollback(snapshot)){
    logAudit("item_written_off", {cardName:card.name, qty:avail});
    showToast("تم إتلاف الصنف وتصفير رصيده");
  }
}

function renderSuppliers(){
  const el = $("suppliersList");
  if(!state.suppliers.length){ el.innerHTML = `<p class="sub">ما فيه موردين بعد.</p>`; return; }
  el.innerHTML = state.suppliers.map(s=>`<div class="garment-card">
    <span class="tag">${esc(s.name)}${esc(s.phone?" — "+s.phone:"")}</span>
    <p style="margin:6px 0;font-weight:700;color:${s.balance>0?'var(--loss)':'var(--profit)'};">المستحق له: ${s.balance.toFixed(0)} ريال</p>
    ${s.balance>0 ? `
    <div class="row-3">
      <div class="field"><label>مبلغ التسديد</label><input type="number" class="supplier-pay-amount" data-sup="${s.id}" min="0" placeholder="0"></div>
      <div class="field"><label>من صندوقي</label><select class="supplier-pay-box" data-sup="${s.id}">${userBoxes(currentUser.username).map(b=>`<option value="${b.id}">${b.name} (${typeLabel(b.type)}) — ${boxTotal(b).toFixed(0)} ﷼</option>`).join("")}</select></div>
      <div class="field" style="display:flex;align-items:flex-end;"><button class="btn btn-gold btn-sm" style="width:100%;" onclick="paySupplier('${s.id}')">تسديد</button></div>
    </div>` : ``}
  </div>`).join("");
}
function addSupplier(){
  const name = $("newSupplierName").value.trim(), phone = $("newSupplierPhone").value.trim();
  if(!name){ showToast("أدخل اسم المورد"); return; }
  state.suppliers.push({id:newId(), name, phone, notes:"", balance:0});
  $("newSupplierName").value=""; $("newSupplierPhone").value="";
  saveState(); renderAll(); showToast("تم إضافة المورد");
}
async function paySupplier(supId){
  const s = state.suppliers.find(x=>x.id===supId); if(!s) return;
  const amtInp = document.querySelector(`.supplier-pay-amount[data-sup="${supId}"]`);
  const boxSel = document.querySelector(`.supplier-pay-box[data-sup="${supId}"]`);
  const amount = parseFloat(amtInp.value)||0;
  if(amount<=0){ showToast("أدخل مبلغ صحيح"); return; }
  if(amount - s.balance > 0.01){ showToast(`المبلغ أكبر من المستحق (${s.balance.toFixed(0)} ريال)`); return; }
  const box = findCashBox(boxSel.value);
  if(!box){ showToast("اختر صندوق الدفع"); return; }
  if(boxTotal(box) < amount){ showToast(`الرصيد غير كافٍ بالصندوق (المتاح ${boxTotal(box).toFixed(0)} ريال)`); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  box.balance -= amount; s.balance -= amount;
  s.payments = s.payments||[];
  s.payments.push({id:newId(), date:todayStr(), amount, boxId:box.id, recordedBy:currentUser.username});
  if(await saveStateWithRollback(snapshot)){
    logAudit("supplier_paid", {supplierName:s.name, amount});
    showToast("تم تسديد المورد");
  }
}

function refreshPurchaseForm(){
  const type = $("purchType").value;
  $("purchUnitLabel").textContent = type==="fabric" ? unitLabel() : "قطعة";
  const cards = state.itemCards.filter(c=>c.type===type);
  const curSupplier = $("purchSupplier").value, curSourceBox = $("purchSourceBox").value, curOrigin = $("purchOrigin").value;
  $("purchItemDatalist").innerHTML = cards.map(c=>`<option value="${esc(c.name)}"></option>`).join("");
  $("purchSupplierDatalist").innerHTML = state.suppliers.map(s=>`<option value="${esc(s.name)}"></option>`).join("");
  if(curSupplier){ const s = state.suppliers.find(x=>x.id===curSupplier); if(s) $("purchSupplierSearch").value = s.name; }
  $("purchSourceBox").innerHTML = userBoxes(currentUser.username).map(b=>`<option value="${b.id}" ${b.id===curSourceBox?"selected":""}>${b.name} (${typeLabel(b.type)}) — ${boxTotal(b).toFixed(0)} ﷼</option>`).join("");
  $("purchOrigin").innerHTML = `<option value="">-- اختر --</option>` + state.fabricOrigins.map(o=>`<option value="${esc(o)}" ${o===curOrigin?"selected":""}>${esc(o)}</option>`).join("");
  updatePurchItemStatus();
  updatePurchTotal();
}
function updatePurchItemStatus(){
  const type = $("purchType").value;
  const name = $("purchItemName").value.trim();
  const statusEl = $("purchItemStatus");
  const match = state.itemCards.find(c=>c.type===type && c.name===name);
  $("purchFabricExtraWrap").style.display = (type==="fabric" && name && !match) ? "" : "none";
  if(!name){ statusEl.textContent=""; return; }
  if(match){
    statusEl.innerHTML = `صنف موجود — التكلفة الحالية: ${match.currentCost.toFixed(2)} ريال، المتاح: ${cardAvailableQty(match).toFixed(1)} ${type==="fabric"?unitLabel():"قطعة"}`;
    statusEl.style.color = "var(--profit)";
  } else {
    statusEl.innerHTML = `صنف جديد — بيُنشأ تلقائياً كرت له عند الحفظ`;
    statusEl.style.color = "var(--gold-soft)";
  }
}
function updatePurchTotal(){
  const qty = parseFloat($("purchQty").value)||0, price = parseFloat($("purchUnitPrice").value)||0;
  $("purchTotal").value = (qty*price).toFixed(2);
}
function updateManualCardLabels(){
  const type = $("manualCardType").value;
  const unitTxt = type==="fabric" ? unitLabel() : "قطعة";
  $("manualCardQtyLabel").textContent = `الكمية (رصيد أول المدة) — ${unitTxt}`;
  $("manualCardCostLabel").textContent = `تكلفة الوحدة (ريال لكل ${unitTxt})`;
  $("manualFabricExtraWrap").style.display = type==="fabric" ? "" : "none";
  const curOrigin = $("manualCardOrigin").value;
  $("manualCardOrigin").innerHTML = `<option value="">-- اختر --</option>` + state.fabricOrigins.map(o=>`<option value="${esc(o)}" ${o===curOrigin?"selected":""}>${esc(o)}</option>`).join("");
}
function addManualItemCard(){
  const type = $("manualCardType").value;
  const name = $("manualCardName").value.trim();
  const qty = parseFloat($("manualCardQty").value)||0;
  const cost = parseFloat($("manualCardCost").value)||0;
  if(!name){ showToast("أدخل اسم الصنف"); return; }
  if(state.itemCards.some(c=>c.type===type && c.name===name)){ showToast("فيه صنف بنفس الاسم والنوع موجود مسبقاً"); return; }
  let origin="", season="";
  if(type==="fabric"){
    origin = $("manualCardOrigin").value; season = $("manualCardSeason").value;
    if(!origin || !season){ showToast("صنف قماش جديد — لازم تحدد الصناعة والموسم قبل الحفظ"); return; }
  }
  const card = {id:newId(), code:nextItemCode(), name, type, unit: type==="fabric"?state.settings.measureUnit:"piece",
    currentCost:cost, openingBalance:qty, stockQty:0, reservedQty:0, active:true, minSalePrice:0, minPrices: type==="fabric"?{"رجال":0,"ولادي":0,"طفل":0}:{},
    origin: type==="fabric" ? origin : undefined, season: type==="fabric" ? season : undefined,
    prices: type==="fabric" ? {"رجال":0,"ولادي":0,"طفل":0} : undefined,
    qty: type==="fabric" ? {"رجال":0,"ولادي":0,"طفل":0} : undefined,
    salePrice: (type==="product"||type==="fabric") ? 0 : undefined };
  state.itemCards.push(card);
  $("manualCardName").value=""; $("manualCardQty").value=""; $("manualCardCost").value=""; $("manualCardOrigin").value=""; $("manualCardSeason").value="";
  saveState(); renderAll();
  showToast("تم إضافة الصنف");
}
async function addPurchase(){
  const supplierId = $("purchSupplier").value;
  if(!supplierId){ showToast("اختر مورد حقيقي من القائمة (اكتب اسمه واختره من الاقتراحات) — أو أضف مورد جديد أول من شاشة الموردين"); return; }
  const type = $("purchType").value;
  const itemName = $("purchItemName").value.trim();
  const qty = parseFloat($("purchQty").value)||0;
  const unitPrice = parseFloat($("purchUnitPrice").value)||0;
  const payStatus = $("purchPayStatus").value;
  const sourceBoxId = $("purchSourceBox").value;
  const supplierInvoiceNo = $("purchSupplierInvNo").value.trim();
  if(!itemName){ showToast("أدخل اسم الصنف"); return; }
  if(qty<=0 || unitPrice<=0){ showToast("أدخل كمية وسعر صحيحين"); return; }
  let card = state.itemCards.find(c=>c.type===type && c.name===itemName);
  if(!card){
    let origin="", season="";
    if(type==="fabric"){
      origin = $("purchOrigin").value; season = $("purchSeason").value;
      if(!origin || !season){ showToast("صنف قماش جديد — لازم تحدد الصناعة والموسم قبل الحفظ"); return; }
    }
    card = {id:newId(), code:nextItemCode(), name:itemName, type, unit: type==="fabric"?state.settings.measureUnit:"piece",
      currentCost:0, openingBalance:0, stockQty:0, reservedQty:0, active:true, minSalePrice:0, minPrices: type==="fabric"?{"رجال":0,"ولادي":0,"طفل":0}:{},
      origin: type==="fabric" ? origin : undefined, season: type==="fabric" ? season : undefined,
      prices: type==="fabric" ? {"رجال":0,"ولادي":0,"طفل":0} : undefined,
      qty: type==="fabric" ? {"رجال":0,"ولادي":0,"طفل":0} : undefined,
      salePrice: (type==="product"||type==="fabric") ? 0 : undefined };
    state.itemCards.push(card);
  }
  const purchaseSnapshot = JSON.parse(JSON.stringify(state));
  const total = qty*unitPrice;
  if(payStatus==="paid"){
    const box = findCashBox(sourceBoxId);
    if(!box){ showToast("اختر مصدر الدفع"); return; }
    if(boxTotal(box) < total){ showToast(`الرصيد غير كافٍ (المتاح ${boxTotal(box).toFixed(0)} ريال)`); return; }
    box.balance -= total;
  } else {
    const sup = state.suppliers.find(s=>s.id===supplierId);
    sup.balance += total;
  }
  card.stockQty = (card.stockQty||0) + qty;
  card.currentCost = unitPrice;
  // fabric bought through purchases (the normal way) draws the fabric guideline balance down —
  // before, only a "شراء قماش" expense did, so this balance only ever grew
  if(type==="fabric") state.advisory.fabric -= qty*unitPrice;
  const invoiceNo = nextPurchaseInvoiceNo();
  const imageFile = $("purchImageFile").files[0];
  let imageData = null;
  if(imageFile){
    if(imageFile.size > 1024*1024){ showToast("حجم الصورة أكبر من 1 ميجا — اختر صورة أصغر"); state = purchaseSnapshot; return; }
    imageData = await new Promise(resolve=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = ()=> resolve(null);
      reader.readAsDataURL(imageFile);
    });
  }
  const vatStatus = $("purchVatStatus").value;
  state.purchases.push({id:newId(), invoiceNo, date:todayStr(), supplierId, itemCardId:card.id, quantity:qty, unitPrice, total, payStatus, sourceBoxId: payStatus==="paid"?sourceBoxId:null, recordedBy:currentUser.username, supplierInvoiceNo, imageData, vatStatus});
  if(await saveStateWithRollback(purchaseSnapshot)){
    logAudit("purchase_recorded", {invoiceNo, itemName, qty, unitPrice, total, payStatus});
    $("purchQty").value=""; $("purchUnitPrice").value=""; $("purchItemName").value=""; $("purchTotal").value=""; $("purchItemStatus").textContent=""; $("purchOrigin").value=""; $("purchSeason").value=""; $("purchFabricExtraWrap").style.display="none"; $("purchSupplierInvNo").value=""; $("purchImageFile").value="";
    showToast(`تم حفظ فاتورة الشراء رقم ${invoiceNo}`);
  }
}
function nextPurchaseInvoiceNo(){ const n=state.settings.nextPurchaseInvoiceNumber||1; state.settings.nextPurchaseInvoiceNumber=n+1; return n; }
function renderPurchases(){
  const tbody = $("purchasesBody");
  const rows = state.purchases.slice().reverse();
  tbody.innerHTML = rows.length ? rows.map(p=>{
    const sup = state.suppliers.find(s=>s.id===p.supplierId);
    const card = findItemCard(p.itemCardId);
    return `<tr><td>${p.invoiceNo||"—"}</td><td>${esc(p.supplierInvoiceNo||"—")}</td><td>${p.date}</td><td>${sup?esc(sup.name):"—"}</td><td>${card?esc(card.name):"—"}</td><td>${p.quantity}</td><td>${p.total.toFixed(0)} ﷼</td><td>${p.payStatus==="paid"?"مدفوعة":"آجلة"}</td>
      <td style="white-space:nowrap;"><button class="icon-btn" onclick="printPurchaseInvoice('${p.id}')" title="طباعة"><i data-lucide="printer"></i></button>${p.imageData?`<button class="icon-btn" onclick="previewPurchaseImage('${p.id}')" title="معاينة صورة فاتورة المورد"><i data-lucide="eye"></i></button>`:""}</td></tr>`;
  }).join("") : `<tr><td colspan="9">${emptyStateHtml("shopping-cart","ما فيه مشتريات مسجّلة بعد.")}</td></tr>`;
  refreshLucideIcons();
}
function buildPurchaseInvoiceHtml(p){
  const sup = state.suppliers.find(s=>s.id===p.supplierId);
  const card = findItemCard(p.itemCardId);
  const s = state.settings;
  const rootWidth = (s.thermalPaperWidth||58)===80 ? 280 : 200;
  return `<div id="receiptShareRoot" style="width:100%;max-width:${rootWidth}px;font-family:'Cairo',sans-serif;direction:rtl;text-align:right;font-size:12px;margin:0 auto;background:#fff;color:#000;padding:2px 8px 8px;">
    <div style="text-align:center;">
      ${s.shopLogo?`<img src="${s.shopLogo}" style="max-width:50px;max-height:50px;">`:""}
      <h3 style="margin:6px 0;">${esc(s.shopName)||"—"}</h3>
      <h3 style="margin:0 0 8px;">فاتورة شراء</h3>
    </div>
    <p style="margin:3px 0;">رقم الفاتورة: <b>${p.invoiceNo||"—"}</b></p>
    <p style="margin:3px 0;">التاريخ: <b>${p.date}</b></p>
    ${p.supplierInvoiceNo?`<p style="margin:3px 0;">رقم فاتورة المورد: <b>${esc(p.supplierInvoiceNo)}</b></p>`:""}
    <hr>
    <p style="margin:3px 0;">المورد: <b>${sup?esc(sup.name):"—"}</b></p>
    <p style="margin:3px 0;">الصنف: ${card?esc(card.name):"—"}</p>
    <p style="margin:3px 0;">الكمية: ${p.quantity}</p>
    <p style="margin:3px 0;">سعر الوحدة: ${p.unitPrice.toFixed(2)} ريال</p>
    <p style="font-weight:700;margin:3px 0;">الإجمالي: ${p.total.toFixed(2)} ريال</p>
    <p style="margin:3px 0;">حالة الدفع: ${p.payStatus==="paid"?"مدفوعة":"آجلة"}</p>
    <hr>
    <p style="font-size:10px;color:#555;margin:3px 0;">سجّلها: ${esc(p.recordedBy||"—")}</p>
  </div>`;
}
function printPurchaseInvoice(id){
  const p = state.purchases.find(x=>x.id===id);
  if(!p) return;
  // "auto" for the page height silently makes some print/PDF engines (verified: Chromium's own
  // print-to-PDF) drop the whole @page size and fall back to a default Letter/A4-sized page —
  // which is what was actually causing thermal receipts/labels/vouchers to print at the wrong
  // size with clipped tables. An explicit, generous fixed height is reliably honored instead;
  // thermal printers just cut the roll once the content ends, so the extra unused length is harmless.
  $("dynamicPageSize").textContent = `@media print{ @page{ size:${state.settings.thermalPaperWidth||58}mm 2000mm; margin:0; } }`;
  $("printArea").innerHTML = buildPurchaseInvoiceHtml(p);
  safePrint();
}
function previewPurchaseImage(id){
  const p = state.purchases.find(x=>x.id===id);
  if(!p || !p.imageData) return;
  printHtml(`<div style="text-align:center;background:#fff;padding:10px;"><img src="${p.imageData}" style="max-width:100%;"></div>`);
}
function refreshReturnForm(){
  const curCard = $("returnCard").value, curSupplier = $("returnSupplier").value;
  $("returnCard").innerHTML = state.itemCards.map(c=>`<option value="${c.id}" ${c.id===curCard?"selected":""}>${esc(c.name)} (${c.type==="fabric"?"قماش":"منتج"})</option>`).join("");
  $("returnSupplier").innerHTML = state.suppliers.map(s=>`<option value="${s.id}" ${s.id===curSupplier?"selected":""}>${esc(s.name)}</option>`).join("");
  $("returnBox").innerHTML = userBoxes(currentUser.username).map(b=>`<option value="${b.id}">${b.name} (${typeLabel(b.type)})</option>`).join("");
  $("returnBoxWrap").style.display = $("returnPayStatus").value==="paid" ? "" : "none";
  const card = findItemCard($("returnCard").value);
  $("returnInfoNote").textContent = card ? `المتاح حالياً: ${cardAvailableQty(card).toFixed(1)} ${card.type==="fabric"?unitLabel():"قطعة"} — تكلفة الوحدة: ${card.currentCost.toFixed(2)} ريال` : "";
  const relevantPurchases = state.purchases.filter(p=> (!curSupplier || p.supplierId===curSupplier) && (!card || p.itemCardId===card.id)).slice(-15).reverse();
  $("returnLinkedPurchase").innerHTML = `<option value="">-- بدون ربط --</option>` + relevantPurchases.map(p=>`<option value="${p.id}">#${p.invoiceNo} — ${p.date}${p.supplierInvoiceNo?" (مورد: "+esc(p.supplierInvoiceNo)+")":""}</option>`).join("");
}
// ---------------- payroll ----------------
function renderEntitlementPreview(){
  const el = $("entitlementPreviewView");
  if(!el || !currentUser || currentUser.role!=="مدير") return;
  const monthLabel = state.settings.currentMonth;
  const rows = state.users.map(u=>({u, ent: computeEmployeeEntitlement(u, monthLabel)})).filter(({ent})=>ent.total>0.001);
  if(!rows.length){ el.innerHTML = `<p class="sub">ما فيه استحقاقات محسوبة لهذا الشهر بعد.</p>`; return; }
  el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>الموظف</th><th>الدور</th><th>عدد الثياب</th><th>الاستحقاق المتوقع</th></tr></thead><tbody>
    ${rows.map(({u,ent})=>`<tr><td>${esc(u.username)}</td><td>${u.role}</td><td>${ent.garmentCount}</td><td style="font-weight:700;color:var(--profit);">${ent.total.toFixed(0)} ﷼</td></tr>`).join("")}
  </tbody></table></div>`;
}
function renderPayrollTab(){
  const el = $("payrollList");
  if(!el || !currentUser || currentUser.role!=="مدير") return;
  el.innerHTML = state.users.map(u=>{
    const balance = employeeBalance(u.username);
    const history = state.payrollLedger.filter(e=>e.username===u.username).slice().reverse().slice(0,15);
    const historyHtml = history.length ? history.map(e=>{
      const credit = e.type==="entitlement" || e.type==="bonus";
      const lbl = e.type==="entitlement"?"استحقاق":e.type==="bonus"?"مكافأة":e.type==="payment"?"دفعة":e.type==="advance"?"سلفة":"خصم";
      const sign = credit ? "+" : "-";
      const color = credit ? "var(--profit)" : "var(--loss)";
      return `<div class="payment-row"><span style="color:${color};">${sign}${e.amount.toFixed(0)} ﷼</span><span>${lbl}</span><span style="color:var(--muted);">${e.date}</span>${e.note?`<span style="color:var(--muted);">${e.note}</span>`:""}</div>`;
    }).join("") : `<p class="sub">ما فيه حركات بعد.</p>`;
    return `<div class="garment-card">
      <span class="tag">${u.username} — ${u.role}</span>
      <p style="margin:6px 0;font-weight:700;color:${balance>0?'var(--loss)':'var(--profit)'};">المستحق له: ${balance.toFixed(0)} ريال</p>
      ${(()=>{ const el = advanceEligibility(u.username); return `<p class="sub" style="margin:0 0 6px;color:${el.ok?"var(--profit)":"var(--muted)"};">${el.ok ? `السلفة متاحة (حتى ${el.balance.toFixed(0)} ريال)` : `السلفة غير متاحة: ${esc(el.msg)}`}${u.joinedDate?` — بداية العمل ${u.joinedDate}`:""}</p>`; })()}
      <div class="row-3">
        <div class="field"><label>نوع الحركة</label><select class="pr-type" data-user="${u.username}"><option value="payment">دفعة راتب</option><option value="advance">سلفة</option><option value="deduction">خصم</option></select></div>
        <div class="field"><label>المبلغ</label><input type="number" class="pr-amount" data-user="${u.username}" min="0" placeholder="0"></div>
        <div class="field pr-box-wrap" data-user="${u.username}"><label>من صندوقي</label><select class="pr-box" data-user="${u.username}">${userBoxes(currentUser.username).map(b=>`<option value="${b.id}">${b.name} (${typeLabel(b.type)}) — ${boxTotal(b).toFixed(0)} ﷼</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>ملاحظة (إلزامية للخصم)</label><input type="text" class="pr-note" data-user="${u.username}"></div>
      <button class="btn btn-gold btn-sm submit-payroll-btn" data-username="${u.username.replace(/"/g,"&quot;")}">تسجيل</button>
      <div class="stitch"></div>
      <p class="sub" style="margin-bottom:6px;">آخر الحركات:</p>
      ${historyHtml}
    </div>`;
  }).join("");
  document.querySelectorAll(".pr-type").forEach(sel=> sel.addEventListener("change", ()=>{
    const wrap = document.querySelector(`.pr-box-wrap[data-user="${sel.dataset.user}"]`);
    wrap.style.display = sel.value==="deduction" ? "none" : "";
  }));
  document.querySelectorAll(".submit-payroll-btn").forEach(btn=> btn.addEventListener("click", ()=> submitPayrollEntry(btn.dataset.username)));
}
async function submitPayrollEntry(username){
  const type = document.querySelector(`.pr-type[data-user="${username}"]`).value;
  const amount = parseFloat(document.querySelector(`.pr-amount[data-user="${username}"]`).value)||0;
  const boxId = document.querySelector(`.pr-box[data-user="${username}"]`).value;
  const note = document.querySelector(`.pr-note[data-user="${username}"]`).value.trim();
  const snapshot = JSON.parse(JSON.stringify(state));
  const result = addPayrollEntry(username, type, amount, boxId, note);
  if(!result.ok){ showToast(result.msg); return; }
  if(await saveStateWithRollback(snapshot)) showToast("تم تسجيل الحركة");
}

async function addPurchaseReturn(){
  const cardId = $("returnCard").value, qty = parseFloat($("returnQty").value)||0;
  const supplierId = $("returnSupplier").value, payStatus = $("returnPayStatus").value, boxId = $("returnBox").value;
  const linkedPurchaseId = $("returnLinkedPurchase").value;
  const card = findItemCard(cardId);
  if(!card){ showToast("اختر صنف"); return; }
  if(qty<=0){ showToast("أدخل كمية صحيحة"); return; }
  // every check runs before anything is touched — a failed check used to leave a half-applied return
  if(qty - cardAvailableQty(card) > 0.001){ showToast(`الكمية أكبر من المتاح بالمخزون (${cardAvailableQty(card).toFixed(1)})`); return; }
  const sup = state.suppliers.find(s=>s.id===supplierId);
  if(!sup){ showToast("اختر المورد"); return; }
  const linkedPurchase = linkedPurchaseId ? state.purchases.find(p=>p.id===linkedPurchaseId) : null;
  if(linkedPurchase){
    if(linkedPurchase.itemCardId!==card.id || linkedPurchase.supplierId!==supplierId){ showToast("فاتورة الشراء المرتبطة لصنف أو مورد مختلف"); return; }
    const alreadyReturned = state.purchaseReturns.filter(r=>r.linkedPurchaseId===linkedPurchase.id).reduce((a,r)=>a+r.quantity,0);
    if(qty - (linkedPurchase.quantity - alreadyReturned) > 0.001){ showToast(`الكمية أكبر من المتبقي بفاتورة الشراء #${linkedPurchase.invoiceNo} (${(linkedPurchase.quantity-alreadyReturned).toFixed(1)})`); return; }
  }
  // valued at what was actually paid for it when the purchase is known — the card's latest cost
  // (from a newer purchase at a different price) used to over/under-credit the refund
  const value = qty * (linkedPurchase ? linkedPurchase.unitPrice : card.currentCost);
  let box = null;
  if(payStatus==="deferred"){
    // the excess over what's owed used to be silently dropped (balance clamped at 0)
    if(value - sup.balance > 0.01){ showToast(`قيمة المرتجع (${value.toFixed(0)} ريال) أكبر من المستحق للمورد (${sup.balance.toFixed(0)} ريال) — لو كانت الفاتورة مدفوعة اختر "مدفوعة"`); return; }
  } else {
    box = findCashBox(boxId);
    if(!box){ showToast("اختر الصندوق المستلم للمبلغ"); return; }
  }
  const snapshot = JSON.parse(JSON.stringify(state));
  card.stockQty = (card.stockQty||0) - qty;
  if(box) box.balance += value; else sup.balance -= value;
  if(card.type==="fabric") state.advisory.fabric += value;
  state.purchaseReturns.push({id:newId(), date:todayStr(), itemCardId:cardId, quantity:qty, value, supplierId, payStatus, boxId: box ? box.id : null, recordedBy:currentUser.username,
    linkedPurchaseId: linkedPurchaseId||null, purchaseInvoiceNo: linkedPurchase?linkedPurchase.invoiceNo:null, supplierInvoiceNo: linkedPurchase?linkedPurchase.supplierInvoiceNo:null});
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("purchase_return_recorded", {cardName:card.name, qty, value});
  $("returnQty").value="";
  showToast("تم تسجيل المرتجع");
}
function renderReturns(){
  const tbody = $("returnsBody");
  const q = ($("returnSearch")?.value||"").trim().toLowerCase();
  const rows = state.purchaseReturns.slice().reverse().filter(r=>{
    if($("returnPeriodMode") && !dateMatchesPeriod("return", r.date)) return false;
    if(!q) return true;
    const sup = state.suppliers.find(s=>s.id===r.supplierId);
    return (sup&&sup.name.toLowerCase().includes(q)) || (r.purchaseInvoiceNo&&String(r.purchaseInvoiceNo).includes(q)) || (r.supplierInvoiceNo&&r.supplierInvoiceNo.toLowerCase().includes(q));
  });
  tbody.innerHTML = rows.length ? rows.map(r=>{
    const card = findItemCard(r.itemCardId);
    const sup = state.suppliers.find(s=>s.id===r.supplierId);
    return `<tr><td>${r.date}</td><td>${sup?esc(sup.name):"—"}</td><td>${card?esc(card.name):"—"}</td><td>${r.quantity}</td><td>${r.value.toFixed(0)} ﷼</td><td>${r.purchaseInvoiceNo||"—"}</td><td>${esc(r.supplierInvoiceNo||"—")}</td></tr>`;
  }).join("") : `<tr><td colspan="7" class="sub" style="text-align:center;padding:16px;">ما فيه مرتجعات مطابقة.</td></tr>`;
}
// ---------------- sales invoices (ready-made products) ----------------
function renderSaleLine(prefill=null){
  const holder = $("saleItemsHolder");
  const cards = [...activeFabricCards(), ...activeProductCards()];
  const line = prefill || {itemCardId: cards[0]?cards[0].id:"", qty:1, price: cards[0]?cards[0].salePrice:0};
  const div = document.createElement("div"); div.className="garment-card";
  const opts = cards.length ? cards.map(c=>`<option value="${c.id}" ${c.id===line.itemCardId?"selected":""}>${esc(c.name)} (${c.type==="fabric"?"قماش":"منتج"} — متاح: ${cardAvailableQty(c).toFixed(c.type==="fabric"?1:0)} ${c.type==="fabric"?unitLabel():"قطعة"})</option>`).join("")
    : `<option value="">-- ما فيه أصناف مشتراة بعد --</option>`;
  div.innerHTML = `
    <div class="row-3">
      <div class="field"><label>الصنف</label><select class="sl-item">${opts}</select></div>
      <div class="field"><label>الكمية</label><input type="number" class="sl-qty" min="1" step="0.1" value="${line.qty}"></div>
      <div class="field"><label>سعر الوحدة (ريال)</label><input type="number" class="sl-price" min="0" value="${line.price||0}"></div>
    </div>
    <button class="icon-btn" onclick="this.closest('.garment-card').remove(); updateSaleTotal();">حذف الصنف</button>
  `;
  // the blank form's pre-filled first line is a placeholder until someone touches it — a scanned
  // item replaces it instead of being sold alongside an item nobody picked
  if(!prefill) div.dataset.untouched = "1";
  holder.appendChild(div);
  const itemSel = div.querySelector(".sl-item"), priceInp = div.querySelector(".sl-price"), qtyInp = div.querySelector(".sl-qty");
  [itemSel, priceInp, qtyInp].forEach(el=> el.addEventListener("input", ()=>{ delete div.dataset.untouched; }));
  itemSel.addEventListener("change", ()=>{ delete div.dataset.untouched; });
  itemSel.addEventListener("change", ()=>{
    const c=findItemCard(itemSel.value);
    priceInp.value = "";
    priceInp.placeholder = c ? `سعر البيع المرجعي: ${(c.salePrice||0).toFixed(0)} ﷼ — أدخل السعر يدوياً` : "أدخل السعر";
    updateSaleTotal();
  });
  priceInp.addEventListener("input", updateSaleTotal);
  qtyInp.addEventListener("input", updateSaleTotal);
}
// tracks whether the cashier has manually typed into "cash" this sale — while false, "cash" auto-fills
// as (total - network) (full cash-at-sale is the common case), so saving doesn't get silently blocked
// by the cash+network===total check just because nobody filled the payment fields
let saleCashTouched = false;
// ---- sales-invoice discounts: promo code, offer bundle, direct discount on the total ----
let salePromo = null;     // an active promo code applied to this sale
let saleOfferId = null;   // one offer bundle at most, as on the tailoring invoice
function saleFormLines(){
  return Array.from(document.querySelectorAll("#saleItemsHolder .garment-card")).map(div=>({
    card: findItemCard(div.querySelector(".sl-item").value),
    qty: parseFloat(div.querySelector(".sl-qty").value)||0,
    price: parseFloat(div.querySelector(".sl-price").value)||0,
  })).filter(l=>l.card && l.qty>0);
}
function saleOfferMatchesCard(offer, card){ return offer.matchBy==="origin" ? card.origin===offer.matchValue : card.id===offer.matchValue; }
// quantity offers count units of the matching item(s) and take their % off the cheapest matching
// unit; gift offers need a minimum number of units in the sale
function saleOfferEvaluation(offer, lines){
  if(offer.type==="quantity_discount"){
    const matching = lines.filter(l=>saleOfferMatchesCard(offer, l.card));
    const units = matching.reduce((a,l)=>a+l.qty,0);
    if(units < offer.requiredQty) return {eligible:false, discount:0};
    const cheapest = Math.min(...matching.map(l=>l.price));
    return {eligible:true, discount: cheapest*(offer.discountPercent||0)/100};
  }
  const units = lines.reduce((a,l)=>a+l.qty,0);
  if(units < (offer.minGarments||1)) return {eligible:false, discount:0};
  const giftCard = findItemCard(offer.giftItemCard);
  return {eligible:!!giftCard, discount:0, gift: giftCard ? {itemCardId:giftCard.id, name:giftCard.name, qty:offer.giftQty||1} : null};
}
function computeSaleDiscounts(){
  const lines = saleFormLines();
  const subtotal = lines.reduce((a,l)=>a+l.qty*l.price,0);
  const offer = saleOfferId ? state.offers.find(o=>o.id===saleOfferId && o.active) : null;
  const ev = offer ? saleOfferEvaluation(offer, lines) : {eligible:false, discount:0};
  const offerDisc = ev.eligible ? Math.min(ev.discount, subtotal) : 0;
  let promoDisc = 0;
  if(salePromo){
    const base = subtotal - offerDisc;
    if(salePromo.type==="percentage") promoDisc = base*(salePromo.value/100);
    else if(salePromo.type==="fixed_voucher") promoDisc = Math.min(salePromo.value, base);
  }
  // direct discount: only for users with discount permission (within their limit) or a VIP customer
  const vip = isCustomerVip(($("saleCustMobile")?.value||"").trim());
  const remaining = Math.max(0, subtotal - offerDisc - promoDisc);
  const maxDirect = vip ? remaining : (userDiscountEnabled(currentUser) ? Math.min(remaining, userMaxDiscountAmount(currentUser, subtotal)) : 0);
  const inp = $("saleDirectDiscount");
  let direct = parseFloat(inp.value)||0;
  if(direct > maxDirect + 0.001){ direct = maxDirect; inp.value = maxDirect ? maxDirect.toFixed(0) : ""; }
  const discountTotal = offerDisc + promoDisc + direct;
  return {lines, subtotal, offer: ev.eligible ? offer : null, offerDisc, gift: ev.eligible ? ev.gift||null : null, promoDisc, direct, maxDirect, vip, discountTotal, total: Math.max(0, subtotal - discountTotal)};
}
function renderSaleOffers(){
  const wrap = $("saleOffersWrap");
  if(!wrap) return;
  const offers = state.offers.filter(o=>o.active);
  if(!offers.length){ wrap.innerHTML = ""; return; }
  const lines = saleFormLines();
  wrap.innerHTML = `<label style="font-size:12px;color:var(--muted);">باقات العروض (اختر واحدة بحد أقصى)</label>` + offers.map(o=>{
    const ev = saleOfferEvaluation(o, lines);
    return `<div class="embro-toggle" style="margin:6px 0;"><input type="radio" name="sale-offer-radio" class="sale-offer-select" data-offer="${o.id}" ${saleOfferId===o.id?"checked":""} ${!ev.eligible?"disabled":""}>
      <label style="margin:0;font-size:13px;${!ev.eligible?"color:var(--muted);":""}">${esc(o.name)} ${ev.eligible ? (o.type==="quantity_discount" ? `— خصم ${fmtSar(ev.discount)} ﷼` : `— هدية: ${esc(ev.gift.name)} ×${ev.gift.qty}`) : "— ما ينطبق حالياً"}</label></div>`;
  }).join("") + (saleOfferId ? `<button type="button" class="btn btn-ghost btn-sm" onclick="saleOfferId=null; updateSaleTotal();">إلغاء اختيار العرض</button>` : "");
  wrap.querySelectorAll(".sale-offer-select").forEach(r=> r.addEventListener("change", ()=>{ if(r.checked){ saleOfferId = r.dataset.offer; updateSaleTotal(); } }));
}
function applySalePromo(){
  const code = $("salePromoInput").value.trim();
  if(!code){ showToast("أدخل كود الخصم أولاً"); return; }
  const match = findActivePromoCode(code);
  if(!match){ showToast("الكود غير صحيح أو منتهي الصلاحية أو غير مفعّل"); return; }
  salePromo = match;
  updateSaleTotal();
  showToast(`تم تطبيق الكود ${match.code}`);
}
function removeSalePromo(){ salePromo = null; $("salePromoInput").value = ""; updateSaleTotal(); }
function updateSaleTotal(){
  const d = computeSaleDiscounts();
  $("saleLiveSubtotal").textContent = fmtSar(d.subtotal)+" ﷼";
  $("saleLiveDiscount").textContent = fmtSar(d.discountTotal)+" ﷼";
  $("saleLiveTotal").textContent = fmtSar(d.total)+" ﷼";
  const banner = $("salePromoBanner");
  if(banner){
    banner.style.display = salePromo ? "" : "none";
    banner.innerHTML = salePromo ? `<div class="item-row" style="border:1px solid var(--gold);border-radius:8px;padding:6px 10px;"><span>الكود <b>${esc(salePromo.code)}</b> — ${salePromo.type==="percentage"?`خصم ${salePromo.value}%`:salePromo.type==="fixed_voucher"?`قسيمة ${fmtSar(salePromo.value)} ﷼`:`هدية: ${esc(salePromo.giftDescription||"")}`}</span><button type="button" class="btn btn-ghost btn-sm" onclick="removeSalePromo()">إزالة</button></div>` : "";
  }
  const directInp = $("saleDirectDiscount");
  if(directInp){
    const allowed = d.vip || userDiscountEnabled(currentUser);
    directInp.disabled = !allowed;
    $("saleDirectDiscountLabel").textContent = allowed
      ? `خصم مباشر على الإجمالي (ريال) — ${d.vip ? "عميل VIP: أي موظف يقدر يخصم بدون حد (حتى 100%)" : `حدّك الأقصى ${fmtSar(d.maxDirect)} ريال`}`
      : "خصم مباشر على الإجمالي — ما عندك صلاحية خصم (إلا لعميل VIP)";
  }
  const parts = [];
  if(d.offerDisc>0.001) parts.push(`عرض "${d.offer.name}": ${fmtSar(d.offerDisc)} ﷼`);
  if(d.gift) parts.push(`هدية: ${d.gift.name} ×${d.gift.qty}`);
  if(d.promoDisc>0.001) parts.push(`كود ${salePromo.code}: ${fmtSar(d.promoDisc)} ﷼`);
  if(d.direct>0.001) parts.push(`خصم مباشر: ${fmtSar(d.direct)} ﷼`);
  $("saleDiscountNote").style.display = parts.length ? "" : "none";
  $("saleDiscountNote").textContent = parts.join(" — ");
  renderSaleOffers();
  if(!saleCashTouched){
    const network = parseFloat($("saleNetwork").value)||0;
    $("saleCash").value = Math.max(d.total-network, 0) || "";
  }
  return d.total;
}
// a scanner types the code and presses Enter: add that item as a line, or +1 on an existing line
function addSaleLineByBarcode(text){
  const c = findItemCardByBarcode(text);
  $("saleScanInput").value = "";
  if(!c){ showToast("ما فيه صنف بهذا الباركود"); return; }
  if(c.type!=="product" && c.type!=="fabric"){ showToast("هذا الصنف ما يُباع بفاتورة المبيعات"); return; }
  // the untouched placeholder line goes first, so a scan never adds onto an item nobody picked
  document.querySelectorAll('#saleItemsHolder .garment-card[data-untouched="1"]').forEach(d=>d.remove());
  const lines = Array.from(document.querySelectorAll("#saleItemsHolder .garment-card"));
  const existing = lines.find(d=>d.querySelector(".sl-item").value===c.id);
  if(existing){ const q=existing.querySelector(".sl-qty"); q.value = (parseFloat(q.value)||0) + 1; }
  else renderSaleLine({itemCardId:c.id, qty:1, price:c.salePrice||0});
  updateSaleTotal();
  showToast(`تمت إضافة ${c.name}`);
}
function resetSaleForm(){
  $("saleNumber").value = state.settings.nextSalesInvoiceNumber;
  $("saleDate").value = todayStr();
  $("saleCustName").value=""; $("saleCustMobile").value="";
  $("salePickerWrap").style.display="none"; $("salePickerWrap").innerHTML="";
  $("saleCustomerAlertWrap").style.display="none"; $("saleCustomerAlertWrap").innerHTML="";
  $("saleItemsHolder").innerHTML="";
  renderSaleLine();
  saleCashTouched = false;
  $("saleCash").value=""; $("saleNetwork").value=""; $("saleReceipt").value="";
  salePromo = null; saleOfferId = null; $("salePromoInput").value = ""; $("saleDirectDiscount").value = "";
  updateSaleTotal();
}
async function saveSaleInvoice(){
  const number = $("saleNumber").value.trim();
  if(!number){ showToast("أدخل رقم الفاتورة"); return; }
  if(state.salesInvoices.some(s=>s.number===number)){ showToast(`رقم الفاتورة ${number} مستخدم مسبقاً — اختر رقم ثاني`); return; }
  const date = $("saleDate").value || todayStr();
  const custName = $("saleCustName").value.trim();
  const custMobile = $("saleCustMobile").value.trim();
  if(!custName){ showToast("أدخل اسم العميل"); return; }
  if(!custMobile || !/^[0-9]{10}$/.test(custMobile)){ showToast("رقم الجوال لازم يكون 10 أرقام"); return; }
  const lineDivs = Array.from(document.querySelectorAll("#saleItemsHolder .garment-card"));
  if(!lineDivs.length){ showToast("أضف صنف واحد على الأقل"); return; }
  const items = [];
  for(const div of lineDivs){
    const itemCardId = div.querySelector(".sl-item").value;
    const qty = parseFloat(div.querySelector(".sl-qty").value)||0;
    const price = parseFloat(div.querySelector(".sl-price").value)||0;
    const card = findItemCard(itemCardId);
    if(!card){ showToast("اختر صنف صحيح لكل سطر"); return; }
    if(qty<=0){ showToast("أدخل كمية صحيحة"); return; }
    items.push({itemCardId, name:card.name, qty, price, costAtSale: card.currentCost||0});
  }
  const total = updateSaleTotal();
  const d = computeSaleDiscounts();
  const cash = parseFloat($("saleCash").value)||0;
  const network = parseFloat($("saleNetwork").value)||0;
  const receipt = $("saleReceipt").value.trim();
  if(network>0 && !receipt){ showToast("أدخل رقم السند لدفعة الشبكة"); return; }
  if(Math.abs((cash+network)-total) > 0.01){ showToast(`المبلغ المدخل (${(cash+network).toFixed(0)}) لازم يساوي الإجمالي (${total.toFixed(0)})`); return; }
  // check stock availability (warn only, don't block)
  const lowStock = items.filter(it=>{ const c=findItemCard(it.itemCardId); return c && cardAvailableQty(c) < it.qty; });
  const snapshot = JSON.parse(JSON.stringify(state));
  items.forEach(it=>{ const c=findItemCard(it.itemCardId); if(c) c.stockQty -= it.qty; });
  const freeGifts = [];
  if(d.gift){ const g = findItemCard(d.gift.itemCardId); if(g){ g.stockQty = (g.stockQty||0) - d.gift.qty; freeGifts.push(d.gift); } }
  const discounts = {promoCode: salePromo ? salePromo.code : null, promoDiscount:+d.promoDisc.toFixed(2), offerName: d.offer ? d.offer.name : null, offerDiscount:+d.offerDisc.toFixed(2), direct:+d.direct.toFixed(2), gift: salePromo && salePromo.type==="gift" ? (salePromo.giftDescription||"") : null};
  const payment = {id:newId(), date, cash, network, receipt};
  applyPaymentToBalances(payment);
  ensureCustomerIndividual(custMobile, custName);
  state.salesInvoices.push({id:newId(), number, date, customerName:custName, customerMobile:custMobile, items, discounts, discountTotal:+d.discountTotal.toFixed(2), freeGifts, payment, recordedBy:currentUser.username});
  state.settings.nextSalesInvoiceNumber++;
  if(!await saveStateWithRollback(snapshot)) return; // form stays filled in so the cashier can just retry
  logAudit("sale_invoice_recorded", {number, total, cash, network, discountTotal:+d.discountTotal.toFixed(2), promoCode:discounts.promoCode, offer:discounts.offerName, direct:discounts.direct});
  resetSaleForm();
  showToast(lowStock.length? "تم الحفظ — تنبيه: بعض الأصناف تجاوزت المخزون المتاح" : "تم حفظ فاتورة المبيعات");
}
function renderSalesInvoicesList(){
  const tbody = $("salesInvoicesBody");
  const rows = state.salesInvoices.slice().reverse();
  tbody.innerHTML = rows.length ? rows.map(inv=>{
    const total = saleNetTotal(inv);
    return `<tr><td>${esc(inv.number)}</td><td>${inv.date}</td><td>${esc(inv.customerName)}</td><td>${fmtSar(total)} ﷼</td></tr>`;
  }).join("") : `<tr><td colspan="4">${emptyStateHtml("shopping-bag","ما فيه فواتير مبيعات بعد.")}</td></tr>`;
  renderSaleReturnsLog();
}
// ---------------- sales invoice returns ----------------
function renderSaleReturnsLog(){
  const panel = $("saleReturnPanel");
  if(!panel || !currentUser) return;
  panel.style.display = currentUser.role==="مدير" ? "" : "none";
  const rows = (state.salesReturns||[]).slice().reverse();
  $("saleReturnsBody").innerHTML = rows.length ? rows.map(r=>`<tr><td>${r.date}</td><td>${esc(r.saleInvoiceNumber)}</td><td>${r.lines.map(l=>`${esc(l.name)} ×${l.qty}`).join("، ")}</td><td>${fmtSar(r.refundAmount||0)} ﷼</td><td>${esc(r.reason||"—")}</td><td>${esc(r.recordedBy)}</td></tr>`).join("")
    : `<tr><td colspan="6" class="sub" style="text-align:center;padding:12px;">ما فيه مرتجعات مبيعات بعد.</td></tr>`;
}
function loadSaleReturnLines(){
  const wrap = $("saleReturnLines");
  const num = $("saleReturnNumber").value.trim();
  const inv = state.salesInvoices.find(s=>s.number===num);
  if(!inv){ wrap.innerHTML = ""; showToast("ما فيه فاتورة مبيعات بهذا الرقم"); return; }
  const lines = inv.items.map((it,i)=>({it, i, left: it.qty - saleLineReturnedQty(inv, i)}));
  if(!lines.some(l=>l.left>0.0001)){ wrap.innerHTML = `<p class="sub">كل أصناف هذي الفاتورة مرتجعة بالكامل مسبقاً.</p>`; return; }
  wrap.innerHTML = `<p class="sub" style="margin:0 0 8px;">فاتورة ${esc(inv.number)} — ${inv.date} — ${esc(inv.customerName||"—")}</p>` +
    lines.map(({it,i,left})=>`<div class="garment-card"><div class="row-3" style="align-items:flex-end;">
      <div class="field" style="margin-bottom:0;"><label>${esc(it.name)} — ${fmtSar(it.price*saleNetFactor(inv))} ﷼ للوحدة${inv.discountTotal?" (بعد الخصم)":""}</label><p class="sub" style="margin:0;">المباع ${it.qty}${left<it.qty?` — المتبقي القابل للترجيع ${left}`:""}</p></div>
      <div class="field" style="margin-bottom:0;"><label>الكمية المرتجعة</label><input type="number" class="sr-qty" data-line="${i}" min="0" max="${left}" step="0.1" placeholder="0" ${left<=0.0001?"disabled":""}></div>
    </div></div>`).join("") +
    `<div class="row-2" style="margin-top:8px;">
      <div class="field"><label>الصندوق اللي يُرد منه المبلغ</label><select id="saleReturnBox">${userBoxes(currentUser.username).map(b=>`<option value="${b.id}">${esc(b.name)} (${typeLabel(b.type)}) — ${boxTotal(b).toFixed(0)} ﷼</option>`).join("")}</select></div>
      <div class="field"><label>سبب الترجيع</label><input type="text" id="saleReturnReason" placeholder="مثلاً: مقاس غير مناسب"></div>
    </div>
    <p class="sub" id="saleReturnTotalNote">المبلغ المسترد: 0 ﷼</p>
    <button class="btn btn-gold btn-sm" onclick="submitSaleReturn('${inv.id}')">تسجيل المرتجع</button>`;
  wrap.querySelectorAll(".sr-qty").forEach(inp=> inp.addEventListener("input", ()=>{
    const total = Array.from(wrap.querySelectorAll(".sr-qty")).reduce((a,x)=>a+(parseFloat(x.value)||0)*inv.items[+x.dataset.line].price*saleNetFactor(inv),0);
    $("saleReturnTotalNote").textContent = `المبلغ المسترد: ${fmtSar(total)} ﷼`;
  }));
}
async function submitSaleReturn(invId){
  if(!currentUser || currentUser.role!=="مدير"){ showToast("ترجيع فواتير المبيعات متاح للمدير فقط"); return; }
  const inv = state.salesInvoices.find(s=>s.id===invId);
  if(!inv){ showToast("الفاتورة غير موجودة"); return; }
  const reason = ($("saleReturnReason").value||"").trim();
  if(!reason){ showToast("أدخل سبب الترجيع"); return; }
  const lines = [];
  for(const inp of document.querySelectorAll("#saleReturnLines .sr-qty")){
    const qty = parseFloat(inp.value)||0;
    if(qty<=0) continue;
    const i = +inp.dataset.line, it = inv.items[i];
    const left = it.qty - saleLineReturnedQty(inv, i);
    if(qty - left > 0.0001){ showToast(`كمية "${it.name}" المرتجعة أكبر من المتبقي بالفاتورة (${left})`); return; }
    // refunded at what the customer actually paid for it: the list price less its share of the invoice discount
    lines.push({lineIdx:i, itemCardId:it.itemCardId, name:it.name, qty, price:+(it.price*saleNetFactor(inv)).toFixed(4), costAtSale:it.costAtSale||0});
  }
  if(!lines.length){ showToast("أدخل كمية مرتجعة لصنف واحد على الأقل"); return; }
  const refundAmount = lines.reduce((a,l)=>a+l.qty*l.price,0);
  const box = findCashBox($("saleReturnBox").value);
  if(!box){ showToast("اختر الصندوق"); return; }
  if(boxTotal(box) < refundAmount){ showToast(`رصيد الصندوق (${boxTotal(box).toFixed(0)} ريال) أقل من المبلغ المسترد`); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  lines.forEach(l=>{ const c=findItemCard(l.itemCardId); if(c) c.stockQty = (c.stockQty||0) + l.qty; });
  box.balance -= refundAmount;
  state.salesReturns.push({id:newId(), saleInvoiceId:inv.id, saleInvoiceNumber:inv.number, saleRecordedBy:inv.recordedBy, lines, refundAmount, boxId:box.id, reason, date:todayStr(), recordedBy:currentUser.username});
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("sale_invoice_returned", {number:inv.number, refundAmount, items:lines.map(l=>`${l.name} x${l.qty}`).join(", "), reason});
  $("saleReturnNumber").value=""; $("saleReturnLines").innerHTML="";
  showToast(`تم تسجيل مرتجع فاتورة المبيعات ${inv.number} — المبلغ المسترد ${fmtSar(refundAmount)} ﷼ ورجعت الكمية للمخزون`);
}

function computeItemSalesTotals(){
  const totals = {}; // itemCardId -> {qty, revenue}
  state.itemCards.forEach(c=> totals[c.id] = {qty:0, revenue:0});
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{
    if(g.status==="ملغي" || !g.itemCardId || g.stockApplied!=="consumed") return;
    if(!totals[g.itemCardId]) totals[g.itemCardId] = {qty:0, revenue:0};
    totals[g.itemCardId].qty += g.qtyUsed||0;
    totals[g.itemCardId].revenue += garmentSalePrice(g);
  }));
  state.salesInvoices.forEach(inv=> inv.items.forEach(it=>{
    if(!totals[it.itemCardId]) totals[it.itemCardId] = {qty:0, revenue:0};
    totals[it.itemCardId].qty += it.qty||0;
    totals[it.itemCardId].revenue += (it.qty||0)*(it.price||0)*saleNetFactor(inv);
  }));
  (state.salesReturns||[]).forEach(r=> r.lines.forEach(l=>{
    if(!totals[l.itemCardId]) totals[l.itemCardId] = {qty:0, revenue:0};
    totals[l.itemCardId].qty -= l.qty;
    totals[l.itemCardId].revenue -= l.qty*l.price;
  }));
  return totals;
}
function computeVatSummary(from, to){
  const rate = state.settings.vatRate||0;
  const includeVat = state.settings.pricesIncludeVat!==false;
  const outputVatFromTotal = total => rate<=0 ? 0 : includeVat ? (total - (total/(1+rate/100))) : (total*rate/100);
  let outputVat = 0, inputVat = 0, salesTotal = 0, purchasesTotal = 0, expensesVatTotal = 0;
  state.invoices.forEach(inv=>{
    if(!inDateRange(inv.date, from, to)) return;
    const total = invoiceSaleTotal(inv);
    outputVat += outputVatFromTotal(total); salesTotal += total;
  });
  state.salesInvoices.forEach(inv=>{
    if(!inDateRange(inv.date, from, to)) return;
    const total = saleNetTotal(inv);
    outputVat += outputVatFromTotal(total); salesTotal += total;
  });
  // returned goods reverse their output VAT in the period the return happens
  salesReturnsInRange(from, to).forEach(r=>{
    const total = saleReturnValue(r);
    outputVat -= outputVatFromTotal(total); salesTotal -= total;
  });
  state.purchases.forEach(p=>{
    if(!inDateRange(p.date, from, to)) return;
    purchasesTotal += p.total;
    if(p.vatStatus==="شاملة") inputVat += p.total*rate/100; // supplier charged this on top, recoverable
  });
  state.expenses.forEach(e=>{
    if(!inDateRange(e.date, from, to)) return;
    if(e.vatStatus==="شاملة"){ const v = (e.amount||0)*rate/100; inputVat += v; expensesVatTotal += v; }
  });
  return {outputVat, inputVat, net: outputVat-inputVat, salesTotal, purchasesTotal, expensesVatTotal, rate};
}
function showVatCalculator(){
  if(!state.settings.vatEnabled){ $("vatCalcView").innerHTML = `<p class="sub">فعّل ضريبة القيمة المضافة أولاً من إعدادات "بيانات المحل" قبل استخدام هذي الحاسبة.</p>`; return; }
  const {from, to, label} = extendedPeriodRange("vatCalc");
  const s = computeVatSummary(from, to);
  const netAbs = Math.abs(s.net);
  const netLabel = s.net > 0.01 ? `عليك دفعه للهيئة` : s.net < -0.01 ? `لك استرداد منها` : `متعادل — لا شي عليك ولا لك`;
  const priceTypeNote = state.settings.pricesIncludeVat!==false ? "الأسعار المسجّلة بالفواتير شاملة الضريبة" : "الأسعار المسجّلة بالفواتير بدون ضريبة (تُضاف الضريبة فوقها بالحساب)";
  let html = `<h3 style="margin:0 0 10px;font-size:14px;">حاسبة الضريبة — ${label}</h3>`;
  html += `<p class="sub" style="margin-bottom:10px;">حساب تقديري مبني على أرقام النظام (${priceTypeNote}، بنسبة ${s.rate}%). يشمل ضريبة مدخلات المشتريات والمصاريف المؤشّرة "شاملة الضريبة" فقط. للفوترة الرسمية راجع محاسبك أو بوابة "فاتورة".</p>`;
  html += `<div class="remaining-box"><span>إجمالي ضريبة المبيعات (مخرجات)</span><span class="amt">${s.outputVat.toFixed(2)} ريال</span></div>`;
  html += `<div class="remaining-box" style="margin-top:6px;"><span>إجمالي ضريبة المشتريات والمصاريف (مدخلات)</span><span class="amt">${s.inputVat.toFixed(2)} ريال</span></div>`;
  html += `<div class="remaining-box" style="margin-top:6px;border-color:var(--gold);"><span><b>الصافي — ${netLabel}</b></span><span class="amt" style="font-size:16px;">${netAbs.toFixed(2)} ريال</span></div>`;
  $("vatCalcView").innerHTML = html + `<button class="btn btn-ghost btn-sm" id="printVatCalcBtn" style="margin-top:10px;">طباعة</button>`;
  $("printVatCalcBtn").addEventListener("click", ()=>{ printHtml(html); });
}
function renderVatLedger(){
  const el = $("vatLedgerSummary");
  if(!el) return;
  if(!state.settings.vatEnabled){ el.innerHTML = `<p class="sub">فعّل ضريبة القيمة المضافة أولاً.</p>`; $("vatPaymentsHistory").innerHTML=""; return; }
  const allTime = computeVatSummary("0000-01-01", "9999-12-31");
  const totalPaid = state.vatPayments.reduce((a,p)=>a+p.amount,0);
  const remaining = allTime.net - totalPaid;
  const statusLabel = remaining > 0.01 ? "متبقٍ عليك للهيئة" : remaining < -0.01 ? "دفعت أكثر من المستحق" : "مسدّد بالكامل";
  el.innerHTML = `
    <div class="remaining-box"><span>إجمالي الضريبة المستحقة (كل الفترات)</span><span class="amt">${allTime.net.toFixed(2)} ريال</span></div>
    <div class="remaining-box" style="margin-top:6px;"><span>إجمالي المدفوع فعلياً للهيئة</span><span class="amt">${totalPaid.toFixed(2)} ريال</span></div>
    <div class="remaining-box" style="margin-top:6px;border-color:var(--gold);"><span><b>${statusLabel}</b></span><span class="amt" style="font-size:16px;">${Math.abs(remaining).toFixed(2)} ريال</span></div>`;
  const rows = state.vatPayments.slice().reverse();
  $("vatPaymentsHistory").innerHTML = rows.length ? rows.map(p=>`<div class="garment-card"><span class="tag">${p.date}</span><p style="margin:6px 0;font-weight:700;">${p.amount.toFixed(2)} ريال</p>${p.note?`<p class="sub">${esc(p.note)}</p>`:""}</div>`).join("") : `<p class="sub">ما فيه دفعات مسجّلة بعد.</p>`;
}
function showSalesRankingReport(){
  const totals = computeItemSalesTotals();
  const rows = state.itemCards.map(c=>({card:c, qty: totals[c.id]?totals[c.id].qty:0, revenue: totals[c.id]?totals[c.id].revenue:0}));
  const sold = rows.filter(r=>r.qty>0).sort((a,b)=>b.qty-a.qty);
  const dormant = rows.filter(r=>r.qty<=0);
  const unitOf = c=> c.type==="fabric" ? unitLabel() : "قطعة";
  const typeLbl = t=> t==="fabric"?"قماش":t==="product"?"منتج جاهز":"ملحق فعلي";
  let html = `<h2>تقرير الأصناف الأكثر والأقل مبيعاً</h2>`;
  html += `<h3 style="margin:14px 0 8px;font-size:14px;">الأكثر مبيعاً (أعلى 10)</h3>`;
  html += `<table><thead><tr><th>الصنف</th><th>النوع</th><th>الكمية المباعة</th><th>الإيراد</th></tr></thead><tbody>`;
  sold.slice(0,10).forEach(r=> html+=`<tr><td>${r.card.name}</td><td>${typeLbl(r.card.type)}</td><td>${r.qty.toFixed(1)} ${unitOf(r.card)}</td><td>${r.revenue.toFixed(0)} ريال</td></tr>`);
  if(!sold.length) html+=`<tr><td colspan="4" style="text-align:center;">ما فيه مبيعات مسجّلة بعد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3 style="margin:18px 0 8px;font-size:14px;">الأقل مبيعاً (أدنى 10، ولها مبيعات فعلاً)</h3>`;
  html += `<table><thead><tr><th>الصنف</th><th>النوع</th><th>الكمية المباعة</th><th>الإيراد</th></tr></thead><tbody>`;
  sold.slice(-10).reverse().forEach(r=> html+=`<tr><td>${r.card.name}</td><td>${typeLbl(r.card.type)}</td><td>${r.qty.toFixed(1)} ${unitOf(r.card)}</td><td>${r.revenue.toFixed(0)} ريال</td></tr>`);
  if(!sold.length) html+=`<tr><td colspan="4" style="text-align:center;">لا يوجد</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3 style="margin:18px 0 8px;font-size:14px;">الأصناف الخاملة (ما لها أي مبيعات إطلاقاً)</h3>`;
  html += `<table><thead><tr><th>الصنف</th><th>النوع</th><th>الحالة</th></tr></thead><tbody>`;
  dormant.forEach(r=> html+=`<tr><td>${r.card.name}</td><td>${typeLbl(r.card.type)}</td><td>${r.card.active?"نشط":"متوقف"}</td></tr>`);
  if(!dormant.length) html+=`<tr><td colspan="3" style="text-align:center;">ما فيه أصناف خاملة — كل الأصناف عليها مبيعات</td></tr>`;
  html += `</tbody></table>`;
  $("salesRankingView").innerHTML = html + `<button class="btn btn-ghost btn-sm" id="printSalesRankingBtn" style="margin-top:10px;">طباعة</button>`;
  $("printSalesRankingBtn").addEventListener("click", ()=>{ printHtml(html); });
}
function showStockReport(){
  const typeLabel = t=> t==="fabric"?"قماش":t==="product"?"منتج جاهز":"ملحق فعلي";
  const groups = {fabric:{qty:0,value:0,unit:unitLabel()}, product:{qty:0,value:0,unit:"قطعة"}, addon:{qty:0,value:0,unit:"قطعة"}};
  state.itemCards.forEach(c=>{
    const avail = cardAvailableQty(c);
    const val = avail*(c.currentCost||0);
    if(groups[c.type]){ groups[c.type].qty += avail; groups[c.type].value += val; }
  });
  let html = `<h2>تقرير رصيد المخزون الكامل — ${todayStr()}</h2>`;
  html += `<h3 style="margin:14px 0 8px;font-size:14px;">ملخص مختصر</h3>`;
  html += `<table><thead><tr><th>النوع</th><th>الكمية الإجمالية</th><th>القيمة الإجمالية</th></tr></thead><tbody>`;
  ["fabric","product","addon"].forEach(t=>{
    html += `<tr><td>${typeLabel(t)}</td><td>${groups[t].qty.toFixed(1)} ${groups[t].unit}</td><td>${groups[t].value.toFixed(2)} ريال</td></tr>`;
  });
  const grandTotal = groups.fabric.value+groups.product.value+groups.addon.value;
  html += `<tr style="font-weight:700;"><td>الإجمالي الكلي</td><td>—</td><td>${grandTotal.toFixed(2)} ريال</td></tr>`;
  html += `</tbody></table>`;
  html += `<h3 style="margin:18px 0 8px;font-size:14px;">التفصيل الكامل — كل صنف</h3>`;
  html += `<table><thead><tr><th>اسم الصنف</th><th>النوع</th><th>الكمية المتاحة</th><th>تكلفة الوحدة</th><th>القيمة الإجمالية</th><th>الحالة</th></tr></thead><tbody>`;
  state.itemCards.forEach(c=>{
    const avail = cardAvailableQty(c);
    const val = avail*(c.currentCost||0);
    html += `<tr><td>${esc(c.name)}</td><td>${typeLabel(c.type)}</td><td>${avail.toFixed(1)} ${c.type==="fabric"?unitLabel():"قطعة"}</td><td>${(c.currentCost||0).toFixed(2)} ريال</td><td>${val.toFixed(2)} ريال</td><td>${c.active?"نشط":"متوقف"}</td></tr>`;
  });
  if(!state.itemCards.length) html += `<tr><td colspan="6" style="text-align:center;">ما فيه أصناف بعد</td></tr>`;
  html += `</tbody></table>`;
  $("stockReportView").innerHTML = html + `<button class="btn btn-ghost btn-sm" id="printStockReportBtn" style="margin-top:10px;">طباعة / حفظ PDF</button>`;
  $("printStockReportBtn").addEventListener("click", ()=>{ printHtml(html); });
}
function showItemStatement(cardId){
  const card = findItemCard(cardId);
  if(!card) return;
  $("itemStatementView").innerHTML = `<div class="stitch"></div><h3 style="font-size:14px;margin:0 0 10px;">كشف حساب — ${card.name}</h3>${periodPickerHtml("itemStmt")}<button class="btn btn-ghost btn-sm" id="itemStmtShowBtn">عرض الكشف</button><div id="itemStmtBody" style="margin-top:12px;"></div>`;
  bindPeriodPicker("itemStmt");
  $("itemStmtShowBtn").addEventListener("click", ()=> renderItemStatementBody(cardId));
  renderItemStatementBody(cardId);
}
function renderItemStatementBody(cardId){
  const card = findItemCard(cardId);
  if(!card) return;
  const movements = [];
  state.purchases.filter(p=>p.itemCardId===cardId).forEach(p=>{
    const sup = state.suppliers.find(s=>s.id===p.supplierId);
    movements.push({date:p.date, type:"شراء", qty:p.quantity, credit:true, ref:`مورد: ${sup?sup.name:"—"}`});
  });
  state.purchaseReturns.filter(r=>r.itemCardId===cardId).forEach(r=>{
    movements.push({date:r.date, type:"مرتجع مشتريات", qty:r.quantity, credit:false, ref:""});
  });
  state.stockWriteOffs.filter(w=>w.itemCardId===cardId).forEach(w=>{
    movements.push({date:w.date, type:"إتلاف", qty:w.qty, credit:false, ref:w.recordedBy||""});
  });
  const garmentRows = [];
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{
    if(g.itemCardId!==cardId) return;
    if(dateMatchesPeriod("itemStmt", inv.date, inv.originMonth)) garmentRows.push({invNumber:inv.number, customer:inv.customerName, date:inv.date, qty:g.qtyUsed||0, status:g.status});
    if(g.stockApplied==="consumed"){
      movements.push({date: g.tailorCompletedDate || inv.date, type:`استهلاك تفصيل — فاتورة ${esc(inv.number)}`, qty:g.qtyUsed||0, credit:false, ref:inv.customerName||""});
    }
  }));
  movements.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  let running = card.openingBalance||0;
  const allLedgerRows = movements.map(m=>{ running += m.credit ? m.qty : -m.qty; return {...m, balance:running}; });
  const inPeriod = allLedgerRows.filter(m=> dateMatchesPeriod("itemStmt", m.date, null));
  const firstShownIdx = inPeriod.length ? allLedgerRows.indexOf(inPeriod[0]) : -1;
  const balanceBeforePeriod = firstShownIdx>0 ? allLedgerRows[firstShownIdx-1].balance : (card.openingBalance||0);
  const unitTxt = card.type==="fabric" ? unitLabel() : "قطعة";
  let body = `<div class="remaining-box"><span>المتاح حالياً: ${cardAvailableQty(card).toFixed(1)} ${unitTxt}</span><span class="amt">التكلفة الحالية: ${card.currentCost.toFixed(2)} ريال</span></div>`;
  body += `<h4 style="margin:14px 0 8px;font-size:13px;">حركة المخزون — ${periodLabel("itemStmt")} (دائن = وارد / مدين = صادر)</h4>`;
  body += `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الحركة</th><th>دائن (+)</th><th>مدين (-)</th><th>الرصيد بعدها</th><th>قيمة الرصيد</th></tr></thead><tbody>`;
  body += `<tr><td>—</td><td>الرصيد قبل هذي الفترة</td><td>—</td><td>—</td><td>${balanceBeforePeriod.toFixed(1)}</td><td>${(balanceBeforePeriod*(card.currentCost||0)).toFixed(2)} ريال</td></tr>`;
  inPeriod.forEach(m=> body += `<tr><td>${m.date||"—"}</td><td>${esc(m.type)}${m.ref?" — "+esc(m.ref):""}</td><td>${m.credit?m.qty.toFixed(1):"—"}</td><td>${!m.credit?m.qty.toFixed(1):"—"}</td><td>${m.balance.toFixed(1)}</td><td>${(m.balance*(card.currentCost||0)).toFixed(2)} ريال</td></tr>`);
  if(!inPeriod.length) body += `<tr><td colspan="6" class="sub" style="text-align:center;padding:14px;">ما فيه حركات بهذي الفترة.</td></tr>`;
  body += `</tbody></table></div>`;
  body += `<p class="sub" style="margin-top:6px;">* عمود "قيمة الرصيد" محسوب بتكلفة الوحدة الحالية (${card.currentCost.toFixed(2)} ريال)، مو بالضرورة سعر الشراء وقت كل حركة تاريخياً.</p>`;
  body += `<h4 style="margin:14px 0 8px;font-size:13px;">الثياب المرتبطة بهذا الصنف — ${periodLabel("itemStmt")} (${garmentRows.length})</h4>`;
  body += `<div class="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th><th>الكمية</th><th>الحالة</th></tr></thead><tbody>`;
  garmentRows.forEach(g=> body += `<tr><td>${g.invNumber}</td><td>${g.customer||"—"}</td><td>${g.date||"—"}</td><td>${g.qty.toFixed(1)}</td><td>${STATUSES.find(s=>s.v===g.status)?.label||g.status}</td></tr>`);
  if(!garmentRows.length) body += `<tr><td colspan="5" class="sub" style="text-align:center;padding:14px;">ما فيه ثياب مرتبطة بهذا الصنف بهذي الفترة.</td></tr>`;
  body += `</tbody></table></div>`;
  $("itemStmtBody").innerHTML = body + `<button class="btn btn-ghost btn-sm" id="printItemStatementBtn" style="margin-top:10px;">طباعة كشف الحساب</button>`;
  $("printItemStatementBtn").addEventListener("click", ()=>{ printHtml(`<h2>كشف حساب صنف — ${esc(card.name)}</h2>`+body); });
}
function renderInventoryValuation(){
  const el = $("inventoryValuationView");
  if(!el) return;
  const fabricCards = activeFabricCards();
  const productCards = activeProductCards();
  const addonCards = state.itemCards.filter(c=>c.type==="addon" && c.active);
  const fabricValue = fabricCards.reduce((a,c)=>a+cardAvailableQty(c)*(c.currentCost||0),0);
  const productValue = productCards.reduce((a,c)=>a+cardAvailableQty(c)*(c.currentCost||0),0);
  const addonValue = addonCards.reduce((a,c)=>a+cardAvailableQty(c)*(c.currentCost||0),0);
  const totalValue = fabricValue+productValue+addonValue;
  const fabricMeters = fabricCards.reduce((a,c)=>a+cardAvailableQty(c),0);
  const equivGarments = Math.floor(fabricMeters / (defaultFabricQty()["رجال"]||3.25));
  const productCount = productCards.reduce((a,c)=>a+cardAvailableQty(c),0);
  const addonCount = addonCards.reduce((a,c)=>a+cardAvailableQty(c),0);
  el.innerHTML = `<div class="garment-card">
    <h3 style="margin:0 0 10px;font-size:15px;">قيمة المخزون الكلي: <span style="color:var(--gold-soft);">${totalValue.toFixed(0)} ريال</span></h3>
    <div class="row-3">
      <div><p class="sub" style="margin:0;">أقمشة</p><p style="margin:2px 0;font-weight:700;">${fabricValue.toFixed(0)} ريال</p><p class="sub" style="margin:0;font-size:11px;">يعادل ${equivGarments} ثوب (محسوبة على ثوب رجال)</p></div>
      <div><p class="sub" style="margin:0;">منتج جاهز</p><p style="margin:2px 0;font-weight:700;">${productValue.toFixed(0)} ريال</p><p class="sub" style="margin:0;font-size:11px;">${productCount} قطعة</p></div>
      <div><p class="sub" style="margin:0;">ملحقات</p><p style="margin:2px 0;font-weight:700;">${addonValue.toFixed(0)} ريال</p><p class="sub" style="margin:0;font-size:11px;">${addonCount} قطعة</p></div>
    </div>
  </div>`;
}
function checkLowStockAlerts(){
  const today = todayStr();
  const recipients = state.users.filter(u=>u.role==="مدير" || u.role==="محاسب");
  let addedAny = false;
  state.itemCards.forEach(c=>{
    if(!c.active || !c.minStock || c.minStock<=0) return;
    const avail = cardAvailableQty(c);
    if(avail >= c.minStock){ if(c.lowStockAlertedDate) c.lowStockAlertedDate = null; return; } // recovered above threshold — allow a fresh alert if it dips again later
    if(c.lowStockAlertedDate === today) return; // already alerted today, don't spam
    const seq = nextDecisionNo();
    const message = `تنبيه مخزون: صنف "${c.name}" نزل تحت الحد الأدنى — المتاح حالياً ${avail.toFixed(1)} ${c.type==="fabric"?unitLabel():"قطعة"}، والحد الأدنى المحدد ${c.minStock} ${c.type==="fabric"?unitLabel():"قطعة"}.`;
    recipients.forEach(u=>{
      state.decisions.push({id:Date.now()+"-"+u.username, seq, type:"low_stock", recipientUsername:u.username, amount:0, reason:c.name, message, decidedBy:"النظام", date:today});
    });
    c.lowStockAlertedDate = today;
    addedAny = true;
  });
  if(addedAny) saveState();
}
function renderInventoryTab(){
  if(!currentUser) return;
  renderItemCards(); renderSuppliers(); refreshPurchaseForm(); renderPurchases(); refreshReturnForm(); renderReturns();
  refreshGarmentItemCardOptions();
  checkLowStockAlerts();
}
function refreshGarmentItemCardOptions(){
  const cards = activeFabricCards();
  const dl = $("fabricDatalist");
  if(dl) dl.innerHTML = cards.map(c=>`<option value="${esc(c.name)}"></option>`).join("") + `<option value="أجرة تفصيل (بدون قماش)"></option>`;
}
function refreshSaleLineOptions(){
  const cards = [...activeFabricCards(), ...activeProductCards()];
  document.querySelectorAll(".sl-item").forEach(sel=>{
    const current = sel.value;
    sel.innerHTML = cards.length ? cards.map(c=>`<option value="${c.id}" ${c.id===current?"selected":""}>${esc(c.name)} (${c.type==="fabric"?"قماش":"منتج"} — متاح: ${cardAvailableQty(c).toFixed(c.type==="fabric"?1:0)} ${c.type==="fabric"?unitLabel():"قطعة"})</option>`).join("")
      : `<option value="">-- ما فيه أصناف مشتراة بعد --</option>`;
  });
}

function updateExpSubItemOptions(){
  const sel = $("expSubItem");
  if(!sel) return;
  const cat = state.expenseCategories.find(c=>c.id===$("expCategory").value);
  const curSub = sel.value;
  const items = (cat && cat.subItems) || [];
  sel.innerHTML = `<option value="">-- بدون بند فرعي --</option>` + items.map(s=>`<option value="${s.id}" ${s.id===curSub?"selected":""}>${esc(s.label)}</option>`).join("");
}
function renderBalancesTab(){
  if(!currentUser) return;
  const isAdmin = currentUser.role==="مدير";
  const myBoxes = userBoxes(currentUser.username);
  const el = $("myBoxesList");
  el.innerHTML = myBoxes.map(b=>{
    return `<div class="garment-card"><span class="tag">${b.name} — ${typeLabel(b.type)}${b.isMain?" (رئيسي)":""}</span>
      <p class="sub" style="margin:6px 0 0;font-size:16px;color:var(--ivory);font-weight:700;">${boxTotal(b).toFixed(0)} ﷼</p>
    </div>`;
  }).join("");

  // sub-box owner picker (admin can create a sub-box for any user; others only for themselves)
  $("subBoxOwnerWrap").style.display = isAdmin ? "" : "none";
  if(isAdmin){
    $("newSubBoxOwnerDatalist").innerHTML = state.users.map(u=>`<option value="${esc(u.username)}"></option>`).join("");
    if(!$("newSubBoxOwner").value){ $("newSubBoxOwner").value = currentUser.username; $("newSubBoxOwnerSearch").value = currentUser.username; }
  }

  // admin: full cross-user boxes overview
  $("adminAllBoxesWrap").style.display = isAdmin ? "" : "none";
  if(isAdmin){
    $("allBoxesBody").innerHTML = state.cashBoxes.map(b=>
      `<tr><td>${b.owner}</td><td>${b.name}${b.isMain?" (رئيسي)":""}</td><td>${typeLabel(b.type)}</td><td>${boxTotal(b).toFixed(0)} ﷼</td></tr>`
    ).join("");
  }

  // transfer form selects
  const fromSel = $("transferFromBox"); const curFrom = fromSel.value;
  fromSel.innerHTML = myBoxes.map(b=>`<option value="${b.id}" ${b.id===curFrom?"selected":""}>${b.name} (${typeLabel(b.type)}) — ${boxTotal(b).toFixed(0)} ﷼</option>`).join("");
  const toMySel = $("transferToMyBox"); const curToMy = toMySel.value;
  toMySel.innerHTML = myBoxes.map(b=>`<option value="${b.id}" ${b.id===curToMy?"selected":""}>${b.name} (${typeLabel(b.type)})</option>`).join("");
  const toUserSel = $("transferToUser"); const curToUser = toUserSel.value;
  $("transferToUserDatalist").innerHTML = state.users.filter(u=>u.username!==currentUser.username).map(u=>`<option value="${esc(u.username)}"></option>`).join("");

  // incoming pending requests
  const incoming = state.transferRequests.filter(r=>r.status==="pending" && r.toOwner===currentUser.username);
  $("incomingTransfersList").innerHTML = incoming.length ? incoming.map(r=>`
    <div class="garment-card"><span class="tag">من ${r.fromOwner} — ${r.amount.toFixed(0)} ﷼</span>
      <p class="sub" style="margin:6px 0;">${r.purpose? "الغرض: "+r.purpose : "بدون غرض محدد"} — بتاريخ ${r.createdAt}</p>
      <div class="actions-row" style="margin-top:0;">
        <button class="btn btn-gold btn-sm" onclick="acceptTransferRequest('${r.id}')">استلمت المبلغ</button>
        <button class="btn btn-danger btn-sm" onclick="rejectTransferRequest('${r.id}')">رفض</button>
      </div>
    </div>`).join("") : `<p class="sub">ما فيه طلبات معلّقة.</p>`;

  // transfer history (sent or received by me)
  const history = state.transferRequests.filter(r=>r.fromOwner===currentUser.username || r.toOwner===currentUser.username)
    .slice().sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
  $("transferHistoryList").innerHTML = history.length ? history.map(r=>{
    const statusLabel = r.status==="pending"?"بانتظار الرد":(r.status==="accepted"?"تم الاستلام":"مرفوض");
    const statusColor = r.status==="pending"?"var(--gold)":(r.status==="accepted"?"var(--profit)":"var(--loss)");
    return `<div class="garment-card"><span class="tag">${r.fromOwner} ← ${r.toOwner} — ${r.amount.toFixed(0)} ﷼</span>
      <p class="sub" style="margin:6px 0;">${r.purpose||"—"} — ${r.createdAt}${r.voucherNumber?` — سند رقم ${r.voucherNumber}`:""}</p>
      <span class="badge" style="background:transparent;border:1px solid ${statusColor};color:${statusColor};">${statusLabel}</span>
    </div>`;
  }).join("") : `<p class="sub">ما فيه تحويلات بعد.</p>`;

  // advisory balances
  const adv = state.advisory;
  $("advisoryBalancesGrid").innerHTML = `
    <div class="report-card"><div class="st">رصيد الأقمشة</div><div class="amt">${adv.fabric.toFixed(0)} ﷼</div></div>
    <div class="report-card"><div class="st">رصيد الحشوات</div><div class="amt">${adv.padding.toFixed(0)} ﷼</div></div>
    <div class="report-card"><div class="st">رصيد أجور الخياطين</div><div class="amt">${adv.wages.toFixed(0)} ﷼</div></div>
    <div class="report-card"><div class="st">رصيد التطريز</div><div class="amt">${adv.embroidery.toFixed(0)} ﷼</div></div>`;

  // expense form selects
  const curExpCat = $("expCategory").value, curExpBox = $("expSourceBox").value;
  $("expCategory").innerHTML = state.expenseCategories.map(c=>`<option value="${c.id}" ${c.id===curExpCat?"selected":""}>${c.label}</option>`).join("");
  $("expSourceBox").innerHTML = myBoxes.map(b=>`<option value="${b.id}" ${b.id===curExpBox?"selected":""}>${b.name} (${typeLabel(b.type)}) — ${boxTotal(b).toFixed(0)} ﷼</option>`).join("");
  updateExpSubItemOptions();

  // expenses log
  const expTbody = $("expensesBody");
  const visibleExpenses = state.expenses.slice().reverse();
  expTbody.innerHTML = visibleExpenses.length ? visibleExpenses.map(e=>{
    const cat = state.expenseCategories.find(c=>c.id===e.categoryId);
    const box = findCashBox(e.sourceBoxId);
    return `<tr><td>${e.date}</td><td>${cat?esc(cat.label):"—"}</td><td>${esc(e.subItemLabel||"—")}</td><td>${e.amount.toFixed(0)} ﷼</td><td>${esc(e.paidTo||"—")}</td><td>${esc(e.storeName||"—")}</td><td>${box?esc(box.name):"—"}</td></tr>`;
  }).join("") : `<tr><td colspan="7">${emptyStateHtml("receipt","ما فيه مصروفات مسجّلة بعد.")}</td></tr>`;
}
function renderClosedReports(){
  const el=$("archiveList");
  if(state.closingReports.length===0){ el.innerHTML=`<p class="sub">ما فيه أشهر مقفلة بعد.</p>`; return; }
  el.innerHTML = state.closingReports.slice().reverse().map(r=>`
    <div class="archive-item">
      <b>${monthDisplay(r.monthLabel)}</b> — ${r.invoiceCount} فاتورة / ${r.garmentCount} ثوب<br>
      <span class="sub">مفوتر: ${r.invoicedTotal.toFixed(0)} ﷼ · تكلفة: ${r.costTotal.toFixed(0)} ﷼ · ربح (مفوتر): ${r.profitInvoiced.toFixed(0)} ﷼</span><br>
      <span class="sub">مقبوض فعلياً: ${r.collectedTotal.toFixed(0)} ﷼ · ربح (مقبوض): ${r.profitCollected.toFixed(0)} ﷼</span><br>
      <span class="sub">تطريز: ${r.embroCount||0} ثوب — ${(r.embroRevenue||0).toFixed(0)} ﷼</span>${r.pendingCustodyCarried>0.01?`<br><span class="sub" style="color:var(--gold-soft);">أمانات معلّقة مرحّلة لهذا الشهر: ${r.pendingCustodyCarried.toFixed(0)} ﷼</span>`:""}
    </div>`).join("");
}

// ---------------- growth report ----------------
function monthParts(label){ const [y,m]=label.split("-").map(Number); return {y,m}; }
function prevMonthLabel(label){ let {y,m}=monthParts(label); m--; if(m<1){m=12;y--;} return y+"-"+String(m).padStart(2,"0"); }
function sameMonthLastYear(label){ const {y,m}=monthParts(label); return (y-1)+"-"+String(m).padStart(2,"0"); }
function quarterLabelOf(label){ const {y,m}=monthParts(label); return y+"-Q"+Math.ceil(m/3); }
function prevQuarterLabel(qLabel){ let [y,q]=qLabel.split("-Q").map(Number); q--; if(q<1){q=4;y--;} return y+"-Q"+q; }
function sameQuarterLastYear(qLabel){ let [y,q]=qLabel.split("-Q").map(Number); return (y-1)+"-Q"+q; }
function quarterDisplay(qLabel){ const [y,q]=qLabel.split("-Q"); return `الربع ${q} — ${y}`; }
function pctGrowth(cur,prev){ if(prev===undefined||prev===null) return null; if(prev===0) return cur===0?0:null; return ((cur-prev)/Math.abs(prev))*100; }
function fmtGrowth(v){ if(v===null||v===undefined) return "لا توجد بيانات للمقارنة"; const sign=v>=0?"+":""; const cls=v>0?"var(--profit)":(v<0?"var(--loss)":"var(--muted)"); return `<span style="color:${cls};font-weight:700;">${sign}${v.toFixed(1)}%</span>`; }
// half-year and year totals built only from the frozen monthly closing reports — one closing
// report per month, so a month can never be counted twice or left out; incomplete periods say so
function periodRollups(reports){
  const acc = {};
  const addTo = (key, label, size, r)=>{
    const a = acc[key] || (acc[key] = {key, label, size, months:0, revenue:0, cost:0, profit:0, collected:0, garments:0, invoices:0});
    a.months++; a.revenue += r.invoicedTotal||0; a.cost += r.costTotal||0; a.profit += r.profitInvoiced||0;
    a.collected += r.collectedTotal||0; a.garments += r.garmentCount||0; a.invoices += r.invoiceCount||0;
  };
  reports.forEach(r=>{
    const {y,m} = monthParts(r.monthLabel);
    const h = m<=6 ? 1 : 2;
    addTo(`${y}-H${h}`, `${h===1?"النصف الأول":"النصف الثاني"} ${y}`, 6, r);
    addTo(`${y}`, `سنة ${y}`, 12, r);
  });
  return Object.values(acc).sort((a,b)=>b.key.localeCompare(a.key));
}
function renderPeriodRollups(reports){
  const el = $("periodRollupsView");
  if(!el) return;
  const rows = periodRollups(reports);
  if(!rows.length){ el.innerHTML = `<p class="sub">ما فيه أشهر مقفلة بعد.</p>`; return; }
  el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>الفترة</th><th>الأشهر المقفلة</th><th>الإيرادات المحققة</th><th>التكاليف</th><th>صافي الربح</th><th>المقبوض فعلياً</th><th>فواتير / ثياب</th></tr></thead><tbody>${
    rows.map(p=>`<tr><td><b>${p.label}</b></td><td>${p.months} من ${p.size}${p.months<p.size?` <span style="color:var(--gold-soft);">(ناقصة)</span>`:""}</td><td>${p.revenue.toFixed(0)} ﷼</td><td>${p.cost.toFixed(0)} ﷼</td><td style="color:${p.profit>=0?"var(--profit)":"var(--loss)"};font-weight:700;">${p.profit.toFixed(0)} ﷼</td><td>${p.collected.toFixed(0)} ﷼</td><td>${p.invoices} / ${p.garments}</td></tr>`).join("")
  }</tbody></table></div>`;
}
function renderGrowthReport(){
  const reports = state.closingReports.slice().sort((a,b)=>a.monthLabel.localeCompare(b.monthLabel));
  const monthlyEl = $("monthlyGrowthList"), qEl = $("quarterlyGrowthList");
  const profitMonthlyEl = $("monthlyProfitGrowthList"), profitQEl = $("quarterlyProfitGrowthList");
  const invEl = $("inventoryGrowthCard");
  if(!reports.length){
    monthlyEl.innerHTML=`<p class="sub">ما فيه أشهر مقفلة بعد.</p>`; qEl.innerHTML=`<p class="sub">ما فيه أرباع مكتملة بعد.</p>`;
    profitMonthlyEl.innerHTML=`<p class="sub">ما فيه أشهر مقفلة بعد.</p>`; profitQEl.innerHTML=`<p class="sub">ما فيه أرباع مكتملة بعد.</p>`;
    invEl.innerHTML=`<p class="sub">ما فيه أشهر مقفلة بعد — بطاقة المخزون الراكد تحتاج شهر مقفل واحد على الأقل.</p>`;
    return;
  }
  const byMonth={}; reports.forEach(r=>byMonth[r.monthLabel]=r);
  renderPeriodRollups(reports);

  // ===== Card 1: work-volume growth (sales + garment count) =====
  monthlyEl.innerHTML = reports.slice().reverse().map(r=>{
    const prev = byMonth[prevMonthLabel(r.monthLabel)];
    const yoy = byMonth[sameMonthLastYear(r.monthLabel)];
    const gSalesM = prev?pctGrowth(r.invoicedTotal, prev.invoicedTotal):null;
    const gGarM = prev?pctGrowth(r.garmentCount, prev.garmentCount):null;
    const gSalesY = yoy?pctGrowth(r.invoicedTotal, yoy.invoicedTotal):null;
    const gGarY = yoy?pctGrowth(r.garmentCount, yoy.garmentCount):null;
    return `<div class="archive-item">
      <b>${monthDisplay(r.monthLabel)}</b> — مبيعات: ${r.invoicedTotal.toFixed(0)} ﷼ · ثياب: ${r.garmentCount}<br>
      <span class="sub">نمو عن الشهر السابق — مبيعات: ${fmtGrowth(gSalesM)} · ثياب: ${fmtGrowth(gGarM)}</span><br>
      <span class="sub">نمو عن نفس الشهر بالسنة الماضية — مبيعات: ${fmtGrowth(gSalesY)} · ثياب: ${fmtGrowth(gGarY)}</span>
    </div>`;
  }).join("");

  // ===== Card 2: net-profit growth (same figure as closing report) =====
  profitMonthlyEl.innerHTML = reports.slice().reverse().map(r=>{
    const prev = byMonth[prevMonthLabel(r.monthLabel)];
    const yoy = byMonth[sameMonthLastYear(r.monthLabel)];
    const gProfitM = prev?pctGrowth(r.profitInvoiced, prev.profitInvoiced):null;
    const gProfitY = yoy?pctGrowth(r.profitInvoiced, yoy.profitInvoiced):null;
    return `<div class="archive-item">
      <b>${monthDisplay(r.monthLabel)}</b> — صافي المحل: ${r.profitInvoiced.toFixed(0)} ﷼<br>
      <span class="sub">نمو عن الشهر السابق: ${fmtGrowth(gProfitM)}</span><br>
      <span class="sub">نمو عن نفس الشهر بالسنة الماضية: ${fmtGrowth(gProfitY)}</span>
    </div>`;
  }).join("");

  // ===== Card 3: stagnant inventory (independent, latest closed month vs previous, frozen snapshots only) =====
  const latest = reports[reports.length-1];
  if(latest.readyCount===undefined){
    invEl.innerHTML = `<div class="garment-card"><span class="tag">المخزون الراكد</span><p class="sub" style="margin-top:8px;">هذي البطاقة تبدأ تُحسب من أول إقفال شهر بعد تفعيل هذي الميزة — الأشهر المقفلة سابقاً ما فيها لقطة محفوظة.</p></div>`;
  } else {
    const prevInv = byMonth[prevMonthLabel(latest.monthLabel)];
    const total = latest.readyCount + latest.overdueCount;
    const prevTotal = prevInv && prevInv.readyCount!==undefined ? prevInv.readyCount + prevInv.overdueCount : null;
    let arrowHtml = `<span class="sub">لا توجد بيانات للمقارنة بالشهر السابق</span>`;
    if(prevTotal!==null){
      const increased = total > prevTotal;
      const decreased = total < prevTotal;
      const diff = total - prevTotal;
      if(increased) arrowHtml = `<span style="color:var(--loss);font-weight:700;">زاد بمقدار ${diff} (إنذار)</span>`;
      else if(decreased) arrowHtml = `<span style="color:var(--profit);font-weight:700;">نقص بمقدار ${Math.abs(diff)} (تحسّن)</span>`;
      else arrowHtml = `<span class="sub">بدون تغيير عن الشهر السابق</span>`;
    }
    invEl.innerHTML = `<div class="garment-card">
      <span class="tag">المخزون الراكد — ${monthDisplay(latest.monthLabel)}</span>
      <p style="font-weight:700;font-size:20px;margin:8px 0;">${total} ثوب ${arrowHtml}</p>
      <p class="sub">جاهز (أقل من 7 أيام): ${latest.readyCount} — متعثر (7 أيام فأكثر): ${latest.overdueCount}</p>
    </div>`;
  }

  // ===== Quarterly rollups =====
  const qMap={};
  reports.forEach(r=>{
    const q=quarterLabelOf(r.monthLabel);
    if(!qMap[q]) qMap[q]={quarter:q, invoicedTotal:0, profitInvoiced:0, garmentCount:0, monthsCount:0};
    qMap[q].invoicedTotal+=r.invoicedTotal; qMap[q].profitInvoiced+=r.profitInvoiced; qMap[q].garmentCount+=r.garmentCount; qMap[q].monthsCount++;
  });
  const quarters = Object.values(qMap).sort((a,b)=>a.quarter.localeCompare(b.quarter));
  const completeQuarters = quarters.filter(q=>q.monthsCount===3);
  if(!completeQuarters.length){
    qEl.innerHTML=`<p class="sub">ما فيه أرباع مكتملة (3 أشهر متتالية مقفلة) بعد.</p>`;
    profitQEl.innerHTML=`<p class="sub">ما فيه أرباع مكتملة (3 أشهر متتالية مقفلة) بعد.</p>`;
    return;
  }
  qEl.innerHTML = completeQuarters.slice().reverse().map(q=>{
    const prev = qMap[prevQuarterLabel(q.quarter)];
    const yoy = qMap[sameQuarterLastYear(q.quarter)];
    const gSalesM = (prev&&prev.monthsCount===3)?pctGrowth(q.invoicedTotal, prev.invoicedTotal):null;
    const gGarM = (prev&&prev.monthsCount===3)?pctGrowth(q.garmentCount, prev.garmentCount):null;
    const gSalesY = (yoy&&yoy.monthsCount===3)?pctGrowth(q.invoicedTotal, yoy.invoicedTotal):null;
    const gGarY = (yoy&&yoy.monthsCount===3)?pctGrowth(q.garmentCount, yoy.garmentCount):null;
    return `<div class="archive-item">
      <b>${quarterDisplay(q.quarter)}</b> — مبيعات: ${q.invoicedTotal.toFixed(0)} ﷼ · ثياب: ${q.garmentCount}<br>
      <span class="sub">نمو عن الربع السابق — مبيعات: ${fmtGrowth(gSalesM)} · ثياب: ${fmtGrowth(gGarM)}</span><br>
      <span class="sub">نمو عن نفس الربع بالسنة الماضية — مبيعات: ${fmtGrowth(gSalesY)} · ثياب: ${fmtGrowth(gGarY)}</span>
    </div>`;
  }).join("");
  profitQEl.innerHTML = completeQuarters.slice().reverse().map(q=>{
    const prev = qMap[prevQuarterLabel(q.quarter)];
    const yoy = qMap[sameQuarterLastYear(q.quarter)];
    const gProfitM = (prev&&prev.monthsCount===3)?pctGrowth(q.profitInvoiced, prev.profitInvoiced):null;
    const gProfitY = (yoy&&yoy.monthsCount===3)?pctGrowth(q.profitInvoiced, yoy.profitInvoiced):null;
    return `<div class="archive-item">
      <b>${quarterDisplay(q.quarter)}</b> — صافي المحل: ${q.profitInvoiced.toFixed(0)} ﷼<br>
      <span class="sub">نمو عن الربع السابق: ${fmtGrowth(gProfitM)}</span><br>
      <span class="sub">نمو عن نفس الربع بالسنة الماضية: ${fmtGrowth(gProfitY)}</span>
    </div>`;
  }).join("");
}

function renderTailorReportSelector(){
  const sel = $("tailorReportSelect");
  if(!sel) return;
  const current = sel.value;
  const tailors = state.users.filter(u=>u.role==="خياط");
  sel.innerHTML = tailors.length ? tailors.map(u=>`<option value="${esc(u.username)}" ${u.username===current?"selected":""}>${esc(u.username)}</option>`).join("") : `<option value="">-- ما فيه خياطين --</option>`;
  $("tailorReportView").innerHTML = buildTailorMonthlyReport(sel.value, todayStr().slice(0,7));
}
function renderSearch(){
  const q=($("searchBox").value||"").trim().toLowerCase();
  const scope=$("searchScope").value;
  const invs = scope==="current"? state.invoices.filter(i=>i.originMonth===state.settings.currentMonth) : state.invoices;
  const statusTotals={}; STATUSES.forEach(st=>statusTotals[st.v]={count:0,amount:0});
  const rows=[]; let embroCount=0, embroRevenue=0;
  invs.forEach(inv=> inv.garments.forEach(g=>{
    statusTotals[g.status].count++; statusTotals[g.status].amount += garmentSalePrice(g);
    if(g.hasEmbroidery){ embroCount++; embroRevenue += (g.embroideryPrice||0); }
    const hay=(inv.number+" "+(g.tailor||"")+" "+g.deliveryReceipt+" "+(inv.customerMobile||"")).toLowerCase();
    if(!q||hay.includes(q)) rows.push({inv,g});
  }));
  $("statusReport").innerHTML = STATUSES.map(st=>`<div class="report-card"><div class="st">${st.label}</div>
    <div class="amt">${statusTotals[st.v].amount.toFixed(0)} ﷼</div><div class="cnt">${statusTotals[st.v].count} ثوب</div></div>`).join("");
  $("embroReport").innerHTML = `<div class="report-card"><div class="st">نشاط التطريز</div>
    <div class="amt">${embroRevenue.toFixed(0)} ﷼</div><div class="cnt">${embroCount} ثوب مطرّز</div></div>`;
  const tbody=$("searchResults"); tbody.innerHTML="";
  if(rows.length===0){ tbody.innerHTML=`<tr><td colspan="5">${emptyStateHtml("search-x","لا نتائج")}</td></tr>`; refreshLucideIcons(); return; }
  rows.forEach(({inv,g})=>{ const st=STATUSES.find(x=>x.v===g.status);
    tbody.innerHTML += `<tr><td>${esc(inv.number)}</td><td>${esc(g.tailor||"—")}</td><td><span class="badge ${st.cls}">${st.label}</span></td><td>${garmentSalePrice(g).toFixed(0)} ﷼</td><td>${g.deliveryReceipt||"—"}</td></tr>`; });
}

function getCustomers(){
  const map={};
  state.invoices.forEach(inv=>{
    if(!inv.customerMobile) return;
    const mobile=inv.customerMobile.trim();
    const name=inv.customerName||"—";
    const key=mobile+"|"+name;
    if(!map[key]) map[key]={name, mobile, lastDate:inv.date, count:0};
    map[key].count++;
    if(inv.date && (!map[key].lastDate||inv.date>map[key].lastDate)) map[key].lastDate=inv.date;
  });
  return Object.values(map);
}
function isDormant(lastDate){
  if(!lastDate) return true;
  const last=new Date(lastDate), now=serverDate();
  const months=(now.getFullYear()-last.getFullYear())*12+(now.getMonth()-last.getMonth());
  return months>6;
}
function customerHasNoFabricOrder(mobile){
  return state.invoices.some(inv=> inv.customerMobile===mobile && inv.garments.some(g=>!g.itemCardId));
}
// "زبون العروض" — never bought outside a discount code or an offer package, across every invoice they've ever placed
function customerIsPromoOnly(mobile){
  const invs = state.invoices.filter(inv=>inv.customerMobile===mobile);
  if(!invs.length) return false;
  return invs.every(inv=> inv.promoCodeUsed || (inv.appliedOffers&&inv.appliedOffers.length));
}
const CUSTOMER_FILTER_LABELS = {active:"نشط", dormant:"خامل", noFabric:"أجرة تفصيل بدون قماش", promoOnly:"زبون العروض"};
function customerMatchesFilter(c, filter){
  if(filter==="dormant") return isDormant(c.lastDate);
  if(filter==="noFabric") return customerHasNoFabricOrder(c.mobile);
  if(filter==="promoOnly") return customerIsPromoOnly(c.mobile);
  return !isDormant(c.lastDate);
}
