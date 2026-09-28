// the shop runs on Riyadh time (UTC+3, no daylight saving)
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
function riyadhToday(nowMs = Date.now()){ return new Date(nowMs + RIYADH_OFFSET_MS).toISOString().slice(0, 10); }
// whole months between an ISO date and today (both Riyadh dates)
function monthsSince(dateStr, today){
  const [y1, m1, d1] = String(dateStr).slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}
module.exports = { riyadhToday, monthsSince };
