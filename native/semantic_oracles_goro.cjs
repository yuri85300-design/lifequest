'use strict';
/** Partial independent official English witnesses for Goro Takemura: Vengeful Bodyguard.
 * https://cyberpunktcg.com/cards/goro-takemura-vengeful-bodyguard
 */
module.exports=async function runGoro(api,assert){
 const {Game,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const build=(values=[1,2])=>{
  const g=Game.create([ds['embracing-power'],ds['the-heist']],
   [FastPolicy,FastPolicy],{seed:6680,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;
  const p=g.P(0),legend=g.newInst('goro-takemura-vengeful-bodyguard',0);
  legend.faceUp=true;legend.ready=true;p.legends=[legend];
  p.eddies=[{uid:66801,ready:true},{uid:66802,ready:true},{uid:66803,ready:true}];
  p.gigs=values.map((value,j)=>({uid:66810+j,value,sides:6}));
  return {g,p,legend};
 };
 async function t(clause,fn){
  try{await fn();tests.push({id:'goro-takemura-vengeful-bodyguard',clause,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/goro-takemura-vengeful-bodyguard'})}
  catch(e){tests.push({id:'goro-takemura-vengeful-bodyguard',clause,status:'FAIL',
   error:String(e.stack||e).slice(0,950),
   reference:'https://cyberpunktcg.com/cards/goro-takemura-vengeful-bodyguard'})}
 }
 await t('goro-spend-one-eddie-grants-blocker-no-pair-no-bonus',async()=>{
  const {g,p,legend}=build([1,2]),u=g.newInst('corpo-security',0);
  p.field=[u];g.pickUnit=async()=>u;
  const before=g.eff(u);
  await g.activate(0,legend.uid,0);
  assert.equal(g.hasKw(u,'BLOCKER'),true);
  assert.equal(g.eff(u),before);
  assert.equal(legend.ready,false);
  assert.equal(p.eddies.filter(x=>x.ready).length,2);
 });
 await t('goro-friendly-value-pair-adds-one-power-to-blocker',async()=>{
  const {g,p,legend}=build([2,2]),u=g.newInst('corpo-security',0);
  p.field=[u];g.pickUnit=async()=>u;const before=g.eff(u);
  await g.activate(0,legend.uid,0);
  assert.equal(g.hasKw(u,'BLOCKER'),true);
  assert.equal(g.eff(u),before+1);
 });
 await t('goro-only-cost-five-plus-no-legal-activation',async()=>{
  const {g,p,legend}=build([2,2]);p.field=[g.newInst('animals-wrecker',0)];
  assert.equal(g.legalActions(0).some(a=>a.type==='activate'&&a.uid===legend.uid),false);
 });
 await t('goro-friendly-blocker-accept-discard-one-and-draw-one',async()=>{
  const {g,p}=build(),u=g.newInst('corpo-security',0),
   card=g.newInst('mantis-blades',0);
  p.field=[u];p.hand=[card];const deck=p.deck.length;
  g.yesNo=async()=>true;g.pickCards=async(i,title,options)=>options.slice(0,1);
  await g.emit('blocked',{p:0,blocker:u});
  assert.equal(p.trash.includes(card),true);
  assert.equal(p.deck.length,deck-1);
  assert.equal(p.hand.length,1);
 });
 await t('goro-friendly-blocker-decline-preserves-hand-and-deck',async()=>{
  const {g,p}=build(),u=g.newInst('corpo-security',0),card=g.newInst('mantis-blades',0);
  p.field=[u];p.hand=[card];const deck=p.deck.length;
  g.yesNo=async()=>false;
  await g.emit('blocked',{p:0,blocker:u});
  assert.equal(p.hand.includes(card),true);
  assert.equal(p.deck.length,deck);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
