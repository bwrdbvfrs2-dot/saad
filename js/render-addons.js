// ---------------- render ----------------
function renderAll(){
  $("curMonthLbl").textContent = monthDisplay(state.settings.currentMonth);
  if($("auditFilterUser")){
    const curAuditUserFilter = $("auditFilterUser").value;
    $("auditFilterUser").innerHTML = `<option value="">الكل</option>` + state.users.map(u=>`<option value="${esc(u.username)}" ${u.username===curAuditUserFilter?"selected":""}>${esc(u.username)}</option>`).join("");
  }
  $("setPadding").value=state.settings.padding;
  $("setEmbroWage").value=state.settings.embroideryWage; $("setNextInv").value=state.settings.nextInvoiceNumber;
  $("setNextSaleInv").value=state.settings.nextSalesInvoiceNumber;
  $("setThermalWidth").value=state.settings.thermalPaperWidth;
  $("setSensitivePin").value=state.settings.sensitivePin;
  $("setMinDepositType").value = state.settings.minDepositType||"none";
  $("setMinDepositValue").value = state.settings.minDepositValue||"";
  $("minDepositValueWrap").style.display = state.settings.minDepositType==="none" ? "none" : "";
  $("minDepositValueLabel").textContent = state.settings.minDepositType==="percent" ? "النسبة (%)" : "المبلغ (ريال)";
  $("setBankFee").value = state.settings.bankFeePercent;
  $("setWaWelcome").checked = !!state.settings.waWelcomeEnabled;
  $("setWaPromo").value = state.settings.waPromoMessage;
  renderExpenseCategories();
  $("setMeasureUnit").value = state.settings.measureUnit;
  $("setCommissionBasis").value = state.settings.commissionBasis||"تسليم";
  if($("setQcEnabled")) $("setQcEnabled").checked = !!state.settings.qcEnabled;
  if($("setCuttingCardTemplate")) $("setCuttingCardTemplate").value = state.settings.cuttingCardTemplate||"default";
  $("setLoyEarnRate").value = state.settings.loyaltyEarnRate;
  $("setLoyRedeemRate").value = state.settings.loyaltyRedeemRate;
  $("setLoyMinRedeem").value = state.settings.loyaltyMinRedeem;
  $("setLoySilverThreshold").value = state.settings.loyaltySilverThreshold;
  $("setLoyGoldThreshold").value = state.settings.loyaltyGoldThreshold;
  $("setLoySilverMultiplier").value = state.settings.loyaltySilverMultiplier;
  $("setLoySilverDiscount").value = state.settings.loyaltySilverDiscountPercent;
  $("setLoyGoldMultiplier").value = state.settings.loyaltyGoldMultiplier;
  $("setLoyGoldDiscount").value = state.settings.loyaltyGoldDiscountPercent;
  $("setShopName").value = state.settings.shopName;
  if($("setThemeMode")) $("setThemeMode").value = state.settings.themeMode==="light" ? "light" : "dark";
  $("setShopNumber").value = state.settings.shopNumber;
  $("setCommercialReg").value = state.settings.commercialRegistration;
  $("setMunicipalLicense").value = state.settings.municipalLicense;
  $("setShopAddress").value = state.settings.shopAddress;
  $("setShopPhone").value = state.settings.shopPhone;
  $("setShopLogoPreview").innerHTML = state.settings.shopLogo ? `<img src="${state.settings.shopLogo}" style="max-width:120px;max-height:120px;border-radius:8px;border:1px solid var(--border);">` : `<p class="sub">ما فيه شعار مرفوع بعد.</p>`;
  $("setInvoiceFooter").value = state.settings.invoiceFooterText;
  $("setSaveReminderMinutes").value = state.settings.invoiceSaveReminderMinutes;
  $("setDefaultDeliveryDays").value = state.settings.defaultDeliveryDays;
  $("setCuttingOverdueDays").value = state.settings.cuttingOverdueDays;
  $("setReceiptTerms").value = state.settings.receiptTerms;
  $("setVatEnabled").checked = !!state.settings.vatEnabled;
  $("setEinvoiceEnabled").checked = !!state.settings.einvoiceEnabled;
  $("setVatNumber").value = state.settings.vatNumber;
  $("setShopLegalName").value = state.settings.shopLegalName;
  $("setVatRate").value = state.settings.vatRate;
  $("setPricesIncludeVat").value = state.settings.pricesIncludeVat===false ? "no" : "yes";
  if(!$("dailyDate").value) $("dailyDate").value = todayStr();

  const curInvoices = state.invoices.filter(i=>i.originMonth===state.settings.currentMonth);
  let garCount=0;
  curInvoices.forEach(inv=>{ garCount+=inv.garments.filter(g=>g.status!=="ملغي").length; });
  $("statsGrid").innerHTML = `
    <div class="stat-card count"><div class="lbl">عدد الفواتير (الشهر الحالي)</div><div class="val">${curInvoices.length}</div></div>
    <div class="stat-card count"><div class="lbl">عدد الثياب (الشهر الحالي)</div><div class="val">${garCount}</div></div>`;
  $("statsEmptyHint").style.display = curInvoices.length ? "none" : "";

  renderFixedItems();
  const body=$("invoicesBody"); body.innerHTML="";
  $("emptyState").style.display = curInvoices.length?"none":"block";
  const isAdmin = currentUser && currentUser.role==="مدير";
  curInvoices.forEach(inv=>{
    const s=invoiceSaleTotal(inv), paid=invoicePaid(inv), rem=invoiceRemaining(inv);
    const profitData = invoiceProfitColumnData(inv);
    const tr=document.createElement("tr"); tr.className="invoice-row";
    const profitCell = !profitData ? `<span class="sub">—</span>`
      : `<span class="${profitData.value>=0?'profit-pos':'profit-neg'}">${profitData.value.toFixed(0)} ﷼</span><br><span class="sub" style="font-size:10px;">${profitData.mode==="expected"?"الربح المتوقع (بعد التسليم)":"الربح والخسارة (قبل التسليم)"}</span>`;
    tr.innerHTML = `<td><b>${esc(inv.number)}</b></td><td>${esc(inv.customerName||"—")}</td><td>${inv.date}</td>
      <td>${s.toFixed(0)} ﷼</td><td>${paid.toFixed(0)} ﷼</td><td>${rem.toFixed(0)} ﷼</td>
      <td>${profitCell}</td>
      <td style="white-space:nowrap;">${isAdmin?`<button class="btn btn-ghost btn-sm" style="color:var(--gold-soft);border-color:var(--gold-soft);" onclick="editInvoice('${inv.id}')" title="تعديل الفاتورة">تعديل</button> <button class="btn btn-ghost btn-sm" onclick="createInvoiceReturn('${inv.id}')" title="تسجيل مرتجع">مرتجع</button>`:""}<button class="icon-btn" onclick="printCustomerReceipt('${inv.id}')" title="طباعة فاتورة العميل"><i data-lucide="printer"></i></button><button class="icon-btn" onclick="shareReceiptViaWhatsApp('${inv.id}')" title="إرسال الفاتورة واتساب"><i data-lucide="send"></i></button>${inv.einvoice?`<button class="icon-btn" onclick="showEinvoiceDetails('${inv.id}')" title="بيانات الفوترة الإلكترونية"><i data-lucide="receipt"></i></button>`:""}</td>`;
    body.appendChild(tr);
    const badges = inv.garments.map(g=>{const st=STATUSES.find(x=>x.v===g.status);return `<span class="badge ${st.cls}">${st.label}${esc(g.tailor?" — "+g.tailor:"")}</span>`;}).join(" ");
    const tr2=document.createElement("tr"); tr2.innerHTML=`<td colspan="8" style="padding-top:0;padding-bottom:14px;">${badges}</td>`; body.appendChild(tr2);
  });

  renderClosedReports(); renderGrowthReport(); renderSearch(); renderReturnResponsibleSelect(); renderTailorReportSelector(); renderBroadcastList(); renderSensitiveGate(); renderCustomers(); renderPendingList(); updateFixedShareNote(); renderLegacyItems(); renderBalancesTab(); renderDebtsTab(); renderCustomerDebts(); renderInventoryTab(); renderInventoryValuation(); renderSalesInvoicesList(); refreshSaleLineOptions(); renderAddonsList(); refreshAddonForm(); renderScanTab(); renderPayrollTab(); renderEntitlementPreview(); renderAlterationSettings(); renderAlterationsLog(); renderQcTab(); updateManualCardLabels(); renderCustomShopFields(); renderFabricOrigins(); if($("setPrintOriginOnLabel")) $("setPrintOriginOnLabel").checked = state.settings.printOriginOnLabel; renderOffers(); renderOptionLists(); renderCustomMeasurementFields(); renderOverdueDashboard(); renderOverdueDashboard("dashboardOverdue", true); renderDashboardKPIs(); renderDashboardWorkDistribution(); renderShiftClosingsLog(); renderQuickMenuBar(); renderQuickMenuEditor(); renderReturnsLog(); renderPromoCodesAdmin(); renderAppliedPromoBanner(); renderVouchersTab(); renderTopExpensesReport(); renderVatLedger(); renderProductionTracking(); renderSeasonsList(); renderCustomerNameDatalist("custNameDatalist"); renderCuttingImageEditor(); applyShopBranding(); renderMailTab(); if(currentUser && currentUser.role==="مدير"){ renderUsers(); renderPermissionsEditor(); }
  applyRolePermissions();
  refreshLucideIcons();
}

