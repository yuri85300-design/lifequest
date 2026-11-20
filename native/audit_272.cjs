'use strict';
/* 2.7.2 public-only match review, no hidden hand reconstruction. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v272_runtime.html','utf8');
const start=html.indexOf('const ReplayCoach={'),end=html.indexOf('function timelineScreen(){',start);
assert(start>0&&end>start);
const ctx={HUMAN:0,console};
vm.createContext(ctx);
vm.runInContext(html.slice(start,end)+';globalThis.Coach=ReplayCoach',ctx);
const {Coach}=ctx;
const secret='UNREVEALED-OPPONENT-PRIVATE-CARD-12345';
const replay={
 schema:230,winner:0,reason:'Duel terminé',
 events:[
  {actor:0,kind:'play',cardId:secret},{actor:0,kind:'sell'},
  {actor:0,kind:'attack'},{actor:0,kind:'steal'},
  {actor:1,kind:'play',cardId:'secret-opponent-card'},{actor:1,kind:'steal'}
 ],
 timeline:[
  {gigs:[3,3],turn:1,active:0,hands:[6,6],field:[[],[]],note:'départ'},
  {gigs:[4,2],turn:4,active:0,hands:[4,5],field:[[],[]],note:'fin'}
 ]
};
const original=JSON.stringify(replay);
const summary=Coach.summarize(replay);
assert.equal(summary.valid,true);
assert.equal(summary.metrics.length,6);
assert.equal(summary.insights.length,3);
assert.equal(summary.metrics.find(a=>a[0]==='Vols observés')[1],1);
assert(summary.insights[2].includes('+1'));
assert(!JSON.stringify(summary).includes(secret));
assert(!JSON.stringify(summary).includes('secret-opponent-card'));
assert.equal(JSON.stringify(replay),original,'Analysis cannot mutate stored replay');
assert.equal(Coach.summarize(null).valid,false);
assert.equal(Coach.summarize({events:[],timeline:[]}).insights.length,3);
assert(html.includes('prime-replay-coach-grid'));
assert(html.includes('ReplayCoach.summarize(r)'));
assert(html.includes('Débrief tactique'));
assert(html.includes('Pas de lecture des mains cachées'));
assert(html.includes('function campaignScreen()')&&html.includes('function combatGuide()'));
console.log(JSON.stringify({version:'2.7.2',replayCoach:'PASS',threeInsights:'PASS',
 noHiddenData:'PASS',readOnly:'PASS',safeEmpty:'PASS',campaign:'PASS'}));
