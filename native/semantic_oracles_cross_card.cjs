'use strict';
/**
 * Cross-card regression witnesses. These test actual combined effects, but
 * are never interpreted as full clause coverage or certification.
 */
module.exports=async function runCrossCard(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api;
 const decks=presetDecks(),tests=[];
 const make=()=>{
  const g=Game.create([decks['the-heist'],decks['embracing-power']],[FastPolicy,FastPolicy],
   {seed:20611,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  return g;
 };
 const put=(g,id,p)=>{
  const card=g.newInst(id,p);g.P(p).field.push(card);return card;
 };
 async function t(id,clause,fn){
  try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id})}
  catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,950),
   reference:'https://cyberpunktcg.com/cards/'+id})}
 }
 await t('take-control','cross-card-take-control-does-not-consume-reboot-optics-protection',async()=>{
  const g=make(),friend=put(g,'corpo-security',0),enemy=put(g,'animals-wrecker',1);
  const beforeFriend=g.stealCount(friend),beforeEnemy=g.stealCount(enemy);
  await CARDS['reboot-optics'].onPlay(g,g.newInst('reboot-optics',0),0);
  assert.equal(g.P(0).tf.rebootOptics,true,'protection created');
  await CARDS['take-control'].onPlay(g,g.newInst('take-control',0),0);
  assert.equal(g.stealCount(friend),beforeFriend,'friendly gig-steal count unchanged');
  assert.equal(g.stealCount(enemy),Math.max(0,beforeEnemy-1),'rival steal count reduced');
  assert.equal(g.P(0).tf.rebootOptics,true,'unrelated program cannot consume shield');
  await g.fight({attacker:enemy.uid,p:1,target:{kind:'unit',uid:friend.uid}});
  assert.equal(g.onField(friend),true,'first combat defeat prevented');
  assert.equal(g.P(0).tf.rebootOptics,false,'combat protection consumed once');
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