function renderFixedItems(){
  $("fixedItemsList").innerHTML = state.settings.fixedItems.map((it,i)=>`
    <div class="item-row" style="flex-wrap:wrap;gap:6px;">
      <input type="text" class="edit-fixed-label" data-idx="${i}" value="${esc(it.label)}" style="flex:2;min-width:100px;">
      <input type="number" class="edit-fixed-amount" data-idx="${i}" value="${it.amount}" style="flex:1;min-width:80px;">
      <button class="icon-btn" onclick="saveFixedItemEdit(${i})" title="حفظ التعديل">حفظ</button>
      <button class="icon-btn" onclick="removeFixedItem(${i})" title="حذف">حذف</button>
    </div>`).join("") ||
    `<p class="sub">ما فيه بنود بعد.</p>`;
}
function saveFixedItemEdit(i){
  const label = document.querySelector(`.edit-fixed-label[data-idx="${i}"]`).value.trim();
  const amount = parseFloat(document.querySelector(`.edit-fixed-amount[data-idx="${i}"]`).value)||0;
  if(!label){ showToast("أدخل اسم البند"); return; }
  state.settings.fixedItems[i] = {...state.settings.fixedItems[i], label, amount};
  saveState(); showToast("تم حفظ التعديل");
}
function addFixedItem(){
  const label=$("newItemLabel").value.trim(), amount=parseFloat($("newItemAmount").value)||0;
  if(!label){ showToast("أدخل اسم البند"); return; }
  state.settings.fixedItems.push({id:newId(), label, amount});
  $("newItemLabel").value=""; $("newItemAmount").value="";
  saveState(); renderAll();
}
function removeFixedItem(i){ state.settings.fixedItems.splice(i,1); saveState(); renderAll(); }
function renderCustomShopFields(){
  const el = $("customShopFieldsList");
  if(!el) return;
  el.innerHTML = state.settings.customShopFields.map((f,i)=>`<div class="item-row">
      <span>${esc(f.label)}: ${esc(f.value)}</span>
      <label style="display:flex;align-items:center;gap:4px;font-size:12px;"><input type="checkbox" class="custom-field-show" data-idx="${i}" ${f.showOnInvoice?"checked":""}> يظهر بالفاتورة</label>
      <button class="icon-btn" onclick="removeCustomShopField(${i})">حذف</button>
    </div>`).join("") || `<p class="sub">ما فيه بنود مضافة بعد.</p>`;
  document.querySelectorAll(".custom-field-show").forEach(cb=> cb.addEventListener("change", ()=>{
    state.settings.customShopFields[cb.dataset.idx].showOnInvoice = cb.checked;
    saveState(); showToast("تم التحديث");
  }));
}
function addCustomShopField(){
  const label = $("newCustomFieldLabel").value.trim();
  const value = $("newCustomFieldValue").value.trim();
  if(!label || !value){ showToast("أدخل اسم البند والقيمة"); return; }
  state.settings.customShopFields.push({id:newId(), label, value, showOnInvoice:false});
  $("newCustomFieldLabel").value=""; $("newCustomFieldValue").value="";
  saveState(); renderAll();
  showToast("تمت إضافة البند");
}
function removeCustomShopField(i){ state.settings.customShopFields.splice(i,1); saveState(); renderAll(); }

