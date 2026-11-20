'use strict';
/* Reproducible independent semantic oracle runner. TECHNICAL PASS != certification. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'engine.js'),'utf8');
const sandbox={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
sandbox.window=sandbox;sandbox.globalThis=sandbox;vm.createContext(sandbox);
vm.runInContext(source+'\nglobalThis.__semanticApi={Game,GameOver,CARDS,presetDecks,FastPolicy};',sandbox,{filename:'engine.js'});
(async()=>{
 const primary=await require('./semantic_oracles.cjs')(sandbox.__semanticApi,assert);
 const secondary=await require('./semantic_oracles_extra.cjs')(sandbox.__semanticApi,assert);
 const reactive=await require('./semantic_oracles_interactions.cjs')(sandbox.__semanticApi,assert);
 const result={count:primary.count+secondary.count+reactive.count,passed:primary.passed+secondary.passed+reactive.passed,failed:primary.failed+secondary.failed+reactive.failed,tests:[...primary.tests,...secondary.tests,...reactive.tests]};
 const output=path.join(__dirname,'..','audit-results');fs.mkdirSync(output,{recursive:true});
 const payload={date:new Date().toISOString(),source:'current engine.js',certification:'NOT_CERTIFIED',
  independentOracles:result.count,passed:result.passed,failed:result.failed,tests:result.tests};
 fs.writeFileSync(path.join(output,'semantic-oracles.json'),JSON.stringify(payload,null,2));
 console.log('SEMANTIC ORACLES',JSON.stringify({passed:result.passed,failed:result.failed,count:result.count}));
 for(const t of result.tests)console.log(t.status,t.id,t.clause,t.error||'');
 if(result.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
