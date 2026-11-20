'use strict';
/* Reproducible independent semantic oracle runner. TECHNICAL PASS != certification. */
// Re-check all 150 independently against today's main branch in CI.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'engine.js'),'utf8');
const sandbox={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
sandbox.window=sandbox;sandbox.globalThis=sandbox;vm.createContext(sandbox);
vm.runInContext(source+'\nglobalThis.__semanticApi={Game,GameOver,CARDS,presetDecks,FastPolicy};',sandbox,{filename:'engine.js'});
(async()=>{
 const primary=await require('./semantic_oracles.cjs')(sandbox.__semanticApi,assert);
 const secondary=await require('./semantic_oracles_extra.cjs')(sandbox.__semanticApi,assert);
 const reactive=await require('./semantic_oracles_interactions.cjs')(sandbox.__semanticApi,assert);
 const programs=await require('./semantic_oracles_programs.cjs')(sandbox.__semanticApi,assert);
 const advanced=await require('./semantic_oracles_advanced.cjs')(sandbox.__semanticApi,assert);
 const advanced2=await require('./semantic_oracles_advanced2.cjs')(sandbox.__semanticApi,assert);
 const complexOne=await require('./semantic_oracles_complex_one.cjs')(sandbox.__semanticApi,assert);
 const lastA=await require('./semantic_oracles_last_a.cjs')(sandbox.__semanticApi,assert);
 const lastB=await require('./semantic_oracles_last_b.cjs')(sandbox.__semanticApi,assert);
 const suites=[primary,secondary,reactive,programs,advanced,advanced2,complexOne,lastA,lastB];
 const result={count:suites.reduce((a,x)=>a+x.count,0),passed:suites.reduce((a,x)=>a+x.passed,0),failed:suites.reduce((a,x)=>a+x.failed,0),tests:suites.flatMap(x=>x.tests)};
 const cardIds=Object.keys(sandbox.__semanticApi.CARDS);
 const evidenced=new Set(result.tests.filter(x=>x.status==='PASS').map(x=>x.id));
 const missingCardOracles=cardIds.filter(id=>!evidenced.has(id));
 const output=path.join(__dirname,'..','audit-results');fs.mkdirSync(output,{recursive:true});
 const payload={date:new Date().toISOString(),source:'current engine.js',certification:'NOT_CERTIFIED',
  independentOracles:result.count,passed:result.passed,failed:result.failed,
  cardsWithAtLeastOneOracle:cardIds.length-missingCardOracles.length,
  cardCount:cardIds.length,missingCardOracles,tests:result.tests};
 fs.writeFileSync(path.join(output,'semantic-oracles.json'),JSON.stringify(payload,null,2));
 console.log('SEMANTIC ORACLES',JSON.stringify({passed:result.passed,failed:result.failed,count:result.count}));
 for(const t of result.tests)console.log(t.status,t.id,t.clause,t.error||'');
 if(result.failed||missingCardOracles.length||cardIds.length!==150){console.error('Individual oracle coverage gap:',missingCardOracles);process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});
