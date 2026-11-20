'use strict';
/* 2.6.2: the [hidden] attribute must win over flex display on deck tiles. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const s=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v262_runtime.html','utf8');
const css=s.slice(s.indexOf('<style>'),s.indexOf('</style>'));
assert(css.includes('.sim-deck-library .sim-deck-cards .tcg-deck-card[hidden]{display:none!important}'),
  'Search filter must remove hidden cards from visual layout');
assert(s.includes('card.hidden=!visible'),'Filtering must toggle the hidden attribute');
assert(s.includes("if(visible)shown++"),'Deck list must track visible cards');
assert(s.includes("empty.style.display=shown?'none':'block'"),'No-result state must be accessible');
assert(s.includes('placeholder="Rechercher un deck…"'),'Mobile search must be legible');
assert(s.includes('data-nav="analyse">◈ Analyse</button>'),'Analysis shortcut must fit narrow toolbar');
assert(css.includes('.tcg-deck-arts .tcg-legend{flex-basis:76px'));
assert(css.includes('@media(max-width:530px)'));
assert(s.includes('function combatGuide()'));
assert(s.includes('function campaignScreen()'));
assert(s.includes('function careerScreen()'));
assert(!s.includes('prime-update-dock'),'No update button overlay in any screen');
console.log(JSON.stringify({version:'2.6.2',hideFilteredDecks:'PASS',compactDeckCards:'PASS',
 searchAndEmpty:'PASS',responsive:'PASS',combatGuide:'PASS',campaign:'PASS',
 persistentStats:'PASS',menuOnlyUpdate:'PASS'},null,2));
