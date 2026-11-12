// The shop's data is split over several documents (the app does the same when it loads, see
// mergeCatalogInto in js/app-shell.js): shop/state holds most of it, while the customers live in
// catalog/cust-0…7, the live invoices in catalog/inv-YYYY-MM-0/1, and the archived (finished) invoices
// in catalog/archive-YYYY-MM. Anything still sitting in shop/state itself (a device on an older app
// version) is kept too.
const CUST_RE = /^cust-\d+$/;
const INV_RE = /^inv-(\d{4}-\d{2}|x)-\d+$/;
const ARCHIVE_RE = /^archive-\d{4}-\d{2}(-\d+)?$/;

function unionById(stored, leftovers){
  const ids = new Set(stored.map(x=> x && x.id));
  return stored.concat((leftovers || []).filter(x=> x && !(x.id && ids.has(x.id))));
}

// main: shop/state's data; docs: [{id, items}] from the catalog collection
function mergeShopState(main, docs){
  const state = { ...(main || {}) };
  const of = re=> (docs || []).filter(d=> re.test(d.id)).sort((a,b)=> a.id.localeCompare(b.id)).flatMap(d=> d.items || []);
  const customers = of(CUST_RE), live = of(INV_RE), archived = of(ARCHIVE_RE);
  if(customers.length) state.customers = unionById(customers, state.customers);
  if(live.length || archived.length) state.invoices = unionById(archived.concat(live), state.invoices);
  return state;
}

async function loadShopState(db){
  const [stateSnap, catSnap] = await Promise.all([ db.doc("shop/state").get(), db.collection("catalog").get() ]);
  const docs = [];
  catSnap.forEach(d=>{ if(CUST_RE.test(d.id) || INV_RE.test(d.id) || ARCHIVE_RE.test(d.id)) docs.push({ id:d.id, items:(d.data() || {}).items || [] }); });
  return mergeShopState(stateSnap.exists ? stateSnap.data() : {}, docs);
}

module.exports = { mergeShopState, loadShopState };
