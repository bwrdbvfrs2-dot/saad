const test = require("node:test");
const assert = require("node:assert");
const { mergeShopState } = require("../lib/shopState");

test("customers and invoices come from their own documents", ()=>{
  const main = { settings:{ shopName:"س" }, customers:[], invoices:[] };
  const docs = [
    { id:"cust-0", items:[{ id:"c1", mobile:"0500000001" }] },
    { id:"cust-3", items:[{ id:"c2", mobile:"0500000002" }] },
    { id:"inv-2026-11-1", items:[{ id:"i2", number:"2" }] },
    { id:"inv-2026-11-0", items:[{ id:"i1", number:"1" }] },
    { id:"archive-2026-09", items:[{ id:"a1", number:"0" }] },
    { id:"garmentTypes", items:[{ id:"g" }] },
  ];
  const s = mergeShopState(main, docs);
  assert.deepEqual(s.customers.map(c=> c.id), ["c1","c2"]);
  assert.deepEqual(s.invoices.map(i=> i.id), ["a1","i1","i2"]);
  assert.equal(s.settings.shopName, "س");
});

test("data still in shop/state (before the split, or from an old device) is kept", ()=>{
  const before = mergeShopState({ customers:[{ id:"c1" }], invoices:[{ id:"i1" }] }, []);
  assert.equal(before.customers.length, 1); assert.equal(before.invoices.length, 1);
  const mixed = mergeShopState({ customers:[{ id:"c1" }, { id:"c9" }] }, [{ id:"cust-0", items:[{ id:"c1", name:"new" }] }]);
  assert.deepEqual(mixed.customers.map(c=> c.id), ["c1","c9"]);
  assert.equal(mixed.customers[0].name, "new"); // the stored (shard) copy wins
});