const ADVISORY_LABELS = {fabric:"الأقمشة", padding:"الحشوات", wages:"أجور الخياطين", embroidery:"التطريز"};
function renderExpenseCategories(){
  const el = $("expenseCategoriesList");
  if(!el) return;
  el.innerHTML = state.expenseCategories.map((c,i)=>{
    const subItemsHtml = (c.subItems||[]).map((s,si)=>`<div class="item-row">
        <span style="flex:1;">${esc(s.label)}</span>
        <button class="icon-btn" onclick="removeExpenseSubItem('${c.id}', ${si})">حذف</button>
      </div>`).join("") || `<p class="sub" style="margin:4px 0;">ما فيه بنود فرعية بعد.</p>`;
    return `<div class="garment-card">
      <div class="item-row"><span>${esc(c.label)}${c.advisoryKey?` — مرتبط بـ${ADVISORY_LABELS[c.advisoryKey]}`:""}</span>
        <button class="icon-btn" onclick="removeExpenseCategory(${i})">حذف التصنيف</button></div>
      <p class="sub" style="margin:8px 0 4px;">البنود الفرعية (اختياري — لتفصيل أكثر بتقارير المصروفات)</p>
      ${subItemsHtml}
      <div class="row-2" style="margin-top:4px;">
        <div class="field" style="margin-bottom:0;"><input type="text" class="new-subitem-input" data-cat="${c.id}" placeholder="مثلاً: صيانة مكيفات"></div>
        <div class="field" style="margin-bottom:0;"><button class="btn btn-ghost btn-sm" onclick="addExpenseSubItem('${c.id}')" style="width:100%;">إضافة بند</button></div>
      </div>
    </div>`;
  }).join("") || `<p class="sub">ما فيه تصنيفات بعد.</p>`;
}
function addExpenseCategory(){
  const label=$("newCatLabel").value.trim(), advisoryKey=$("newCatAdvisory").value||null;
  if(!label){ showToast("أدخل اسم التصنيف"); return; }
  state.expenseCategories.push({id:newId(), label, advisoryKey, subItems:[]});
  $("newCatLabel").value=""; $("newCatAdvisory").value="";
  saveState(); renderAll();
}
function removeExpenseCategory(i){ state.expenseCategories.splice(i,1); saveState(); renderAll(); }
function addExpenseSubItem(catId){
  const cat = state.expenseCategories.find(c=>c.id===catId);
  if(!cat) return;
  const inp = document.querySelector(`.new-subitem-input[data-cat="${catId}"]`);
  const label = inp.value.trim();
  if(!label){ showToast("أدخل اسم البند"); return; }
  if(!cat.subItems) cat.subItems=[];
  cat.subItems.push({id:newId(), label});
  saveState(); renderAll();
  showToast("تمت إضافة البند");
}
function removeExpenseSubItem(catId, subIdx){
  const cat = state.expenseCategories.find(c=>c.id===catId);
  if(!cat || !cat.subItems) return;
  cat.subItems.splice(subIdx,1);
  saveState(); renderAll();
}

// ---------------- addons/services ----------------
function renderAddonsList(){
  const el = $("addonsList");
  if(!el) return;
  if(!state.addonDefs.length){ el.innerHTML = `<p class="sub">ما فيه ملحقات أو خدمات مضافة بعد.</p>`; return; }
  el.innerHTML = state.addonDefs.map((a,i)=>{
    const priceTxt = a.kind==="service" ? `${(a.servicePrice||0).toFixed(0)} ريال` : (()=>{ const c=findItemCard(a.itemCardId); if(!c) return "—"; const unitPrice = c.currentCost*(1+(a.markupPercent||0)/100); return `${unitPrice.toFixed(0)} ريال (${a.qtyPerGarment||1} قطعة/ثوب)${a.markupPercent?` — هامش ${a.markupPercent}%`:""}`; })();
    return `<div class="item-row"><span>${esc(a.name)} — ${a.kind==="service"?"خدمة":"ملحق فعلي"} — ${priceTxt}</span>
      <button class="icon-btn" onclick="removeAddonDef(${i})">حذف</button></div>`;
  }).join("");
}
function refreshAddonForm(){
  $("newAddonCard").innerHTML = state.itemCards.filter(c=>c.type==="addon").map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("") || `<option value="">-- أضف ملحق فعلي من المشتريات أول --</option>`;
}
function addAddonDef(){
  const kind = $("newAddonKind").value;
  const name = $("newAddonName").value.trim();
  if(!name){ showToast("أدخل اسم الملحق أو الخدمة"); return; }
  if(kind==="service"){
    const servicePrice = parseFloat($("newAddonServicePrice").value)||0;
    state.addonDefs.push({id:newId(), name, kind:"service", servicePrice, active:true});
  } else {
    const itemCardId = $("newAddonCard").value;
    if(!itemCardId){ showToast("اختر صنف من المخزون (أضف ملحق فعلي من المشتريات أول)"); return; }
    const qtyPerGarment = parseFloat($("newAddonQty").value)||1;
    const markupPercent = parseFloat($("newAddonMarkup").value)||0;
    state.addonDefs.push({id:newId(), name, kind:"physical", itemCardId, qtyPerGarment, markupPercent, active:true});
  }
  $("newAddonName").value=""; $("newAddonServicePrice").value=""; $("newAddonMarkup").value="0";
  saveState(); renderAll();
  showToast("تمت إضافة الملحق/الخدمة");
}
function removeAddonDef(i){ state.addonDefs.splice(i,1); saveState(); renderAll(); }

// ---------------- alterations (garments returned for adjustment) ----------------
function renderSimpleStringList(containerId, stateKey, removeFnName, emptyMsg){
  const el = $(containerId);
  if(!el) return;
  const list = state[stateKey];
  el.innerHTML = list.map((v,i)=>`<div class="item-row" style="gap:6px;">
    <input type="text" class="edit-simple-str" data-key="${stateKey}" data-idx="${i}" value="${esc(v)}" style="flex:1;">
    <button class="icon-btn" onclick="saveSimpleStringEdit('${stateKey}', ${i})" title="حفظ التعديل">حفظ</button>
    <button class="icon-btn" onclick="${removeFnName}(${i})" title="حذف">حذف</button>
  </div>`).join("") || `<p class="sub">${emptyMsg}</p>`;
}
function saveSimpleStringEdit(stateKey, i){
  const inp = document.querySelector(`.edit-simple-str[data-key="${stateKey}"][data-idx="${i}"]`);
  const val = inp.value.trim();
  if(!val){ showToast("القيمة ما تقدر تكون فاضية"); return; }
  state[stateKey][i] = val;
  saveState(); showToast("تم حفظ التعديل");
}
function renderAlterationSettings(){
  const rEl = $("alterReasonsList"), pEl = $("alterResponsiblesList");
  if(!rEl) return;
  renderSimpleStringList("alterReasonsList", "alterationReasons", "removeAlterReason", "ما فيه أسباب مضافة بعد.");
  renderSimpleStringList("alterResponsiblesList", "alterationResponsibles", "removeAlterResponsible", "ما فيه خيارات مضافة بعد.");
}
function addAlterReason(){
  const v = $("newAlterReason").value.trim();
  if(!v){ showToast("أدخل سبب التعديل"); return; }
  state.alterationReasons.push(v); $("newAlterReason").value="";
  saveState(); renderAll();
}
function removeAlterReason(i){ state.alterationReasons.splice(i,1); saveState(); renderAll(); }
function addAlterResponsible(){
  const v = $("newAlterResponsible").value.trim();
  if(!v){ showToast("أدخل اسم المتسبب"); return; }
  state.alterationResponsibles.push(v); $("newAlterResponsible").value="";
  saveState(); renderAll();
}
function removeAlterResponsible(i){ state.alterationResponsibles.splice(i,1); saveState(); renderAll(); }
function renderFabricOrigins(){
  renderSimpleStringList("fabricOriginsList", "fabricOrigins", "removeFabricOrigin", "ما فيه بلدان مضافة بعد.");
}
function addFabricOrigin(){
  const v = $("newFabricOrigin").value.trim();
  if(!v){ showToast("أدخل اسم البلد"); return; }
  if(state.fabricOrigins.includes(v)){ showToast("هذا البلد مضاف مسبقاً"); return; }
  state.fabricOrigins.push(v); $("newFabricOrigin").value="";
  saveState(); renderAll();
}
function removeFabricOrigin(i){ state.fabricOrigins.splice(i,1); saveState(); renderAll(); }

