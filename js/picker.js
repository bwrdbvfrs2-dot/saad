// ---------------- the searchable picker (fabric and customer on the invoice) ----------------
// One list for every browser: on a computer it opens under the field and filters as you type (arrows, Enter,
// Esc); on a phone it opens as a sheet from the bottom with its own search box. The field keeps working as a
// plain text box too, so typing an exact name still works as before.
//   attachPicker(input, {title, items(query) -> [{id, label, sub, badge:{text, tone}, group}], onPick(item), when()})
const PICKER_PHONE = ()=> window.matchMedia && window.matchMedia("(max-width:700px)").matches;
let pickerOpen = null; // {input, opts, list, active, el, search?}
function pickerHighlight(label, query){
  const q = String(query||"").trim();
  const safe = esc(label);
  if(!q) return safe;
  const i = label.indexOf(q);
  return i<0 ? safe : esc(label.slice(0,i)) + "<mark>" + esc(label.slice(i, i+q.length)) + "</mark>" + esc(label.slice(i+q.length));
}
function pickerRowsHtml(list, query, active, emptyText){
  if(!list.length) return `<div class="pk-empty">${esc(emptyText||"ما لقينا شي بهالاسم")}</div>`;
  let html = "", lastGroup = null;
  list.forEach((it, i)=>{
    if(it.group && it.group!==lastGroup){ html += `<div class="pk-group">${esc(it.group)}</div>`; lastGroup = it.group; }
    html += `<div class="pk-row${i===active?" on":""}${it.dim?" dim":""}" data-i="${i}" role="option" aria-selected="${i===active}">
      <div class="pk-main"><b>${pickerHighlight(it.label, query)}</b>${it.sub?`<small>${esc(it.sub)}</small>`:""}</div>
      ${it.badge?`<span class="pk-badge ${it.badge.tone||""}">${esc(it.badge.text)}</span>`:""}
    </div>`;
  });
  return html;
}
function pickerRender(){
  const o = pickerOpen; if(!o) return;
  // until something is typed the whole list shows, with the current pick lit, so changing it needs no clearing
  const query = o.search ? o.search.value : (o.typed ? o.input.value : "");
  o.list = o.opts.items(query) || [];
  if(!o.typed && !o.search && o.firstRender!==false){ const cur = o.list.findIndex(it=> it.label===o.input.value); if(cur>=0) o.active = cur; o.firstRender = false; }
  if(o.active >= o.list.length) o.active = o.list.length ? 0 : -1;
  const box = o.el.querySelector(".pk-list");
  box.innerHTML = pickerRowsHtml(o.list, query, o.active, o.opts.emptyText);
  const on = box.querySelector(".pk-row.on"); if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
}
function pickerPlace(){
  const o = pickerOpen; if(!o || o.phone) return;
  const r = o.input.getBoundingClientRect();
  const w = Math.max(r.width, 320);
  o.el.style.width = w + "px";
  o.el.style.top = (r.bottom + window.scrollY + 4) + "px";
  o.el.style.left = Math.max(8, Math.min(r.right - w, document.documentElement.clientWidth - w - 8) + window.scrollX) + "px";
}
function pickerClose(){
  const o = pickerOpen; if(!o) return;
  o.el.remove(); if(o.backdrop) o.backdrop.remove();
  pickerOpen = null;
}
function pickerChoose(i){
  const o = pickerOpen; if(!o) return;
  const it = o.list[i]; if(!it) return;
  const {input, opts} = o;
  pickerClose();
  opts.onPick(it);
  if(!PICKER_PHONE()) input.focus();
}
function pickerOpenFor(input, opts){
  if(pickerOpen && pickerOpen.input===input) return;
  pickerClose();
  if(opts.when && !opts.when()) return;
  const typedFirst = opts.openOnFocus===false; // a list that opens only on typing filters from the first letter
  const phone = PICKER_PHONE();
  if(phone && opts.desktopOnly) return;
  const el = document.createElement("div");
  el.className = "pk-panel" + (phone ? " pk-sheet" : "");
  el.setAttribute("role", "listbox");
  el.innerHTML = (phone ? `<div class="pk-grip"></div><div class="pk-title">${esc(opts.title||"")}</div><input type="search" class="pk-search" placeholder="ابحث بالاسم أو الكود" autocomplete="off">` : "")
    + `<div class="pk-list"></div>`
    + (phone ? `<button type="button" class="btn btn-ghost pk-cancel">إلغاء</button>` : `<div class="pk-keys"><span><kbd>↑</kbd><kbd>↓</kbd> تنقّل</span><span><kbd>Enter</kbd> اختيار</span><span><kbd>Esc</kbd> إغلاق</span></div>`);
  let backdrop = null;
  if(phone){ backdrop = document.createElement("div"); backdrop.className = "pk-backdrop"; backdrop.addEventListener("click", pickerClose); document.body.appendChild(backdrop); }
  document.body.appendChild(el);
  pickerOpen = {input, opts, el, backdrop, phone, list:[], active:0, typed:typedFirst, search: phone ? el.querySelector(".pk-search") : null};
  // a press inside the list must not blur the field first (the list would close before the pick lands)
  el.addEventListener("mousedown", e=>{ if(!e.target.closest(".pk-search")) e.preventDefault(); });
  el.addEventListener("click", e=>{
    const row = e.target.closest(".pk-row"); if(row) pickerChoose(+row.dataset.i);
    if(e.target.closest(".pk-cancel")) pickerClose();
  });
  if(phone){
    const s = pickerOpen.search;
    s.addEventListener("input", ()=>{ pickerOpen.active = 0; pickerRender(); });
    s.addEventListener("keydown", e=> pickerKey(e));
    input.blur();
    setTimeout(()=> s.focus(), 30);
  }
  pickerRender(); pickerPlace();
}
function pickerKey(e){
  const o = pickerOpen; if(!o) return false;
  if(e.key==="ArrowDown"){ o.active = Math.min(o.list.length-1, o.active+1); pickerRender(); e.preventDefault(); return true; }
  if(e.key==="ArrowUp"){ o.active = Math.max(0, o.active-1); pickerRender(); e.preventDefault(); return true; }
  if(e.key==="Enter"){ if(o.active>=0 && o.list[o.active]){ e.preventDefault(); pickerChoose(o.active); return true; } return false; }
  if(e.key==="Escape"){ pickerClose(); e.preventDefault(); return true; }
  return false;
}
function attachPicker(input, opts){
  if(!input || input.dataset.picker) return;
  input.dataset.picker = "1";
  // a phone keeps its own suggestion list for a field the sheet doesn't take over
  if(!(opts.desktopOnly && PICKER_PHONE())) input.removeAttribute("list");
  input.setAttribute("autocomplete", "off");
  input.addEventListener("focus", ()=>{ if(!PICKER_PHONE() && opts.openOnFocus!==false) pickerOpenFor(input, opts); });
  input.addEventListener("click", ()=>{ if(opts.openOnFocus!==false || input.value.trim()) pickerOpenFor(input, opts); });
  input.addEventListener("input", ()=>{
    if(PICKER_PHONE()) return;
    if(!pickerOpen || pickerOpen.input!==input) pickerOpenFor(input, opts);
    if(pickerOpen){ pickerOpen.typed = true; pickerOpen.active = 0; pickerRender(); }
  });
  input.addEventListener("keydown", e=>{
    if(pickerOpen && pickerOpen.input===input){ pickerKey(e); return; }
    if(e.key==="ArrowDown"){ pickerOpenFor(input, opts); e.preventDefault(); }
  });
  input.addEventListener("blur", ()=>{ setTimeout(()=>{ if(pickerOpen && pickerOpen.input===input && !pickerOpen.phone) pickerClose(); }, 120); });
}
window.addEventListener("resize", ()=>{ if(pickerOpen && !pickerOpen.phone) pickerPlace(); });
window.addEventListener("scroll", ()=>{ if(pickerOpen && !pickerOpen.phone) pickerPlace(); }, {passive:true});

