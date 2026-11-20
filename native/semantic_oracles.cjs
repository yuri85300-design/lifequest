'use strict';
// Targeted independent behavioural oracles grounded in current English card pages.
// These tests deliberately do not claim exhaustive coverage of any card.
// Exported as a function so CI and in-memory V8 runners use the SAME assertions.
// Independent CI proof: positive and negative branch coverage.\nmodule.exports=async function runSemanticOracles(api,assert){
 const {Game,GameOver,CARDS,presetDecks,FastPolicy}=api;
 const decks=presetDecks(),tests=[];
 const cite=id=>'https://cyberpunktcg.com/cards/'+id;
 const make=(seed=43)=>{
  const g=Game.create([decks['the-heist'],decks['embracing-power']],[FastPolicy,FastPolicy],{seed,hooks:{sim:true}});
  g.s.phase='main';g.s.active=0;return g;
 };
 const put=(g,id,p=0)=>{
  const u=g.newInst(id,p);g.P(p).field.push(u);return u;
 };
 const gig=(uid,value,sides=6)=>({uid,value,sides});
 async function check(id,clause,fn,reference=cite(id)){
  try{await fn();tests.push({id,clause,reference,status:'PASS'})}
  catch(e){tests.push({id,clause,reference,status:'FAIL',error:String(e.stack||e).slice(0,900)})}
 }
 await check('johnny-silverhand-never-stop-fighting','beta-iconic-no-sell',()=>{
  const g=make(),j=g.newInst('johnny-silverhand-never-stop-fighting',0);
  assert.equal(CARDS[j.id].sell,false);assert.equal(g.sellable(j),false);
 },'https://cyberpunktcg.com/errata');
 await check('johnny-silverhand-never-stop-fighting','always-win-vs-corpo-even-if-weaker',async()=>{
  const g=make(),j=put(g,'johnny-silverhand-never-stop-fighting'),enemy=put(g,'meredith-stout-stone-cold-corpo',1);
  enemy.mods.push({power:20,dur:'turn'});j.ready=false;
  await g.fight({attacker:j.uid,p:0,target:{kind:'unit',uid:enemy.uid}});
  assert.equal(g.onField(j),true);assert.equal(g.onField(enemy),false);assert.equal(j.ready,true);
 });
 await check('johnny-silverhand-never-stop-fighting','ready-only-first-fight-victory-per-turn',async()=>{
  const g=make(),j=put(g,'johnny-silverhand-never-stop-fighting');
  for(let n=0;n<2;n++){
   const enemy=put(g,'corpo-security',1);j.ready=false;
   await g.fight({attacker:j.uid,p:0,target:{kind:'unit',uid:enemy.uid}});
   assert.equal(g.onField(enemy),false);
   assert.equal(j.ready,n===0);
  }
 });
 await check('corpo-security','cannot-attack-but-can-block',()=>{
  const g=make(),u=put(g,'corpo-security');
  assert.equal(g.canAttackNow(u),false);assert.equal(g.hasKw(u,'BLOCKER'),true);
 });
 await check('kiroshi-optics','only-face-up-legends-are-gear-hosts',()=>{
  const g=make(),p=g.P(0);p.legends.forEach(l=>l.faceUp=false);
  const u=put(g,'corpo-security');assert.equal(g.gearHosts(0).length,1);
  p.legends[0].faceUp=true;assert.equal(g.gearHosts(0).length,2);
  assert.equal(g.gearHosts(0).includes(p.legends[1]),false);
  assert.equal(g.gearHosts(0).includes(u),true);
 },'https://cyberpunktcg.com/errata');
 await check('kiroshi-optics','attack-peek-remains-face-down',async()=>{
  const g=make(),p=g.P(0),u=put(g,'6th-street-recruits'),gr=g.newInst('kiroshi-optics',0);
  u.gear.push(gr);p.legends.forEach(l=>l.faceUp=false);
  await CARDS[gr.id].onHostAttack(g,gr,u,0);
  assert.equal(p.legends.filter(l=>l.known).length,1);
  assert.equal(p.legends.filter(l=>l.faceUp).length,0);
 });
 await check('zetatech-berserk','face-up-legend-discount-and-floor',()=>{
  const g=make(),p=g.P(0),gear=g.newInst('zetatech-berserk',0);
  p.legends.forEach(l=>l.faceUp=false);
  assert.equal(g.costOf(gear,0),6);
  p.legends[0].faceUp=true;assert.equal(g.costOf(gear,0),5);
  p.legends.forEach(l=>l.faceUp=true);assert.equal(g.costOf(gear,0),3);
 });
 await check('viktor-vektor-drop-your-illusions','first-cyberware-only-discount',async()=>{
  const g=make(),p=g.P(0),v=put(g,'viktor-vektor-drop-your-illusions'),gr=g.newInst('gorilla-arms',0);
  p.legends.forEach(l=>l.faceUp=false);
  assert.equal(g.costOf(gr,0),1);
  p.eddies=Array.from({length:10},(_,n)=>({uid:95000+n,ready:true}));
  p.hand.push(gr);
  await g.withTimingWindow(()=>g.playCard(0,gr.uid,v.uid));
  assert.equal(v.gear.some(x=>x.uid===gr.uid),true);
  assert.equal(p.tf.cyberPlayed,true);
  const next=g.newInst('zetatech-berserk',0);
  assert.equal(g.costOf(next,0),6);
 });
 await check('riot-shield','rival-go-solo-costs-two-extra',()=>{
  const g=make(),host=put(g,'corpo-security'),shield=g.newInst('riot-shield',0);
  const rival=g.P(1).legends.find(l=>CARDS[l.id].cost!==null)||g.newInst('adam-smasher-ender-of-legends',1);
  const before=g.costOf(rival,1,'solo');
  host.gear.push(shield);
  assert.equal(g.hasKw(host,'BLOCKER'),true);
  assert.equal(g.costOf(rival,1,'solo'),before+2);
 });
 await check('adrenaline-converter','adrenaline-only-when-behind-by-two-gigs',()=>{
  const g=make(),host=put(g,'corpo-security'),gr=g.newInst('adrenaline-converter',0);
  host.gear.push(gr);
  g.P(0).gigs=[gig(91001,2)];g.P(1).gigs=[gig(91002,1),gig(91003,2)];
  assert.equal(g.hasKw(host,'ADRENALINE'),false);
  g.P(1).gigs.push(gig(91004,3));
  assert.equal(g.hasKw(host,'ADRENALINE'),true);
 });
 await check('towerfall','when-behind-two-effects-apply-in-order',async()=>{
  const g=make(),p=g.P(0),r=g.P(1),a=put(g,'corpo-security',1),b=put(g,'animals-wrecker',1);
  p.gigs=[gig(91001,1)];r.gigs=[gig(91002,6)];
  assert.equal(g.lessSC(0),true);
  await CARDS['towerfall'].onPlay(g,g.newInst('towerfall',0),0);
  assert.equal(g.onField(a),false);
  assert.equal(g.P(1).deck.includes(a),true);
  assert.equal(g.onField(b),true);
  assert.equal(g.eff(b),5);
 });
 await check('corporate-surveillance','only-ready-rival-units-cost-four-or-less',async()=>{
  const g=make(),r=put(g,'corpo-security',1),expensive=put(g,'animals-wrecker',1),t=g.newInst('corporate-surveillance',0);
  assert.equal(CARDS[t.id].canPlay(g,0),true);
  await CARDS[t.id].onPlay(g,t,0);
  assert.equal(r.ready,false);assert.equal(expensive.ready,true);
 });
 await check('gorilla-arms','first-steal-only-additional-different-value',async()=>{
  const g=make(),host=put(g,'6th-street-recruits'),gr=g.newInst('gorilla-arms',0);
  host.gear.push(gr);
  g.P(0).gigs=[gig(91001,2)];
  const d1=gig(91002,2),d2=gig(91003,5),d3=gig(91004,6);
  g.P(1).gigs=[d1,d2,d3];
  const first=await g.stealGig(0,d1,host);
  assert.equal(first,true);
  assert.equal(g.P(0).gigs.includes(d1),true);
  assert.equal(g.P(0).gigs.includes(d3)||g.P(0).gigs.includes(d2),true);
  assert.equal(g.P(0).gigs.length,3);
  assert.equal(gr.flags.usedGorilla,true);
  const left=g.P(1).gigs[0];
  await g.stealGig(0,left,host);
  assert.equal(g.P(0).gigs.length,4);
 });
 await check('mandibular-upgrade','gear-grants-blocker-to-host',()=>{
  const g=make(),u=put(g,'animals-wrecker'),gr=g.newInst('mandibular-upgrade',0);
  assert.equal(g.hasKw(u,'BLOCKER'),false);u.gear.push(gr);
  assert.equal(g.hasKw(u,'BLOCKER'),true);
 });
 await check('nocturne-op55-n1','fixed-payment-if-fixer-empty',()=>{
  const g=make(),p=g.P(0),c=g.newInst('nocturne-op55-n1',0);
  const standard=g.costOf(c,0);
  p.fixer=[];assert.equal(g.costOf(c,0),1);
  p.fixer=[4,6];assert.equal(g.costOf(c,0),standard);
 });
 await check('gorilla-arms','no-bonus-if-all-rival-gig-values-already-friendly',async()=>{
  const g=make(),host=put(g,'animals-wrecker'),gr=g.newInst('gorilla-arms',0);
  host.gear.push(gr);g.P(0).gigs=[gig(93001,2)];
  const a=gig(93002,3),b=gig(93003,2);
  g.P(1).gigs=[a,b];
  await g.stealGig(0,a,host);
  assert.equal(g.P(0).gigs.length,2);
  assert.equal(g.P(1).gigs.includes(b),true);
 });
 await check('adrenaline-converter','adrenaline-removes-itself-when-gig-lead-disappears',()=>{
  const g=make(),host=put(g,'corpo-security'),gr=g.newInst('adrenaline-converter',0);
  host.gear.push(gr);g.P(0).gigs=[gig(93001,1)];
  g.P(1).gigs=[gig(93002,2),gig(93003,3),gig(93004,4)];
  assert.equal(g.hasKw(host,'ADRENALINE'),true);
  g.P(1).gigs.pop();assert.equal(g.hasKw(host,'ADRENALINE'),false);
 });
 await check('viktor-vektor-drop-your-illusions','non-cyberware-does-not-consume-first-cyberware-discount',async()=>{
  const g=make(),p=g.P(0),v=put(g,'viktor-vektor-drop-your-illusions');
  p.eddies=Array.from({length:10},(_,n)=>({uid:94000+n,ready:true}));
  const ordinary=g.newInst('riot-shield',0);p.hand.push(ordinary);
  await g.withTimingWindow(()=>g.playCard(0,ordinary.uid,v.uid));
  assert.equal(p.tf.cyberPlayed||false,false);
  assert.equal(g.costOf(g.newInst('gorilla-arms',0),0),1);
 });
 await check('corporate-surveillance','cannot-be-played-without-ready-eligible-target',()=>{
  const g=make(),expensive=put(g,'animals-wrecker',1),c=g.newInst('corporate-surveillance',0);
  assert.equal(CARDS[c.id].canPlay(g,0),false);
  const cheap=put(g,'corpo-security',1);cheap.ready=false;
  assert.equal(CARDS[c.id].canPlay(g,0),false);
  cheap.ready=true;assert.equal(CARDS[c.id].canPlay(g,0),true);
  assert.equal(expensive.ready,true);
 });
 await check('towerfall','not-behind-selects-only-one-effect',async()=>{
  const g=make(),weak=put(g,'maelstrom-zealots',1),strong=put(g,'animals-wrecker',1);
  g.P(0).gigs=[gig(94001,6)];g.P(1).gigs=[gig(94002,1)];
  assert.equal(g.lessSC(0),false);
  await CARDS['towerfall'].onPlay(g,g.newInst('towerfall',0),0);
  const weakGone=!g.onField(weak),strongDebuffed=g.eff(strong)===5;
  assert.equal(weakGone&&strongDebuffed,false);
  assert.equal(weakGone||strongDebuffed,true);
 });
 await check('kiroshi-optics','no-facedown-legend-does-not-reveal-anything',async()=>{
  const g=make(),p=g.P(0),u=put(g,'6th-street-recruits'),gr=g.newInst('kiroshi-optics',0);
  u.gear.push(gr);p.legends.forEach(l=>l.faceUp=true);
  await CARDS[gr.id].onHostAttack(g,gr,u,0);
  assert.equal(p.legends.filter(l=>l.known).length,0);
  assert.equal(p.legends.every(l=>l.faceUp),true);
 });
 return {count:tests.length,passed:tests.filter(t=>t.status==='PASS').length,failed:tests.filter(t=>t.status==='FAIL').length,tests};
};
