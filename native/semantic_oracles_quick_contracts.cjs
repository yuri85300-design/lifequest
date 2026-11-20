'use strict';
/* Independently authored edge-case oracles grounded on the current published
 * English text of Cyberpsychosis, Take Control and Reboot Optics.
 * Source fingerprints and clause mappings reside in official_clause_witnesses.
 */
module.exports=async function verifyQuickContracts(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api;
 const ds=presetDecks(),checks=[];
 const G=(seed=4991)=>{const g=Game.create([ds['the-heist'],ds['embracing-power']],[FastPolicy,FastPolicy],{seed,hooks:{sim:true}});g.s.active=0;g.s.phase='main';return g};
 const u=(g,id,p=0)=>{const c=g.newInst(id,p);g.P(p).field.push(c);return c};
 const die=(uid,value=2,sides=6)=>({uid,value,sides});
 async function t(id,clause,fn){try{await fn();checks.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id})}
 catch(e){checks.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,900),reference:'https://cyberpunktcg.com/cards/'+id})}}
 await t('cyberpsychosis','quick-contract-no-equipped-unit-cannot-play',()=>{
   const g=G();g.P(0).field=[];g.P(1).field=[];assert.equal(CARDS.cyberpsychosis.canPlay(g,0),false);
   u(g,'animals-wrecker').gear.push(g.newInst('mantis-blades',0));
   assert.equal(CARDS.cyberpsychosis.canPlay(g,0),true);
 });
 await t('cyberpsychosis','quick-contract-two-gears-add-six-power',async()=>{
   const g=G(),host=u(g,'animals-wrecker');
   host.gear.push(g.newInst('mantis-blades',0),g.newInst('kiroshi-optics',0));
   const start=g.eff(host);
   await CARDS.cyberpsychosis.onPlay(g,g.newInst('cyberpsychosis',0),0);
   assert.equal(g.eff(host),start+6);assert.equal(g.hasFlag(host,'psycho'),true);
 });
 await t('cyberpsychosis','quick-contract-fight-defeat-is-delayed-until-turn-end',async()=>{
   const g=G(),host=u(g,'animals-wrecker'),target=u(g,'corpo-security',1);
   host.gear.push(g.newInst('mantis-blades',0));
   await CARDS.cyberpsychosis.onPlay(g,g.newInst('cyberpsychosis',0),0);
   await g.fight({attacker:host.uid,p:0,target:{kind:'unit',uid:target.uid}});
   assert.equal(g.onField(host),true);assert.equal(host.flags.psychoDoom,true);
   await g.endTurn();assert.equal(g.onField(host),false);
 });
 await t('cyberpsychosis','quick-contract-stealing-defeats-at-turn-end',async()=>{
   const g=G(),host=u(g,'animals-wrecker'),target=die(900001);
   host.gear.push(g.newInst('mantis-blades',0));g.P(1).gigs=[target];
   await CARDS.cyberpsychosis.onPlay(g,g.newInst('cyberpsychosis',0),0);
   assert.equal(await g.stealGig(0,target,host),true);
   assert.equal(host.flags.psychoDoom,true);assert.equal(g.onField(host),true);
   await g.endTurn();assert.equal(g.onField(host),false);
 });
 await t('cyberpsychosis','quick-contract-no-steal-no-fight-no-defeat',async()=>{
   const g=G(),host=u(g,'animals-wrecker');
   host.gear.push(g.newInst('mantis-blades',0));
   await CARDS.cyberpsychosis.onPlay(g,g.newInst('cyberpsychosis',0),0);
   await g.endTurn();assert.equal(g.onField(host),true);assert.equal(g.hasFlag(host,'psycho'),false);
 });
 await t('take-control','quick-contract-no-rival-unit-prevents-cast',()=>{
   const g=G();g.P(1).field=[];assert.equal(CARDS['take-control'].canPlay(g,0),false);
   u(g,'animals-wrecker',1);assert.equal(CARDS['take-control'].canPlay(g,0),true);
 });
 await t('take-control','quick-contract-non-qualifying-unit-reduced-without-draw',async()=>{
   const g=G(),enemy=u(g,'animals-wrecker',1),p=g.P(0);
   p.hand=[];const n=g.stealCount(enemy);
   await CARDS['take-control'].onPlay(g,g.newInst('take-control',0),0);
   assert.equal(g.stealCount(enemy),Math.max(0,n-1));assert.equal(p.hand.length,0);
 });
 await t('take-control','quick-contract-AI-DRONE-VEHICLE-each-draw-one',async()=>{
   for(const id of ['hacked-corpo','octant','delamain-cab']){
    const g=G(),p=g.P(0);g.P(1).field=[];
    const enemy=u(g,id,1),old=g.stealCount(enemy);p.hand=[];
    await CARDS['take-control'].onPlay(g,g.newInst('take-control',0),0);
    assert.equal(p.hand.length,1,'draw for '+id);
    assert.equal(g.stealCount(enemy),Math.max(0,old-1),'steal cap for '+id);
   }
 });
 await t('take-control','quick-contract-temporary-reduction-ends-after-turn',async()=>{
   const g=G();g.P(1).field=[];const enemy=u(g,'animals-wrecker',1);
   const before=g.stealCount(enemy);
   await CARDS['take-control'].onPlay(g,g.newInst('take-control',0),0);
   assert.equal(g.stealCount(enemy),before-1);
   await g.endTurn();assert.equal(g.stealCount(enemy),before);
 });
 await t('reboot-optics','quick-contract-requires-friendly-unit',()=>{
   const g=G();g.P(0).field=[];assert.equal(CARDS['reboot-optics'].canPlay(g,0),false);
   u(g,'corpo-security');assert.equal(CARDS['reboot-optics'].canPlay(g,0),true);
 });
 await t('reboot-optics','quick-contract-first-fight-prevents-defeat',async()=>{
   const g=G(),ally=u(g,'corpo-security'),rival=u(g,'animals-wrecker',1);
   await CARDS['reboot-optics'].onPlay(g,g.newInst('reboot-optics',0),0);
   await g.fight({attacker:rival.uid,p:1,target:{kind:'unit',uid:ally.uid}});
   assert.equal(g.onField(ally),true);assert.equal(g.P(0).tf.rebootOptics,false);
 });
 await t('reboot-optics','quick-contract-second-fight-is-unprotected',async()=>{
   const g=G(),a=u(g,'corpo-security'),b=u(g,'corpo-security'),rival=u(g,'animals-wrecker',1);
   await CARDS['reboot-optics'].onPlay(g,g.newInst('reboot-optics',0),0);
   await g.fight({attacker:rival.uid,p:1,target:{kind:'unit',uid:a.uid}});
   await g.fight({attacker:rival.uid,p:1,target:{kind:'unit',uid:b.uid}});
   assert.equal(g.onField(a),true);assert.equal(g.onField(b),false);
 });
 await t('reboot-optics','quick-contract-unused-protection-expires',async()=>{
   const g=G();await CARDS['reboot-optics'].onPlay(g,g.newInst('reboot-optics',0),0);
   assert.equal(g.P(0).tf.rebootOptics,true);
   await g.endTurn();assert.equal(g.P(0).tf.rebootOptics,undefined);
 });
 return {count:checks.length,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,tests:checks};
};
