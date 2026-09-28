const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { normalizeSaudiMobile, toWhatsApp, firstName } = require("../lib/mobile");
const { monthsSince, riyadhToday } = require("../lib/time");
const { computeDailyList } = require("../lib/eligibility");
const { isOptOut } = require("../lib/optout");
const { validSignature } = require("../lib/whatsapp");
const { buildCustomerContext } = require("../lib/customerContext");

test("mobile numbers", ()=>{
  assert.equal(normalizeSaudiMobile("+966 55 123 4567"), "0551234567");
  assert.equal(normalizeSaudiMobile("٠٥٥١٢٣٤٥٦٧"), "0551234567");
  assert.equal(normalizeSaudiMobile("966551234567"), "0551234567");
  assert.equal(normalizeSaudiMobile("12345"), null);
  assert.equal(toWhatsApp("0551234567"), "966551234567");
  assert.equal(firstName("  محمد بن علي "), "محمد");
});
test("time", ()=>{
  assert.equal(monthsSince("2026-03-28", "2026-09-28"), 6);
  assert.equal(monthsSince("2026-03-29", "2026-09-28"), 5);
  assert.equal(riyadhToday(Date.UTC(2026, 8, 27, 22, 0)), "2026-09-28");   // 01:00 in Riyadh
});
test("daily list: dormant first, oldest first, cap, opt-outs and already-contacted skipped", ()=>{
  const state = {
    customers:[ {mobile:"0500000001", individuals:[{name:"خالد"}]}, {mobile:"0500000002", individuals:[{name:"فهد"}]},
                {mobile:"0500000003", individuals:[{name:"سعد"}]}, {mobile:"0500000004", individuals:[{name:"ناصر"}]} ],
    invoices:[ {customerMobile:"0500000001", date:"2026-01-10"}, {customerMobile:"0500000002", date:"2025-11-01"},
               {customerMobile:"0500000003", date:"2026-09-01"}, {customerMobile:"0500000004", date:"2025-10-01"} ],
  };
  const contacts = { "0500000004":{ optedOut:true } };
  const leads = [ {mobile:"0550000001", name:"أحمد", status:"new", importedAt:"2026-09-02"}, {mobile:"0550000002", status:"new", importedAt:"2026-09-01"},
                  {mobile:"0550000003", status:"contacted"} ];
  const r = computeDailyList({ state, leads, contacts, settings:{ dailyCap:3, dormantMonths:6 }, today:"2026-09-28" });
  assert.deepEqual(r.list.map(x=> x.mobile), ["0500000002", "0500000001", "0550000002"]);
  assert.equal(r.dormantTotal, 2); assert.equal(r.leadsTotal, 2);
  const again = computeDailyList({ state, leads, contacts:{ ...contacts, "0500000002":{ lastContactAt:"2026-09-20T10:00:00Z" } }, settings:{ dailyCap:5, dormantMonths:6 }, today:"2026-09-28" });
  assert.ok(!again.list.some(x=> x.mobile === "0500000002"));
});
test("opt-out wording", ()=>{
  for(const t of ["إيقاف", "stop", "STOP", "لا ترسلون لي", "وقفوا الرسائل", "الغاء الاشتراك", "لا ترسل لي شي"]) assert.ok(isOptOut(t), t);
  for(const t of ["متى ثوبي جاهز؟", "كم باقي علي", "وقف السيارة عند المحل؟"]) assert.ok(!isOptOut(t), t);
});
test("webhook signature", ()=>{
  const body = Buffer.from('{"a":1}'), secret = "s3cret";
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.ok(validSignature(body, sig, secret));
  assert.ok(!validSignature(body, sig, "other"));
  assert.ok(!validSignature(body, undefined, secret));
});
test("customer context: only this number's orders, remaining computed like the app", ()=>{
  const state = {
    settings:{ shopName:"محل الاختبار", shopPhone:"0110000000" },
    customers:[ {mobile:"0551112222", individuals:[{name:"علي"}]} ],
    invoices:[
      { id:"a", number:"7", date:"2026-09-01", customerMobile:"0551112222", garments:[{status:"جاهز", price:150, hasEmbroidery:true, embroideryPrice:20, addonsSaleSnapshot:10},{status:"قص", price:150}], payments:[{cash:100, network:0, discount:30}] },
      { id:"b", number:"8", date:"2026-09-02", customerMobile:"0559999999", garments:[{status:"جديد", price:999}], payments:[] },
    ],
  };
  const ctx = buildCustomerContext(state, "0551112222");
  assert.equal(ctx.invoices.length, 1);
  assert.equal(ctx.invoices[0].remaining, 200);                  // 180 + 150 - 130
  assert.deepEqual(ctx.invoices[0].thobes.map(t=> t.status), ["جاهز للتسليم", "تم القص"]);
  assert.equal(ctx.shop.name, "محل الاختبار");
  assert.ok(!JSON.stringify(ctx).includes("999"));
});