// ---------------- measurement option lists (with images) ----------------
const OPTION_LISTS = [
  {key:"garmentTypes", label:"أنواع الثوب (سعودي/قطري/كويتي...)"},
  {key:"collarTypes", label:"أنواع الياقة"},
  {key:"cufflinkTypes", label:"أنواع الكبك"},
  {key:"pocketSewTypes", label:"أنواع خياطة الجيب الجانبي"},
  {key:"chestPocketTypes", label:"أنواع جيب الصدر"},
  {key:"fillingTypes", label:"أنواع الحشوة"},
  {key:"jabzourTypes", label:"أنواع الجبزور"},
  {key:"modelTypes", label:"أنواع الموديل"},
];
function renderOptionLists(){
  const el = $("optionListsContainer");
  if(!el) return;
  el.innerHTML = OPTION_LISTS.map(ol=>{
    const items = state[ol.key]||[];
    const itemsHtml = items.map((it,i)=>`<div class="item-row">
        ${it.image?`<img src="${it.image}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;margin-left:8px;">`:""}
        <span style="flex-shrink:0;">${esc(it.code)} -</span>
        <input type="text" class="opt-rename-input" data-list="${ol.key}" data-idx="${i}" value="${esc(it.label)}" style="flex:1;min-width:0;">
        <button class="icon-btn" onclick="removeOptionListItem('${ol.key}', ${i})">حذف</button>
      </div>`).join("") || `<p class="sub">ما فيه خيارات مضافة بعد.</p>`;
    return `<div class="garment-card">
      <span class="tag">${ol.label}</span>
      <div style="margin-top:8px;">${itemsHtml}</div>
      <div class="row-3" style="margin-top:8px;">
        <div class="field"><label>الكود</label><input type="text" class="opt-code" data-list="${ol.key}" placeholder="مثلاً: 008"></div>
        <div class="field"><label>الاسم</label><input type="text" class="opt-label" data-list="${ol.key}" placeholder="اسم الخيار"></div>
        <div class="field"><label>صورة (اختياري)</label><input type="file" class="opt-image" data-list="${ol.key}" accept="image/*"></div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="addOptionListItem('${ol.key}')">إضافة خيار</button>
    </div>`;
  }).join("");
  document.querySelectorAll(".opt-rename-input").forEach(inp=> inp.addEventListener("change", ()=>{
    const list = state[inp.dataset.list];
    const item = list && list[parseInt(inp.dataset.idx)];
    if(!item) return;
    const newLabel = inp.value.trim();
    if(!newLabel){ inp.value = item.label; showToast("الاسم ما يصير فاضي"); return; }
    item.label = newLabel;
    saveState();
    showToast("تم تحديث الاسم");
  }));
}
function addOptionListItem(listKey){
  const codeInp = document.querySelector(`.opt-code[data-list="${listKey}"]`);
  const labelInp = document.querySelector(`.opt-label[data-list="${listKey}"]`);
  const imageInp = document.querySelector(`.opt-image[data-list="${listKey}"]`);
  const code = codeInp.value.trim(), label = labelInp.value.trim();
  if(!code || !label){ showToast("أدخل الكود والاسم"); return; }
  if(!state[listKey]) state[listKey]=[];
  if(state[listKey].some(o=>o.code===code)){ showToast("هذا الكود مستخدم مسبقاً بنفس القائمة"); return; }
  const file = imageInp.files[0];
  function finish(imageDataUrl){
    state[listKey].push({code, label, image: imageDataUrl||""});
    codeInp.value=""; labelInp.value=""; imageInp.value="";
    saveState(); renderAll();
    showToast("تمت إضافة الخيار");
  }
  if(file){
    if(file.size > 1024*1024){ showToast("حجم الصورة كبير — اختر أقل من 1 ميجابايت"); return; }
    const reader = new FileReader();
    reader.onload = ()=> finish(reader.result);
    reader.readAsDataURL(file);
  } else finish(null);
}
function removeOptionListItem(listKey, i){ state[listKey].splice(i,1); saveState(); renderAll(); }

// ---------------- custom flat measurement fields (extend the built-in MEASUREMENT_FIELDS list) ----------------
function renderCustomMeasurementFields(){
  const el = $("customMeasurementFieldsList");
  if(!el) return;
  el.innerHTML = (state.customMeasurementFields||[]).map((f,i)=>`<div class="item-row">
      <span style="flex:1;">${esc(f.label)}</span>
      <button class="icon-btn" onclick="removeCustomMeasurementField(${i})">حذف</button>
    </div>`).join("") || `<p class="sub">ما فيه مقاسات إضافية بعد.</p>`;
}
function addCustomMeasurementField(){
  const inp = $("newCustomMeasField");
  const label = inp.value.trim();
  if(!label){ showToast("أدخل اسم المقاس"); return; }
  if(!state.customMeasurementFields) state.customMeasurementFields=[];
  const key = "custom_"+Date.now();
  state.customMeasurementFields.push({key, label});
  inp.value="";
  saveState(); renderAll();
  showToast("تمت إضافة المقاس");
}
function removeCustomMeasurementField(i){ state.customMeasurementFields.splice(i,1); saveState(); renderAll(); }

