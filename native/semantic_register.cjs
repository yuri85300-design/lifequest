'use strict';
/**
 * Evidence ledger for each of the 150 playable cards.
 * No automatic proof of translation/keyword parity can certify semantics.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const dir=__dirname,artifactDir=path.join(dir,'..','audit-results');
const core={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
core.window=core;core.globalThis=core;vm.createContext(core);
vm.runInContext(fs.readFileSync(path.join(dir,'engine.js'),'utf8'),core);
const cards=Object.values(core.CARDS),ORACLE_FILE=path.join(artifactDir,'semantic-oracles.json');
const lifecycleFile=path.join(artifactDir,'card-lifecycle.json');
const lifecycleData=fs.existsSync(lifecycleFile)?JSON.parse(fs.readFileSync(lifecycleFile,'utf8')):{perCard:[]};
const lifecycleById=new Map((lifecycleData.perCard||[]).map(c=>[c.id,c]));
const officialFile=path.join(artifactDir,'official-cards.json');
const oracleData=fs.existsSync(ORACLE_FILE)?JSON.parse(fs.readFileSync(ORACLE_FILE,'utf8')):{tests:[]};
const officialData=fs.existsSync(officialFile)?JSON.parse(fs.readFileSync(officialFile,'utf8')):{cardEvidence:[]};
const officialById=new Map(officialData.cardEvidence.map(c=>[c.id,c]));
const oracleById=new Map();
for(const t of oracleData.tests||[]){if(!oracleById.has(t.id))oracleById.set(t.id,[]);oracleById.get(t.id).push({clause:t.clause,result:t.status,officialUrl:t.reference});}
const hash=x=>crypto.createHash('sha256').update(String(x||'').normalize('NFC')).digest('hex');
const metadata=new Set(['id','name','nameEn','sub','subEn','color','type','cost','ram','power','tags','kw','txt','sell','aiValue','frUnofficial']);
const impl=c=>Object.keys(c).filter(k=>!metadata.has(k)).sort();
const splitClauses=txt=>(txt||'').split(/\n+|\s*;\s*|\s*\/\/\s*|\s*•\s*/).map(s=>s.trim()).filter(Boolean);
const entries=cards.map(c=>{
 const evidence=officialById.get(c.id),oracles=oracleById.get(c.id)||[];
 const behaviours=impl(c),localClauses=splitClauses(c.txt);
 return {
  id:c.id,englishName:[c.nameEn||c.name,c.subEn].filter(Boolean).join(': '),
  officialUrl:evidence?.officialUrl||'https://cyberpunktcg.com/cards/'+c.id,
  officialEnglishFingerprint:evidence?.officialTextSha256||null,
  officialMetadata:evidence?.status||'NOT_LOADED',
  officialClauseSignals:evidence?.officialClauseSignals||null,
  officialTriggerEvidence:evidence?.triggerEvidence||[],
  frenchTextFingerprint:hash(c.txt),
  implementationBehaviours:behaviours,
  localClauseCountEstimate:localClauses.length,
  negativeAndPositiveBranchProofs:oracles,
  independentlyPassingOracles:oracles.filter(o=>o.result==='PASS').length,
  lifecycle: lifecycleById.get(c.id)?{status:lifecycleById.get(c.id).entry,destination:lifecycleById.get(c.id).destination,assertions:lifecycleById.get(c.id).oracles}:null,
  requiredIndependentClauseReview:'PENDING',
  semanticCertified:false
 };
});
const result={
 date:new Date().toISOString(),name:'7 Gigs PRIME - independent semantic evidence ledger',
 officialSource:officialData.source||'https://cyberpunktcg.com/cards',
 cardCount:entries.length,expectedCardCount:150,
 cardsWithOfficialEnglishText:entries.filter(x=>x.officialEnglishFingerprint).length,
 officialTriggerContractCount:entries.reduce((n,x)=>n+x.officialTriggerEvidence.length,0),
 officialTriggerOmissions:entries.reduce((n,x)=>n+x.officialTriggerEvidence.filter(y=>!y.implemented).length,0),
 cardsWithLifecycleWitness:entries.filter(x=>x.lifecycle?.status==='PASS').length,
 cardsWithIndependentBehaviourOracles:entries.filter(x=>x.independentlyPassingOracles).length,
 testedBehaviourBranches:entries.reduce((n,c)=>n+c.independentlyPassingOracles,0),
 cardsFullySemanticallyCertified:0,
 overallSemanticCertification:'BLOCKED',
 blockingRequirements:[
   'Every individual official English clause must have a separately reviewed behaviour oracle',
   'Each conditional effect must cover its true and false branches',
   'Choices, optional effects, timing windows, hidden information and cross-player interactions require independent tests',
   'The official comprehensive rules and errata must be applied to every overlapping effect',
   'Only a verified 150-card evidence register can authorize changing NIGHTMARE_TRAINING_CERTIFIED'
 ],
 cards:entries
};
fs.mkdirSync(artifactDir,{recursive:true});
fs.writeFileSync(path.join(artifactDir,'semantic-register.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({cardCount:result.cardCount,cardsWithOfficialEnglishText:result.cardsWithOfficialEnglishText,cardsWithLifecycleWitness:result.cardsWithLifecycleWitness,cardsWithIndependentBehaviourOracles:result.cardsWithIndependentBehaviourOracles,testedBehaviourBranches:result.testedBehaviourBranches,cardsFullySemanticallyCertified:0,semanticCertification:'BLOCKED'},null,2));
if(entries.length!==150||(oracleData.tests||[]).some(x=>x.status!=='PASS'))process.exitCode=1;
if(process.argv.includes('--require-certification')){console.error('FAIL CLOSED: 150-card semantic certification evidence incomplete.');process.exitCode=2;}

// Validation branch consolidated evidence review.