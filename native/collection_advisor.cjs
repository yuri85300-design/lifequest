'use strict';
/* Collection-aware deck advisor. Deterministic suggestions; no invented cards
 * or pretend ownership. Official legality is delegated to validateDeck.
 * This block is also embedded verbatim in prime_v220_runtime.html for APK.
 */
(function(root){
  const qty=v=>Number.isFinite(Number(v))?Math.max(0,Math.min(99,Math.floor(Number(v)))):0;
  const count=list=>(list||[]).reduce((out,id)=>(out[id]=(out[id]||0)+1,out),{});
  const clean=(raw,cards)=>Object.fromEntries(Object.entries(raw||{}).filter(([id])=>Object.prototype.hasOwnProperty.call(cards,id)).map(([id,n])=>[id,qty(n)]).filter(([,n])=>n>0));
  const safe=(d,legends,limits)=>d.type!=='Legend'&&limits[d.color]>0&&(d.ram||0)<=limits[d.color];
  const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function importText(raw,cards,previous={}){
    const result={...clean(previous,cards)},errors=[];
    const index=new Map();
    for(const d of Object.values(cards)){
      for(const v of [d.id,d.name,d.nameEn,[d.name,d.sub].filter(Boolean).join(' '),[d.nameEn,d.subEn].filter(Boolean).join(' ')]){
        if(v&&!index.has(normal(v)))index.set(normal(v),d.id);
      }
    }
    let parsed=0;
    for(const line of String(raw).split(/[\r\n;]+/).map(x=>x.trim()).filter(Boolean)){
      let name=line,amount=1;
      const prefix=line.match(/^(\d{1,2})\s*[x×*]\s*(.+)$/i);
      const suffix=!prefix&&line.match(/^(.+?)\s*[x×*]\s*(\d{1,2})$/i);
      if(prefix){amount=prefix[1];name=prefix[2];}
      else if(suffix){name=suffix[1];amount=suffix[2];}
      const id=index.get(normal(name));
      if(!id){errors.push(line);continue;}
      const n=qty(amount);
      if(!n){errors.push(line);continue;}
      result[id]=Math.min(99,(result[id]||0)+n);parsed+=n;
    }
    return {owned:result,errors,parsed};
  }
  function similarity(d,legends,template,cardSet){
    const counts=count(template.main),legTags=new Set(legends.flatMap(id=>cardSet[id]?.tags||[]));
    const t=Object.keys(counts).map(id=>cardSet[id]).filter(Boolean);
    const tags=new Set(t.flatMap(x=>x.tags||[]));
    let score=(counts[d.id]||0)*5;
    score+=(d.tags||[]).filter(x=>legTags.has(x)).length*1.3;
    score+=(d.tags||[]).filter(x=>tags.has(x)).length*.25;
    score+=d.sell?1.4:0;
    score+=d.type==='Unit'?1.3:d.type==='Gear'?.45:.65;
    score+=(d.cost??0)<=4?1.3:(d.cost??0)>=7?-1:0;
    score+=(d.kw||[]).includes('BLOCKER')?.7:0;
    return score;
  }
  function ownedDeck(legends,template,owned,cards,limitsFn,validate){
    const missingLegends=legends.filter(id=>!owned[id]);
    const lim=limitsFn(legends);
    const pool=Object.values(cards).filter(d=>safe(d,legends,lim)&&owned[d.id]>0)
      .map(d=>({d,available:Math.min(3,owned[d.id]),value:similarity(d,legends,template,cards)}));
    const main=[],used={},types={Unit:0,Gear:0,Program:0};
    while(main.length<40){
      const candidates=pool.filter(x=>(used[x.d.id]||0)<x.available);
      if(!candidates.length)break;
      const picked=candidates.map(x=>{
        const bonus={Unit:Math.max(-6,(23-types.Unit)*.2),Gear:Math.max(-5,(8-types.Gear)*.27),Program:Math.max(-5,(9-types.Program)*.26)}[x.d.type]||0;
        const repeat=(used[x.d.id]||0)*.45;
        return {...x,score:x.value+bonus-repeat};
      }).sort((a,b)=>b.score-a.score||a.d.id.localeCompare(b.d.id))[0];
      main.push(picked.d.id);used[picked.d.id]=(used[picked.d.id]||0)+1;types[picked.d.type]++;
    }
    const deck={name:'Collection · '+template.name,legends:legends.slice(),main};
    return {deck,used,missingLegends,needMain:Math.max(0,40-main.length),
      playable:!missingLegends.length&&validate(deck).length===0};
  }
  function suggest(raw,cards,templates,validate,limitsFn){
    const owned=clean(raw,cards),presets=Object.entries(templates)
      .filter(([,d])=>d&&Array.isArray(d.legends)&&Array.isArray(d.main)&&!validate(d).length);
    const ranked=presets.map(([id,deck])=>{
      const wanted=count(deck.main),missingMain=Object.entries(wanted).map(([cardId,n])=>({
        id:cardId,count:Math.max(0,n-Math.min(3,owned[cardId]||0))
      })).filter(x=>x.count>0);
      const missingLegends=deck.legends.filter(l=>!(owned[l]>0));
      const haveMain=deck.main.length-missingMain.reduce((n,x)=>n+x.count,0);
      const haveLegends=3-missingLegends.length;
      const own=ownedDeck(deck.legends,deck,owned,cards,limitsFn,validate);
      return {id,name:deck.name,deck,haveMain,haveLegends,missingMain,missingLegends,
        coverage:Math.round(100*(haveMain+haveLegends)/(deck.main.length+3)),
        missingCopies:missingMain.reduce((n,x)=>n+x.count,0)+missingLegends.length,
        playableAlternative:own};
    }).sort((a,b)=>a.missingCopies-b.missingCopies||b.haveMain-a.haveMain||a.id.localeCompare(b.id));
    let ownedBest=null;
    const legends=Object.values(cards).filter(c=>c.type==='Legend'&&owned[c.id]>0);
    const sets=[];
    // Bound combinatorics even for an almost complete 150-card collection.
    for(let i=0;i<legends.length&&sets.length<160;i++)
      for(let j=i+1;j<legends.length&&sets.length<160;j++)
        for(let k=j+1;k<legends.length&&sets.length<160;k++){
          const trio=[legends[i],legends[j],legends[k]];
          if(new Set(trio.map(x=>x.name)).size===3)sets.push(trio.map(x=>x.id));
        }
    for(const lg of sets)for(const target of ranked.slice(0,12)){
      const proposed=ownedDeck(lg,target.deck,owned,cards,limitsFn,validate);
      const score=proposed.deck.main.length*100+
        proposed.deck.main.reduce((v,id)=>v+(count(target.deck.main)[id]?2:0),0);
      if(!ownedBest||score>ownedBest.score)ownedBest={...proposed,score,basedOn:target.name};
    }
    return {owned,ranked,closest:ranked[0]||null,ownedBest,
      totalCopies:Object.values(owned).reduce((a,n)=>a+n,0),
      unique:Object.keys(owned).length};
  }

  // High-confidence engine-mechanic pairs, not card-certification claims.
  const PAIRS=[
    {a:'netwatch-netdriver',b:'tetratronic-rippler',why:'Épuiser un même hôte permet de piocher, puis éventuellement de défausser la carte du dessus.'},
    {a:'goro-takemura-vengeful-bodyguard',b:'corpo-security',why:'Goro renforce les options BLOQUEUR ; Corpo Security protège vos Gigs.'},
    {a:'evelyn-parker-beautiful-enigma',b:'animals-wrecker',why:'Un GANGER qui vole des Gigs peut déclencher le redressement d’un Eddie avec Evelyn.'},
    {a:'jackie-welles-pour-one-out-for-me',b:'delamain-cab',why:'Une première unité bleue déclenche l’ajustement de Gig de Jackie et une pioche conditionnelle.'},
    {a:'yorinobu-arasaka-steel-dragon',b:'field-operator',why:'Yorinobu peut jouer gratuitement une unité ARASAKA de coût admissible.'},
    {a:'dying-night-v-s-pistol',b:'v-corporate-exile',why:'Équiper V avec Dying Night permet de redresser des Eddies en fin de tour.'}
  ];
  function synergies(owned,cards,deck){
    const ids=new Set([...(deck?.main||[]),...(deck?.legends||[])]);
    return PAIRS.filter(x=>cards[x.a]&&cards[x.b]&&
      ((owned[x.a]||0)>0||(owned[x.b]||0)>0))
      .map(x=>{
        const missing=[x.a,x.b].filter(id=>!(owned[id]>0));
        const bothInDeck=ids.has(x.a)&&ids.has(x.b);
        return {...x,missing,bothInDeck,ready:missing.length===0};
      }).sort((a,b)=>Number(b.bothInDeck)-Number(a.bothInDeck)||
        a.missing.length-b.missing.length||a.a.localeCompare(b.a));
  }
  const api={clean,importText,suggest,ownedDeck,synergies};
  root.CollectionAdvisor=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