// ---------------- promotional offers/bundles ----------------
function renderOffers(){
  const el = $("offersList");
  if(!el) return;
  el.innerHTML = state.offers.map((o,i)=>{
    const detail = o.type==="quantity_discount"
      ? `${o.requiredQty} ثياب (${o.matchBy==="origin"?"صناعة: "+esc(o.matchValue):"صنف: "+esc(findItemCard(o.matchValue)?.name||"—")}) — أقلهم سعراً بخصم ${o.discountPercent}%`
      : `عند ${o.minGarments}+ ثوب بالفاتورة — هدية: ${o.giftQty} × ${esc(findItemCard(o.giftItemCard)?.name||"—")}`;
    return `<div class="item-row"><span>${o.active?"مفعّل":"متوقف"} <b>${esc(o.name)}</b> — ${detail}</span>
      <button class="icon-btn" onclick="toggleOfferActive(${i})">${o.active?"⏸":"▶"}</button>
      <button class="icon-btn" onclick="removeOffer(${i})">حذف</button></div>`;
  }).join("") || `<p class="sub">ما فيه باقات مضافة بعد.</p>`;
  // populate dependent dropdowns
  const matchBy = $("offerMatchBy")?.value;
  if($("offerMatchValue")){
    if(matchBy==="origin") $("offerMatchValue").innerHTML = state.fabricOrigins.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("");
    else $("offerMatchValue").innerHTML = state.itemCards.filter(c=>c.type==="fabric" && c.active).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("") || `<option value="">-- ما فيه أصناف قماش --</option>`;
  }
  if($("offerGiftItem")) $("offerGiftItem").innerHTML = state.itemCards.filter(c=>c.active).map(c=>`<option value="${c.id}">${esc(c.name)} (${c.type==="fabric"?"قماش":c.type==="product"?"منتج":"ملحق"})</option>`).join("") || `<option value="">-- ما فيه أصناف --</option>`;
}
function addOffer(){
  const name = $("newOfferName").value.trim();
  const type = $("newOfferType").value;
  if(!name){ showToast("أدخل اسم الباقة"); return; }
  if(type==="quantity_discount"){
    const matchBy = $("offerMatchBy").value;
    const matchValue = $("offerMatchValue").value;
    const requiredQty = parseInt($("offerRequiredQty").value)||0;
    const discountPercent = parseFloat($("offerDiscountPercent").value)||0;
    if(!matchValue){ showToast("اختر القيمة (الصناعة أو الصنف)"); return; }
    if(requiredQty<2){ showToast("العدد المطلوب لازم يكون 2 أو أكثر"); return; }
    if(discountPercent<=0 || discountPercent>100){ showToast("أدخل نسبة خصم صحيحة"); return; }
    state.offers.push({id:newId(), name, type, matchBy, matchValue, requiredQty, discountPercent, active:true});
  } else {
    const minGarments = parseInt($("offerMinGarments").value)||1;
    const giftItemCard = $("offerGiftItem").value;
    const giftQty = parseInt($("offerGiftQty").value)||1;
    if(!giftItemCard){ showToast("اختر الصنف الهدية"); return; }
    state.offers.push({id:newId(), name, type, minGarments, giftItemCard, giftQty, active:true});
  }
  $("newOfferName").value="";
  saveState(); renderAll();
  showToast("تم إنشاء الباقة");
}
function toggleOfferActive(i){ state.offers[i].active = !state.offers[i].active; saveState(); renderAll(); }
function removeOffer(i){ state.offers.splice(i,1); saveState(); renderAll(); }
// find, among garments matching an offer's condition, the id of the cheapest one
function findCheapestMatchingGarment(garments, offer){
  const matching = garments.map((g,idx)=>({g,idx})).filter(({g})=>{
    if(g.status==="ملغي" || !g.itemCardId) return false;
    const card = findItemCard(g.itemCardId);
    if(!card) return false;
    if(offer.matchBy==="origin") return card.origin===offer.matchValue;
    return card.id===offer.matchValue;
  });
  if(matching.length < offer.requiredQty) return null;
  matching.sort((a,b)=> garmentSalePrice(a.g)-garmentSalePrice(b.g));
  return matching[0].idx;
}

