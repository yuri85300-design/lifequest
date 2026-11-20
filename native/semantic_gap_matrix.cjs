'use strict';
/**
 * Independent review queue built from official-card evidence and the semantic
 * ledger. This is a coverage PLAN, not a semantic certification.
 * Run after official_card_audit.cjs, semantic_oracle_runner.cjs,
 * card_lifecycle_oracles.cjs and semantic_register.cjs.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=process.env.SEMANTIC_MATRIX_ROOT
 ? path.resolve(process.env.SEMANTIC_MATRIX_ROOT)
 : path.join(__dirname,'..','audit-results');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const official=read('official-cards.json');
const ledger=read('semantic-register.json');
const cards=official.cardEvidence||[];
const byId=new Map((ledger.cards||[]).map(c=>[c.id,c]));
const obligations=fragment=>{
 const required=['effect-positive','effect-negative-or-unavailable'];
 if(fragment.conditional)required.push('condition-true','condition-false','threshold-boundary');
 if(fragment.optional)required.push('option-accepted','option-declined');
 if(fragment.choice)required.push('each-choice','invalid-or-missing-target','choice-order');
 if(fragment.timing)required.push('trigger-window','expiry-or-next-turn','simultaneous-triggers');
 if((fragment.triggerTokens||[]).length)required.push('trigger-preconditions','trigger-once-versus-repeat');
 return [...new Set(required)];
};
const interactions=['same-timing-window','replacement-and-prevention','opposing-player-effects',
 'hidden-information-and-visibility','zone-transfer-and-owner','gig-steal-and-protection',
 'resource-minimum-and-cost-modifiers','empty-deck-or-empty-zone'];
const rows=[];
let total=0,linked=0;
assert.equal(cards.length,150,'Official catalogue must include all 150 runtime cards');
assert.equal(byId.size,150,'Semantic ledger must include exactly 150 distinct cards');
for(const card of cards){
 const entry=byId.get(card.id);
 assert.ok(entry,'Missing card in semantic ledger: '+card.id);
 assert.equal(entry.officialEnglishFingerprint,card.officialTextSha256,'Stale official source: '+card.id);
 assert.ok(card.officialTextSha256,'Missing publisher text: '+card.id);
 const evidence=entry.independentOfficialSegmentWitnesses||[];
 const segments=card.candidateOfficialSegments||[];
 const seen=new Set();
 for(const segment of segments){
  const key=card.id+':'+segment.index;
  assert.ok(!seen.has(segment.index),'Duplicate official segment: '+key);
  seen.add(segment.index);
  const witness=evidence.find(w=>w.index===segment.index&&w.reviewState==='LINKED_WITH_PARTIAL_WITNESSES');
  assert.ok(!witness||witness.officialSegmentSha256===segment.textSha256,'Official hash mismatch: '+key);
  const declared=obligations(segment);
  // Witness branch labels describe existing tests; they do not prove all of
  // the review obligations below, so none is auto-marked complete.
  const risk=(segment.conditional?5:0)+(segment.choice?5:0)+(segment.optional?4:0)+
    (segment.timing?4:0)+Math.min(3,(segment.triggerTokens||[]).length*2)+
    Math.min(5,Math.floor((segment.wordCount||0)/15));
  rows.push({id:key,cardId:card.id,index:segment.index,officialTextSha256:card.officialTextSha256,
   segmentSha256:segment.textSha256,wordCount:segment.wordCount,
   risk,linkedToPassingOracle:!!witness,
   linkedOracleNames:witness?.oracleClauses||[],reportedTestedBranches:witness?.testedBranches||[],
   branchReviewRequired:declared,branchReviewCertified:[],
   interactionReviewRequired:interactions,interactionReviewCertified:[],
   reviewStatus:witness?'PARTIAL_WITNESSES':'NO_LINKED_ORACLE',semanticCertified:false});
  total++;if(witness)linked++;
 }
 for(const witness of evidence)assert.ok(seen.has(witness.index),'Orphan witness: '+card.id+':'+witness.index);
}
assert.equal(total,ledger.officialCandidateSegments,'Ledger candidate segment total mismatch');
assert.equal(linked,ledger.independentlyClauseMappedSegments,'Ledger linked segment count mismatch');
const pending=rows.filter(x=>!x.linkedToPassingOracle).sort((a,b)=>b.risk-a.risk||a.id.localeCompare(b.id));
const output={generatedAt:new Date().toISOString(),officialSource:official.source,officialGeneratedAt:official.generatedAt,
 officialCards:cards.length,candidateSegments:total,partiallyWitnessedSegments:linked,
 unlinkedSegments:pending.length,fullyCertifiedSegments:0,
 note:'These are candidate fragments, not reviewed atomic clauses. No branch or interaction is automatically certified.',
 pending,partiallyWitnessed:rows.filter(x=>x.linkedToPassingOracle)};
fs.writeFileSync(path.join(root,'semantic-gap-matrix.json'),JSON.stringify(output,null,2));
const md=['# Revue des segments anglais restant sans rapprochement','',
 '> Fragments candidats uniquement. Les noms de tests ne valent pas certification des branches ou interactions.','',
 '- Fiches officielles accessibles : '+cards.length+'/150',
 '- Fragments candidats : '+total,
 '- Fragments avec preuves partielles : '+linked,
 '- **Fragments sans oracle rapproché : '+pending.length+'**',
 '- Segments intégralement certifiés : 0','',
 '## File de revue priorisée','',
 '| Carte / segment | Risque indicatif | Branches à démontrer | Interactions à démontrer |',
 '| --- | ---: | --- | --- |',
 ...pending.map(r=>'| '+r.id+' | '+r.risk+' | '+r.branchReviewRequired.join(', ')+' | '+r.interactionReviewRequired.join(', ')+' |'),
 '', '## Protocole de validation','',
 '1. Relever la phrase anglaise directement auprès de l’éditeur, vérifier son empreinte et la découper manuellement en clauses atomiques.',
 '2. Pour chaque clause, développer des tests indépendants positifs, négatifs, de choix et de temporisation selon ses obligations réelles.',
 '3. Exécuter les interactions applicables avec des cartes adverses et les errata officiels, en conservant les cas et résultats.',
 '4. Lier exclusivement les tests PASS à la bonne empreinte; révoquer le lien dès qu’un texte officiel change.',
 '5. Ne certifier aucune carte avant couverture exhaustive de ses clauses, branches, effets combinés et versions officielles.',
 ''].join('\n');
fs.writeFileSync(path.join(root,'semantic-gap-matrix.md'),md);
console.log(JSON.stringify({cards:cards.length,total,linked,pending:pending.length,fullCertification:0}));
