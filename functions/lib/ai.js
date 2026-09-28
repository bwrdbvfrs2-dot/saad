// Claude writes the reply to a customer's WhatsApp message. It answers only from the facts it is given
// (the shop's details and this number's own orders), hands anything else to a person, and never makes
// offers or promises. The reply comes back as JSON so the server knows when to flag a human.
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-opus-5";
const REPLY_SCHEMA = {
  type:"object",
  properties:{
    reply:{ type:"string", description:"The WhatsApp reply to send, in Gulf Arabic" },
    needs_human:{ type:"boolean", description:"true when a staff member should follow up" },
    opt_out:{ type:"boolean", description:"true when the customer asks to stop receiving messages" },
  },
  required:["reply", "needs_human", "opt_out"],
  additionalProperties:false,
};
function systemPrompt(ctx){
  return [
    `أنت مساعد واتساب لمحل خياطة رجالي${ctx.shop.name ? ` اسمه "${ctx.shop.name}"` : ""} في السعودية. ترد بلهجة خليجية مهذبة ومختصرة (جملتين أو ثلاث).`,
    "تجاوب فقط من المعلومات اللي تحت. إذا السؤال عن شي مو موجود فيها (أسعار، عروض، مواعيد خاصة، شكوى، تعديل طلب، دفع)، قل إن موظف بيتواصل معه قريب، وحط needs_human = true.",
    "لا تعطي أي خصم أو عرض أو وعد بموعد أو سعر من عندك. لا تذكر معلومات عملاء ثانيين. لا تطلب بيانات دفع أو كلمات مرور.",
    "إذا طلب العميل إيقاف الرسائل أو قال لا ترسلون لي، حط opt_out = true ورد بتأكيد قصير.",
    "إذا طلب يكلم موظف أو كان زعلان، حط needs_human = true.",
    "",
    "معلومات المحل:",
    JSON.stringify(ctx.shop),
    "",
    "العميل اللي يراسلك (من رقم جواله):",
    ctx.customer ? JSON.stringify(ctx.customer) : "رقم غير مسجّل عندنا كعميل.",
    "",
    "آخر طلباته (الحالة الحالية لكل ثوب، والمبلغ المتبقي بالريال):",
    ctx.invoices.length ? JSON.stringify(ctx.invoices) : "ما عنده طلبات مسجّلة.",
  ].join("\n");
}
// history: [{direction:"in"|"out", text}] oldest first, ending with the new customer message
async function draftReply({ apiKey, ctx, history }){
  const client = new Anthropic({ apiKey, baseURL:process.env.ANTHROPIC_BASE_URL || undefined, timeout:30000, maxRetries:1 });
  // the API wants alternating turns that start with the customer — merge runs of the same side
  const messages = [];
  for(const m of history){
    const role = m.direction === "in" ? "user" : "assistant";
    if(!messages.length && role === "assistant") continue;
    const last = messages[messages.length - 1];
    if(last && last.role === role) last.content += "\n" + m.text;
    else messages.push({ role, content:m.text });
  }
  if(!messages.length || messages[messages.length - 1].role !== "user") return null;
  const response = await client.beta.messages.create({
    model:MODEL,
    max_tokens:2000,
    betas:["server-side-fallback-2026-07-01"],
    fallbacks:"default",
    output_config:{ effort:"low", format:{ type:"json_schema", schema:REPLY_SCHEMA } },
    system:systemPrompt(ctx),
    messages,
  });
  if(response.stop_reason === "refusal") return null;
  const text = response.content.filter(b=> b.type === "text").map(b=> b.text).join("");
  try{
    const out = JSON.parse(text);
    if(typeof out.reply !== "string" || !out.reply.trim()) return null;
    return { reply:out.reply.trim(), needsHuman:!!out.needs_human, optOut:!!out.opt_out };
  }catch(e){ return null; }
}
module.exports = { draftReply, systemPrompt, MODEL };
