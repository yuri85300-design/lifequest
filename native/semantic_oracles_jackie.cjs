'use strict';
/* Partial source-bound Jackie Welles: Pour One Out For Me witnesses.
 * Publisher: https://cyberpunktcg.com/cards/jackie-welles-pour-one-out-for-me
 * These scenario-level assertions do not certify all cross-card interactions.
 */
module.exports=async function runJackie(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api, decks=presetDecks(),out=[];
 const build=(value=3)=>{
  const g=Game.create([decks['the-heist'],decks['embracing-power']],
   [FastPolicy,FastPolicy],{seed:2098,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;
  const p=g.P(0),legend=g.newInst('jackie-welles-pour-one-out-for-me',0);
  legend.faceUp=true;p.legends=[legend];p.gigs=[{uid:98001,value,sides:6}];
  return {g,p,legend,die:p.gigs[0]};
 };
 async function test(clause,fn){
  try{await fn();out.push({id:'jackie-welles-pour-one-out-for-me',clause,
   status:'PASS',reference:'https://cyberpunktcg.com/cards/jackie-welles-pour-one-out-for-me'})}
  catch(e){out.push({id:'jackie-welles-pour-one-out-for-me',clause,status:'FAIL',
   error:String(e.stack||e).slice(0,1000),
   reference:'https://cyberpunktcg.com/cards/jackie-welles-pour-one-out-for-me'})}
 }
 const play=async(g,id)=>g.emit('cardPlayed',{p:0,def:CARDS[id],inst:g.newInst(id,0)});
 await test('jackie-first-blue-unit-decrease-two-and-draw-if-min',async()=>{
  const {g,p,die}=build(3),initialHand=p.hand.length;
  g.pickOne=async(i,title,options)=>title.startsWith('Jackie :')
   ?options.find(x=>x.value===die.uid+':1')?.value??null:null;
  await play(g,'delamain-cab');
  assert.equal(die.value,1);
  assert.equal(p.hand.length,initialHand+1);
  assert.equal(p.tf.jackieBlue,true);
 });
 await test('jackie-first-blue-gear-is-eligible',async()=>{
  const {g,p,die}=build(4);
  g.pickOne=async(i,title,options)=>title.startsWith('Jackie :')
   ?options.find(x=>x.value===die.uid+':2')?.value??null:null;
  await play(g,'tetratronic-rippler');
  assert.equal(die.value,2);assert.equal(p.tf.jackieBlue,true);
 });
 await test('jackie-optional-refusal-does-not-adjust-or-draw',async()=>{
  const {g,p,die}=build(3),hand=p.hand.length;
  g.pickOne=async()=>null;
  await play(g,'delamain-cab');
  assert.equal(die.value,3);assert.equal(p.hand.length,hand);
  assert.equal(p.tf.jackieBlue,true);
 });
 await test('jackie-first-blue-play-consumes-once-per-turn-even-on-refusal',async()=>{
  const {g,p,die}=build(4);
  let requests=0;
  g.pickOne=async(i,title,options)=>{if(title.startsWith('Jackie :'))requests++;return null};
  await play(g,'delamain-cab');
  await play(g,'tetratronic-rippler');
  assert.equal(requests,1);assert.equal(die.value,4);
  assert.equal(p.tf.jackieBlue,true);
 });
 await test('jackie-non-blue-unit-does-not-consume-trigger',async()=>{
  const {g,p,die}=build(3);
  g.pickOne=async(i,title,options)=>title.startsWith('Jackie :')
   ?options.find(x=>x.value===die.uid+':1')?.value??null:null;
  await play(g,'animals-wrecker');
  assert.equal(die.value,3);assert.equal(!!p.tf.jackieBlue,false);
  await play(g,'delamain-cab');
  assert.equal(die.value,1);assert.equal(p.tf.jackieBlue,true);
 });
 return {count:out.length,passed:out.filter(x=>x.status==='PASS').length,
  failed:out.filter(x=>x.status==='FAIL').length,tests:out};
};
