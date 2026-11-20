'use strict';
/**
 * Targeted semantic mutation score: if a known wrong implementation survives
 * the independent tests, the proof is too weak. This is a quality check, NOT
 * a measure of full rule completeness.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'engine.js'),'utf8');
const specs=[
 ['nocturne-discount-sign',"if (mode === 'solo' && this.P(p).tf.soloDiscount > 0) { c -= this.P(p).tf.soloDiscount; reduced = true; }","if (mode === 'solo' && this.P(p).tf.soloDiscount > 0) { c += this.P(p).tf.soloDiscount; reduced = true; }",'nocturne_official_oracles.cjs','nocturne-op55-n1'],
 ['nocturne-discount-consumed','if (solo && p.tf.soloDiscount > 0) p.tf.soloDiscount = 0;','if (solo && p.tf.soloDiscount > 0) p.tf.soloDiscount = 2;','nocturne_official_oracles.cjs','nocturne-op55-n1'],
 ['nocturne-fixed-pay','if (d.fixedPay) {','if (false && d.fixedPay) {','nocturne_official_oracles.cjs','nocturne-op55-n1'],
 ['royce-power-three-threshold','const lim = g.moreSC(i) ? 3 : 2;','const lim = 2;','official_independent_oracles.cjs','royce-don-t-call-me-simon'],
 ['shattered-memories-bonus','if (friendlyGigValue(g, i, total)) await g.draw(i, 2);','if (false) await g.draw(i, 2);','official_independent_oracles.cjs','shattered-memories'],
 ['kerry-conditional-draw','if (gigs8(g, i)) await g.draw(i, 2);','if (false) await g.draw(i, 2);','official_independent_oracles.cjs','kerry-eurodyne-the-last-rockerboy'],
 ['gorilla-arms-once','gr.flags.usedGorilla = true;','gr.flags.usedGorilla = false;','semantic_oracles.cjs','gorilla-arms'],
 ['viktor-first-cyberware','g.P(i).tf.cyberPlayed = true;','g.P(i).tf.cyberPlayed = false;','semantic_oracles.cjs','viktor-vektor-drop-your-illusions'],
 ['all-is-lost-trash-three',"await trashThenTake(g, i, 3, d => d.type === 'Unit'","await trashThenTake(g, i, 2, d => d.type === 'Unit'",'official_independent_oracles.cjs','all-is-lost']
];
function engineApi(script) {
 const box={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
 box.window=box;box.globalThis=box;vm.createContext(box);
 vm.runInContext(script+'\nglobalThis.__mutantApi={Game,GameOver,CARDS,presetDecks,FastPolicy};',box,{filename:'mutated-engine.js',timeout:10000});
 return box.__mutantApi;
}
(async()=>{
 const cases=[];
 for(const [name,oldCode,newCode,filename,card] of specs){
  const occurrences=source.split(oldCode).length-1;
  if(occurrences!==1)throw new Error(name+' expected one mutation target; found '+occurrences);
  const api=engineApi(source.replace(oldCode,newCode));
  const oracle=require('./'+filename);
  const r=await oracle(api,assert);
  const broken=r.tests.filter(x=>x.id===card&&x.status==='FAIL');
  cases.push({mutation:name,card,detection:broken.length?'KILLED':'SURVIVED',failingIndependentOracles:broken.map(x=>x.clause)});
 }
 const killed=cases.filter(x=>x.detection==='KILLED').length;
 const payload={timestamp:new Date().toISOString(),mutants:cases.length,killed,survived:cases.length-killed,certification:'NOT_CERTIFIED',cases};
 const folder=path.join(__dirname,'..','audit-results');fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,'semantic-mutation.json'),JSON.stringify(payload,null,2));
 console.log('SEMANTIC MUTATION SCORE',JSON.stringify({mutants:cases.length,killed,survived:cases.length-killed}));
 for(const c of cases)console.log(c.detection,c.mutation,c.card,c.failingIndependentOracles.join(';'));
 if(killed!==cases.length)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
