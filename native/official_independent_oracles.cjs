'use strict';
// Independent, separately authored cases checked against publisher card pages.
// Each case tests an explicit clause/branch, not the whole card.
module.exports=async function officialOracles(api, assert){
 const {CARDS,Game,presetDecks,FastPolicy}=api, decks=presetDecks(),tests=[];
 const G=()=>{
  const g=Game.create([decks['the-heist'],decks['embracing-power']],[FastPolicy,FastPolicy],{seed:1977,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;return g;
 };
 const die=(uid,value,sides=10)=>({uid,value,sides});
 const unit=(g,id,p=0)=>{const u=g.newInst(id,p);g.P(p).field.push(u);return u};
 async function test(id,clause,fn){
  try{await fn();tests.push({id,clause,reference:'https://cyberpunktcg.com/cards/'+id,status:'PASS'})}
  catch(e){tests.push({id,clause,reference:'https://cyberpunktcg.com/cards/'+id,status:'FAIL',error:String(e.stack||e).slice(0,750)})}
 }
 await test('japantown-jonin','play-grants-plus-two-power-to-exactly-one-friend',async()=>{
  const g=G(),a=unit(g,'animals-wrecker'),j=unit(g,'japantown-jonin');const before=g.eff(a)+g.eff(j);
  await CARDS[j.id].onPlay(g,j,0);assert.equal(g.eff(a)+g.eff(j),before+2);
 });
 await test('kerry-eurodyne-the-last-rockerboy','spend-draws-two-only-with-gig-value-eight-plus',async()=>{
  const g=G(),p=g.P(0),u=unit(g,'kerry-eurodyne-the-last-rockerboy');
  p.gigs=[die(60001,7)];p.eddies=[];
  assert.equal(g.legalActions(0).some(a=>a.type==='activate'&&a.uid===u.uid),false);
  p.gigs[0].value=8;
  assert.equal(g.legalActions(0).some(a=>a.type==='activate'&&a.uid===u.uid),true);
  const start=p.hand.length;await g.activate(0,u.uid,0);
  assert.equal(p.hand.length,start+2);assert.equal(u.ready,false);
 });
 await test('royce-don-t-call-me-simon','power-three-target-forbidden-when-not-ahead',async()=>{
  const g=G();g.P(1).field=[];
  const weak=unit(g,'corpo-security',1),three=unit(g,'maelstrom-goons',1);
  g.P(0).gigs=[die(60011,1)];g.P(1).gigs=[die(60012,8)];
  await CARDS['royce-don-t-call-me-simon'].onPlay(g,g.newInst('royce-don-t-call-me-simon',0),0);
  assert.equal(g.onField(weak),false);assert.equal(g.onField(three),true);
 });
 await test('royce-don-t-call-me-simon','power-three-target-allowed-only-when-ahead',async()=>{
  const g=G();g.P(1).field=[];const three=unit(g,'maelstrom-goons',1);
  g.P(0).gigs=[die(60013,8)];g.P(1).gigs=[die(60014,1)];
  await CARDS['royce-don-t-call-me-simon'].onPlay(g,g.newInst('royce-don-t-call-me-simon',0),0);
  assert.equal(g.onField(three),false);
 });
 await test('all-is-lost','trash-three-choose-unit-without-returning-others',async()=>{
  const g=G(),p=g.P(0);p.trash=[];p.hand=[];
  const u=g.newInst('animals-wrecker',0),gr=g.newInst('mantis-blades',0),pr=g.newInst('shattered-memories',0);
  p.deck=[u,gr,pr];
  await CARDS['all-is-lost'].onPlay(g,g.newInst('all-is-lost',0),0);
  assert.equal(p.deck.length,0);assert.equal(p.hand.length,1);assert.equal(p.hand[0].uid,u.uid);
  assert.equal(p.trash.length,2);assert.equal(p.trash.includes(gr),true);assert.equal(p.trash.includes(pr),true);
 });
 await test('all-is-lost','trash-three-no-eligible-unit-does-not-conjure-one',async()=>{
  const g=G(),p=g.P(0);p.trash=[];p.hand=[];
  p.deck=[g.newInst('mantis-blades',0),g.newInst('shattered-memories',0),g.newInst('all-is-lost',0)];
  await CARDS['all-is-lost'].onPlay(g,g.newInst('all-is-lost',0),0);
  assert.equal(p.hand.length,0);assert.equal(p.trash.length,3);
 });
 await test('shattered-memories','each-player-may-refuse-five-card-draw',async()=>{
  const g=G(),p=g.P(0),q=g.P(1);
  p.hand=[g.newInst('animals-wrecker',0)];q.hand=[g.newInst('corpo-security',1)];
  p.gigs=[die(60021,2)];g.yesNo=async()=>false;
  await CARDS['shattered-memories'].onPlay(g,g.newInst('shattered-memories',0),0);
  assert.equal(p.hand.length,2);assert.equal(q.hand.length,0);
 });
 await test('shattered-memories','both-draw-five-owner-draws-two-if-discard-total-matches-gig',async()=>{
  const g=G(),p=g.P(0),q=g.P(1);
  p.hand=[g.newInst('animals-wrecker',0)];q.hand=[g.newInst('corpo-security',1)];
  p.gigs=[die(60031,2)];g.yesNo=async()=>true;
  await CARDS['shattered-memories'].onPlay(g,g.newInst('shattered-memories',0),0);
  assert.equal(p.hand.length,7);assert.equal(q.hand.length,5);
 });
 await test('shattered-memories','no-two-card-bonus-with-unmatched-gig-value',async()=>{
  const g=G(),p=g.P(0),q=g.P(1);
  p.hand=[g.newInst('animals-wrecker',0)];q.hand=[g.newInst('corpo-security',1)];
  p.gigs=[die(60041,6)];g.yesNo=async()=>true;
  await CARDS['shattered-memories'].onPlay(g,g.newInst('shattered-memories',0),0);
  assert.equal(p.hand.length,5);assert.equal(q.hand.length,5);
 });
 await test('maxtac-av','optional-swap-refusal-leaves-ownership-unchanged',async()=>{
  const g=G(),p=g.P(0),q=g.P(1),a=die(60051,1),b=die(60052,6);
  p.gigs=[a];q.gigs=[b];g.yesNo=async()=>false;
  await CARDS['maxtac-av'].onPlay(g,g.newInst('maxtac-av',0),0);
  assert.equal(p.gigs[0].uid,a.uid);assert.equal(q.gigs[0].uid,b.uid);
 });
 await test('maxtac-av','optional-swap-acceptance-moves-both-gigs',async()=>{
  const g=G(),p=g.P(0),q=g.P(1),a=die(60061,1),b=die(60062,6);
  p.gigs=[a];q.gigs=[b];g.yesNo=async()=>true;
  await CARDS['maxtac-av'].onPlay(g,g.newInst('maxtac-av',0),0);
  assert.equal(p.gigs[0].uid,b.uid);assert.equal(q.gigs[0].uid,a.uid);
 });
 await test('nadia-fighting-through-grief','lag-rush-allows-gigs-but-not-units-only-when-behind',()=>{
  const g=G(),u=unit(g,'nadia-fighting-through-grief'),foe=unit(g,'corpo-security',1);
  u.lag=true;foe.ready=false;g.P(0).gigs=[die(60071,2)];g.P(1).gigs=[die(60072,2),die(60073,3)];
  assert.equal(g.canAttackNow(u),true);
  assert.equal(g.attackTargets(u).some(t=>t.kind==='gigs'),true);
  assert.equal(g.attackTargets(u).some(t=>t.kind==='unit'),false);
  g.P(0).gigs.push(die(60074,4));assert.equal(g.canAttackNow(u),false);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