// the fabric list: «بدون قماش» first, then fabric in stock, then fabric with none left (still pickable, shown red)
const FABRIC_LOW_STOCK = 7; // under two thobes' worth
function fabricPickerItems(query){
  const q = normArabic(query);
  const NO = "أجرة تفصيل (بدون قماش)";
  const match = (...t)=> !q || t.some(x=> normArabic(x).includes(q));
  const out = [];
  if(match(NO, "بدون قماش")) out.push({id:"__none__", label:NO, sub:"المستفيد جايب قماشه"});
  const cards = activeFabricCards().map(c=>({c, avail:cardAvailableQty(c)}))
    .filter(({c})=> match(c.name, String(c.code||""), c.origin||"", c.season||""))
    .sort((a,b)=> (b.avail>0) - (a.avail>0) || String(a.c.name).localeCompare(String(b.c.name), "ar"));
  cards.forEach(({c, avail})=>{
    const tone = avail<=0.001 ? "out" : avail < FABRIC_LOW_STOCK ? "low" : "ok";
    out.push({id:c.id, label:c.name, sub:[c.code?`كود #${c.code}`:"", c.origin||"", c.season||""].filter(Boolean).join(" · "),
      badge:{text:`${+avail.toFixed(2)} ${unitLabel()}`, tone}, group: avail>0.001 ? "مخزون متوفر" : "بدون مخزون", dim: avail<=0.001});
  });
  return out;
}
// the customer list (only while no mobile is typed — once a mobile is in, its people show under it as before)
function customerPickerItems(query){
  const q = normArabic(query);
  if(!q) return [];
  const out = [];
  state.customers.forEach(c=> (c.individuals||[]).forEach(i=>{
    if(normArabic(i.name).includes(q) || String(c.mobile||"").includes(String(query).trim())) out.push({id:c.mobile+"|"+i.name, label:i.name, sub:`${c.mobile}${c.code?` · كود #${c.code}`:""}`, mobile:c.mobile});
  }));
  return out.slice(0, 40);
}
// a customer name box with a mobile box beside it (the tailoring invoice and the sales invoice)
function attachCustomerNamePicker(nameId, mobileId, isEditing){
  const inp = $(nameId);
  if(!inp) return;
  attachPicker(inp, {
    title: "اختر المستفيد", desktopOnly: true, openOnFocus: false, emptyText: "مستفيد جديد — كمّل الاسم والجوال",
    when: ()=> !$(mobileId).value.trim() && !(isEditing && isEditing()),
    items: customerPickerItems,
    onPick: it=>{
      $(mobileId).value = it.mobile; $(mobileId).dispatchEvent(new Event("input"));
      inp.value = it.label; inp.dispatchEvent(new Event("input"));
    },
  });
}
// a search box backed by a hidden id: the pick fills the box and fires the same input/change typing would
function pickInto(inp, value){ inp.value = value; inp.dispatchEvent(new Event("input", {bubbles:true})); inp.dispatchEvent(new Event("change", {bubbles:true})); }
function stockBadge(c){
  const avail = cardAvailableQty(c), unit = c.type==="fabric" ? unitLabel() : "قطعة";
  return {text:`${+avail.toFixed(2)} ${unit}`, tone: avail<=0.001 ? "out" : (c.type==="fabric" && avail < FABRIC_LOW_STOCK) ? "low" : "ok"};
}
function attachOtherPickers(){
  attachCustomerNamePicker("custName", "custMobile", ()=> typeof editingId!=="undefined" && !!editingId);
  attachCustomerNamePicker("saleCustName", "saleCustMobile");
  const sup = $("purchSupplierSearch");
  if(sup) attachPicker(sup, {title:"اختر المورد", emptyText:"ما فيه مورد بهالاسم — أضفه من «الموردين والدائنين»",
    items: q=>{ const n = normArabic(q); return state.suppliers.filter(s=>(s.kind||"مورد")==="مورد" && (!n || normArabic(s.name).includes(n))).map(s=>({id:s.id, label:s.name, sub:s.phone||""})); },
    onPick: it=> pickInto(sup, it.label)});
  const item = $("purchItemName");
  if(item) attachPicker(item, {title:"اختر الصنف", emptyText:"صنف جديد — يتسجّل كصنف جديد مع فاتورة الشراء",
    items: q=>{ const n = normArabic(q), type = $("purchType").value;
      return state.itemCards.filter(c=>c.type===type && (!n || normArabic(c.name).includes(n) || String(c.code||"").includes(String(q).trim())))
        .map(c=>({id:c.id, label:c.name, sub:[c.code?`كود #${c.code}`:"", c.origin||"", c.season||""].filter(Boolean).join(" · "), badge:stockBadge(c)})); },
    onPick: it=> pickInto(item, it.label)});
  const ql = $("quickLabelSearch");
  if(ql) attachPicker(ql, {title:"اختر الصنف", emptyText:"ما فيه صنف بهالاسم أو الباركود",
    items: q=>{ const n = normArabic(q);
      return quickLabelCards().filter(c=> !n || normArabic(c.name).includes(n) || String(c.code||"").includes(String(q).trim()))
        .slice(0, 80).map(c=>({id:c.id, label:`${c.name} — #${c.code}`, sub:c.type==="fabric" ? "قماش" : "منتج جاهز", badge:stockBadge(c)})); },
    onPick: it=> pickInto(ql, it.label)});
}
if(typeof window!=="undefined") window.addEventListener("DOMContentLoaded", attachOtherPickers);
