'use strict';
/**
 * Source-bound partial branch tests for Arasaka Emergency Radioport.
 * Publisher text: https://cyberpunktcg.com/cards/arasaka-emergency-radioport
 * These do not certify interactions with all other cards.
 */
module.exports=async function verifyRadioport(api,assert){
 const {Game,presetDecks,FastPolicy}=api;
 const decks=presetDecks(),tests=[];
 const make=(legendId='hanako-arasaka-daughter-of-the-emperor')=>{
  const g=Game.create([decks['the-heist'],decks['embracing-power']],
   [FastPolicy,FastPolicy],{seed:2306,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  const p=g.P(0),host=g.newInst('corpo-security',0);
  const gear=g.newInst('arasaka-emergency-radioport',0);
  const legend=g.newInst(legendId,0);
  host.gear=[gear];p.field=[host];legend.faceUp=false;p.legends=[legend];
  return {g,p,host,legend,gear};
 };
 async function test(name,fn){
  try{await fn();tests.push({id:'arasaka-emergency-radioport',clause:name,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/arasaka-emergency-radioport'})}
  catch(e){tests.push({id:'arasaka-emergency-radioport',clause:name,status:'FAIL',
   error:String(e.stack||e).slice(0,950),
   reference:'https://cyberpunktcg.com/cards/arasaka-emergency-radioport'})}
 }
 await test('radioport-spent-host-optional-decline-hides-legend',async()=>{
  const {g,host,legend}=make();let calls=0,peeks=0;
  g.yesNo=async()=>false;
  g.pickFaceDownLegend=async()=>{peeks++;return legend};
  g.callFree=async()=>{calls++};
  assert.equal(await g.spendUnit(host),true);
  assert.equal(peeks,0);assert.equal(calls,0);assert.equal(legend.faceUp,false);
 });
 await test('radioport-qualifying-arasaka-legend-offers-free-call',async()=>{
  const {g,host,legend}=make();let calls=0,calledUid=null;
  g.yesNo=async()=>true;
  g.pickFaceDownLegend=async()=>legend;
  g.callFree=async(i,l)=>{calls++;calledUid=l.uid};
  await g.spendUnit(host);
  assert.equal(calls,1);assert.equal(calledUid,legend.uid);
  assert.equal(legend.known,true,'Look may reveal only selected legend to its owner');
 });
 await test('radioport-ineligible-legend-cannot-be-called',async()=>{
  const {g,host,legend}=make('evelyn-parker-beautiful-enigma');let calls=0;
  g.yesNo=async()=>true;g.pickFaceDownLegend=async()=>legend;
  g.callFree=async()=>{calls++};
  await g.spendUnit(host);
  assert.equal(calls,0);assert.equal(legend.faceUp,false);
  assert.equal(legend.known,true);
 });
 await test('radioport-existing-call-blocks-another-call',async()=>{
  const {g,p,host,legend}=make();p.calledThisTurn=true;
  let prompts=0,peeks=0,calls=0;
  g.yesNo=async()=>{prompts++;return true};
  g.pickFaceDownLegend=async()=>{peeks++;return legend};
  g.callFree=async()=>{calls++};
  await g.spendUnit(host);
  assert.equal(prompts,1,'Player may still choose to look after earlier Call');
  assert.equal(peeks,1,'Looking is separate from once-per-turn Call limit');
  assert.equal(legend.known,true);
  assert.equal(calls,0,'Second Call remains forbidden');
 });
 await test('radioport-unrelated-unit-spent-does-not-trigger',async()=>{
  const {g,p}=make();const other=g.newInst('animals-wrecker',0);
  p.field.push(other);let prompts=0;
  g.yesNo=async()=>{prompts++;return true};
  await g.spendUnit(other);
  assert.equal(prompts,0);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
