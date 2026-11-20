'use strict';
/* PRIME 2.7.0: independently execute six tactical puzzles via legal engine actions
 * and verify public replay snapshots never disclose unrevealed information.
 */
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const path=require('path');
const file=process.env.PRIME_HTML || path.join(__dirname,'prime_v270_runtime.html');
const html=fs.readFileSync(file,'utf8');
const es=html.indexOf('/* Android: exporting JSON via the system document picker');
const ee=html.indexOf('// ============================================================================\n//  SEPT GIGS — interface',es);
const pa=html.indexOf('const TACTICAL_PUZZLES=Object.freeze(');
const pb=html.indexOf('const ACADEMY_QUESTIONS=[',pa);
const ra=html.indexOf('const GameArchive = {');
const rb=html.indexOf('function downloadPrimeJson(',ra);
assert(es>=0 && ee>es && pa>ee && pb>pa && ra>ee && rb>ra);
const context={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
context.window=context;context.globalThis=context;vm.createContext(context);
vm.runInContext(html.slice(es,ee)
  +'\nconst PRESETS=presetDecks();\n'
  +html.slice(pa,pb)+'\n'
  +'globalThis.TEST252={Game,CARDS,GameOver,presetDecks,makeTacticalPuzzle,puzzlePassed,TACTICAL_PUZZLES};',context);
const {Game,CARDS,GameOver,makeTacticalPuzzle,puzzlePassed,TACTICAL_PUZZLES}=context.TEST252;
assert.equal(Object.keys(CARDS).length,150);
assert.equal(TACTICAL_PUZZLES.length,6);
function correctAction(g,k) {
 const actions=g.legalActions(0);
 if(k===0)return actions.find(a=>a.type==='sell'&&g.byUid(a.uid)?.id==='mantis-blades');
 if(k===1)return actions.find(a=>a.type==='play'&&g.byUid(a.uid)?.id==='gorilla-arms');
 if(k===2)return actions.find(a=>a.type==='attack'&&a.target?.kind==='gigs');
 if(k===3)return actions.find(a=>a.type==='play'&&g.byUid(a.uid)?.id==='animals-wrecker');
 if(k===4)return actions.find(a=>a.type==='call');
 if(k===5)return actions.find(a=>a.type==='attack'&&a.target?.kind==='unit'&&g.byUid(a.target.uid)?.id==='6th-street-recruits');
 return null;
}
(async()=>{
 const outcome=[];
 for(let k=0;k<TACTICAL_PUZZLES.length;k++){
   const g=makeTacticalPuzzle(k),legal=g.legalActions(0),choice=correctAction(g,k);
   assert(choice && legal.some(x=>JSON.stringify(x)===JSON.stringify(choice)),'missing legal expected action '+k);
   assert(legal.length>=2,'puzzle has insufficient choices '+k);
   assert(!puzzlePassed(g,k,null),'puzzle solved prematurely '+k);
   let winner=null;
   try{await g.doAction(0,choice)}catch(err){if(err instanceof GameOver)winner=err.winner;else throw err}
   assert(puzzlePassed(g,k,winner),'game engine did not verify objective '+k);
   const fresh=makeTacticalPuzzle(k),pass=fresh.legalActions(0).find(a=>a.type==='end');
   assert(pass,'expected end control '+k);
   assert(!puzzlePassed(fresh,k,null),'end turn incorrectly passes puzzle');
   outcome.push({puzzle:k+1,name:TACTICAL_PUZZLES[k].title,choices:legal.length,legal:true,win:winner});
 }
 // Test a real game state snapshot, not a handcrafted fake payload.
 const g=makeTacticalPuzzle(2);
 const reference=g.P(0).legends[0].id;
 const store={get(){return null},set(){return true},del(){return true}};
 const S={timeline:[],eventTrace:[]};
 context.store=store;context.S=S;
 vm.runInContext(html.slice(ra,rb)+'\nglobalThis.TEST_ARCHIVE=GameArchive;',context);
 const point=context.TEST_ARCHIVE.timelinePoint(g.s);
 assert.equal(point.hands.length,2);
 assert.equal(point.publicUnits.length,2);
 assert.equal(point.publicGigs[0].length,g.P(0).gigs.length);
 assert(point.publicLegends.every(list=>list.every(l=>l.faceUp || l.id===null)),'hidden legend revealed');
 assert(!JSON.stringify(point).includes('"hand":'),'private hand leaked');
 assert(!JSON.stringify(point).includes('"deck":'),'private deck leaked');
 assert(!JSON.stringify(point).includes('"trash":'),'private trash leaked');
 assert(!point.publicLegends[0].some(l=>l.id===reference),'hidden legend identity leaked');
 assert(html.includes('Readability.apply()'));
 assert(html.includes('data-readable'));
 assert(html.includes('data-nav="puzzles"'));
 const report={version:'2.7.0',gameCards:Object.keys(CARDS).length,
    academyMissions:outcome,publicReplay:'PASS',privacy:'PASS',
    mobileReadability:'PRESENT',conclusion:'TECHNICAL_PASS_NOT_OFFICIAL_CERTIFIED'};
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
