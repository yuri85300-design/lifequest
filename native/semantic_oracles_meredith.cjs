'use strict';
/** Independent partial official clauses: Meredith Stout — Stone Cold Corpo.
 * Source: https://cyberpunktcg.com/cards/meredith-stout-stone-cold-corpo
 */
module.exports=async function runMeredith(api,assert){
 const {Game,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const build=()=>{
  const g=Game.create([ds['embracing-power'],ds['the-heist']],
   [FastPolicy,FastPolicy],{seed:6441,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;
  const p=g.P(0),q=g.P(1),u=g.newInst('meredith-stout-stone-cold-corpo',0);
  p.field=[u];p.gigs=[{uid:64410,value:2,sides:6}];
  q.gigs=[{uid:64411,value:1,sides:6}];
  return {g,p,q,u};
 };
 async function test(clause,fn){
  try{await fn();tests.push({id:'meredith-stout-stone-cold-corpo',clause,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/meredith-stout-stone-cold-corpo'})}
  catch(e){tests.push({id:'meredith-stout-stone-cold-corpo',clause,status:'FAIL',
   error:String(e.stack||e).slice(0,1000),
   reference:'https://cyberpunktcg.com/cards/meredith-stout-stone-cold-corpo'})}
 }
 await test('meredith-plus-two-power-only-in-fight-versus-legend',async()=>{
  const {g,u}=build(),legend=g.newInst('jackie-welles-pour-one-out-for-me',1);
  const base=g.eff(u);
  assert.equal(g.eff(u,{fight:true,vs:legend}),base+2);
  assert.equal(g.eff(u),base);
 });
 await test('meredith-fighting-rival-unit-does-not-gain-two-power',async()=>{
  const {g,u}=build(),enemy=g.newInst('corpo-security',1);
  const base=g.eff(u);
  assert.equal(g.eff(u,{fight:true,vs:enemy}),base);
 });
 await test('meredith-rival-adjusts-friendly-gig-recovers-one-trash-card',async()=>{
  const {g,p}=build(),card=g.newInst('mantis-blades',0);
  p.trash=[card];const die=p.gigs[0];
  g.pickCards=async(i,title,pool)=>pool.slice(0,1);
  const changed=await g.setGig(die,3,1);
  assert.equal(changed,true);
  assert.equal(p.hand.includes(card),true);
  assert.equal(p.trash.includes(card),false);
 });
 await test('meredith-friendly-adjustment-does-not-recover-trash',async()=>{
  const {g,p}=build(),card=g.newInst('mantis-blades',0);
  p.trash=[card];const die=p.gigs[0];
  g.pickCards=async(i,title,pool)=>pool.slice(0,1);
  await g.setGig(die,3,0);
  assert.equal(p.trash.includes(card),true);
  assert.equal(p.hand.includes(card),false);
 });
 await test('meredith-rival-adjustment-recovery-is-optional',async()=>{
  const {g,p}=build(),card=g.newInst('mantis-blades',0);
  p.trash=[card];
  g.pickCards=async()=>[];
  await g.setGig(p.gigs[0],3,1);
  assert.equal(p.trash.includes(card),true);
  assert.equal(p.hand.includes(card),false);
 });
 return {count:tests.length,passed:tests.filter(t=>t.status==='PASS').length,
  failed:tests.filter(t=>t.status==='FAIL').length,tests};
};
