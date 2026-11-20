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
const risk=c=>{
 const m=c.officialClauseSignals||{};
 return c.implementationBehaviours.length*2+(m.conditionalMentions||0)*3+
   (m.choiceMentions||0)*2+(m.optionalMentions||0)*2+
   (m.triggerMentions||0)*2+(m.timingMentions||0);
};
const unfinished=entries.filter(c=>!c.independentlyPassingOracles).sort((a,b)=>risk(b)-risk(a)||a.id.localeCompare(b.id));
const reviewed=entries.filter(c=>c.independentlyPassingOracles);
const gapMd=[
 '# Certification sémantique : lacunes individualisées',
 '',
 '> Ce document est un plan de vérification automatique, pas une certification.',
 '',
 '- Fiches officielles anglaises reconnues : '+result.cardsWithOfficialEnglishText+'/'+result.cardCount,
 '- Cycles de vie vérifiés : '+result.cardsWithLifecycleWitness+'/'+result.cardCount,
 '- Cartes ayant au moins un oracle d’effet indépendant : '+result.cardsWithIndependentBehaviourOracles+'/'+result.cardCount,
 '- Clauses comportementales testées : '+result.testedBehaviourBranches,
 '- Cartes certifiées intégralement : 0',
 '',
 '## Cartes sans oracle sémantique individuel, par priorité',
 '',
 '| Carte | Gestionnaires moteur | Indices de complexité | Preuve à ajouter |',
 '| --- | --- | ---: | --- |',
 ...unfinished.map(c=>'| '+c.id+' | '+(c.implementationBehaviours.join(', ')||'mécanique imprimée de base')+' | '+risk(c)+' | Oracle positif et négatif conforme au texte anglais |'),
 '',
 '## Cartes avec des oracles partiels',
 '',
 '| Carte | Oracles réussis | Clauses restantes |',
 '| --- | ---: | --- |',
 ...reviewed.map(c=>'| '+c.id+' | '+c.independentlyPassingOracles+' | À décomposer et prouver clause par clause |'),
 '',
 'La priorité n’est qu’un classement de complexité. Elle ne prouve ni les effets ni leur conformité.'
].join('\\n');
fs.writeFileSync(path.join(artifactDir,'semantic-gaps.md'),gapMd);

console.log(JSON.stringify({cardCount:result.cardCount,cardsWithOfficialEnglishText:result.cardsWithOfficialEnglishText,cardsWithLifecycleWitness:result.cardsWithLifecycleWitness,cardsWithIndependentBehaviourOracles:result.cardsWithIndependentBehaviourOracles,testedBehaviourBranches:result.testedBehaviourBranches,cardsFullySemanticallyCertified:0,semanticCertification:'BLOCKED'},null,2));
if(entries.length!==150||(oracleData.tests||[]).some(x=>x.status!=='PASS'))process.exitCode=1;
if(process.argv.includes('--require-certification')){console.error('FAIL CLOSED: 150-card semantic certification evidence incomplete.');process.exitCode=2;}
