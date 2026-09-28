// "stop messaging me" in the ways people actually write it — checked before anything else, no AI needed
const OPT_OUT_PATTERNS = [
  /^\s*(stop|unsubscribe|الغاء|إلغاء|ايقاف|إيقاف|وقف|توقف|قف)\s*[.!؟?]*\s*$/i,
  /(لا\s*(تر(س|ص)ل|ترسلون|ترسلوا)|لا\s*عاد\s*ترسل|وقف(وا)?\s*(الرسائل|الإرسال|الارسال)|أوقف(وا)?\s*(الرسائل|الإرسال)|اوقف(وا)?\s*(الرسائل|الارسال)|إلغاء\s*الاشتراك|الغاء\s*الاشتراك)/,
];
function isOptOut(text){ return OPT_OUT_PATTERNS.some(r=> r.test(String(text || ""))); }
module.exports = { isOptOut };
