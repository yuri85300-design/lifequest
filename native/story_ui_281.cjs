'use strict';
/*
 * Original narrative campaign UI, intentionally decoupled from game rules.
 * The host injects only UI callbacks and reads/writes ordinary local storage.
 */
(function(root){
function create(ctx){
  const {app,mount,topbar,store,CARDS,PRESETS,LEVELS,allDecks,validateDeck,showCard,startGame,S,toast,openSheet,closeSheet,esc}=ctx;
  const story=root.StoryCampaign,chapters=story.build(CARDS),key='storyCindersV1';
  function read(){return story.clean(store.get(key,null),chapters);}
  function write(value){
    const state=story.clean(value,chapters);
    if(!store.set(key,state))toast('Sauvegarde de l’histoire indisponible.',4000);
    return state;
  }
  function available(index){return story.available(chapters,read(),index);}
  function chapter(index){
    const i=Number(index);
    if(!Number.isInteger(i)||i<0||i>=chapters.length||!available(i))return home();
    const c=chapters[i],state=read(),p=story.progress(chapters,state,c.id),ready=p.learned===p.total&&p.practiced===p.total&&p.combo&&p.choice;
    const pair=combo(i),localPair=story.chapterPair(chapters,i,CARDS),choice=state.choices[c.id];
    const cardItems=c.cards.map((id,j)=>{
      const d=CARDS[id],stage=state.steps[id]||0,info=story.info(d);
      return '<button class="story-card '+(stage===2?'done':'')+'" type="button" data-story-card="'+j+'" aria-label="'+esc('Étudier '+d.name+' : '+stage+' sur 2')+'">'
        +'<small>'+String(j+1).padStart(2,'0')+' / '+c.cards.length+' · '+(stage===2?'✓ DOSSIER ACQUIS':stage+'/2')+'</small>'
        +'<b>'+esc(d.name)+'</b><span>'+esc(info.type)+' · '+esc(info.color)+'</span></button>';
    }).join('');
    const choices=c.options.map((option,j)=>'<button class="btn '+(choice===j?'primary':'ghost')+'" data-story-choice="'+j+'" '+(p.completed?'disabled':'')+'>'+esc(option)+'</button>').join('');
    let html='<div class="screen">'+topbar('Chapitre '+(i+1)+' · '+c.title,'story')+'<div class="scroll pad story-scroll">'
      +'<div class="story-hero"><small>ACTE '+c.act+' · '+esc(c.place)+'</small><h2>'+esc(c.title)+'</h2><p>'+esc(c.intro)+'</p></div>'
      +'<div class="story-dialogue"><b>TRANSMISSION ENTRANTE</b><p>'+esc(c.scene)+'</p></div>'
      +'<section class="story-panel"><h3>'+esc(c.theme)+'</h3><p>Étudiez les '+c.cards.length+' cartes de ce chapitre. Chaque dossier comporte deux questions et reprend le texte de son effet.</p>'
      +'<strong>'+p.learned+'/'+p.total+' dossiers lus · '+p.practiced+'/'+p.total+' décisions tactiques réussies</strong></section>'
      +'<div class="story-card-grid">'+cardItems+'</div>'
      +'<section class="story-panel"><small>SYNERGIE TACTIQUE</small><h3>'+esc(pair.title)+'</h3>'
      +'<p>'+esc(pair.goal||'Deux effets ne se combinent que lorsque toutes les conditions sont remplies.')+'</p>'
      +'<div class="row2"><button class="btn ghost" data-story-pair="'+esc(pair.a)+'">'+esc(CARDS[pair.a]?.name||pair.a)+'</button>'
      +'<button class="btn ghost" data-story-pair="'+esc(pair.b)+'">'+esc(CARDS[pair.b]?.name||pair.b)+'</button></div>'
      +'<p><b>Pourquoi :</b> '+esc(pair.why)+'</p><p><b>Enchaînement :</b> '+esc((pair.steps||[]).join(' → '))+'</p>'
      +'<p><b>Erreur fréquente :</b> '+esc(pair.tip)+'</p>'
      +'<button class="btn '+(p.combo?'ghost':'primary')+'" id="storyCombo" '+(p.combo?'disabled':'')+'>'+(p.combo?'✓ Test de combo réussi':'Tester mes connaissances du combo')+'</button></section>'
      +'<section class="story-panel"><small>ATELIER DE CE CHAPITRE · PAIRE UNIQUE</small><h3>'+esc(localPair.title)+'</h3>'
      +'<p>'+esc(localPair.reason)+'</p><div class="row2">'
      +'<button class="btn ghost" data-story-local-pair="'+esc(localPair.a)+'">'+esc(CARDS[localPair.a]?.name||localPair.a)+'</button>'
      +'<button class="btn ghost" data-story-local-pair="'+esc(localPair.b)+'">'+esc(CARDS[localPair.b]?.name||localPair.b)+'</button></div>'
      +'<ol class="story-steps">'+localPair.checks.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>'
      +'<p class="sub">Cette paire constitue un exercice de construction. Elle ne garantit pas une interaction d’effet légale : le moteur et le texte des deux cartes font autorité.</p></section>'
      +'<section class="story-panel"><small>CHOIX NARRATIF</small><h3>'+esc(c.question)+'</h3><div class="row2">'+choices+'</div>'
      +'<p role="status" id="storyChoiceMsg">'+(choice===0||choice===1?esc(c.response[choice]):'Le choix influe sur le récit, mais jamais sur les règles ni sur les tirages.')+'</p></section>'
      +'<section class="story-panel"><h3>DUEL DE TERRAIN · VRAI MOTEUR</h3><p>Affrontez '+esc(PRESETS[c.enemy]?.name||c.enemy)
      +' en '+esc(LEVELS[c.level]?.[0]||c.level)+'. Ce duel est facultatif ; seuls les résultats réels donnent l’insigne de victoire.</p>'
      +'<p>'+(p.duel?'✓ Duel remporté.':'Duel non encore remporté.')+'</p><button class="btn ghost" id="storyDuel">Démarrer le duel réel</button></section>';
    if(p.completed)html+='<section class="story-reveal"><h3>ARCHIVE DÉCHIFFRÉE</h3><p>'+esc(c.reveal)+'</p></section>';
    html+='<section class="story-panel"><p>'+(p.completed?'✓ Chapitre terminé.':ready?'Les dix cartes, leurs décisions tactiques, le combo et le choix sont validés.':'Pour continuer : étudiez les dix cartes, réussissez leurs dix décisions tactiques, passez le test de combo et prenez une décision.')+'</p>'
      +'<div class="row2"><button class="btn primary" id="storyComplete" '+(!ready||p.completed?'disabled':'')+'>Terminer le chapitre</button>'
      +(p.completed?'<button class="btn primary" id="storyNext">'+(i===chapters.length-1?'Voir l’épilogue':'Chapitre suivant')+'</button>':'')
      +'</div></section></div></div>';
    mount(html);
    app.querySelectorAll('[data-story-card]').forEach(b=>b.onclick=()=>card(i,+b.dataset.storyCard));
    app.querySelectorAll('[data-story-pair],[data-story-local-pair]').forEach(b=>b.onclick=()=>showCard(b.dataset.storyPair||b.dataset.storyLocalPair));
    app.querySelectorAll('[data-story-choice]').forEach(b=>b.onclick=()=>{
      write(story.choose(chapters,read(),c.id,+b.dataset.storyChoice));chapter(i);
    });
    app.querySelector('#storyCombo').onclick=()=>comboTest(i);
    app.querySelector('#storyDuel').onclick=()=>duel(i);
    app.querySelector('#storyComplete').onclick=()=>{
      const next=story.seal(chapters,read(),c.id);
      write(next);chapter(i);
    };
    const next=app.querySelector('#storyNext');if(next)next.onclick=()=>i===chapters.length-1?home():chapter(i+1);
  }
  function combo(i){
    const pairs=root.CollectionAdvisor.tutorials({},CARDS);
    if(!pairs.length)throw Error('Leçons de synergie manquantes');
    return pairs[i%pairs.length];
  }
  function comboTest(i){
    const c=chapters[i],pair=combo(i);
    const sheet=openSheet('<h3>Test de combo · '+esc(pair.title)+'</h3><p class="sub">Que faut-il vérifier avant de combiner ces deux cartes ?</p>'
      +'<div class="body"><div class="story-options">'
      +'<button class="btn ghost" data-story-combo-answer="0">Le texte, les coûts, la couleur, la RAM, le timing et les cibles.</button>'
      +'<button class="btn ghost" data-story-combo-answer="1">Elles s’activent automatiquement si je les possède.</button>'
      +'<button class="btn ghost" data-story-combo-answer="2">Les effets ignorent les réactions adverses.</button>'
      +'</div><p id="storyComboMsg" role="status" aria-live="polite"></p></div>'
      +'<div class="acts"><button class="btn ghost" data-close>Retour</button></div>');
    sheet.querySelector('[data-close]').onclick=closeSheet;
    sheet.querySelectorAll('[data-story-combo-answer]').forEach(b=>b.onclick=()=>{
      if(b.dataset.storyComboAnswer!=='0'){
        sheet.querySelector('#storyComboMsg').textContent='Non : les combos ont des conditions. Relisez les deux cartes.';
        return;
      }
      write(story.comboLearn(chapters,read(),c.id));closeSheet();chapter(i);
    });
  }
  function card(chapterIndex,cardIndex,message=''){
    const c=chapters[chapterIndex],id=c?.cards?.[cardIndex];
    if(!c||!id||!available(chapterIndex))return home();
    const d=CARDS[id],p=read(),stage=p.steps[id]||0,practiced=p.practices?.[id]===true,info=story.info(d),
      q=stage<2?story.quiz(d,stage,CARDS):null;
    let html='<div class="screen">'+topbar('Dossier '+(cardIndex+1)+' · '+d.name,'story')+'<div class="scroll pad story-scroll">'
      +'<div class="story-hero"><small>ARCHIVES DU SIGNAL · '+esc(c.place)+' · DOSSIER '+(cardIndex+1)+'/'+c.cards.length+'</small>'
      +'<h2>'+esc(info.name)+'</h2><p>'+esc(info.en&&info.en!==info.name?info.en:'Dossier tactique')+'</p>'
      +'<div class="story-tags"><span>'+esc(info.type)+'</span><span>'+esc(info.color)+'</span><span>'+esc(info.price)+'</span><span>'+esc(info.ram)+'</span></div>'
      +'<button class="btn ghost" id="storyInspect">Voir la carte et ses illustrations</button></div>'
      +'<div class="story-dialogue"><b>TEXTE DE LA CARTE</b><p>'+esc(info.effect)+'</p><p><b>Réflexe :</b> '+esc(info.trigger)+'</p>'
      +'<p>'+esc(info.sale)+'</p>'+(info.tags?'<p><b>Mots-clés et affiliations :</b> '+esc(info.tags)+'</p>':'')+'</div>';
    const allies=story.partners(CARDS,id,3);
    html+='<section class="story-panel"><small>ASSOCIATIONS À EXPLORER</small>'
      +'<h3>Quelles cartes tester avec '+esc(d.name)+' ?</h3>'
      +'<p>Ce sont des pistes de construction : le jeu ne prétend pas que leurs effets se déclenchent automatiquement. Lis chaque carte et contrôle coûts, couleur, RAM et fenêtres de réaction.</p>'
      +allies.map(x=>'<div class="story-associate"><button class="btn ghost" data-story-ally="'+esc(x.id)+'">'+esc(x.name)+'</button><p>'+esc(x.reason)+'</p></div>').join('')
      +'</section>';
    if(q)html+='<section class="story-panel"><small>QUESTION '+(stage+1)+'/2</small><h3>'+esc(q.question)+'</h3>'
      +'<div class="story-options">'+q.options.map((v,j)=>'<button class="btn ghost" data-story-answer="'+j+'">'+String.fromCharCode(65+j)+' · '+esc(v)+'</button>').join('')+'</div>'
      +'<p class="story-feedback" role="status" aria-live="polite">'+esc(message||'Lis la carte avant de choisir. Tu peux recommencer sans perdre tes dossiers.')+'</p></section>';
    else html+='<section class="story-reveal"><h3>✓ Dossier étudié</h3><p>Tu reconnais ses caractéristiques. Un duel réel demandera aussi de lire ses clauses, déclencheurs et errata.</p></section>';
    html+='<section class="story-panel"><small>MISSION PRATIQUE · DÉCISION DE TERRAIN</small>'
      +'<h3>'+esc(story.tacticalQuiz(d).concept)+'</h3>'
      +'<p>Imagine un tour de duel : quelle décision prendrais-tu avec cette carte ? Cette épreuve vérifie un principe de légalité sans fabriquer de victoire.</p>'
      +'<button class="btn '+(practiced?'ghost':'primary')+'" id="storyPractice" '+(stage<2?'disabled':'')+'>'+(practiced?'✓ Décision acquise · réviser':stage<2?'Terminer les deux questions pour pratiquer':'Tester ma décision tactique')+'</button></section>';
    html+='<div class="row2"><button class="btn ghost" id="storyBack">Retour au chapitre</button>'
      +(cardIndex<c.cards.length-1?'<button class="btn primary" id="storyNextCard">Carte suivante</button>':'')
      +'</div></div></div>';
    mount(html);
    app.querySelector('#storyInspect').onclick=()=>showCard(id);
    app.querySelector('#storyPractice').onclick=()=>tacticalPractice(chapterIndex,cardIndex);
    app.querySelectorAll('[data-story-ally]').forEach(b=>b.onclick=()=>showCard(b.dataset.storyAlly));
    app.querySelector('#storyBack').onclick=()=>chapter(chapterIndex);
    const next=app.querySelector('#storyNextCard');
    if(next)next.onclick=()=>card(chapterIndex,cardIndex+1);
    app.querySelectorAll('[data-story-answer]').forEach(b=>b.onclick=()=>{
      if(+b.dataset.storyAnswer!==q.correct){
        card(chapterIndex,cardIndex,'Réponse à corriger : '+q.why);return;
      }
      write(story.advance(chapters,read(),id,stage));
      card(chapterIndex,cardIndex,'✓ Exact : '+q.why);
    });
  }
  function tacticalPractice(chapterIndex,cardIndex){
    const c=chapters[chapterIndex],id=c?.cards?.[cardIndex];
    if(!id||!available(chapterIndex))return home();
    const d=CARDS[id],q=story.tacticalQuiz(d);
    if(!q||read().steps[id]!==2)return toast('Terminez d’abord les deux questions du dossier.',3200);
    const sheet=openSheet('<h3>MISSION TACTIQUE · '+esc(d.name)+'</h3>'
      +'<p class="sub">Lire ne suffit pas. Tu dois reconnaître la bonne décision. Aucun tirage ni combat ne sont inventés.</p>'
      +'<h4>'+esc(q.question)+'</h4><div class="story-options">'
      +q.options.map((option,i)=>'<button class="btn ghost" data-story-practice-answer="'+i+'">'+esc(option)+'</button>').join('')
      +'</div><p id="storyPracticeMsg" role="status" aria-live="polite"></p>'
      +'<div class="acts"><button class="btn ghost" data-close>Retour au dossier</button></div>');
    sheet.querySelector('[data-close]').onclick=closeSheet;
    sheet.querySelectorAll('[data-story-practice-answer]').forEach(b=>b.onclick=()=>{
      const answer=Number(b.dataset.storyPracticeAnswer);
      if(answer!==q.correct){
        sheet.querySelector('#storyPracticeMsg').textContent='Ce choix ne respecte pas assez les contraintes de la carte. Relis son effet puis réessaie.';
        return;
      }
      write(story.practice(chapters,read(),id,answer,CARDS));
      closeSheet();card(chapterIndex,cardIndex,'✓ Décision tactique validée : '+q.why);
    });
  }
  function duel(index){
    const c=chapters[index],mine=allDecks()[S.myDeck],enemy=PRESETS[c.enemy];
    if(!c||!available(index))return home();
    if(!mine||validateDeck(mine).length)return toast('Deck du joueur invalide : corrigez-le dans Mes decks.',4500);
    if(!enemy||validateDeck(enemy).length)return toast('Deck adverse invalide.',4500);
    if(store.get('gameV230',null)&&!confirm('Une autre partie sauvegardée existe. La remplacer pour lancer ce duel ?'))return;
    S.campaignRun=null;S.storyRun=c.id;S.aiDeck=c.enemy;S.level=c.level;
    startGame(false);
  }
  function onDuelResult(id,result){
    const state=story.duelResult(chapters,read(),id,result);
    write(state);
  }
  function home(){
    S.storyRun=null;
    const state=read(),total=chapters.reduce((n,c)=>n+c.cards.length,0),
      learned=Object.values(state.steps).filter(x=>x===2).length,
      practiced=Object.values(state.practices||{}).filter(Boolean).length;
    const ending=state.complete.length===chapters.length;
    const verdict=Object.values(state.choices).filter(x=>x===1).length>=8?
      'Le Signal devient transparent. Chaque citoyen peut enfin contester son propre destin. Iris reste en ville pour surveiller ceux qui surveillent.' :
      'Le Signal s’éteint. Night City conserve son chaos, mais aussi sa liberté de choisir. Mara brûle le dernier contrat.';
    const items=chapters.map((c,i)=>{
      const allowed=story.available(chapters,state,i),p=story.progress(chapters,state,c.id);
      return '<article class="story-mission '+(p.completed?'done':allowed?'open':'locked')+'">'
        +'<small>ACTE '+c.act+' · '+esc(c.place)+' · '+(p.completed?'✓ ACQUIS':allowed?'OUVERT':'VERROUILLÉ')+'</small>'
        +'<h3>'+String(i+1).padStart(2,'0')+' · '+esc(c.title)+'</h3><p>'+esc(c.theme)+' · '+p.learned+'/'+p.total+' dossiers · '+p.practiced+'/'+p.total+' décisions</p>'
        +'<div class="story-meter"><i style="width:'+Math.round(100*p.learned/Math.max(1,p.total))+'%"></i></div>'
        +'<button class="btn '+(allowed?'primary':'ghost')+'" data-story-chapter="'+i+'" '+(allowed?'':'disabled')+'>'
        +(p.completed?'Revisiter':'Ouvrir le chapitre')+'</button></article>';
    }).join('');
    mount('<div class="screen">'+topbar('Les Cendres du Signal')+'<div class="scroll pad story-scroll">'
      +'<header class="story-hero"><small>7 GIGS · CAMPAGNE NARRATIVE · NIGHT CITY</small><h1>LES CENDRES<br>DU SIGNAL</h1>'
      +'<p>Une mémoire volée. Une IA qui vend des destins. Trois alliés, quinze chapitres et cent cinquante cartes à comprendre.</p>'
      +'<p>Mara Vex · Iris · Kite · Voss · Protocole SÉPULCRE</p><div class="story-stats">'
      +'<span>'+state.complete.length+'/'+chapters.length+' chapitres</span><span>'+learned+'/'+total+' cartes étudiées</span><span>'+practiced+'/'+total+' décisions de terrain</span><span>'+state.duels.length+' duels remportés</span></div></header>'
      +(ending?'<div class="story-reveal"><h2>ÉPILOGUE · LE DERNIER CHOIX</h2><p>'+esc(verdict)+'</p></div>':'')
      +'<div class="story-index">'+items+'</div>'
      +'<div class="sim-hint">Chaque carte dispose de son texte, de deux questions et d’une décision tactique à appliquer. Les 15 ateliers de paires complètent les six exemples de synergie détaillés. Les duels facultatifs passent par le moteur réel : aucune victoire fictive.</div>'
      +'<div class="row2"><button class="btn ghost" data-nav="academy">Quiz des règles</button>'
      +'<button class="btn ghost" data-nav="campaign">Campagne originale · 12 duels</button></div></div></div>');
    app.querySelectorAll('[data-story-chapter]').forEach(b=>b.onclick=()=>chapter(+b.dataset.storyChapter));
  }
  return {home,chapter,card,duel,onDuelResult,read,chapters};
}
root.StoryUI281={create};
if(typeof module!=='undefined'&&module.exports)module.exports={create};
})(typeof window!=='undefined'?window:globalThis);
