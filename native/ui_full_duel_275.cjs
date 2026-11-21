'use strict';
/* PRIME 2.7.5 — complete human-vs-AI duels in the real UI (Chromium).
 * The "human" answers every sheet by clicking real buttons; main-phase actions
 * are taken from the legal list exposed to the UI (__S.acts) so every action
 * type is exercised. Records uncaught errors, console errors, render time and
 * long main-thread tasks.  Usage: node ui_full_duel_275.cjs <dir> <file.html>
 */
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const dir=process.argv[2],file=process.argv[3]||'index.html';
// UI_RESUME_FROM=old.html : start each duel on the previous version, then resume it with this one.
const RESUME_FROM=process.env.UI_RESUME_FROM||'';
const DUELS=Number(process.env.UI_DUELS||2),MAX_STEPS=Number(process.env.UI_STEPS||900);
// Test-only instrumentation: expose the IIFE-scoped UI state and wrap render().
function instrumented(f){let h=fs.readFileSync(f,'utf8');
  h=h.replace('function render() {','window.__S=S;window.__rt=window.__rt||[];function render() { const __t0=performance.now(); try { return __render(); } finally { window.__rt.push(performance.now()-__t0); } }\nfunction __render() {');
  return h;}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(dir,decodeURIComponent(q.url.split('?')[0]));
  if(!f.startsWith(dir)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
  r.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});if(f.endsWith('.html'))return r.end(instrumented(f));fs.createReadStream(f).pipe(r);});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/${file}`;
  const browser=await chromium.launch();
  const out={url:file,profiles:[]};
  for(const prof of [{name:'desktop',viewport:{width:1280,height:800}},{name:'mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true}]){
    const page=await browser.newPage(prof);
    const errors=[],consoleErr=[];
    page.on('pageerror',e=>errors.push(String(e.stack||e).slice(0,400)));
    page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))consoleErr.push(m.text().slice(0,300));});
    await page.addInitScript(()=>{
      window.__long=[];
      try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration));}).observe({type:'longtask',buffered:true});}catch(_){}
    });
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-nav="setup"]',{timeout:20000});
    // Instrument render(): a function declaration lives on window and can be wrapped.
    await page.evaluate(()=>{try{localStorage.setItem('septgigs.speed','0.05');}catch(_){}});
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-nav="setup"]',{timeout:20000});
    const res={profile:prof.name,duels:[]};
    for(let d=0;d<DUELS;d++){
      const startUrl=RESUME_FROM?url.replace(file,RESUME_FROM):url;
      if(d>0||RESUME_FROM){await page.goto(startUrl,{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-nav="setup"]',{timeout:20000});}
      await page.locator('[data-nav="setup"]').first().click();
      await page.locator('#start').click();
      let steps=0,actions={},over=null,stuck=0,lastSig='',resumed=!RESUME_FROM,resumedAtTurn=null;
      while(steps++<MAX_STEPS){
        if(!resumed){
          const ready=await page.evaluate(()=>!!__S.resolveMain&&__S.game.s.turn>=6&&!document.querySelector('.scrim .sheet')&&!!localStorage.getItem('septgigs.gameV230'));
          if(ready){
            resumedAtTurn=await page.evaluate(()=>__S.game.s.turn);
            await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-nav="setup"]',{timeout:20000});
            await page.locator('[data-nav="setup"]').first().click();
            await page.locator('#resumeGame').click({timeout:10000});
            resumed=true;continue;
          }
        }
        over=await page.evaluate(()=>{const o=document.querySelector('.over h1');return o?o.textContent:null;});
        if(over)break;
        const state=await page.evaluate(()=>{
          const sheet=document.querySelector('.scrim .sheet');
          const btns=sheet?[...sheet.querySelectorAll('button:not([disabled])')].filter(b=>!b.matches('[data-peek],[data-see],[data-close]')).map((b,k)=>k):[];
          return {sheet:!!sheet,btns:btns.length,main:!!__S.resolveMain,acts:(__S.acts||[]).length,turn:__S.game?.s.turn,
            sig:(sheet?sheet.textContent.slice(0,80):'')+'|'+(__S.acts||[]).length+'|'+__S.game?.s.turn+'|'+(__S.game?.s.log.length)};
        });
        if(state.sig===lastSig)stuck++;else{stuck=0;lastSig=state.sig;}
        if(stuck>60){res.duels.push({error:'BLOCAGE UI',state});break;}
        if(state.sheet&&state.btns){
          const sheetEl=page.locator('.scrim .sheet').last();
          const ok=sheetEl.locator('[data-ok]:not([disabled])');
          const opts=sheetEl.locator('button.opt:not([disabled]), [data-k]:not([disabled])');
          const nOpts=await opts.count();
          if(await ok.count()){ if(nOpts) await opts.nth(0).click({timeout:3000}).catch(()=>{});
            if(await ok.isEnabled().catch(()=>false)) await ok.click({timeout:3000}).catch(()=>{});
            else await sheetEl.locator('[data-skip]').click({timeout:3000}).catch(()=>{}); }
          else{
            const all=sheetEl.locator('button:not([disabled]):not([data-peek]):not([data-see]):not([data-close])');
            const n=await all.count(); if(n) await all.nth(Math.floor(Math.random()*n)).click({timeout:3000}).catch(()=>{});
          }
          actions.sheet=(actions.sheet||0)+1;
        }else if(state.main){
          const t=await page.evaluate(()=>{const a=__S.acts,ne=a.filter(x=>x.type!=='end');
            const pick=(!ne.length||Math.random()<0.15)?{type:'end'}:ne[Math.floor(Math.random()*ne.length)];
            __S.resolveMain(pick);return pick.type;});
          actions[t]=(actions[t]||0)+1;
        }else{ await page.waitForTimeout(40); }
      }
      const perf=await page.evaluate(()=>{const r=window.__rt.slice().sort((a,b)=>a-b),q=p=>r.length?+r[Math.floor(p*(r.length-1))].toFixed(1):0;
        const l=window.__long.slice();window.__rt=[];window.__long=[];
        return {renders:r.length,renderP50:q(.5),renderP95:q(.95),renderMax:q(1),longTasks:l.length,longestTask:Math.max(0,...l),turn:__S.game?.s.turn,dom:document.getElementsByTagName('*').length};});
      res.duels.push({result:over,steps,actions,resumedAtTurn,...perf,saveKB:await page.evaluate(()=>Math.round((localStorage.getItem('septgigs.gameV230')||'').length/1024))});
      if(RESUME_FROM&&!resumedAtTurn&&!over)res.duels[res.duels.length-1].error='REPRISE NON EFFECTUEE';
    }
    res.pageErrors=errors;res.consoleErrors=consoleErr.slice(0,20);
    out.profiles.push(res);await page.close();
  }
  await browser.close();server.close();
  out.status=out.profiles.every(p=>!p.pageErrors.length&&p.duels.every(d=>d.result&&!d.error))?'PASS':'FAIL';
  console.log(JSON.stringify(out,null,1));
  if(out.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(2);});
