import { chromium } from 'playwright';
import fs from 'fs';
const tag = process.argv[2] || 'before';
const base = process.argv[3] || 'http://localhost:3000';
const out = `${process.env.PERF_OUT || './perf-out'}/bench-${tag}`;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel:'msedge', headless:false, args:['--use-angle=d3d11','--ignore-gpu-blocklist','--disable-frame-rate-limit','--disable-gpu-vsync','--window-size=1500,1000'] });
const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
await ctx.addInitScript(() => {
  window.__g = { draws:0, texBytes:0, frames:0, tris:0 };
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
    const P = C.prototype;
    const wrap = (n, f) => { const o = P[n]; if (!o) return; P[n] = function(...a){ f(a, this); return o.apply(this, a); }; };
    for (const n of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','drawRangeElements']) wrap(n, (a)=>{ window.__g.draws++; });
    const bpp = (w,h)=> w*h*4*1.33;
    wrap('texImage2D', (a)=>{ if (a.length>=6 && typeof a[3]==='number' && a[3]>0 && a[1]===0) window.__g.texBytes += bpp(a[3],a[4]); else if (a[1]===0 && a[5]&&a[5].width) window.__g.texBytes+=bpp(a[5].width,a[5].height); else if (a[1]===0 && a[5]&&a[5].videoWidth) window.__g.texBytes+=bpp(a[5].videoWidth,a[5].videoHeight); });
    wrap('texStorage2D', (a)=>{ const f=a[2]; const comp=(f>=0x83F0&&f<=0x83F3)||(f>=0x8E8C&&f<=0x8E8F)||(f>=0x9270&&f<=0x9279)||(f>=0x93B0&&f<=0x93BD)||(f>=0x8C00&&f<=0x8C03); const half=(f===0x83F0||f===0x83F1||f===0x9274||f===0x9275||f===0x9270||f===0x9271); const bpp = comp ? (half?0.5:1) : 4; window.__g.texBytes += a[3]*a[4]*bpp*1.33; window.__g.compressed = (window.__g.compressed||0) + (comp?1:0); });
    wrap('compressedTexImage2D', (a)=>{ if (a[1]===0) window.__g.texBytes += a[6] ? a[6].byteLength*1.33 : 0; });
    wrap('compressedTexSubImage2D', ()=>{});
  }
});
const p = await ctx.newPage();
let bytes = 0; const big = [];

p.on('pageerror', e=>console.log('PAGEERR', e.message.slice(0,200)));
const results = {};
const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); const urls={}; let total=0; const bigAll={}; cdp.on('Network.responseReceived', e=>{ urls[e.requestId]=e.response.url; }); cdp.on('Network.loadingFinished', e=>{ const n=e.encodedDataLength||0; bytes+=n; total+=n; const u=(urls[e.requestId]||'').replace(base,''); if(n>200000) bigAll[u]=n; });
const t0 = Date.now();
await p.goto(`${base}/simulator#fire`, { waitUntil:'load' });
await p.waitForTimeout(3000);
console.log('INITIAL load MB', (total/1048576).toFixed(2));
const envs = ['Earth','Earth|Whole Earth','ISS','ISS|Whole station','Lunar base','Spacesuit'];
for (const ee of envs) { const e = ee.replace('|','_');
  const tStart = Date.now();
  bytes = 0; big.length = 0; await p.evaluate(()=>{window.__g.texBytes=0;});
  const steps = ee.split('|'); let ok=true; for (const st of steps) { ok = ok && await p.evaluate((n)=>{ const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n); if(!b) return false; b.click(); const c=document.querySelector('canvas'); if(c) c.scrollIntoView({block:'center'}); return true; }, st); await p.waitForTimeout(1500); } if(!ok) console.log('no btn', ee);
  // wait for the loading overlay to go away (canvas stable): poll until draws are rendering and a pause
  await p.waitForFunction(() => !document.body.innerText.match(/Loading|Cargando/i) , null, { timeout: 90000 }).catch(()=>{});
  const loadMs = Date.now() - tStart;
  await p.waitForTimeout(2500);
  const m = await p.evaluate(() => new Promise(res => {
    const g = window.__g; const d0 = g.draws; let n = 0; const t0 = performance.now(); const ft = [];
    let last = t0;
    const step = (t) => { ft.push(t-last); last=t; n++; if (t - t0 < 5000) requestAnimationFrame(step); else {
      ft.shift(); ft.sort((a,b)=>a-b);
      res({ fps: n/((t-t0)/1000), p95ms: ft[Math.floor(ft.length*0.95)], p99ms: ft[Math.floor(ft.length*0.99)], drawsPerFrame: (g.draws-d0)/n, texMBuploaded: g.texBytes/1048576, heapMB: performance.memory? performance.memory.usedJSHeapSize/1048576:null });
    } };
    requestAnimationFrame(step);
  }));
  m.loadMs = loadMs; m.downloadedMB = +(bytes/1048576).toFixed(2);
  await p.addStyleTag({content:'header,nav{visibility:hidden!important}'}); await p.waitForTimeout(500); const cv = await p.$('canvas'); if (cv) { const bb = await cv.boundingBox(); await p.screenshot({ path: `${out}/${e.replace(/\s/g,'_')}.png`, clip:{x:Math.max(0,bb.x),y:Math.max(0,Math.min(bb.y,0)),width:Math.min(bb.width,1440),height:Math.min(bb.height,900)} }); }
  results[e] = m; console.log(e, JSON.stringify(m));
}
results._totalMB=+(total/1048576).toFixed(2); results._big=bigAll; console.log('TOTAL MB', results._totalMB, JSON.stringify(bigAll)); fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
await b.close();
