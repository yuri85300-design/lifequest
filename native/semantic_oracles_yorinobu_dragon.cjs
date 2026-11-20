'use strict';
/**
 * Independent partial source-bound Yorinobu Steel Dragon witnesses.
 * Official English page: https://cyberpunktcg.com/cards/yorinobu-arasaka-steel-dragon
 * Covers free-play choices and global first ARASAKA defeat; these scenarios
 * are not a certification of all combat and cross-card interactions.
 */
module.exports=async function yorinobuDragon(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const setup=()=>{
  const g=Game.create([ds['embracing-power'],ds['the-heist']],
   [FastPolicy,FastPolicy],{seed:27910,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  return {g,p:g.P(0),q:g.P(1)};
 };
 async function t(clause,fn){
  const id='yorinobu-arasaka-steel-dragon';
  try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,1000),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 const play=async g=>CARDS['yorinobu-arasaka-steel-dragon'].onPlay(g,g.newInst('yorinobu-arasaka-steel-dragon',0),0);
 await t('yorinobu-free-play-eligible-cost-three-unit-from-hand-and-rush',async()=>{
  const {g,p}=setup(),unit=g.newInst('field-operator',0);
  p.hand=[unit];g.pickCards=async(i,title,pool)=>[pool[0]];
  await play(g);
  assert.equal(p.field.includes(unit),true);
  assert.equal(p.hand.includes(unit),false);
  assert.equal(g.hasFlag(unit,'rushUnits'),true);
 });
 await t('yorinobu-free-play-eligible-unit-from-trash',async()=>{
  const {g,p}=setup(),unit=g.newInst('field-operator',0);
  p.hand=[];p.trash=[unit];g.pickCards=async(i,title,pool)=>[pool[0]];
  await play(g);
  assert.equal(p.field.includes(unit),true);
  assert.equal(p.trash.includes(unit),false);
 });
 await t('yorinobu-free-play-excludes-cost-above-four',async()=>{
  const {g,p}=setup(),unit=g.newInst('animals-wrecker',0);
  p.hand=[unit];p.trash=[];let choices=0;
  g.pickCards=async()=>{choices++;return []};
  await play(g);
  assert.equal(choices,0);assert.equal(p.hand.includes(unit),true);
  assert.equal(p.field.includes(unit),false);
 });
 await t('yorinobu-optional-free-play-may-be-declined',async()=>{
  const {g,p}=setup(),unit=g.newInst('field-operator',0);
  p.hand=[unit];g.pickCards=async()=>[];
  await play(g);
  assert.equal(p.hand.includes(unit),true);
 });
 const yField=()=>{
  const s=setup(),y=s.g.newInst('yorinobu-arasaka-steel-dragon',0);
  s.p.field=[y];
  return {...s,y};
 };
 await t('yorinobu-first-friendly-arasaka-defeat-draws-one',async()=>{
  const {g,p}=yField(),unit=g.newInst('field-operator',0);
  p.field.push(unit);const hand=p.hand.length;
  await g.defeat(unit,{effect:true});
  assert.equal(p.hand.length,hand+1);
 });
 await t('yorinobu-second-arasaka-defeat-same-turn-no-second-draw',async()=>{
  const {g,p}=yField(),a=g.newInst('field-operator',0),
   b=g.newInst('augmented-negotiators',0);
  p.field.push(a,b);const hand=p.hand.length;
  await g.defeat(a,{effect:true});await g.defeat(b,{effect:true});
  assert.equal(p.hand.length,hand+1);
 });
 await t('yorinobu-first-rival-arasaka-defeat-also-draws',async()=>{
  const {g,p,q}=yField(),enemy=g.newInst('field-operator',1);
  q.field=[enemy];const hand=p.hand.length;
  await g.defeat(enemy,{effect:true});
  assert.equal(p.hand.length,hand+1);
 });
 await t('yorinobu-own-first-defeat-draws-even-after-leaving-field',async()=>{
  const {g,p,y}=yField(),hand=p.hand.length;
  await g.defeat(y,{effect:true});
  assert.equal(g.onField(y),false);
  assert.equal(p.hand.length,hand+1);
 });
 await t('yorinobu-arasaka-first-defeat-before-its-entry-consumes-turn-trigger',async()=>{
  const {g,p}=setup(),a=g.newInst('field-operator',0),
   b=g.newInst('augmented-negotiators',0);
  p.field=[a];await g.defeat(a,{effect:true});
  const y=g.newInst('yorinobu-arasaka-steel-dragon',0);
  p.field.push(y,b);const hand=p.hand.length;
  await g.defeat(b,{effect:true});
  assert.equal(p.hand.length,hand);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
