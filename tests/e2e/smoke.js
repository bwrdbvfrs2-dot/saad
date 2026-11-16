// The checks every change must pass: a real invoice is saved through the screen, the books still balance,
// and every screen opens for every role without a script error.
const {open, login, realErrors} = require('./harness');
const fail = [];
const check = (ok, what)=>{ console.log((ok ? '  ✓ ' : '  ✗ ') + what); if(!ok) fail.push(what); };
(async()=>{
  let s = await open(); let p = s.p; await login(p, 'admin', 'admin123');
  // a new invoice through the real form: two thobes, a cash payment
  await p.evaluate(()=>{ switchTab('invoice'); resetForm(); }); await p.waitForTimeout(300);
  await p.fill('#invCount','2'); await p.dispatchEvent('#invCount','input'); await p.dispatchEvent('#invCount','change'); await p.waitForTimeout(200);
  await p.fill('#custName','عميل تجربة'); await p.fill('#custMobile','0500000009');
  const cards = p.locator('#garmentsHolder > .garment-card');
  for(let i=0;i<2;i++){ await cards.nth(i).locator('.g-itemCard-search').fill('أجرة تفصيل (بدون قماش)'); await cards.nth(i).locator('.g-price').fill(String(100 + i*50)); }
  await p.evaluate(()=> setPayMethod('cash')); await p.fill('#newPayAmount','120'); await p.click('#addPaymentBtn'); await p.waitForTimeout(200);
  await p.click('#invSideSummary .iss-btn[data-for="saveInvoiceBtn"]'); await p.waitForTimeout(2500);
  const inv = await p.evaluate(()=>{ const i = state.invoices[state.invoices.length-1]; return i ? {n:i.garments.length, total:i.garments.reduce((a,g)=>a+(g.price||0),0), paid:(i.payments||[]).reduce((a,x)=>a+(x.cash||0)+(x.network||0),0)} : null; });
  check(inv && inv.n===2 && inv.total===250 && inv.paid===120, 'invoice saved with 2 thobes, total 250, paid 120');
  check(await p.evaluate(()=>{ const b = mainBoxOf('admin','cash'); return b && Math.abs(b.balance-120) < 0.01; }), 'the payment reached the cash box');
  // the books: every box and supplier rebuilt from its movements matches its balance
  const ic = await p.evaluate(()=>{ const r = computeIntegrityCheck(); return {box:r.boxes.filter(b=>Math.abs(b.diff)>0.01).length, sup:r.suppliers.filter(x=>Math.abs(x.diff)>0.01).length, stock:r.stock.filter(x=>Math.abs(x.diff)>0.01||Math.abs(x.reservedDiff)>0.01).length}; });
  check(!ic.box && !ic.sup && !ic.stock, `integrity check balanced (boxes ${ic.box}, suppliers ${ic.sup}, stock ${ic.stock} off)`);
  // the daily report builds
  check(await p.evaluate(()=>{ try{ return buildDailyReportHtml(todayStr(), buildDailyReport(todayStr())).length > 500; }catch(e){ return false; } }), 'daily report builds');
  check(!realErrors(s.errs).length, 'no script errors while saving: ' + realErrors(s.errs).join(' | ').slice(0,300));
  await s.b.close();
  // every screen, every role
  for(const [u, pw] of [['admin','admin123'],['acc1','acc1pass1'],['cash1','cash1pass1'],['tail1','tail1pass1']]){
    s = await open(); p = s.p; await login(p, u, pw);
    const tabs = await p.evaluate(()=> [...document.querySelectorAll('.tab-panel')].map(x=>x.id.replace(/^tab-/,'')));
    const broken = [];
    for(const t of tabs){
      const r = await p.evaluate(t=>{ try{ performTabSwitch(t); return true; }catch(e){ return e.message; } }, t);
      if(r!==true) broken.push(t + ': ' + r);
      await p.waitForTimeout(80);
    }
    const errs = realErrors(s.errs);
    check(!broken.length && !errs.length, `${u}: ${tabs.length} screens open without errors ${(broken.concat(errs)).join(' | ').slice(0,300)}`);
    await s.b.close();
  }
  if(fail.length){ console.error(`\n${fail.length} check(s) failed`); process.exit(1); }
  console.log('\nall checks passed');
})().catch(e=>{ console.error('SMOKE FAILED', e.message); process.exit(1); });
