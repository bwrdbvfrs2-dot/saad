// A fresh emulator: the first-time setup screen (manager) and one user of every other role.
const {open, realErrors} = require('./harness');
(async()=>{
  const s = await open(); const p = s.p;
  await p.waitForSelector('#setupUser', {state:'visible', timeout:60000});
  await p.fill('#setupUser','admin'); await p.fill('#setupPass','admin123'); await p.fill('#setupPassConfirm','admin123');
  await p.click('#firstSetupBtn'); await p.waitForSelector('#app:not(.hidden)', {timeout:40000}); await p.waitForTimeout(1500);
  for(const [u, role] of [['acc1','محاسب'],['cash1','كاشير'],['tail1','خياط']]){
    await p.evaluate(([u, role])=>{ $("newUserName").value=u; $("newUserPass").value=u+'pass1'; $("newUserRole").value=role; }, [u, role]);
    await p.evaluate(()=> addUser()); await p.waitForTimeout(2000);
  }
  const users = await p.evaluate(()=> state.users.map(u=>u.username));
  console.log('users:', users.join(', '));
  const errs = realErrors(s.errs);
  await s.b.close();
  if(users.length < 4 || errs.length){ console.error('SETUP FAILED', errs.join(' | ')); process.exit(1); }
})().catch(e=>{ console.error('SETUP FAILED', e.message); process.exit(1); });
