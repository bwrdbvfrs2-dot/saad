function ensureUserBoxes(username){
  if(!state.cashBoxes.some(b=>b.owner===username && b.type==="cash" && b.isMain)){
    state.cashBoxes.push({id:"main-"+username+"-cash-"+Date.now(), name:"الصندوق الرئيسي", owner:username, type:"cash", isMain:true, balance:0, openingBalance:0});
  }
  if(!state.cashBoxes.some(b=>b.owner===username && b.type==="network" && b.isMain)){
    state.cashBoxes.push({id:"main-"+username+"-network-"+Date.now(), name:"صندوق الشبكة", owner:username, type:"network", isMain:true, balance:0, openingBalance:0});
  }
}
let typeLibrariesReseeded = false;
let addonSnapshotsBackfilled = false;
function normalizeState(){
  if(!state.customMeasurementFields) state.customMeasurementFields=[];
  if(!state.openingBalanceAdjustments) state.openingBalanceAdjustments=[];
  if(!state.openingBalanceEditRequests) state.openingBalanceEditRequests=[];
  // MEASUREMENT_FIELDS is a shared array read across the app — keep it in sync with admin-added custom fields on every state load
  for(let i=MEASUREMENT_FIELDS.length-1;i>=0;i--){ if(MEASUREMENT_FIELDS[i].custom) MEASUREMENT_FIELDS.splice(i,1); }
  state.customMeasurementFields.forEach(f=> MEASUREMENT_FIELDS.push({...f, custom:true}));
  if(!state.settings.fixedItems) state.settings.fixedItems=[];
  if(!state.settings.embroideryWage) state.settings.embroideryWage=15;
  if(state.settings.allowDiscount===undefined) state.settings.allowDiscount=false;
  if(state.settings.bankFeePercent===undefined) state.settings.bankFeePercent=0.92;
  if(state.settings.waWelcomeEnabled===undefined) state.settings.waWelcomeEnabled=false;
  if(state.settings.waPromoMessage===undefined) state.settings.waPromoMessage="عميلنا العزيز، بمناسبة عودتك لنا نقدّم لك عرضاً خاصاً على تفصيل ثوبك القادم! زورونا لمعرفة التفاصيل 🌹";
  if(state.settings.nextVoucherNumber===undefined) state.settings.nextVoucherNumber=1;
  if(!state.closingReports) state.closingReports=[];
  if(!state.legacyItems) state.legacyItems=[];
  state.legacyItems.forEach(x=>{ if(x.deliveredCount===undefined) x.deliveredCount = x.status==="تم التسليم" ? x.count : 0; });
  if(!state.users || state.users.length===0) state.users=[{username:"admin",password:"admin123",role:"مدير"}];
  if(!state.cashBoxes) state.cashBoxes=[];
  // migrate any legacy shop-wide single box/bank model
  state.cashBoxes = state.cashBoxes.filter(b=>b.id!=="main" || b.owner);
  state.cashBoxes.forEach(b=>{ if(b.openingBalance===undefined) b.openingBalance=0; });
  state.users.forEach(u=> ensureUserBoxes(u.username));
  if(!state.advisory) state.advisory={fabric:0, padding:0, wages:0, embroidery:0};
  if(!state.expenseCategories) state.expenseCategories=[
    {id:"c1", label:"أجور خياطين", advisoryKey:"wages"},
    {id:"c2", label:"شراء قماش", advisoryKey:"fabric"},
    {id:"c3", label:"شراء حشوات وخيوط", advisoryKey:"padding"},
    {id:"c4", label:"أجور تطريز", advisoryKey:"embroidery"},
  ];
  // unlinked categories for expenses that don't belong to any advisory balance — without these, a
  // maintenance/general expense had nowhere to go except being wrongly charged against a linked category
  if(!state.expenseCategories.some(c=>c.label==="صيانة")) state.expenseCategories.push({id:"c5", label:"صيانة"});
  if(!state.expenseCategories.some(c=>c.label==="مصاريف عامة")) state.expenseCategories.push({id:"c6", label:"مصاريف عامة"});
  state.expenseCategories.forEach(c=>{ if(!c.subItems) c.subItems=[]; });
  if(!state.expenses) state.expenses=[];
  if(!state.transferRequests) state.transferRequests=[];
  if(!state.itemCards) state.itemCards=[];
  if(!state.suppliers) state.suppliers=[];
  if(!state.purchases) state.purchases=[];
  if(!state.purchaseReturns) state.purchaseReturns=[];
  if(!state.customers) state.customers=[];
  if(!state.salesInvoices) state.salesInvoices=[];
  if(!state.salesReturns) state.salesReturns=[];
  if(!state.boxTransfers) state.boxTransfers=[];
  // records created in the same millisecond used to share an id; find-by-id then always hit the
  // first one, leaving the other stuck for good (a transfer that could never be accepted/rejected).
  // Nothing else references these ids, so a duplicate can safely get a fresh one.
  ["transferRequests","mailRequests"].forEach(k=>{
    const seen = new Set();
    (state[k]||[]).forEach(r=>{ if(seen.has(r.id)) r.id = newId(); seen.add(r.id); });
  });
  if(!state.addonDefs) state.addonDefs=[];
  if(!state.tailorScans) state.tailorScans=[];
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{
    if(!g.addons) g.addons=[];
    // freeze what was actually charged for addons at the moment of invoice save (same principle
    // as g.price/g.embroideryPrice) — without this, garmentAddonsTotal() re-reads live addonDefs/
    // itemCard costs every time it's called, so editing an addon's price or deleting it later
    // silently changes the sale total of every past invoice that used it, even closed ones.
    // invoices saved before this fix never got a snapshot, so back-fill one here using today's
    // prices as the best available freeze point — it stops further drift even if it can't recover
    // the exact historical figure.
    if(g.addonsSaleSnapshot===undefined){
      g.addonsSaleSnapshot = garmentAddonsInfo(g).reduce((sum,a)=> sum+addonUnitPrice(a), 0);
      addonSnapshotsBackfilled = true;
    }
  }));
  if(state.settings.measureUnit===undefined) state.settings.measureUnit="meter";
  if(state.settings.nextSalesInvoiceNumber===undefined) state.settings.nextSalesInvoiceNumber=1;
  if(state.settings.nextPurchaseInvoiceNumber===undefined) state.settings.nextPurchaseInvoiceNumber=1;
  if(!state.settings.cuttingCardImages) state.settings.cuttingCardImages={front:null, back:null};
  if(!state.settings.minDepositType) state.settings.minDepositType="none";
  if(!state.settings.thermalPaperWidth) state.settings.thermalPaperWidth=58;
  if(state.settings.sensitivePin===undefined) state.settings.sensitivePin="";
  if(!state.settings.defaultFabricQty) state.settings.defaultFabricQty = {"رجال":3.25, "ولادي":2.25, "طفل":1.75};
  if(state.settings.printOriginOnLabel===undefined) state.settings.printOriginOnLabel = true;
  if(state.settings.nextAlterationNumber===undefined) state.settings.nextAlterationNumber = 1;
  if(state.settings.commissionBasis===undefined) state.settings.commissionBasis = "تسليم";
  if(state.settings.pricesIncludeVat===undefined) state.settings.pricesIncludeVat = true;
  if(state.settings.themeMode===undefined) state.settings.themeMode = "dark";
  if(state.settings.fabricQtyBuffer===undefined) state.settings.fabricQtyBuffer = 0.25;
  if(state.settings.minDepositValue===undefined) state.settings.minDepositValue=0;
  if(!state.settings.cuttingCardLabelPositions) state.settings.cuttingCardLabelPositions={};
  if(state.settings.cuttingCardTemplate===undefined) state.settings.cuttingCardTemplate="default";
  if(state.settings.takhaleesIcon===undefined) state.settings.takhaleesIcon="";
  if(state.settings.loyaltyEarnRate===undefined) state.settings.loyaltyEarnRate=10;
  if(state.settings.loyaltyRedeemRate===undefined) state.settings.loyaltyRedeemRate=1;
  if(state.settings.loyaltyMinRedeem===undefined) state.settings.loyaltyMinRedeem=0;
  if(state.settings.loyaltySilverThreshold===undefined) state.settings.loyaltySilverThreshold=5000;
  if(state.settings.loyaltyGoldThreshold===undefined) state.settings.loyaltyGoldThreshold=15000;
  if(state.settings.loyaltySilverMultiplier===undefined) state.settings.loyaltySilverMultiplier=1;
  if(state.settings.loyaltySilverDiscountPercent===undefined) state.settings.loyaltySilverDiscountPercent=0;
  if(state.settings.loyaltyGoldMultiplier===undefined) state.settings.loyaltyGoldMultiplier=1;
  if(state.settings.loyaltyGoldDiscountPercent===undefined) state.settings.loyaltyGoldDiscountPercent=0;
  if(state.settings.einvoiceEnabled===undefined) state.settings.einvoiceEnabled=false;
  if(state.settings.vatNumber===undefined) state.settings.vatNumber="";
  if(state.settings.shopLegalName===undefined) state.settings.shopLegalName="";
  if(state.settings.vatRate===undefined) state.settings.vatRate=15;
  if(state.settings.vatEnabled===undefined) state.settings.vatEnabled=false;
  if(state.settings.shopName===undefined) state.settings.shopName="";
  if(state.settings.shopLogo===undefined) state.settings.shopLogo="";
  if(state.settings.commercialRegistration===undefined) state.settings.commercialRegistration="";
  if(state.settings.municipalLicense===undefined) state.settings.municipalLicense="";
  if(state.settings.shopNumber===undefined) state.settings.shopNumber="";
  if(state.settings.shopAddress===undefined) state.settings.shopAddress="";
  if(state.settings.shopPhone===undefined) state.settings.shopPhone="";
  if(!state.settings.customShopFields) state.settings.customShopFields=[];
  if(state.settings.invoiceFooterText===undefined) state.settings.invoiceFooterText="";
  if(state.settings.invoiceSaveReminderMinutes===undefined) state.settings.invoiceSaveReminderMinutes=3;
  if(state.settings.defaultDeliveryDays===undefined) state.settings.defaultDeliveryDays=3;
  if(state.settings.cuttingOverdueDays===undefined) state.settings.cuttingOverdueDays=3;
  if(state.settings.receiptTerms===undefined) state.settings.receiptTerms="";
  // seed (or re-seed) the type-picker libraries with the built-in defaults — this covers a fresh
  // install, a cloud doc saved before a given library existed, and a library that got stuck at []
  // from an older version of this same fallback. garmentTypes only re-seeds below its full count
  // (6) since a shop may have legitimately trimmed the list down, just not to almost nothing.
  const defLibs = defaultTypeLibraries();
  if(!state.garmentTypes || state.garmentTypes.length < 4){ state.garmentTypes = defLibs.garmentTypes; typeLibrariesReseeded = true; }
  if(!state.collarTypes || !state.collarTypes.length){ state.collarTypes = defLibs.collarTypes; typeLibrariesReseeded = true; }
  if(!state.cufflinkTypes || !state.cufflinkTypes.length){ state.cufflinkTypes = defLibs.cufflinkTypes; typeLibrariesReseeded = true; }
  if(!state.pocketSewTypes || !state.pocketSewTypes.length){ state.pocketSewTypes = defLibs.pocketSewTypes; typeLibrariesReseeded = true; }
  if(!state.fillingTypes || !state.fillingTypes.length){ state.fillingTypes = defLibs.fillingTypes; typeLibrariesReseeded = true; }
  if(!state.jabzourTypes || !state.jabzourTypes.length){ state.jabzourTypes = defLibs.jabzourTypes; typeLibrariesReseeded = true; }
  if(!state.chestPocketTypes || !state.chestPocketTypes.length){ state.chestPocketTypes = defLibs.chestPocketTypes; typeLibrariesReseeded = true; }
  if(!state.modelTypes || !state.modelTypes.length){ state.modelTypes = defLibs.modelTypes; typeLibrariesReseeded = true; }
  state.invoices.forEach(inv=>{
    if(inv.expectedDeliveryDate===undefined) inv.expectedDeliveryDate=null;
    inv.garments.forEach(g=>{
      if(g.measurements===undefined) g.measurements={};
      if(g.urgent===undefined) g.urgent=false;
      if(g.sample===undefined) g.sample=false;
    });
  });
  state.invoices.forEach(inv=>{ if(inv.notes===undefined) inv.notes=""; if(!inv.appliedOffers) inv.appliedOffers=[]; if(!inv.freeGifts) inv.freeGifts=[]; });
  if(!state.fabricOrigins || !state.fabricOrigins.length) state.fabricOrigins=["ياباني","كوري","تايلاندي","صيني"];
  if(!state.offers) state.offers=[];
  if(!state.shiftClosings) state.shiftClosings=[];
  if(!state.invoiceReturns) state.invoiceReturns=[];
  if(!state.deletedInvoicesLog) state.deletedInvoicesLog=[];
  if(!state.vouchers) state.vouchers=[];
  if(state.settings.nextReceiptVoucherNumber===undefined) state.settings.nextReceiptVoucherNumber=1;
  if(state.settings.nextPaymentVoucherNumber===undefined) state.settings.nextPaymentVoucherNumber=1;
  if(!state.quickMenus) state.quickMenus={"مدير":["invoice","distribution","report-daily","balances"],"محاسب":["invoice","distribution","balances"],"كاشير":["invoice","distribution","salesInvoice"]};
  const QUICK_MENU_DEFAULTS = {"مدير":["invoice","distribution","report-daily","balances"],"محاسب":["invoice","distribution","balances"],"كاشير":["invoice","distribution","salesInvoice"]};
  if(!state.settings.quickMenusSeeded){
    ["مدير","محاسب","كاشير"].forEach(r=>{ if(!state.quickMenus[r] || state.quickMenus[r].length===0) state.quickMenus[r]=[...(QUICK_MENU_DEFAULTS[r]||[])]; });
    state.settings.quickMenusSeeded = true;
  } else {
    ["مدير","محاسب","كاشير"].forEach(r=>{ if(!state.quickMenus[r]) state.quickMenus[r]=[]; });
  }
  // migrate stale quick-menu picks left over from the inventory/settings tab splits
  const QUICK_MENU_TAB_REPLACEMENTS = { "inventory":"itemCards", "settings":"settingsShop" };
  Object.keys(state.quickMenus).forEach(r=>{
    state.quickMenus[r] = state.quickMenus[r].map(t=> QUICK_MENU_TAB_REPLACEMENTS[t] || t).filter((t,i,arr)=> arr.indexOf(t)===i);
  });
  state.itemCards.forEach(c=>{
    if(c.minSalePrice===undefined) c.minSalePrice=0;
  if(!c.minPrices) c.minPrices = c.type==="fabric" ? {"رجال": c.minSalePrice||0, "ولادي":0, "طفل":0} : {};
    if(c.type==="fabric" && c.salePrice===undefined) c.salePrice=0;
    if(c.type==="fabric"){
      if(c.origin===undefined) c.origin="";
      if(c.season===undefined) c.season="";
    }
  });
  if(!state.lastInvoiceHash) state.lastInvoiceHash="0".repeat(64);
  state.customers.forEach(c=>{ if(c.loyaltyPoints===undefined) c.loyaltyPoints=0; if(c.vip===undefined) c.vip=false; });
  state.customers.forEach(c=>{ c.individuals.forEach((ind,i)=>{ if(!ind.subCode) ind.subCode = `${c.code}-${i+1}`; }); });
  state.itemCards.forEach(c=>{
    if(c.openingBalance===undefined) c.openingBalance=0;
    if(c.stockQty===undefined) c.stockQty=0;
    if(c.reservedQty===undefined) c.reservedQty=0;
    if(c.currentCost===undefined) c.currentCost=0;
    if(c.active===undefined) c.active=true;
    if(c.type==="fabric"){
      if(!c.prices) c.prices={"رجال":0,"ولادي":0,"طفل":0};
      if(!c.qty) c.qty={"رجال":0,"ولادي":0,"طفل":0};
    }
  });
  state.suppliers.forEach(s=>{ if(s.balance===undefined) s.balance=0; });
  if(!state.payrollLedger) state.payrollLedger=[];
  if(!state.vatPayments) state.vatPayments=[];
  if(!state.legacyPayments) state.legacyPayments=[];
  if(!state.openingDebtPayments) state.openingDebtPayments=[];
  if(!state.mailRequests) state.mailRequests=[];
  if(!state.decisions) state.decisions=[];
  if(!state.seasons) state.seasons=[];
  if(!state.broadcastCampaign) state.broadcastCampaign={sentMobiles:[]};
  if(!state.writtenOffLosses) state.writtenOffLosses=[];
  if(!state.operationalLosses) state.operationalLosses=[];
  if(!state.promoCodes) state.promoCodes=[];
  if(state.settings.nextDecisionNumber===undefined) state.settings.nextDecisionNumber=1;
  if(state.settings.nextMailRequestNumber===undefined) state.settings.nextMailRequestNumber=1;
  if(!state.alterations) state.alterations=[];
  if(state.alterations.some(a=>a.alterationNumber===undefined)){
    state.alterations.sort((a,b)=>(a.dateReceived||"").localeCompare(b.dateReceived||""));
    let n = 1;
    state.alterations.forEach(a=>{ if(a.alterationNumber===undefined) a.alterationNumber = n; n++; });
    state.settings.nextAlterationNumber = Math.max(state.settings.nextAlterationNumber||1, n);
  }
  if(!state.stockWriteOffs) state.stockWriteOffs=[];
  if(!state.loyaltyLedger) state.loyaltyLedger=[];
  if(state.settings.nextCustomerCode===undefined) state.settings.nextCustomerCode=1;
  if(state.settings.nextItemCode===undefined) state.settings.nextItemCode=1;
  state.customers.filter(c=>c.code===undefined).sort((a,b)=>a.id.localeCompare(b.id)).forEach(c=>{ c.code=nextCustomerCode(); });
  state.itemCards.filter(c=>c.code===undefined).sort((a,b)=>a.id.localeCompare(b.id)).forEach(c=>{ c.code=nextItemCode(); });
  if(!state.alterationReasons) state.alterationReasons=[];
  if(!state.alterationResponsibles || !state.alterationResponsibles.length) state.alterationResponsibles=["الخياط","القصاص","ماخذ المقاسات","الزبون نفسه"];
  if(!state.permissions){
    const allTabs = ["invoice","dashboard","advisoryBalances","sensitiveFinancials","shiftClose","vouchers","production","mail","salesInvoice","invoicesList","distribution","scan","alteration","debts","customerDebts","legacy","itemCards","suppliers","purchases","purchaseReturns","balances","expenses","payroll","report-broadcastCampaign","report-tailorMonthly","report-fullLog","report-search","report-undelivered","report-garmentInventory","report-noFabricWage","report-salesRanking","report-vatCalc","report-returns","report-customers","report-daily","report-missingReceipt","report-topExpenses","report-expenseSubItems","report-auditLog","growth","archive","settingsShop","settingsFinance","settingsUsers","settingsProducts","settingsMarketing"];
    const allSections = ["fullLog","search","undelivered","garmentInventory","salesRanking","vatCalc","returns","customers","daily","missingReceipt"];
    state.permissions = {
      "مدير": { tabs: [...allTabs], reportSections: [...allSections] },
      "محاسب": { tabs: allTabs.filter(t=>!["settingsShop","settingsFinance","settingsUsers","settingsProducts","settingsMarketing","payroll","sensitiveFinancials"].includes(t)), reportSections: [...allSections] },
      "كاشير": { tabs: ["invoice","salesInvoice","invoicesList","distribution","scan","alteration","debts","customerDebts","report-search","report-daily","report-customers","shiftClose","mail"], reportSections: [...allSections] },
    };
  }
  // migration: ensure newly-added report sections appear for existing installs
  Object.values(state.permissions).forEach(p=>{ if(p.reportSections && !p.reportSections.includes("fullLog")) p.reportSections.push("fullLog"); });
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("dashboard")) state.permissions["مدير"].tabs.push("dashboard");
  if(state.permissions["محاسب"] && !state.permissions["محاسب"].tabs.includes("dashboard")) state.permissions["محاسب"].tabs.push("dashboard");
  Object.values(state.permissions).forEach(p=>{ if(p.tabs && !p.tabs.includes("shiftClose")) p.tabs.push("shiftClose"); });
  Object.values(state.permissions).forEach(p=>{ if(p.tabs && !p.tabs.includes("vouchers")) p.tabs.push("vouchers"); });
  Object.values(state.permissions).forEach(p=>{ if(p.tabs && !p.tabs.includes("production")) p.tabs.push("production"); });
  Object.values(state.permissions).forEach(p=>{ if(p.tabs && !p.tabs.includes("mail")) p.tabs.push("mail"); });
  if(!state.settings.qcTabGranted){ // one-time: hand the new quality-check tab to every employee role
    Object.values(state.permissions).forEach(p=>{ if(p.tabs && !p.tabs.includes("qc")) p.tabs.push("qc"); });
    state.settings.qcTabGranted = true;
  }
  if(!state.qcLog) state.qcLog=[];
  // the "أجرة تفصيل (بدون قماش)" line (customer brings their own fabric) has its own price card:
  // a default sale price and a minimum price per body category, like a fabric card
  if(!state.settings.tailoringOnly) state.settings.tailoringOnly = {prices:{"رجال":0,"ولادي":0,"طفل":0}, minPrices:{"رجال":0,"ولادي":0,"طفل":0}};
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("sensitiveFinancials")) state.permissions["مدير"].tabs.push("sensitiveFinancials");
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("advisoryBalances")) state.permissions["مدير"].tabs.push("advisoryBalances");
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("customerDebts")) state.permissions["مدير"].tabs.push("customerDebts");
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("expenses")) state.permissions["مدير"].tabs.push("expenses");
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("report-topExpenses")) state.permissions["مدير"].tabs.push("report-topExpenses");
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("report-auditLog")) state.permissions["مدير"].tabs.push("report-auditLog");
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("report-noFabricWage")) state.permissions["مدير"].tabs.push("report-noFabricWage");
  if(state.permissions["محاسب"] && !state.permissions["محاسب"].tabs.includes("report-noFabricWage")) state.permissions["محاسب"].tabs.push("report-noFabricWage");
  if(state.permissions["محاسب"] && !state.permissions["محاسب"].tabs.includes("report-topExpenses")) state.permissions["محاسب"].tabs.push("report-topExpenses");
  if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes("report-expenseSubItems")) state.permissions["مدير"].tabs.push("report-expenseSubItems");
  if(state.permissions["محاسب"] && !state.permissions["محاسب"].tabs.includes("report-expenseSubItems")) state.permissions["محاسب"].tabs.push("report-expenseSubItems");
  if(state.permissions["محاسب"] && !state.permissions["محاسب"].tabs.includes("expenses")) state.permissions["محاسب"].tabs.push("expenses");
  if(state.permissions["محاسب"] && !state.permissions["محاسب"].tabs.includes("customerDebts")) state.permissions["محاسب"].tabs.push("customerDebts");
  if(state.permissions["كاشير"] && !state.permissions["كاشير"].tabs.includes("customerDebts")) state.permissions["كاشير"].tabs.push("customerDebts");
  // migrate old reportSections sub-permissions into full standalone report tabs
  const REPORT_TAB_KEYS = ["broadcastCampaign","tailorMonthly","fullLog","search","undelivered","garmentInventory","salesRanking","vatCalc","returns","customers","daily","missingReceipt"];
  Object.values(state.permissions).forEach(p=>{
    if(!p.tabs) return;
    const oldSections = p.reportSections || REPORT_TAB_KEYS; // if no old data, grant all (matches previous default-open behavior)
    REPORT_TAB_KEYS.forEach(key=>{
      const tabName = "report-"+key;
      if(oldSections.includes(key) && !p.tabs.includes(tabName)) p.tabs.push(tabName);
    });
  });
  Object.values(state.permissions).forEach(p=>{
    if(!p.tabs) return;
    const hadOldInventory = p.tabs.includes("inventory");
    p.tabs = p.tabs.filter(t=>t!=="inventory");
    if(hadOldInventory){
      ["itemCards","suppliers","purchases","purchaseReturns"].forEach(t=>{ if(!p.tabs.includes(t)) p.tabs.push(t); });
    }
  });
  Object.values(state.permissions).forEach(p=>{
    if(!p.tabs) return;
    const hadOldSettings = p.tabs.includes("settings");
    p.tabs = p.tabs.filter(t=>t!=="settings");
    if(hadOldSettings){
      SETTINGS_TABS.forEach(t=>{ if(!p.tabs.includes(t)) p.tabs.push(t); });
    }
  });
  Object.values(state.permissions).forEach(p=>{ if(p.reportSections && !p.reportSections.includes("salesRanking")) p.reportSections.push("salesRanking"); });
  Object.values(state.permissions).forEach(p=>{ if(p.reportSections && !p.reportSections.includes("vatCalc")) p.reportSections.push("vatCalc"); });
  Object.values(state.permissions).forEach(p=>{ if(p.reportSections && !p.reportSections.includes("returns")) p.reportSections.push("returns"); });
  Object.values(state.permissions).forEach(p=>{ if(p.reportSections && !p.reportSections.includes("tailorMonthly")) p.reportSections.push("tailorMonthly"); });
  Object.values(state.permissions).forEach(p=>{ if(p.reportSections && !p.reportSections.includes("broadcastCampaign")) p.reportSections.push("broadcastCampaign"); });
  Object.values(state.permissions).forEach(p=>{ if(p.reportSections && !p.reportSections.includes("stuckInvoices")) p.reportSections.push("stuckInvoices"); });
  // safety: مدير must always keep settings access to avoid self-lockout
  SETTINGS_TABS.forEach(t=>{
    if(state.permissions["مدير"] && !state.permissions["مدير"].tabs.includes(t)) state.permissions["مدير"].tabs.push(t);
  });
  state.users.forEach(u=>{
    if(u.baseSalary===undefined) u.baseSalary=0;
    if(u.commissionEnabled===undefined) u.commissionEnabled=false;
    if(u.commissionThreshold===undefined) u.commissionThreshold=0;
    if(u.commissionRate===undefined) u.commissionRate=0;
    if(u.discountEnabled===undefined) u.discountEnabled=false;
    if(u.discountType===undefined) u.discountType="amount";
    if(u.discountValue===undefined) u.discountValue=0;
    if(u.dailyCapacity===undefined) u.dailyCapacity=0;
    if(u.wageMen===undefined) u.wageMen=0;
    if(u.wageChild===undefined) u.wageChild=0;
    if(u.wageChildSmall===undefined) u.wageChildSmall=0;
  });
}
// Every save writes the WHOLE shop document, so two devices saving around the same moment used to
// be last-writer-wins: the second save silently erased whatever the first one had just added
// (an invoice, a payment, an expense...) even though both screens said "saved". Each save now
// carries a revision number and commits in a transaction only if the server copy is still the
// exact revision this device last loaded; otherwise nothing is written, the latest data is pulled
// in, and the person is told to redo that one step.
let stateSaveConflict = false; // true when the most recent failed save was rejected for this reason
const ownCommittedRevs = new Map(); // base revision -> revision this device's own save moved it to
let saveQueue = Promise.resolve();
// While this device has saves in flight, server snapshots are held back (see the listener below):
// applying one mid-flight replaced `state` with a copy that lacked the still-pending change, and the
// next save — chained onto that pending one — then wrote that older copy over it (a lost update on
// a single device). Local state therefore always = last server copy + every change of our own.
let pendingSaves = 0;
let deferredSnapshot = null;
let latestOwnRev = 0;
function saveState(){
  // captured now, so a later in-memory change can't leak into this save; queued so this device's
  // own back-to-back saves never race (and reject) each other
  const payload = JSON.parse(JSON.stringify(state));
  pendingSaves++;
  const run = saveQueue.then(()=> commitStatePayload(payload)).finally(()=>{
    pendingSaves--;
    if(pendingSaves===0 && deferredSnapshot){ const snap = deferredSnapshot; deferredSnapshot = null; applyServerSnapshot(snap, false); }
  });
  saveQueue = run.catch(()=>{});
  return run;
}
async function commitStatePayload(payload){
  stateSaveConflict = false;
  // a save captured before this device's own previous save landed was built on top of that save's
  // changes too, so it continues from the revision that save produced
  let baseRev = payload._rev||0;
  while(ownCommittedRevs.has(baseRev)) baseRev = ownCommittedRevs.get(baseRev);
  payload._rev = baseRev + 1;
  try{
    await db.runTransaction(async tx=>{
      const cur = await tx.get(STATE_DOC);
      const curRev = (cur.exists && cur.data()._rev) || 0;
      if(curRev !== baseRev){ const err = new Error("shop/state changed since it was loaded"); err.code = "state-conflict"; throw err; }
      tx.set(STATE_DOC, payload);
    });
    ownCommittedRevs.set(baseRev, payload._rev);
    latestOwnRev = Math.max(latestOwnRev, payload._rev);
    return true;
  }
  catch(e){
    if(e && e.code==="state-conflict"){
      stateSaveConflict = true;
      console.warn("save rejected — another device saved first; reloading latest data", e);
      try{
        const snap = await STATE_DOC.get({source:"server"});
        if(snap.exists){ state = snap.data(); normalizeState(); }
      }catch(fetchErr){ console.error("reloading latest state after a save conflict failed", fetchErr); }
      if(currentUser) renderAll();
      alert("ما انحفظ آخر إجراء — مستخدم ثاني حفظ تعديلات بنفس اللحظة.\nتم تحديث البيانات لآخر نسخة، أعد الخطوة الأخيرة مرة ثانية.");
      return false;
    }
    console.error("Firestore save failed", e);
    let msg = "تعذّر الحفظ — تحقق من الاتصال بالإنترنت";
    if(e && e.code==="permission-denied"){
      alert("تعذّر الحفظ (permission-denied) — معرف حسابك:\n" + (fbAuth.currentUser ? fbAuth.currentUser.uid : "غير معروف"));
      return false;
    }
    else if(e && e.code==="unauthenticated") msg = "تعذّر الحفظ — الدخول المجهول (Anonymous Auth) مو شغّال، فعّله من لوحة Firebase ← Authentication";
    else if(e && e.code==="unavailable") msg = "تعذّر الحفظ — تحقق من الاتصال بالإنترنت";
    showToast(msg);
    return false;
  }
}
// Snapshot state before a local mutation that moves money or stock, then call this to persist
// it. saveState() already surfaces a toast on failure; this additionally rolls the in-memory
// state back to the pre-mutation snapshot so a failed cloud write doesn't leave a "ghost" change
// that only lives in this tab until the next real sync silently erases it.
async function saveStateWithRollback(snapshot){
  const saved = await saveState();
  // after a conflict `state` already holds the freshly reloaded server copy — rolling back to the
  // older snapshot would throw that away and make the retry conflict all over again
  if(!saved && !stateSaveConflict){ state = snapshot; }
  renderAll();
  return saved;
}
// Only ever called AFTER a real, successful sign-in — security rules reject reads of this
// document from anyone else, so there is no "document missing, silently create a blank one"
// branch here anymore: the only way shop/state is ever created is the explicit first-time-setup
// flow below, and the only way it's ever written afterward is an authenticated, rule-checked
// update. That structurally removes the failure mode that previously let a transient error cause
// a blank state to be written over real data.
let stateUnsubscribe = null;
async function applyServerSnapshot(snap, isFirstLoad){
  // an older copy than this device's own latest save (its snapshot is on the way) is skipped
  if(!isFirstLoad && ((snap.data()._rev||0) < latestOwnRev)) return;
  state = snap.data();
  typeLibrariesReseeded = false;
  addonSnapshotsBackfilled = false;
  normalizeState();
  // awaited so this self-triggered write always lands before any write a caller makes
  // right after login — otherwise the two could race, both reading the same pre-reseed
  // `state`, with the later one seeing a server document its own local copy has already
  // drifted from.
  if(typeLibrariesReseeded || addonSnapshotsBackfilled) await saveState();
  if(!isFirstLoad && currentUser) renderAll();
}
async function startListeningToState(){
  return new Promise((resolve)=>{
    let firstLoad = true;
    stateUnsubscribe = STATE_DOC.onSnapshot(async snap=>{
      if(snap.exists){
        if(!firstLoad && pendingSaves>0){ deferredSnapshot = snap; return; } // applied once our saves land
        const wasFirst = firstLoad;
        await applyServerSnapshot(snap, wasFirst);
      }
      if(firstLoad){ firstLoad=false; resolve(); }
    }, err=>{
      console.error("Firestore listen error", err);
      showToast("تعذّر الاتصال بقاعدة البيانات السحابية");
      if(firstLoad){ firstLoad=false; resolve(); }
    });
  });
}
function stopListeningToState(){
  if(stateUnsubscribe){ stateUnsubscribe(); stateUnsubscribe=null; }
}
// runs once, right after a real sign-in succeeds (fresh login or first-time setup) — everything
// that used to run unconditionally at boot but actually needs real shop data loaded first
async function afterSignedIn(){
  await startListeningToState();
  applyThemeMode();
  applyShopBranding();
  checkAgedUndeliveredLoyalty();
  checkReadyForSaleConversions();
  checkAllLoyaltyPointsExpiry();
  checkAutoCloseMonth();
  renderUsers();
  maybeBackupStateToday();
}

