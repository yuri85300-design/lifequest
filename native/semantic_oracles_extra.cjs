'use strict';
// Hand-curated supplementary behavioural expectations. Evidence, not full certification.
module.exports=async function runExtra(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,decks=presetDecks(),out=[];
 const make=()=>{const g=Game.create([decks['the-heist'],decks['embracing-power']],[FastPolicy,FastPolicy],{seed:43,hooks:{sim:true}});g.s.phase='main';g.s.active=0;return g};
 const put=(g,id,p=0)=>{const u=g.newInst(id,p);g.P(p).field.push(u);return u};
 const gig=(uid,value,sides=6)=>({uid,value,sides});
 async function test(id,clause,fn){try{await fn();out.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id})}catch(e){out.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,800)})}}
 await test('delamain-rideshare-ai','play-draw-two',async()=>{const g=make(),p=g.P(0),n=p.hand.length;await CARDS['delamain-rideshare-ai'].onPlay(g,g.newInst('delamain-rideshare-ai',0),0);assert.equal(p.hand.length,n+2)});
 await test('evelyn-parker-scheming-siren','attack-draw-and-lead-discard',async()=>{
  const g=make(),p=g.P(0),u=put(g,'evelyn-parker-scheming-siren'),n=p.hand.length;
  p.gigs=[gig(190001,1)];g.P(1).gigs=[gig(190002,8,8)];
  await CARDS[u.id].onAttack(g,u,0);assert.equal(p.hand.length,n+1);
  p.gigs=[gig(190001,9,10)];g.P(1).gigs=[gig(190002,1)];
  await CARDS[u.id].onAttack(g,u,0);assert.equal(p.hand.length,n+1);
 });
 await test('goro-takemura-losing-his-way','all-legends-visible-power-five',async()=>{
  const g=make(),u=put(g,'goro-takemura-losing-his-way'),p=g.P(0),base=g.eff(u);
  p.legends.forEach(x=>x.faceUp=false);await CARDS[u.id].onAttack(g,u,0);
  assert.equal(g.eff(u),base);p.legends.forEach(x=>x.faceUp=true);
  await CARDS[u.id].onAttack(g,u,0);assert.equal(g.eff(u),base+5);
 });
 await test('jacked-in-voodoo-boy','attack-gated-by-program-played',()=>{const g=make(),u=put(g,'jacked-in-voodoo-boy');u.lag=false;g.P(0).tf.playedProgram=false;assert.equal(g.canAttackNow(u),false);g.P(0).tf.playedProgram=true;assert.equal(g.canAttackNow(u),true)});
 await test('modded-kusanagi','only-own-end-turn-returns-hand',async()=>{const g=make(),u=put(g,'modded-kusanagi');g.s.active=1;await g.emit('turnEnd',{p:1});assert.equal(g.onField(u),true);g.s.active=0;await g.emit('turnEnd',{p:0});assert.equal(g.P(0).hand.includes(u),true)});
 await test('mt0d12-flathead','unblockable-only-while-behind',()=>{const g=make(),u=put(g,'mt0d12-flathead');g.P(0).gigs=[gig(190010,1)];g.P(1).gigs=[gig(190011,6)];assert.equal(CARDS[u.id].cantBeBlocked(g,u),true);g.P(0).gigs=[gig(190010,7,8)];assert.equal(CARDS[u.id].cantBeBlocked(g,u),false)});
 await test('modded-muramasa','readies-only-when-behind',async()=>{const g=make(),p=g.P(0),u=put(g,'modded-muramasa');p.gigs=[gig(190020,8,8)];g.P(1).gigs=[gig(190021,1)];u.ready=false;await g.emit('turnEnd',{p:0});assert.equal(u.ready,false);p.gigs=[gig(190020,1)];g.P(1).gigs=[gig(190021,8,8)];await g.emit('turnEnd',{p:0});assert.equal(u.ready,true)});
 await test('maxtac-squadron','readies-exhausted-faceup-legend',async()=>{const g=make(),p=g.P(0),u=put(g,'maxtac-squadron'),l=p.legends[0];p.legends.forEach(x=>x.faceUp=false);l.faceUp=true;l.ready=false;u.ready=false;await g.emit('turnEnd',{p:0});assert.equal(l.ready,true)});
 await test('mox-inciters','forced-rival-attack',async()=>{const g=make(),u=put(g,'mox-inciters'),enemy=put(g,'animals-wrecker',1);await CARDS[u.id].onPlay(g,u,0);assert.equal(g.hasFlag(enemy,'mustAttack'),true);assert.equal(g.hasKw(u,'BLOCKER'),true)});
 await test('nadia-fighting-through-grief','only-gigs-rush-when-behind-in-count',()=>{const g=make(),u=put(g,'nadia-fighting-through-grief');u.lag=true;g.P(0).gigs=[gig(190030,2)];g.P(1).gigs=[gig(190031,1),gig(190032,2)];assert.equal(g.canAttackNow(u),true);assert.equal(g.attackTargets(u).some(x=>x.kind==='gigs'),true);assert.equal(g.attackTargets(u).some(x=>x.kind==='unit'),false);g.P(0).gigs.push(gig(190033,3));assert.equal(g.canAttackNow(u),false)});
 await test('kerry-eurodyne-the-last-rockerboy','pay-spent-draw-two-if-eight-plus-gig',async()=>{const g=make(),p=g.P(0),u=put(g,'kerry-eurodyne-the-last-rockerboy'),src=g.sources(0).find(x=>x.inst===u),ab=CARDS[u.id].abilities[0];p.gigs=[gig(190040,7,8)];assert.equal(g.canActivate(0,src,ab),false);p.gigs=[gig(190040,8,8)];assert.equal(g.canActivate(0,src,ab),true);const n=p.hand.length;await g.activate(0,u.uid,0);assert.equal(p.hand.length,n+2);assert.equal(u.ready,false)});
 await test('saburo-arasaka-stubborn-patriarch','attack-aura-arasaka-only',()=>{const g=make(),l=g.newInst('saburo-arasaka-stubborn-patriarch',0),a=put(g,'adam-smasher-metal-over-meat'),other=put(g,'animals-wrecker');g.P(0).legends=[l];l.faceUp=true;const baseline=g.eff(a);g.s.attack={attacker:a.uid};assert.equal(g.eff(a),baseline+1);assert.equal(g.eff(other),CARDS[other.id].power);g.s.attack=null;assert.equal(g.eff(a),baseline)});
 await test('royce-don-t-call-me-simon','on-play-only-targets-power-at-most-two-without-lead',async()=>{const g=make(),p=g.P(0),weak=put(g,'japantown-jonin',1),strong=put(g,'animals-wrecker',1);p.gigs=[gig(190050,1)];g.P(1).gigs=[gig(190051,8,8)];await CARDS['royce-don-t-call-me-simon'].onPlay(g,g.newInst('royce-don-t-call-me-simon',0),0);assert.equal(g.onField(weak),false);assert.equal(g.onField(strong),true)});
 await test('bonnie-and-clyde','two-targets-when-outnumbered-by-two-gigs',async()=>{const g=make(),p=g.P(0),a=put(g,'corpo-security',1),b=put(g,'japantown-jonin',1);p.gigs=[gig(190060,1)];g.P(1).gigs=[gig(190061,2),gig(190062,3),gig(190063,4)];await CARDS['bonnie-and-clyde'].onPlay(g,g.newInst('bonnie-and-clyde',0),0);assert.equal(g.onField(a),false);assert.equal(g.onField(b),false)});
 await test('wild-in-the-streets','only-exhausted-targets-are-eligible',async()=>{const g=make(),u=put(g,'animals-wrecker',1),card=g.newInst('wild-in-the-streets',0);assert.equal(CARDS[card.id].canPlay(g,0),false);u.ready=false;assert.equal(CARDS[card.id].canPlay(g,0),true);await CARDS[card.id].onPlay(g,card,0);assert.equal(g.onField(u),false)});
 await test('floor-it','quick-minus-one-and-draw-one',async()=>{const g=make(),p=g.P(0),c=g.newInst('floor-it',0),enemy=put(g,'animals-wrecker',1),before=g.eff(enemy),n=p.hand.length;assert.equal(!!CARDS[c.id].quick,true);await CARDS[c.id].onPlay(g,c,0);assert.equal(g.eff(enemy),before-1);assert.equal(p.hand.length,n+1)});
 await test('trust-no-one','draw-if-already-controls-minimum-gig',async()=>{const g=make(),p=g.P(0),c=g.newInst('trust-no-one',0);p.gigs=[gig(190070,1,6)];const n=p.hand.length;await CARDS[c.id].onPlay(g,c,0);assert.equal(p.gigs[0].value,1);assert.equal(p.hand.length,n+1)});
 return {count:out.length,passed:out.filter(x=>x.status==='PASS').length,failed:out.filter(x=>x.status==='FAIL').length,tests:out};
};
