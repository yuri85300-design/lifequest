'use strict';
// Mobile menu regression tests. Parses DOM, exercises the real UI docking helper,
// and keeps independent tests of the source CSS and command-center menu structure.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v254_runtime.html','utf8');
const st=source.indexOf('function requestPrimeUpdate()');
const en=source.indexOf('function topbar(',st);
assert(st>0&&en>st,'Missing actual menu/update helper');
assert(source.includes('function homeScreen()'),'Home screen missing');
assert(source.includes('function homeMenu()'),'Home Menu dialog handler missing');
assert(source.includes('data-open-home-menu aria-haspopup="dialog"'),'Home menu button must be discoverable and accessible');
assert(source.includes('prime-home-menu-bar'),'Home menu bar CSS missing');
assert(source.includes('position:sticky;top:calc(6px + var(--safe-t));'),'Menu must remain reachable while scrolling');
assert(source.includes('min-width:110px;min-height:48px;'),'Home menu touch target too small');
assert(source.includes('Mise à jour · Vérifier sur GitHub'),'Update must be located inside Menu');
assert(source.includes('sc.querySelector(\'.sheet\').setAttribute(\'aria-labelledby\',\'prime-home-menu-title\')'),'Menu modal accessible name missing');
assert(source.includes("if(menu){e.preventDefault();homeMenu();return;}"),'Home Menu click handler missing');

assert(source.includes('function gameMenu()'),'Command center menu missing');
assert(source.includes('.sheet .prime-menu-scroll'),'No scrollable command center CSS');
assert(source.includes('<div class="body prime-menu-scroll"><div class="acts">'),'Command center must scroll');
assert(source.includes('<div class="prime-menu-update"><button type="button" class="prime-update-button" data-prime-update>'),'Command center update dock missing');
assert(source.includes('const update=e.target.closest(\'[data-prime-update]\')'),'Delegated update handler missing');
assert(source.includes('#app>.screen.sim-home'),'Mobile-scroller CSS missing');
assert(source.includes('overflow-x:hidden!important;overflow-y:auto!important;'),'Home vertical scrolling disabled');
assert(source.includes('padding:calc(20px + var(--safe-t))'),'Home safe-area padding missing');
assert(source.includes('calc(118px + var(--safe-b))'),'Home footer space missing');
assert(source.includes('position:absolute;bottom:0;left:0;right:0;z-index:28;'),'Pinned dock missing');
assert(source.includes('touch-action:pan-y'),'Mobile touch scroll disabled');
assert(source.includes('min-height:54px;'),'Update button target too small');
const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
const app=document.querySelector('#app');
let calls=0, messages=[];
window.Native7Gigs={checkForUpdates(){calls++}};
const ctx={console,window,document,app,S:{sheet:null},
  closeSheet(){},toast(s){messages.push(s)},setTimeout,clearTimeout};
vm.createContext(ctx);
vm.runInContext(source.slice(st,en)+'\nglobalThis.TEST={mount,requestPrimeUpdate}',ctx);
const {mount,requestPrimeUpdate}=ctx.TEST;
mount('<div class="screen home sim-home"><div class="sim-home-main">Accueil</div><div class="sim-home-foot">Bas</div></div>');
let home=app.querySelector('.sim-home'),dock=app.querySelector('.prime-update-dock');
assert(home && dock, 'Both home and dock must exist');
assert(!home.contains(dock),'Dock must be OUTSIDE scrolling area');
assert.equal(app.querySelectorAll('[data-prime-update]').length,1);
assert.equal(dock.getAttribute('role'),'navigation');
assert.equal(dock.querySelector('button').tagName,'BUTTON');
assert.equal(requestPrimeUpdate(),true);
assert.equal(calls,1,'Button must invoke Android bridge');
mount('<div class="screen"><div class="scroll">Deck building</div></div>');
assert(app.querySelector('.prime-update-dock'),'Update must be available on deck screens');
mount('<div class="screen"><div class="board">Live duel</div></div>');
assert.equal(app.querySelector('.prime-update-dock'),null,'Do not cover battlefield with menu update dock');
delete window.Native7Gigs;
assert.equal(requestPrimeUpdate(),false);
assert(messages.some(x=>x.includes('Android')),'Web preview should show a sensible fallback');
const report={version:'2.5.4',homeMenu:'PASS',updateInsideMenu:'PASS',stickyMenu:'PASS',updateDock:'PASS',homeScrollable:'PASS',
  anchorOutsideScroll:'PASS',androidBridge:'PASS',allMenus:'PASS',
  battleUnobstructed:'PASS',mobileTouchScroll:'PASS',cssAccessible:'PASS',
  browserFallback:'PASS'};
console.log(JSON.stringify(report,null,2));
