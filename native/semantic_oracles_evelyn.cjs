'use strict';
/**
 * Partial independent branch witnesses for the official English text of
 * Evelyn Parker: Beautiful Enigma, not whole-card certification.
 */
module.exports=async function verifyEvelyn(api,assert){
 const {Game,presetDecks,FastPolicy}=api;
 const decks=presetDecks(),tests=[];
 const make=()=>{
  const g=Game.create([decks['the-heist'],decks['embracing-power']],
    [FastPolicy,FastPolicy],{seed:2107,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  const p=g.P(0),l=g.newInst('evelyn-parker-beautiful-enigma',0);
  l.faceUp=true;l.ready=true;p.legends=[l];
  p.eddies=[{uid:21071,ready:false},{uid:21072,ready:true}];
  return {g,p,l};
 };
 async function t(name,fn){
  try{await fn();tests.push({id:'evelyn-parker-beautiful-enigma',clause:name,
   status:'PASS',reference:'https://cyberpunktcg.com/cards/evelyn-parker-beautiful-enigma'})}
  catch(e){tests.push({id:'evelyn-parker-beautiful-enigma',clause:name,
   status:'FAIL',error:String(e.stack||e).slice(0,950),
   reference:'https://cyberpunktcg.com/cards/evelyn-parker-beautiful-enigma'})}
 }
 await t('evelyn-corpo-or-ganger-steal-readies-one-eddie',async()=>{
  for(const id of ['corpo-security','animals-wrecker']){
   const {g,p}=make(),u=g.newInst(id,0);p.field=[u];
   await g.emit('steal',{p:0,unit:u,gigs:1});
   assert.equal(p.eddies.filter(e=>e.ready).length,2,'eligible type '+id);
  }
 });
 await t('evelyn-unrelated-unit-steal-does-not-ready-eddie',async()=>{
  const {g,p}=make(),u=g.newInst('delamain-cab',0);p.field=[u];
  await g.emit('steal',{p:0,unit:u,gigs:1});
  assert.equal(p.eddies.filter(e=>e.ready).length,1);
 });
 await t('evelyn-rival-steal-does-not-ready-eddie',async()=>{
  const {g,p}=make(),u=g.newInst('animals-wrecker',1);g.P(1).field=[u];
  await g.emit('steal',{p:1,unit:u,gigs:1});
  assert.equal(p.eddies.filter(e=>e.ready).length,1);
 });
 await t('evelyn-spend-forces-rival-unit-next-turn',async()=>{
  const {g,p,l}=make(),enemy=g.newInst('animals-wrecker',1);
  g.P(1).field=[enemy];g.pickUnit=async()=>enemy;
  await g.activate(0,l.uid,0);
  assert.equal(g.hasFlag(enemy,'mustAttack'),true);
  assert.equal(l.ready,false);
  assert.equal(p.eddies.filter(e=>e.ready).length,0);
 });
 await t('evelyn-spend-requires-rival-target',async()=>{
  const {g,l}=make();g.P(1).field=[];
  const legal=g.legalActions(0).some(a=>a.type==='activate'&&a.uid===l.uid);
  assert.equal(legal,false);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
