'use strict';
/* Independently executed, partially source-bound publisher rules witnesses:
 * Gunpoint Diplomacy, Bonnie and Clyde, Mox Inciters.
 * Covers opponent-controlled choice, mandatory/optional targets, and next-turn
 * attack restrictions. None of these tests is whole-card certification.
 */
module.exports=async function highRiskChoices(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const make=(ours=2,theirs=2)=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
   [FastPolicy,FastPolicy],{seed:29449,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  const p=g.P(0),q=g.P(1);
  p.gigs=Array.from({length:ours},(_,k)=>({uid:294490+k,value:k+1,sides:6}));
  q.gigs=Array.from({length:theirs},(_,k)=>({uid:294500+k,value:k+1,sides:6}));
  const u=g.newInst('animals-wrecker',0);p.field=[u];
  return {g,p,q,u};
 };
 async function t(id,clause,fn){
  try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,1100),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 const G='gunpoint-diplomacy',gun=s=>CARDS[G].onPlay(s.g,s.g.newInst(G,0),0);
 await t(G,'gunpoint-not-behind-gains-both-effects',async()=>{
  const s=make(2,1);s.g.pickUnit=async()=>s.u;
  s.g.pickOne=async()=>{throw Error('Rival should not choose when controller is not behind')};
  const before=s.g.eff(s.u);
  await gun(s);
  assert.equal(s.g.hasFlag(s.u,'attackReady'),true);
  assert.equal(s.g.eff(s.u),before+3);
 });
 await t(G,'gunpoint-behind-rival-chooses-ready-attack-only',async()=>{
  const s=make(1,3);s.g.pickUnit=async()=>s.u;
  let chooser=null;s.g.pickOne=async(i)=>{chooser=i;return 1};
  const before=s.g.eff(s.u);
  await gun(s);
  assert.equal(chooser,1,'Opponent controls one-effect choice');
  assert.equal(s.g.hasFlag(s.u,'attackReady'),true);
  assert.equal(s.g.eff(s.u),before);
 });
 await t(G,'gunpoint-behind-rival-chooses-power-only',async()=>{
  const s=make(1,3);s.g.pickUnit=async()=>s.u;
  s.g.pickOne=async i=>{assert.equal(i,1);return 2};
  const before=s.g.eff(s.u);
  await gun(s);
  assert.equal(s.g.hasFlag(s.u,'attackReady'),false);
  assert.equal(s.g.eff(s.u),before+3);
 });
 await t(G,'gunpoint-attack-ready-privilege-is-consumed-by-next-attack',async()=>{
  const s=make(2,1),enemy=s.g.newInst('corpo-security',1);
  s.q.field=[enemy];enemy.ready=true;s.g.pickUnit=async()=>s.u;
  await gun(s);
  assert.equal(s.g.hasFlag(s.u,'attackReady'),true);
  assert.equal(s.g.attackTargets(s.u).some(x=>x.kind==='unit'&&x.uid===enemy.uid),true);
  await s.g.attack(0,s.u.uid,{kind:'unit',uid:enemy.uid});
  assert.equal(s.g.hasFlag(s.u,'attackReady'),false);
 });
 await t(G,'gunpoint-no-friendly-unit-cannot-play',async()=>{
  const s=make();s.p.field=[];
  assert.equal(CARDS[G].canPlay(s.g,0),false);
 });
 await t(G,'gunpoint-power-bonus-expires-after-turn',async()=>{
  const s=make(2,1);s.g.pickUnit=async()=>s.u;
  const before=s.g.eff(s.u);
  await gun(s);assert.equal(s.g.eff(s.u),before+3);
  await s.g.endTurn();
  assert.equal(s.g.eff(s.u),before);
  assert.equal(s.g.hasFlag(s.u,'attackReady'),false);
 });
 const B='bonnie-and-clyde',bon=s=>CARDS[B].onPlay(s.g,s.g.newInst(B,0),0);
 await t(B,'bonnie-no-rival-four-or-less-cannot-play',async()=>{
  const s=make(),foe=s.g.newInst('animals-wrecker',1);
  s.q.field=[foe];assert.equal(CARDS[B].canPlay(s.g,0),false);
 });
 await t(B,'bonnie-not-behind-defeats-only-one',async()=>{
  const s=make(2,1),a=s.g.newInst('corpo-security',1),b=s.g.newInst('delamain-cab',1);
  s.q.field=[a,b];s.g.pickUnit=async()=>a;
  await bon(s);
  assert.equal(s.g.onField(a),false);assert.equal(s.g.onField(b),true);
 });
 await t(B,'bonnie-two-gig-deficit-may-defeat-two',async()=>{
  const s=make(1,3),a=s.g.newInst('corpo-security',1),b=s.g.newInst('delamain-cab',1);
  s.q.field=[a,b];s.g.pickUnit=async(i,title,pool)=>pool[0];
  await bon(s);
  assert.equal(s.g.onField(a),false);assert.equal(s.g.onField(b),false);
 });
 await t(B,'bonnie-second-defeat-is-optional',async()=>{
  const s=make(1,3),a=s.g.newInst('corpo-security',1),b=s.g.newInst('delamain-cab',1);
  s.q.field=[a,b];let picks=0;
  s.g.pickUnit=async()=>{picks++;return picks===1?a:null};
  await bon(s);
  assert.equal(s.g.onField(a),false);assert.equal(s.g.onField(b),true);
 });
 await t(B,'bonnie-vs-deadman-transmitter-replaces-first-defeat',async()=>{
  const s=make(2,1),host=s.g.newInst('corpo-security',1),
   shield=s.g.newInst('deadman-transmitter',1);
  host.gear=[shield];s.q.field=[host];s.g.pickUnit=async()=>host;
  await bon(s);
  assert.equal(s.g.onField(host),true,'Protected rival stays on battlefield');
  assert.equal(host.gear.includes(shield),false,'Protection equipment is sacrificed');
  assert.equal(s.q.trash.includes(shield),true);
 });
 await t(B,'bonnie-two-defeat-attempts-can-hit-protected-then-unprotected-unit',async()=>{
  const s=make(1,3),a=s.g.newInst('corpo-security',1),
   shield=s.g.newInst('deadman-transmitter',1),b=s.g.newInst('delamain-cab',1);
  a.gear=[shield];s.q.field=[a,b];let round=0;
  s.g.pickUnit=async()=>++round===1?a:b;
  await bon(s);
  assert.equal(s.g.onField(a),true,'First target defeat replaced');
  assert.equal(s.q.trash.includes(shield),true);
  assert.equal(s.g.onField(b),false,'Second defeat resolves separately');
 });
 await t(B,'bonnie-power-greater-than-four-is-not-legal-target',async()=>{
  const s=make(1,3),a=s.g.newInst('corpo-security',1),b=s.g.newInst('animals-wrecker',1);
  s.q.field=[a,b];s.g.pickUnit=async(i,title,pool)=>{
   assert.equal(pool.includes(b),false);return pool[0];
  };
  await bon(s);
  assert.equal(s.g.onField(a),false);assert.equal(s.g.onField(b),true);
 });
 const M='mox-inciters',mox=s=>CARDS[M].onPlay(s.g,s.g.newInst(M,0),0);
 await t(M,'mox-play-forces-selected-rival-to-attack',async()=>{
  const s=make(),target=s.g.newInst('animals-wrecker',1);
  s.q.field=[target];s.g.pickUnit=async()=>target;
  await mox(s);
  assert.equal(s.g.hasFlag(target,'mustAttack'),true);
 });
 await t(M,'mox-no-rival-unit-no-must-attack-flag',async()=>{
  const s=make();s.q.field=[];
  s.g.pickUnit=async()=>null;
  await mox(s);
  assert.equal(s.q.field.length,0);
 });
 await t(M,'mox-blocker-keyword-is-present',async()=>{
  const s=make(),m=s.g.newInst(M,0);
  s.p.field.push(m);assert.equal(s.g.hasKw(m,'BLOCKER'),true);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