// ---------------- daily backups (disaster recovery — keeps the last 14 days) ----------------
const BACKUPS_COL = db.collection("backups");
async function maybeBackupStateToday(){
  try{
    const today = todayStr();
    const ref = BACKUPS_COL.doc(today);
    const snap = await ref.get();
    if(snap.exists) return; // already have today's snapshot
    await ref.set({snapshot: JSON.parse(JSON.stringify(state)), backedUpAt: firebase.firestore.FieldValue.serverTimestamp()});
    await pruneOldBackups();
  }catch(e){ console.error("automatic backup failed", e); } // never block normal app use over this
}
async function pruneOldBackups(){
  try{
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-14);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const snap = await BACKUPS_COL.get();
    const deletions = [];
    snap.forEach(doc=>{ if(doc.id < cutoffStr) deletions.push(doc.ref.delete()); });
    await Promise.all(deletions);
  }catch(e){ console.error("backup pruning failed", e); }
}
async function restoreBackup(dateId){
  if(!currentUser || currentUser.role!=="مدير"){ showToast("استرجاع نسخة احتياطية متاح للمدير فقط"); return; }
  if(!await confirmWithPassword(`متأكد تبي تسترجع نسخة يوم ${dateId}؟ بيتم استبدال كل البيانات الحالية (الفواتير، العملاء، الإعدادات...) ببيانات تلك النسخة. المستخدمين وصلاحياتهم يبقون كما هم الحين. أدخل كلمة مرورك للتأكيد.`)) return;
  try{
    const snap = await BACKUPS_COL.doc(dateId).get();
    if(!snap.exists){ showToast("النسخة غير موجودة"); return; }
    const restoredState = snap.data().snapshot;
    // keep the CURRENT login-linked user records — restoring an old backup's users could lock
    // out whoever is doing the restore, or reinstate someone removed since then
    restoredState.users = state.users;
    // continue from the live revision, not the backup's old one, so the restore goes through the
    // same conflict-checked save as everything else
    restoredState._rev = state._rev;
    state = restoredState;
    normalizeState();
    if(!await saveState()) return;
    showToast("تم الاسترجاع بنجاح"); renderAll();
  }catch(e){ console.error("restore failed", e); showToast("تعذّر الاسترجاع — حاول مرة ثانية"); }
}

