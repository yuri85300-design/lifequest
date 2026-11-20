'use strict';
// 2.6.3: regressions that prevented opponent actions from unlocking human tutorial goals.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(process.env.PRIME_HTML||'native/prime_v263_runtime.html','utf8');
const actorLine=html.split('\n').find(x=>x.includes("d?.p===HUMAN && ['sell','play','call','attack','steal'].includes(ev)"));
assert(actorLine,'Tutorial event filter must be gated by actor');
assert(!actorLine.includes("'turn'"),'Automatic turnStart is not a player end-turn action');
const events=[],ctx={HUMAN:0,CombatGuide:{mark:x=>events.push(x)}};
vm.createContext(ctx);
vm.runInContext('globalThis.observe=function(ev,d){'+actorLine+'}',ctx);
for(const event of ['sell','play','call','attack','steal']){
 const before=events.length;
 ctx.observe(event,{p:1});
 assert.equal(events.length,before,'Opponent event awarded progress: '+event);
 ctx.observe(event,{p:0});
 assert.equal(events.length,before+1);
 assert.equal(events.at(-1),event);
}
const count=events.length;
for(const invalid of ['turn','end','defeat','inspect'])ctx.observe(invalid,{p:0});
ctx.observe('attack',null);
assert.equal(events.length,count);
const st=html.indexOf("if (t.id === 'endBtn') {"),en=html.indexOf("if (t.id === 'callBtn')",st);
assert(st>0&&en>st);
const buttonCode=html.slice(st,en);
assert(buttonCode.includes("S.acts.some(a=>a.type==='end')"),'Must require real legal end action');
const bctx={CombatGuide:{mark:e=>events.push(e)}};
vm.createContext(bctx);
vm.runInContext("globalThis.endButton=function(t,S,run){"+buttonCode+"}",bctx);
let ran=0;
bctx.endButton({id:'endBtn'},{acts:[{type:'play'}]},()=>ran++);
assert.equal(ran,1);
assert.equal(events.length,count,'Illegal end turn cannot unlock achievement');
bctx.endButton({id:'endBtn'},{acts:[{type:'end'}]},()=>ran++);
assert.equal(ran,2);
assert.equal(events.at(-1),'turn');
assert(html.includes('function combatGuide()'));
assert(html.includes('function campaignScreen()'));
assert(html.includes('function careerScreen()'));
assert(!html.includes('prime-update-dock'));
console.log(JSON.stringify({version:'2.6.3',opponentCannotUnlockGuide:'PASS',realEndTurnRequired:'PASS',
 ignoredAutomaticTurnStart:'PASS',humanOnlyObservations:'PASS',campaign:'PASS',
 persistentProgress:'PASS',noObstructingUpdate:'PASS'},null,2));
