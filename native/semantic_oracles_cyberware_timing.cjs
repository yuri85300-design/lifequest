'use strict';
/**
 * Partial official-English behaviour witnesses for NetWatch Netdriver,
 * Tetratronic Rippler and Dying Night. Every case exercises the actual
 * engine event/window; these do not certify full cross-card coverage.
 */
module.exports=async function cyberwareTiming(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api;
 const ds=presetDecks(),tests=[];
 const make=()=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
    [FastPolicy,FastPolicy],{seed:20771,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;
  const p=g.P(0),host=g.newInst('corpo-security',0);
  p.field=[host];
  return {g,p,host};
 };
 const gear=(g,host,id)=>{const c=g.newInst(id,0);host.gear.push(c);return c};
 async function t(id,clause,fn){
  try{await fn();tests.push({id,clause,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',
   error:String(e.stack||e).slice(0,1100),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 await t('netwatch-netdriver','netwatch-equipped-host-spend-draws-one',async()=>{
  const {g,p,host}=make();gear(g,host,'netwatch-netdriver');
  const hand=p.hand.length,deck=p.deck.length;
  await g.spendUnit(host);
  assert.equal(p.hand.length,hand+1);assert.equal(p.deck.length,deck-1);
 });
 await t('netwatch-netdriver','netwatch-unrelated-unit-spend-does-not-draw',async()=>{
  const {g,p,host}=make();gear(g,host,'netwatch-netdriver');
  const other=g.newInst('animals-wrecker',0);p.field.push(other);
  const hand=p.hand.length;await g.spendUnit(other);
  assert.equal(p.hand.length,hand);
 });
 await t('netwatch-netdriver','netwatch-host-legend-spent-draws-one',async()=>{
  const {g,p}=make();const legend=g.newInst('v-corporate-exile',0);
  legend.faceUp=true;legend.ready=true;p.legends=[legend];gear(g,legend,'netwatch-netdriver');
  const hand=p.hand.length;
  await g.spendUnit(legend);
  assert.equal(p.hand.length,hand+1);
 });
 await t('tetratronic-rippler','tetratronic-owner-declines-top-card-trash',async()=>{
  const {g,p,host}=make();gear(g,host,'tetratronic-rippler');
  const top=p.deck[0],before=p.deck.length,trash=p.trash.length;
  g.yesNo=async()=>false;
  await g.spendUnit(host);
  assert.equal(p.deck[0],top);assert.equal(p.deck.length,before);
  assert.equal(p.trash.length,trash);
 });
 await t('tetratronic-rippler','tetratronic-owner-accepts-top-card-trash',async()=>{
  const {g,p,host}=make();gear(g,host,'tetratronic-rippler');
  const top=p.deck[0],before=p.deck.length,trash=p.trash.length;
  g.yesNo=async()=>true;
  await g.spendUnit(host);
  assert.equal(p.deck.length,before-1);assert.equal(p.trash.length,trash+1);
  assert.equal(p.trash.includes(top),true);
 });
 await t('tetratronic-rippler','tetratronic-no-deck-is-safe-no-fabricated-card',async()=>{
  const {g,p,host}=make();gear(g,host,'tetratronic-rippler');
  p.deck=[];let prompted=false;g.yesNo=async()=>{prompted=true;return true};
  await g.spendUnit(host);
  assert.equal(prompted,false);assert.equal(p.trash.length,0);
 });
 await t('tetratronic-rippler','tetratronic-other-unit-does-not-expose-top',async()=>{
  const {g,p,host}=make();gear(g,host,'tetratronic-rippler');
  const other=g.newInst('animals-wrecker',0);p.field.push(other);
  const top=p.deck[0];let prompted=false;
  g.yesNo=async()=>{prompted=true;return true};
  await g.spendUnit(other);
  assert.equal(prompted,false);assert.equal(p.deck[0],top);
 });
 await t('netwatch-netdriver','netwatch-and-tetratronic-same-host-both-triggers-resolve',async()=>{
  const {g,p,host}=make();
  gear(g,host,'netwatch-netdriver');gear(g,host,'tetratronic-rippler');
  const hand=p.hand.length,deck=p.deck.length;
  g.yesNo=async()=>false;
  await g.spendUnit(host);
  assert.equal(p.hand.length,hand+1);
  assert.equal(p.deck.length,deck-1);
 });
 await t('dying-night-v-s-pistol','dying-night-attack-reduces-selected-gig-by-two',async()=>{
  const {g,p,host}=make(),c=gear(g,host,'dying-night-v-s-pistol');
  p.gigs=[{uid:207710,value:4,sides:6}];
  g.P(1).gigs=[];
  const die=p.gigs[0];
  g.pickOne=async(i,title,opts)=>opts.find(x=>x.value===die.uid+':2')?.value??null;
  await CARDS['dying-night-v-s-pistol'].onHostAttack(g,c,host,0);
  assert.equal(die.value,2);
 });
 await t('dying-night-v-s-pistol','dying-night-attack-optional-adjustment-may-be-declined',async()=>{
  const {g,p,host}=make(),c=gear(g,host,'dying-night-v-s-pistol');
  p.gigs=[{uid:207711,value:4,sides:6}];g.P(1).gigs=[];
  g.pickOne=async()=>null;
  await CARDS['dying-night-v-s-pistol'].onHostAttack(g,c,host,0);
  assert.equal(p.gigs[0].value,4);
 });
 await t('dying-night-v-s-pistol','dying-night-on-V-end-turn-readies-two-eddies',async()=>{
  const {g,p}=make(),v=g.newInst('v-corporate-exile',0);
  v.faceUp=true;p.legends=[v];gear(g,v,'dying-night-v-s-pistol');
  p.eddies=[{uid:207715,ready:false},{uid:207716,ready:false},{uid:207717,ready:false}];
  await g.emit('turnEnd',{p:0});
  assert.equal(p.eddies.filter(x=>x.ready).length,2);
 });
 await t('dying-night-v-s-pistol','dying-night-non-V-host-no-end-turn-refund',async()=>{
  const {g,p,host}=make();gear(g,host,'dying-night-v-s-pistol');
  p.eddies=[{uid:207718,ready:false},{uid:207719,ready:false}];
  await g.emit('turnEnd',{p:0});
  assert.equal(p.eddies.filter(x=>x.ready).length,0);
 });
 await t('dying-night-v-s-pistol','dying-night-V-host-does-not-ready-on-rival-turn',async()=>{
  const {g,p}=make(),v=g.newInst('v-corporate-exile',0);
  v.faceUp=true;p.legends=[v];gear(g,v,'dying-night-v-s-pistol');
  p.eddies=[{uid:207720,ready:false},{uid:207721,ready:false}];
  await g.emit('turnEnd',{p:1});
  assert.equal(p.eddies.filter(x=>x.ready).length,0);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
