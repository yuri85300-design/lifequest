'use strict';
/* PRIME 2.7.5 — NIGHTMARE forge end-to-end in Chromium (mobile viewport).
 * Real counter-deck search and full evolution cycle from the lab, adaptive
 * opponent in a real duel, background learning after the duel, copy/delete,
 * export -> reset -> import round trip. Reports page errors and UI stalls.
 * Usage: node nightmare_forge_ui_275.cjs <built-dir> [index.html]
 */
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const dir=process.argv[2],file=process.argv[3]||'index.html';
const instrument=h=>h.replace('function render() {','window.__S=S;function render() {');
const server=http.createServer((q,r)=>{const f=path.join(dir,decodeURIComponent(q.url.split('?')[0]));
  if(!f.startsWith(dir)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
  const html=f.endsWith('.html');r.writeHead(200,{'content-type':html?'text/html; charset=utf-8':'text/javascript'});
  if(html)return r.end(instrument(fs.readFileSync(f,'utf8')));fs.createReadStream(f).pipe(r);});
const out={checks:{}};const ok=(k,v)=>{out.checks[k]=v?'PASS':'FAIL';};
const idle=async page=>page.evaluate(()=>!document.querySelector('#forgeCycle')?.disabled);
async function waitForge(page,limitMs){const t=Date.now();await page.waitForTimeout(500);
  while(Date.now()-t<limitMs){if(await idle(page))return Date.now()-t;await page.waitForTimeout(1000);}return -1;}
async function playDuel(page){
  let steps=0,over=null;
  while(steps++<800&&!over){
    over=await page.evaluate(()=>document.querySelector('.over h1')?.textContent||null);if(over)break;
    const st=await page.evaluate(()=>({sheet:!!document.querySelector('.scrim .sheet'),main:!!__S.resolveMain}));
    if(st.sheet){const sh=page.locator('.scrim .sheet').last();const okb=sh.locator('[data-ok]:not([disabled])');
      if(await okb.count()){const o=sh.locator('button.opt:not([disabled])');if(await o.count())await o.first().click().catch(()=>{});
        if(await okb.isEnabled().catch(()=>false))await okb.click().catch(()=>{});else await sh.locator('[data-skip]').click().catch(()=>{});}
      else{const b=sh.locator('button:not([disabled]):not([data-peek]):not([data-see]):not([data-close])');const n=await b.count();if(n)await b.nth(Math.floor(Math.random()*n)).click().catch(()=>{});}}
    else if(st.main)await page.evaluate(()=>{const a=__S.acts,ne=a.filter(x=>x.type!=='end');__S.resolveMain((!ne.length||Math.random()<.15)?{type:'end'}:ne[Math.floor(Math.random()*ne.length)]);});
    else await page.waitForTimeout(40);
  }
  return over;
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/${file}`;
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration));}).observe({type:'longtask',buffered:true});}catch(_){}});
  const openLab=async()=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-nav="lab"]').first().click();await page.waitForSelector('#forgeCycle');};
  await openLab();
  ok('forgeSectionPresent',await page.locator('#forgeCycle').isVisible());

  // 1. real counter-deck search against the active deck
  await page.locator('#forgeCounter').click();
  out.counterMs=await waitForge(page,10*60*1000);
  out.counterStatus=await page.locator('#forgeStatus').textContent();
  ok('counterCompletes',out.counterMs>0&&/Contre-deck/.test(out.counterStatus));
  // 2. full cycle (create + improve + counter)
  await page.locator('#forgeCycle').click();
  out.cycleMs=await waitForge(page,20*60*1000);
  out.cycleStatus=await page.locator('#forgeStatus').textContent();
  ok('cycleCompletes',out.cycleMs>0&&/Tactique/.test(out.cycleStatus)&&/Entraînement/.test(out.cycleStatus)&&/Création/.test(out.cycleStatus)&&/Amélioration/.test(out.cycleStatus)&&/Contre-deck/.test(out.cycleStatus));
  out.longestMainThreadTaskMs=await page.evaluate(()=>Math.max(0,...window.__long));
  ok('uiResponsiveWhileForging',out.longestMainThreadTaskMs<1500);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('septgigs.nightmareDecksV1')||'{"decks":{}}'));
  out.decksAfterForge=Object.keys(stored.decks||{}).length;
  ok('storedDecksAreLegal',await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('septgigs.nightmareDecksV1')||'{"decks":{}}').decks||{}).every(d=>!validateDeck(d).length)));

  // 3. adaptive opponent with a known counter (injected), real duel
  await page.evaluate(()=>{
    const P=presetDecks(),mine=P['the-heist'],c=P['voodoo'];
    const x=JSON.parse(localStorage.getItem('septgigs.nightmareDecksV1')||'{"decks":{},"counters":{}}');x.decks=x.decks||{};x.counters=x.counters||{};
    x.decks['nm-test']={name:'NIGHTMARE · Test',desc:'Contre-deck de test',legends:c.legends,main:c.main,kind:'counter',rate:.9,games:200,version:1};
    x.counters[NightmareForge.signature(mine)]='nm-test';
    localStorage.setItem('septgigs.nightmareDecksV1',JSON.stringify(x));localStorage.setItem('septgigs.myDeck',JSON.stringify('the-heist'));
    localStorage.setItem('septgigs.aiDeck',JSON.stringify('nm-adaptive'));localStorage.setItem('septgigs.speed','0.05');
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('[data-nav="setup"]').first().click();
  ok('adaptiveOptionSelected',await page.locator('#enemyDeck').inputValue()==='nm-adaptive');
  ok('adaptiveExplained',/contre-deck validé/.test(await page.locator('#rivalBrief').textContent()));
  await page.locator('#start').click();
  await page.waitForFunction(()=>!!__S.game,{timeout:20000});
  ok('aiPlaysCounterDeck',await page.evaluate(()=>{const v=presetDecks()['voodoo'];return __S.game.s.players[1].legends.map(l=>l.id).sort().join()===v.legends.slice().sort().join();}));
  const over=await playDuel(page);
  ok('adaptiveDuelCompletes',!!over);
  // 4. background learning after the duel (no reload: the player stays in the app)
  const t=Date.now();let learned=null;
  while(Date.now()-t<6*60*1000){await page.waitForTimeout(2000);
    learned=await page.evaluate(()=>JSON.parse(localStorage.getItem('septgigs.nightmareAutoLast')||'null'));if(learned)break;}
  out.afterDuel=learned;ok('backgroundLearningRuns',!!learned&&['aucun','evolved','selected'].includes(learned.result));
  await openLab();ok('backgroundResultShownInLab',/Dernier apprentissage après duel/.test(await page.locator('#forgeStatus').textContent()));
  // 5. copy, export, reset, import
  await openLab();
  await page.locator('[data-nm-copy="nm-test"]').click();
  ok('copyToMyDecks',await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('septgigs.decks')||'{}')).some(d=>d.name==='Copie · Test')));
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#nmExport').click()]);
  const exported=path.join(os.tmpdir(),'nm-export-'+Date.now()+'.json');await dl.saveAs(exported);
  const payload=JSON.parse(fs.readFileSync(exported,'utf8'));
  ok('exportComplete',payload.schema==='nightmare-v1'&&!!payload.decks?.decks?.['nm-test']);
  await page.locator('#forgeReset').click();
  ok('resetClears',await page.evaluate(()=>!localStorage.getItem('septgigs.nightmareDecksV1')));
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#nmImport').click()]);
  await chooser.setFiles(exported);await page.waitForTimeout(800);
  ok('importRestores',await page.evaluate(()=>!!JSON.parse(localStorage.getItem('septgigs.nightmareDecksV1')||'{"decks":{}}').decks['nm-test']));
  out.listAfterImport=await page.evaluate(()=>[...document.querySelectorAll('[data-nm-del]')].map(b=>b.dataset.nmDel));
  await page.locator('[data-nm-del="nm-test"]').click({timeout:5000}).catch(e=>{out.deleteError=String(e).slice(0,200);});await page.waitForTimeout(300);
  ok('deleteDeck',await page.evaluate(()=>!JSON.parse(localStorage.getItem('septgigs.nightmareDecksV1')||'{"decks":{}}').decks['nm-test']));

  out.pageErrors=errors;ok('noPageErrors',errors.length===0);
  await browser.close();server.close();
  out.status=Object.values(out.checks).every(v=>v==='PASS')?'PASS':'FAIL';
  console.log(JSON.stringify(out,null,1));
  if(out.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(2);});
