'use strict';
/* PRIME 2.7.5 — cross-card chaos audit.
 * Random LEGAL decks drawn from all 150 cards, played by a uniformly random
 * policy (explores combinations a scoring AI never tries) and by FastPolicy.
 * After every action we check engine invariants:
 *   - every card instance exists exactly once (no duplication, no loss)
 *   - each player still owns exactly the cards they started with
 *   - power values are finite numbers, Gig values within their die
 *   - the game reaches GameOver or the simulation limit without throwing
 * TECHNICAL PASS != official card certification.
 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const {performance}=require('node:perf_hooks');
const ctx={console,performance,Date,Math,setTimeout,clearTimeout,structuredClone};
ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
const enginePath=process.env.PRIME_ENGINE_PATH||path.join(__dirname,'engine.js');
vm.runInContext(fs.readFileSync(enginePath,'utf8')+
 '\nglobalThis.__A={Game,GameOver,CARDS,FastPolicy,validateDeck,deckRamLimits};',ctx);
const {Game,GameOver,CARDS,FastPolicy,validateDeck,deckRamLimits}=ctx.__A;
const GAMES=Number(process.env.CHAOS_GAMES||600), MAX_TURNS=Number(process.env.CHAOS_TURNS||60);
const ids=Object.keys(CARDS), legends=ids.filter(id=>CARDS[id].type==='Legend');

function lcg(seed){let s=seed>>>0||1;return()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;}
function randomDeck(r){
  for(let tries=0;tries<200;tries++){
    const pool=legends.slice(),lg=[];
    while(lg.length<3&&pool.length){const id=pool.splice(Math.floor(r()*pool.length),1)[0];
      if(!lg.some(x=>CARDS[x].name===CARDS[id].name))lg.push(id);}
    const lim=deckRamLimits(lg);
    const legal=ids.filter(id=>{const d=CARDS[id];return d.type!=='Legend'&&lim[d.color]>0&&(d.ram||0)<=lim[d.color];});
    if(legal.length<14)continue;
    const main=[],cnt={};
    while(main.length<40){const id=legal[Math.floor(r()*legal.length)];if((cnt[id]||0)<3){cnt[id]=(cnt[id]||0)+1;main.push(id);}}
    const deck={legends:lg,main};
    if(!validateDeck(deck).length)return deck;
  }
  throw new Error('no legal random deck');
}
const pick=(g,a)=>a[Math.floor(g.rand()*a.length)];
const RandomPolicy={
  async mainAction(g,i,acts){const nonEnd=acts.filter(a=>a.type!=='end');
    if(!nonEnd.length||(acts.some(a=>a.type==='end')&&g.rand()<0.12))return {type:'end'};return pick(g,nonEnd);},
  async react(g,i,A,acts){return g.rand()<0.4?{type:'pass'}:pick(g,acts.length?acts:[{type:'pass'}]);},
  async choose(g,i,req){const o=req.options.map(x=>x.value).sort(()=>g.rand()-.5);
    const n=req.min+Math.floor(g.rand()*(Math.min(req.max,o.length)-req.min+1));return o.slice(0,Math.max(req.min,n));},
  async mulligan(g){return g.rand()<0.3;},
  dieScore(g,i,s){return g.rand()*s;},
};

function allInst(g){
  const out=[];
  for(const p of g.s.players){
    for(const z of ['deck','hand','field','trash','removed','legends'])
      for(const c of p[z]||[]){out.push(c);for(const gr of c.gear||[])out.push(gr);}
    for(const e of p.eddies||[])out.push(e.card);
    if(p.limbo)out.push(p.limbo);
  }
  return out;
}
function check(g,start,where){
  const all=allInst(g),seen=new Set(),owned=[0,0];
  for(const c of all){
    if(seen.has(c.uid))throw new Error(`${where}: UID dupliqué ${c.uid} (${c.id})`);
    seen.add(c.uid);owned[c.owner]++;
    if(!CARDS[c.id])throw new Error(`${where}: carte inconnue ${c.id}`);
  }
  g.s.players.forEach((p,i)=>{
    for(const z of ['deck','hand','trash','removed'])for(const c of p[z])
      if(c.owner!==i)throw new Error(`${where}: ${c.id} (propriétaire ${c.owner}) dans la zone ${z} du joueur ${i}`);
    for(const e of p.eddies)if(e.card.owner!==i)throw new Error(`${where}: Eddie adverse ${e.card.id} chez le joueur ${i}`);
    for(const l of p.legends)if(l.owner!==i)throw new Error(`${where}: Légende ${l.id} chez le mauvais joueur`);
    if(p.hand.some(c=>c.gear&&c.gear.length))throw new Error(`${where}: carte en main avec équipement attaché`);
    for(const c of [...p.trash,...p.deck])if(c.gear&&c.gear.length)throw new Error(`${where}: ${c.id} garde un équipement hors du terrain`);
  });
  for(const i of [0,1])if(owned[i]!==start[i])
    throw new Error(`${where}: joueur ${i} possède ${owned[i]} cartes au lieu de ${start[i]}`);
  for(const u of g.allUnits()){const pw=g.power(u);
    if(typeof pw!=='number'||!Number.isFinite(pw))throw new Error(`${where}: puissance invalide ${g.name(u)}=${pw}`);}
  for(const p of g.s.players)for(const d of p.gigs)
    if(!(d.value>=1&&d.value<=d.sides))throw new Error(`${where}: Gig hors bornes d${d.sides}=${d.value}`);
}
function wrap(policy,g0,start,stats){
  const w=Object.create(policy);
  w.mainAction=async(g,i,acts)=>{check(g,start,'tour '+g.s.turn);stats.actions++;
    for(const a of acts)if(a.type==='play'){const c=g.byUid(a.uid);if(c)stats.played.add(c.id);}
    return policy.mainAction.call(policy,g,i,acts);};
  return w;
}
(async()=>{
  const report={engine:path.basename(enginePath),games:GAMES,maxTurns:MAX_TURNS,completed:0,incomplete:0,
    errors:[],slowest:0,actions:0,cardsSeenPlayable:0,certification:'TECHNICAL_ONLY'};
  const stats={actions:0,played:new Set()};
  const t0=performance.now();
  for(let n=0;n<GAMES;n++){
    const r=lcg(1000+n),decks=[randomDeck(r),randomDeck(r)];
    const pol=n%3===2?[FastPolicy,RandomPolicy]:[RandomPolicy,RandomPolicy];
    const start=[43,43];
    const g=Game.create(decks,[null,null],{seed:5000+n,hooks:{sim:true}});
    g.deciders=pol.map(p=>wrap(p,g,start,stats));
    const ts=performance.now();
    try{
      const res=await g.run(MAX_TURNS);
      check(g,start,'fin');
      if(res instanceof GameOver)report.completed++;else report.incomplete++;
    }catch(e){
      report.errors.push({game:n,seed:5000+n,turn:g.s.turn,legends:decks.map(d=>d.legends),
        lastLog:g.s.log.slice(-4).map(x=>x.msg||x),error:String(e&&e.stack||e).split('\n').slice(0,4).join(' | ')});
    }
    report.slowest=Math.max(report.slowest,Math.round(performance.now()-ts));
  }
  report.actions=stats.actions;report.cardsSeenPlayable=stats.played.size;
  const nonLegend=ids.filter(id=>CARDS[id].type!=='Legend');
  report.nonLegendCards=nonLegend.length;
  report.neverPlayable=nonLegend.filter(id=>!stats.played.has(id));
  report.ms=Math.round(performance.now()-t0);
  report.status=report.errors.length?'FAIL':'PASS';
  console.log(JSON.stringify(report,null,1));
  if(report.errors.length)process.exitCode=1;
})();
