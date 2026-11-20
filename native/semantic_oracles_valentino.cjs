'use strict';
/** Partial publisher-bound Valentino Street Racer on-play Adrenaline witnesses.
 * https://cyberpunktcg.com/cards/valentino-street-racer
 */
module.exports=async function runValentino(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const build=()=>{
  const g=Game.create([ds['embracing-power'],ds['the-heist']],
   [FastPolicy,FastPolicy],{seed:6492,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;
  const self=g.newInst('valentino-street-racer',0);
  g.P(0).field=[self];
  return {g,self,p:g.P(0)};
 };
 async function t(clause,fn){
  try{await fn();tests.push({id:'valentino-street-racer',clause,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/valentino-street-racer'})}
  catch(e){tests.push({id:'valentino-street-racer',clause,status:'FAIL',
   error:String(e.stack||e).slice(0,950),
   reference:'https://cyberpunktcg.com/cards/valentino-street-racer'})}
 }
 const play=({g,self})=>CARDS['valentino-street-racer'].onPlay(g,self,0);
 await t('valentino-another-friendly-unit-cost-five-gains-adrenaline',async()=>{
  const s=build(),target=s.g.newInst('screw-lovelorn-fool',0);
  s.p.field.push(target);s.g.pickUnit=async()=>target;
  await play(s);
  assert.equal(s.g.hasKw(target,'ADRENALINE'),true);
  assert.equal(s.g.hasKw(s.self,'ADRENALINE'),false);
 });
 await t('valentino-no-other-friendly-unit-cannot-grant-to-self',async()=>{
  const s=build();
  await play(s);
  assert.equal(s.g.hasKw(s.self,'ADRENALINE'),false);
 });
 await t('valentino-cost-six-other-unit-excluded',async()=>{
  const s=build(),target=s.g.newInst('animals-wrecker',0);
  s.p.field.push(target);let picks=0;
  s.g.pickUnit=async()=>{picks++;return null};
  await play(s);
  assert.equal(s.g.hasKw(target,'ADRENALINE'),false);
  assert.equal(picks,1);
 });
 await t('valentino-adrenaline-grant-expires-at-turn-end',async()=>{
  const s=build(),target=s.g.newInst('corpo-security',0);
  s.p.field.push(target);s.g.pickUnit=async()=>target;
  await play(s);
  assert.equal(s.g.hasKw(target,'ADRENALINE'),true);
  await s.g.endTurn();
  assert.equal(s.g.hasKw(target,'ADRENALINE'),false);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
