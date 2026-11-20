'use strict';
/**
 * Partial publisher-bound independent tests for replacement/prevention,
 * combat-only modifiers, and multi-choice MERC readying. No global
 * semantic certification is implied.
 */
module.exports=async function highRiskOracles(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const build=()=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
   [FastPolicy,FastPolicy],{seed:55608,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  return {g,p:g.P(0)};
 };
 async function t(id,clause,fn){
  try{await fn();tests.push({id,clause,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',
   error:String(e.stack||e).slice(0,1050),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 const D='deadman-transmitter';
 await t(D,'deadman-host-defeat-prevented-gear-destroyed-instead',async()=>{
  const {g,p}=build(),host=g.newInst('animals-wrecker',0),
   gear=g.newInst(D,0);
  p.field=[host];host.gear=[gear];
  const prevented=await g.defeat(host,{effect:true});
  assert.equal(prevented,false);assert.equal(g.onField(host),true);
  assert.equal(host.gear.includes(gear),false);
  assert.equal(p.trash.includes(gear),true);
 });
 await t(D,'deadman-second-defeat-without-gear-defeats-host',async()=>{
  const {g,p}=build(),host=g.newInst('animals-wrecker',0),
   gear=g.newInst(D,0);
  p.field=[host];host.gear=[gear];
  await g.defeat(host,{effect:true});
  const second=await g.defeat(host,{effect:true});
  assert.equal(second,true);assert.equal(g.onField(host),false);
  assert.equal(p.trash.includes(host),true);
 });
 await t(D,'deadman-on-different-host-does-not-prevent-defeat',async()=>{
  const {g,p}=build(),protectedHost=g.newInst('animals-wrecker',0),
   target=g.newInst('corpo-security',0);
  protectedHost.gear=[g.newInst(D,0)];p.field=[protectedHost,target];
  await g.defeat(target,{effect:true});
  assert.equal(g.onField(target),false);
  assert.equal(protectedHost.gear.length,1);
 });
 const S='synapse-burnout';
 await t(S,'synapse-burnout-no-friendly-unit-cannot-play',async()=>{
  const {g,p}=build();p.field=[];
  assert.equal(CARDS[S].canPlay(g,0),false);
 });
 await t(S,'synapse-burnout-two-faceup-legends-add-two-only-rival-fight',async()=>{
  const {g,p}=build(),unit=g.newInst('animals-wrecker',0),
   foe=g.newInst('corpo-security',1),
   l1=g.newInst('v-corporate-exile',0),
   l2=g.newInst('jackie-welles-pour-one-out-for-me',0);
  p.field=[unit];g.P(1).field=[foe];
  l1.faceUp=true;l2.faceUp=true;p.legends=[l1,l2];
  g.pickUnit=async()=>unit;
  const base=g.eff(unit);
  await CARDS[S].onPlay(g,g.newInst(S,0),0);
  assert.equal(g.eff(unit),base,'No global power boost');
  assert.equal(g.eff(unit,{fight:true,vs:foe}),base+2);
  assert.equal(g.eff(unit,{fight:true,vs:l1}),base,'Friendly combat not boosted');
 });
 await t(S,'synapse-burnout-no-faceup-legends-zero-bonus',async()=>{
  const {g,p}=build(),unit=g.newInst('animals-wrecker',0),
   foe=g.newInst('corpo-security',1);
  p.field=[unit];g.P(1).field=[foe];p.legends=[];
  g.pickUnit=async()=>unit;const base=g.eff(unit);
  await CARDS[S].onPlay(g,g.newInst(S,0),0);
  assert.equal(g.eff(unit,{fight:true,vs:foe}),base);
 });
 await t(S,'synapse-burnout-buff-expires-after-current-turn',async()=>{
  const {g,p}=build(),unit=g.newInst('animals-wrecker',0),
   foe=g.newInst('corpo-security',1),
   l=g.newInst('v-corporate-exile',0);
  l.faceUp=true;p.legends=[l];p.field=[unit];g.P(1).field=[foe];
  g.pickUnit=async()=>unit;const base=g.eff(unit,{fight:true,vs:foe});
  await CARDS[S].onPlay(g,g.newInst(S,0),0);
  assert.equal(g.eff(unit,{fight:true,vs:foe}),base+1);
  await g.endTurn();
  assert.equal(g.eff(unit,{fight:true,vs:foe}),base);
 });
 const P='pepe-najarro-working-doubles';
 const pep=(values=[2,2])=>{
  const s=build(),p=s.p;
  p.gigs=values.map((value,k)=>({uid:55620+k,value,sides:6}));
  const a=s.g.newInst('v-corporate-exile',0),
   b=s.g.newInst('jackie-welles-pour-one-out-for-me',0),
   other=s.g.newInst('goro-takemura-vengeful-bodyguard',0);
  for(const l of [a,b,other]){l.faceUp=true;l.ready=false;}
  p.legends=[a,b,other];return {...s,a,b,other};
 };
 await t(P,'pepe-matched-gig-values-ready-up-to-two-merc-legends',async()=>{
  const s=pep();let offered=0,max=0;
  s.g.pickCards=async(i,title,pool,min,n)=>{offered=pool.length;max=n;return pool.slice(0,n);};
  await CARDS[P].onAttack(s.g,s.g.newInst(P,0),0);
  assert.equal(offered,2);assert.equal(max,2);
  assert.equal(s.a.ready,true);assert.equal(s.b.ready,true);
  assert.equal(s.other.ready,false);
 });
 await t(P,'pepe-no-gig-value-pair-no-legend-ready',async()=>{
  const s=pep([1,2]);let choices=0;
  s.g.pickCards=async()=>{choices++;return []};
  await CARDS[P].onAttack(s.g,s.g.newInst(P,0),0);
  assert.equal(choices,0);assert.equal(s.a.ready,false);
  assert.equal(s.b.ready,false);
 });
 await t(P,'pepe-optional-decline-does-not-ready-any-legend',async()=>{
  const s=pep();s.g.pickCards=async()=>[];
  await CARDS[P].onAttack(s.g,s.g.newInst(P,0),0);
  assert.equal(s.a.ready,false);assert.equal(s.b.ready,false);
 });
 await t(P,'pepe-already-ready-merc-excluded-from-choice',async()=>{
  const s=pep();s.a.ready=true;
  s.g.pickCards=async(i,title,pool)=>{assert.equal(pool.includes(s.a),false);return pool.slice(0,1);};
  await CARDS[P].onAttack(s.g,s.g.newInst(P,0),0);
  assert.equal(s.b.ready,true);
  assert.equal(s.other.ready,false);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
