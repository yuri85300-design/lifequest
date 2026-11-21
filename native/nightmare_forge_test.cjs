'use strict';
/* NIGHTMARE deck forge — engine-level checks on the PUBLISHED engine.
 * - 2000 guided mutations are all legal decks (40 cards, max 3, RAM, 3 distinct Legends)
 * - evolution is deterministic per seed and cancellable
 * - a counter-deck found against a target really beats it on INDEPENDENT deals
 * - an accepted improvement never comes without a statistically significant gain
 */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const ctx={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
const enginePath=process.env.PRIME_ENGINE_PATH||path.join(__dirname,'engine.js');
vm.runInContext(fs.readFileSync(enginePath,'utf8')+'\nglobalThis.__A={F:NightmareForge,presetDecks,validateDeck,DeckPlanAI};',ctx);
const {F,presetDecks,validateDeck,DeckPlanAI}=ctx.__A;
const P=presetDecks(),pol=DeckPlanAI.makePolicy(null,DeckPlanAI.INITIAL);
const out={checks:{}};const ok=(k,v,info)=>{out.checks[k]=v?'PASS':'FAIL';if(info!==undefined)out[k]=info;};
(async()=>{
  // 1. mutation legality
  const rand=F.rng32(7);let d=P['the-heist'],illegal=0,changed=0;
  for(let i=0;i<2000;i++){const m=F.mutate(d,rand,1.4);if(validateDeck(m).length)illegal++;if(m!==d)changed++;d=m;}
  ok('mutationsAlwaysLegal',illegal===0,{illegal,changed});
  ok('mutationsExplore',changed>1500);
  // 2. determinism + cancel
  const a=await F.evolve({start:P['rockers'],opponents:[P['voodoo']],seed:5,generations:2,children:2,games:2,valGames:4,policy:pol});
  const b=await F.evolve({start:P['rockers'],opponents:[P['voodoo']],seed:5,generations:2,children:2,games:2,valGames:4,policy:pol});
  ok('deterministicPerSeed',JSON.stringify(a.deck)===JSON.stringify(b.deck)&&a.validation.baseline.pts===b.validation.baseline.pts);
  let calls=0;const c=await F.evolve({start:P['rockers'],opponents:[P['voodoo']],seed:5,generations:5,policy:pol,cancel:()=>++calls>10});
  ok('cancellable',c.cancelled===true);
  // 3. counter-deck against a known target, confirmed on independent deals
  const target=P['voodoo'],cands=Object.entries(P).filter(([k])=>k!=='voodoo').map(([,x])=>x);
  const t0=Date.now();
  const r=await F.counter({target,candidates:cands,start:cands[0],seed:4,generations:6});
  const ind=await F.score(r.deck,[target],60,424242,pol);
  out.counter={kind:r.kind,improved:r.improved,independentRate:+ind.rate.toFixed(3),ms:Date.now()-t0};
  ok('counterFound',r.improved===true&&!validateDeck(r.deck).length);
  ok('counterBeatsTargetIndependently',ind.rate>=0.6);
  // 4. acceptance requires significance
  const e=await F.improve({start:P['embracing-power'],pool:Object.values(P),seed:9,generations:4});
  ok('acceptanceIsSignificant',!e.improved||(e.z>=2&&e.validation.candidate.rate>=e.validation.baseline.rate+0.05),{improved:e.improved,z:e.z});
  out.status=Object.values(out.checks).every(v=>v==='PASS')?'PASS':'FAIL';
  console.log(JSON.stringify(out,null,1));
  if(out.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(2);});
