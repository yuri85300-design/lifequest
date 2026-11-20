'use strict';
/**
 * Partial independent branches for Field Operator, Delamain Cab,
 * Corpo Security and Hacked Corpo (current publisher English fingerprint).
 * One executed scenario is NOT full semantic or cross-card certification.
 */
module.exports=async function coreConditions(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const build=()=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
   [FastPolicy,FastPolicy],{seed:2311,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  return {g,p:g.P(0)};
 };
 async function t(id,clause,fn){
  try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,1050),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 for(const [v,draw] of [[2,true],[3,false],[null,false]]){
  const label=v===null?'no-gigs':v===2?'even-street-cred':'odd-street-cred';
  await t('field-operator','field-operator-'+label+'-draw-condition',async()=>{
   const {g,p}=build(),hand=p.hand.length;
   p.gigs=v===null?[]:[{uid:231100,value:v,sides:6}];
   await CARDS['field-operator'].onPlay(g,g.newInst('field-operator',0),0);
   assert.equal(p.hand.length,hand+(draw?1:0));
  });
 }
 await t('delamain-cab','delamain-steal-this-turn-readies-one-eddie',async()=>{
  const {g,p}=build(),u=g.newInst('delamain-cab',0);
  p.field=[u];u.flags.stoleThisTurn=true;
  p.eddies=[{uid:231111,ready:false},{uid:231112,ready:false}];
  await g.emit('turnEnd',{p:0});
  assert.equal(p.eddies.filter(e=>e.ready).length,1);
 });
 await t('delamain-cab','delamain-no-steal-this-turn-does-not-ready',async()=>{
  const {g,p}=build(),u=g.newInst('delamain-cab',0);
  p.field=[u];u.flags.stoleThisTurn=false;
  p.eddies=[{uid:231113,ready:false}];
  await g.emit('turnEnd',{p:0});
  assert.equal(p.eddies[0].ready,false);
 });
 await t('delamain-cab','delamain-rival-turn-end-does-not-ready',async()=>{
  const {g,p}=build(),u=g.newInst('delamain-cab',0);
  p.field=[u];u.flags.stoleThisTurn=true;
  p.eddies=[{uid:231114,ready:false}];
  await g.emit('turnEnd',{p:1});
  assert.equal(p.eddies[0].ready,false);
 });
 await t('corpo-security','corpo-security-has-blocker-keyword',async()=>{
  const {g,p}=build(),u=g.newInst('corpo-security',0);
  p.field=[u];
  assert.equal(g.hasKw(u,'BLOCKER'),true);
 });
 await t('corpo-security','corpo-security-cannot-attack-even-ready',async()=>{
  const {g,p}=build(),u=g.newInst('corpo-security',0);
  p.field=[u];u.ready=true;u.lag=false;
  assert.equal(CARDS['corpo-security'].cantAttack(g,u),true);
  assert.equal(g.legalActions(0).some(a=>a.type==='attack'&&a.uid===u.uid),false);
 });
 await t('hacked-corpo','hacked-corpo-trash-three-and-recover-exactly-one-program',async()=>{
  const {g,p}=build(),a=g.newInst('corpo-security',0),
   b=g.newInst('reboot-optics',0),c=g.newInst('animals-wrecker',0);
  p.deck=[a,b,c];p.trash=[];p.hand=[];
  g.pickCards=async(i,title,pool)=>[pool[0]];
  await CARDS['hacked-corpo'].onPlay(g,g.newInst('hacked-corpo',0),0);
  assert.equal(p.deck.length,0);
  assert.equal(p.hand.length,1);assert.equal(p.hand[0],b);
  assert.equal(p.trash.length,2);
  assert.ok(p.trash.includes(a)&&p.trash.includes(c));
 });
 await t('hacked-corpo','hacked-corpo-no-program-among-three-remains-in-trash',async()=>{
  const {g,p}=build();
  p.deck=[g.newInst('corpo-security',0),g.newInst('animals-wrecker',0),
    g.newInst('delamain-cab',0)];p.trash=[];p.hand=[];
  let picks=0;g.pickCards=async()=>{picks++;return []};
  await CARDS['hacked-corpo'].onPlay(g,g.newInst('hacked-corpo',0),0);
  assert.equal(picks,0);assert.equal(p.hand.length,0);
  assert.equal(p.trash.length,3);assert.equal(p.deck.length,0);
 });
 await t('hacked-corpo','hacked-corpo-short-deck-trashes-only-available-cards',async()=>{
  const {g,p}=build(),program=g.newInst('reboot-optics',0);
  p.deck=[program];p.trash=[];p.hand=[];
  g.pickCards=async(i,title,pool)=>[pool[0]];
  await CARDS['hacked-corpo'].onPlay(g,g.newInst('hacked-corpo',0),0);
  assert.equal(p.deck.length,0);assert.equal(p.hand.length,1);
  assert.equal(p.hand[0],program);assert.equal(p.trash.length,0);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
