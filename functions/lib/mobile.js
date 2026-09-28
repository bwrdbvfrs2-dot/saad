// Saudi mobile numbers: the shop keeps them as 05XXXXXXXX, WhatsApp uses 9665XXXXXXXX (no "+").
function normalizeSaudiMobile(v){
  let s = String(v ?? "").trim()
    .replace(/[٠-٩]/g, d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  if(typeof v==="number") s = String(Math.round(v));
  s = s.replace(/[\s\-().]/g, "");
  if(s.startsWith("+")) s = s.slice(1);
  if(s.startsWith("00")) s = s.slice(2);
  if(s.startsWith("966")) s = "0" + s.slice(3);
  if(/^5\d{8}$/.test(s)) s = "0" + s;
  return /^05\d{8}$/.test(s) ? s : null;
}
function toWhatsApp(mobile){ const m = normalizeSaudiMobile(mobile); return m ? "966" + m.slice(1) : null; }
function firstName(name){ return String(name || "").trim().split(/\s+/)[0] || ""; }
module.exports = { normalizeSaudiMobile, toWhatsApp, firstName };
