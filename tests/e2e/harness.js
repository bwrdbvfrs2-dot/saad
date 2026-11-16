// Opens the app in a headless browser against the local Firebase emulators (never the shop's real data):
// files are served straight from the repository and core-state.js is pointed at the emulators on the fly.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const TYPES = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml'};
async function open(opts = {}){
  // newer Chromium blocks a page from calling 127.0.0.1 (the emulators) unless these checks are off
  const args = ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'];
  if(process.env.HTTPS_PROXY) args.push('--ignore-certificate-errors');
  const b = await chromium.launch({args});
  const ctx = await b.newContext({viewport: opts.viewport || {width:1366, height:900}, locale:'ar-SA', timezoneId:'Asia/Riyadh',
    proxy: process.env.HTTPS_PROXY ? {server: process.env.HTTPS_PROXY, bypass:'127.0.0.1,localhost'} : undefined});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e=> errs.push('PAGEERROR: ' + e.message));
  p.on('console', m=>{ if(m.type()==='error' && !/worldtimeapi|ERR_FAILED|Failed to load resource/.test(m.text())) errs.push('console.error: ' + m.text()); });
  p.on('dialog', d=> d.accept());
  await p.route('http://127.0.0.1:5555/**', r=>{
    let f = decodeURIComponent(new URL(r.request().url()).pathname); if(f==='/') f = '/index.html';
    const fp = path.join(ROOT, f);
    if(!fp.startsWith(ROOT) || !fs.existsSync(fp)) return r.fulfill({status:404, body:''});
    let body = fs.readFileSync(fp);
    if(f==='/js/core-state.js'){
      body = body.toString()
        .replace('const db = firebase.firestore();', "const db = firebase.firestore(); fbAuth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true}); db.useEmulator('127.0.0.1',8080);")
        .replace('return secondaryAuthApp.auth();', "{const a=secondaryAuthApp.auth(); if(!a.__emu){a.useEmulator('http://127.0.0.1:9099',{disableWarnings:true}); a.__emu=1;} return a;}");
      if(!body.includes("useEmulator('127.0.0.1',8080)")) throw new Error('could not point core-state.js at the emulators');
    }
    r.fulfill({status:200, contentType: TYPES[path.extname(fp)] || 'application/octet-stream', headers:{date:new Date().toUTCString()}, body});
  });
  await p.route('https://worldtimeapi.org/**', r=> r.abort());
  await p.goto('http://127.0.0.1:5555/index.html', {waitUntil:'load'});
  return {b, p, errs};
}
async function login(p, u, pw){
  await p.waitForSelector('#loginUser', {state:'visible', timeout:40000});
  await p.fill('#loginUser', u); await p.fill('#loginPass', pw);
  await p.click('#loginBtn');
  await p.waitForSelector('#app:not(.hidden)', {timeout:40000});
  await p.waitForTimeout(1500);
}
const realErrors = errs=> errs.filter(e=> !/Failed to load resource/.test(e));
module.exports = {open, login, realErrors};
