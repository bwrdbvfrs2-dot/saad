// WhatsApp Cloud API (Meta). The access token never leaves the server; the base URL can be pointed at a
// local stand-in for tests (WHATSAPP_API_BASE).
const crypto = require("crypto");
const API_BASE = ()=> process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v21.0";

async function callGraph(phoneNumberId, token, body){
  const res = await fetch(`${API_BASE()}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method:"POST",
    headers:{ "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
    body:JSON.stringify({ messaging_product:"whatsapp", ...body }),
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok){
    const err = new Error((data.error && data.error.message) || `WhatsApp API ${res.status}`);
    err.status = res.status; err.code = data.error && data.error.code;
    throw err;
  }
  return (data.messages && data.messages[0] && data.messages[0].id) || null;   // the message id (wamid)
}
// a business-initiated message has to be an approved template; {{1}} in its body is the customer's first name
function sendTemplate({ phoneNumberId, token, to, template, lang, bodyParams }){
  return callGraph(phoneNumberId, token, {
    to, type:"template",
    template:{ name:template, language:{ code:lang || "ar" },
      components: bodyParams && bodyParams.length ? [{ type:"body", parameters:bodyParams.map(t=>({ type:"text", text:String(t) })) }] : [] },
  });
}
// free text — only allowed within 24 hours of the customer's last message
function sendText({ phoneNumberId, token, to, text }){
  return callGraph(phoneNumberId, token, { to, type:"text", text:{ body:String(text).slice(0, 4000) } });
}
// every webhook POST from Meta is signed with the app secret over the raw body
function validSignature(rawBody, header, appSecret){
  if(!header || !appSecret || !rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { sendTemplate, sendText, validSignature };
