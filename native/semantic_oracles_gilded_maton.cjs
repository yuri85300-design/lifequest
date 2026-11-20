'use strict';
/**
 * Independent partial publisher witnesses for Gilded Maton.
 * Exercises the actual gear-zone sacrifice and target defeat transaction.
 * Official text: https://cyberpunktcg.com/cards/gilded-mato-n
 */
module.exports=async function gildedMaton(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const make=(rival='corpo-security',withGear=true)=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
   [FastPolicy,FastPolicy],{seed:4747,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  const p=g.P(0),r=g.P(1),host=g.newInst('corpo-security',0);
  p.field=[host];r.field=[];
  const gear=withGear?g.newInst('mantis-blades',0):null;
  if(gear)host.gear.push(gear);
  const enemy=rival?g.newInst(rival,1):null;
  if(enemy)r.field.push(enemy);
  return {g,p,r,host,gear,enemy};
 };
 async function t(clause,fn){
  const id='gilded-mato-n';
  try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,1050),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 const run=async g=>CARDS['gilded-mato-n'].onPlay(g,g.newInst('gilded-mato-n',0),0);
 await t('gilded-sacrifice-gear-defeats-cost-two-rival',async()=>{
  const s=make();s.g.pickOne=async()=>s.gear.uid;s.g.pickUnit=async()=>s.enemy;
  await run(s.g);
  assert.equal(s.p.trash.includes(s.gear),true);
  assert.equal(s.host.gear.includes(s.gear),false);
  assert.equal(s.g.onField(s.enemy),false);
 });
 await t('gilded-optional-sacrifice-declined-keeps-gear-and-rival',async()=>{
  const s=make();s.g.pickOne=async()=>null;
  s.g.pickUnit=async()=>{throw Error('Cannot target rival after declined cost')};
  await run(s.g);
  assert.equal(s.host.gear.includes(s.gear),true);
  assert.equal(s.g.onField(s.enemy),true);
 });
 await t('gilded-sacrifice-remains-possible-with-no-rival-target',async()=>{
  const s=make(null);s.g.pickOne=async()=>s.gear.uid;
  await run(s.g);
  assert.equal(s.p.trash.includes(s.gear),true);
 });
 await t('gilded-cost-six-rival-ineligible-even-after-sacrifice',async()=>{
  const s=make('animals-wrecker');s.g.pickOne=async()=>s.gear.uid;
  s.g.pickUnit=async()=>{throw Error('Ineligible cost-six target was offered')};
  await run(s.g);
  assert.equal(s.p.trash.includes(s.gear),true);
  assert.equal(s.g.onField(s.enemy),true);
 });
 await t('gilded-no-friendly-gear-prevents-effect',async()=>{
  const s=make('corpo-security',false);
  s.g.pickOne=async()=>{throw Error('No gear choice should be requested')};
  await run(s.g);
  assert.equal(s.g.onField(s.enemy),true);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
