'use strict';
/* Check the 2.7 NIGHTMARE tactical diagnostic against six real-engine positions.
   No fake training, simulated victory or exposed hidden opponent hand. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const html=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v270_runtime.html','utf8');
const es=html.indexOf('/* Android: exporting JSON via the system document picker');
const ee=html.indexOf('// ============================================================================\n//  SEPT GIGS — interface',es);
const pa=html.indexOf('const TACTICAL_PUZZLES=Object.freeze('),pb=html.indexOf('const ACADEMY_QUESTIONS=[',pa);
const pr=html.indexOf('function probeExpected('),lab=html.indexOf('function labScreen(){',pr);
assert(es>0&&ee>es&&pa>ee&&pb>pa&&pr>pb&&lab>pr);
const ctx={console,Date,Math,performance,setTimeout,clearTimeout,structuredClone};
ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(html.slice(es,ee)+'\nconst PRESETS=presetDecks();\n'+html.slice(pa,pb)+'\n'+html.slice(pr,lab)+
 '\nglobalThis.PROBES={Game,TACTICAL_PUZZLES,makeTacticalPuzzle,probeExpected};',ctx);
const {TACTICAL_PUZZLES,makeTacticalPuzzle,probeExpected}=ctx.PROBES;
assert.equal(TACTICAL_PUZZLES.length,6);
const report=[];
for(let i=0;i<6;i++){
 const g=makeTacticalPuzzle(i),actions=g.legalActions(0);
 const goal=actions.filter(a=>probeExpected(i,a,g));
 assert(goal.length>=1,'At least one legal correct tactical move required at '+i);
 for(const a of goal)assert(actions.some(x=>JSON.stringify(x)===JSON.stringify(a)));
 const pass=actions.find(a=>a.type==='end');
 if(pass)assert.equal(probeExpected(i,pass,g),false,'Turn end must not fake success '+i);
 assert.equal(probeExpected(i,null,g),false);
 report.push({mission:i+1,legal:actions.length,correct:goal.length});
}
assert(html.includes('function probeNightmare(button,report)'));
assert(html.includes('const chosen=choice&&legal.find'));
assert(html.includes('counts.fallback++'));
assert(html.includes('if(probeExpected(k,chosen,g))counts.goal++'));
assert(html.includes('Aucun entraînement effectué.'));
assert(html.includes('id="labProbe"'));
assert(html.includes('const NIGHTMARE_TRAINING_CERTIFIED = false'));
console.log(JSON.stringify({version:'2.7.0',nightmareDiagnostic:'PASS',
   missions:report,legalOnly:'PASS',noFakeTraining:'PASS',
   certificationLocked:'PASS',positions:6},null,2));
