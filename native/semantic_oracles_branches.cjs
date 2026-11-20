'use strict';
module.exports=async function runChoiceBranches(api,assert){
 const {Game,CARDS,presetDecks,FastPolicy}=api,D=presetDecks(),out=[];
 const make=()=>{const g=Game.create([D['the-heist'],D['embracing-power']],[FastPolicy,FastPolicy],{seed:2701,hooks:{sim:true}});g.s.phase='main';g.s.active=0;return g};
 const put=(g,id,p=0)=>{const c=g.newInst(id,p);g.P(p).field.push(c);return c};
 const gig=(uid,value,sides=8)=>({uid,value,sides});
 const choose=(g,titleContains,choice)=>{const orig=g.pickOne.bind(g);g.pickOne=async (i,title,options,opt)=>title.includes(titleContains)?options[choice]?.value??null:orig(i,title,options,opt)};
 async function t(id,clause,fn){try{await fn();out.push({id,clause,status:'PASS',reference:'https://cyberpunktcg.com/cards/'+id})}catch(e){out.push({id,clause,status:'FAIL',error:String(e.stack||e).slice(0,950)})}}
 await t('dexter-deshawn-off-the-grid','call-can-choose-buff-instead-of-draw',async()=>{const g=make(),p=g.P(0),u=put(g,'animals-wrecker'),n=p.hand.length,base=g.eff(u),l=g.newInst('dexter-deshawn-off-the-grid',0);choose(g,'Dexter DeShawn : choisissez',0);await CARDS[l.id].onCall(g,l,0);assert.equal(g.eff(u),base+2);assert.equal(p.hand.length,n)});
 await t('wakako-okada-peace-and-harmony','call-can-debuff-rival-instead-of-drawing',async()=>{const g=make(),p=g.P(0),e=put(g,'animals-wrecker',1),l=g.newInst('wakako-okada-peace-and-harmony',0),base=g.eff(e),n=p.hand.length;choose(g,'Wakako : choisissez',0);await CARDS[l.id].onCall(g,l,0);assert.equal(g.eff(e),base-2);assert.equal(p.hand.length,n)});
 await t('muamar-reyes-el-capita-n','call-can-protect-friendly-from-combat-defeat',async()=>{const g=make(),l=g.newInst('muamar-reyes-el-capita-n',0),u=put(g,'corpo-security'),enemy=put(g,'animals-wrecker',1);choose(g,'Muamar Reyes : choisissez',0);await CARDS[l.id].onCall(g,l,0);assert.equal(g.hasFlag(u,'noFightDefeat'),true);await g.fight({attacker:enemy.uid,p:1,target:{kind:'unit',uid:u.uid}});assert.equal(g.onField(u),true)});
 await t('padre-man-of-the-cross','call-can-spend-rival-instead-of-drawing',async()=>{const g=make(),p=g.P(0),e=put(g,'animals-wrecker',1),l=g.newInst('padre-man-of-the-cross',0),n=p.hand.length;choose(g,'Padre : choisissez',0);await CARDS[l.id].onCall(g,l,0);assert.equal(e.ready,false);assert.equal(p.hand.length,n)});
 await t('fool-on-the-hill','rival-trash-option-discards-revealed-and-replaces-two',async()=>{const g=make(),p=g.P(0),a=g.newInst('animals-wrecker',0),b=g.newInst('corpo-security',0);p.deck.unshift(a,b);choose(g,'Fool on the Hill :',1);const n=p.hand.length;await CARDS['fool-on-the-hill'].onPlay(g,g.newInst('fool-on-the-hill',0),0);assert.equal(p.trash.includes(a)&&p.trash.includes(b),true);assert.equal(p.hand.length,n+2)});
 await t('pyramid-song','choose-bottom-zero-power-rival-without-minimum-d4',async()=>{const g=make(),p=g.P(0),enemy=put(g,'japantown-jonin',1);p.gigs=[gig(270010,2,4)];choose(g,'Pyramid Song : choisissez',1);await CARDS['pyramid-song'].onPlay(g,g.newInst('pyramid-song',0),0);assert.equal(g.P(1).deck.includes(enemy),true)});
 await t('tetratronic-rippler','optional-decline-does-not-discard-deck-top',async()=>{const g=make(),p=g.P(0),u=put(g,'animals-wrecker'),gr=g.newInst('tetratronic-rippler',0),top=p.deck[0];u.gear.push(gr);g.yesNo=async()=>false;await g.spendUnit(u);assert.equal(p.deck[0],top);assert.equal(p.trash.includes(top),false)});
 await t('el-sombrero-n-la-venganza-lenta','optional-decline-keeps-power-and-eddies',async()=>{const g=make(),p=g.P(0),u=put(g,'el-sombrero-n-la-venganza-lenta');p.gigs=[gig(270020,8)];p.eddies=[{uid:270021,ready:true},{uid:270022,ready:true}];g.yesNo=async()=>false;const n=g.eff(u);await CARDS[u.id].onAttack(g,u,0);assert.equal(g.eff(u),n);assert.equal(p.eddies.filter(e=>e.ready).length,2)});
 await t('alt-cunningham-mother-of-daemons','matched-cost-discard-prevents-gig-theft',async()=>{const g=make(),alt=put(g,'alt-cunningham-mother-of-daemons'),attacker=put(g,'animals-wrecker',1),card=g.newInst('floor-it',0),die=gig(270030,1);g.P(0).hand=[card];g.P(0).gigs=[die];const success=await g.stealGig(1,die,attacker);assert.equal(success,false);assert.equal(g.P(0).trash.includes(card),true);assert.equal(g.P(0).gigs.includes(die),true)});
 await t('johnny-silverhand-rocking-renegade','spend-ability-gives-rush-to-lagged-unit-versus-units',async()=>{const g=make(),p=g.P(0),l=g.newInst('johnny-silverhand-rocking-renegade',0),u=put(g,'animals-wrecker'),enemy=put(g,'corpo-security',1);p.legends=[l];l.faceUp=true;u.lag=true;enemy.ready=false;p.eddies=[{uid:270040,ready:true},{uid:270041,ready:true}];await g.activate(0,l.uid,0);assert.equal(g.hasFlag(u,'rushUnits'),true);assert.equal(g.canAttackNow(u),true);assert.equal(g.attackTargets(u).some(t=>t.uid===enemy.uid),true)});
 await t('viktor-vektor-drop-your-illusions','free-first-cyberware-consumes-once-per-turn-discount',async()=>{
  const g=make(),p=g.P(0),v=put(g,'viktor-vektor-drop-your-illusions');
  p.legends.forEach(l=>l.faceUp=false);
  const first=g.newInst('kiroshi-optics',0);
  p.hand.push(first);
  await g.withTimingWindow(()=>g.playCard(0,first.uid,v.uid,{free:true}));
  assert.equal(v.gear.includes(first),true);
  assert.equal(p.tf.cyberPlayed,true);
  assert.equal(g.costOf(g.newInst('gorilla-arms',0),0),4);
 });
 await t('viktor-vektor-drop-your-illusions','free-play-from-trash-also-consumes-cyberware-discount',async()=>{
  const g=make(),p=g.P(0),v=put(g,'viktor-vektor-drop-your-illusions');
  p.legends.forEach(l=>l.faceUp=false);
  const gr=g.newInst('kiroshi-optics',0);
  p.trash.push(gr);
  await g.withTimingWindow(()=>g.playCard(0,gr.uid,v.uid,{free:true,from:p.trash}));
  assert.equal(v.gear.includes(gr),true);
  assert.equal(p.trash.includes(gr),false);
  assert.equal(p.tf.cyberPlayed,true);
  assert.equal(g.costOf(g.newInst('zetatech-berserk',0),0),6);
 });
 await t('viktor-vektor-drop-your-illusions','free-non-cyberware-does-not-consume-cyberware-discount',async()=>{
  const g=make(),p=g.P(0),v=put(g,'viktor-vektor-drop-your-illusions');
  p.legends.forEach(l=>l.faceUp=false);
  const gr=g.newInst('riot-shield',0);
  p.hand.push(gr);
  await g.withTimingWindow(()=>g.playCard(0,gr.uid,v.uid,{free:true}));
  assert.equal(v.gear.includes(gr),true);
  assert.equal(!!p.tf.cyberPlayed,false);
  assert.equal(g.costOf(g.newInst('gorilla-arms',0),0),1);
 });
 await t('viktor-vektor-drop-your-illusions','discount-resets-for-next-turn-after-free-cyberware',async()=>{
  const g=make(),p=g.P(0),v=put(g,'viktor-vektor-drop-your-illusions');
  p.legends.forEach(l=>l.faceUp=false);
  const gr=g.newInst('kiroshi-optics',0);p.hand.push(gr);
  await g.withTimingWindow(()=>g.playCard(0,gr.uid,v.uid,{free:true}));
  assert.equal(g.costOf(g.newInst('gorilla-arms',0),0),4);
  await g.endTurn();
  assert.equal(!!p.tf.cyberPlayed,false);
  assert.equal(g.costOf(g.newInst('gorilla-arms',0),0),1);
 });
 await t('alt-cunningham-soulkiller-architect','free-next-program-consumes-one-use-discount',async()=>{
  const g=make(),p=g.P(0);p.legends.forEach(l=>l.faceUp=false);
  p.tf.progDiscount=2;
  const free=g.newInst('afterparty-at-lizzie-s',0),next=g.newInst('live-with-the-aftermath',0);
  p.hand.push(free);
  assert.equal(g.costOf(next,0),1);
  await g.withTimingWindow(()=>g.playCard(0,free.uid,null,{free:true}));
  assert.equal(p.tf.progDiscount,0);
  assert.equal(g.costOf(next,0),3);
 });
 await t('alt-cunningham-soulkiller-architect','paid-next-program-consumes-one-use-discount',async()=>{
  const g=make(),p=g.P(0);p.legends.forEach(l=>l.faceUp=false);
  p.tf.progDiscount=2;
  p.eddies=Array.from({length:8},(_,n)=>({uid:990010+n,ready:true}));
  const first=g.newInst('live-with-the-aftermath',0),next=g.newInst('live-with-the-aftermath',0);
  p.hand.push(first);
  assert.equal(g.costOf(first,0),1);
  await g.withTimingWindow(()=>g.playCard(0,first.uid,null,{}));
  assert.equal(p.tf.progDiscount,0);
  assert.equal(g.costOf(next,0),3);
 });
 await t('alt-cunningham-soulkiller-architect','invalid-program-play-does-not-consume-discount',async()=>{
  const g=make(),p=g.P(0);p.tf.progDiscount=2;
  await g.playCard(0,-1111,null,{free:true});
  assert.equal(p.tf.progDiscount,2);
 });
 return {count:out.length,passed:out.filter(x=>x.status==='PASS').length,failed:out.filter(x=>x.status==='FAIL').length,tests:out};
};
