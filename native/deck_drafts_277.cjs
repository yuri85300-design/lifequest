'use strict';
/* PRIME 2.7.7 — deck drafts: an unfinished deck can be saved, found again and finished.
 * Runs on the PUBLISHED runtime in Chromium, mobile viewport.
 * Usage: node deck_drafts_277.cjs <built-dir> [index.html]
 */
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const dir=process.argv[2],file=process.argv[3]||'index.html';
const server=http.createServer((q,r)=>{const f=path.join(dir,decodeURIComponent(q.url.split('?')[0]));
  if(!f.startsWith(dir)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});fs.createReadStream(f).pipe(r);});
const out={checks:{}};const ok=(k,v,info)=>{out.checks[k]=v?'PASS':'FAIL';if(info!==undefined)out[k]=info;};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/${file}`;
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('dialog',d=>d.accept());
  const lib=async()=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-nav="decks"]').first().click();await page.waitForSelector('#newDeck');};
  const drafts=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('septgigs.deckDraftsV1')||'{"drafts":{}}').drafts);
  const addCards=async n=>{for(let i=0;i<n;i++)await page.locator('.sim-pool-entry [data-plus]').nth(i).click();};
  const tabCount=async()=>Number(((await page.locator('#tabDeck').innerText()).match(/\((\d+)\)/)||[])[1]);

  await lib();
  ok('noDraftSectionInitially',(await page.locator('.sim-drafts').count())===0);
  // 1. an editor session with no change leaves no draft
  await page.locator('#newDeck').click();await page.waitForSelector('#tabPool');
  await page.locator('[data-nav="decks"]').first().click();await page.waitForTimeout(900);
  ok('untouchedEditorCreatesNoDraft',Object.keys(await drafts()).length===0);

  // 2. explicit draft: 5 cards, no Legend
  await page.locator('#newDeck').click();await page.waitForSelector('#tabPool');
  await page.locator('#deckName').fill('Mon projet agressif');
  await addCards(5);
  ok('explicitDraftButtonPresent',await page.locator('#saveDraft').isVisible());
  ok('saveStillBlockedWhenIllegal',await page.locator('#saveDeck').isDisabled());
  await page.locator('#saveDraft').click();
  await page.waitForSelector('.sim-drafts');
  const d1=await drafts();const id1=Object.keys(d1)[0];
  ok('draftStored',Object.keys(d1).length===1&&d1[id1].main.length===5&&d1[id1].name==='Mon projet agressif');
  ok('draftShownInLibrary',/Mon projet agressif/.test(await page.locator('.sim-drafts').innerText())&&/5\/40 cartes/.test(await page.locator('.sim-drafts').innerText()));
  ok('draftNotAPlayableDeck',!/Mon projet agressif/.test(await page.locator('.sim-deck-cards').innerText()));
  // draft never offered as a deck to play with
  await page.locator('[data-nav="setup"]').first().click();
  ok('draftNotInSetupLists',!/Mon projet agressif/.test(await page.locator('#mineDeck').innerText()+await page.locator('#enemyDeck').innerText()));

  // 3. survives a reload, resume keeps cards and name
  await lib();
  ok('draftSurvivesReload',(await page.locator('[data-draft-resume]').count())===1);
  await page.locator('[data-draft-resume]').first().click();await page.waitForSelector('#tabPool');
  ok('resumeRestoresCardsAndName',(await tabCount())===5&&(await page.locator('#deckName').inputValue())==='Mon projet agressif');
  // 4. finish the deck: legends + fill, then a normal legal save removes the draft
  const legends=await page.evaluate(()=>{const L=Object.values(CARDS).filter(c=>c.type==='Legend'&&c.color==='Yellow');const pick=[],names=new Set();
    for(const l of L){if(!names.has(l.name)){names.add(l.name);pick.push(l.id);}if(pick.length===3)break;}return pick;});
  for(let slot=0;slot<3;slot++){await page.locator(`[data-slot="${slot}"]`).click();await page.locator(`.sim-legpicker [data-l="${legends[slot]}"]`).click();}
  // drop what the Legends cannot field, then complete
  for(let g=0;g<60&&(await page.locator('.sim-deck-line.bad').count())===0&&false;g++){}
  await page.locator('#tabDeck').click();
  for(let g=0;g<60&&(await page.locator('.sim-deck-line.bad').count())>0;g++){await page.locator('.sim-deck-line.bad [data-minus]').first().click();await page.locator('#tabDeck').click();}
  await page.locator('#fillDeck').click();
  ok('deckBecomesLegal',!(await page.locator('#saveDeck').isDisabled()));
  await page.locator('#saveDeck').click();await page.waitForSelector('#newDeck');
  ok('legalSaveRemovesDraft',Object.keys(await drafts()).length===0&&(await page.locator('.sim-drafts').count())===0);
  ok('finishedDeckIsInLibrary',/Mon projet agressif/.test(await page.locator('.sim-deck-cards').innerText()));
  await page.waitForTimeout(1200);
  ok('noGhostDraftAfterSave',Object.keys(await drafts()).length===0);

  // 5. autosave: leave the editor by the back button without any save
  await page.locator('#newDeck').click();await page.waitForSelector('#tabPool');
  await addCards(2);
  await page.locator('[data-nav="decks"]').first().click();
  // NO waiting: the library must already list the draft the moment it appears
  const shownNow=await page.locator('[data-draft-resume]').count();
  const d2=await drafts();
  ok('autosaveOnLeaving',Object.keys(d2).length===1&&Object.values(d2)[0].main.length===2);
  ok('libraryListsDraftImmediately',shownNow===1,{shownNow,stored:Object.keys(d2).length});
  // 6. flush when the app is hidden before the debounce fires
  await page.locator('#newDeck').click();await page.waitForSelector('#tabPool');
  await addCards(1);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  ok('flushOnPageHide',Object.keys(await drafts()).length===2);

  // 7. editing an existing saved deck: leaving unsaved keeps it untouched and makes a draft that overwrites it on save
  await page.locator('[data-nav="decks"]').first().click();
  ok('libraryMatchesStorageAfterPageHide',(await page.locator('[data-draft-resume]').count())===Object.keys(await drafts()).length);
  const before=await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('septgigs.decks')||'{}');const k=Object.keys(d)[0];return {k,n:d[k].main.length,name:d[k].name};});
  await page.locator(`[data-edit="${before.k}"]`).click();await page.waitForSelector('#tabPool');
  await page.locator('#tabDeck').click();await page.locator('.sim-deck-line [data-minus]').first().click();
  await page.locator('[data-nav="decks"]').first().click();
  ok('libraryShowsEditDraftImmediately',(await page.locator('[data-draft-resume]').count())===Object.keys(await drafts()).length);
  const after=await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('septgigs.decks')||'{}');const k=Object.keys(d)[0];return {n:d[k].main.length};});
  ok('savedDeckUntouchedByUnsavedEdit',after.n===before.n);
  const d3=await drafts();ok('editMadeADraftOfThatDeck',Object.values(d3).some(x=>x.fromKey===before.k));

  // 8. delete a draft
  const n0=await page.locator('[data-draft-del]').count();
  const idDel=await page.locator('[data-draft-del]').first().getAttribute('data-draft-del');
  await page.locator('[data-draft-del]').first().click();await page.waitForTimeout(300);
  const keysAfter=Object.keys(await drafts());
  ok('deleteDraft',(await page.locator('[data-draft-del]').count())===n0-1&&!keysAfter.includes(idDel),{n0,after:await page.locator('[data-draft-del]').count(),idDel,keysAfter});

  // 9. hostile / corrupt storage is cleaned, never crashes, capped at 30
  await page.evaluate(()=>{const mk=i=>({name:'Brouillon '+i,legends:[],main:[Object.keys(CARDS).find(k=>CARDS[k].type==='Unit')],updated:new Date(2026,0,1,0,i).toISOString()});
    const dr={};for(let i=0;i<40;i++)dr['dr-t'+i]=mk(i);
    dr['bad id']={name:'x',legends:[],main:[Object.keys(CARDS)[0]]};dr['dr-unknown']={name:'y',legends:['nope'],main:['nope']};dr['dr-null']=null;dr['dr-big']={name:'z'.repeat(500),legends:Object.keys(CARDS).filter(k=>CARDS[k].type==='Legend'),main:Array(200).fill(Object.keys(CARDS).find(k=>CARDS[k].type==='Unit'))};
    localStorage.setItem('septgigs.deckDraftsV1',JSON.stringify({drafts:dr}));});
  await lib();
  const shown=await page.locator('[data-draft-resume]').count();
  ok('corruptStorageCleanedAndCapped',shown===30,shown);
  await page.evaluate(()=>localStorage.setItem('septgigs.deckDraftsV1','{not json'));
  await lib();
  ok('garbageStorageIgnored',(await page.locator('.sim-drafts').count())===0&&(await page.locator('#newDeck').isVisible()));

  // 10. screenshot of the editor footer and the library for a visual check
  await page.evaluate(()=>localStorage.removeItem('septgigs.deckDraftsV1'));
  await lib();await page.locator('#newDeck').click();await page.waitForSelector('#tabPool');await addCards(3);
  await page.screenshot({path:path.join(dir,'editor.png')});
  await page.locator('#saveDraft').click();await page.waitForSelector('.sim-drafts');
  await page.screenshot({path:path.join(dir,'library.png')});

  out.pageErrors=errors;ok('noPageErrors',errors.length===0);
  await browser.close();server.close();
  out.status=Object.values(out.checks).every(v=>v==='PASS')?'PASS':'FAIL';
  console.log(JSON.stringify(out,null,1));
  if(out.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(2);});
