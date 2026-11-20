'use strict';
/* Execute the actual 2.6.0 40-match benchmark against the actual game engine.
   No mocked results or artificial wins are allowed. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const file=process.env.PRIME_HTML||'native/prime_v260_runtime.html';
const source=fs.readFileSync(file,'utf8');
const es=source.indexOf('/* Android: exporting JSON via the system document picker');
const ee=source.indexOf('// ============================================================================\n//  SEPT GIGS — interface',es);
const start=source.indexOf('async function benchmarkDeck(){');
const end=source.indexOf('const TUTORIAL_STEPS=',start);
assert(es>=0&&ee>es&&start>ee&&end>start);
const output={textContent:'',isConnected:true};
const button={disabled:false,isConnected:true};
const app={querySelector:s=>s==='#deckBenchmarkResult'?output:s==='#deckBenchmark'?button:null};
const c={console,Date,Math,performance,structuredClone,setTimeout,clearTimeout,app};
c.window=c;c.globalThis=c;vm.createContext(c);
vm.runInContext(source.slice(es,ee)+
'\nconst PRESETS=presetDecks(); const S={myDeck:"the-heist"};'+
'\nconst allDecks=()=>PRESETS;const sleep=async()=>{};'+
source.slice(start,end)+
'\nglobalThis.BENCH={benchmarkDeck,PRESETS,validateDeck};',c);
(async()=>{
 const {benchmarkDeck,PRESETS,validateDeck}=c.BENCH;
 assert.equal(validateDeck(PRESETS['the-heist']).length,0);
 const before=JSON.stringify(PRESETS['the-heist']);
 const t=performance.now();
 await benchmarkDeck();
 const elapsed=Math.round(performance.now()-t);
 assert.equal(button.disabled,false);
 assert.equal(JSON.stringify(PRESETS['the-heist']),before,'Benchmark must never mutate real deck');
 const result=output.textContent;
 assert(result.includes('40 essais'));
 const m=/40 essais · (\d+) conclus · (\d+) V \/ (\d+) D \/ (\d+) N · (\d+) incomplètes · (\d+) erreurs/.exec(result);
 assert(m,'Summary must explicitly separate wins, losses, draws, incompletes and errors: '+result);
 const [finished,wins,losses,draws,incomplete,errors]=m.slice(1).map(Number);
 assert.equal(finished,wins+losses+draws);
 assert.equal(finished+incomplete+errors,40);
 assert(result.includes('Politique rapide')&&result.includes('Pas de classement certifié'));
 assert(result.includes('Arasaka')&&result.includes('Maelstrom')&&result.includes('Voodoo'));
 console.log(JSON.stringify({version:'2.6.0',realBenchmark:'PASS',attempts:40,
  finished,wins,losses,draws,incomplete,errors,duration_ms:elapsed,
  memoryNotMutated:'PASS',noFakeWins:'PASS',resultsNotOfficial:'PASS'},null,2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
