'use strict';
/**
 * Browser-level integration test for unlocked sandbox mode.
 * Uses a deterministic stub instead of spending 300 real simulations; actual
 * competitive benchmark and publisher semantic certification remain separate.
 */
const {chromium}=require('playwright');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto(pathToFileURL(path.join(__dirname,process.env.PRIME_RUNTIME||'prime_v276_runtime.html')).href,
    {waitUntil:'domcontentloaded',timeout:30000});
  // Manual mode: with "Évolution automatique" off, a validated challenger is only offered.
  await page.evaluate(()=>localStorage.setItem('septgigs.nightmareAutoEvolve','false'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-nav="lab"]').first().click({timeout:15000});
  const button=page.locator('#labTrain');
  await button.waitFor({timeout:10000});
  assert.equal(await button.isEnabled(),true,'Experimental training button must be enabled');
  await page.evaluate(()=>{
   if(!window.DeckPlanAI||typeof window.DeckPlanAI.trainLeague!=='function')
    throw new Error('DeckPlanAI.trainLeague unavailable');
   window.__sandboxSmokeOriginalChampion=JSON.stringify(window.AIPlanChampion());
   window.DeckPlanAI.trainLeague=async(decks,matches,weights,plans,progress)=>{
    if(matches!==300)throw new Error('300-match budget changed');
    if(decks.length<2)throw new Error('Expected multiple opponent decks');
    progress({phase:'training',done:300,leader:0});
    progress({phase:'validation',done:300,validation:80});
    return {cancelled:false,matches:300,validationMatches:80,wins:44,losses:29,draws:7,
      upgraded:true,plans:{...plans,__experimentalSmoke:true}};
   };
  });
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#labStatus')?.textContent?.includes('vous pouvez l’adopter'),{timeout:15000});
  const state=await page.evaluate(()=>({
   status:document.querySelector('#labStatus')?.textContent,
   original:window.__sandboxSmokeOriginalChampion,
   current:JSON.stringify(window.AIPlanChampion()),
   buttonEnabled:!document.querySelector('#labTrain')?.disabled
  }));
  assert.equal(state.current,state.original,'Training alone must never replace the champion');
  assert.equal(await page.locator('#labAdopt').isVisible(),true,'A validated challenger must be offered for adoption');
  assert.equal(state.buttonEnabled,true,'Train should re-enable after completed run');
  assert.match(state.status,/300 auto-duels · validation/);
  assert.equal(errs.length,0,'Browser page errors: '+errs.join('; '));
  console.log('PASS: NIGHTMARE training button, bounded trainer, champion unchanged until the player adopts');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
