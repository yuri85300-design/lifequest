'use strict';
/* Fail-closed contract tests of the semantic matrix using synthetic data only. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cp=require('node:child_process'),assert=require('node:assert/strict');
const runner=path.join(__dirname,'semantic_gap_matrix.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'semantic-matrix-'));
const hash=n=>String(n).padStart(64,'0');
const cards=Array.from({length:150},(_,i)=>({
 id:'card-'+i,officialTextSha256:hash(i+1),
 candidateOfficialSegments:Array.from({length:i<130?2:1},(_,j)=>({
  index:j+1,textSha256:hash(2000+i*2+j),
  conditional:i%4===0,choice:i%5===0,optional:i%6===0,
  timing:i%3===0,wordCount:15,triggerTokens:i%7===0?['Play']:[]
 }))
})); // 130*2+20=280
const ledger={cards:cards.map(c=>({
 id:c.id,officialEnglishFingerprint:c.officialTextSha256,
 independentOfficialSegmentWitnesses:c.id.startsWith('card-') && Number(c.id.slice(5))<20
 ?c.candidateOfficialSegments.map(s=>({
 index:s.index,officialSegmentSha256:s.textSha256,
 oracleClauses:['synthetic-pass'],testedBranches:['synthetic-branch'],
 reviewState:'LINKED_WITH_PARTIAL_WITNESSES'
 })):[]
})),officialCandidateSegments:280,independentlyClauseMappedSegments:40};
const official={source:'synthetic-contract-data',generatedAt:'fixture',cardEvidence:cards};
const write=()=>{fs.writeFileSync(path.join(root,'official-cards.json'),JSON.stringify(official));
 fs.writeFileSync(path.join(root,'semantic-register.json'),JSON.stringify(ledger))};
const run=()=>cp.spawnSync(process.execPath,[runner],{
 env:{...process.env,SEMANTIC_MATRIX_ROOT:root},encoding:'utf8'});
try{
 write();
 let r=run();assert.equal(r.status,0,'Baseline 280/40 matrix must run: '+r.stderr);
 let output=JSON.parse(fs.readFileSync(path.join(root,'semantic-gap-matrix.json'),'utf8'));
 assert.equal(output.candidateSegments,280);assert.equal(output.partiallyWitnessedSegments,40);
 assert.equal(output.unlinkedSegments,240);assert.equal(output.fullyCertifiedSegments,0);
 assert.equal(output.cardsWithAllCandidateSegmentsPartiallyWitnessed,20);
 assert.equal(output.cardsForExhaustiveBranchReview.length,20);
 assert.ok(output.cardsForExhaustiveBranchReview.every(x=>x.readyForFullReview&&!x.semanticCertified&&x.unlinkedSegments===0));
 assert.ok(output.pending.every(x=>x.reviewStatus==='NO_LINKED_ORACLE'&&!x.semanticCertified));
 assert.ok(output.pending.every(x=>x.branchReviewCertified.length===0&&x.interactionReviewCertified.length===0));
 const originalSourceHash=cards[0].officialTextSha256;
 official.cardEvidence[0].officialTextSha256=hash(99999);write();r=run();
 assert.notEqual(r.status,0,'Stale official hash must fail');
 official.cardEvidence[0].officialTextSha256=originalSourceHash;
 ledger.cards[0].independentOfficialSegmentWitnesses[0].officialSegmentSha256=hash(88888);
 write();r=run();assert.notEqual(r.status,0,'Segment witness hash mismatch must fail');
 ledger.cards[0].independentOfficialSegmentWitnesses[0].officialSegmentSha256=cards[0].candidateOfficialSegments[0].textSha256;
 ledger.cards[0].independentOfficialSegmentWitnesses[0].index=999;
 write();r=run();assert.notEqual(r.status,0,'Orphan witness must fail');
 ledger.cards[0].independentOfficialSegmentWitnesses[0].index=1;
 ledger.officialCandidateSegments=279;write();r=run();
 assert.notEqual(r.status,0,'Candidate total mismatch must fail');
 console.log('PASS 5 semantic matrix contract scenarios: baseline 280/40/240; stale source; stale segment; orphan; invalid count');
}finally{fs.rmSync(root,{recursive:true,force:true})}
