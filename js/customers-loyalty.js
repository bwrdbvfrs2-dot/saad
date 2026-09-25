// ---------------- calculations ----------------
function totalFixed(){
  const fixedItemsSum = state.settings.fixedItems.reduce((a,i)=>a+(parseFloat(i.amount)||0),0);
  const salariesSum = state.users.filter(u=>u.role!=="خياط").reduce((a,u)=>a+(u.baseSalary||0),0);
  return fixedItemsSum + salariesSum;
}
function totalGarmentsAllTime(){
  return state.invoices.reduce((a,inv)=>a+inv.garments.filter(g=>g.status!=="ملغي").length,0);
}
const BODY_CATEGORIES = ["رجال","ولادي","طفل"];
const MEASUREMENT_FIELDS = [
  {key:"frontLength", label:"طول أمام"}, {key:"backLength", label:"طول خلف"},
  {key:"shoulderSlope", label:"ميل الكتف"}, {key:"shoulderWidth", label:"عرض الكتف"},
  {key:"sleeveLength", label:"طول الكم سادة"}, {key:"upperSleeveWidth", label:"وسع الكم أعلى"},
  {key:"midSleeveWidth", label:"وسع الكم وسط"}, {key:"wristWidth", label:"وسع المعصم"},
  {key:"cuffWidth", label:"كفة الكم سادة"}, {key:"cuffLength", label:"طول الكبك"},
  {key:"cuffPocketWidth", label:"عرض الكبك"}, {key:"frontChestWidth", label:"وسع الصدر أمام"},
  {key:"backChestWidth", label:"وسع الصدر خلف"}, {key:"waistWidth", label:"وسع الوسط"},
  {key:"bottomWidth", label:"وسع أسفل"}, {key:"bottomCuff", label:"كفة أسفل"},
  {key:"neckHeight", label:"ارتفاع الرقبة سادة"}, {key:"neckWidth", label:"وسع الرقبة سادة"},
  {key:"turnedCollarHeight", label:"ارتفاع رقبة قلاب"}, {key:"turnedCollarWidth", label:"وسع رقبة قلاب"},
  {key:"placketHeight", label:"ارتفاع الجبزور"}, {key:"placketWidth", label:"عرض الجبزور"},
  {key:"hipWidth", label:"وسع الورك"}, {key:"chestPocketLength", label:"ط-جيب الصدر"},
  {key:"chestPocketWidth", label:"ع-جيب الصدر"}, {key:"mobilePocketLength", label:"ط-جيب الجوال"},
  {key:"mobilePocketWidth", label:"ع-جيب الجوال"}, {key:"walletPocketLength", label:"ط-جيب المحفظة"},
  {key:"walletPocketWidth", label:"ع-جيب المحفظة"}, {key:"betweenChestPocketShoulder", label:"بين جيب الصدر والكتف"},
  {key:"sidePocket", label:"جيب الجنب"}, {key:"takhalees", label:"تخاليص"},
  {key:"expectedFabricMeters", label:"القماش المتوقع بالمتر"},
];
const MEASUREMENT_CHOICE_FIELDS = [
  {key:"garmentType", label:"نوع الثوب", listKey:"garmentTypes"},
  {key:"collarType", label:"نوع الياقة", listKey:"collarTypes"},
  {key:"cufflinkType", label:"نوع الكبك", listKey:"cufflinkTypes"},
  {key:"pocketSewType", label:"نوع خياطة الجيب الجانبي", listKey:"pocketSewTypes"},
  {key:"chestPocketType", label:"نوع جيب الصدر", listKey:"chestPocketTypes"},
  {key:"fillingType", label:"نوع الحشوة", listKey:"fillingTypes"},
  {key:"jabzourType", label:"نوع الجبزور", listKey:"jabzourTypes"},
  {key:"modelType", label:"نوع المديل", listKey:"modelTypes"},
];
// paired length/width measurement fields shown inline right under their matching type selector, instead of buried in the flat fields grid
const PAIRED_SIZE_FIELDS = {
  collarType: ["neckHeight","neckWidth","turnedCollarHeight","turnedCollarWidth"],
  chestPocketType: ["chestPocketLength","chestPocketWidth"],
  jabzourType: ["placketHeight","placketWidth"],
  cufflinkType: ["cuffLength","cuffPocketWidth"],
};
// pocket groups with no image type library of their own — just a labeled box with their paired length/width fields
const UNLINKED_SIZE_GROUPS = [
  {label:"جيب الجوال", keys:["mobilePocketLength","mobilePocketWidth"]},
  {label:"جيب المحفظة", keys:["walletPocketLength","walletPocketWidth"]},
];
let cuttingImgArmedField = null;
let cuttingImgCurrentView = "front";
let cuttingImgPendingPoint1 = null;
function dimensionLineMarkup(x1,y1,x2,y2,strokeColor){
  const dx = x2-x1, dy = y2-y1;
  const len = Math.sqrt(dx*dx+dy*dy) || 1;
  const tx = -dy/len * 1.3, ty = dx/len * 1.3; // perpendicular tick vector
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="0.35" vector-effect="non-scaling-stroke"/>
    <line x1="${x1-tx}" y1="${y1-ty}" x2="${x1+tx}" y2="${y1+ty}" stroke="${strokeColor}" stroke-width="0.35" vector-effect="non-scaling-stroke"/>
    <line x1="${x2-tx}" y1="${y2-ty}" x2="${x2+tx}" y2="${y2+ty}" stroke="${strokeColor}" stroke-width="0.35" vector-effect="non-scaling-stroke"/>`;
}
function applyThemeMode(){
  document.documentElement.dataset.theme = state.settings.themeMode==="light" ? "light" : "dark";
}
function applyShopBranding(){
  const s = state.settings;
  const name = s.shopName || "";
  const displayName = name || "مسار";
  const hasLogo = !!s.shopLogo;
  const logoHtml = hasLogo ? `<img src="${s.shopLogo}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">` : "";
  if($("loginShopName")) $("loginShopName").textContent = displayName;
  if($("topbarShopName")) $("topbarShopName").textContent = displayName;
  if($("sidebarShopName")) $("sidebarShopName").textContent = displayName;
  if($("loginMark")){ $("loginMark").innerHTML = logoHtml; $("loginMark").classList.toggle("has-logo", hasLogo); }
  if($("topbarMark")){ $("topbarMark").innerHTML = logoHtml; $("topbarMark").classList.toggle("has-logo", hasLogo); }
  if($("sidebarMark")){ $("sidebarMark").innerHTML = logoHtml; $("sidebarMark").classList.toggle("has-logo", hasLogo); }
  document.title = name ? `${name} — مسار` : "مسار";
}
function globalSearchMatches(q){
  const qLower = q.toLowerCase();
  return state.invoices.filter(inv=> inv.number.includes(q) || (inv.customerName||"").toLowerCase().includes(qLower) || (inv.customerMobile||"").includes(q))
    .slice().reverse().slice(0,8);
}
function renderGlobalSearchResults(){
  const box = $("globalSearchResults");
  const q = ($("globalSearchInput").value||"").trim();
  if(!box) return;
  if(q.length<2){ box.classList.remove("show"); box.innerHTML=""; return; }
  const matches = globalSearchMatches(q);
  box.innerHTML = matches.length ? matches.map(inv=>`<button type="button" class="gs-item" data-number="${esc(inv.number)}">
      <div class="gs-title">${esc(inv.number)} — ${esc(inv.customerName||"عميل بدون اسم")}</div>
      <div class="gs-sub">${esc(inv.customerMobile||"—")} · ${inv.date}</div>
    </button>`).join("") : `<div class="gs-item"><span class="gs-sub">ما فيه نتائج مطابقة</span></div>`;
  box.classList.add("show");
  box.querySelectorAll(".gs-item[data-number]").forEach(btn=> btn.addEventListener("click", ()=>{
    const num = btn.dataset.number;
    box.classList.remove("show");
    $("globalSearchInput").value = "";
    switchTab("distribution");
    setTimeout(()=> openDistributionInvoiceByNumber(num), 150);
  }));
}
function renderCuttingImageEditor(){
  const images = state.settings.cuttingCardImages||{};
  const wrap = $("cuttingImgEditorWrap");
  if(!wrap) return;
  if(!images.front || !images.back){ wrap.style.display="none"; return; }
  wrap.style.display = "";
  const img = $("cuttingImgCanvas");
  img.src = images[cuttingImgCurrentView];
  $("cuttingImgViewFront").style.borderColor = cuttingImgCurrentView==="front" ? "var(--gold)" : "";
  $("cuttingImgViewBack").style.borderColor = cuttingImgCurrentView==="back" ? "var(--gold)" : "";
  const positions = state.settings.cuttingCardLabelPositions||{};
  const markersWrap = $("cuttingImgMarkers");
  const linesSvg = Object.entries(positions).filter(([k,p])=>p.view===cuttingImgCurrentView).map(([k,p])=>
    dimensionLineMarkup(p.x1,p.y1,p.x2,p.y2,"#c9a24b")
  ).join("");
  const pendingSvg = cuttingImgPendingPoint1 ? `<circle cx="${cuttingImgPendingPoint1.x}" cy="${cuttingImgPendingPoint1.y}" r="1" fill="#e33"/>` : "";
  const labelsHtml = Object.entries(positions).filter(([k,p])=>p.view===cuttingImgCurrentView).map(([k,p])=>{
    const field = MEASUREMENT_FIELDS.find(f=>f.key===k);
    const midX = (p.x1+p.x2)/2, midY = (p.y1+p.y2)/2;
    return `<div style="position:absolute;right:${100-midX}%;top:${midY}%;transform:translate(50%,-50%);">
      <span style="background:#fff;color:#000;font-size:10px;padding:1px 4px;border-radius:4px;white-space:nowrap;border:1px solid var(--gold);">${field?field.label:k}</span>
    </div>`;
  }).join("");
  markersWrap.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;">${linesSvg}${pendingSvg}</svg>${labelsHtml}`;
  $("cuttingImgFieldsList").innerHTML = MEASUREMENT_FIELDS.map(f=>{
    const pos = positions[f.key];
    const isArmed = cuttingImgArmedField===f.key;
    const statusIcon = pos ? "✅" : "○";
    return `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;">
      <button type="button" class="btn btn-ghost btn-sm cutting-field-btn" data-key="${f.key}" style="flex:1;text-align:right;${isArmed?"border-color:var(--gold);color:var(--gold-soft);":""}">${statusIcon} ${f.label}${pos?` (${pos.view==="front"?"أمام":"خلف"})`:""}</button>
      ${pos?`<button type="button" class="icon-btn cutting-field-clear" data-key="${f.key}" title="إزالة الخط">حذف</button>`:""}
    </div>`;
  }).join("");
  document.querySelectorAll(".cutting-field-btn").forEach(btn=> btn.addEventListener("click", ()=>{
    cuttingImgArmedField = cuttingImgArmedField===btn.dataset.key ? null : btn.dataset.key;
    cuttingImgPendingPoint1 = null;
    renderCuttingImageEditor();
  }));
  document.querySelectorAll(".cutting-field-clear").forEach(btn=> btn.addEventListener("click", (e)=>{
    e.stopPropagation();
    delete state.settings.cuttingCardLabelPositions[btn.dataset.key];
    saveState(); renderCuttingImageEditor();
  }));
}
function handleCuttingImageClick(e){
  if(!cuttingImgArmedField) { showToast("اضغط على تسمية قياس من القائمة أول، بعدين اضغط بالصورة"); return; }
  const img = $("cuttingImgCanvas");
  const rect = img.getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000)/10;
  const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000)/10;
  if(!cuttingImgPendingPoint1){
    cuttingImgPendingPoint1 = {x, y};
    showToast("تمام، الحين اضغط نقطة نهاية الخط");
    renderCuttingImageEditor();
    return;
  }
  const p1 = cuttingImgPendingPoint1;
  state.settings.cuttingCardLabelPositions[cuttingImgArmedField] = {view: cuttingImgCurrentView, x1:p1.x, y1:p1.y, x2:x, y2:y};
  saveState();
  const field = MEASUREMENT_FIELDS.find(f=>f.key===cuttingImgArmedField);
  showToast(`تم رسم خط "${field?field.label:cuttingImgArmedField}"`);
  cuttingImgArmedField = null;
  cuttingImgPendingPoint1 = null;
  renderCuttingImageEditor();
}
async function handleCuttingImageUpload(view, file){
  if(!file) return;
  if(file.size > 2*1024*1024){ showToast("حجم الصورة أكبر من 2 ميجا — اختر صورة أصغر"); return; }
  const dataUrl = await new Promise(resolve=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = ()=> resolve(null);
    reader.readAsDataURL(file);
  });
  if(!dataUrl){ showToast("تعذّرت قراءة الصورة"); return; }
  state.settings.cuttingCardImages[view] = dataUrl;
  saveState(); renderCuttingImageEditor();
  showToast(view==="front" ? "تم رفع صورة الأمام" : "تم رفع صورة الخلف");
}
let openMeasPanelIdx = null;
function openMeasPanel(idx){
  const card = $("garmentsHolder").children[idx];
  const panel = card && card.querySelector(".meas-panel");
  if(!panel) return;
  openMeasPanelIdx = idx;
  panel.style.display = "block";
  panel.classList.add("modal-open");
  $("measModalBackdrop").classList.remove("hidden");
}
function closeMeasPanel(){
  if(openMeasPanelIdx===null) return;
  const card = $("garmentsHolder").children[openMeasPanelIdx];
  const panel = card && card.querySelector(".meas-panel");
  if(panel){ panel.style.display = "none"; panel.classList.remove("modal-open"); }
  $("measModalBackdrop").classList.add("hidden");
  openMeasPanelIdx = null;
}
function garmentMeasurementSeasonFromItemCardId(itemCardId){
  if(!itemCardId || itemCardId==="__none__") return null;
  const card = findItemCard(itemCardId);
  if(!card || !card.season) return null;
  return card.season==="شتوي" ? "winter" : "summer";
}
function seasonLabelAr(key){ return key==="winter" ? "شتوي" : "صيفي"; }
function findIndividualRecord(mobile, name){
  const cust = findCustomerByMobile(mobile);
  if(!cust) return null;
  return cust.individuals.find(i=>i.name===name) || null;
}
function measurementSnapshotFromPanel(idx){
  const card = $("garmentsHolder").children[idx];
  if(!card) return null;
  const measurements = {};
  card.querySelectorAll(".meas-field").forEach(inp=>{ if(inp.value!=="") measurements[inp.dataset.key] = parseFloat(inp.value)||0; });
  card.querySelectorAll(".meas-choice").forEach(sel=>{ if(sel.value) measurements[sel.dataset.key] = sel.value; });
  const categorySel = card.querySelector(".g-category");
  return { date: todayStr(), measurements, category: categorySel ? categorySel.value : undefined };
}
function saveMeasurementSnapshotToHistory(idx){
  const mobile = $("custMobile").value.trim();
  const name = $("custName").value.trim();
  if(!/^[0-9]{10}$/.test(mobile) || !name){
    showToast("أدخل اسم العميل ورقم جواله كامل أول عشان يُحفظ المقاس بسجله");
    return;
  }
  const snapshot = measurementSnapshotFromPanel(idx);
  // an empty snapshot (nothing filled in yet) would silently push out a real saved measurement from
  // the 3-slot history ring buffer if allowed through — guard against saving blank/garbage entries
  if(!snapshot || !Object.keys(snapshot.measurements).length){
    showToast("ما فيه أي قياس معبّى بعد بهذا الكرت — عبّي شي أول عشان يُحفظ");
    return;
  }
  const card = $("garmentsHolder").children[idx];
  const itemCardId = card ? card.querySelector(".g-itemCard").value : "";
  const seasonKey = garmentMeasurementSeasonFromItemCardId(itemCardId);
  ensureCustomerIndividual(mobile, name);
  const individual = findIndividualRecord(mobile, name);
  if(!individual.measurementHistory) individual.measurementHistory = {summer:[], winter:[]};
  if(seasonKey){
    const list = individual.measurementHistory[seasonKey] || [];
    list.unshift(snapshot);
    individual.measurementHistory[seasonKey] = list.slice(0,3);
  }
  saveState();
  showToast(seasonKey ? `تم حفظ المقاس (${seasonLabelAr(seasonKey)}) بسجل العميل` : "تم الحفظ — بدون تصنيف موسمي لأن القماش المختار ما له موسم محدد بكرت الصنف");
}
// picks whichever of the two seasons' latest snapshot has the more recent date — lets a customer get
// their absolute last measurement regardless of season, independent of the currently selected fabric
function latestMeasurementSnapshotAnySeason(individual){
  const hist = individual && individual.measurementHistory;
  if(!hist) return null;
  const summer = hist.summer && hist.summer[0], winter = hist.winter && hist.winter[0];
  if(summer && winter) return summer.date >= winter.date ? {snapshot:summer, seasonKey:"summer"} : {snapshot:winter, seasonKey:"winter"};
  if(summer) return {snapshot:summer, seasonKey:"summer"};
  if(winter) return {snapshot:winter, seasonKey:"winter"};
  return null;
}
function loadMeasurementSnapshotIntoGarment(idx, seasonKey){
  const mobile = $("custMobile").value.trim();
  const name = $("custName").value.trim();
  const individual = findIndividualRecord(mobile, name);
  let snapshot, resolvedSeasonKey = seasonKey;
  if(seasonKey==="any"){
    const latest = latestMeasurementSnapshotAnySeason(individual);
    snapshot = latest && latest.snapshot; resolvedSeasonKey = latest && latest.seasonKey;
  } else {
    snapshot = individual && individual.measurementHistory && individual.measurementHistory[seasonKey] && individual.measurementHistory[seasonKey][0];
  }
  if(!snapshot){ showToast(seasonKey==="any" ? "ما فيه أي مقاس محفوظ سابقاً لهذا العميل" : `ما فيه مقاس ${seasonLabelAr(seasonKey)} محفوظ سابقاً لهذا العميل`); return; }
  const current = readGarmentFields();
  current[idx] = {...current[idx], measurements: {...snapshot.measurements}, category: snapshot.category||current[idx].category};
  renderGarmentFields(current);
  openMeasPanel(idx);
  showToast(`تم تحميل آخر مقاس ${seasonLabelAr(resolvedSeasonKey)} (${snapshot.date})`);
}
function buildMeasurementHistoryBoxHtml(idx, itemCardId){
  const mobile = $("custMobile") ? $("custMobile").value.trim() : "";
  const name = $("custName") ? $("custName").value.trim() : "";
  const individual = findIndividualRecord(mobile, name);
  const hist = individual && individual.measurementHistory;
  const summerCount = hist && hist.summer ? hist.summer.length : 0;
  const winterCount = hist && hist.winter ? hist.winter.length : 0;
  if(!summerCount && !winterCount) return "";
  const currentSeason = garmentMeasurementSeasonFromItemCardId(itemCardId);
  const seasonBtn = (seasonKey, count)=>{
    if(!count) return "";
    const date = hist[seasonKey][0].date;
    const highlighted = seasonKey===currentSeason;
    return `<button type="button" class="btn ${highlighted?"btn-gold":"btn-ghost"} btn-sm meas-fetch-season-btn" data-idx="${idx}" data-season="${seasonKey}" style="width:100%;margin-bottom:4px;">تحميل آخر مقاس ${seasonLabelAr(seasonKey)} — ${date}</button>`;
  };
  // only useful when both seasons have history — with just one season saved, its own button above is already "the last measurement, any season"
  const anyBtn = (summerCount && winterCount) ? `<button type="button" class="btn btn-ghost btn-sm meas-fetch-season-btn" data-idx="${idx}" data-season="any" style="width:100%;margin-bottom:4px;">تحميل آخر مقاس (بغض النظر عن الموسم)</button>` : "";
  return `<div style="margin-bottom:8px;">
    <p class="sub" style="font-size:10px;margin:0 0 4px;">مقاسات محفوظة سابقاً لهذا العميل:</p>
    ${seasonBtn("summer", summerCount)}${seasonBtn("winter", winterCount)}${anyBtn}
  </div>`;
}
function buildMannequinPreviewHtml(m){
  const garmentTypeItem = (state.garmentTypes||[]).find(o=>o.code===m.garmentType);
  if(!garmentTypeItem || !garmentTypeItem.image || !garmentTypeItem.imageBack){
    return `<div class="note-box" style="font-size:11px;text-align:center;">اختر "نوع الثوب" أول عشان تظهر صورة المنكل</div>`;
  }
  const collarItem = (state.collarTypes||[]).find(o=>o.code===m.collarType);
  const chestPocketItem = (state.chestPocketTypes||[]).find(o=>o.code===m.chestPocketType);
  const jabzourItem = (state.jabzourTypes||[]).find(o=>o.code===m.jabzourType);
  const cufflinkItem = (state.cufflinkTypes||[]).find(o=>o.code===m.cufflinkType);
  const view = (src, isFront, label)=> `<div style="position:relative;background:#fff;border-radius:8px;overflow:hidden;margin-bottom:8px;">
      <img src="${src}" style="width:100%;display:block;">
      ${isFront ? mannequinFrontOverlayHtml(collarItem, chestPocketItem, jabzourItem, cufflinkItem) : ""}
      <div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,.55);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;">${label}</div>
    </div>`;
  return `<div>${view(garmentTypeItem.image,true,"أمام")}${view(garmentTypeItem.imageBack,false,"خلف")}
    <p class="sub" style="font-size:10px;margin:0;">هذي معاينة للتأكد من الأنواع المختارة — كرت القصاص المطبوع يعرض أرقام القياسات على المنكل بدل الصور.</p>
  </div>`;
}
function renderMeasurementPanelHtml(g, idx){
  const m = g.measurements || {};
  const pairedKeys = new Set(Object.values(PAIRED_SIZE_FIELDS).flat().concat(UNLINKED_SIZE_GROUPS.flatMap(gr=>gr.keys)));
  const numFieldsHtml = MEASUREMENT_FIELDS.filter(f=>!pairedKeys.has(f.key)).map(f=>
    `<div class="field" style="margin-bottom:6px;"><label style="font-size:11px;">${f.label}</label><input type="number" step="0.01" class="meas-field" data-idx="${idx}" data-key="${f.key}" value="${m[f.key]!==undefined && m[f.key]!==null ? m[f.key] : ""}" placeholder="0"></div>`
  ).join("");
  const sizeInputHtml = key=>{
    const f = MEASUREMENT_FIELDS.find(x=>x.key===key);
    return `<div class="field" style="margin-bottom:0;"><label style="font-size:10.5px;">${f.label}</label><input type="number" step="0.01" class="meas-field" data-idx="${idx}" data-key="${key}" value="${m[key]!==undefined && m[key]!==null ? m[key] : ""}" placeholder="0"></div>`;
  };
  const garmentTypeField = MEASUREMENT_CHOICE_FIELDS.find(f=>f.key==="garmentType");
  const buildChoiceFieldHtml = f=>{
    const list = state[f.listKey]||[];
    const cur = m[f.key]||"";
    const curItem = list.find(o=>o.code===cur);
    const opts = `<option value="">-- اختر --</option>` + list.map(o=>`<option value="${esc(o.code)}" ${o.code===cur?"selected":""}>${esc(o.code)} - ${esc(o.label)}</option>`).join("");
    const pairedFieldKeys = PAIRED_SIZE_FIELDS[f.key];
    const pairedHtml = pairedFieldKeys ? `<div class="row-2" style="gap:6px;margin-top:6px;">${pairedFieldKeys.map(sizeInputHtml).join("")}</div>` : "";
    return `<div class="field" style="margin-bottom:6px;"><label style="font-size:11px;">${f.label}</label>
      <select class="meas-choice" data-idx="${idx}" data-key="${f.key}">${opts}</select>
      ${curItem && curItem.image ? `<img src="${curItem.image}" style="max-width:70px;max-height:70px;border-radius:6px;margin-top:4px;border:1px solid var(--border);">` : ""}
      ${pairedHtml}
    </div>`;
  };
  const garmentTypeFieldHtml = buildChoiceFieldHtml(garmentTypeField);
  const choiceFieldsHtml = MEASUREMENT_CHOICE_FIELDS.filter(f=>f.key!=="garmentType").map(buildChoiceFieldHtml).join("")
    + UNLINKED_SIZE_GROUPS.map(gr=> `<div class="field" style="margin-bottom:6px;"><label style="font-size:11px;">${gr.label}</label>
        <div class="row-2" style="gap:6px;">${gr.keys.map(sizeInputHtml).join("")}</div>
      </div>`).join("");
  return `<div class="meas-panel" data-idx="${idx}" style="display:none;margin-top:10px;background:var(--surface2);border-radius:10px;border:1px solid var(--border);">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface3);border-bottom:1px solid var(--border);">
      <b style="font-size:14px;">كرت المقاس — ثوب ${idx+1}</b>
      <button type="button" class="icon-btn meas-close-btn" data-idx="${idx}" title="إغلاق"><i data-lucide="x"></i></button>
    </div>
    <div style="display:flex;gap:14px;padding:14px;flex-wrap:wrap;">
      <div style="flex:1 1 320px;min-width:280px;">
        <div style="background:var(--surface3);border:1px solid var(--gold);border-radius:8px;padding:8px;margin-bottom:8px;">${garmentTypeFieldHtml}</div>
        ${buildMeasurementHistoryBoxHtml(idx, g.itemCardId)}
        ${buildMannequinPreviewHtml(m)}
      </div>
      <div style="flex:1 1 320px;min-width:280px;">
        <div class="row-2">${numFieldsHtml}</div>
        <div class="stitch"></div>
        <div class="row-2">${choiceFieldsHtml}</div>
        <div class="row-3" style="margin-top:6px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" class="meas-urgent" data-idx="${idx}" ${g.urgent?"checked":""}> مستعجل</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" class="meas-sample" data-idx="${idx}" ${g.sample?"checked":""}> عينة</label>
          <div class="field" style="margin:0;"><label style="font-size:11px;">اسم القصاص</label><input type="text" class="meas-cutter" data-idx="${idx}" value="${esc(g.cutter||"")}" placeholder="اسم القصاص"></div>
        </div>
        <div class="field" style="margin-top:6px;"><label style="font-size:11px;">شغل خاص / ملاحظات</label><textarea class="meas-notes" data-idx="${idx}" rows="2" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:8px 10px;color:var(--ivory);font-family:inherit;font-size:13px;">${esc(g.measurementNotes||"")}</textarea></div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;background:var(--surface3);border-top:1px solid var(--border);">
      <button type="button" class="btn btn-ghost btn-sm meas-close-btn" data-idx="${idx}">إغلاق</button>
      <button type="button" class="btn btn-gold btn-sm meas-save-btn" data-idx="${idx}">حفظ</button>
    </div>
  </div>`;
}
function findItemCard(id){ return state.itemCards.find(c=>c.id===id); }
function activeFabricCards(){ return state.itemCards.filter(c=>c.type==="fabric" && c.active); }
function activeProductCards(){ return state.itemCards.filter(c=>c.type==="product" && c.active); }
function cardAvailableQty(c){ return (c.openingBalance||0) + (c.stockQty||0) - (c.reservedQty||0); }
function unitLabel(){ return state.settings.measureUnit==="yard" ? "يارده" : "متر"; }
function garmentFabricCost(g){
  if(!g.itemCardId) return 0; // "أجرة تفصيل" or no fabric selected
  // fabric already cut is costed at the price it had when it was cut, so a later purchase at a
  // different price doesn't rewrite the cost (and profit) of garments already made
  if(g.fabricUnitCostAtCut!==undefined) return g.fabricUnitCostAtCut * (g.qtyUsed||0);
  const c = findItemCard(g.itemCardId);
  if(!c) return 0;
  return (c.currentCost||0) * (g.qtyUsed||0);
}
function reserveFabricForGarment(g){
  if(g.stockApplied || !g.itemCardId) return;
  const c = findItemCard(g.itemCardId);
  if(!c) return;
  c.reservedQty = (c.reservedQty||0) + (g.qtyUsed||0);
  g.stockApplied = "reserved";
}
function consumeFabricForGarment(g, actualQty){
  const c = findItemCard(g.itemCardId);
  if(!c) return;
  if(g.stockApplied==="reserved") c.reservedQty = Math.max(0, (c.reservedQty||0) - (g.qtyUsed||0));
  g.qtyUsed = actualQty;
  g.fabricUnitCostAtCut = c.currentCost||0;
  c.stockQty = (c.stockQty||0) - actualQty;
  g.stockApplied = "consumed";
}
function returnFabricForGarment(g){
  if(!g.itemCardId) return;
  const c = findItemCard(g.itemCardId);
  if(!c) return;
  if(g.stockApplied==="reserved") c.reservedQty = Math.max(0, (c.reservedQty||0) - (g.qtyUsed||0));
  // "consumed" fabric was physically cut for this garment — it can't be un-cut and resold as whole fabric,
  // so it is NOT credited back to sellable stock. The cost is tracked as a loss by the caller instead.
  g.stockApplied = null;
}

