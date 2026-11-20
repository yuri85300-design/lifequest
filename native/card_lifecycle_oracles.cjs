'use strict';
/**
 * One independent end-to-end entry scenario per card. This is a LIFECYCLE
 * oracle, not an oracle for every clause in its effect text.
 * Each card is brought into a real Game, with zones/owner, timing windows,
 * legal destination and UID integrity verified. Outputs JSON evidence.
 */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const box={console,performance,Date,Math,structuredClone,setTimeout,clearTimeout};
box.window=box;box.globalThis=box;vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(__dirname,'engine.js'),'utf8')+
 '\nglobalThis.__audit={Game,GameOver,CARDS,presetDecks,FastPolicy};',box);
const {Game,GameOver,CARDS,presetDecks,FastPolicy}=box.__audit;
const decks=presetDecks(),cards=Object.values(CARDS);
const reports=[];
function fixture(index){
 const g=Game.create([decks['the-heist'],decks['embracing-power']],[FastPolicy,FastPolicy],{seed:41000+index*167,hooks:{sim:true}});
 g.s.phase='main';g.s.active=0;
 for(let p=0;p<2;p++){
   g.P(p).eddies=Array.from({length:20},(_,n)=>({uid:600000+p*100+n,ready:true}));
   g.P(p).gigs=[{uid:700000+p*100,sides:6,value:2},{uid:700001+p*100,sides:8,value:3}];
 }
 g.P(0).field.push(g.newInst('animals-wrecker',0));
 g.P(1).field.push(g.newInst('animals-wrecker',1));
 g.P(1).field.push(g.newInst('corpo-security',1));
 return g;
}
function integrity(g){
 const uidToPlace=new Map();
 for(let i=0;i<2;i++){
  const p=g.P(i);
  for(const zone of ['deck','hand','field','trash','removed','legends']){
   for(const c of p[zone]){
    assert(!uidToPlace.has(c.uid),'duplicate UID '+c.uid+' in '+zone+' previous '+uidToPlace.get(c.uid));
    uidToPlace.set(c.uid,zone);
    if(zone==='deck')assert.equal(c.owner,i,'card shuffled into rival deck');
    for(const gr of c.gear){
      assert(!uidToPlace.has(gr.uid),'duplicate Gear UID '+gr.uid);
      uidToPlace.set(gr.uid,'gear');
    }
   }
  }
  assert.equal(new Set(p.gigs.map(d=>d.uid)).size,p.gigs.length,'duplicate gig within player');
 }
 const gigs=[...g.P(0).gigs,...g.P(1).gigs].map(x=>x.uid);
 assert.equal(new Set(gigs).size,gigs.length,'duplicate gig across players');
}
async function tryCard(c,index){
 const out={id:c.id,type:c.type,entry:'NOT_STARTED',destination:null,oracles:[],scenario:'rich battlefield',fullSemanticCertification:false};
 const g=fixture(index),p=g.P(0);
 try{
  let card=g.newInst(c.id,0);
  if(c.type==='Legend'){
   p.legends=[card];card.faceUp=false;
   await g.withTimingWindow(()=>g.callLegend(0,true));
   assert.equal(card.faceUp,true,'selected Legend was not revealed');
   out.destination='legends';
   out.oracles.push('face-down Legend called and revealed');
  }else{
   p.hand.unshift(card);
   if(c.type==='Gear'){
    const candidates=g.gearHosts(0).filter(h=>!c.hostFilter||c.hostFilter(g,h,0));
    if(!candidates.length)throw Error('NO_LEGAL_HOST_IN_FIXTURE');
    await g.withTimingWindow(()=>g.playCard(0,card.uid,candidates[0].uid,{free:true}));
    assert(!p.hand.includes(card),'Gear remained in hand after playing');
    assert(candidates[0].gear.includes(card),'Gear not attached to declared legal host');
    out.destination='gear';
    out.oracles.push('Gear attached to compatible friendly host');
   }else{
    await g.withTimingWindow(()=>g.playCard(0,card.uid,null,{free:true}));
    assert(!p.hand.includes(card),'Card remained in hand after playing');
    out.destination=g.where(card.uid)?.zone||'out-of-play';
    out.oracles.push('Card play removed instance from hand');
    if(c.type==='Unit'&&out.destination==='field')out.oracles.push('Unit entered battlefield');
    if(c.type==='Program'&&!['trash','deck','hand','removed','out-of-play'].includes(out.destination))throw Error('Program remains in illegal zone '+out.destination);
   }
  }
  integrity(g);
  out.entry='PASS';
  out.oracles.push('Unique card/Gig IDs and ownership preserved');
 }catch(e){
  if(e instanceof GameOver){
    integrity(g);out.entry='GAME_ENDED';out.oracles.push('Game terminated by rules rather than simulator cap');
  }else{out.entry='FAIL';out.error=String(e.stack||e).slice(0,800)}
 }
 return out;
}
(async()=>{
 for(let n=0;n<cards.length;n++)reports.push(await tryCard(cards[n],n));
 const failed=reports.filter(r=>r.entry==='FAIL');
 const summary={total:reports.length,passed:reports.filter(r=>r.entry==='PASS').length,gameEnded:reports.filter(r=>r.entry==='GAME_ENDED').length,
  failed:failed.length,lifecycleTested:reports.filter(r=>r.entry!=='FAIL').length,semanticFullyCertified:0,
  perCard:reports};
 const out=path.join(__dirname,'..','audit-results');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'card-lifecycle.json'),JSON.stringify(summary,null,2));
 console.log('PER-CARD LIFECYCLE',JSON.stringify({total:summary.total,passed:summary.passed,gameEnded:summary.gameEnded,failed:summary.failed,semanticFullyCertified:0}));
 for(const t of failed)console.log('FAIL',t.id,t.error);
 if(summary.total!==150||summary.failed)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
