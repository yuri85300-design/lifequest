'use strict';
/** Partial publisher-bound conditions and power boundary for Minotaur.
 * https://cyberpunktcg.com/cards/minotaur
 */
module.exports=async function runMinotaur(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,ds=presetDecks(),tests=[];
 const make=(own=6,rival=1)=>{
  const g=Game.create([ds['embracing-power'],ds['the-heist']],
   [FastPolicy,FastPolicy],{seed:5336,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;
  g.P(0).gigs=[{uid:53360,value:own,sides:8}];
  g.P(1).gigs=[{uid:53361,value:rival,sides:8}];
  g.P(1).field=[];
  return g;
 };
 const place=(g,id)=>{const u=g.newInst(id,1);g.P(1).field.push(u);return u};
 async function test(clause,fn){
  try{await fn();tests.push({id:'minotaur',clause,status:'PASS',
   reference:'https://cyberpunktcg.com/cards/minotaur'})}
  catch(e){tests.push({id:'minotaur',clause,status:'FAIL',
   error:String(e.stack||e).slice(0,950),
   reference:'https://cyberpunktcg.com/cards/minotaur'})}
 }
 const play=async g=>CARDS.minotaur.onPlay(g,g.newInst('minotaur',0),0);
 await test('minotaur-no-higher-street-cred-no-defeat',async()=>{
  const g=make(1,6),enemy=place(g,'corpo-security');
  await play(g);assert.equal(g.onField(enemy),true);
 });
 await test('minotaur-equal-street-cred-no-defeat',async()=>{
  const g=make(4,4),enemy=place(g,'corpo-security');
  await play(g);assert.equal(g.onField(enemy),true);
 });
 await test('minotaur-higher-cred-defeats-five-power-target',async()=>{
  const g=make(),enemy=place(g,'meredith-stout-stone-cold-corpo');
  await play(g);assert.equal(g.onField(enemy),false);
 });
 await test('minotaur-higher-cred-cannot-defeat-power-above-five',async()=>{
  const g=make(),enemy=place(g,'animals-wrecker');
  await play(g);assert.equal(g.onField(enemy),true);
 });
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,
  failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
