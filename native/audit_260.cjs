'use strict';
// PRIME 2.6 regression: campaign unlocking, human-only stats, artwork decks,
// contextual combat and stable navigation. External rules certification not implied.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const src=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v260_runtime.html','utf8');
assert(src.includes('function campaignScreen()')&&src.includes('function careerScreen()'));
assert(src.includes('function deckStatsScreen()')&&src.includes('function benchmarkDeck()'));
assert(src.includes('tcg-deck-arts')&&src.includes('prime-combat-guidance'));
assert(src.includes('CareerStats.record(res,')&&src.includes('CampaignProgress.finish(S.campaignRun,res)'));
assert(src.includes('campaignRun:S.campaignRun'),'Campaign must survive checkpoint');
assert(src.includes('restore.campaignRun'),'Campaign must survive resume');
assert(src.includes('!screen.classList.contains')===false,'No old update overlay allowed');
const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
const app=document.querySelector('#app');
const memory=new Map();
const store={get(k,d){return memory.has(k)?memory.get(k):d;},set(k,d){memory.set(k,JSON.parse(JSON.stringify(d)));return true;},del(k){memory.delete(k);return true;}};
let launched=0;
const D={
  deck1:{name:'Le Casse',desc:'Deck principal',main:['u1','u2'],legends:['leg1','leg2','leg3'],official:true},
  deck2:{name:'Contrôle',desc:'Deck bleu',main:['u1','u1','u2'],legends:['leg4','leg5','leg6']}
};
const cards={u1:{cost:2},u2:{cost:4}};
for(let i=1;i<=6;i++)cards['leg'+i]={name:'Légende '+i,content:'',cost:0};
const S={campaignRun:null,myDeck:'deck1',aiDeck:'embracing-power',level:'normal',
  custom:{},sheet:null,learningEnabled:false,rivalMemory:{total:0},brain:{matches:0}};
const ctx={window,document,app,store,S,console,Date,
  PRESETS:{
    'embracing-power':{name:'Arasaka'},'maelstrom':{name:'Maelstrom'},
    'voodoo':{name:'Voodoo'},'nomades':{name:'Nomades'},
    'rockers':{name:'Samurai'},'netrunners':{name:'Netrunners'}
  },
  LEVELS:{facile:['Initiation'],normal:['Tactique+'],expert:['NIGHTMARE']},
  CARDS:cards,
  topbar:(s)=>'<header>'+s+'</header>',
  mount:s=>{app.innerHTML=s},
  allDecks:()=>D,validateDeck:()=>[],deckDots:()=>'<i class="dot"></i>',
  cardArt:id=>'images_vf/'+id+'.webp',startGame:()=>{launched++},
  toast:()=>{},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  builderScreen:()=>{},confirm:()=>true
};
vm.createContext(ctx);
const campaignStart=src.indexOf('/* Persistent player history');
const campaignEnd=src.indexOf('const GameArchive =',campaignStart);
assert(campaignStart>0&&campaignEnd>campaignStart);
vm.runInContext(src.slice(campaignStart,campaignEnd)+
  '\nglobalThis.OBJ={CareerStats,CampaignProgress,CAMPAIGN_MISSIONS,campaignScreen,careerScreen};',ctx);
const O=ctx.OBJ;
assert.equal(O.CAMPAIGN_MISSIONS.length,6);
assert.equal(O.CampaignProgress.available(0),true);
assert.equal(O.CampaignProgress.available(1),false);
assert.equal(O.CampaignProgress.finish('watson',{winner:1}),false);
assert.equal(O.CampaignProgress.available(1),false);
O.campaignScreen();
assert.equal(app.querySelectorAll('[data-campaign]').length,6);
assert.equal(app.querySelectorAll('[data-campaign]:not([disabled])').length,1);
app.querySelector('[data-campaign="0"]').onclick();
assert.equal(launched,1);
assert.equal(S.campaignRun,'watson');
assert.equal(S.level,'facile');
assert.equal(O.CampaignProgress.finish('watson',{winner:0}),true);
assert.equal(O.CampaignProgress.available(1),true);
assert.equal(O.CampaignProgress.read().wins.length,1);
O.campaignScreen();
assert.equal(app.querySelectorAll('[data-campaign]:not([disabled])').length,2);
assert.equal(S.campaignRun,null);
assert.equal(O.CareerStats.record({status:'incomplete',winner:0},'A'),false);
assert.equal(O.CareerStats.read().wins,0);
O.CareerStats.record({winner:0},'Le Casse','watson');
O.CareerStats.record({winner:1},'Le Casse');
O.CareerStats.record({winner:-1},'Le Casse');
const career=O.CareerStats.read();
assert.deepEqual([career.wins,career.losses,career.draws],[1,1,1]);
O.careerScreen();
assert(app.textContent.includes('3 duel(s)'));
const dStart=src.indexOf('function decksScreen()'),dEnd=src.indexOf('function builderScreen(',dStart);
assert(dStart>0&&dEnd>dStart);
vm.runInContext(src.slice(dStart,dEnd)+'\nglobalThis.showDecks=decksScreen',ctx);
ctx.showDecks();
assert.equal(app.querySelectorAll('.tcg-deck-card').length,2);
assert.equal(app.querySelectorAll('.tcg-legend').length,6);
assert.equal(app.querySelectorAll('.tcg-legend img').length,6);
assert(app.querySelector('[data-equip="deck1"]'));
assert(app.querySelector('[data-edit="deck2"]'));
const search=app.querySelector('#deckSearch');
search.value='contrôle';search.oninput();
assert.equal(app.querySelectorAll('.tcg-deck-card[hidden]').length,1);
search.value='';search.oninput();
assert.equal(app.querySelectorAll('.tcg-deck-card[hidden]').length,0);
const bStart=src.indexOf('async function benchmarkDeck(){'),bEnd=src.indexOf('const TUTORIAL_STEPS=',bStart);
const b=src.slice(bStart,bEnd);
assert(b.includes("'embracing-power','the-heist','maelstrom','voodoo','netrunners'"));
assert(b.includes('for(let m=0;m<8;m++)'));
assert(b.includes("result?.status==='incomplete'"));
assert(b.includes('Wilson interval'));
assert(src.includes('const why=available.length'));
assert(src.includes('Coût imprimé'));
assert(src.includes("data-nav=\"campaign\""));
assert(!src.includes('prime-update-dock'));
assert.equal((src.match(/data-prime-update/g)||[]).length,3);
console.log(JSON.stringify({version:'2.6.0',campaignUnlock:'PASS',campaignNoArtificialVictory:'PASS',
  humanResultsOnly:'PASS',careerPersistence:'PASS',deckArt:'PASS',deckFilters:'PASS',
  combatGuidance:'PASS',benchOpponents:'PASS',menuOnlyUpdates:'PASS'},null,2));
