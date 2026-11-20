'use strict';
/* Independent partial publisher-text witness for Augmented Negotiators.
 * https://cyberpunktcg.com/cards/augmented-negotiators
 */
module.exports=async function runNegotiators(api,assert){
 const {Game,presetDecks,FastPolicy}=api,ds=presetDecks(),out=[];
 const build=()=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
   [FastPolicy,FastPolicy],{seed:2640,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;
  const blocker=g.newInst('augmented-negotiators',0);
  g.P(0).field=[blocker];
  const r=g.P(1);
  r.hand=[g.newInst('animals-wrecker',1),g.newInst('corpo-security',1)];
  return {g,blocker,r};
 };
 async function test(clause,fn){
  try{await fn();out.push({id:'augmented-negotiators',clause,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/augmented-negotiators'})}
  catch(e){out.push({id:'augmented-negotiators',clause,status:'FAIL',
   error:String(e.stack||e).slice(0,950),
   reference:'https://cyberpunktcg.com/cards/augmented-negotiators'})}
 }
 await test('negotiators-blocker-trigger-discards-exactly-one-rival-card',async()=>{
  const {g,blocker,r}=build(),before=r.hand.length,trash=r.trash.length;
  await g.emit('blocked',{blocker});
  assert.equal(r.hand.length,before-1);
  assert.equal(r.trash.length,trash+1);
 });
 await test('negotiators-unrelated-blocker-does-not-discard',async()=>{
  const {g,r}=build(),other=g.newInst('corpo-security',0);
  g.P(0).field.push(other);
  const before=r.hand.length;
  await g.emit('blocked',{blocker:other});
  assert.equal(r.hand.length,before);
 });
 await test('negotiators-empty-rival-hand-cannot-conjure-discard',async()=>{
  const {g,blocker,r}=build();r.hand=[];
  await g.emit('blocked',{blocker});
  assert.equal(r.hand.length,0);assert.equal(r.trash.length,0);
 });
 return {count:out.length,passed:out.filter(x=>x.status==='PASS').length,
  failed:out.filter(x=>x.status==='FAIL').length,tests:out};
};
