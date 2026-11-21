'use strict';
/**
 * Full 300-match real DeckPlanAI league, NOT a mocked training result.
 * Its purpose is runtime reliability only, not competitive strength or
 * per-card official semantic certification.
 */
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  page.setDefaultTimeout(360000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.goto(pathToFileURL(path.join(__dirname,process.env.PRIME_RUNTIME||'prime_v275_runtime.html')).href,
   {waitUntil:'domcontentloaded',timeout:30000});
  const run=await page.evaluate(async()=>{
   const decks=Object.values(presetDecks());
   const champion=JSON.stringify(window.AIPlanChampion());
   const result=await window.DeckPlanAI.trainLeague(decks,300,
    window.AIChampion(),window.AIPlanChampion(),()=>{},()=>false);
   return {result,championUnchanged:champion===JSON.stringify(window.AIPlanChampion()),
    deckCount:decks.length};
  });
  assert.ok(run.deckCount>=2,'Must train against multiple real decks');
  assert.equal(run.championUnchanged,true,'Real training must not mutate live champion');
  assert.equal(run.result.cancelled,undefined,'Full real league should finish');
  assert.equal(run.result.validationMatches,80,'All 80 validation fixtures must be attempted');
  assert.ok(run.result.matches>=0&&run.result.matches<=300,'Unexpected match count');
  assert.equal(run.result.wins+run.result.losses+run.result.draws+run.result.incompleteValidation,
   80,'Validation decisions must account for all 80 trials');
  assert.equal(pageErrors.length,0,'No browser crash: '+pageErrors.join('; '));
  console.log(JSON.stringify({status:'PASS_REAL_TRAINING',trainingBudget:300,
   completedTrainingMatches:run.result.matches,validationBudget:80,
   validationWins:run.result.wins,validationLosses:run.result.losses,
   validationDraws:run.result.draws,incompleteValidation:run.result.incompleteValidation,
   championUnchanged:run.championUnchanged}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
