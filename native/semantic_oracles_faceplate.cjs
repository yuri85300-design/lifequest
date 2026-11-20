'use strict';
/**
 * Independent partial clause/interaction witnesses for Zetatech Faceplate,
 * grounded in https://cyberpunktcg.com/cards/zetatech-faceplate.
 * These do NOT establish full 150-card semantic certification.
 */
module.exports=async function runFaceplate(api,assert){
 const {Game,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const build=(values=[1,2,3])=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
    [FastPolicy,FastPolicy],{seed:6701,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  const p=g.P(0),host=g.newInst('animals-wrecker',0),
   gear=g.newInst('zetatech-faceplate',0);
  host.gear=[gear];p.field=[host];
  p.gigs=values.map((value,index)=>({uid:67010+index,value,sides:6}));
  return {g,p,host,gear};
 };
 async function t(clause,fn){
  try{await fn();tests.push({id:'zetatech-faceplate',clause,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/zetatech-faceplate'})}
  catch(e){tests.push({id:'zetatech-faceplate',clause,status:'FAIL',
   error:String(e.stack||e).slice(0,1000),
   reference:'https://cyberpunktcg.com/cards/zetatech-faceplate'})}
 }
 await t('faceplate-spent-host-adjusts-up-to-one',async()=>{
  const {g,p,host}=build([2]);
  const die=p.gigs[0];const before=p.hand.length;
  g.pickOne=async(i,title,options)=>options.find(x=>x.value===die.uid+':3')?.value??null;
  await g.spendUnit(host);
  assert.equal(die.value,3);assert.equal(p.hand.length,before);
 });
 await t('faceplate-three-distinct-gigs-draw-even-if-adjustment-declined',async()=>{
  const {g,p,host}=build([1,2,3]);const before=p.hand.length;
  g.pickOne=async()=>null;
  await g.spendUnit(host);
  assert.deepEqual(p.gigs.map(x=>x.value),[1,2,3]);
  assert.equal(p.hand.length,before+1);
 });
 await t('faceplate-two-distinct-gig-values-no-draw',async()=>{
  const {g,p,host}=build([1,1,2]);const before=p.hand.length;
  g.pickOne=async()=>null;
  await g.spendUnit(host);
  assert.equal(p.hand.length,before);
 });
 await t('faceplate-unrelated-unit-spend-does-not-trigger',async()=>{
  const {g,p}=build([1,2,3]),other=g.newInst('corpo-security',0);
  p.field.push(other);const before=p.hand.length;
  g.pickOne=async()=>null;
  await g.spendUnit(other);
  assert.equal(p.hand.length,before);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
   failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
