// ---------------- e-invoicing readiness (ZATCA Phase 1: XML + QR + hash chaining) ----------------
async function sha256Hex(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function genUUID(){
  if(crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{ const r=Math.random()*16|0; return (c==="x"?r:(r&0x3|0x8)).toString(16); });
}
function buildUblXml(inv, total, vatAmount, uuid, hash, prevHash){
  const s = state.settings;
  const esc = t=> String(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const lines = inv.garments.filter(g=>g.status!=="ملغي").map((g,i)=>{
    const price = garmentSalePrice(g);
    const lineVat = price - (price/(1+(s.vatRate||0)/100));
    const lineExclusive = price - lineVat;
    return `  <cac:InvoiceLine>
    <cbc:ID>${i+1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${lineExclusive.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${lineVat.toFixed(2)}</cbc:TaxAmount></cac:TaxTotal>
    <cac:Item><cbc:Name>${esc(g.fabricType)}</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="SAR">${lineExclusive.toFixed(2)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(inv.number)}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${inv.date}</cbc:IssueDate>
  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${prevHash}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme><cbc:CompanyID>${esc(s.vatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(s.shopLegalName)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${esc(inv.customerName)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${vatAmount.toFixed(2)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="SAR">${(total-vatAmount).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
}
function tlvField(tag, value){
  const valBytes = new TextEncoder().encode(value);
  return new Uint8Array([tag, valBytes.length, ...valBytes]);
}
function buildZatcaQrBase64(sellerName, vatNumber, isoTimestamp, total, vatAmount){
  const parts = [
    tlvField(1, sellerName||""),
    tlvField(2, vatNumber||""),
    tlvField(3, isoTimestamp),
    tlvField(4, total.toFixed(2)),
    tlvField(5, vatAmount.toFixed(2)),
  ];
  const totalLen = parts.reduce((a,p)=>a+p.length,0);
  const merged = new Uint8Array(totalLen);
  let offset=0; parts.forEach(p=>{ merged.set(p, offset); offset+=p.length; });
  let binary=""; merged.forEach(b=> binary+=String.fromCharCode(b));
  return btoa(binary);
}
function vatAmountFromTotal(total){
  const rate = state.settings.vatRate||0;
  if(rate<=0) return 0;
  const includeVat = state.settings.pricesIncludeVat!==false;
  return includeVat ? (total - (total/(1+rate/100))) : (total*rate/100);
}
async function generateEinvoiceForNewInvoice(inv){
  if(!state.settings.einvoiceEnabled) return null;
  const total = invoiceSaleTotal(inv);
  const vatAmount = vatAmountFromTotal(total);
  const uuid = genUUID();
  const prevHash = state.lastInvoiceHash;
  const xml = buildUblXml(inv, total, vatAmount, uuid, "", prevHash);
  const hash = await sha256Hex(xml);
  const qrBase64 = buildZatcaQrBase64(state.settings.shopLegalName, state.settings.vatNumber, serverDate().toISOString(), total, vatAmount);
  state.lastInvoiceHash = hash;
  return {uuid, xml, hash, prevHash, qrBase64, vatAmount, total, generatedAt: serverDate().toISOString()};
}
async function loadQrLib(){
  if(window.QRCode) return;
  await new Promise((resolve,reject)=>{
    const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
  });
}
// JsBarcode ships locally (js/vendor/jsbarcode.all.min.js, loaded on every page load) instead of
// from a CDN — a barcode printed at the till can't depend on the shop's internet being up at that
// exact moment, and a failed/slow CDN fetch used to silently print the card with no barcode at all.
async function loadBarcodeLib(){
  if(!window.JsBarcode) throw new Error("JsBarcode failed to load from js/vendor/jsbarcode.all.min.js");
}
async function loadHtml2CanvasLib(){
  if(window.html2canvas) return;
  await new Promise((resolve,reject)=>{
    const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
  });
}
function buildReceiptHtml(inv){
  const s = state.settings;
  const total = invoiceSaleTotal(inv);
  const vatAmount = s.vatEnabled ? vatAmountFromTotal(total) : 0;
  const taxableTotal = total - vatAmount;
  const paid = (inv.payments||[]).reduce((a,p)=>a+p.cash+p.network+(p.discount||0),0);
  const remaining = total - paid;
  const itemsRows = inv.garments.filter(g=>g.status!=="ملغي").map(g=>{
    const price = garmentSalePrice(g);
    return `<tr>
      <td style="padding:3px 2px;border-bottom:1px dashed #ccc;">${esc(g.fabricType)}${g.category?" - "+g.category:""}</td>
      <td style="text-align:center;padding:3px 2px;border-bottom:1px dashed #ccc;">1</td>
      <td style="text-align:center;padding:3px 2px;border-bottom:1px dashed #ccc;">${price.toFixed(2)}</td>
      <td style="text-align:left;padding:3px 2px;border-bottom:1px dashed #ccc;">${price.toFixed(2)}</td>
    </tr>`;
  }).join("");
  return `
  <div id="receiptShareRoot" style="width:100%;max-width:${(s.thermalPaperWidth||58)===80?300:220}px;font-family:var(--font-main);direction:rtl;text-align:right;font-size:16px;line-height:1.5;margin:0 auto;background:#fff;color:#000;padding:2px 8px 8px;">
    <div style="text-align:center;">
      ${s.shopLogo?`<img src="${s.shopLogo}" style="max-width:80px;max-height:80px;">`:""}
      <h3 style="margin:6px 0;">${esc(s.shopName||"—")}</h3>
    </div>
    <p style="margin:2px 0;">الرقم الضريبي: ${esc(s.vatNumber||"—")}</p>
    <p style="margin:2px 0;">التليفون: ${esc(s.shopPhone||"—")}</p>
    <p style="margin:2px 0;">${esc(s.shopAddress||"")}</p>
    <hr>
    <p style="text-align:center;font-weight:700;">فاتورة ضريبية مبسطة</p>
    <div style="text-align:center;page-break-inside:avoid;break-inside:avoid;"><svg id="receiptBarcodeHolder" style="max-width:90%;height:auto;"></svg></div>
    <p style="margin:2px 0;">رقم الفاتورة: ${esc(inv.number)}</p>
    <p style="margin:2px 0;">تاريخ إصدار الفاتورة: ${inv.date}</p>
    <p style="margin:2px 0;">تاريخ التسليم المتوقع: ${inv.expectedDeliveryDate||"—"}</p>
    <p style="margin:2px 0;">العميل: ${esc(inv.customerName||"—")}</p>
    <p style="margin:2px 0;">الجوال: ${esc(inv.customerMobile||"—")}</p>
    <hr>
    <table style="width:100%;border-collapse:collapse;font-size:15px;table-layout:fixed;">
      <colgroup><col style="width:46%;"><col style="width:14%;"><col style="width:20%;"><col style="width:20%;"></colgroup>
      <thead><tr>
        <th style="text-align:right;padding:3px 2px;border-bottom:1px solid #000;font-weight:700;">الصنف</th>
        <th style="text-align:center;padding:3px 2px;border-bottom:1px solid #000;font-weight:700;">الكمية</th>
        <th style="text-align:center;padding:3px 2px;border-bottom:1px solid #000;font-weight:700;">السعر</th>
        <th style="text-align:left;padding:3px 2px;border-bottom:1px solid #000;font-weight:700;">الاجمالي</th>
      </tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <hr>
    <p style="margin:2px 0;">الاجمالي: ${total.toFixed(2)}</p>
    ${s.vatEnabled ? `<p style="margin:2px 0;">الاجمالي الخاضع للضريبة (غير شامل الضريبة): ${taxableTotal.toFixed(2)}</p>
    <p style="margin:2px 0;">ضريبة القيمة المضافة: ${vatAmount.toFixed(2)}</p>` : ""}
    <p style="margin:2px 0;font-weight:700;">إجمالي المبلغ المستحق: ${total.toFixed(2)}</p>
    <p style="margin:2px 0;">المبلغ المدفوع: ${paid.toFixed(2)}</p>
    <p style="margin:2px 0;font-weight:700;">المبلغ المتبقي: ${remaining.toFixed(2)}</p>
    <hr>
    <p style="font-size:14px;white-space:pre-line;">${esc(s.receiptTerms||"")}</p>
    <div id="receiptQrHolder" style="text-align:center;margin-top:8px;"></div>
  </div>`;
}
function buildCuttingCardHtml(inv, gIdx){
  const g = inv.garments[gIdx];
  const m = g.measurements||{};
  const s = state.settings;
  const val = k=> m[k]!==undefined && m[k]!==null && m[k]!=="" ? m[k] : "—";
  const has = k=> m[k]!==undefined && m[k]!==null && m[k]!=="";
  const collarImg = (state.collarTypes||[]).find(o=>o.code===m.collarType);
  const cufflinkImg = (state.cufflinkTypes||[]).find(o=>o.code===m.cufflinkType);
  const pocketImg = (state.pocketSewTypes||[]).find(o=>o.code===m.pocketSewType);
  const chestPocketImg = (state.chestPocketTypes||[]).find(o=>o.code===m.chestPocketType);
  const fillingItem = (state.fillingTypes||[]).find(o=>o.code===m.fillingType);
  const jabzourImg = (state.jabzourTypes||[]).find(o=>o.code===m.jabzourType);
  const modelItem = (state.modelTypes||[]).find(o=>o.code===m.modelType);
  const garmentTypeItem = (state.garmentTypes||[]).find(o=>o.code===m.garmentType);
  const customer = findCustomerByMobile(inv.customerMobile);
  const garmentCount = inv.garments.filter(x=>x.status!=="ملغي").length;
  const PHONE_ICON = `<svg viewBox="0 0 24 24" width="24" height="24"><rect x="6" y="2" width="12" height="20" rx="2.2" fill="none" stroke="#333" stroke-width="1.4"/><line x1="10" y1="19" x2="14" y2="19" stroke="#333" stroke-width="1.4"/></svg>`;
  const WALLET_ICON = `<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="6" width="20" height="14" rx="2" fill="none" stroke="#333" stroke-width="1.4"/><path d="M2 10h20" stroke="#333" stroke-width="1.4"/><circle cx="17" cy="14" r="1.3" fill="#333"/></svg>`;
  // left-column identification boxes: type image + label + (optional) linked measurements
  const infoBox = (label, item, sizeLine, iconHtml, big)=> `<div style="border:1px solid #999;border-radius:6px;padding:4px;margin-bottom:5px;text-align:center;background:#fafafa;">
      <div style="font-size:${big?"10.5px":"9px"};font-weight:700;margin-bottom:3px;">${label}</div>
      <div style="height:46px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        ${item && item.image ? `<img src="${item.image}" style="max-width:100%;max-height:100%;">` : (iconHtml || `<span style="font-size:${big?"10px":"8.5px"};color:#999;">—</span>`)}
      </div>
      <div style="font-size:${big?"10px":"8.5px"};margin-top:3px;min-height:11px;">${item?esc(item.label):""}</div>
      ${sizeLine ? `<div style="font-size:${big?"10.5px":"9px"};font-weight:700;margin-top:2px;color:#333;">${sizeLine}</div>` : ""}
    </div>`;
  const collarSizeLine = `سادة: ارتفاع ${val('neckHeight')} / وسع ${val('neckWidth')}`
    + ((has('turnedCollarHeight')||has('turnedCollarWidth')) ? ` — قلاب: ارتفاع ${val('turnedCollarHeight')} / وسع ${val('turnedCollarWidth')}` : "");
  const cufflinkSizeLine = `عرض الكفة ${val('cuffLength')} / وسع الكبك ${val('cuffPocketWidth')}`;
  const leftBoxesHtml = `
    ${infoBox("نوع الياقة", collarImg, collarSizeLine)}
    ${infoBox("نوع جيب الصدر", chestPocketImg, `طول ${val('chestPocketLength')} / عرض ${val('chestPocketWidth')}`)}
    ${infoBox("نوع الجبزور", jabzourImg, `طول ${val('placketHeight')} / عرض ${val('placketWidth')}`)}
    ${(has('mobilePocketLength')||has('mobilePocketWidth')) ? infoBox("جيب الجوال", null, `طول ${val('mobilePocketLength')} / عرض ${val('mobilePocketWidth')}`, PHONE_ICON) : ""}
    ${(has('walletPocketLength')||has('walletPocketWidth')) ? infoBox("جيب المحفظة", null, `طول ${val('walletPocketLength')} / عرض ${val('walletPocketWidth')}`, WALLET_ICON) : ""}
  `;
  // "جداول" template: no mannequin at all — every filled-in field (type or plain number) gets its own box in one grid
  function buildTablesBodyHtml(){
    const TAKHALEES_ICON = s.takhaleesIcon ? `<img src="${s.takhaleesIcon}" style="max-width:100%;max-height:100%;">` : undefined;
    const choiceBoxesHtml = [
      garmentTypeItem ? infoBox("نوع الثوب", garmentTypeItem, null, undefined, true) : "",
      collarImg ? infoBox("نوع الياقة", collarImg, collarSizeLine, undefined, true) : "",
      chestPocketImg ? infoBox("نوع جيب الصدر", chestPocketImg, `طول ${val('chestPocketLength')} / عرض ${val('chestPocketWidth')}`, undefined, true) : "",
      jabzourImg ? infoBox("نوع الجبزور", jabzourImg, `طول ${val('placketHeight')} / عرض ${val('placketWidth')}`, undefined, true) : "",
      cufflinkImg ? infoBox("نوع الكبك", cufflinkImg, cufflinkSizeLine, undefined, true) : "",
      pocketImg ? infoBox("نوع خياطة الجيب الجانبي", pocketImg, null, undefined, true) : "",
      fillingItem ? infoBox("نوع الحشوة", fillingItem, null, undefined, true) : "",
      modelItem ? infoBox("نوع الموديل", modelItem, null, undefined, true) : "",
      (has('mobilePocketLength')||has('mobilePocketWidth')) ? infoBox("جيب الجوال", null, `طول ${val('mobilePocketLength')} / عرض ${val('mobilePocketWidth')}`, PHONE_ICON, true) : "",
      (has('walletPocketLength')||has('walletPocketWidth')) ? infoBox("جيب المحفظة", null, `طول ${val('walletPocketLength')} / عرض ${val('walletPocketWidth')}`, WALLET_ICON, true) : "",
    ].join("");
    // plain numeric fields not already shown above inside a type's own box (avoids duplicating طول/عرض pairs)
    const pairedKeys = new Set(Object.values(PAIRED_SIZE_FIELDS).flat().concat(UNLINKED_SIZE_GROUPS.flatMap(gr=>gr.keys)));
    const plainBoxesHtml = MEASUREMENT_FIELDS.filter(f=> has(f.key) && !pairedKeys.has(f.key))
      .map(f=> infoBox(f.label, null, val(f.key), f.key==="takhalees" ? TAKHALEES_ICON : undefined, true)).join("");
    return `<div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px;">${choiceBoxesHtml}${plainBoxesHtml}</div></div>`;
  }
  const tablesBodyHtml = s.cuttingCardTemplate==="tables" ? buildTablesBodyHtml() : null;
  // photo-based diagram: prefers the selected garment type's own front/back photos, falls back to the admin-uploaded generic photos, with hand-placed measurement label positions overlaid when configured
  function buildPhotoDiagramHtml(images){
    const positions = s.cuttingCardLabelPositions||{};
    const isCustomTemplate = s.cuttingCardTemplate==="custom";
    const viewHtml = (view)=>{
      const entries = Object.entries(positions).filter(([k,p])=>p.view===view);
      const linesSvg = entries.map(([k,p])=> dimensionLineMarkup(p.x1,p.y1,p.x2,p.y2,"#c00")).join("");
      const labelsHtml = entries.map(([k,p])=>{
        const field = MEASUREMENT_FIELDS.find(f=>f.key===k);
        const label = field ? field.label : k;
        const midX = (p.x1+p.x2)/2, midY = (p.y1+p.y2)/2;
        const text = isCustomTemplate ? val(k) : `${label}: ${val(k)}`;
        return `<div style="position:absolute;right:${100-midX}%;top:${midY}%;transform:translate(50%,-50%);">
          <span style="background:rgba(255,255,255,0.92);color:#000;font-size:${isCustomTemplate?"11px;font-weight:700;":"9px;"}padding:1px 4px;border-radius:3px;white-space:nowrap;border:0.5px solid #999;">${text}</span>
        </div>`;
      }).join("");
      return `<div style="position:relative;width:100%;">
        <img src="${images[view]}" style="width:100%;max-height:320px;object-fit:contain;display:block;margin:0 auto;">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;">${linesSvg}</svg>
        ${labelsHtml}
      </div>`;
    };
    return {front: viewHtml('front'), back: viewHtml('back')};
  }
  const diagramImages = (garmentTypeItem && garmentTypeItem.image && garmentTypeItem.imageBack) ? {front:garmentTypeItem.image, back:garmentTypeItem.imageBack}
    : (s.cuttingCardImages && s.cuttingCardImages.front && s.cuttingCardImages.back) ? s.cuttingCardImages : null;
  const diagramParts = diagramImages ? buildPhotoDiagramHtml(diagramImages) : null;
  // any measurement that has a value but isn't already shown elsewhere on the card (a hand-placed
  // position on the mannequin photo, configured via الإعدادات ← صورة كرت القصاص — or, with no photo
  // uploaded yet, one of the handful of fields embedded directly in the generic schematic drawing)
  // falls back to a plain table instead of silently not printing anywhere, or duplicating what's
  // already on the diagram
  const alreadyShownKeys = diagramParts ? new Set(Object.keys(s.cuttingCardLabelPositions||{}))
    : new Set(["frontChestWidth","frontLength","bottomWidth","chestPocketLength","chestPocketWidth","shoulderWidth","backLength","sleeveLength"]);
  const unmappedFields = MEASUREMENT_FIELDS.filter(f=> has(f.key) && !alreadyShownKeys.has(f.key));
  const unmappedTableHtml = unmappedFields.length ? `<div style="margin-top:6px;border:1px solid #999;border-radius:6px;padding:5px 6px;">
      <div style="font-size:9px;font-weight:700;margin-bottom:3px;">قياسات إضافية (بدون موضع على المنكل)</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px 10px;">
        ${unmappedFields.map(f=>`<div style="display:flex;justify-content:space-between;gap:4px;font-size:8.5px;border-bottom:1px dotted #ccc;padding:1px 0;"><span>${esc(f.label)}</span><b>${val(f.key)}</b></div>`).join("")}
      </div>
    </div>` : "";
  const bodyHtml = tablesBodyHtml ? tablesBodyHtml : diagramParts ? `<div>
    <div style="display:flex;gap:6px;align-items:flex-start;">
      <div style="flex:1.1;">${diagramParts.front}<div style="text-align:center;font-size:9px;color:#666;">أمام</div></div>
      <div style="flex:1.1;">${diagramParts.back}<div style="text-align:center;font-size:9px;color:#666;">خلف</div></div>
      <div style="width:108px;flex-shrink:0;">${leftBoxesHtml}</div>
    </div>
    ${unmappedTableHtml}
  </div>` : `<div>
    <div style="display:flex;gap:6px;align-items:flex-start;">
      <div style="flex:1;">${buildFallbackDiagramSvg(val)}</div>
      <div style="width:108px;flex-shrink:0;">${leftBoxesHtml}</div>
    </div>
    ${unmappedTableHtml}
  </div>`;
  const customerCode = customer ? customer.code : "—";
  // "جداول" template already shows these inside their own boxes — no need to repeat them in the header line
  const extraTypesLine = tablesBodyHtml ? "" : [
    cufflinkImg ? `نوع الكبك: ${esc(cufflinkImg.label)} (${cufflinkSizeLine})` : "",
    pocketImg ? `نوع خياطة الجيب الجانبي: ${esc(pocketImg.label)}` : "",
    fillingItem ? `نوع الحشوة: ${esc(fillingItem.label)}` : "",
    modelItem ? `نوع الموديل: ${esc(modelItem.label)}` : "",
  ].filter(Boolean).join(" &nbsp;—&nbsp; ");
  return `<div style="width:700px;font-family:var(--font-main);direction:rtl;text-align:right;font-size:12px;line-height:1.3;">
    <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:6px;border-bottom:2px solid #333;padding-bottom:5px;align-items:start;">
      <div>
        <h3 style="margin:0;font-size:14px;">${esc(s.shopName||"—")}</h3>
        <p style="margin:1px 0;font-size:9.5px;">${esc(s.shopAddress||"")}</p>
        <p style="margin:1px 0;font-size:9.5px;">${esc(s.shopPhone||"—")}</p>
        ${s.shopLogo?`<img src="${s.shopLogo}" style="max-height:30px;margin-top:2px;">`:""}
      </div>
      <div style="font-size:9.5px;">
        <p style="margin:1px 0;">تاريخ الفاتورة: ${inv.date}</p>
        <p style="margin:1px 0;">تاريخ التسليم المتوقع: ${inv.expectedDeliveryDate||"—"}</p>
        <p style="margin:1px 0;">اسم العميل: ${esc(inv.customerName||"—")}</p>
      </div>
      <div style="font-size:9.5px;">
        <p style="margin:1px 0;">جوال العميل: ${esc(inv.customerMobile||"—")}</p>
        <p style="margin:1px 0;">كود العميل: ${esc(customerCode)}</p>
        <p style="margin:1px 0;">رقم الفاتورة: ${esc(inv.number)}</p>
      </div>
      <div style="text-align:center;">
        <svg id="cuttingBarcodeHolder" style="max-width:150px;max-height:42px;"></svg>
        <div style="font-size:9.5px;font-weight:700;">${esc(inv.number)}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-top:4px;font-size:9.5px;">
      <span>عدد الأثواب: ${garmentCount}</span><span>اسم القماش: ${esc(g.fabricType)}</span>
      <span>اسم الخياط: ${esc(g.tailor||"—")}</span><span>نوع التفصيل: ${garmentTypeItem?esc(garmentTypeItem.label):"—"}</span>
      <span>الفئة: ${esc(g.category||"—")}</span><span>الكمية المستهلكة: ${g.qtyUsed?g.qtyUsed+" "+unitLabel():"—"}</span>
    </div>
    ${extraTypesLine ? `<p style="margin:3px 0;font-size:9.5px;">${extraTypesLine}</p>` : ""}
    <hr style="margin:4px 0;">
    ${bodyHtml}
    <hr style="margin:4px 0;">
    <div style="border-top:2px dashed #000;padding-top:4px;">
      <p style="margin:2px 0;font-size:10px;">${g.urgent?"مستعجل &nbsp;&nbsp;":""}${g.sample?"عينة &nbsp;&nbsp;":""}<b>ملاحظات / شغل خاص:</b> ${esc(g.measurementNotes||"—")}</p>
    </div>
    <div style="display:flex;border-top:2px dashed #000;margin-top:6px;">
      <div style="flex:1;padding:6px 8px;border-left:2px dashed #000;text-align:center;">
        <div style="font-size:9px;">${inv.date} — ${esc(inv.customerName||"—")}</div>
        <div style="font-size:9px;">فاتورة #${esc(inv.number)} — ${garmentCount} ثوب</div>
        <svg id="cuttingBarcodeHolderStub1" style="max-width:130px;max-height:34px;"></svg>
        <div style="font-size:9px;font-weight:700;">${esc(inv.number)}</div>
        <div style="font-size:10px;font-weight:700;margin-top:2px;">${esc(s.shopName||"—")}</div>
      </div>
      <div style="flex:1;padding:6px 8px;text-align:center;">
        <div style="font-size:9px;">${inv.date} — ${esc(inv.customerName||"—")}</div>
        <div style="font-size:9px;">فاتورة #${esc(inv.number)} — ${garmentCount} ثوب</div>
        <svg id="cuttingBarcodeHolderStub2" style="max-width:130px;max-height:34px;"></svg>
        <div style="font-size:9px;font-weight:700;">${esc(inv.number)}</div>
        <div style="font-size:10px;font-weight:700;margin-top:2px;">القصاص: ${esc(g.cutter||"—")}</div>
      </div>
    </div>
  </div>`;
}
function buildFallbackDiagramSvg(val){
  return `<svg viewBox="0 0 620 480" style="width:100%;max-width:620px;max-height:320px;display:block;margin:0 auto;" xmlns="http://www.w3.org/2000/svg">
    <!-- front view -->
    <g stroke="#333" fill="none" stroke-width="1.8" stroke-linejoin="round">
      <path d="M85,58 C68,95 62,140 66,190 C70,240 60,300 58,350 C57,385 60,410 68,432
               Q150,444 232,432 C240,410 243,385 242,350 C240,300 230,240 234,190
               C238,140 232,95 215,58" fill="#fbfbfa"/>
      <path d="M87,62 C58,80 30,110 14,148 C10,160 10,170 14,178
               C24,182 34,182 42,177 C52,150 68,116 90,100 Z" fill="#fbfbfa"/>
      <path d="M213,62 C242,80 270,110 286,148 C290,160 290,170 286,178
               C276,182 266,182 258,177 C248,150 232,116 210,100 Z" fill="#fbfbfa"/>
      <path d="M13,166 C22,172 34,172 43,166"/>
      <path d="M287,166 C278,172 266,172 257,166"/>
      <path d="M126,57 C130,42 170,42 174,57" stroke-width="1.8"/>
      <path d="M132,57 L132,70 M168,57 L168,70" stroke-width="1"/>
      <path d="M150,70 L150,220" stroke-width="1"/>
      <circle cx="150" cy="92" r="2.3" fill="#333"/>
      <circle cx="150" cy="117" r="2.3" fill="#333"/>
      <circle cx="150" cy="142" r="2.3" fill="#333"/>
      <path d="M163,148 L196,148 L196,182 Q179.5,190 163,182 Z" stroke-width="1.3"/>
      <path d="M163,148 L196,148" stroke-width="1.6"/>
    </g>
    <text x="150" y="45" text-anchor="middle" font-size="12">وسع الصدر أمام: ${val('frontChestWidth')}</text>
    <text x="150" y="470" text-anchor="middle" font-size="12">طول أمام: ${val('frontLength')}</text>
    <text x="20" y="140" text-anchor="end" font-size="12">وسع أسفل: ${val('bottomWidth')}</text>
    <text x="150" y="205" text-anchor="middle" font-size="11">ط-جيب الصدر: ${val('chestPocketLength')} / ع: ${val('chestPocketWidth')}</text>
    <!-- back view -->
    <g transform="translate(320,0)">
      <g stroke="#333" fill="none" stroke-width="1.8" stroke-linejoin="round">
        <path d="M128,54 Q150,64 172,54"/>
        <path d="M85,58 C68,95 62,140 66,190 C70,240 60,300 58,350 C57,385 60,410 68,432
                 Q150,444 232,432 C240,410 243,385 242,350 C240,300 230,240 234,190
                 C238,140 232,95 215,58" fill="#fbfbfa"/>
        <path d="M87,62 C58,80 30,110 14,148 C10,160 10,170 14,178
                 C24,182 34,182 42,177 C52,150 68,116 90,100 Z" fill="#fbfbfa"/>
        <path d="M213,62 C242,80 270,110 286,148 C290,160 290,170 286,178
                 C276,182 266,182 258,177 C248,150 232,116 210,100 Z" fill="#fbfbfa"/>
        <path d="M13,166 C22,172 34,172 43,166"/>
        <path d="M287,166 C278,172 266,172 257,166"/>
        <path d="M85,58 C68,95 62,140 66,190 C70,240 60,300 58,350" stroke-width="1"/>
        <path d="M215,58 C232,95 238,140 234,190 C230,240 240,300 242,350" stroke-width="1"/>
      </g>
    </g>
    <text x="470" y="45" text-anchor="middle" font-size="12">عرض الكتف: ${val('shoulderWidth')}</text>
    <text x="470" y="470" text-anchor="middle" font-size="12">طول خلف: ${val('backLength')}</text>
    <text x="600" y="140" text-anchor="start" font-size="12">طول الكم: ${val('sleeveLength')}</text>
  </svg>`;
}
async function printCuttingCard(invId, gIdx){
  const inv = state.invoices.find(i=>i.id===invId);
  if(!inv) return;
  // an unset @page falls back to whatever margin the browser/OS/printer defaults to, which
  // varies a lot across devices (measured 15-50mm+ combined vertical margin in the wild) --
  // this card's content sits right at ~246mm tall, so on any device with generous default
  // margins it silently overflows onto a second page. An explicit, tight, predictable margin
  // removes that variable entirely and guarantees this always fits on one A4 page.
  $("dynamicPageSize").textContent = "@media print{ @page{ size:A4; margin:8mm; } }";
  $("printArea").innerHTML = buildCuttingCardHtml(inv, gIdx);
  await loadBarcodeLib().catch(e=>{ console.error(e); });
  if(window.JsBarcode){
    const drawBarcode = (id, opts)=>{ try{ window.JsBarcode(id, inv.number, opts); }catch(e){ console.error("barcode render failed for "+id, e); } };
    drawBarcode("#cuttingBarcodeHolder", {format:"CODE128", width:1.6, height:36, fontSize:11, margin:2});
    drawBarcode("#cuttingBarcodeHolderStub1", {format:"CODE128", width:1.3, height:28, fontSize:10, margin:2});
    drawBarcode("#cuttingBarcodeHolderStub2", {format:"CODE128", width:1.3, height:28, fontSize:10, margin:2});
  }
  setTimeout(()=> safePrint(), 250);
}
async function renderReceiptIntoPrintArea(inv){
  const html = buildReceiptHtml(inv);
  $("printArea").innerHTML = html;
  try{
    await loadBarcodeLib();
    window.JsBarcode("#receiptBarcodeHolder", inv.number, {format:"CODE128", width:1.1, height:32, fontSize:10, margin:2});
  }catch(e){ /* barcode lib needs internet on first use — receipt still works fine without it */ }
  try{
    await loadQrLib();
    const s = state.settings;
    const total = invoiceSaleTotal(inv);
    const vatAmount = s.vatEnabled ? vatAmountFromTotal(total) : 0;
    const qrBase64 = buildZatcaQrBase64(s.shopName||s.shopLegalName, s.vatNumber, new Date(inv.date).toISOString(), total, vatAmount);
    new window.QRCode($("printArea").querySelector("#receiptQrHolder"), {text: qrBase64, width:120, height:120});
  }catch(e){ /* QR lib needs internet on first use — receipt still works fine without it */ }
}
async function printCustomerReceipt(invId){
  const inv = state.invoices.find(i=>i.id===invId);
  if(!inv) return;
  await renderReceiptIntoPrintArea(inv);
  // "auto" for the page height silently makes some print/PDF engines (verified: Chromium's own
  // print-to-PDF) drop the whole @page size and fall back to a default Letter/A4-sized page —
  // which is what was actually causing thermal receipts/labels/vouchers to print at the wrong
  // size with clipped tables. An explicit, generous fixed height is reliably honored instead;
  // thermal printers just cut the roll once the content ends, so the extra unused length is harmless.
  $("dynamicPageSize").textContent = `@media print{ @page{ size:${state.settings.thermalPaperWidth||58}mm 2000mm; margin:0; } }`;
  setTimeout(()=> safePrint(), 300);
}
function buildInvoiceTextMessage(inv){
  const total = invoiceSaleTotal(inv);
  const paid = invoicePaid(inv);
  const remaining = invoiceRemaining(inv);
  const itemsLines = inv.garments.filter(g=>g.status!=="ملغي").map(g=> `- ${g.fabricType}${g.category?" ("+g.category+")":""}: ${garmentSalePrice(g).toFixed(0)} ريال`).join("\n");
  return `مرحباً ${inv.customerName||""}،
فاتورتك من ${state.settings.shopName||"محلنا"} — رقم ${inv.number}
التاريخ: ${inv.date}${inv.expectedDeliveryDate?`\nتاريخ التسليم المتوقع: ${inv.expectedDeliveryDate}`:""}

${itemsLines}

الإجمالي: ${total.toFixed(0)} ريال
المدفوع: ${paid.toFixed(0)} ريال
المتبقي: ${remaining.toFixed(0)} ريال

شكراً لثقتك بنا 🌹`;
}
async function shareReceiptViaWhatsApp(invId){
  const inv = state.invoices.find(i=>i.id===invId);
  if(!inv) return;
  if(!inv.customerMobile){ showToast("ما فيه رقم جوال مسجّل لهذا العميل"); return; }
  const message = buildInvoiceTextMessage(inv);
  window.open(waLink(inv.customerMobile, message), "_blank");
}
async function showEinvoiceDetails(invId){
  const inv = state.invoices.find(i=>i.id===invId);
  if(!inv || !inv.einvoice){ showToast("ما فيه بيانات فوترة إلكترونية لهذي الفاتورة"); return; }
  const html = `<div class="stitch"></div><h3 style="font-size:14px;margin:0 0 10px;">بيانات الفوترة الإلكترونية — فاتورة ${esc(inv.number)}</h3>
    <div id="einvoiceQrHolder" style="background:#fff;padding:12px;border-radius:10px;width:fit-content;margin-bottom:10px;"></div>
    <p class="sub">UUID: ${inv.einvoice.uuid}</p>
    <p class="sub">بصمة الفاتورة (Hash): ${inv.einvoice.hash.slice(0,24)}...</p>
    <p class="sub">بصمة الفاتورة السابقة: ${inv.einvoice.prevHash.slice(0,24)}...</p>
    <button class="btn btn-ghost btn-sm" id="downloadXmlBtn">تحميل XML (UBL 2.1)</button>`;
  $("einvoiceDetailsView").innerHTML = html;
  try{
    await loadQrLib();
    new window.QRCode($("einvoiceQrHolder"), {text: inv.einvoice.qrBase64, width:160, height:160});
  }catch(e){ $("einvoiceQrHolder").innerHTML = `<p class="sub">تعذّر تحميل مكتبة QR (يحتاج اتصال إنترنت أول مرة)</p>`; }
  $("downloadXmlBtn").addEventListener("click", ()=>{
    const blob = new Blob([inv.einvoice.xml], {type:"application/xml"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`invoice-${esc(inv.number)}.xml`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  });
}