async function tryLogin(){
  const u=$("loginUser").value.trim(), p=$("loginPass").value;
  if(!u || !p){ $("loginErr").textContent="أدخل اسم المستخدم وكلمة المرور"; return; }
  $("loginErr").textContent = "";
  let email;
  try{
    const doc = await USERNAMES_COL.doc(u).get();
    if(!doc.exists){ $("loginErr").textContent="اسم المستخدم أو كلمة المرور غير صحيحة"; return; }
    email = doc.data().authEmail;
  }catch(e){ console.error("username lookup failed", e); $("loginErr").textContent = authErrorMessage(e); return; }
  try{
    await fbAuth.signInWithEmailAndPassword(email, p);
  }catch(e){
    const wrongCreds = e && ["auth/wrong-password","auth/user-not-found","auth/invalid-credential","auth/invalid-login-credentials"].includes(e.code);
    $("loginErr").textContent = wrongCreds ? "اسم المستخدم أو كلمة المرور غير صحيحة" : authErrorMessage(e);
    return;
  }
  await afterSignedIn();
  const found = state.users.find(x=>x.authUid===fbAuth.currentUser.uid);
  if(!found){
    console.error("signed in but no matching state.users entry for uid", fbAuth.currentUser.uid);
    stopListeningToState();
    await fbAuth.signOut().catch(()=>{});
    $("loginErr").textContent = "تعذّر العثور على حساب مطابق داخل بيانات المحل — تواصل مع الدعم الفني";
    return;
  }
  currentUser=found;
  $("loginScreen").classList.add("hidden"); $("app").classList.remove("hidden");
  $("curUserLbl").textContent = currentUser.username+" ("+currentUser.role+")";
  applyRolePermissions(); resetForm(); resetSaleForm(); renderAll();
}
async function trySetupFirstAccount(){
  const u = $("setupUser").value.trim(), p = $("setupPass").value, pc = $("setupPassConfirm").value;
  if(!u || !p){ $("firstSetupErr").textContent="أدخل اسم المستخدم وكلمة المرور"; return; }
  if(p.length < 6){ $("firstSetupErr").textContent="كلمة المرور لازم تكون ٦ أحرف على الأقل"; return; }
  if(p !== pc){ $("firstSetupErr").textContent="كلمتا المرور غير متطابقتين"; return; }
  $("firstSetupErr").textContent = "";
  const email = synthEmailForNewAccount();
  let cred;
  try{
    cred = await fbAuth.createUserWithEmailAndPassword(email, p);
  }catch(e){
    console.error("first-account creation failed", e);
    $("firstSetupErr").textContent = (e && e.code==="auth/weak-password") ? "كلمة المرور ضعيفة جداً" : authErrorMessage(e);
    return;
  }
  const uid = cred.user.uid;
  try{
    // order matters: roles/{uid} can only be self-created for "مدير" while shop/state doesn't
    // exist yet, so it must be written before shop/state itself
    await USERNAMES_COL.doc(u).set({authEmail: email});
    await ROLES_COL.doc(uid).set({role:"مدير"});
    state.users = [{username:u, role:"مدير", authUid:uid, authEmail:email, joinedDate:todayStr(), baseSalary:0, commissionEnabled:false, commissionRate:0, commissionThreshold:0, discountEnabled:false, discountType:"amount", discountValue:0, dailyCapacity:0, productionCapacity:0, wageMen:0, wageChild:0, wageChildSmall:0}];
    normalizeState(); // state.users is already non-empty, so this only fills in everything else
    await STATE_DOC.set(JSON.parse(JSON.stringify(state)));
  }catch(e){
    console.error("first-time setup failed after the auth account was already created", e);
    $("firstSetupErr").textContent = "تعذّر إكمال الإعداد — حاول مرة ثانية";
    return;
  }
  await afterSignedIn();
  currentUser = state.users.find(x=>x.authUid===uid);
  $("loginScreen").classList.add("hidden"); $("app").classList.remove("hidden");
  $("curUserLbl").textContent = currentUser.username+" ("+currentUser.role+")";
  applyRolePermissions(); resetForm(); resetSaleForm(); renderAll();
  showToast("تم إعداد الحساب بنجاح — أهلاً بك");
}
async function logout(){
  // an admin-approved opening-balance edit is only good for the session it was granted in —
  // expire any of this user's unused approvals now so logging back in doesn't silently re-grant them
  if(currentUser){
    const myUnused = (state.openingBalanceEditRequests||[]).filter(r=>r.requestedBy===currentUser.username && r.status==="approved");
    if(myUnused.length){ myUnused.forEach(r=> r.status="expired"); await saveState(); }
  }
  openingBalanceSessionGrants.clear();
  currentUser=null; sensitiveUnlocked=false; $("loginUser").value=""; $("loginPass").value=""; $("loginErr").textContent="";
  $("app").classList.add("hidden"); $("loginScreen").classList.remove("hidden");
  stopListeningToState();
  try{ await fbAuth.signOut(); }catch(e){ console.error("sign-out failed", e); }
}
function applyRolePermissions(){
  const isAdmin = currentUser.role==="مدير";
  const isTailor = currentUser.role==="خياط";
  const isQc = currentUser.role==="فاحص جودة";
  $("payrollToggleBtn").style.display = isAdmin ? "" : "none";
  SETTINGS_TABS.forEach(t=>{
    const el = $("adminOnly_"+t); if(el) el.style.display = isAdmin?"":"none";
  });
  let allowedTabs = isTailor ? ["scan","mail"] : isQc ? ["qc","mail"] : (state.permissions[currentUser.role]?.tabs || []);
  if(!state.settings.qcEnabled && !isQc) allowedTabs = allowedTabs.filter(t=>t!=="qc");
  document.querySelectorAll(".tab-btn").forEach(btn=>{
    btn.style.display = allowedTabs.includes(btn.dataset.tab) ? "" : "none";
  });
  $("hamburgerBtn").style.display = (isTailor||isQc) ? "none" : "";
  $("quickLabelBtn").style.display = (isTailor||isQc) ? "none" : "";
  renderNavDrawer();
  renderSidebar();
  renderBottomNav();
  const activeTab = document.querySelector(".tab-panel.active")?.id?.replace("tab-","");
  if(activeTab && !allowedTabs.includes(activeTab)){
    switchTab(allowedTabs[0] || (isTailor?"scan":isQc?"qc":"invoice"));
  }
}
const NAV_GROUPS = [
  {title:"الرئيسية", color:"#b8863a", items:[
    {tab:"dashboard", label:"لوحة التحكم"},
  ]},
  {title:"المبيعات", color:"#2f6fb0", items:[
    {tab:"invoice", label:"فاتورة تفصيل جديدة"},
    {tab:"salesInvoice", label:"فاتورة مبيعات"},
    {tab:"report-returns", label:"المرتجعات"},
    {tab:"report-missingReceipt", label:"فواتير بدون رقم سند"},
    {tab:"invoicesList", label:"سجل الفواتير"},
  ]},
  {title:"الخياطة", color:"#b08a4e", items:[
    {tab:"distribution", label:"التوزيع"},
    {tab:"production", label:"متابعة الإنتاج"},
    {tab:"scan", label:"مسح الباركود"},
    {tab:"alteration", label:"ثوب معاد للتعديل"},
    {tab:"qc", label:"فحص الجودة"},
    {tab:"debts", label:"مديونية الثياب"},
    {tab:"report-undelivered", label:"الثياب غير المسلّمة"},
    {tab:"report-garmentInventory", label:"جرد الثياب حسب الحالة"},
    {tab:"report-noFabricWage", label:"أجرة تفصيل بدون قماش"},
  ]},
  {title:"العملاء", color:"#1f9d5c", items:[
    {tab:"customerDebts", label:"مديونيات العملاء"},
    {tab:"report-customers", label:"تقرير العملاء"},
    {tab:"report-broadcastCampaign", label:"قوائم البث والعروض الخاصة"},
  ]},
  {title:"المخزون", color:"#8a6d3b", items:[
    {tab:"itemCards", label:"كروت الأصناف"},
    {tab:"suppliers", label:"الموردين"},
    {tab:"purchases", label:"فاتورة مشتريات جديدة"},
    {tab:"purchaseReturns", label:"مرتجع مشتريات"},
    {tab:"legacy", label:"الجرد الافتتاحي"},
  ]},
  {title:"الحسابات", color:"#e0872e", items:[
    {tab:"balances", label:"صناديقي (وتحويل الأموال)"},
    {tab:"expenses", label:"المصروفات"},
    {tab:"vouchers", label:"سندات قبض وصرف"},
    {tab:"shiftClose", label:"إقفال الوردية"},
    {tab:"payroll", label:"الرواتب — استحقاق ورواتب الموظفين"},
    {tab:"archive", label:"الإقفال الشهري"},
    {tab:"advisoryBalances", label:"الأرصدة الإرشادية"},
    {tab:"sensitiveFinancials", label:"الإحصائيات المالية الحساسة"},
    {tab:"report-vatCalc", label:"حاسبة الضريبة"},
    {tab:"report-topExpenses", label:"أعلى المصاريف"},
    {tab:"report-expenseSubItems", label:"تقرير المصروفات حسب البند"},
  ]},
  {title:"التقارير", color:"#7d5fb0", items:[
    {tab:"report-fullLog", label:"السجل الشامل"},
    {tab:"report-search", label:"البحث بحالة الفواتير والتطريز"},
    {tab:"report-salesRanking", label:"الأكثر والأقل مبيعاً"},
    {tab:"report-daily", label:"التقرير اليومي"},
    {tab:"report-tailorMonthly", label:"تقرير الخياط الشهري"},
    {tab:"report-auditLog", label:"سجل التدقيق"},
    {tab:"growth", label:"النمو"},
  ]},
  {title:"الإعدادات", color:"#dc3545", items:[
    {tab:"settingsShop", label:"بيانات المحل والفاتورة"},
    {tab:"settingsFinance", label:"المالية والتكاليف"},
    {tab:"settingsUsers", label:"المستخدمين والصلاحيات"},
    {tab:"settingsProducts", label:"التفصيل والمنتجات"},
    {tab:"settingsMarketing", label:"التسويق والولاء"},
  ]},
];
function allNavItemsFlat(){ return NAV_GROUPS.flatMap(g=>g.items); }
const TAB_ICONS = {
  dashboard:"layout-dashboard", invoice:"file-text", salesInvoice:"shopping-bag", "report-returns":"rotate-ccw",
  "report-missingReceipt":"receipt", invoicesList:"list", distribution:"scissors", production:"shirt",
  scan:"scan-line", alteration:"refresh-cw", qc:"badge-check", debts:"credit-card", "report-undelivered":"package",
  "report-garmentInventory":"clipboard-list", "report-noFabricWage":"scissors", customerDebts:"wallet", "report-customers":"users",
  "report-broadcastCampaign":"megaphone", itemCards:"layers", suppliers:"factory", purchases:"shopping-cart",
  purchaseReturns:"corner-up-left", legacy:"archive", balances:"wallet", expenses:"receipt", vouchers:"file-text",
  shiftClose:"calculator", payroll:"banknote", archive:"lock", advisoryBalances:"clipboard",
  sensitiveFinancials:"shield", "report-vatCalc":"percent", "report-topExpenses":"trending-down", "report-expenseSubItems":"receipt",
  "report-fullLog":"scroll-text", "report-search":"search", "report-salesRanking":"trophy",
  "report-daily":"calendar", "report-tailorMonthly":"hard-hat", "report-auditLog":"history", growth:"trending-up",
  settingsShop:"store", settingsFinance:"circle-dollar-sign", settingsUsers:"user-cog",
  settingsProducts:"shirt", settingsMarketing:"gift", mail:"mail-open",
};
const GROUP_ICONS = { "الرئيسية":"home", "المبيعات":"shopping-bag", "الخياطة":"scissors", "العملاء":"users",
  "المخزون":"warehouse", "الحسابات":"wallet", "التقارير":"bar-chart-3", "الإعدادات":"settings" };
