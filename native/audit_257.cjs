'use strict';
/* Independent 2.5.7 TCG home navigation / update / persistence regression. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v257_runtime.html','utf8');
const start=html.indexOf('function requestPrimeUpdate()');
const end=html.indexOf('function topbar(',start);
const hs=html.indexOf('function homeScreen()'),he=html.indexOf('// ====================================== NIGHTMARE LAB',hs);
assert(start>0&&end>start&&hs>end&&he>hs,'Game home and update functions missing');
const css=html.slice(0,html.indexOf('</style></head>'));
for(const k of [
  '.hub-hero{','.hub-art-card{','.hub-shortcuts{','.hub-status{','.hub-menu{',
  '@media(max-width:530px)','@media(orientation:landscape) and (max-height:520px)',
  '@media(prefers-reduced-motion:reduce)','overflow-y:auto!important',
  'touch-action:pan-y','min-height:48px',
])assert(css.includes(k),'Missing design or accessibility CSS '+k);
assert(!html.includes('prime-update-dock'),'Old floating update overlay must be eliminated entirely');
assert(!html.includes('prime-with-update-dock'),'Old bottom padding reservation must be eliminated');
assert(html.includes("All update actions live inside a Menu"),'Menu-only updater policy must be explicit');
assert(html.includes('data-open-home-menu aria-label="Menu et mises à jour"'),'Every normal screen must expose a compact menu icon');
assert(html.includes('function gameMenu()'),'Duel command menu must remain reachable');
const updateAttrs=(html.match(/data-prime-update/g)||[]).length;
assert.equal(updateAttrs,3,'Only two menu update actions plus the click delegate must exist');
assert(html.includes("if(menu){e.preventDefault();homeMenu();return;}"),'Home menu bridge missing');
const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
const app=document.querySelector('#app');
let updates=0, archive=null, notices=[];
const S={sheet:null,myDeck:'deck1',learningEnabled:true,rivalMemory:{total:4},brain:{matches:0}};
const ctx={window,document,app,S,console,setTimeout,clearTimeout,
  closeSheet(){if(S.sheet){S.sheet.remove();S.sheet=null;}},
  toast(s){notices.push(s);},
  openSheet(text){
    if(S.sheet){S.sheet.remove();S.sheet=null;}
    const scrim=document.createElement('div');scrim.className='scrim';
    scrim.innerHTML='<div class="sheet">'+text+'</div>';
    app.appendChild(scrim);S.sheet=scrim;return scrim;
  },
  allDecks(){return {deck1:{name:'Le Casse',main:Array(40).fill('x')}}},
  cardArt(id){return 'images_vf/'+id+'.webp';},
  esc(s){return String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')},
  GameArchive:{read(){return archive}},
  persistenceAvailable(){return true},
};
window.Native7Gigs={checkForUpdates(){updates++}};
vm.createContext(ctx);
vm.runInContext(html.slice(start,end)+'\nglobalThis.F={mount,homeMenu,requestPrimeUpdate}',ctx);
vm.runInContext(html.slice(hs,he)+'\nglobalThis.H=homeScreen',ctx);
ctx.H();
assert(app.querySelector('.hub-hero'),'TCG hero missing');
assert(app.querySelector('.hub-shell'),'Main shell missing');
assert(app.querySelector('.hub-menu[data-open-home-menu]'),'Header menu missing');
assert(!app.querySelector('.prime-update-dock'),'Old pinned update dock must not obscure home');
assert(!app.querySelector('#homeResume'),'Resume must be hidden without an archive');
assert.equal(app.querySelectorAll('.hub-art-card').length,3,'Artwork showcase must use three cards');
assert.equal(app.querySelectorAll('.hub-shortcut').length,4,'Exactly four principal activity tiles');
const expected=['setup','decks','cards','academy','lab','puzzles','analyse','journal','rules'];
for(const route of expected)assert(app.querySelector('[data-nav="'+route+'"]'),'Missing home route '+route);
assert(app.querySelector('.hub-deck').textContent.includes('Le Casse'),'Deck state not displayed');
assert(app.querySelector('.hub-learning').textContent.includes('4 duel(s)'),'AI state not displayed');
ctx.F.homeMenu();
assert(app.querySelector('.scrim [data-prime-update]'),'Menu must include version checker');
assert(app.querySelector('.scrim [data-close-home-menu]'),'Menu close button missing');
assert(ctx.F.requestPrimeUpdate(),'Native updater must be callable');
assert.equal(updates,1,'Native bridge must be called once');
ctx.closeSheet();
archive={game:'saved'};
ctx.H();
assert(app.querySelector('#homeResume'),'Resume should be available only with saved game');
assert.equal(app.querySelectorAll('[data-nav="setup"]').length,1,'Single primary Play action');
assert(!app.querySelector('.prime-update-dock'),'No obtrusive dock after rerender');
ctx.F.mount('<div class="screen"><div class="scroll">Decks</div></div>');
assert(!app.querySelector('[data-prime-update]'),'Deck screen must not display update outside menu');
assert(!app.querySelector('.prime-update-dock'),'Deck screen must keep full vertical space');
const tb=html.indexOf('function topbar(');
const tbEnd=html.indexOf('app.addEventListener(',tb);
assert(tb>0&&tbEnd>tb,'Topbar helper missing');
const topctx={ICON:{back:'<',menu:'☰'},esc:s=>s};
vm.createContext(topctx);
vm.runInContext(html.slice(tb,tbEnd)+';globalThis.top=topbar',topctx);
const header=topctx.top('Mes decks');
const nav=document.createElement('div');nav.innerHTML=header;
assert(nav.querySelector('.prime-top-menu[data-open-home-menu]'),'Deck topbar must expose Menu');
assert(nav.querySelector('.prime-top-menu').getAttribute('aria-label')==='Menu et mises à jour');
assert(!nav.querySelector('[data-prime-update]'),'Update must only be inside menu, not directly in topbar');
ctx.F.homeMenu();
assert(app.querySelector('.scrim [data-prime-update]'),'Deck Menu must expose updater');
ctx.closeSheet();
ctx.F.mount('<div class="screen"><div class="board">Duel</div></div>');
assert(!app.querySelector('[data-prime-update]'),'Battle surface must not show floating updater');
assert(!app.querySelector('.prime-update-dock'),'Combat must remain unobstructed');
const duelMenuStart=html.indexOf('function gameMenu()');
const duelMenuEnd=html.indexOf('async function spotlight(',duelMenuStart);
assert(duelMenuStart>0&&duelMenuEnd>duelMenuStart);
assert(html.slice(duelMenuStart,duelMenuEnd).includes('data-prime-update>'),'Duel Menu must still contain updater');
delete window.Native7Gigs;
assert.equal(ctx.F.requestPrimeUpdate(),false);
assert(notices.some(s=>s.includes('Android')),'Web fallback must remain useful');
console.log(JSON.stringify({
  version:'2.5.7',homeArt:'PASS',heroCTA:'PASS',menuUpdates:'PASS',menuOnlyUpdates:'PASS',
  deckPageUnobstructed:'PASS',secondaryMenu:'PASS',duelMenu:'PASS',
  navigation:'PASS',deckAndAI:'PASS',resume:'PASS',layoutBreakpoints:'PASS',
  touchAndReducedMotion:'PASS',combatUnobstructed:'PASS',androidBridge:'PASS',
  browserFallback:'PASS'
},null,2));
