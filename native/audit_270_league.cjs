'use strict';
/* Independent bounded self-play across diverse archetypes and seat reversals.
   This uses FastPolicy, not the un-certified NIGHTMARE champion. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const html=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v270_runtime.html','utf8');
const start=html.indexOf('/* Android: exporting JSON via the system document picker');
const end=html.indexOf('// ============================================================================\n//  SEPT GIGS — interface',start);
assert(start>=0&&end>start);
const ctx={console,Math,Date,performance,structuredClone,setTimeout,clearTimeout};
ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(html.slice(start,end)+'\nglobalThis.L={Game,FastPolicy,presetDecks,validateDeck};',ctx);
const {Game,FastPolicy,presetDecks,validateDeck}=ctx.L;
const deckMap=presetDecks();
const names=['the-heist','embracing-power','maelstrom','voodoo','nomades','rockers','netrunners'];
for(const name of names){assert(deckMap[name],'Missing archetype '+name);assert.equal(validateDeck(deckMap[name]).length,0);}
const report={version:'2.7.0',name:'FAST_POLICY_VARIETY_NOT_NIGHTMARE',
  games:0,completed:0,incomplete:0,wins:[0,0],draws:0,errors:0,illegal:0,
  mirrors:0,archetypes:names.length,byPair:{}};
(async()=>{
 for(let i=0;i<60;i++){
  const seed=107231+Math.floor(i/2)*9217,flip=i%2;
  const a=names[Math.floor(i/2)%names.length],b=names[(Math.floor(i/2)*3+2)%names.length];
  const players=flip?[deckMap[b],deckMap[a]]:[deckMap[a],deckMap[b]];
  const g=Game.create(players,[{...FastPolicy},{...FastPolicy}],{seed,hooks:{sim:true}});
  const original=g.doAction.bind(g);
  g.doAction=async function(seat,action){
    const legal=g.legalActions(seat);
    if(!legal.some(x=>JSON.stringify(x)===JSON.stringify(action))){
      report.illegal++;throw new Error('Illegal simulated move '+JSON.stringify(action));
    }
    return original(seat,action);
  };
  report.games++;
  if(a===b)report.mirrors++;
  const key=[a,b].sort().join(' / ');
  report.byPair[key]??={completed:0,incomplete:0};
  try{
    const result=await g.run(90);
    if(result.status==='incomplete'){report.incomplete++;report.byPair[key].incomplete++;continue;}
    if(result.winner===-1)report.draws++;
    else if(result.winner===0||result.winner===1)report.wins[result.winner]++;
    else throw new Error('Invalid winner marker');
    report.completed++;report.byPair[key].completed++;
  }catch(error){report.errors++;if(report.errors<=3)console.error(error.stack||error);}
 }
 assert.equal(report.games,60);
 assert.equal(report.completed+report.incomplete+report.errors,60);
 assert.equal(report.wins[0]+report.wins[1]+report.draws,report.completed);
 assert.equal(report.illegal,0);
 report.outcome='TECHNICAL_PASS_NOT_NIGHTMARE_CERTIFICATION';
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
