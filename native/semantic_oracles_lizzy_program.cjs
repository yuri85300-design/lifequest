'use strict';
/**
 * Publisher-English partial on-play and zone-transfer witnesses for Lizzy
 * Wizzy: Delicate Weapon. These execute the real Game.playCard transaction,
 * including the bottom-of-deck after-play replacement.
 */
module.exports=async function lizzyPrograms(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const build=()=>{
  const g=Game.create([ds['the-heist'],ds['embracing-power']],
   [FastPolicy,FastPolicy],{seed:27005,hooks:{sim:true}});
  g.s.active=0;g.s.phase='main';
  const p=g.P(0);p.gigs=[];
  const lizzy=g.newInst('lizzy-wizzy-delicate-weapon',0);
  p.field=[lizzy];
  return {g,p,lizzy};
 };
 async function t(clause,fn){
  const id='lizzy-wizzy-delicate-weapon';
  try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id});}
  catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,1050),
   reference:'https://cyberpunktcg.com/cards/'+id});}
 }
 const fire=s=>CARDS['lizzy-wizzy-delicate-weapon'].onPlay(s.g,s.lizzy,0);
 await t('lizzy-plays-eligible-program-free-from-hand-bottoms-it',async()=>{
  const s=build(),card=s.g.newInst('trust-no-one',0),size=s.p.deck.length;
  s.p.hand=[card];s.g.pickCards=async(i,title,pool)=>[pool[0]];
  await fire(s);
  assert.equal(s.p.hand.includes(card),false);
  assert.equal(s.p.deck.length,size+1);
  assert.equal(s.p.deck.at(-1),card);
  assert.equal(s.p.tf.playedProgram,true);
 });
 await t('lizzy-plays-eligible-program-free-from-trash-bottoms-it',async()=>{
  const s=build(),card=s.g.newInst('trust-no-one',0);
  s.p.hand=[];s.p.trash=[card];s.g.pickCards=async(i,title,pool)=>[pool[0]];
  await fire(s);
  assert.equal(s.p.trash.includes(card),false);
  assert.equal(s.p.deck.at(-1),card);
  assert.equal(s.p.tf.playedProgram,true);
 });
 await t('lizzy-optional-decline-does-not-move-program',async()=>{
  const s=build(),card=s.g.newInst('trust-no-one',0);
  s.p.hand=[card];const size=s.p.deck.length;
  s.g.pickCards=async()=>[];
  await fire(s);
  assert.equal(s.p.hand.includes(card),true);
  assert.equal(s.p.deck.length,size);
  assert.equal(s.p.tf.playedProgram,false);
 });
 await t('lizzy-filters-cost-over-three-from-all-source-zones',async()=>{
  const s=build(),eligible=s.g.newInst('trust-no-one',0),
   expensive=s.g.newInst('gunpoint-diplomacy',0);
  s.p.hand=[eligible,expensive];s.p.trash=[s.g.newInst('gunpoint-diplomacy',0)];
  s.g.pickCards=async(i,title,pool)=>{
   assert.equal(pool.length,1);assert.equal(pool[0],eligible);
   return [];
  };
  await fire(s);
  assert.equal(s.p.hand.includes(expensive),true);
  assert.equal(s.p.trash.length,1);
 });
 await t('lizzy-without-eligible-program-does-not-fabricate-play',async()=>{
  const s=build(),expensive=s.g.newInst('gunpoint-diplomacy',0);
  s.p.hand=[expensive];s.p.trash=[];
  s.g.pickCards=async()=>{throw Error('No eligible Program should be offered')};
  await fire(s);
  assert.equal(s.p.hand.includes(expensive),true);
  assert.equal(s.p.tf.playedProgram,false);
 });
 await t('lizzy-has-printed-blocker',async()=>{
  const s=build();
  assert.equal(s.g.hasKw(s.lizzy,'BLOCKER'),true);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
