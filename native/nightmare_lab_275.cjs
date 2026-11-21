'use strict';
/* PRIME 2.7.5 — NIGHTMARE lab end-to-end in Chromium, on the PUBLISHED runtime.
 * 1. A real 300 + 80 match training run from the UI: completes, keeps the UI
 *    responsive, never changes the champion without the player's decision.
 * 2. Adoption of a validated challenger, then restoration of the original.
 * 3. A duel against the adopted champion uses its plans without errors.
 * Usage: node nightmare_lab_275.cjs <built-dir> [index.html]
 */
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const dir=process.argv[2],file=process.argv[3]||'index.html';
const instrument=h=>h.replace('function render() {','window.__S=S;function render() {');
const server=http.createServer((q,r)=>{const f=path.join(dir,decodeURIComponent(q.url.split('?')[0]));
  if(!f.startsWith(dir)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
  const html=f.endsWith('.html');r.writeHead(200,{'content-type':html?'text/html; charset=utf-8':'text/javascript'});
  if(html)return r.end(instrument(fs.readFileSync(f,'utf8')));fs.createReadStream(f).pipe(r);});
const out={checks:{}};
const ok=(k,v)=>{out.checks[k]=v?'PASS':'FAIL';};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/${file}`;
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.addInitScript(()=>{window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration));}).observe({type:'longtask',buffered:true});}catch(_){}});
  const openLab=async()=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-nav="lab"]').first().click();await page.waitForSelector('#labTrain');};
  await openLab();

  // ---- 1. real training run
  ok('trainButtonEnabled',await page.locator('#labTrain').isEnabled());
  ok('adoptHiddenInitially',await page.locator('#labAdopt').isHidden());
  const t0=Date.now();
  await page.locator('#labTrain').click();
  let samples=0,progressed=false;
  while(Date.now()-t0<15*60*1000){
    const st=await page.locator('#labStatus').textContent();
    if(/auto-duels · validation/.test(st)||/interrompu|Erreur/.test(st))break;
    if(/Auto-affrontement|Test indépendant/.test(st))progressed=true;
    samples++;await page.waitForTimeout(1000);
  }
  const status=await page.locator('#labStatus').textContent();
  out.trainingSeconds=Math.round((Date.now()-t0)/1000);out.trainingStatus=status;
  const report=await page.evaluate(()=>JSON.parse(localStorage.getItem('septgigs.nightmareSandboxTraining')||'null'));
  out.report=report&&{matches:report.matches,wins:report.wins,losses:report.losses,draws:report.draws,upgraded:report.upgraded};
  ok('trainingCompleted',!!report&&report.matches===300&&report.validationMatches===80&&report.incompleteValidation===0);
  ok('progressShown',progressed);
  ok('championUnchangedWithoutDecision',await page.evaluate(()=>localStorage.getItem('septgigs.championBrain')===null));
  ok('adoptOfferedOnlyIfUpgraded',(await page.locator('#labAdopt').isVisible())===!!report?.upgraded);
  const longest=await page.evaluate(()=>Math.max(0,...window.__long));
  out.longestMainThreadTaskMs=longest;
  ok('uiResponsiveDuringTraining',longest<1000);

  // ---- 2. adoption of a validated challenger, then restoration
  await page.evaluate(()=>{
    const plans=window.DeckPlanAI.mutate(window.DeckPlanAI.INITIAL,()=>0.9,.3);
    localStorage.setItem('septgigs.nightmareSandboxTraining',JSON.stringify({rulesHash:__S.brain.rulesHash,mode:'EXPERIMENTAL_UNCERTIFIED',
      date:'2026-11-21T10:00:00.000Z',matches:300,validationMatches:80,wins:52,losses:26,draws:2,incompleteValidation:0,upgraded:true,plans,adopted:false}));
    window.__plans=JSON.stringify(plans);
  });
  const plansJson=await page.evaluate(()=>window.__plans);
  await openLab();
  ok('adoptVisibleForValidatedChallenger',await page.locator('#labAdopt').isVisible());
  await page.locator('#labAdopt').click();
  const adopted=await page.evaluate(()=>({stored:JSON.parse(localStorage.getItem('septgigs.championBrain')||'null'),live:JSON.stringify(__S.brain.plans),champ:JSON.stringify(window.AIPlanChampion())}));
  ok('adoptionStored',adopted.stored?.origin==='lab'&&JSON.stringify(adopted.stored.plans)===plansJson);
  ok('adoptionUsedByAI',adopted.live===plansJson&&adopted.champ===plansJson);
  ok('adoptHiddenAfterAdoption',await page.locator('#labAdopt').isHidden());
  await openLab();
  ok('adoptionSurvivesReload',await page.evaluate(p=>JSON.stringify(__S.brain.plans)===p,plansJson));
  ok('restoreVisible',await page.locator('#labRestore').isVisible());

  // ---- 3. a duel against the adopted champion
  await page.locator('[data-nav="home"]').first().click().catch(()=>{});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('[data-nav="setup"]').first().click();
  await page.locator('#start').click();
  let steps=0,over=null;
  while(steps++<700&&!over){
    over=await page.evaluate(()=>document.querySelector('.over h1')?.textContent||null);if(over)break;
    const st=await page.evaluate(()=>({sheet:!!document.querySelector('.scrim .sheet'),main:!!__S.resolveMain}));
    if(st.sheet){const sh=page.locator('.scrim .sheet').last();const okb=sh.locator('[data-ok]:not([disabled])');
      if(await okb.count()){const o=sh.locator('button.opt:not([disabled])');if(await o.count())await o.first().click().catch(()=>{});
        if(await okb.isEnabled().catch(()=>false))await okb.click().catch(()=>{});else await sh.locator('[data-skip]').click().catch(()=>{});}
      else{const b=sh.locator('button:not([disabled]):not([data-peek]):not([data-see]):not([data-close])');const n=await b.count();if(n)await b.nth(Math.floor(Math.random()*n)).click().catch(()=>{});}}
    else if(st.main)await page.evaluate(()=>{const a=__S.acts,ne=a.filter(x=>x.type!=='end');__S.resolveMain((!ne.length||Math.random()<.15)?{type:'end'}:ne[Math.floor(Math.random()*ne.length)]);});
    else await page.waitForTimeout(40);
  }
  const ai=await page.evaluate(()=>({...__S.aiStats,plansInUse:JSON.stringify(__S.brain.plans)}));
  out.duel={result:over,ai:{searched:ai.searched,fallback:ai.fallback}};
  ok('duelWithAdoptedChampionCompletes',!!over);
  ok('adoptedChampionSearched',ai.searched>0&&ai.plansInUse===plansJson);

  // restore original
  await openLab();
  page.once('dialog',d=>d.accept());
  await page.locator('#labRestore').click();
  const restored=await page.evaluate(()=>({stored:localStorage.getItem('septgigs.championBrain'),plans:__S.brain.plans||null}));
  ok('restoreOriginal',restored.stored===null&&restored.plans===null);
  await openLab();
  ok('restoreSurvivesReload',await page.evaluate(()=>!__S.brain.plans&&localStorage.getItem('septgigs.championBrain')===null));

  out.pageErrors=errors;ok('noPageErrors',errors.length===0);
  await browser.close();server.close();
  out.status=Object.values(out.checks).every(v=>v==='PASS')?'PASS':'FAIL';
  console.log(JSON.stringify(out,null,1));
  if(out.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(2);});
