'use strict';
/**
 * Independent partial witnesses for combat, Gig-steal and Program-trigger
 * conditions in four current publisher-English card descriptions.
 */
module.exports=async function runTriggerConditions(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const setup=(my=4,theirs=1)=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
   [FastPolicy,FastPolicy],{seed:23048,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  const p=g.P(0),q=g.P(1);
  p.gigs=[{uid:230481,value:my,sides:8}];
  q.gigs=[{uid:230482,value:theirs,sides:8}];
  return {g,p,q};
 };
 async function t(id,clause,fn){
  try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,1050),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 const E='evelyn-parker-scheming-siren';
 await t(E,'scheming-siren-attack-draws-one-when-behind',async()=>{
  const {g,p}=setup(1,4),before=p.hand.length,deck=p.deck.length;
  await CARDS[E].onAttack(g,g.newInst(E,0),0);
  assert.equal(p.hand.length,before+1);assert.equal(p.deck.length,deck-1);
 });
 await t(E,'scheming-siren-attack-ahead-draw-then-discard-one',async()=>{
  const {g,p}=setup(5,2),hand=p.hand.length,deck=p.deck.length,trash=p.trash.length;
  g.pickCards=async(i,title,pool)=>pool.slice(0,1);
  await CARDS[E].onAttack(g,g.newInst(E,0),0);
  assert.equal(p.hand.length,hand);assert.equal(p.deck.length,deck-1);
  assert.equal(p.trash.length,trash+1);
 });
 await t(E,'scheming-siren-equal-cred-does-not-discard',async()=>{
  const {g,p}=setup(3,3),hand=p.hand.length,trash=p.trash.length;
  await CARDS[E].onAttack(g,g.newInst(E,0),0);
  assert.equal(p.hand.length,hand+1);assert.equal(p.trash.length,trash);
 });
 const J='jacked-in-voodoo-boy';
 await t(J,'jacked-in-no-program-this-turn-cannot-attack',async()=>{
  const {g,p}=setup(),u=g.newInst(J,0);
  p.field=[u];u.ready=true;u.lag=false;p.tf.playedProgram=false;
  assert.equal(CARDS[J].cantAttack(g,u),true);
  assert.equal(g.legalActions(0).some(a=>a.type==='attack'&&a.uid===u.uid),false);
 });
 await t(J,'jacked-in-program-played-allows-attack-condition',async()=>{
  const {g,p}=setup(),u=g.newInst(J,0);
  p.field=[u];u.ready=true;u.lag=false;p.tf.playedProgram=true;
  assert.equal(CARDS[J].cantAttack(g,u),false);
 });
 await t(J,'jacked-in-other-player-program-does-not-allow-attack',async()=>{
  const {g,p,q}=setup(),u=g.newInst(J,0);
  p.field=[u];u.ready=true;u.lag=false;
  p.tf.playedProgram=false;q.tf.playedProgram=true;
  assert.equal(CARDS[J].cantAttack(g,u),true);
 });
 const M='maelstrom-goons';
 const fillRivalHand=(g,q)=>{q.hand=[g.newInst('corpo-security',1),g.newInst('animals-wrecker',1),g.newInst('delamain-cab',1)]};
 await t(M,'maelstrom-unequipped-steal-does-not-discard',async()=>{
  const {g,q}=setup(),u=g.newInst(M,0);
  fillRivalHand(g,q);const hand=q.hand.length;g.pickCards=async(i,title,pool)=>pool.slice(0,1);
  await CARDS[M].onSteal(g,u,0,[q.gigs[0]]);
  assert.equal(q.hand.length,hand);
 });
 await t(M,'maelstrom-equipped-one-gig-steal-discards-one',async()=>{
  const {g,q}=setup(),u=g.newInst(M,0);
  u.gear=[g.newInst('kiroshi-optics',0)];
  fillRivalHand(g,q);const hand=q.hand.length,trash=q.trash.length;
  g.pickCards=async(i,title,pool)=>pool.slice(0,1);
  await CARDS[M].onSteal(g,u,0,[q.gigs[0]]);
  assert.equal(q.hand.length,hand-1);assert.equal(q.trash.length,trash+1);
 });
 await t(M,'maelstrom-equipped-multiple-stolen-gigs-discard-per-gig',async()=>{
  const {g,q}=setup(),u=g.newInst(M,0);
  u.gear=[g.newInst('kiroshi-optics',0)];
  q.gigs.push({uid:230483,value:3,sides:6});
  fillRivalHand(g,q);const hand=q.hand.length;
  g.pickCards=async(i,title,pool)=>pool.slice(0,1);
  await CARDS[M].onSteal(g,u,0,[q.gigs[0],q.gigs[1]]);
  assert.equal(q.hand.length,hand-2);
 });
 const C='chrome-reverie';
 await t(C,'chrome-reverie-immobilizes-rival-unit-even-with-no-min-gig',async()=>{
  const {g,p,q}=setup(4,2),enemy=g.newInst('animals-wrecker',1);
  q.field=[enemy];g.pickUnit=async()=>enemy;p.legends=[];
  await CARDS[C].onPlay(g,g.newInst(C,0),0);
  assert.equal(g.hasFlag(enemy,'cantAttack'),true);
 });
 await t(C,'chrome-reverie-no-minimum-gig-no-free-call',async()=>{
  const {g,p}=setup(3,2),legend=g.newInst('v-corporate-exile',0);
  legend.faceUp=false;p.legends=[legend];
  let calls=0;g.callFree=async()=>{calls++};
  await CARDS[C].onPlay(g,g.newInst(C,0),0);
  assert.equal(calls,0);
 });
 await t(C,'chrome-reverie-minimum-gig-offers-optional-free-call',async()=>{
  const {g,p}=setup(1,2),legend=g.newInst('v-corporate-exile',0);
  legend.faceUp=false;p.legends=[legend];
  let calls=0;g.yesNo=async()=>true;g.callFree=async()=>{calls++};
  await CARDS[C].onPlay(g,g.newInst(C,0),0);
  assert.equal(calls,1);
 });
 await t(C,'chrome-reverie-earlier-call-blocks-another',async()=>{
  const {g,p}=setup(1,2),legend=g.newInst('v-corporate-exile',0);
  legend.faceUp=false;p.legends=[legend];p.calledThisTurn=true;
  let calls=0;g.yesNo=async()=>true;g.callFree=async()=>{calls++};
  await CARDS[C].onPlay(g,g.newInst(C,0),0);
  assert.equal(calls,0);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
