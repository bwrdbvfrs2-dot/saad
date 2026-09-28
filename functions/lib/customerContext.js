// What the AI may know when a number writes in: the shop's public details and THIS number's own orders —
// never anyone else's. Amounts follow the app's own invoice arithmetic (price + embroidery + frozen
// addon price, minus cash + network + discount).
const STATUS_LABELS = { "جديد":"تم استلام الطلب", "قص":"تم القص", "تفصيل":"تم التفصيل", "جاهز":"جاهز للتسليم",
  "تسليم":"تم التسليم", "ملغي":"ملغي", "معلقة":"جاهز للتسليم (متأخر عن الاستلام)" };

function garmentSale(g){ return (g.price || 0) + (g.hasEmbroidery ? (g.embroideryPrice || 0) : 0) + (g.addonsSaleSnapshot || 0); }
function invoiceRemaining(inv, returnedIds){
  const sale = (inv.garments || []).reduce((a, g)=> a + (g.status === "ملغي" ? 0 : garmentSale(g)), 0);
  const paid = (inv.payments || []).reduce((a, p)=> a + (p.cash || 0) + (p.network || 0) + (p.discount || 0), 0);
  const r = sale - paid;
  return returnedIds.has(inv.id) ? Math.max(0, r) : r;
}
function buildCustomerContext(state, mobile){
  const s = state.settings || {};
  const shop = { name:s.shopName || "", phone:s.shopPhone || "", address:s.shopAddress || "" };
  const customer = (state.customers || []).find(c=> c.mobile === mobile) || null;
  const returnedIds = new Set((state.invoiceReturns || []).map(r=> r.invoiceId));
  const invoices = (state.invoices || []).filter(inv=> inv.customerMobile === mobile)
    .sort((a, b)=> String(b.date).localeCompare(String(a.date))).slice(0, 5)
    .map(inv=>({
      number:inv.number, date:inv.date, expectedDelivery:inv.expectedDeliveryDate || null,
      remaining:Math.max(0, Math.round(invoiceRemaining(inv, returnedIds))),
      thobes:(inv.garments || []).map((g, i)=>({ n:i + 1, status:STATUS_LABELS[g.status] || g.status })),
    }));
  return {
    shop,
    customer: customer ? { names:(customer.individuals || []).map(p=> p.name).filter(Boolean), vip:!!customer.vip } : null,
    invoices,
  };
}
module.exports = { buildCustomerContext };
