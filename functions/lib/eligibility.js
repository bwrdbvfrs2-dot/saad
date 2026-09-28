// Who gets today's message — the same rules the manager sees in the dry-run list in the app
// (js/watani-bot.js computeBotDailyList): dormant real customers first, oldest dormancy first, then
// leads in the order they were imported, never anyone who opted out, never twice for the same dormancy.
const { monthsSince } = require("./time");

function computeDailyList({ state, leads, contacts, settings, today }){
  const cap = settings.dailyCap;
  const lastInvoice = {};
  (state.invoices || []).forEach(inv=>{
    const m = inv.customerMobile;
    if(m && (!lastInvoice[m] || inv.date > lastInvoice[m])) lastInvoice[m] = inv.date;
  });
  const dormant = (state.customers || []).filter(c=>{
    const last = lastInvoice[c.mobile];
    if(!last || monthsSince(last, today) < settings.dormantMonths) return false;
    const ct = contacts[c.mobile];
    if(ct && ct.optedOut) return false;
    if(ct && ct.lastContactAt && ct.lastContactAt.slice(0, 10) >= last) return false;
    return true;
  }).sort((a, b)=> lastInvoice[a.mobile].localeCompare(lastInvoice[b.mobile]))
    .map(c=>({ kind:"customer", mobile:c.mobile, name:((c.individuals || [])[0] || {}).name || "", lastInvoice:lastInvoice[c.mobile] }));
  const customerMobiles = new Set((state.customers || []).map(c=>c.mobile));
  const freshLeads = leads.filter(l=>{
    if(l.status && l.status !== "new") return false;
    if(customerMobiles.has(l.mobile)) return false;
    const ct = contacts[l.mobile];
    return !(ct && (ct.optedOut || ct.lastContactAt));
  }).sort((a, b)=> (a.importedAt || "").localeCompare(b.importedAt || ""))
    .map(l=>({ kind:"lead", mobile:l.mobile, name:l.name || "", lastInvoice:null }));
  const list = dormant.slice(0, cap);
  if(list.length < cap) list.push(...freshLeads.slice(0, cap - list.length));
  return { list, dormantTotal:dormant.length, leadsTotal:freshLeads.length };
}
module.exports = { computeDailyList };
