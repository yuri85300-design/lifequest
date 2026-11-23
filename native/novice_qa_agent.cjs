'use strict';
/*
 * NOVICE — an autonomous first-use QA explorer for 7 Gigs PRIME.
 * Uses the actual PRIME 2.7.8 browser runtime, not the obsolete 2.2.0 smoke target.
 * A goal-driven, bounded exploration policy discovers links from the live interface.
 * No remote LLM, account data or production games are needed.
 */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(process.argv[2]||'/tmp/prime278-novice');
const output=path.resolve(process.argv[3]||path.join(root,'novice-agent-report'));
const maxRoutes=Math.max(2,Math.min(25,Number(process.env.NOVICE_MAX_ROUTES||18)));
const report={agent:'NOVICE v1',target:'PRIME 2.7.8',runtime:'browser sandbox',generatedAt:new Date().toISOString(),
  scenarios:[],issues:[],pages:[],metrics:{},limits:['Interface HTML Chromium uniquement : aucun APK physique ni preuve de conformité exhaustive des cartes.','Les contrôles de tutoriel et de partie ne prouvent pas la validité stratégique des effets.']};
const levels={critical:0,major:1,minor:2,advice:3};
let browser,server,activePage=null,baseURL='',step='initialisation',view='unknown',shot=0;
function issue(severity,title,details,selector){
  const item={severity,title,details:String(details||'').slice(0,1250),selector:selector||'',scenario:step,viewport:view};
  if(report.issues.some(x=>x.title===item.title&&x.viewport===view&&x.scenario===step&&x.selector===item.selector))return;
  report.issues.push(item);
}
function entry(name,state,detail){
  report.scenarios.push({viewport:view,name,result:state,detail:detail||''});
}
async function task(name,fn){
  step=name;
  try{await fn();entry(name,'PASS');}
  catch(e){entry(name,'FAIL',String(e.message||e).slice(0,350));issue('major',name,e.stack||e);if(activePage)await picture(activePage,'echec-'+name);}
}
function assert(ok,msg){if(!ok)throw Error(msg);}
function watch(page){
  page.on('pageerror',e=>issue('critical','Erreur JavaScript non interceptée',e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/404|Failed to load resource|ERR_|favicon/i.test(m.text()))
    issue('minor','Erreur dans la console',m.text());});
}
function status(page){
  return page.locator('#app .screen').first().isVisible().catch(()=>false);
}
async function snapshot(page,name){
  if(!await status(page))return;
  const state=await page.evaluate(()=>{
    const el=document.querySelector('#app .screen'),h=el?.querySelector('h1,h2,h3');
    const actions=[...document.querySelectorAll('#app [data-nav],#app button')].filter(x=>{
      const r=x.getBoundingClientRect();const st=getComputedStyle(x);
      return r.width>0&&r.height>0&&st.visibility!=='hidden'&&st.display!=='none';
    }).slice(0,110).map(x=>({name:(x.textContent||x.getAttribute('aria-label')||'').trim().slice(0,55),
      route:x.getAttribute('data-nav'),id:x.id,disabled:x.disabled}));
    return {heading:h?.textContent?.trim().slice(0,100)||'',controls:actions,htmlLength:el?.textContent?.length||0,
      horizontalOverflow:Math.max(0,Math.round(document.documentElement.scrollWidth-innerWidth))};
  });
  report.pages.push({viewport:view,step:name,...state});
  if(state.horizontalOverflow>12)issue('major','Débordement horizontal',state.horizontalOverflow+' px hors de l’écran');
  const btns=await page.evaluate(()=>{
    const selectors='#app .actionbar button,#app .hub-shortcut,#app .hub-tool,#app .collection-entry button';
    return [...document.querySelectorAll(selectors)].filter(b=>{
      const r=b.getBoundingClientRect(),s=getComputedStyle(b);
      return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&r.top<innerHeight&&r.bottom>0;
    }).filter(b=>{const r=b.getBoundingClientRect();return r.width<30||r.height<30;})
      .slice(0,5).map(b=>({text:(b.textContent||'').trim().slice(0,35),size:Math.round(b.getBoundingClientRect().width)+'×'+Math.round(b.getBoundingClientRect().height)}));
  });
  if(btns.length)issue('minor','Zones tactiles petites',JSON.stringify(btns));
}
async function picture(page,label){
  if(shot>=16)return;
  try{await page.screenshot({path:path.join(output,'captures',String(++shot).padStart(2,'0')+'-'+view+'-'+label.replace(/[^a-z0-9-]/gi,'-')+'.png'),
    fullPage:false,animations:'disabled',timeout:3500});}
  catch(e){issue('advice','Capture écran indisponible',e.message);}
}
async function openHome(page){await page.goto('/index.html',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.hub-home').waitFor({timeout:12000});}
async function firstRoute(page,route){
  await openHome(page);
  const a=page.locator('[data-nav="'+route+'"]').first();
  assert(await a.count(),'Route '+route+' absente du menu principal');
  await a.click({timeout:5000});
  assert(await status(page),'Ecran non rendu après ouverture de '+route);
  await snapshot(page,route);
}
async function explore(page){
  step='exploration autonome des menus';
  await openHome(page);
  const candidates=await page.locator('.hub-home [data-nav]').evaluateAll(xs=>
    [...new Set(xs.map(x=>x.getAttribute('data-nav')).filter(Boolean))]);
  const risks=new Set(['builder','update','delete','restart','reset']);
  // Priority follows the way an untrained person learns: guidance, cards, decks, duel, extras.
  const order=['academy','tutorial','rules','cards','collection','decks','setup','campaign','puzzles','analyse',
    'journal','career','lab'];
  const planned=candidates.filter(x=>!risks.has(x)).sort((a,b)=>{
    const i=order.indexOf(a),j=order.indexOf(b);
    return (i<0?99:i)-(j<0?99:j);
  }).slice(0,maxRoutes);
  report.metrics[view+'RoutesDiscoverable']=candidates;
  for(const route of planned)await task('Découverte : '+route,async()=>{
    await firstRoute(page,route);
    const first=report.pages[report.pages.length-1];
    assert(first.htmlLength>30,'Ecran vide : '+route);
  });
}
async function guide(page){
  await task('Tutoriel règles depuis une première partie',async()=>{
    await firstRoute(page,'setup');
    const guide=page.locator('[data-nav="tutorial"]').first();
    assert(await guide.count(),'Guide débutant introuvable dans l’écran de préparation');
    await guide.click();
    for(let i=0;i<7;i++){
      assert(await page.locator('#tNext').count(),'Bouton Suivant/Jouer absent à l’étape '+(i+1));
      await page.locator('#tNext').click();
    }
    assert(await page.locator('#start').count(),'Fin du guide ne retourne pas à la préparation du duel');
  });
}
async function catalogue(page){
  await task('Catalogue : 150 cartes, filtre et fiche',async()=>{
    await firstRoute(page,'cards');
    const cards=page.locator('[data-card]');
    const n=await cards.count();
    assert(n===150,'Catalogue : '+n+' cartes visibles au lieu de 150');
    await cards.first().click();
    assert(await page.locator('.scrim .sheet').count(),'La fiche de carte ne s’ouvre pas');
    const close=page.locator('[data-close]').first();
    if(await close.count())await close.click();else await page.keyboard.press('Escape');
    await picture(page,'catalogue');
  });
}
async function collection(page){
  await task('Collection vierge : ajouter puis conserver une quantité',async()=>{
    await firstRoute(page,'collection');
    assert(await page.locator('.collection-entry').count()===150,'Liste de collection incomplète');
    const plus=page.locator('[data-own-plus="mantis-blades"]');
    assert(await plus.count(),'La carte Mantis Blades est introuvable');
    await plus.click();
    assert((await page.locator('[data-own-count="mantis-blades"]').innerText()).trim()==='1','Bouton + sans effet');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-nav="collection"]').first().click();
    assert((await page.locator('[data-own-count="mantis-blades"]').innerText()).trim()==='1','Perte de la collection après rechargement');
    await picture(page,'collection');
  });
  await task('Importation TXT et refus des cartes inexistantes',async()=>{
    await firstRoute(page,'collection');
    await page.locator('#collectionImport').click();
    assert(await page.locator('#ownedPaste').count(),'Zone d’import manquante');
    await page.locator('#ownedPaste').fill('2x mantis-blades\n1x corpo-security\n1x carte-inventee');
    await page.locator('#ownedApply').click();
    const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('septgigs.collectionV1')||'{}'));
    assert(result['mantis-blades']===3,'Import TXT : quantité Mantis incorrecte');
    assert(result['corpo-security']===1,'Import TXT : carte reconnue non ajoutée');
    assert(!result['carte-inventee'],'Import TXT : fausse carte enregistrée');
  });
  await task('Importation CSV standard quantité,nom',async()=>{
    await firstRoute(page,'collection');
    await page.locator('#collectionImport').click();
    const input=page.locator('#ownedFile');
    assert(await input.count(),'Import fichier CSV non disponible');
    await input.setInputFiles({name:'ma-collection.csv',mimeType:'text/csv',
      buffer:Buffer.from('quantite,carte\n2,mantis-blades\n1,corpo-security\n','utf8')});
    await page.waitForFunction(()=>document.querySelector('#ownedPaste')?.value.includes('2,mantis-blades'),
      {timeout:3500}).catch(()=>{});
    await page.locator('#ownedApply').click();
    const collection=await page.evaluate(()=>JSON.parse(localStorage.getItem('septgigs.collectionV1')||'{}'));
    assert(collection['mantis-blades']===5 && collection['corpo-security']===2,
      'Le format CSV quantité,nom annoncé comme accepté n’est pas correctement importé');
  });
}
async function synergy(page){
  await task('Synergies : tutoriel, étapes, inspection des cartes',async()=>{
    await firstRoute(page,'collection');
    assert(await page.locator('#synergyTutorial').count(),'Tutoriel des synergies absent');
    await page.locator('#synergyTutorial').click();
    assert(await page.locator('#lessonNext').count(),'Parcours tutoriel inaccessible');
    await page.locator('#lessonNext').click();
    assert((await page.locator('.lesson-step').innerText()).includes('Étape 2'),'Le tutoriel ne progresse pas');
    const card=page.locator('[data-tcard]').first();await card.click();
    assert(await page.locator('.scrim .sheet').count(),'Impossible de lire l’effet depuis un tutoriel');
    const close=page.locator('.scrim [data-close]').first();if(await close.count())await close.click();
    await page.locator('#lessonNextPair').click();
    assert((await page.locator('.lesson-pager').innerText()).includes('Tutoriel 2'),'Le tutoriel suivant est bloqué');
    await picture(page,'synergies');
  });
}
async function deck(page){
  await task('Premier deck : brouillon récupérable après retour',async()=>{
    await firstRoute(page,'decks');
    await page.locator('#newDeck').click();
    assert(await page.locator('#deckName').count(),'Constructeur inaccessible');
    await page.locator('#deckName').fill('Mon premier deck');
    await page.locator('#deckName').blur();
    // The game intentionally discards name-only empty drafts. A real beginner adds a first card.
    await page.locator('[data-plus]').first().click();
    await page.locator('[data-nav="decks"]').first().click();
    const draft=page.locator('[data-draft-resume]').first();
    assert(await draft.count(),'Brouillon non retrouvé après retour dans les decks');
    await draft.click();
    assert((await page.locator('#deckName').inputValue()).includes('Mon premier deck'),'Nom du brouillon perdu');
    await picture(page,'deck');
  });
}
async function duel(page){
  await task('Première partie : préparation, mulligan et plateau',async()=>{
    await firstRoute(page,'setup');
    await page.locator('#lvl').selectOption('facile');
    await page.locator('#enemyDeck').selectOption('embracing-power');
    await page.locator('#start').click();
    const choice=page.getByRole('dialog').getByRole('button',{name:'Oui',exact:true});
    await choice.waitFor({state:'visible',timeout:2500}).catch(()=>{});
    if(await choice.isVisible().catch(()=>false))await choice.click();
    await page.locator('[data-m="0"]').waitFor({timeout:16000});
    await page.locator('[data-m="0"]').click();
    await page.locator('.board .hand').waitFor({timeout:16000});
    await picture(page,'duel');
  });
}
async function viewport(browser,vp){
  view=vp.name;step='ouverture';
  const ctx=await browser.newContext({viewport:{width:vp.width,height:vp.height},
    isMobile:vp.mobile,hasTouch:vp.mobile,locale:'fr-FR',reducedMotion:'reduce',baseURL});
  const page=await ctx.newPage();
  activePage=page;
  watch(page);
  await task('Lancement sur un profil vierge',async()=>{
    await openHome(page);await snapshot(page,'accueil');await picture(page,'accueil');
  });
  await explore(page);
  await guide(page);
  await catalogue(page);
  await collection(page);
  await synergy(page);
  await deck(page);
  await duel(page);
  await ctx.close();
  activePage=null;
}
function markdown(){
  const severe=report.issues.filter(x=>levels[x.severity]<=1).length;
  const passed=report.scenarios.filter(x=>x.result==='PASS').length;
  const failed=report.scenarios.filter(x=>x.result==='FAIL').length;
  const lines=['# NOVICE — Audit utilisateur débutant de '+report.target,'',
    '**Date UTC :** '+report.generatedAt+'  ',
    '**Portée :** navigateur Chromium mobile et ordinateur, profil vierge sur chaque format.  ',
    '**Bilan :** '+passed+' scénarios réussis, '+failed+' en échec, '+severe+' signalements bloquants/majeurs.',
    '',
    '## Problèmes constatés',''];
  if(!report.issues.length)lines.push('Aucun problème détecté dans les parcours couverts (cela ne prouve pas une absence totale de bugs).');
  for(const x of report.issues.sort((a,b)=>levels[a.severity]-levels[b.severity])){
    lines.push('### ['+x.severity.toUpperCase()+'] '+x.title,'','- Écran : '+x.viewport,'- Parcours : '+x.scenario,
      '- Observation : '+x.details.replace(/[\r\n]+/g,' ').slice(0,500),'');
  }
  lines.push('## Parcours exécutés','',
    '| Plateforme | Scénario | Résultat |','|---|---|---|');
  for(const x of report.scenarios)lines.push('| '+x.viewport+' | '+x.name.replace(/\|/g,'/')+' | '+x.result+' |');
  lines.push('','## Limites du diagnostic','');
  for(const x of report.limits)lines.push('- '+x);
  lines.push('','**Preuves :** novice-agent-report.json et captures PNG du workflow GitHub Actions.');
  return lines.join('\n')+'\n';
}
async function main(){
  fs.mkdirSync(path.join(output,'captures'),{recursive:true});
  if(!fs.existsSync(path.join(root,'index.html')))throw Error('Le paquet OTA index.html est introuvable dans '+root);
  server=http.createServer((req,res)=>{
    let rel;try{rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(e){res.writeHead(400);return res.end();}
    const target=path.resolve(root,'.'+rel);
    if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){
      res.writeHead(404);return res.end();
    }
    res.writeHead(200,{'Content-Type':target.endsWith('.html')?'text/html; charset=utf-8':
      target.endsWith('.js')?'text/javascript; charset=utf-8':'application/octet-stream'});
    fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});
  baseURL='http://127.0.0.1:'+server.address().port;
  for(const vp of [{name:'mobile390',width:390,height:844,mobile:true},
                   {name:'desktop1280',width:1280,height:800,mobile:false}]){
    try{await viewport(browser,vp);}catch(e){issue('critical','Agent interrompu',e.stack||e);}
  }
}
(async()=>{
  try{await main();}catch(e){issue('critical','Initialisation impossible',e.stack||e);}
  finally{
    try{await browser?.close();}catch(_){}
    try{server?.close();}catch(_){}
    fs.mkdirSync(output,{recursive:true});
    report.metrics.total=report.scenarios.length;
    report.metrics.failed=report.scenarios.filter(x=>x.result==='FAIL').length;
    report.metrics.critical=report.issues.filter(x=>x.severity==='critical').length;
    report.metrics.major=report.issues.filter(x=>x.severity==='major').length;
    fs.writeFileSync(path.join(output,'novice-agent-report.json'),JSON.stringify(report,null,2)+'\n');
    fs.writeFileSync(path.join(output,'novice-agent-report.md'),markdown());
    process.stdout.write(JSON.stringify({agent:report.agent,target:report.target,metrics:report.metrics,
      issues:report.issues.map(x=>({severity:x.severity,title:x.title,viewport:x.viewport,scenario:x.scenario,details:x.details.slice(0,360)}))},null,2)+'\n');
    // Fail CI only on critical incidents. Ordinary UX findings are published as evidence for triage.
    if(report.metrics.critical>0)process.exitCode=1;
  }
})();
