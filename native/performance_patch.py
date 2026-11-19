#!/usr/bin/env python3
"""7 Gigs 1.0.2: deterministic offline runtime + worker performance patch."""
from pathlib import Path
import sys

def once(s,a,b):
    n=s.count(a)
    if n!=1: raise RuntimeError("Expected 1 anchor, got %d: %s"%(n,a[:90]))
    return s.replace(a,b,1)

def patch(asset):
    html=Path(asset).read_text(encoding="utf8")
    css="""
/* GPU budget on mobile: keep 3D cards, skip perpetual background repaints. */
.perf-fluid .board:before,.perf-fluid .sim-home:before{animation:none!important;filter:none!important;opacity:.27!important}
.perf-fluid .board:after{opacity:.18!important;mix-blend-mode:normal!important}
.perf-fluid .board .side,.perf-fluid .board .midrail{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.perf-fluid .board .field::before{box-shadow:none!important}
.perf-fluid .board .slot,.perf-fluid .board .mini,.perf-fluid .board .leg{transition:transform .12s ease-out,opacity .12s ease-out!important}
.perf-fluid .board .mini.sel{animation:none!important;filter:none!important}
.perf-fluid .board .rail .cell svg{filter:none!important}
.perf-fluid .board .mini.has-img::after{mix-blend-mode:normal!important;opacity:.17!important}
.perf-fluid .arena-fx .fx-core{text-shadow:0 0 16px var(--fx-color,#41b9ff)!important;animation-duration:.43s!important}
.perf-fluid .arena-fx .fx-ray,.perf-fluid .arena-fx .fx-ring{box-shadow:none!important}
.perf-fluid .arena-fx .fx-spark:nth-of-type(n+8){display:none!important}
.perf-fluid .cardgrid .mini,.perf-fluid .sim-pool-entry{content-visibility:auto;contain-intrinsic-size:auto 116px}
.perf-fluid .board .hand,.perf-fluid .board .field{overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
@media(prefers-reduced-motion:reduce){.board:before,.sim-home:before{animation:none!important}.arena-fx{display:none!important}}
"""
    a=html.index("<script>")+len("<script>")
    b=html.rindex("</script>")
    js=html[a:b]
    cut=js.rfind("// ============================================================================",0,js.index("//  SEPT GIGS — interface"))
    if cut<0:raise RuntimeError("Core game section not found")
    worker="self.window=self;\n"+js[:cut]+"""
self.onmessage=async function(event){
 const d=event.data||{};
 if(!Number.isInteger(d.id))return;
 try{
  self.AIChampion=()=>d.weights||null;
  self.AIPlanChampion=()=>d.plans||self.DeckPlanAI?.INITIAL;
  self.RivalLearningSession=()=>d.session||null;
  self.RivalLearningData=()=>d.memory||null;
  const g=new Game(d.state,[FastPolicy,FastPolicy],{thinking:()=>{}});
  const policy=makeAI(d.level||'expert');
  const action=d.method==='react'
    ?await policy.react(g,d.side,d.attack,d.actions)
    :await policy.mainAction(g,d.side,d.actions);
  self.postMessage({id:d.id,action});
 }catch(err){self.postMessage({id:d.id,error:String(err?.stack||err)})}
};
self.postMessage({ready:true});
"""
    p=Path(asset).with_name("ai-worker.js")
    p.write_text(worker,encoding="utf8")
    bridge="""
const Perf={
 mode:store.get('perfMode',/Android/i.test(navigator.userAgent)?'fluide':'detail'),
 apply(){document.documentElement.classList.toggle('perf-fluid',this.mode==='fluide')},
 toggle(){this.mode=this.mode==='fluide'?'detail':'fluide';store.set('perfMode',this.mode);this.apply()}
};
Perf.apply();
const TacticalWorker=(()=>{
 let worker=null,ready=false,seq=0,queue=new Map(),pendingReady=null,disabled=false;
 function stopAll(){
  for(const entry of queue.values()){clearTimeout(entry.timer);entry.resolve(null)}
  queue.clear();try{worker?.terminate()}catch(_){}
  worker=null;ready=false;pendingReady=null;
 }
 function boot(){
  if(disabled)return Promise.resolve(false);
  if(pendingReady)return pendingReady;
  pendingReady=new Promise(resolve=>{
   try{
    worker=new Worker('ai-worker.js');let resolved=false;
    const initTimer=setTimeout(()=>{if(!resolved){resolved=true;disabled=true;stopAll();resolve(false)}},5000);
    worker.onmessage=e=>{
     const data=e.data||{};
     if(data.ready){ready=true;if(!resolved){resolved=true;clearTimeout(initTimer);resolve(true)}return}
     const entry=queue.get(data.id);if(!entry)return;
     queue.delete(data.id);clearTimeout(entry.timer);entry.resolve(data.error?null:data.action);
    };
    worker.onerror=()=>{
     disabled=true;stopAll();
     if(!resolved){resolved=true;clearTimeout(initTimer);resolve(false)}
    };
   }catch(_){disabled=true;stopAll();resolve(false)}
  });
  return pendingReady;
 }
 async function decide(method,g,i,actions,attack){
  if(!await boot()||!ready||!worker)return null;
  const packet={id:++seq,method,level:S.level,side:i,
   state:{...g.s,log:[]},actions,attack,weights:S.brain?.weights,plans:S.brain?.plans,
   session:S.learningEnabled?S.duelLearner:null,memory:S.learningEnabled?S.rivalMemory:null};
  const action=await new Promise(resolve=>{
   const id=packet.id;
   const timer=setTimeout(()=>{queue.delete(id);resolve(null)},20000);
   queue.set(id,{timer,resolve});
   try{worker.postMessage(packet)}catch(_){clearTimeout(timer);queue.delete(id);resolve(null)}
  });
  if(!action)return null;
  const key=JSON.stringify(action);
  return actions.find(a=>JSON.stringify(a)===key)||null;
 }
 return{boot,decide,stopAll};
})();
setTimeout(()=>TacticalWorker.boot(),100);
"""
    js=once(js,"const allDecks = () => ({ ...PRESETS, ...S.custom });",bridge+"\nconst allDecks = () => ({ ...PRESETS, ...S.custom });")
    wrapper="""
 const playerAI=S.level==='facile'?baseAI:{
  ...baseAI,
  async mainAction(g,i,acts){
   g.hooks?.thinking?.(true);
   try{
    const action=await TacticalWorker.decide('mainAction',g,i,acts);
    return action||await baseAI.mainAction(g,i,acts);
   }finally{g.hooks?.thinking?.(false)}
  },
  async react(g,i,A,acts){
   g.hooks?.thinking?.(true);
   try{
    const action=await TacticalWorker.decide('react',g,i,acts,A);
    return action||await baseAI.react(g,i,A,acts);
   }finally{g.hooks?.thinking?.(false)}
  }
 };
"""
    js=once(js,"  const baseAI=makeAI(S.level);\n  const enemy=session?{...baseAI,","  const baseAI=makeAI(S.level);\n"+wrapper+"  const enemy=session?{...playerAI,")
    js=once(js,"const a=await baseAI.mainAction(g,i,acts);window.RivalLearning.recordAI","const a=await playerAI.mainAction(g,i,acts);window.RivalLearning.recordAI")
    js=once(js,"const a=await baseAI.react(g,i,A,acts);window.RivalLearning.recordAI","const a=await playerAI.react(g,i,A,acts);window.RivalLearning.recordAI")
    js=once(js,"  }:baseAI;\n  try {\n    g = Game.create","  }:playerAI;\n  try {\n    g = Game.create")
    js=once(js,"    log(msg) { guard(g); S.ticker = msg; render(); },\n    thinking(on) { if (S.game !== g) return; S.thinking = on; render(); },","""    log(msg) {guard(g);S.ticker=msg;const el=app.querySelector('#ticker');if(el)el.textContent=msg;else render()},
    thinking(on) {if(S.game!==g)return;S.thinking=on;const el=app.querySelector('.side.rival .who small');if(el)el.innerHTML=on?'<span class="thinking">réfléchit<i>…</i></span>':LEVELS[S.level][0];else render()},""")
    js=once(js,"function render() {\n  const g = S.game;","let lastBoardNode=null,lastBoardHTML=null;\nfunction render() {\n  const g = S.game;")
    js=once(js,"  app.querySelector('.board').innerHTML = html;\n}","""  const board=app.querySelector('.board');
  if(board===lastBoardNode&&html===lastBoardHTML)return;
  const handX=board.querySelector('.hand')?.scrollLeft||0;
  const mineX=board.querySelector('.mine-field')?.scrollLeft||0;
  const rivalX=board.querySelector('.field.rival')?.scrollLeft||0;
  board.innerHTML=html;lastBoardNode=board;lastBoardHTML=html;
  const hand=board.querySelector('.hand');if(hand)hand.scrollLeft=handX;
  const mine=board.querySelector('.mine-field');if(mine)mine.scrollLeft=mineX;
  const rival=board.querySelector('.field.rival');if(rival)rival.scrollLeft=rivalX;
}""")
    js=once(js,'<button class="btn" data-sp>Animations :','<button class="btn" data-perf>Graphismes : fluidité / effets</button>\n    <button class="btn" data-sp>Animations :')
    js=once(js,"  sc.querySelector('[data-sp]').onclick = () =>","  sc.querySelector('[data-perf]').onclick=()=>{Perf.toggle();closeSheet();toast(Perf.mode==='fluide'?'Fluidité maximum':'Effets complets',1600)};\n  sc.querySelector('[data-sp]').onclick = () =>")
    js=once(js,"const spark=Array.from({length:13}","const spark=Array.from({length:Perf.mode==='fluide'?6:13}")
    js=once(js,"SIMULATEUR TACTIQUE · CYBERPUNK TCG · STABILITÉ 1.1","SIMULATEUR TACTIQUE · CYBERPUNK TCG · PERFORMANCE 1.0.2")
    html=html[:a]+js+html[b:]
    html=once(html,"</style>",css+"\n</style>")
    Path(asset).write_text(html,encoding="utf8")
    print("Optimized mobile HTML and separate AI worker:",len(html),len(worker))

if __name__=="__main__":
    if len(sys.argv)!=2:raise SystemExit("usage: performance_patch.py /path/index.html")
    patch(sys.argv[1])