function navIcon(tab){ return TAB_ICONS[tab] || "circle"; }
function refreshLucideIcons(){ if(window.lucide) window.lucide.createIcons(); }
function emptyStateHtml(icon, message){
  return `<div class="empty"><div class="big"><i data-lucide="${icon}"></i></div><div>${message}</div></div>`;
}
let sidebarOpenGroup = null;
function renderSidebar(){
  const nav = $("sidebarNav");
  if(!nav || !currentUser) return;
  const activeTab = document.querySelector(".tab-panel.active")?.id?.replace("tab-","");
  if(!sidebarOpenGroup){
    const g = NAV_GROUPS.find(g=>g.items.some(it=>it.tab===activeTab));
    if(g) sidebarOpenGroup = g.title;
  }
  nav.innerHTML = NAV_GROUPS.map(group=>{
    const items = group.items.filter(it=>{
      const src = document.querySelector(`.tab-btn[data-tab="${it.tab}"]`);
      return src && src.style.display!=="none";
    });
    if(!items.length) return "";
    const isOpen = sidebarOpenGroup===group.title;
    const itemsHtml = items.map(it=>{
      const isActive = it.tab===activeTab;
      return `<button type="button" class="sidebar-link${isActive?" active":""}" data-tab="${it.tab}"><i data-lucide="${navIcon(it.tab)}"></i><span>${esc(it.label)}</span></button>`;
    }).join("");
    return `<div class="sidebar-group${isOpen?" open":""}" data-group="${esc(group.title)}">
      <button type="button" class="sidebar-group-title"><i data-lucide="${GROUP_ICONS[group.title]||"folder"}"></i><span>${esc(group.title)}</span><i data-lucide="chevron-down" class="chev"></i></button>
      <div class="sidebar-group-items">${itemsHtml}</div>
    </div>`;
  }).join("");
  nav.querySelectorAll(".sidebar-group-title").forEach(btn=> btn.addEventListener("click", ()=>{
    const g = btn.closest(".sidebar-group").dataset.group;
    sidebarOpenGroup = sidebarOpenGroup===g ? null : g;
    renderSidebar();
  }));
  nav.querySelectorAll(".sidebar-link").forEach(btn=> btn.addEventListener("click", async ()=>{
    if(btn.dataset.tab==="invoice" && editingId){
      const wantsLeave = await showConfirm("عندك فاتورة قيد التعديل. تبي تطلع منها وتبدأ فاتورة جديدة؟ أي تغيير لسا ما حفظته بينحذف.");
      if(!wantsLeave) return;
    }
    switchTab(btn.dataset.tab);
  }));
  refreshLucideIcons();
}
const BOTTOM_NAV_TABS = ["dashboard","invoice","distribution","customerDebts"];
function renderBottomNav(){
  const nav = $("bottomNav");
  if(!nav || !currentUser) return;
  const activeTab = document.querySelector(".tab-panel.active")?.id?.replace("tab-","");
  const flat = allNavItemsFlat();
  const isTailor = currentUser.role==="خياط";
  const candidateTabs = isTailor ? ["scan","mail"] : currentUser.role==="فاحص جودة" ? ["qc","mail"] : BOTTOM_NAV_TABS;
  const items = candidateTabs.map(t=>{
    if(t==="mail") return {tab:"mail", label:"البريد"};
    const src = document.querySelector(`.tab-btn[data-tab="${t}"]`);
    if(!src || src.style.display==="none") return null;
    return flat.find(i=>i.tab===t) || null;
  }).filter(Boolean);
  const itemsHtml = items.map(it=>{
    const isActive = it.tab===activeTab;
    return `<button type="button" class="bottom-nav-item${isActive?" active":""}" data-tab="${it.tab}"><i data-lucide="${navIcon(it.tab)}"></i><span>${esc(it.label)}</span></button>`;
  }).join("");
  nav.innerHTML = itemsHtml + `<button type="button" class="bottom-nav-item more-btn" id="bottomNavMoreBtn"><i data-lucide="menu"></i><span>المزيد</span></button>`;
  nav.querySelectorAll(".bottom-nav-item[data-tab]").forEach(btn=> btn.addEventListener("click", ()=> switchTab(btn.dataset.tab)));
  $("bottomNavMoreBtn").addEventListener("click", openNavDrawer);
  refreshLucideIcons();
}
function renderQuickMenuBar(){
  const bar = $("quickMenuBar");
  if(!bar || !currentUser) return;
  if(currentUser.role==="خياط"){ bar.innerHTML=""; bar.style.display="none"; return; }
  const allowedTabs = (state.permissions[currentUser.role]?.tabs)||[];
  const picks = (state.quickMenus[currentUser.role]||[]).filter(t=>allowedTabs.includes(t));
  const flat = allNavItemsFlat();
  if(!picks.length){
    bar.style.whiteSpace = "normal";
    bar.innerHTML = `<span class="sub" style="padding:6px;display:block;">ما فيه اختصارات محددة لدورك — المدير يضيفها من الإعدادات ← القائمة السريعة.</span>`;
    return;
  }
  bar.style.whiteSpace = "nowrap";
  bar.innerHTML = picks.map(t=>{
    const item = flat.find(i=>i.tab===t);
    if(!item) return "";
    return `<button class="btn btn-ghost btn-sm" style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;margin-left:8px;min-width:64px;" onclick="switchTab('${t}')"><i data-lucide="${navIcon(item.tab)}" style="width:20px;height:20px;"></i><span style="font-size:11px;">${item.label}</span></button>`;
  }).join("");
  refreshLucideIcons();
}
function renderQuickMenuEditor(){
  const el = $("quickMenuEditor");
  if(!el || !currentUser || currentUser.role!=="مدير") return;
  const flat = allNavItemsFlat();
  el.innerHTML = EDITABLE_ROLES.map(role=>{
    const allowedTabs = (state.permissions[role]?.tabs)||[];
    const picks = state.quickMenus[role]||[];
    const itemsHtml = allowedTabs.map(t=>{
      const item = flat.find(i=>i.tab===t);
      if(!item) return "";
      const checked = picks.includes(t);
      return `<div class="embro-toggle" style="margin:4px 0;"><input type="checkbox" class="qm-pick" data-role="${role}" data-tab="${t}" ${checked?"checked":""}><label style="margin:0;font-size:13px;"><i data-lucide="${navIcon(item.tab)}" style="width:14px;height:14px;vertical-align:middle;"></i> ${item.label}</label></div>`;
    }).join("");
    return `<div class="garment-card"><span class="tag">${role} (${picks.length} اختصار محدد)</span><div style="margin-top:8px;">${itemsHtml||`<p class="sub">هذا الدور ما عنده أي تبويبات مفعّلة بالصلاحيات أصلاً.</p>`}</div></div>`;
  }).join("");
  refreshLucideIcons();
  document.querySelectorAll(".qm-pick").forEach(cb=> cb.addEventListener("change", ()=>{
    const role = cb.dataset.role, tab = cb.dataset.tab;
    const list = state.quickMenus[role]||(state.quickMenus[role]=[]);
    if(cb.checked){
      if(list.length>=6){ showToast("أقصى 6 اختصارات بالقائمة السريعة عشان تناسب عرض الشاشة"); cb.checked=false; return; }
      if(!list.includes(tab)) list.push(tab);
    } else {
      state.quickMenus[role] = list.filter(t=>t!==tab);
    }
    saveState(); renderAll();
  }));
}
let navDrawerActiveGroup = null;
function renderNavDrawer(){
  const container = $("navDrawerContent");
  if(!container) return;
  const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;

  // level 2: showing one group's tabs, with a back button
  if(navDrawerActiveGroup){
    const group = NAV_GROUPS.find(g=>g.title===navDrawerActiveGroup);
    if(!group){ navDrawerActiveGroup=null; return renderNavDrawer(); }
    const items = group.items.map(it=>{
      const srcBtn = document.querySelector(`.tab-btn[data-tab="${it.tab}"]`);
      if(!srcBtn || srcBtn.style.display==="none") return "";
      const isActive = it.tab===activeTab;
      return `<button type="button" class="drawer-item" data-tab="${it.tab}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:right;padding:11px 12px;border-radius:10px;border-right:3px solid ${group.color};border-top:1px solid ${isActive?"var(--gold)":"transparent"};border-bottom:1px solid ${isActive?"var(--gold)":"transparent"};border-left:1px solid ${isActive?"var(--gold)":"transparent"};background:${isActive?"var(--surface2)":"transparent"};color:${isActive?"var(--gold-soft)":"var(--ivory)"};font-family:inherit;font-size:14px;cursor:pointer;margin-bottom:4px;"><i data-lucide="${navIcon(it.tab)}" style="width:16px;height:16px;"></i> ${it.label}</button>`;
    }).join("");
    container.innerHTML = `<button type="button" id="navDrawerBackBtn" style="display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--gold-soft);font-family:inherit;font-size:14px;cursor:pointer;margin-bottom:14px;padding:4px 0;">رجوع لكل الأقسام</button>
      <div style="font-size:13px;color:${group.color};margin-bottom:8px;font-weight:700;padding:6px 10px;background:${group.color}22;border-radius:8px;">${group.title}</div>
      ${items || `<p class="sub">ما فيه شاشات متاحة بهذا القسم.</p>`}`;
    refreshLucideIcons();
    $("navDrawerBackBtn").addEventListener("click", ()=>{ navDrawerActiveGroup=null; renderNavDrawer(); });
    container.querySelectorAll(".drawer-item").forEach(btn=> btn.addEventListener("click", async ()=>{
      if(btn.dataset.tab==="invoice" && editingId){
        closeNavDrawer();
        const wantsLeave = await showConfirm("عندك فاتورة قيد التعديل. تبي تطلع منها وتبدأ فاتورة جديدة؟ أي تغيير لسا ما حفظته بينحذف.");
        if(!wantsLeave) return;
        switchTab(btn.dataset.tab);
        return;
      }
      switchTab(btn.dataset.tab); closeNavDrawer();
    }));
    return;
  }

  // level 1: just the group names (trees) — tapping one opens its own screen (level 2 above)
  const groupsHtml = NAV_GROUPS.map(group=>{
    const visibleCount = group.items.filter(it=>{
      const srcBtn = document.querySelector(`.tab-btn[data-tab="${it.tab}"]`);
      return srcBtn && srcBtn.style.display!=="none";
    }).length;
    if(!visibleCount) return "";
    return `<button type="button" class="drawer-group-btn" data-group="${group.title}" style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:right;padding:14px 14px;border-radius:12px;border:1px solid ${group.color}55;border-right:4px solid ${group.color};background:${group.color}18;color:var(--ivory);font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;">
      <span>${group.title}</span><span style="color:${group.color};font-size:18px;">‹</span>
    </button>`;
  }).join("");
  container.innerHTML = groupsHtml || `<p class="sub">ما فيه عناصر متاحة.</p>`;
  container.querySelectorAll(".drawer-group-btn").forEach(btn=> btn.addEventListener("click", ()=>{
    navDrawerActiveGroup = btn.dataset.group; renderNavDrawer();
  }));
}
function openNavDrawer(){ navDrawerActiveGroup=null; renderNavDrawer(); $("navDrawerOverlay").classList.remove("hidden"); }
function closeNavDrawer(){ $("navDrawerOverlay").classList.add("hidden"); }
function isMonthClosed(m){ return state.closingReports.some(r=>r.monthLabel===m); }

