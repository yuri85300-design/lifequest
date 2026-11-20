'use strict';
/** Independent partial publisher rule witnesses for Rita Wheeler,
 * La Llorona and Pacifica Netrunner. Covers event ownership,
 * one-per-turn spending, Blocker timing and conditional ready prevention.
 */
module.exports=async function runTimingReactions(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const build=()=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
   [FastPolicy,FastPolicy],{seed:27197,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  return {g,p:g.P(0),r:g.P(1)};
 };
 async function t(id,clause,fn){
  try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,950),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 const R='rita-wheeler-no-stupid-questions';
 const makeRita=()=>{
  const s=build(),u=s.g.newInst(R,0);
  s.p.field=[u];u.ready=true;u.lag=false;
  s.p.hand=[s.g.newInst('corpo-security',0)];
  s.g.pickCards=async(i,title,pool)=>pool.slice(0,1);
  return {...s,u};
 };
 await t(R,'rita-first-spend-draw-then-discard-one',async()=>{
  const {g,p,u}=makeRita(),hand=p.hand.length,deck=p.deck.length,trash=p.trash.length;
  await g.spendUnit(u);
  assert.equal(p.hand.length,hand);
  assert.equal(p.deck.length,deck-1);assert.equal(p.trash.length,trash+1);
  assert.equal(u.flags.usedRita,true);
 });
 await t(R,'rita-second-spend-same-turn-does-not-trigger',async()=>{
  const {g,p,u}=makeRita();
  await g.spendUnit(u);
  const deck=p.deck.length,trash=p.trash.length;
  u.ready=true;await g.spendUnit(u);
  assert.equal(p.deck.length,deck);assert.equal(p.trash.length,trash);
 });
 await t(R,'rita-other-unit-spend-does-not-trigger',async()=>{
  const {g,p}=makeRita(),other=g.newInst('animals-wrecker',0);
  p.field.push(other);const deck=p.deck.length;
  await g.spendUnit(other);
  assert.equal(p.deck.length,deck);
 });
 const L='la-llorona-ghost-of-the-past';
 const makeLlorona=()=>{
  const s=build(),u=s.g.newInst(L,0),die={uid:271971,value:2,sides:6};
  s.p.field=[u];s.p.gigs=[die];s.r.gigs=[];
  return {...s,u,die};
 };
 await t(L,'la-llorona-own-blocker-increases-gig-by-up-to-three',async()=>{
  const {g,u,die}=makeLlorona();
  g.pickOne=async(i,title,options)=>options.find(x=>x.value===die.uid+':5')?.value??null;
  await g.emit('blocked',{p:0,blocker:u});
  assert.equal(die.value,5);
 });
 await t(L,'la-llorona-other-blocker-no-gig-effect',async()=>{
  const {g,p,die}=makeLlorona(),other=g.newInst('corpo-security',0);
  p.field.push(other);
  await g.emit('blocked',{p:0,blocker:other});
  assert.equal(die.value,2);
 });
 await t(L,'la-llorona-optional-gig-adjustment-declined',async()=>{
  const {g,u,die}=makeLlorona();
  g.pickOne=async()=>null;
  await g.emit('blocked',{p:0,blocker:u});
  assert.equal(die.value,2);
 });
 await t(L,'la-llorona-die-maximum-prevents-overcap',async()=>{
  const {g,u,die}=makeLlorona();
  die.value=5;
  g.pickOne=async(i,title,options)=>{
   assert.equal(options.some(x=>x.value===die.uid+':8'),false);
   return options.find(x=>x.value===die.uid+':6')?.value??null;
  };
  await g.emit('blocked',{p:0,blocker:u});
  assert.equal(die.value,6);
 });
 const N='pacifica-netrunner';
 await t(N,'pacifica-even-street-cred-blocks-rival-ready',async()=>{
  const {g,p,r}=build(),enemy=g.newInst('animals-wrecker',1);
  p.gigs=[{uid:271981,value:2,sides:6}];r.field=[enemy];
  g.pickUnit=async()=>enemy;
  await CARDS[N].onPlay(g,g.newInst(N,0),0);
  assert.equal(g.hasFlag(enemy,'noReady'),true);
 });
 await t(N,'pacifica-odd-street-cred-no-ready-restriction',async()=>{
  const {g,p,r}=build(),enemy=g.newInst('animals-wrecker',1);
  p.gigs=[{uid:271982,value:3,sides:6}];r.field=[enemy];
  await CARDS[N].onPlay(g,g.newInst(N,0),0);
  assert.equal(g.hasFlag(enemy,'noReady'),false);
 });
 await t(N,'pacifica-no-gigs-does-not-count-as-even',async()=>{
  const {g,p,r}=build(),enemy=g.newInst('animals-wrecker',1);
  p.gigs=[];r.field=[enemy];
  await CARDS[N].onPlay(g,g.newInst(N,0),0);
  assert.equal(g.hasFlag(enemy,'noReady'),false);
 });
 await t(N,'pacifica-even-cred-without-rival-target-no-op',async()=>{
  const {g,p,r}=build();p.gigs=[{uid:271983,value:2,sides:6}];r.field=[];
  let picks=0;g.pickUnit=async()=>{picks++;return null;};
  await CARDS[N].onPlay(g,g.newInst(N,0),0);
  assert.equal(picks,1);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
