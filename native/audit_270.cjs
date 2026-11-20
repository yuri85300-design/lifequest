'use strict';
// PRIME 2.7: math, legal replacements, accessible battle situational awareness.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v270_runtime.html','utf8');
const es=html.indexOf('/* Android: exporting JSON via the system document picker');
const ee=html.indexOf('// ============================================================================\n//  SEPT GIGS — interface',es);
const pure=html.indexOf('const DeckMath={'),prefs=html.indexOf('const Comfort={',pure);
const stats=html.indexOf('function deckStatsScreen()',prefs);
assert(es>=0&&ee>es&&pure>ee&&prefs>pure&&stats>prefs);
const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
const app=document.getElementById('app'),saved=new Map();
const store={get(k,d){return saved.has(k)?saved.get(k):d;},set(k,x){saved.set(k,JSON.parse(JSON.stringify(x)));return true;}};
const ctx={console,Date,Math,structuredClone,setTimeout,clearTimeout,
  window,document,app,store,
  HUMAN:0,AI:1,
  esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  actionLabel:()=>['Action autorisée',''],
  explainTacticalAction:()=>'Événement public uniquement',
  closeSheet(){ctx.S.sheet?.remove();ctx.S.sheet=null;},
  openSheet(txt){const node=document.createElement('div');node.className='scrim';node.innerHTML='<div class="sheet">'+txt+'</div>';app.append(node);ctx.S.sheet=node;return node;},
  toast:()=>{}
};
ctx.window=ctx;ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(html.slice(es,ee)+
  '\nconst PRESETS=presetDecks();'+
  '\n'+html.slice(pure,prefs)+
  '\n'+html.slice(prefs,stats)+
  '\nglobalThis.A270={DeckMath,DeckCoach,OpponentBriefings,Comfort,tacticalSituation,PRESETS,CARDS,validateDeck};',ctx);
const {DeckMath,DeckCoach,OpponentBriefings,Comfort,tacticalSituation,PRESETS,CARDS,validateDeck}=ctx.A270;
assert.equal(DeckMath.pct(40,0,6),0);
assert.equal(DeckMath.pct(40,40,6),100);
assert.equal(DeckMath.pct(40,1,6),15);
assert(Math.abs(DeckMath.atLeastOne(40,1,6)-0.15)<1e-10);
assert(DeckMath.atLeastOne(40,8,6)>DeckMath.atLeastOne(40,4,6));
assert.equal(DeckMath.atLeastOne(40,99,6),0,'Reject invalid counts');
let evaluated=0;
for(const dk of Object.values(PRESETS).slice(0,5)){
  const original=JSON.stringify(dk);
  const tips=DeckCoach.suggestions(dk);
  assert(tips.length<=3);
  for(const tip of tips){
    assert(CARDS[tip.add]&&CARDS[tip.remove]);
    const other={legends:dk.legends.slice(),main:dk.main.slice()};
    const n=other.main.indexOf(tip.remove);
    assert(n>=0,'Unknown card being removed');
    other.main.splice(n,1,tip.add);
    assert(validateDeck(other).length<=validateDeck(dk).length,'Suggestion introduces illegal deck');
    evaluated++;
  }
  assert.equal(JSON.stringify(dk),original,'Suggestions must not alter the original deck');
}
assert(OpponentBriefings.maelstrom.length===2);
assert(!app.classList.contains('prime-large-text'));
assert(Comfort.toggle('large'));
assert(app.classList.contains('prime-large-text'));
assert(Comfort.toggle('quiet'));
assert(app.classList.contains('prime-quiet-motion'));
assert(saved.has('primeComfortV1'));
assert(Comfort.read().large&&Comfort.read().quiet);
const hiddenCard='SECRET-PRIVATE-CARD-NEVER-DISCLOSE';
ctx.S={
  sheet:null,
  game:{P:i=>({gigs:Array.from({length:i?4:3},()=>({})),field:Array.from({length:i?2:1},()=>({})),hand:i?[{id:hiddenCard}]:[]}),avail:()=>4},
  acts:[{type:'end'}],resolveMain:()=>{},timeline:[{turn:2,note:'Une Unité a été posée.'}]
};
tacticalSituation();
assert(app.querySelector('.prime-tactics-grid'));
assert(app.querySelector('.prime-tactics-action'));
assert(app.textContent.includes('3/7')&&app.textContent.includes('4/7'));
assert(!app.textContent.includes(hiddenCard),'No unrevealed enemy hand data in brief');
app.querySelector('[data-close-tactics]').onclick();
assert(!app.querySelector('.scrim'));
assert(html.includes('id="whyBtn"'));
assert(html.includes("if (t.id === 'whyBtn') return tacticalSituation();"));
assert(html.includes('id="suggestDeck"'));
assert(html.includes("querySelector('#suggestDeck').onclick"));
assert(html.includes('id="rivalBrief"'));
assert(html.includes('const CampaignLore='));
assert((html.slice(html.indexOf('const ACADEMY_QUESTIONS=['),html.indexOf('function academyScreen(')).match(/topic:/g)||[]).length>=17);
assert(!html.includes('prime-update-dock'));
console.log(JSON.stringify({version:'2.7.0',deckProbabilities:'PASS',
 safeSuggestions:'PASS',suggestionsTested:evaluated,previewDoesNotMutate:'PASS',
 contextOnlyPublic:'PASS',userPreferences:'PASS',opponentBriefing:'PASS',quests:17,
 battleWhy:'PASS',menuOnlyUpdates:'PASS'},null,2));
