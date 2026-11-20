'use strict';
// Official Nocturne OP55 N1 (2026 English text and FAQ) contract branches.
module.exports=async function runNocturne(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const make=()=>{
   const g=Game.create([ds['the-heist'],ds['embracing-power']],[FastPolicy,FastPolicy],{seed:8081,hooks:{sim:true}});
   g.s.phase='main';g.s.active=0;return g;
 };
 const chooseMode=(g,mode)=>{const prior=g.pickOne.bind(g);g.pickOne=async(p,title,opts,other)=>title==='Nocturne : choisissez'?mode:prior(p,title,opts,other)};
 async function check(name,fn){try{await fn();tests.push({id:'nocturne-op55-n1',clause:name,reference:'https://cyberpunktcg.com/cards/nocturne-op55-n1',status:'PASS'})}catch(e){tests.push({id:'nocturne-op55-n1',clause:name,reference:'https://cyberpunktcg.com/cards/nocturne-op55-n1',status:'FAIL',error:String(e.stack||e).slice(0,800)})}}
 await check('empty-fixer-mandates-fixed-one-eddie-instead-of-three',()=>{
  const g=make(),p=g.P(0),n=g.newInst('nocturne-op55-n1',0);
  p.fixer=[];assert.equal(g.costOf(n,0),1);
  p.fixer=[{uid:9901,sides:4}];assert.equal(g.costOf(n,0),3);
 });
 await check('choice-draw-two-cards-exactly',async()=>{
  const g=make(),p=g.P(0);chooseMode(g,0);const count=p.hand.length;
  await CARDS['nocturne-op55-n1'].onPlay(g,g.newInst('nocturne-op55-n1',0),0);
  assert.equal(p.hand.length,count+2);assert.equal(!!p.tf.soloDiscount,false);
 });
 await check('choice-immobilize-allowed-when-field-empty',async()=>{
  const g=make();chooseMode(g,1);g.P(0).field=[];g.P(1).field=[];
  await CARDS['nocturne-op55-n1'].onPlay(g,g.newInst('nocturne-op55-n1',0),0);
  assert.equal(g.P(0).field.length+g.P(1).field.length,0);
 });
 await check('choice-solo-discount-can-be-chosen-without-faceup-legend',async()=>{
  const g=make(),p=g.P(0);chooseMode(g,2);p.legends.forEach(l=>l.faceUp=false);
  await CARDS['nocturne-op55-n1'].onPlay(g,g.newInst('nocturne-op55-n1',0),0);
  assert.equal(p.tf.soloDiscount,2);
 });
 await check('choice-solo-applies-to-any-friendly-legend-and-consumes-on-success',async()=>{
  const g=make(),p=g.P(0);chooseMode(g,2);
  const l1=g.newInst('v-corporate-exile',0),l2=g.newInst('goro-takemura-hands-unclean',0);
  p.legends=[l1,l2];l1.faceUp=l2.faceUp=true;
  p.eddies=Array.from({length:18},(_,i)=>({uid:990100+i,ready:true}));
  const original=g.costOf(l2,0,'solo');
  await CARDS['nocturne-op55-n1'].onPlay(g,g.newInst('nocturne-op55-n1',0),0);
  assert.equal(g.costOf(l2,0,'solo'),Math.max(1,original-2));
  await g.withTimingWindow(()=>g.goSolo(0,l2.uid,true));
  assert.equal(g.onField(l2),true);assert.equal(p.tf.soloDiscount,0);
  assert.equal(g.costOf(l1,0,'solo'),CARDS[l1.id].cost);
 });
 await check('failed-solo-payment-must-not-consume-one-use-discount',async()=>{
  const g=make(),p=g.P(0);p.tf.soloDiscount=2;p.eddies=[];
  const l=g.newInst('goro-takemura-hands-unclean',0);
  p.legends=[l];l.faceUp=true;
  await g.withTimingWindow(()=>g.goSolo(0,l.uid,true));
  assert.equal(g.onField(l),false);assert.equal(p.tf.soloDiscount,2);
 });
 await check('discount-cannot-lower-go-solo-payment-below-one',()=>{
  const g=make(),p=g.P(0),l=g.newInst('v-corporate-exile',0);
  p.legends=[l];l.faceUp=true;p.tf.soloDiscount=80;
  assert.equal(g.costOf(l,0,'solo'),1);
 });
 await check('solo-discount-stacks-with-rival-riot-shield-surcharge',async()=>{
  const g=make(),p=g.P(0),l=g.newInst('v-corporate-exile',0);
  p.legends=[l];l.faceUp=true;
  const foe=g.newInst('animals-wrecker',1),shield=g.newInst('riot-shield',1);
  foe.gear.push(shield);g.P(1).field.push(foe);
  const base=CARDS[l.id].cost;
  assert.equal(g.costOf(l,0,'solo'),base+2);
  chooseMode(g,2);await CARDS['nocturne-op55-n1'].onPlay(g,g.newInst('nocturne-op55-n1',0),0);
  assert.equal(g.costOf(l,0,'solo'),base);
  assert.equal(g.costOf(l,0,'field'),base);
 });
 await check('unused-solo-discount-expires-at-end-of-turn',async()=>{
  const g=make(),p=g.P(0);chooseMode(g,2);
  await CARDS['nocturne-op55-n1'].onPlay(g,g.newInst('nocturne-op55-n1',0),0);
  assert.equal(p.tf.soloDiscount,2);await g.endTurn();
  assert.equal(!!p.tf.soloDiscount,false);
 });
 await check('fixed-payment-one-even-if-another-program-discount-would-apply',()=>{
  const g=make(),p=g.P(0),n=g.newInst('nocturne-op55-n1',0);
  p.fixer=[];p.tf.progDiscount=3;
  assert.equal(g.costOf(n,0),1);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
