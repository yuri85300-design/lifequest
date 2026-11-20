'use strict';
/* 2.6.1: real duel guide progress is event-gated and persistent. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v261_runtime.html','utf8');
const begin=html.indexOf('const COMBAT_GUIDE_STEPS=Object.freeze('),end=html.indexOf('function homeMenu()',begin);
assert(begin>0&&end>begin);
const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
const app=document.querySelector('#app'), saved=new Map(),stats={marks:0};
const store={get(k,d){return saved.has(k)?saved.get(k):d},set(k,x){saved.set(k,JSON.parse(JSON.stringify(x)));stats.marks++;return true;}};
const S={game:{P:i=>({gigs:Array(i?3:2).fill({})}),avail:()=>4},sheet:null};
const ctx={console,window,document,app,S,store,HUMAN:0,AI:1,
  esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  closeSheet(){if(S.sheet){S.sheet.remove();S.sheet=null}},
  openSheet(s){
    if(S.sheet){S.sheet.remove();S.sheet=null}
    const div=document.createElement('div');div.className='scrim';
    div.innerHTML='<div class="sheet">'+s+'</div>';app.appendChild(div);S.sheet=div;return div;
  },toast(){throw Error('Unexpected toast with live game')}
};
vm.createContext(ctx);
vm.runInContext(html.slice(begin,end)+'\nglobalThis.G={COMBAT_GUIDE_STEPS,CombatGuide,combatGuide}',ctx);
const {COMBAT_GUIDE_STEPS,CombatGuide,combatGuide}=ctx.G;
assert.equal(COMBAT_GUIDE_STEPS.length,8);
assert.equal(CombatGuide.read().done.length,0);
assert.equal(CombatGuide.mark('impossible'),false);
assert.equal(CombatGuide.read().done.length,0);
combatGuide();
assert.equal(CombatGuide.read().done.length,1);
assert(app.querySelector('.prime-guide-score').textContent.includes('1/8'));
assert(app.textContent.includes('2 Gigs'));
assert(app.textContent.includes('4 €$'));
app.querySelector('[data-close-guide]').onclick();
assert(!app.querySelector('.scrim'));
const tasks=['inspect','sell','play','call','attack','steal','turn'];
for(const event of tasks)assert.equal(CombatGuide.mark(event),true);
assert.equal(CombatGuide.read().done.length,8);
const before=stats.marks;
CombatGuide.mark('play');
assert.equal(stats.marks,before,'Do not write twice on duplicate event');
combatGuide();
assert(app.querySelector('.prime-guide-score').textContent.includes('8/8'));
assert.equal(app.querySelectorAll('.prime-guide-step.done').length,8);
assert(html.includes("CombatGuide.mark('inspect');"));
assert(html.includes("CombatGuide.mark(ev);"));
assert(html.includes("['sell','play','call','attack','steal','turn'].includes(ev)"));
assert(html.includes("sc.querySelector('[data-guide]').onclick=()=>{closeSheet();combatGuide();};"));
assert(!html.includes('prime-update-dock'),'No intrusive updater permitted');
console.log(JSON.stringify({version:'2.6.1',guideLive:'PASS',steps:8,observedEvents:'PASS',noSpoofing:'PASS',
  persistent:'PASS',idempotent:'PASS',duelMenu:'PASS',noUpdateOverlay:'PASS'},null,2));
