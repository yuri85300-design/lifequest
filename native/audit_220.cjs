'use strict';
/* PRIME 2.2.0: independent checks for official CR 11.11.3 and 11.15.1.2
 * plus 150x150 pairwise runtime invariants and 1000 simulated games.
 * The integration checks are not exhaustive semantic certification.
 */
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),path=require('path');
const context={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
context.window=context;context.globalThis=context;vm.createContext(context);
const engine=process.env.PRIME_ENGINE_PATH || path.join(__dirname,'engine.js');
vm.runInContext(fs.readFileSync(engine,'utf8')+'\nglobalThis.PRIME_AUDIT={Game,GameOver,CARDS,presetDecks,FastPolicy};',context);
const {Game,GameOver,CARDS,presetDecks,FastPolicy}=context.PRIME_AUDIT;
const presets=presetDecks(),deckNames=Object.keys(presets),ids=Object.keys(CARDS);
const newGame=(seed=17)=>Game.create([presets['the-heist'],presets['embracing-power']],[FastPolicy,FastPolicy],{seed,hooks:{sim:true}});
const report={version:'2.3.0',officialCertified:false,officialComparison:'NOT_EXECUTED',semantics:[],perCard:{},pairs:{total:0,pass:0,fail:0,gameovers:0,errors:[]},selfplay:{total:1000,completed:0,incomplete:0,errors:[],illegal:0}};
for(const id of ids) report.perCard[id]={exercised:0,pass:0,fail:0};
async function test(name,fn){
 try{await fn();report.semantics.push({name,status:'PASS'})}
 catch(e){report.semantics.push({name,status:'FAIL',error:String(e.stack||e).slice(0,650)})}
}
function invariant(g){
 for(const i of [0,1]){
  const p=g.P(i);const seen=new Set();
  for(const c of [...p.deck,...p.hand,...p.field,...p.trash,...p.removed,...p.legends,...p.field.flatMap(x=>x.gear),...p.legends.flatMap(x=>x.gear)]){
   assert(!seen.has(c.uid),'duplicated UID '+c.uid);seen.add(c.uid);
  }
  for(const c of p.deck)assert.equal(c.owner,i,'deck owner mismatch');
 }
 const dice=[...g.P(0).gigs,...g.P(1).gigs];assert.equal(new Set(dice.map(x=>x.uid)).size,dice.length);
}
async function play(g,id,i){
 const d=CARDS[id],p=g.P(i),c=g.newInst(id,i);
 if(!p.field.length)p.field.push(g.newInst(i===0?'6th-street-recruits':'animals-wrecker',i));
 if(d.type==='Legend'){
  c.faceUp=false;p.legends=[c];
  await g.withTimingWindow(()=>g.callLegend(i,true));
 }else{
  p.hand.unshift(c);
  await g.withTimingWindow(()=>g.playCard(i,c.uid,p.field[0].uid,{free:true}));
 }
}
(async()=>{
 await test('11.11.3: Viktor plus Zetatech min cost 1',()=>{
  const g=newGame(),p=g.P(0);p.legends.forEach(l=>l.faceUp=true);
  const v=g.newInst('viktor-vektor-drop-your-illusions',0);p.field.push(v);
  const z=g.newInst('zetatech-berserk',0);
  assert.equal(g.costOf(z,0),1);
 });
 await test('11.11.4: explicit free play stays free',async()=>{
  const g=newGame(),p=g.P(0);p.legends.forEach(l=>l.faceUp=true);
  const v=g.newInst('viktor-vektor-drop-your-illusions',0);p.field.push(v);
  const z=g.newInst('zetatech-berserk',0);p.hand.push(z);
  await g.withTimingWindow(()=>g.playCard(0,z.uid,v.uid,{free:true}));
  assert(v.gear.includes(z));
 });
 await test('11.15.1.2: bottom deck owner across both players',()=>{
  const g=newGame(),own=g.newInst('6th-street-recruits',0),other=g.newInst('animals-wrecker',1);
  g.bottomDeck(0,[own,other]);
  assert(g.P(0).deck.includes(own));assert(g.P(1).deck.includes(other));
  assert(!g.P(0).deck.includes(other));
 });
 await test('11.15: clear temporary state when bottom-decking',()=>{
  const g=newGame(),a=g.newInst('6th-street-recruits',0);
  a.mods.push({power:3});a.grants.push({kw:'BLOCKER'});a.lag=true;a.flags.temporary=true;
  g.bottomDeck(0,[a]);assert.equal(a.mods.length,0);
  assert.equal(a.grants.length,0);assert.equal(a.lag,false);
  assert.equal(Object.keys(a.flags).length,0);
 });
 await test('Les Elemens: rival Unit to rival deck',async()=>{
  const g=newGame(),enemy=g.newInst('animals-wrecker',1);
  g.P(1).field.push(enemy);
  await g.bottomDeckUnit(enemy);
  assert(g.P(1).deck.includes(enemy));assert(!g.P(0).deck.includes(enemy));
 });
 for(let n=0;n<ids.length;n++)for(let k=0;k<ids.length;k++){
  const id=ids[n],other=ids[k];report.pairs.total++;
  report.perCard[id].exercised++;report.perCard[other].exercised++;
  try{
   const g=newGame(47001+n*31+k*1091);g.s.phase='main';
   g.P(0).gigs=[{uid:80001,sides:4,value:1},{uid:80002,sides:8,value:3},{uid:80003,sides:10,value:8}];
   g.P(1).gigs=[{uid:80004,sides:6,value:2},{uid:80005,sides:12,value:5},{uid:80006,sides:20,value:10}];
   g.P(0).field=[g.newInst('6th-street-recruits',0)];
   g.P(1).field=[g.newInst('animals-wrecker',1)];
   g.s.active=1;await play(g,other,1);
   g.s.active=0;await play(g,id,0);
   invariant(g);report.pairs.pass++;report.perCard[id].pass++;report.perCard[other].pass++;
  }catch(e){
   if(e instanceof GameOver){report.pairs.gameovers++;report.pairs.pass++;report.perCard[id].pass++;report.perCard[other].pass++;}
   else {report.pairs.fail++;report.perCard[id].fail++;report.perCard[other].fail++;if(report.pairs.errors.length<15)report.pairs.errors.push({a:id,b:other,error:String(e.stack||e).slice(0,500)})}
  }
 }
 for(let n=0;n<1000;n++){
  const k=Math.floor(n/2),flip=n%2;
  const a=deckNames[k%deckNames.length],b=deckNames[(k*3+3)%deckNames.length];
  const decks=flip?[presets[b],presets[a]]:[presets[a],presets[b]];
  const g=Game.create(decks,[{...FastPolicy},{...FastPolicy}],{seed:19203+k*761,hooks:{sim:true}});
  const original=g.doAction.bind(g);
  g.doAction=async function(i,action){
   const legal=g.legalActions(i);
   if(!legal.some(x=>JSON.stringify(x)===JSON.stringify(action))) report.selfplay.illegal++;
   return original(i,action);
  };
  try{const result=await g.run(100);if(result.status==='incomplete')report.selfplay.incomplete++;else report.selfplay.completed++;}
  catch(e){if(report.selfplay.errors.length<15)report.selfplay.errors.push({game:n,error:String(e.stack||e).slice(0,450)})}
 }
 const bad=report.semantics.some(x=>x.status!=='PASS')||report.pairs.fail||report.selfplay.incomplete||report.selfplay.errors.length||report.selfplay.illegal||ids.length!==150||Object.values(report.perCard).some(x=>x.exercised!==ids.length*2);
 report.cards=ids.length;report.coverage={cardsWithTechnicalPairs:Object.values(report.perCard).filter(x=>x.exercised>0).length,pairsTested:report.pairs.total,verifiedOfficialTexts:0,expectedOfficialTexts:150};report.conclusion=bad?'FAILED':'TECHNICAL_PASS_NOT_OFFICIAL_CERTIFIED';
 console.log(JSON.stringify(report,null,2));if(bad)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
