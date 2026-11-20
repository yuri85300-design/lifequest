'use strict';
/** Individual source-bound edge cases for The Relic: Experimental Biochip.
 * English publishing SHA is checked by official_clause_witnesses.cjs.
 * These checks are partial, NOT total semantic certification.
 */
module.exports=async function verifyRelic(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api;
 const ds=presetDecks(),out=[];
 const G=()=>{const g=Game.create([ds['the-heist'],ds['embracing-power']],[FastPolicy,FastPolicy],{seed:44591,hooks:{sim:true}});g.s.active=0;g.s.phase='main';return g;};
 async function t(name,fn){try{await fn();out.push({id:'the-relic-experimental-biochip',clause:name,status:'PASS',reference:'https://cyberpunktcg.com/cards/the-relic-experimental-biochip'})}
 catch(e){out.push({id:'the-relic-experimental-biochip',clause:name,status:'FAIL',error:String(e.stack||e).slice(0,900),reference:'https://cyberpunktcg.com/cards/the-relic-experimental-biochip'})}}
 await t('relic-contract-host-defeat-plays-unit-for-free-and-bottoms-host',async()=>{
   const g=G(),p=g.P(0),host=g.newInst('animals-wrecker',0),gear=g.newInst('the-relic-experimental-biochip',0),revived=g.newInst('corpo-security',0);
   p.field=[host];host.gear=[gear];p.trash=[revived];p.eddies=[];
   const before=p.eddies.length;
   await g.withTimingWindow(()=>g.defeat(host,{effect:true}));
   assert.equal(g.onField(revived),true);
   assert.equal(p.deck.includes(host),true);
   assert.equal(p.trash.includes(host),false);
   assert.equal(p.trash.includes(gear),true);
   assert.equal(p.eddies.length,before,'revival should cost zero');
 });
 await t('relic-contract-no-eligible-unit-still-bottoms-host',async()=>{
   const g=G(),p=g.P(0),host=g.newInst('animals-wrecker',0),gear=g.newInst('the-relic-experimental-biochip',0);
   p.field=[host];host.gear=[gear];p.trash=[];
   await g.withTimingWindow(()=>g.defeat(host,{effect:true}));
   assert.equal(p.deck.includes(host),true);
   assert.equal(p.trash.includes(gear),true);
   assert.equal(p.field.includes(host),false);
 });
 await t('relic-contract-only-units-resurrected-no-other-card-types',async()=>{
   const g=G(),p=g.P(0),host=g.newInst('animals-wrecker',0),gear=g.newInst('the-relic-experimental-biochip',0);
   const program=g.newInst('all-is-lost',0),otherGear=g.newInst('mantis-blades',0),revived=g.newInst('corpo-security',0);
   p.field=[host];host.gear=[gear];p.trash=[program,otherGear,revived];
   await g.withTimingWindow(()=>g.defeat(host,{effect:true}));
   assert.equal(g.onField(revived),true);
   assert.equal(p.trash.includes(program),true);
   assert.equal(p.trash.includes(otherGear),true);
   assert.equal(p.deck.includes(host),true);
 });
 return {count:out.length,passed:out.filter(x=>x.status==='PASS').length,failed:out.filter(x=>x.status==='FAIL').length,tests:out};
};
