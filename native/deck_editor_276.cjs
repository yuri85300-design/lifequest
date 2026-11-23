'use strict';
/* PRIME 2.7.6 — deck editor: the player can add any card they want, with or without Legends.
 * Reproduces the reported case (new deck, no Legend chosen) on the PUBLISHED runtime, mobile viewport.
 * Usage: node deck_editor_276.cjs <built-dir> [index.html]
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
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('[data-nav="decks"]').first().click();
  await page.locator('#newDeck').click();
  await page.waitForSelector('#tabPool');

  // 1. the reported case: no Legend chosen -> the catalogue must list every non-Legend card
  const nCards=await page.evaluate(()=>Object.values(CARDS).filter(c=>c.type!=='Legend').length);
  ok('catalogueListsAllCardsWithoutLegends',(await page.locator('[data-plus]').count())===nCards,{shown:await page.locator('[data-plus]').count(),expected:nCards});
  ok('plusButtonsEnabled',(await page.locator('[data-plus][disabled]').count())===0);
  ok('noWrongInstruction',!/Sélectionnez des Légendes/.test(await page.locator('body').innerText()));
  // 2. add cards one by one, up to 3 copies, then the 4th is refused
  const first=await page.locator('[data-plus]').first().getAttribute('data-plus');
  for(let i=0;i<3;i++)await page.locator(`.sim-pool-entry [data-plus="${first}"]`).first().click();
  ok('threeCopiesAdded',/Mon deck \(3\)/.test(await page.locator('#tabDeck').innerText()));
  ok('fourthCopyDisabled',await page.locator(`.sim-pool-entry [data-plus="${first}"]`).first().isDisabled());
  // add a second and third distinct card through the card sheet
  const second=await page.locator('[data-plus]').nth(5).getAttribute('data-plus');
  await page.locator(`.sim-pool-entry [data-plus="${second}"]`).first().click();
  ok('differentCardAdded',/Mon deck \(4\)/.test(await page.locator('#tabDeck').innerText()));
  // remove one
  await page.locator(`.sim-pool-entry [data-minus="${second}"]`).first().click();
  ok('removeWorks',/Mon deck \(3\)/.test(await page.locator('#tabDeck').innerText()));
  // 3. fill the deck to 40 with a spread of cards (any colour, no Legend yet)
  await page.evaluate(()=>{const ids=Object.values(CARDS).filter(c=>c.type!=='Legend').map(c=>c.id);let k=0;
    document.querySelectorAll('.sim-pool-entry [data-plus]').forEach(()=>{});window.__ids=ids;});
  const plus=page.locator('.sim-pool-entry [data-plus]');
  const total=await plus.count();
  for(let i=0;i<total&&!/Mon deck \(40\)/.test(await page.locator('#tabDeck').innerText());i++){
    for(let c=0;c<3&&!/Mon deck \(40\)/.test(await page.locator('#tabDeck').innerText());c++){
      const b=page.locator('.sim-pool-entry [data-plus]').nth(i);if(await b.isDisabled())break;await b.click();}
  }
  ok('deckReaches40WithoutLegends',/Mon deck \(40\)/.test(await page.locator('#tabDeck').innerText()));
  // 4. choose three Legends: the cards must STAY, those the Legends cannot field are flagged
  const legends=await page.evaluate(()=>{const L=Object.values(CARDS).filter(c=>c.type==='Legend'&&c.color==='Yellow');
    const pick=[],names=new Set();for(const l of L){if(!names.has(l.name)){names.add(l.name);pick.push(l.id);}if(pick.length===3)break;}return pick;});
  for(let slot=0;slot<3;slot++){
    await page.locator(`[data-slot="${slot}"]`).click();
    await page.locator(`.sim-legpicker [data-l="${legends[slot]}"]`).click();
  }
  const afterLegends=await page.evaluate(()=>({deck:document.querySelector('#tabDeck').textContent,locked:document.querySelectorAll('.sim-deck-line.bad').length,status:document.querySelector('.sim-build-status').textContent}));
  out.afterLegends=afterLegends;
  ok('cardsKeptAfterChoosingLegends',/Mon deck \(40\)/.test(afterLegends.deck));
  ok('unplayableCardsFlagged',afterLegends.locked>0&&/non jouable/.test(afterLegends.status));
  await page.locator('#tabDeck').click();
  ok('flaggedInDeckList',(await page.locator('.sim-deck-line.bad').count())>0);
  ok('saveBlockedWhileIllegal',await page.locator('#saveDeck').isDisabled());
  // 5. the catalogue still shows every card, locked ones marked; the switch hides them
  await page.locator('#tabPool').click();
  ok('lockedMarkedInCatalogue',(await page.locator('.sim-pool-entry.locked').count())>0&&(await page.locator('.sim-pool-entry').count())===nCards);
  await page.locator('#bonly').check();
  ok('onlyPlayableSwitch',(await page.locator('.sim-pool-entry.locked').count())===0&&(await page.locator('.sim-pool-entry').count())<nCards);
  await page.locator('#bonly').uncheck();
  // 6. remove every locked card -> the deck becomes fillable and legal, then save
  await page.locator('#tabDeck').click();
  for(let guard=0;guard<60&&(await page.locator('.sim-deck-line.bad').count())>0;guard++){
    await page.locator('.sim-deck-line.bad [data-minus]').first().click();await page.locator('#tabDeck').click();}
  ok('allLockedRemoved',(await page.locator('.sim-deck-line.bad').count())===0);
  await page.locator('#fillDeck').click();
  const legal=await page.evaluate(()=>!document.querySelector('#saveDeck').disabled);
  ok('fillMakesDeckLegal',legal);
  // 7. the other order still works (Legends first, then cards)
  await page.locator('#saveDeck').click();
  const saved=await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('septgigs.decks')||'{}');const k=Object.keys(d)[0];return k&&validateDeck(d[k]).length===0;});
  ok('savedDeckIsLegal',saved);
  // 8. legends first, then a card with an insufficient RAM -> toast + flag, no silent loss
  await page.locator('[data-nav="decks"]').first().click().catch(()=>{});
  await page.locator('#newDeck').click();
  for(let slot=0;slot<3;slot++){await page.locator(`[data-slot="${slot}"]`).click();await page.locator(`.sim-legpicker [data-l="${legends[slot]}"]`).click();}
  const red=await page.evaluate(()=>Object.values(CARDS).find(c=>c.type!=='Legend'&&c.color==='Red').id);
  await page.locator(`.sim-pool-entry [data-plus="${red}"]`).first().click();
  ok('addingUnplayableAfterLegendsIsAllowedAndFlagged',/Mon deck \(1\)/.test(await page.locator('#tabDeck').innerText())&&(await page.locator('.sim-pool-entry.locked').count())>0);
  out.pageErrors=errors;ok('noPageErrors',errors.length===0);
  await browser.close();server.close();
  out.status=Object.values(out.checks).every(v=>v==='PASS')?'PASS':'FAIL';
  console.log(JSON.stringify(out,null,1));
  if(out.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(2);});