function searchInvoiceForAlteration(){
  const num = $("alterInvNumber").value.trim();
  const area = $("alterArea");
  if(!num){ area.innerHTML=""; return; }
  const inv = state.invoices.find(i=>i.number===num);
  if(!inv){ area.innerHTML = `<p class="sub">ما فيه فاتورة بهذا الرقم.</p>`; return; }
  area.innerHTML = `<div class="stitch"></div><h3 style="font-size:14px;margin:0 0 10px;">فاتورة ${esc(inv.number)} — ${esc(inv.customerName||"")}</h3>` +
    inv.garments.map((g,i)=>{
      const pending = state.alterations.find(a=>a.invoiceId===inv.id && a.garmentIndex===i && a.status==="pending");
      const notDelivered = g.status!=="تسليم";
      return `<div class="garment-card">
        <span class="tag">ثوب ${i+1} — ${esc(g.fabricType)}</span>
        <p class="sub" style="margin:6px 0;">الخياط: ${esc(g.tailor||"—")} — الحالة: ${STATUSES.find(s=>s.v===g.status)?.label||g.status}</p>
        ${notDelivered ? `<p class="locked-note">هذا الثوب لسا ما انسلّم للعميل — التعديل يخص الثياب المُسلَّمة بس.</p>` : pending ? `<p style="color:var(--gold-soft);font-weight:700;">معاد للتعديل حالياً — بانتظار الخياط (${esc(pending.reason)}) — رقم التعديل: ${pending.alterationNumber}</p><button class="btn btn-ghost btn-sm" onclick="printCuttingCard('${inv.id}', ${i})">عرض كرت المقاسات</button>` : `
        <button class="btn btn-ghost btn-sm" onclick="printCuttingCard('${inv.id}', ${i})" style="margin-bottom:8px;">عرض كرت المقاسات الأصلي</button>
        <div class="row-2">
          <div class="field"><label>سبب التعديل</label><select class="alter-reason" data-idx="${i}">${state.alterationReasons.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("")||`<option value="">-- أضف أسباب من الإعدادات --</option>`}</select></div>
          <div class="field"><label>المتسبب</label><select class="alter-responsible" data-idx="${i}">${state.alterationResponsibles.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>ملاحظات التعديل / المقاسات المطلوب تغييرها</label><input type="text" class="alter-notes" data-idx="${i}" placeholder="مثلاً: تقصير الطول 2 سم"></div>
        <button class="btn btn-gold btn-sm" onclick="submitAlteration('${inv.id}', ${i})">تسجيل الاستلام للتعديل</button>`}
      </div>`;
    }).join("");
}
function submitAlteration(invId, idx){
  const inv = state.invoices.find(i=>i.id===invId); if(!inv) return;
  const g = inv.garments[idx];
  if(!g || g.status!=="تسليم"){ showToast("هذا الثوب لسا ما انسلّم — التعديل يخص الثياب المُسلَّمة بس"); return; }
  const reasonSel = document.querySelector(`.alter-reason[data-idx="${idx}"]`);
  const respSel = document.querySelector(`.alter-responsible[data-idx="${idx}"]`);
  const notesInp = document.querySelector(`.alter-notes[data-idx="${idx}"]`);
  const reason = reasonSel ? reasonSel.value : "";
  const responsible = respSel ? respSel.value : "";
  if(!reason){ showToast("اختر سبب التعديل (أضف أسباب من الإعدادات لو القائمة فاضية)"); return; }
  if(!responsible){ showToast("اختر المتسبب"); return; }
  state.alterations.push({
    id: newId(), alterationNumber: state.settings.nextAlterationNumber, invoiceId: invId, invoiceNumber: inv.number, garmentIndex: idx,
    reason, responsible, notes: notesInp?notesInp.value.trim():"",
    status:"pending", dateReceived: todayStr(), recordedBy: currentUser.username, dateCompleted: null,
  });
  state.settings.nextAlterationNumber++;
  saveState(); renderAll();
  showToast("تم تسجيل استلام الثوب للتعديل");
  searchInvoiceForAlteration();
}
function renderAlterationsLog(){
  const el = $("alterationsLog");
  if(!el) return;
  const query = ($("alterLogSearch")?.value||"").trim().toLowerCase();
  let rows = state.alterations.slice().reverse();
  if(query){
    rows = rows.filter(a=>{
      const inv = state.invoices.find(i=>i.id===a.invoiceId);
      const garmentTailor = inv && inv.garments[a.garmentIndex] ? (inv.garments[a.garmentIndex].tailor||"") : "";
      return a.responsible.toLowerCase().includes(query) || garmentTailor.toLowerCase().includes(query);
    });
  }
  if(!rows.length){ el.innerHTML = `<p class="sub">${query?"ما فيه نتائج مطابقة.":"ما فيه ثياب معادة للتعديل مسجّلة بعد."}</p>`; return; }
  el.innerHTML = rows.map(a=>{
    const inv = state.invoices.find(i=>i.id===a.invoiceId);
    const garmentTailor = inv && inv.garments[a.garmentIndex] ? (inv.garments[a.garmentIndex].tailor||"—") : "—";
    const statusTxt = a.status==="pending" ? `<span style="color:var(--gold-soft);">بانتظار الخياط</span>` : `<span style="color:var(--profit);">تم — ${a.dateCompleted}</span>`;
    return `<div class="garment-card"><span class="tag">تعديل #${a.alterationNumber||"—"} — فاتورة ${a.invoiceNumber} — ثوب ${a.garmentIndex+1}</span>
      <p class="sub" style="margin:6px 0;">السبب: ${esc(a.reason)} — المتسبب: ${esc(a.responsible)} — الخياط الأصلي: ${esc(garmentTailor)} — استُلم بتاريخ ${a.dateReceived}</p>
      ${a.notes?`<p class="sub">ملاحظات: ${esc(a.notes)}</p>`:""}
      <p>${statusTxt}</p>
      ${inv ? `<button class="btn btn-ghost btn-sm" onclick="printCuttingCard('${inv.id}', ${a.garmentIndex})">عرض كرت المقاسات</button>` : ""}
    </div>`;
  }).join("");
}

function addLegacyItem(){
  const name = $("legName").value.trim();
  const mobile = $("legMobile").value.trim();
  const desc = $("legDesc").value.trim();
  const count = parseInt($("legCount").value)||1;
  const remaining = parseFloat($("legRemaining").value)||0;
  const notes = $("legNotes").value.trim();
  if(!name){ showToast("أدخل اسم العميل"); return; }
  if(!mobile || !/^[0-9]{10}$/.test(mobile)){ showToast("رقم الجوال لازم يكون 10 أرقام بالضبط"); return; }
  if(!desc){ showToast("أدخل وصف القطعة"); return; }
  state.legacyItems.push({id:newId(), name, mobile, desc, count, deliveredCount:0, remaining, notes, status:"جاهز", addedDate:todayStr(), deliveredDate:null});
  saveState(); renderAll();
  $("legName").value=""; $("legMobile").value=""; $("legDesc").value=""; $("legCount").value=""; $("legRemaining").value=""; $("legNotes").value="";
  showToast("تمت الإضافة للجرد الافتتاحي");
}
let legacyDeliverTargetId = null;
function openLegacyDeliverModal(id){
  const item = state.legacyItems.find(x=>x.id===id);
  if(!item) return;
  const remainingCount = item.count - (item.deliveredCount||0);
  if(remainingCount<=0) return;
  legacyDeliverTargetId = id;
  $("legDeliverItemLabel").textContent = `${item.name} — ${item.desc} (متبقي ${remainingCount} من ${item.count})`;
  $("legDeliverQtyInput").value = remainingCount;
  $("legDeliverQtyInput").max = remainingCount;
  $("legDeliverAmountInput").value = item.remaining>0 ? item.remaining : 0;
  $("legacyDeliverModalOverlay").classList.remove("hidden");
}
function closeLegacyDeliverModal(){ $("legacyDeliverModalOverlay").classList.add("hidden"); legacyDeliverTargetId=null; }
async function confirmLegacyDeliver(){
  const item = state.legacyItems.find(x=>x.id===legacyDeliverTargetId);
  if(!item) return;
  const remainingCount = item.count - (item.deliveredCount||0);
  const qty = parseInt($("legDeliverQtyInput").value)||0;
  const amountReceived = parseFloat($("legDeliverAmountInput").value)||0;
  if(qty<=0 || qty>remainingCount){ showToast(`أدخل كمية صحيحة (1 إلى ${remainingCount})`); return; }
  if(amountReceived>item.remaining+0.01){ showToast(`المبلغ أكبر من المتبقي (${item.remaining.toFixed(0)} ريال)`); return; }
  const newRemaining = Math.max(0, item.remaining - amountReceived);
  const isAdmin = currentUser.role==="مدير";
  if(newRemaining>0.01){
    if(!isAdmin){ showToast(`لازم تحصّل كامل المبلغ المتبقي (${item.remaining.toFixed(0)} ريال) قبل التسليم`); return; }
    closeLegacyDeliverModal(); // close first — two modal-overlay elements stacking at once makes the nested confirm unclickable
    if(!await showConfirm(`بعد استلام ${amountReceived.toFixed(0)} ريال، بيفضل متبقي ${newRemaining.toFixed(0)} ريال. تسليم بدين كمدير؟`)) return;
  }
  const snapshot = JSON.parse(JSON.stringify(state));
  item.remaining = newRemaining;
  item.deliveredCount = (item.deliveredCount||0) + qty;
  item.lastDeliveryDate = todayStr();
  if(amountReceived>0.01){
    state.legacyPayments.push({id:newId(), itemId:item.id, amount:amountReceived, date:todayStr(), recordedBy:currentUser.username});
    applyPaymentToBalances({cash:amountReceived, network:0}); // this screen has no cash/network split in its UI — treated as cash, same as the amount was previously tracked in reports but never actually credited to any box
  }
  if(item.deliveredCount>=item.count){ item.status="تم التسليم"; item.deliveredDate=todayStr(); }
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("legacy_item_delivered", {itemName:item.name, qty, amountReceived});
  closeLegacyDeliverModal();
  showToast(item.status==="تم التسليم" ? "تم تسليم كامل القطع" : `تم تسليم ${qty} — متبقي ${item.count-item.deliveredCount}`);
}
function renderLegacyItems(){
  const pending = state.legacyItems.filter(x=>x.status!=="تم التسليم");
  const tbody=$("legacyBody");
  tbody.innerHTML = state.legacyItems.slice().reverse().map(x=>{
    const remainingCount = x.count - (x.deliveredCount||0);
    return `<tr>
    <td>${esc(x.name)}</td><td>${esc(x.mobile)}</td><td>${esc(x.desc)}</td><td>${x.deliveredCount||0} / ${x.count}</td><td>${x.remaining?x.remaining.toFixed(0)+" ﷼":"—"}</td>
    <td><span class="badge ${x.status==="تم التسليم"?"b-done":"b-new"}">${x.status}</span></td>
    <td>${x.status!=="تم التسليم"?`<button class="btn btn-ghost btn-sm" onclick="openLegacyDeliverModal('${x.id}')">تسليم</button>`:""}</td>
  </tr>`;}).join("");
  $("legacyEmptyState").style.display = state.legacyItems.length?"none":"block";
}
function typeLabel(t){ return t==="cash"?"كاش":"شبكة"; }

// ---------------- quality check (optional, settings → finance) ----------------
// When enabled, a garment the tailor marked "تم التفصيل" only becomes "جاهز" after passing the check.
// A failed check sends it back to the SAME tailor (status back to قص) with the reason and who's
// responsible recorded; the tailor re-scans it as "تم التفصيل" once fixed and it's checked again.
function qcAwaitingGarments(){
  const rows = [];
  state.invoices.forEach(inv=> inv.garments.forEach((g,idx)=>{ if(g.status==="تفصيل") rows.push({inv, g, idx}); }));
  return rows;
}
function loadQcInvoice(num){
  const wrap = $("qcGarments");
  if(!num){ showToast("أدخل رقم الفاتورة"); return; }
  const inv = state.invoices.find(i=>i.number===num);
  if(!inv){ wrap.innerHTML = ""; showToast("ما فيه فاتورة بهذا الرقم"); return; }
  const reasons = state.alterationReasons||[];
  const people = state.users.map(u=>u.username);
  const rows = inv.garments.map((g,idx)=>{
    const st = STATUSES.find(s=>s.v===g.status)?.label || g.status;
    const head = `<span class="tag">ثوب ${idx+1} — ${esc(g.fabricType||"—")} (${esc(g.category||"")}) — الخياط: ${esc(g.tailor||"—")}</span>`;
    if(g.status!=="تفصيل") return `<div class="garment-card">${head}<p class="sub" style="margin:6px 0 0;">الحالة: ${st}${g.qcReturnedTo?` — راجع للخياط ${esc(g.qcReturnedTo)} للإصلاح`:""}${g.qcPassedDate?` — اجتاز الفحص ${g.qcPassedDate}`:""}</p></div>`;
    return `<div class="garment-card">${head}
      <p class="sub" style="margin:6px 0;">ينتظر الفحص${g.qcRejections?` — مرفوض سابقاً ${g.qcRejections} مرة وتم إصلاحه`:""}</p>
      <div class="actions-row" style="margin-top:0;"><button class="btn btn-gold btn-sm" onclick="qcPass('${inv.id}', ${idx})">✅ اجتاز الفحص — جاهز</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qcRejectForm${idx}').style.display=''">❌ رفض وإرجاع للخياط</button></div>
      <div id="qcRejectForm${idx}" style="display:none;margin-top:8px;">
        <div class="row-2">
          <div class="field"><label>سبب الرفض</label>${reasons.length ? `<select class="qc-reason" data-idx="${idx}"><option value="">-- اختر --</option>${reasons.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select>` : `<input type="text" class="qc-reason" data-idx="${idx}" placeholder="مثلاً: خياطة الكم غير مستوية">`}</div>
          <div class="field"><label>المتسبّب</label><select class="qc-responsible" data-idx="${idx}">${people.map(u=>`<option value="${esc(u)}" ${u===g.tailor?"selected":""}>${esc(u)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>ملاحظة للخياط (اختياري)</label><input type="text" class="qc-notes" data-idx="${idx}"></div>
        <button class="btn btn-danger btn-sm" onclick="qcReject('${inv.id}', ${idx})">تأكيد الرفض — يرجع للخياط ${esc(g.tailor||"")}</button>
      </div></div>`;
  }).join("");
  wrap.innerHTML = `<p class="sub" style="margin:0 0 8px;">فاتورة ${esc(inv.number)} — ${esc(inv.customerName||"—")}</p>` + rows;
}
async function qcPass(invId, idx){
  if(!state.settings.qcEnabled){ showToast("فحص الجودة غير مفعّل"); return; }
  const inv = state.invoices.find(i=>i.id===invId); const g = inv && inv.garments[idx];
  if(!g || g.status!=="تفصيل"){ showToast("هذا الثوب ما عاد ينتظر الفحص"); loadQcInvoice(inv?inv.number:""); return; }
  const waPopup = openReadyWaPopup(inv);
  const snapshot = JSON.parse(JSON.stringify(state));
  g.status = "جاهز";
  if(!g.readyDate) g.readyDate = todayStr();
  if(!g.qcPassedDate) g.qcPassedDate = todayStr(); // first pass only — a garment's wage date never moves again
  g.qcBy = currentUser.username;
  state.qcLog.push({id:newId(), date:todayStr(), invoiceId:inv.id, invoiceNumber:inv.number, garmentIndex:idx, tailor:g.tailor||"", result:"pass", by:currentUser.username, afterRepair:!!g.qcRejections});
  if(!await saveStateWithRollback(snapshot)){ if(waPopup) waPopup.close(); return; }
  logAudit("qc_passed", {invoiceNumber:inv.number, garmentIdx:idx, tailor:g.tailor||""});
  showToast(`ثوب ${idx+1} اجتاز الفحص وصار جاهز`);
  finishReadyWaPopup(waPopup, "qcWaReadyBanner", inv);
  loadQcInvoice(inv.number);
}
async function qcReject(invId, idx){
  if(!state.settings.qcEnabled){ showToast("فحص الجودة غير مفعّل"); return; }
  const inv = state.invoices.find(i=>i.id===invId); const g = inv && inv.garments[idx];
  if(!g || g.status!=="تفصيل"){ showToast("هذا الثوب ما عاد ينتظر الفحص"); loadQcInvoice(inv?inv.number:""); return; }
  const reason = (document.querySelector(`.qc-reason[data-idx="${idx}"]`)?.value||"").trim();
  const responsible = document.querySelector(`.qc-responsible[data-idx="${idx}"]`)?.value||"";
  const notes = (document.querySelector(`.qc-notes[data-idx="${idx}"]`)?.value||"").trim();
  if(!reason){ showToast("اختر أو اكتب سبب الرفض"); return; }
  if(!g.tailor){ showToast("هذا الثوب ما عليه خياط مسجّل — ما يمكن إرجاعه"); return; }
  const snapshot = JSON.parse(JSON.stringify(state));
  g.status = "قص";                     // back on the tailor's bench
  g.qcReturnedTo = g.tailor;           // only this tailor can re-scan it as "تم التفصيل"
  g.qcRejections = (g.qcRejections||0) + 1;
  if(g.wagePaidOut && !g.wagePaidMonth) g.wagePaidMonth = "سابق"; // already paid before this check existed — never pay again
  state.qcLog.push({id:newId(), date:todayStr(), invoiceId:inv.id, invoiceNumber:inv.number, garmentIndex:idx, tailor:g.tailor, result:"reject", reason, responsible, notes, by:currentUser.username});
  if(!await saveStateWithRollback(snapshot)) return;
  logAudit("qc_rejected", {invoiceNumber:inv.number, garmentIdx:idx, tailor:g.tailor, reason, responsible});
  showToast(`تم رفض ثوب ${idx+1} وإرجاعه للخياط ${g.tailor}`);
  loadQcInvoice(inv.number);
}
function renderQcTab(){
  if(!$("qcQueue") || !currentUser) return;
  const on = !!state.settings.qcEnabled;
  $("qcDisabledNote").style.display = on ? "none" : "";
  $("qcWorkArea").style.display = on ? "" : "none";
  if(!on) return;
  const waiting = qcAwaitingGarments();
  $("qcQueue").innerHTML = waiting.length ? `<div class="table-wrap"><table><thead><tr><th>الفاتورة</th><th>الثوب</th><th>الخياط</th><th>تم التفصيل</th><th></th></tr></thead><tbody>${
    waiting.map(({inv,g,idx})=>`<tr><td>${esc(inv.number)}</td><td>${idx+1} — ${esc(g.fabricType||"")}${g.qcRejections?` <span style="color:var(--gold-soft);">(بعد إصلاح)</span>`:""}</td><td>${esc(g.tailor||"—")}</td><td>${g.tailorCompletedDate||"—"}</td><td><button class="btn btn-ghost btn-sm" onclick="document.getElementById('qcInvNumber').value='${esc(inv.number)}'; loadQcInvoice('${esc(inv.number)}');">فحص</button></td></tr>`).join("")
  }</tbody></table></div>` : `<p class="sub">ما فيه ثياب تنتظر الفحص.</p>`;
  // per-tailor quality for the current month: garments checked, passed first time, rejections and top reason
  const month = todayStr().slice(0,7);
  const monthLog = state.qcLog.filter(l=>(l.date||"").slice(0,7)===month);
  const byTailor = {};
  monthLog.forEach(l=>{
    const t = byTailor[l.tailor||"—"] || (byTailor[l.tailor||"—"] = {passFirst:0, passAfterRepair:0, rejects:0, reasons:{}});
    if(l.result==="pass"){ if(l.afterRepair) t.passAfterRepair++; else t.passFirst++; }
    else { t.rejects++; t.reasons[l.reason] = (t.reasons[l.reason]||0)+1; }
  });
  const tailors = Object.entries(byTailor);
  $("qcTailorStats").innerHTML = tailors.length ? `<div class="table-wrap"><table><thead><tr><th>الخياط</th><th>اجتاز من أول مرة</th><th>اجتاز بعد إصلاح</th><th>مرات الرفض</th><th>نسبة الجودة</th><th>أكثر سبب رفض</th></tr></thead><tbody>${
    tailors.map(([name,t])=>{
      const passed = t.passFirst + t.passAfterRepair;
      const rate = passed ? Math.round(t.passFirst/passed*100) : 0;
      const top = Object.entries(t.reasons).sort((a,b)=>b[1]-a[1])[0];
      return `<tr><td>${esc(name)}</td><td>${t.passFirst}</td><td>${t.passAfterRepair}</td><td>${t.rejects}</td><td>${passed?rate+"%":"—"}</td><td>${top?`${esc(top[0])} (${top[1]})`:"—"}</td></tr>`;
    }).join("")
  }</tbody></table></div><p class="sub" style="margin:6px 0 0;">نسبة الجودة = الثياب اللي اجتازت من أول مرة ÷ كل الثياب اللي اجتازت هذا الشهر.</p>` : `<p class="sub">ما فيه عمليات فحص هذا الشهر بعد.</p>`;
  const recent = state.qcLog.slice().reverse().slice(0,20);
  $("qcLogView").innerHTML = recent.length ? `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>الخياط</th><th>النتيجة</th><th>السبب / المتسبّب</th><th>الفاحص</th></tr></thead><tbody>${
    recent.map(l=>`<tr><td>${l.date}</td><td>${esc(l.invoiceNumber)} (ثوب ${l.garmentIndex+1})</td><td>${esc(l.tailor||"—")}</td><td>${l.result==="pass"?`<span style="color:var(--profit);font-weight:700;">اجتاز</span>`:`<span style="color:var(--loss);font-weight:700;">مرفوض</span>`}</td><td>${l.result==="reject"?`${esc(l.reason)} — ${esc(l.responsible||"")}${l.notes?` (${esc(l.notes)})`:""}`:"—"}</td><td>${esc(l.by)}</td></tr>`).join("")
  }</tbody></table></div>` : `<p class="sub">ما فيه عمليات فحص بعد.</p>`;
}
// the tailor's own list of garments sent back to them for repair
function renderTailorQcReturns(){
  const el = $("tailorQcReturns");
  if(!el || !currentUser) return;
  const mine = [];
  state.invoices.forEach(inv=> inv.garments.forEach((g,idx)=>{ if(g.qcReturnedTo===currentUser.username && g.status!=="ملغي") mine.push({inv,g,idx}); }));
  if(!mine.length){ el.innerHTML = ""; return; }
  el.innerHTML = `<div class="remaining-box" style="border-color:var(--loss);flex-direction:column;align-items:stretch;margin-top:10px;">
    <b style="color:var(--loss);">🔁 ثياب راجعة لك من فحص الجودة للإصلاح (${mine.length})</b>
    ${mine.map(({inv,g,idx})=>{ const last = state.qcLog.slice().reverse().find(l=>l.invoiceId===inv.id && l.garmentIndex===idx && l.result==="reject");
      return `<p class="sub" style="margin:6px 0 0;">فاتورة ${esc(inv.number)} — ثوب ${idx+1}${last?`: ${esc(last.reason)}${last.notes?` (${esc(last.notes)})`:""}`:""} — بعد الإصلاح امسحها "تم التفصيل" مرة ثانية</p>`; }).join("")}
  </div>`;
}
