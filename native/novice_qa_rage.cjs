'use strict';
/*
 * NOVICE RAGE — adversarial, reproducible browser QA for 7 Gigs PRIME.
 * No LLM subscription; dynamic exploration policy + deterministic fuzz/property tests.
 * Never clicks buy/update/reset/deletion controls. 100% sandboxed local browser profiles.
 */
const {chromium}=require('playwright');
const axe=require('axe-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(process.argv[2]||'/tmp/prime278-novice');
const out=path.resolve(process.argv[3]||'/tmp/novice-rage-report');
const seed=Number(process.env.RAGE_SEED||278001)>>>0;
const maxActions=Math.min(120,Math.max(12,Number(process.env.RAGE_ACTIONS||55)));
const MAX_ISSUES=250, MAX_SCREENSHOTS=32;
const report={agent:'NOVICE RAGE v2',target:'PRIME '+(process.env.NOVICE_TARGET_VERSION||'2.7.8'),seed,startedAt:new Date().toISOString(),
  environments:[],scenarios:[],issues:[],routeCoverage:[],actionLog:[],limitations:[
    'Testing uses Chromium with an isolated app origin; no actual Android WebView, updater or physical device.',
    'This is a coverage-guided QA agent, not a vision-language model; exploratory heuristics do not prove total coverage.',
    'Rule and AI correctness remain subject to independent official semantic verification.'
  ]};
let browser,server,base='',current=null,contextName='',scenarioName='',shotCount=0;
function rng(seedValue){let v=seedValue>>>0;return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
const random=rng(seed);
const rank={critical:0,major:1,minor:2,advice:3};
const unique=new Set();
function finding(severity,title,reason,selector='',steps=[]){
  const key=[contextName,scenarioName,title,selector].join('|');
  if(unique.has(key)||report.issues.length>=MAX_ISSUES)return;
  unique.add(key);
  report.issues.push({severity,title,reason:String(reason||'').slice(0,1500),selector,viewport:contextName,
    scenario:scenarioName,reproduce:steps.length?steps.slice(-16):report.actionLog.slice(-12).map(x=>x.action),
    time:new Date().toISOString()});
}
function record(action,detail=''){report.actionLog.push({viewport:contextName,scenario:scenarioName,action,detail:String(detail).slice(0,230)});}
function check(value,message){if(!value)throw Error(message);}
async function screenshot(page,reason){
  if(shotCount>=MAX_SCREENSHOTS||page.isClosed())return;
  const name=String(++shotCount).padStart(2,'0')+'-'+contextName+'-'+reason.replace(/[^a-z0-9]+/gi,'-').slice(0,60)+'.png';
  try{await page.screenshot({path:path.join(out,'captures',name),animations:'disabled',timeout:4500});}catch(_){}
}
function listen(page){
  page.on('pageerror',e=>finding('critical','Unhandled JavaScript exception',e.stack||e.message));
  page.on('crash',()=>finding('critical','Browser page crashed','Chromium signalled a page crash'));
  page.on('console',msg=>{
    if(msg.type()!=='error')return;
    const t=msg.text();
    if(/404|favicon|Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_BLOCKED_BY_CLIENT/i.test(t))return;
    finding('minor','Browser console error',t);
  });
}
async function environment(name,width,height,mobile,fn){
  contextName=name;
  report.environments.push({name,width,height,mobile});
  const ctx=await browser.newContext({baseURL:base,viewport:{width,height},isMobile:mobile,hasTouch:mobile,
    locale:'fr-FR',reducedMotion:'reduce',acceptDownloads:false});
  const page=await ctx.newPage();current=page;listen(page);
  try{await fn(page);}
  catch(e){finding('critical','Environment execution failed',e.stack||e);}
  finally{await ctx.close();current=null;}
}
async function task(page,title,fn,options={}){
  scenarioName=title;record('BEGIN '+title);
  const begin=Date.now();
  try{await fn();report.scenarios.push({viewport:contextName,name:title,status:'PASS',ms:Date.now()-begin});}
  catch(e){
    const severity=options.severity||'major';
    finding(severity,title,e.stack||e.message,'',options.steps||[]);
    report.scenarios.push({viewport:contextName,name:title,status:'FAIL',ms:Date.now()-begin,
      reason:String(e.message||e).slice(0,450)});
    await screenshot(page,'FAIL-'+title);
  }
}
async function home(page){
  record('GET /index.html');
  await page.goto('/index.html',{waitUntil:'domcontentloaded',timeout:12000});
  await page.locator('.hub-home').waitFor({timeout:10000});
}
async function route(page,name){
  await home(page);
  const nav=page.locator('.hub-home [data-nav="'+name+'"]').first();
  check(await nav.count(),'No home navigation link for '+name);
  record('CLICK [data-nav="'+name+'"]');
  await nav.click({timeout:4500});
  check(await page.locator('.screen').count(),'Navigation to '+name+' rendered no screen');
}
function visibleElement(e){
  const rect=e.getBoundingClientRect(),cs=getComputedStyle(e);
  return rect.width>0&&rect.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&cs.opacity!=='0';
}
async function layout(page,name,mobile){
  const state=await page.evaluate(()=>{
    const app=document.querySelector('#app');
    const elements=[...document.querySelectorAll('button,[role="button"],input,select,textarea,a[href]')];
    const visible=e=>{
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
    };
    const small=elements.filter(visible).filter(e=>{
      const r=e.getBoundingClientRect();
      return r.width<32||r.height<32;
    }).slice(0,10).map(e=>({text:(e.textContent||e.getAttribute('aria-label')||e.id).trim().slice(0,35),
      width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)}));
    const unnamed=elements.filter(visible).filter(e=>e.tagName==='BUTTON'&&!e.disabled&&
      !(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.innerText||'').trim()
    ).slice(0,10).map(e=>({id:e.id,html:e.outerHTML.slice(0,150)}));
    return {overflow:Math.max(0,Math.round(document.documentElement.scrollWidth-innerWidth)),
      bodyWidth:document.body.scrollWidth,viewport:innerWidth,buttons:elements.length,small,unnamed,
      screenText:(app?.innerText||'').trim().length};
  });
  report.routeCoverage.push({viewport:contextName,route:name,...state});
  if(state.overflow>12)finding('major','Horizontal overflow '+name,state.overflow+' px outside viewport');
  if(state.small.length&&mobile)finding('minor','Touch targets under 32px: '+name,JSON.stringify(state.small));
  if(state.unnamed.length)finding('major','Buttons without accessible names: '+name,JSON.stringify(state.unnamed));
  if(state.screenText<24)finding('major','Screen with almost no content: '+name,state.screenText+' visible text characters');
  return state;
}
async function accessibility(page,name){
  try{
    await page.addScriptTag({content:axe.source});
    const result=await page.evaluate(async()=>await window.axe.run(document,{
      runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},
      rules:{'region':{enabled:false}}
    }));
    for(const violation of result.violations){
      const sev=violation.impact==='critical'?'critical':violation.impact==='serious'?'major':'minor';
      const nodes=violation.nodes.slice(0,5).map(n=>({target:n.target,summary:n.failureSummary?.slice(0,140)}));
      finding(sev,'WCAG '+name+': '+violation.id,violation.help+' — '+JSON.stringify(nodes),
        nodes[0]?.target?.join(' ')||'');
    }
  }catch(e){finding('minor','Accessibility scanner failed: '+name,e.message);}
}
async function auditRoutes(page,{mobile=true,fullAxe=true}={}){
  await home(page);
  const routes=await page.locator('.hub-home [data-nav]').evaluateAll(list=>
    [...new Set(list.map(el=>el.getAttribute('data-nav')).filter(Boolean))]);
  const priority=['setup','decks','cards','academy','collection','lab','puzzles','analyse','journal',
    'rules','campaign','career'];
  const sorted=priority.filter(x=>routes.includes(x)).concat(routes.filter(x=>!priority.includes(x)));
  check(sorted.length>=9,'Too few discoverable home routes: '+sorted.length);
  for(const name of sorted){
    await task(page,'Route '+name,async()=>{
      await route(page,name);
      await layout(page,name,mobile);
      if(fullAxe&&['setup','decks','cards','collection','academy','rules','lab'].includes(name))
        await accessibility(page,name);
    },{severity:'major'});
  }
  record('DISCOVERED routes '+sorted.join(', '));
}
async function collectionTorture(page){
  await task(page,'Collection rapid +/- and reload',async()=>{
    await route(page,'collection');
    check(await page.locator('.collection-entry').count()===150,'Expected 150 collection cards');
    const id='mantis-blades';
    for(let i=0;i<24;i++)await page.locator('[data-own-plus="'+id+'"]').click({timeout:3500});
    check((await page.locator('[data-own-count="'+id+'"]').textContent()).trim()==='24','Rapid increments lost');
    for(let i=0;i<13;i++)await page.locator('[data-own-minus="'+id+'"]').click({timeout:3500});
    check((await page.locator('[data-own-count="'+id+'"]').textContent()).trim()==='11','Rapid decrements lost');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.hub-home [data-nav="collection"]').first().click();
    check((await page.locator('[data-own-count="'+id+'"]').textContent()).trim()==='11','Reload lost owned quantities');
    await screenshot(page,'collection-stress');
  });
  await task(page,'Imported names and copy limits property test',async()=>{
    await route(page,'collection');
    const state=await page.evaluate(()=>{
      const ids=Object.keys(CARDS).sort(),errors=[];
      for(let i=0;i<ids.length;i++){
        const id=ids[i];
        const x=CollectionAdvisor.importText('2x '+id,CARDS,{});
        if(x.parsed!==2||x.owned[id]!==2||x.errors.length)errors.push('parse '+id);
        const y=CollectionAdvisor.importText('99x '+id,CARDS,{[id]:1});
        if(y.owned[id]!==99)errors.push('cap '+id);
      }
      const unknown=CollectionAdvisor.importText('1x totally-fictitious-card',CARDS,{});
      if(unknown.parsed!==0||unknown.errors.length!==1)errors.push('unknown accepted');
      const untouched=CollectionAdvisor.importText('2x totally-fictitious-card',CARDS,{'mantis-blades':7});
      if(untouched.owned['mantis-blades']!==7)errors.push('unknown destroys collection');
      return {tested:ids.length,errors:errors.slice(0,25)};
    });
    record('CARDS property tested '+state.tested);
    check(state.tested===150,'Not all cards tested: '+state.tested);
    check(!state.errors.length,'Parser invariants: '+state.errors.join('; '));
  });
  await task(page,'CSV qty,name with header and file picker',async()=>{
    await route(page,'collection');
    await page.locator('#collectionImport').click();
    await page.locator('#ownedFile').setInputFiles({name:'collection.csv',mimeType:'text/csv',
      buffer:Buffer.from('quantite,carte\n2,mantis-blades\n1,corpo-security\n')});
    await page.waitForFunction(()=>document.querySelector('#ownedPaste')?.value.includes('2,mantis-blades'),null,{timeout:3000});
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('septgigs.collectionV1')||'{}'));
    await page.locator('#ownedApply').click();
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('septgigs.collectionV1')||'{}'));
    check(after['mantis-blades']===((before['mantis-blades']||0)+2),
      'CSV qty,name file did not add 2 Mantis Blades; before='+JSON.stringify(before)+' after='+JSON.stringify(after));
    check(after['corpo-security']===((before['corpo-security']||0)+1),
      'CSV qty,name file did not add Corpo Security');
  },{severity:'major',steps:['Ouvrir Ma collection','Importer une liste','Choisir collection.csv (quantite,carte / 2,mantis-blades / 1,corpo-security)','Valider','Lire la collection']});
  await task(page,'Import huge file is blocked safely',async()=>{
    await route(page,'collection');
    await page.locator('#collectionImport').click();
    await page.locator('#ownedFile').setInputFiles({name:'too-big.txt',mimeType:'text/plain',
      buffer:Buffer.alloc(1024*1024+16,65)});
    const text=(await page.locator('#app .toast').allInnerTexts()).join(' ');
    check(/volumineux|1 Mo/i.test(text),'No visible warning when importing file >1 MiB');
  });
  await task(page,'Collection filters and reset cancellation',async()=>{
    await route(page,'collection');
    await page.locator('#collectionSearch').fill('Mantis');
    await page.waitForTimeout(360);
    check(await page.locator('.collection-entry').count()>0,'Filter finds no Mantis card');
    await page.locator('#collectionSearch').fill('impossible-zzz-unknown');
    await page.waitForTimeout(360);
    check(await page.locator('.collection-entry').count()===0,'Nonsense search is not empty');
    await route(page,'collection');
    page.once('dialog',d=>d.dismiss());
    const before=await page.evaluate(()=>localStorage.getItem('septgigs.collectionV1'));
    await page.locator('#collectionReset').click();
    const after=await page.evaluate(()=>localStorage.getItem('septgigs.collectionV1'));
    check(before===after,'Cancel reset destroyed collection data');
  });
}
async function builderTorture(page){
  await task(page,'Illegal deck cannot be saved',async()=>{
    await route(page,'decks');await page.locator('#newDeck').click();
    check(await page.locator('#saveDeck').isDisabled(),'Empty deck can be saved illegally');
    await page.locator('[data-plus]').first().click();
    check(await page.locator('#saveDeck').isDisabled(),'One-card deck can be saved illegally');
    await page.locator('#deckName').fill('RAGE-DECK-TEST');
    await page.locator('[data-nav="decks"]').first().click();
    const draft=page.locator('[data-draft-resume]').first();
    check(await draft.count()>0,'One-card draft was not saved');
    await draft.click();check((await page.locator('#deckName').inputValue()).includes('RAGE-DECK-TEST'),'Draft name lost');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.hub-home [data-nav="decks"]').first().click();
    check(await page.locator('[data-draft-resume]').count()>0,'Draft lost after reload');
    await screenshot(page,'deck-draft');
  });
  await task(page,'Deck legality and hidden fake cards property test',async()=>{
    await route(page,'decks');
    const x=await page.evaluate(()=>{
      const decks=presetDecks(),errors=[];
      for(const [name,deck] of Object.entries(decks)){
        if(validateDeck(deck).length)errors.push('preset '+name+' invalid');
        if(validateDeck({...deck,main:[...deck.main.slice(1),'not-real-card']}).length===0)errors.push('unknown accepted '+name);
        if(validateDeck({...deck,main:deck.main.concat(deck.main.slice(0,12))}).length===0 &&
          deck.main.length+12>50)errors.push('oversize accepted '+name);
      }
      for(const invalid of [null,{},[],{legends:[],main:[]}]) {
        try{if(validateDeck(invalid).length===0)errors.push('invalid accepted '+String(invalid));}
        catch(e){errors.push('crash malformed input '+String(e));}
      }
      return {decks:Object.keys(decks).length,errors};
    });
    check(x.decks>=5,'Too few preset decks found');
    check(x.errors.length===0,'Deck verifier failures: '+x.errors.join('; '));
  });
}
async function learningTorture(page){
  await task(page,'Rules tutorial double navigation',async()=>{
    await route(page,'setup');await page.locator('[data-nav="tutorial"]').click();
    for(let i=0;i<3;i++)await page.locator('#tNext').click();
    for(let i=0;i<3;i++)await page.locator('#tPrev').click();
    check(/1\/7|1\s*\/\s*7/i.test(await page.locator('small').first().innerText()),
      'Tutorial did not return to step 1');
    for(let i=0;i<7;i++)await page.locator('#tNext').click();
    check(await page.locator('#start').count()>0,'Tutorial did not reach real game setup');
  });
  await task(page,'Synergy guide across all pairs and missing cards',async()=>{
    await route(page,'collection');await page.locator('#synergyTutorial').click();
    const n=await page.evaluate(()=>CollectionAdvisor.tutorials({},CARDS).length);
    check(n>=6,'Expected at least six synergy tutorials');
    for(let i=0;i<n;i++){
      check(await page.locator('.lesson-pair [data-tcard]').count()===2,'Missing cards in pair '+(i+1));
      const steps=await page.locator('#lessonNext');
      for(let k=0;k<3;k++)if(await steps.isEnabled())await steps.click();
      if(i<n-1)await page.locator('#lessonNextPair').click();
    }
    check(await page.locator('#lessonNextPair').isDisabled(),'Next pair button should disable at end');
    await screenshot(page,'synergy-end');
  });
}
async function performanceTorture(page){
  await task(page,'Cold launch and route timings',async()=>{
    const timings=[];
    for(const name of ['collection','decks','setup','academy']){
      const started=Date.now();await route(page,name);const ms=Date.now()-started;
      timings.push({route:name,ms});
      if(ms>6500)finding('major','Route too slow '+name,ms+'ms (budget 6.5s in Chromium runner)');
      else if(ms>3000)finding('minor','Route slow '+name,ms+'ms');
    }
    report.timings=(report.timings||[]).concat({viewport:contextName,timings});
  });
  await task(page,'Local storage corruption does not break launch',async()=>{
    await home(page);
    await page.evaluate(()=>{
      localStorage.setItem('septgigs.collectionV1','{not json');
      localStorage.setItem('septgigs.decks','{"prototype":{}}');
      localStorage.setItem('septgigs.myDeck','"this-deck-does-not-exist"');
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.hub-home').waitFor({timeout:7000});
    await page.locator('.hub-home [data-nav="decks"]').first().click();
    check(await page.locator('.tcg-deck-card').count()>0,'Corrupt local storage hides all decks');
  });
}
async function randomWalk(page){
  await task(page,'Adversarial seeded exploration of live controls',async()=>{
    const routes=['academy','cards','collection','decks','setup','puzzles','analyse','journal','rules','campaign','career','lab'];
    const used=new Map();
    await home(page);
    for(let i=0;i<maxActions;i++){
      if(i%9===0)await home(page);
      const actions=await page.evaluate(()=>{
        // Never click a duplicate CSS selector's first element when the actual
        // chosen element is a different visible button. Also respect modals.
        document.querySelectorAll('[data-rage-target]').forEach(x=>x.removeAttribute('data-rage-target'));
        const allow=['[data-nav]','[data-open-home-menu]','[data-close]','#synergyTutorial','#lessonNext','#lessonBack',
          '#lessonNextPair','#lessonPrevPair','[data-tfilter]','[data-own-plus]','[data-own-minus]',
          '#collectionImport','#newDeck','#tabPool','#tabDeck'];
        const visible=e=>{
          const r=e.getBoundingClientRect(),cs=getComputedStyle(e);
          return r.width>=12&&r.height>=12&&r.top<innerHeight&&r.bottom>0&&
            r.left<innerWidth&&r.right>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&!e.disabled;
        };
        const modal=[...document.querySelectorAll('.scrim,.sheet[role="dialog"]')].reverse().find(visible);
        const candidates=[...document.querySelectorAll(allow.join(','))].filter(visible)
          .filter(e=>!e.matches('[data-prime-update],[data-remove],[data-reset],[data-draft-del]'))
          .filter(e=>!modal||modal.contains(e))
          .filter(e=>{
            const r=e.getBoundingClientRect();
            const cx=Math.max(0,Math.min(innerWidth-1,r.left+r.width/2));
            const cy=Math.max(0,Math.min(innerHeight-1,r.top+r.height/2));
            const front=document.elementFromPoint(cx,cy);
            return front&&(front===e||e.contains(front));
          });
        return candidates.slice(0,100).map((e,j)=>{
          e.setAttribute('data-rage-target',String(j));
          return {selector:'[data-rage-target="'+j+'"]',
            key:e.id||e.getAttribute('data-nav')||e.getAttribute('data-tfilter')||
              e.getAttribute('data-own-plus')||e.getAttribute('data-own-minus')||e.getAttribute('data-close')||
              (e.innerText||'button').slice(0,35),
            route:e.getAttribute('data-nav'),
            title:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,50)};
        });
      });
      const permitted=actions.filter(a=>!/\bstart\b|saveDeck|saveDraft|ImportDeck|exportDeck|collectionReset/i.test(a.key)&&
        (!a.route||routes.includes(a.route)||a.route==='home'));
      if(!permitted.length){
        // A blocking sheet with no safe button must be dismissed before resuming.
        await page.keyboard.press('Escape');await home(page);continue;
      }
      permitted.sort((a,b)=>(used.get(a.key)||0)-(used.get(b.key)||0));
      const quartile=Math.max(1,Math.ceil(permitted.length*.5));
      const pick=permitted[Math.floor(random()*quartile)];
      record('RANDOM '+(i+1)+' CLICK '+pick.key,pick.title);
      try{await page.locator(pick.selector).click({timeout:2500});}
      catch(e){
        // This is a real, uniquely identified on-screen target; keep the
        // evidence instead of reporting a duplicated-selector false positive.
        finding('minor','Unclickable visible control '+pick.key,e.message,pick.selector);
        await screenshot(page,'random-unclickable');await home(page);continue;
      }
      used.set(pick.key,(used.get(pick.key)||0)+1);
      if(i%5===0)await layout(page,'random-'+i,contextName.includes('mobile')||contextName.includes('small'));
      check(await page.locator('#app').count()>0,'App root disappeared at random step '+i);
    }
    report.randomWalk=report.randomWalk||{};
    report.randomWalk[contextName]={steps:maxActions,distinctControls:used.size,visited:[...used.entries()]};
  });
}
function md(){
  const passes=report.scenarios.filter(x=>x.status==='PASS').length;
  const fails=report.scenarios.length-passes;
  const count=sev=>report.issues.filter(x=>x.severity===sev).length;
  const lines=['# NOVICE RAGE — Audit hostile PRIME 2.7.8','','**Seed :** '+seed+' — **Date :** '+report.startedAt,
    '**Scénarios :** '+passes+' réussis / '+fails+' en échec.',
    '**Défauts :** '+count('critical')+' critiques, '+count('major')+' majeurs, '+count('minor')+' mineurs, '+count('advice')+' conseils.',
    '**Politique :** un défaut critique ou majeur fait échouer le contrôle qualité. Un workflow rouge est volontaire si le défaut est confirmé.','','## Défauts prioritaires',''];
  const ordered=report.issues.slice().sort((a,b)=>rank[a.severity]-rank[b.severity]);
  if(!ordered.length)lines.push('Aucun défaut détecté dans cette exploration bornée.');
  ordered.forEach((x,i)=>{
    lines.push('### '+(i+1)+'. ['+x.severity.toUpperCase()+'] '+x.title,'','- Écran : '+x.viewport+
      ' / '+x.scenario,'- Élément : '+(x.selector||'non spécifié'),
      '- Preuve : '+x.reason.replace(/[\r\n]+/g,' ').slice(0,700),
      '- Reproduire : '+(x.reproduce.length?x.reproduce.join(' → ').slice(0,420):'Voir scénario correspondant'),'');
  });
  lines.push('## Scénarios','','| Écran | Test | Résultat |','|---|---|---|');
  report.scenarios.forEach(x=>lines.push('| '+x.viewport+' | '+x.name.replace(/[|]/g,'/')+' | '+x.status+' |'));
  lines.push('','## Limites','','- '+report.limitations.join('\n- '),'',
    'Les captures et le journal JSON sont archivés dans l’artefact GitHub Actions. Ne pas assimiler un audit réussi à une certification de toutes les règles.');
  return lines.join('\n')+'\n';
}
async function run(){
  fs.mkdirSync(path.join(out,'captures'),{recursive:true});
  check(fs.existsSync(path.join(root,'index.html')),'Built runtime missing: '+root+'/index.html');
  server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+pathname);
    if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){
      res.writeHead(404);res.end();return;
    }
    res.writeHead(200,{'Content-Type':target.endsWith('.html')?'text/html; charset=utf-8':
      target.endsWith('.js')?'application/javascript':'application/octet-stream'});
    fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  await environment('small320',320,640,true,async p=>{await auditRoutes(p,{mobile:true,fullAxe:false});await randomWalk(p);});
  await environment('mobile390',390,844,true,async p=>{
    await auditRoutes(p,{mobile:true,fullAxe:true});
    await collectionTorture(p);await builderTorture(p);await learningTorture(p);
    await performanceTorture(p);await randomWalk(p);
  });
  await environment('tablet768',768,1024,true,async p=>{await auditRoutes(p,{mobile:true,fullAxe:false});await randomWalk(p);});
  await environment('desktop1280',1280,800,false,async p=>{
    await auditRoutes(p,{mobile:false,fullAxe:true});
    await collectionTorture(p);await builderTorture(p);await learningTorture(p);
    await performanceTorture(p);await randomWalk(p);
  });
}
(async()=>{
  try{await run();}catch(e){finding('critical','Agent runtime failure',e.stack||e);}
  finally{
    try{await browser?.close();}catch(_){}
    try{server?.close();}catch(_){}
    report.finishedAt=new Date().toISOString();
    report.metrics={passed:report.scenarios.filter(x=>x.status==='PASS').length,
      failed:report.scenarios.filter(x=>x.status==='FAIL').length,
      critical:report.issues.filter(x=>x.severity==='critical').length,
      major:report.issues.filter(x=>x.severity==='major').length,
      minor:report.issues.filter(x=>x.severity==='minor').length,
      randomActions:Object.values(report.randomWalk||{}).reduce((a,b)=>a+b.steps,0)};
    fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'novice-rage-report.json'),JSON.stringify(report,null,2)+'\n');
    fs.writeFileSync(path.join(out,'novice-rage-report.md'),md());
    process.stdout.write(JSON.stringify({agent:report.agent,seed,metrics:report.metrics,
      issues:report.issues.slice(0,70).map(x=>({severity:x.severity,title:x.title,viewport:x.viewport,reason:x.reason.slice(0,220)}))},null,2)+'\n');
    if(report.metrics.critical||report.metrics.major||report.metrics.failed)process.exitCode=1;
  }
})();