// ---------------- customer cards (shared phone number, multiple individuals) ----------------
function findCustomerByMobile(mobile){ return state.customers.find(c=>c.mobile===mobile); }
// A customer's standing, as two strictly separate things that must never be merged or confused:
//  - debt: MONEY owed for garments already HANDED OVER and not fully paid for (the garment left
//    the shop, the money didn't come in). A garment still in the shop is never debt, however
//    much of it is unpaid — the customer simply pays the rest on pickup.
//  - stuck garments: FINISHED garments (ready) still sitting in the shop, never picked up. This
//    is about goods, not money — no amount is attached to it.
// (Before, "debt" summed the unpaid part of every garment including ones still being cut or
// sewn, and "stuck" counted every undelivered garment including brand-new orders.)
function isStuckReadyGarment(g){
  return g.status==="جاهز" || (g.status==="معلقة" && !!g.readyDate); // معلقة = carried over at month close
}
// what's still owed on a garment handed over on credit: its own tracked balance, capped by what is
// still unpaid on the invoice as a whole — a payment taken from "مديونيات العملاء" or the
// distribution screen goes on the invoice without touching creditPaid, so the "مديونية الثياب"
// list kept showing the full amount owed and invited collecting it a second time
function creditGarmentOwed(g, inv){
  return Math.max(0, Math.min((g.creditAmount||0) - (g.creditPaid||0), invoiceRemaining(inv)));
}
function deliveredGarmentOwed(g, inv){
  if(g.status!=="تسليم") return 0;
  // a garment handed over on credit tracks its own balance; any other delivered garment owes
  // its share of whatever is still unpaid on the invoice
  if(g.creditDelivered) return creditGarmentOwed(g, inv);
  return Math.max(0, garmentRemaining(g, inv));
}
// ---- opening (pre-system) debt: what a customer already owed before being entered into the system.
// It isn't revenue (no VAT, no profit) — only collecting it moves money into the boxes.
function openingDebtPaymentsOf(cust){ return (state.openingDebtPayments||[]).filter(p=>p.customerId===cust.id); }
function openingDebtRemaining(cust){
  if(!cust || !(cust.openingDebt>0)) return 0;
  const paid = openingDebtPaymentsOf(cust).reduce((a,p)=>a+(p.cash||0)+(p.network||0),0);
  return Math.max(0, cust.openingDebt - paid - (cust.openingDebtWrittenOff||0));
}
function totalOpeningDebtRemaining(){ return state.customers.reduce((a,c)=>a+openingDebtRemaining(c),0); }
function getCustomerStandingAlert(mobile){
  const invs = state.invoices.filter(inv=>inv.customerMobile===mobile);
  const openingDebt = openingDebtRemaining(findCustomerByMobile(mobile));
  if(!invs.length && openingDebt<=0.01) return null;
  let debtAmount = 0;
  const debtInvoices = new Set();
  const stuckGarments = [];
  const convertedGarments = [];
  invs.forEach(inv=>{
    inv.garments.forEach(g=>{
      if(g.convertedToSale){ convertedGarments.push({inv, g}); return; }
      if(g.status==="ملغي") return;
      const owed = deliveredGarmentOwed(g, inv);
      if(owed > 0.01){ debtAmount += owed; debtInvoices.add(inv.number); }
      if(isStuckReadyGarment(g)) stuckGarments.push({inv, g});
    });
  });
  if(debtAmount<=0.01 && openingDebt<=0.01 && !stuckGarments.length && !convertedGarments.length) return null;
  return {debtAmount: debtAmount>0.01 ? debtAmount : 0, openingDebt: openingDebt>0.01 ? openingDebt : 0, debtInvoices:[...debtInvoices], stuckGarments, convertedGarments};
}
// renders the standing as separate, independent alert boxes — one per kind — into wrapId
function renderCustomerStandingAlerts(mobile, wrapId){
  const wrap = $(wrapId);
  if(!wrap) return;
  const alert = /^[0-9]{10}$/.test(mobile) ? getCustomerStandingAlert(mobile) : null;
  if(!alert){ wrap.style.display="none"; wrap.innerHTML=""; return; }
  const box = (color, bg, title, body, action)=> `<div style="background:${bg};border:1px solid ${color};border-radius:8px;padding:10px 12px;margin-bottom:8px;">
    <div style="color:${color};font-weight:800;margin-bottom:4px;">${title}</div>
    <div style="font-size:13px;">${body}</div>${action||""}</div>`;
  let html = "";
  if(alert.debtAmount>0 || alert.openingDebt>0){
    const parts = [];
    if(alert.openingDebt>0) parts.push(`دين سابق (مسجّل قبل النظام): <b>${alert.openingDebt.toFixed(0)} ريال</b>`);
    if(alert.debtAmount>0) parts.push(`مبلغ مستحق عن ثياب <b>تم تسليمها له</b> ولم يُسدد كامل قيمتها: <b>${alert.debtAmount.toFixed(0)} ريال</b> — فاتورة ${alert.debtInvoices.map(n=>"#"+esc(n)).join("، ")}`);
    html += box("var(--loss)", "rgba(224,90,90,0.12)", `💰 تنبيه دين: على العميل ${(alert.debtAmount+alert.openingDebt).toFixed(0)} ريال`,
      parts.join("<br>"),
      `<button type="button" class="btn btn-ghost btn-sm" onclick="switchTab('customerDebts')" style="margin-top:6px;">الذهاب لتسوية المديونية</button>`);
  }
  if(alert.stuckGarments.length){
    const byInv = {};
    alert.stuckGarments.forEach(({inv})=>{ byInv[inv.number] = (byInv[inv.number]||0)+1; });
    html += box("var(--gold)", "rgba(200,160,80,0.12)", `👔 تنبيه ثياب متعثرة: ${alert.stuckGarments.length} ثوب جاهز بالمحل لم يُستلم`,
      `ثياب <b>منجزة وجاهزة</b> ما زالت في المحل ولم تُسلَّم للعميل بعد — ${Object.entries(byInv).map(([n,c])=>`فاتورة #${esc(n)} (${c} ثوب)`).join("، ")}. هذا ليس ديناً مالياً.`);
  }
  if(alert.convertedGarments.length){
    html += box("var(--muted)", "rgba(128,128,128,0.10)", `ℹ ثياب سابقة تحوّلت وانباعت`,
      alert.convertedGarments.map(({inv,g})=>`ثوب سابق (فاتورة #${esc(inv.number)}) تحوّل "متعثر" وانباع لعميل ثاني بتاريخ ${g.saleConversionDate}`).join("<br>"));
  }
  wrap.style.display = "";
  wrap.innerHTML = html;
}
function findCustomerByIndividualName(name){
  if(!name) return null;
  for(const c of state.customers){
    if(c.individuals.some(i=>i.name===name)) return c;
  }
  return null;
}
function renderCustomerNameDatalist(datalistId){
  const names = new Set();
  state.customers.forEach(c=> c.individuals.forEach(i=> names.add(i.name)));
  $(datalistId).innerHTML = Array.from(names).map(n=>`<option value="${esc(n)}"></option>`).join("");
}
function ensureCustomerIndividual(mobile, name){
  if(!mobile || !name) return;
  let cust = findCustomerByMobile(mobile);
  if(!cust){ cust = {id:newId(), code:nextCustomerCode(), mobile, individuals:[], loyaltyPoints:0, vip:false}; state.customers.push(cust); }
  if(!cust.individuals.some(i=>i.name===name)) cust.individuals.push({id:Date.now()+"-"+Math.random().toString(36).slice(2,6), name, subCode:`${cust.code}-${cust.individuals.length+1}`});
}
function findLastGarmentDataForCustomer(mobile, name){
  if(!mobile) return null;
  const candidates = state.invoices.filter(inv=> inv.customerMobile===mobile && (!name || inv.customerName===name)).sort((a,b)=> b.date.localeCompare(a.date));
  for(const inv of candidates){
    for(const g of inv.garments){
      if(g.measurements && Object.keys(g.measurements).length>0) return g;
    }
  }
  return null;
}
function renderLoyaltyInfo(){
  const mobile = $("custMobile").value.trim();
  const wrap = $("loyaltyInfoWrap");
  if(!/^[0-9]{10}$/.test(mobile)){ wrap.style.display="none"; wrap.innerHTML=""; return; }
  const cust = findCustomerByMobile(mobile);
  if(!cust){ wrap.style.display="none"; wrap.innerHTML=""; return; }
  if(expireOldPointsForCustomer(mobile)) saveState();
  wrap.style.display = "";
  if(cust.vip){
    wrap.innerHTML = `<div class="note-box">عميل VIP — خارج نظام النقاط، يسمح بخصم حر بدون حد أقصى وقت التوزيع.</div>`;
    return;
  }
  const tier = customerTier(mobile);
  const canRedeem = cust.loyaltyPoints >= (state.settings.loyaltyMinRedeem||0) && cust.loyaltyPoints > 0;
  wrap.innerHTML = `<div class="note-box">${tierLabel(tier)} — رصيد النقاط الحالي: <b>${cust.loyaltyPoints||0}</b> نقطة (تساوي ${((cust.loyaltyPoints||0)*(state.settings.loyaltyRedeemRate||1)).toFixed(0)} ريال)</div>
    ${canRedeem ? `<div class="field" style="margin-top:8px;"><label>استخدام نقاط كخصم (المتاح: ${cust.loyaltyPoints} نقطة)</label><input type="number" id="loyaltyRedeemInput" min="0" max="${cust.loyaltyPoints}" placeholder="0"></div>` : ""}`;
  if($("loyaltyRedeemInput")) $("loyaltyRedeemInput").addEventListener("input", ()=>{
    const inp = $("loyaltyRedeemInput");
    if(appliedPromoCode && (parseInt(inp.value)||0)>0){
      inp.value = "";
      showToast("لا يمكن الجمع بين نقاط الولاء وكود خصم بنفس الفاتورة — أزل الكود أولاً");
      return;
    }
    updateLiveTotals();
  });
}
function refreshMeasurementsForCustomer(mobile, name){
  if(!/^[0-9]{10}$/.test(mobile) || !name || editingId) return;
  const lastGarment = findLastGarmentDataForCustomer(mobile, name);
  const current = readGarmentFields();
  let autoFilled = false;
  if(lastGarment && current[0] && Object.keys(current[0].measurements||{}).length===0){
    current[0] = {...current[0], measurements: {...lastGarment.measurements}, category: lastGarment.category||current[0].category};
    autoFilled = true;
  }
  const wasOpenIdx = openMeasPanelIdx;
  renderGarmentFields(current);
  if(wasOpenIdx!==null) openMeasPanel(wasOpenIdx);
  if(autoFilled) showToast("جبنا مقاسات هذا العميل من آخر فاتورة له — تقدر تعدّلها قبل الحفظ");
}
function renderCustomerPicker(mobileInputId, nameInputId, pickerWrapId){
  const mobile = $(mobileInputId).value.trim();
  const wrap = $(pickerWrapId);
  if(!/^[0-9]{10}$/.test(mobile)){ wrap.innerHTML=""; wrap.style.display="none"; return; }
  const cust = findCustomerByMobile(mobile);
  if(!cust || cust.individuals.length<=1){ wrap.innerHTML=""; wrap.style.display="none"; if(cust && cust.individuals.length===1){ $(nameInputId).value = cust.individuals[0].name; if(mobileInputId==="custMobile") refreshMeasurementsForCustomer(mobile, cust.individuals[0].name); } return; }
  wrap.style.display = "";
  wrap.innerHTML = `<label>هذا الرقم مسجّل لأكثر من فرد — اختر لمين الفاتورة</label>
    <div class="actions-row" style="margin-top:0;">
      ${cust.individuals.map(i=>`<button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('${nameInputId}').value='${i.name.replace(/'/g,"\\'")}'; ${mobileInputId==="custMobile"?`refreshMeasurementsForCustomer('${mobile}','${i.name.replace(/'/g,"\\'")}');`:""}">${i.name}</button>`).join("")}
      <button type="button" class="btn btn-ghost btn-sm" style="border-color:var(--gold);color:var(--gold-soft);" onclick="document.getElementById('${nameInputId}').value=''; document.getElementById('${nameInputId}').focus();">فرد جديد</button>
    </div>`;
}

// ---------------- loyalty program (points, tiers, VIP) ----------------
function customerTotalSpend(mobile){
  let total = 0;
  state.invoices.forEach(inv=>{ if(inv.customerMobile===mobile) total += invoiceSaleTotal(inv); });
  state.salesInvoices.forEach(inv=>{ if(inv.customerMobile===mobile) total += saleNetTotal(inv) - saleReturnsOf(inv).reduce((a,r)=>a+saleReturnValue(r),0); });
  return total;
}
function customerTier(mobile){
  const spend = customerTotalSpend(mobile);
  if(spend >= state.settings.loyaltyGoldThreshold) return "gold";
  if(spend >= state.settings.loyaltySilverThreshold) return "silver";
  return "bronze";
}
function tierLabel(tier){ return tier==="gold"?"ذهبي":tier==="silver"?"فضي":"برونزي"; }
function tierMultiplier(tier){
  if(tier==="gold") return state.settings.loyaltyGoldMultiplier||1;
  if(tier==="silver") return state.settings.loyaltySilverMultiplier||1;
  return 1;
}
function tierAutoDiscountPercent(tier){
  if(tier==="gold") return state.settings.loyaltyGoldDiscountPercent||0;
  if(tier==="silver") return state.settings.loyaltySilverDiscountPercent||0;
  return 0;
}
function isCustomerVip(mobile){ const c=findCustomerByMobile(mobile); return !!(c && c.vip); }
function expireOldPointsForCustomer(mobile){
  const cust = findCustomerByMobile(mobile);
  if(!cust) return false;
  const cutoffMs = 365*24*60*60*1000;
  const now = Date.now();
  const earnEntries = state.loyaltyLedger.filter(l=>l.mobile===mobile && l.type==="earn" && !l.expiredProcessed).sort((a,b)=>a.date.localeCompare(b.date));
  let changed = false;
  earnEntries.forEach(entry=>{
    const entryTime = new Date(entry.date).getTime();
    if(isNaN(entryTime) || now-entryTime < cutoffMs) return;
    entry.expiredProcessed = true;
    const toExpire = Math.min(entry.points, cust.loyaltyPoints||0);
    if(toExpire>0){
      cust.loyaltyPoints -= toExpire;
      state.loyaltyLedger.push({id:Date.now()+"-exp"+Math.random().toString(36).slice(2,5), date:todayStr(), mobile, type:"expire", points:toExpire, note:`سقوط نقاط اكتُسبت بتاريخ ${entry.date} (تجاوزت سنة بدون استخدام)`});
      changed = true;
    }
  });
  return changed;
}
function checkAllLoyaltyPointsExpiry(){
  let anyChanged = false;
  state.customers.forEach(cust=>{ if(expireOldPointsForCustomer(cust.mobile)) anyChanged = true; });
  if(anyChanged){ saveState(); renderAll(); }
}
setInterval(checkAllLoyaltyPointsExpiry, 60000);
function earnLoyaltyPoints(mobile, saleAmount){
  if(!mobile || isCustomerVip(mobile)) return 0;
  const cust = findCustomerByMobile(mobile);
  if(!cust) return 0;
  const tier = customerTier(mobile);
  const points = Math.floor(saleAmount / (state.settings.loyaltyEarnRate||10)) * tierMultiplier(tier);
  cust.loyaltyPoints = (cust.loyaltyPoints||0) + points;
  return points;
}
function reverseLoyaltyPoints(mobile, points){
  if(!mobile || !points) return;
  const cust = findCustomerByMobile(mobile);
  if(cust) cust.loyaltyPoints = Math.max(0, (cust.loyaltyPoints||0) - points);
}
function reverseInvoiceLoyaltyIfNeeded(inv, reasonNote){
  if(inv.loyaltyPointsEarned && !inv.loyaltyReversed){
    reverseLoyaltyPoints(inv.customerMobile, inv.loyaltyPointsEarned);
    inv.loyaltyReversed = true;
    if(reasonNote) state.loyaltyLedger.push({id:Date.now()+"-r"+Math.random().toString(36).slice(2,6), date:todayStr(), mobile:inv.customerMobile, type:"reverse", points:inv.loyaltyPointsEarned, invoiceNumber:inv.number, note:reasonNote});
  }
}

// ---------------- whatsapp helpers ----------------
function waLink(mobile, message){
  let phone = (mobile||"").replace(/\D/g,"");
  if(phone.startsWith("0")) phone = "966"+phone.slice(1);
  else if(!phone.startsWith("966")) phone = "966"+phone;
  return message ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : `https://wa.me/${phone}`;
}
function buildWelcomeMessage(inv){
  const lines = inv.garments.filter(g=>g.status!=="ملغي").map(g=>`- ${esc(g.fabricType)}${g.hasEmbroidery?" (مطرّز)":""}: ${garmentSalePrice(g).toFixed(0)} ريال`).join("\n");
  return `مرحباً ${esc(inv.customerName||"")} 👋\nتم استلام فاتورتك رقم ${esc(inv.number)} بتاريخ ${inv.date} بمحل ${state.settings.shopName||"محلنا"}.\n\nتفاصيل الفاتورة:\n${lines}\n\nالإجمالي: ${invoiceSaleTotal(inv).toFixed(0)} ريال\n\nشكراً لثقتك بنا 🌹`;
}
function buildReminderMessage(inv, g){
  return `مرحباً ${esc(inv.customerName||"")}،\nنذكّركم بأن ثوبكم (فاتورة رقم ${esc(inv.number)} — ${esc(g.fabricType)}) جاهز ولم يتم استلامه بعد. يرجى التكرم بمراجعتنا لاستلامه في أقرب وقت.\n\nشكراً لتفهمكم — ${state.settings.shopName||"محلنا"}`;
}
function buildReadyMessage(inv){
  return `مرحباً ${esc(inv.customerName||"")} 👋\nنبشّرك إن ثوبك بفاتورة رقم ${esc(inv.number)} صار جاهز للاستلام من ${state.settings.shopName||"محلنا"} 🎉\nبانتظارك!`;
}
// shows a clickable "send WhatsApp" button in the given banner element as a fallback when the direct-open
// trick below didn't get us a live tab — a manual click always gets past the popup blocker.
function showReadyWaBanner(bannerId, inv){
  const banner = $(bannerId);
  if(!banner) return;
  if(!inv.customerMobile){ banner.style.display="none"; return; }
  banner.innerHTML = `<div class="note-box" style="text-align:center;"><a href="${waLink(inv.customerMobile, buildReadyMessage(inv))}" target="_blank" class="btn btn-gold btn-sm" style="display:inline-block;text-decoration:none;">إرسال رسالة واتساب للعميل: ثوبك جاهز 🎉</a></div>`;
  banner.style.display = "";
}
// call this SYNCHRONOUSLY, still inside the click (or click-derived confirm-dialog) handler, before any
// await — opens a blank tab now (allowed, since it's tied to a fresh user gesture) so we can navigate it
// to the real WhatsApp link later once the async save resolves and we know it succeeded. Navigating an
// already-open window afterward isn't subject to popup blocking, only opening a NEW one is.
function openReadyWaPopup(inv){
  if(!inv.customerMobile) return null;
  try{ return window.open('', '_blank'); }catch(e){ return null; }
}
// finishes the trick above: navigates the pre-opened tab to the real link, or falls back to the manual
// banner button if the tab never opened (e.g. blocked for some other reason, or customerMobile was missing).
function finishReadyWaPopup(popup, bannerId, inv){
  if(popup && !popup.closed && inv.customerMobile){
    popup.location.href = waLink(inv.customerMobile, buildReadyMessage(inv));
    if($(bannerId)) $(bannerId).style.display = "none";
  } else {
    if(popup && !popup.closed) popup.close();
    showReadyWaBanner(bannerId, inv);
  }
}
// ---------------- promo codes engine ----------------
let appliedPromoCode = null; // {id, code, type, value, giftDescription}
function findActivePromoCode(codeText){
  const code = (codeText||"").trim().toUpperCase();
  if(!code) return null;
  const today = todayStr();
  return state.promoCodes.find(p=> p.code.toUpperCase()===code && p.active && p.startDate<=today && p.endDate>=today) || null;
}
function currentPromoDiscountAmount(invoiceTotal){
  if(!appliedPromoCode) return 0;
  if(appliedPromoCode.type==="percentage") return invoiceTotal * (appliedPromoCode.value/100);
  if(appliedPromoCode.type==="fixed_voucher") return Math.min(appliedPromoCode.value, invoiceTotal);
  return 0; // gift type has no price impact
}
function resetGarmentPricesToBase(){
  Array.from($("garmentsHolder").children).forEach(card=>{
    const itemCardId = card.querySelector(".g-itemCard").value;
    if(!itemCardId || itemCardId==="__none__") return; // no fabric card — nothing to reset to
    const c = findItemCard(itemCardId);
    if(!c || c.type!=="fabric") return;
    const category = card.querySelector(".g-category").value;
    const basePrice = c.prices[category];
    if(basePrice===undefined || basePrice===null) return;
    const priceInp = card.querySelector(".g-price");
    priceInp.value = basePrice;
  });
}
function hasActiveDiscountOffer(){
  if(appliedPromoCode) return true;
  if(!selectedOfferIds.length) return false;
  const offer = state.offers.find(o=>o.id===selectedOfferIds[0]);
  return !!offer && offer.type==="quantity_discount";
}
function updatePriceFieldsLockState(){
  const locked = hasActiveDiscountOffer();
  Array.from($("garmentsHolder").children).forEach(card=>{
    const priceInp = card.querySelector(".g-price");
    const catSel = card.querySelector(".g-category");
    const fabricSearch = card.querySelector(".g-itemCard-search");
    if(priceInp){ priceInp.disabled = locked; priceInp.title = locked ? "السعر مقفل — لا يمكن التعديل عند وجود كود خصم أو باقة عرض مفعّلة" : ""; }
    if(catSel){ catSel.disabled = locked; }
    if(fabricSearch){ fabricSearch.disabled = locked; }
  });
  const lockNote = $("priceLockNote");
  if(lockNote) lockNote.style.display = locked ? "" : "none";
}
function applyPromoCodeInput(){
  const inp = $("promoCodeInput");
  const codeText = inp.value.trim();
  if(!codeText){ showToast("أدخل كود الخصم أولاً"); return; }
  const redeemInp = $("loyaltyRedeemInput");
  const pointsEntered = redeemInp ? (parseInt(redeemInp.value)||0) : 0;
  if(pointsEntered>0){ showToast("لا يمكن الجمع بين كود خصم ونقاط الولاء بنفس الفاتورة — أزل النقاط أولاً"); return; }
  const match = findActivePromoCode(codeText);
  if(!match){ showToast("الكود غير صحيح أو منتهي الصلاحية أو غير مفعّل"); return; }
  resetGarmentPricesToBase();
  appliedPromoCode = match;
  renderAppliedPromoBanner();
  updatePriceFieldsLockState();
  updateLiveTotals();
  showToast(`تم تطبيق الكود: ${match.code} — تم ضبط الأسعار على السعر الأساسي بالكرت قبل الخصم، ولا يمكن تعديلها يدوياً بعد الآن`);
}
function removeAppliedPromoCode(){
  appliedPromoCode = null;
  $("promoCodeInput").value = "";
  renderAppliedPromoBanner();
  updatePriceFieldsLockState();
  updateLiveTotals();
}
function renderAppliedPromoBanner(){
  const wrap = $("appliedPromoBanner");
  if(!wrap) return;
  if(!appliedPromoCode){ wrap.style.display="none"; wrap.innerHTML=""; return; }
  wrap.style.display = "";
  let desc;
  if(appliedPromoCode.type==="percentage") desc = `خصم نسبة ${appliedPromoCode.value}%`;
  else if(appliedPromoCode.type==="fixed_voucher") desc = `قسيمة خصم ${appliedPromoCode.value} ﷼`;
  else desc = `هدية عينية: ${appliedPromoCode.giftDescription} — تذكّر تسليمها للعميل!`;
  wrap.innerHTML = `<div class="item-row" style="background:rgba(87,171,124,0.12);border:1px solid var(--profit);border-radius:8px;padding:8px 12px;"><span style="color:var(--profit);font-weight:700;">كود "${esc(appliedPromoCode.code)}" — ${desc}</span><button type="button" class="btn btn-ghost btn-sm" onclick="removeAppliedPromoCode()">إلغاء</button></div>`;
}
function nextPromoCodeId(){ return Date.now()+"-"+Math.random().toString(36).slice(2,6); }
function savePromoCodeForm(){
  const code = $("promoNewCode").value.trim().toUpperCase();
  const type = $("promoNewType").value;
  const startDate = $("promoNewStart").value;
  const endDate = $("promoNewEnd").value;
  if(!code){ showToast("أدخل نص الكود"); return; }
  if(state.promoCodes.some(p=>p.code.toUpperCase()===code)){ showToast("هذا الكود مستخدم مسبقاً — اختر كوداً آخر"); return; }
  if(!startDate || !endDate){ showToast("أدخل تاريخ البداية والنهاية"); return; }
  if(endDate < startDate){ showToast("تاريخ النهاية لازم يكون بعد تاريخ البداية"); return; }
  let value = 0, giftDescription = "";
  if(type==="percentage"){
    value = parseFloat($("promoNewValue").value)||0;
    if(value<=0 || value>100){ showToast("النسبة لازم تكون بين 1 و100"); return; }
  } else if(type==="fixed_voucher"){
    value = parseFloat($("promoNewValue").value)||0;
    if(value<=0){ showToast("أدخل قيمة القسيمة"); return; }
  } else {
    giftDescription = $("promoNewGiftDesc").value.trim();
    if(!giftDescription){ showToast("أدخل وصف الهدية العينية"); return; }
  }
  state.promoCodes.push({id:nextPromoCodeId(), code, type, value, giftDescription, startDate, endDate, active:true});
  saveState(); renderPromoCodesAdmin();
  $("promoNewCode").value=""; $("promoNewValue").value=""; $("promoNewGiftDesc").value="";
  showToast("تم إنشاء الكود بنجاح");
}
function togglePromoCodeActive(id){
  const p = state.promoCodes.find(x=>x.id===id);
  if(p){ p.active = !p.active; saveState(); renderPromoCodesAdmin(); }
}
async function deletePromoCode(id){
  if(!await showConfirm("متأكد تبي تحذف هذا الكود نهائياً؟")) return;
  state.promoCodes = state.promoCodes.filter(p=>p.id!==id);
  saveState(); renderPromoCodesAdmin();
}
function renderPromoCodesAdmin(){
  const el = $("promoCodesListView");
  if(!el) return;
  if(!state.promoCodes.length){ el.innerHTML = `<p class="sub">ما فيه أكواد بعد.</p>`; return; }
  const typeLabel = (p)=> p.type==="percentage" ? `نسبة ${p.value}%` : p.type==="fixed_voucher" ? `قسيمة ${p.value} ﷼` : `هدية: ${esc(p.giftDescription)}`;
  el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>الكود</th><th>النوع</th><th>من</th><th>إلى</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${state.promoCodes.map(p=>`<tr><td><b>${esc(p.code)}</b></td><td>${typeLabel(p)}</td><td>${p.startDate}</td><td>${p.endDate}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="togglePromoCodeActive('${p.id}')">${p.active?"مفعّل":"معطّل"}</button></td>
      <td><button class="btn btn-ghost btn-sm" style="color:var(--loss);border-color:var(--loss);" onclick="deletePromoCode('${p.id}')"><i data-lucide="trash-2"></i></button></td></tr>`).join("")}
  </tbody></table></div>`;
}
// every garment cut this month shares the month's fixed costs — including one cut and later
// cancelled, which is charged its share too. (Leaving it out of the count while still charging it a
// share billed the fixed costs more than once: 3 cut, 1 cancelled → 150% of them.)
function garmentsCutInMonth(monthLabel){
  let n = 0;
  state.invoices.forEach(inv=> inv.garments.forEach(g=>{
    if(g.cutDate && g.cutDate.slice(0,7)===monthLabel) n++;
  }));
  return n;
}
// a sales invoice's lines keep their list prices; any promo code / offer / direct discount is stored
// once on the invoice (discountTotal) — every total, profit, VAT and refund goes through these
// a free gift leaves stock at its cost with nothing charged for it. Gifts recorded before the cost was
// stored on them fall back to the item's current cost
function freeGiftCost(f){ const c = findItemCard(f.itemCardId); return (f.qty||0) * (f.costAtSale!==undefined ? f.costAtSale : (c ? c.currentCost||0 : 0)); }
function freeGiftsCost(inv){ return (inv.freeGifts||[]).reduce((a,f)=>a+freeGiftCost(f),0); }
function saleSubtotal(inv){ return inv.items.reduce((a,it)=>a+it.qty*it.price,0); }
function saleNetTotal(inv){ return Math.max(0, saleSubtotal(inv) - (inv.discountTotal||0)); }
function saleNetFactor(inv){ const s = saleSubtotal(inv); return s>0 ? saleNetTotal(inv)/s : 1; }
function salesInvoiceProfit(inv){
  // a free gift leaves stock at its cost with nothing charged for it — that cost comes off the sale's profit
  const giftCost = freeGiftsCost(inv);
  return inv.items.reduce((a,it)=>a+((it.price-(it.costAtSale||0))*it.qty),0) - (inv.discountTotal||0) - giftCost;
}
// ---------------- sales returns ----------------
// a return is booked on the day it happens (its own month / VAT period), never back-dated into the
// original sale — the same way a garment return reverses revenue in the month it's cancelled
function saleReturnsOf(inv){ return (state.salesReturns||[]).filter(r=>r.saleInvoiceId===inv.id); }
function saleLineReturnedQty(inv, lineIdx){
  return saleReturnsOf(inv).reduce((a,r)=>a+r.lines.filter(l=>l.lineIdx===lineIdx).reduce((s,l)=>s+l.qty,0),0);
}
function saleReturnValue(r){ return r.lines.reduce((a,l)=>a+l.qty*l.price,0); }
function saleReturnProfit(r){ return r.lines.reduce((a,l)=>a+l.qty*(l.price-(l.costAtSale||0)),0); }
function salesReturnsInRange(from, to){ return (state.salesReturns||[]).filter(r=>inDateRange(r.date, from, to)); }
function legacySoldProfitForMonth(monthLabel){
  return state.legacyPayments.filter(p=>(p.date||"").slice(0,7)===monthLabel).reduce((a,p)=>a+p.amount,0);
}
function totalSalesProfitForMonth(monthLabel){
  return state.salesInvoices.filter(inv=>(inv.date||"").slice(0,7)===monthLabel).reduce((a,inv)=>a+salesInvoiceProfit(inv),0)
    - (state.salesReturns||[]).filter(r=>(r.date||"").slice(0,7)===monthLabel).reduce((a,r)=>a+saleReturnProfit(r),0)
    + legacySoldProfitForMonth(monthLabel);
}
function currentFixedShare(extra=0, monthLabel=state.settings.currentMonth){
  const n = garmentsCutInMonth(monthLabel)+extra;
  const rawFixed = totalFixed();
  const salesProfit = totalSalesProfitForMonth(monthLabel);
  const effectiveFixed = Math.max(0, rawFixed - salesProfit); // ready-made sales profit offsets fixed costs before تفصيل bears any of it
  return n>0 ? effectiveFixed/n : 0;
}
function garmentAddonsInfo(g){ return (g.addons||[]).map(id=>state.addonDefs.find(a=>a.id===id)).filter(Boolean); }
function addonUnitPrice(a){ return a.kind==="service" ? (a.servicePrice||0) : (findItemCard(a.itemCardId)?.currentCost||0)*(1+(a.markupPercent||0)/100)*(a.qtyPerGarment||1); }
function garmentAddonsTotal(g){
  // once an invoice is saved, g.addonsSaleSnapshot freezes what the customer was actually charged
  // for addons — same treatment as g.price/g.embroideryPrice, so it can't drift after the fact.
  // while the garment is still being filled out in the invoice form (not saved yet), there's no
  // snapshot and this correctly falls back to a live read of current addon prices for the preview.
  if(g.addonsSaleSnapshot!==undefined) return g.addonsSaleSnapshot;
  return garmentAddonsInfo(g).reduce((sum,a)=> sum+addonUnitPrice(a), 0);
}
// what physical addons actually COST the shop: purchase cost × quantity — NOT the sale price.
// (This used addonUnitPrice(), which includes the markup, so cost always equalled the selling price
// and every addon showed zero profit while inflating the garment's cost.)
function addonUnitCost(a){ return a.kind==="physical" ? (findItemCard(a.itemCardId)?.currentCost||0)*(a.qtyPerGarment||1) : 0; }
function garmentAddonsCost(g){ return garmentAddonsInfo(g).filter(a=>a.kind==="physical").reduce((sum,a)=> sum+addonUnitCost(a), 0); }
function applyAddonsStock(g){
  if(g.addonsStockApplied) return;
  garmentAddonsInfo(g).filter(a=>a.kind==="physical").forEach(a=>{
    const c = findItemCard(a.itemCardId); if(c) c.stockQty = (c.stockQty||0) - (a.qtyPerGarment||1);
  });
  g.addonsStockApplied = true;
}
function reverseAddonsStock(g){
  if(!g.addonsStockApplied) return;
  garmentAddonsInfo(g).filter(a=>a.kind==="physical").forEach(a=>{
    const c = findItemCard(a.itemCardId); if(c) c.stockQty = (c.stockQty||0) + (a.qtyPerGarment||1);
  });
  g.addonsStockApplied = false;
}
function garmentSalePrice(g){ return (g.price||0) + (g.hasEmbroidery? (g.embroideryPrice||0):0) + garmentAddonsTotal(g); }
function tailorWageFor(g){
  const t = g.tailor ? state.users.find(u=>u.username===g.tailor && u.role==="خياط") : null;
  if(t){
    const rate = g.category==="رجال" ? t.wageMen : g.category==="ولادي" ? t.wageChild : t.wageChildSmall;
    if(rate>0) return rate;
  }
  return state.settings.wage||0; // fallback: no tailor assigned yet, or tailor has no custom rate for this category
}
function computeCostSnapshot(g, fixedShare){
  const s=state.settings;
  return garmentFabricCost(g) + tailorWageFor(g) + s.padding + (g.hasEmbroidery? s.embroideryWage:0) + garmentAddonsCost(g) + fixedShare;
}
function liveGarmentCost(g){ return computeCostSnapshot(g, currentFixedShare()); }
function garmentCostFor(g, inv){ return isMonthClosed(inv.originMonth) ? (g.costSnapshot||0) : liveGarmentCost(g); }
function invoiceDirectCostTotal(inv){ return inv.garments.reduce((a,g)=> a+(g.status==="ملغي"?0:computeCostSnapshot(g,0)),0); }
function invoiceFixedShareTotal(inv){ return inv.garments.filter(g=>g.status!=="ملغي").length * currentFixedShare(); }
function invoicePaid(inv){ return (inv.payments||[]).reduce((a,p)=>a+(p.cash||0)+(p.network||0),0); }
function invoiceDiscountTotal(inv){ return (inv.payments||[]).reduce((a,p)=>a+(p.discount||0),0); }
function invoiceSaleTotal(inv){ return inv.garments.reduce((a,g)=> a+(g.status==="ملغي"?0:garmentSalePrice(g)),0); }
function invoiceCostTotal(inv){ return inv.garments.reduce((a,g)=> a+(g.status==="ملغي"?0:garmentCostFor(g,inv)),0); }
// money already handed back to the customer through a recorded return
function invoiceRefunded(inv){ return (state.invoiceReturns||[]).filter(r=>r.invoiceId===inv.id).reduce((a,r)=>a+(r.refundAmount||0),0); }
function invoiceRemaining(inv){
  const remaining = invoiceSaleTotal(inv) - invoicePaid(inv) - invoiceDiscountTotal(inv);
  // once a return is recorded the refund (or a kept deposit) settles the difference — without this a
  // returned invoice showed the shop owing the customer everything they'd paid, refunded or not
  return (state.invoiceReturns||[]).some(r=>r.invoiceId===inv.id) ? Math.max(0, remaining) : remaining;
}
function userDiscountEnabled(user){ return !!(user && user.discountEnabled); }
function userMaxDiscountAmount(user, baseAmount){
  if(!user || !user.discountEnabled) return 0;
  return user.discountType==="percent" ? baseAmount*(user.discountValue||0)/100 : (user.discountValue||0);
}

