'use strict';
module.exports=async function runLastB(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,D=presetDecks(),tests=[];
 const make=()=>{const g=Game.create([D['the-heist'],D['embracing-power']],[FastPolicy,FastPolicy],{seed:2003,hooks:{sim:true}});g.s.phase='main';g.s.active=0;return g};
 const put=(g,id,p=0)=>{const c=g.newInst(id,p);g.P(p).field.push(c);return c};
 const gig=(uid,value,sides=8)=>({uid,value,sides});
 async function check(id,clause,fn){try{await fn();tests.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id})}catch(e){tests.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,1000)})}}
 await check('judy-alvarez-nothing-to-doubt','pay-one-to-reveal-play-top-unit',async()=>{const g=make(),p=g.P(0),u=put(g,'judy-alvarez-nothing-to-doubt'),top=g.newInst('corpo-security',0);p.deck.unshift(top);p.eddies=[{uid:720000,ready:true}];await g.activate(0,u.uid,0);assert.equal(g.onField(top)||p.hand.includes(top),true);assert.equal(u.ready,false)});
 await check('lizzy-wizzy-delicate-weapon','play-free-low-cost-program-then-bottom-deck',async()=>{const g=make(),p=g.P(0),u=put(g,'lizzy-wizzy-delicate-weapon'),pr=g.newInst('afterparty-at-lizzie-s',0);p.hand=[pr];await CARDS[u.id].onPlay(g,u,0);assert.equal(p.deck.includes(pr),true);assert.equal(g.hasKw(u,'BLOCKER'),true)});
 await check('misty-olszewski-mender-of-broken-spirits','no-attack-and-correct-type-reveal-recovers-card',async()=>{const g=make(),p=g.P(0),u=put(g,'misty-olszewski-mender-of-broken-spirits'),top=g.newInst('corpo-security',0);p.deck=[top];p.eddies=[{uid:720001,ready:false}];assert.equal(g.canAttackNow(u),false);await g.emit('turnEnd',{p:0});assert.equal(p.hand.includes(top),true);assert.equal(p.eddies[0].ready,true)});
 await check('placide-voodoo-sentinel','optional-discard-program-to-bottom-rival-unit',async()=>{const g=make(),p=g.P(0),u=put(g,'placide-voodoo-sentinel'),enemy=put(g,'animals-wrecker',1),pr=g.newInst('floor-it',0);p.hand=[pr];await CARDS[u.id].onPlay(g,u,0);assert.equal(p.trash.includes(pr),true);assert.equal(g.P(1).deck.includes(enemy),true)});
 await check('rogue-amendiares-queen-of-the-afterlife','first-other-unit-steal-readies-two-eddies-once',async()=>{const g=make(),p=g.P(0),rogue=put(g,'rogue-amendiares-queen-of-the-afterlife'),actor=put(g,'animals-wrecker');p.eddies=[{uid:720002,ready:false},{uid:720003,ready:false}];await g.emit('steal',{p:0,unit:actor,gigs:[gig(720004,3)]});assert.equal(p.eddies.every(e=>e.ready),true);assert.equal(rogue.flags.usedRogue,true)});
 await check('pyramid-song','minimum-d4-enables-both-debuff-and-bottom-zero-unit',async()=>{const g=make(),p=g.P(0),c=g.newInst('pyramid-song',0),enemy=put(g,'japantown-jonin',1);p.gigs=[gig(720005,1,4)];await CARDS[c.id].onPlay(g,c,0);assert.equal(g.P(1).deck.includes(enemy),true)});
 await check('three-mouths-one-desire','one-minimum-gig-lets-take-two-of-top-three',async()=>{const g=make(),p=g.P(0),cards=[g.newInst('corpo-security',0),g.newInst('animals-wrecker',0),g.newInst('mantis-blades',0)];p.deck.unshift(...cards);p.gigs=[gig(720006,1,4)];const n=p.hand.length;await CARDS['three-mouths-one-desire'].onPlay(g,g.newInst('three-mouths-one-desire',0),0);assert.equal(p.hand.length,n+2);assert.equal(cards.filter(c=>p.hand.includes(c)).length,2)});
 await check('jackie-welles-pour-one-out-for-me','first-blue-card-may-make-gig-minimum-and-draw',async()=>{const g=make(),p=g.P(0),l=g.newInst('jackie-welles-pour-one-out-for-me',0),blue=g.newInst('delamain-rideshare-ai',0);p.legends=[l];l.faceUp=true;p.gigs=[gig(720007,3,8)];const n=p.hand.length;await g.emit('cardPlayed',{p:0,inst:blue,def:CARDS[blue.id]});assert.equal(p.tf.jackieBlue,true);assert.equal(p.gigs[0].value,1);assert.equal(p.hand.length,n+1)});
 // Official English: "another friendly Unit steals a Gig with value less than ITS power"
 // -> compared to the STEALING Unit's power. Swordwise Huscle (3) stealing a 3 must not
 // trigger even though Rogue has 4 power; Animals Wrecker (10) stealing a 6 must trigger.
 await check('rogue-amendiares-queen-of-the-afterlife','compares-gig-to-stealing-unit-power',async()=>{const g=make(),p=g.P(0),rogue=put(g,'rogue-amendiares-queen-of-the-afterlife'),small=put(g,'swordwise-huscle'),big=put(g,'animals-wrecker');assert.equal(g.eff(rogue),4);assert.equal(g.eff(small),3);p.eddies=[{uid:720102,ready:false},{uid:720103,ready:false}];await g.emit('steal',{p:0,unit:small,gigs:[gig(720104,3)]});assert.equal(p.eddies.some(e=>e.ready),false);assert.notEqual(rogue.flags.usedRogue,true);await g.emit('steal',{p:0,unit:big,gigs:[gig(720105,6)]});assert.equal(p.eddies.every(e=>e.ready),true);assert.equal(rogue.flags.usedRogue,true)});
 // Official English: "A Rival discards 1. If THE card's cost equals the value of a friendly Gig,
 // that Rival discards 1 more" -> the DISCARDED card's cost, not Caliber's own cost (5).
 await check('caliber-totentanz-s-top-dog','defeated-extra-discard-depends-on-discarded-card-cost',async()=>{
   const g=make(),me=g.P(0),riv=g.P(1),cal=g.newInst('caliber-totentanz-s-top-dog',0);
   me.gigs=[gig(720110,5,8)];riv.hand=[g.newInst('animals-wrecker',1),g.newInst('animals-wrecker',1),g.newInst('animals-wrecker',1)];
   await CARDS[cal.id].onDefeated(g,cal,0);assert.equal(riv.hand.length,2,'cost-6 discard vs Gig 5: exactly one discard');
   const g2=make(),me2=g2.P(0),riv2=g2.P(1),cal2=g2.newInst('caliber-totentanz-s-top-dog',0);
   me2.gigs=[gig(720111,3,8)];riv2.hand=[g2.newInst('swordwise-huscle',1),g2.newInst('swordwise-huscle',1),g2.newInst('swordwise-huscle',1)];
   await CARDS[cal2.id].onDefeated(g2,cal2,0);assert.equal(riv2.hand.length,1,'cost-3 discard vs Gig 3: one more discard')});
 // Official English: "Set A PLAYER'S Gig to the same value as ANOTHER PLAYER'S Gig".
 await check('padre-man-of-the-cross','spend-copies-only-between-two-different-players',async()=>{
   const g=make(),me=g.P(0),riv=g.P(1),l=g.newInst('padre-man-of-the-cross',0),ab=CARDS[l.id].abilities[0];
   me.gigs=[gig(720120,3,8),gig(720121,7,8)];riv.gigs=[];
   assert.equal(!!ab.cond(g,l,0),false,'no rival Gig: nothing to copy across players');
   riv.gigs=[gig(720122,5,8)];assert.equal(!!ab.cond(g,l,0),true);
   await ab.run(g,l,0);
   const mine=me.gigs.map(d=>d.value).sort(),theirs=riv.gigs.map(d=>d.value);
   assert.notDeepEqual(mine,[7,7],'must not copy one friendly Gig onto another friendly Gig');
   assert.notDeepEqual(mine,[3,3],'must not copy one friendly Gig onto another friendly Gig');
   assert.ok(mine.includes(5)||[3,7].includes(theirs[0]),'one Gig took the value of the other player\'s Gig')});
 return {count:tests.length,passed:tests.filter(x=>x.status==='PASS').length,failed:tests.filter(x=>x.status==='FAIL').length,tests};
};
