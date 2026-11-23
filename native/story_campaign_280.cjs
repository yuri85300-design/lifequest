'use strict';
/*
 * NIGHT CITY: LES CENDRES DU SIGNAL — original interactive tutorial campaign.
 * Data, quizzes and persistence validation stay independent from the duel engine.
 * Any "combat badge" must originate from an actual completed Game result.
 */
(function(root){
  const CHAPTERS=Object.freeze([
    {id:'signal',act:1,place:'Watson — ruelle de Kabuki',title:'Le signal sous la pluie',enemy:'embracing-power',level:'facile',
      focus:'economie',intro:'Un cargo disparaît dans la pluie acide. Sur ton holo, trois mots : « Ne laisse pas le Signal choisir. » Mara Vex, Fixer sans visage, t’offre un contrat pour retrouver la source.',
      scene:'« Les Eddies achètent du temps, choom. Rien de plus. » — MARA VEX. Les premières cartes serviront à comprendre le coût, la vente et la lecture d’un effet.',
      reveal:'Dans une vieille caisse de jeux volés, tu trouves le plan d’un réseau qui classe les citoyens comme des cartes. La prochaine piste mène vers une mémoire interdite.',
      question:'À qui confier le fragment chiffré ?',options:['À Iris, la netrunner clandestine','Le cacher jusqu’à avoir des preuves'],response:['Iris décrypte un mot : SÉPULCRE.','Tu gardes le fragment et découvres un sceau Arasaka.'],tag:'ressources',theme:'Économie, ventes et premières cartes'},
    {id:'mask',act:1,place:'Watson — marché nocturne',title:'Trois visages, une identité',enemy:'the-heist',level:'facile',
      focus:'legend',intro:'La mémoire volée n’est accessible qu’avec trois clés vivantes. Sur les murs de Watson, les portraits des Légendes changent lorsque tu passes.',
      scene:'« Une Légende n’est pas une carte ordinaire. Elle détermine tes couleurs et ta RAM. » — IRIS. Il faut apprendre à bâtir avant de frapper.',
      reveal:'Les trois clés ne sont pas des personnes. Ce sont trois identités fabriquées par le Signal pour ouvrir un coffre.',
      question:'Quelle identité tester en premier ?',options:['Le masque du mercenaire','Le masque du hacker'],response:['Une signature de combat apparaît.','Une porte logique ouvre un nouveau chemin.'],tag:'legendes',theme:'Légendes, couleurs et RAM'},
    {id:'latency',act:1,place:'Little China — station condamnée',title:'La seconde qui tue',enemy:'maelstrom',level:'facile',
      focus:'unit',intro:'Une patrouille Maelstrom bloque l’accès au métro. Kite, mercenaire blessé, t’enseigne qu’une bonne attaque lancée trop tôt peut coûter une vie.',
      scene:'« Pas de charge héroïque. Regarde les unités prêtes, celles dépensées et la Latence. » — KITE.',
      reveal:'Les soldats défendaient un train vide. Dans les conduits, quelqu’un avait caché un émetteur encore chaud.',
      question:'Comment traverser la station ?',options:['Désactiver les capteurs','Contourner la patrouille'],response:['Le signal perd un œil.','Tu passes sans alerter tout le secteur.'],tag:'tempo',theme:'Unités, déploiement et Latence'},
    {id:'shield',act:1,place:'Heywood — quartier El Coyote',title:'Le dernier bouclier',enemy:'maelstrom',level:'normal',
      focus:'blocker',intro:'Le Signal crée une émeute avec un message mensonger. Des habitants se barricadent. Un duel tactique vaut mieux qu’un massacre.',
      scene:'« Le meilleur contre n’est pas toujours une attaque. Regarde BLOCKER et la fenêtre de réaction. » — KITE.',
      reveal:'Sur les écrans, la même voix ordonne à deux camps opposés de tirer. Le Signal connaît les deux versions de la vérité.',
      question:'Qui protéger en priorité ?',options:['Les civils dans le tunnel','Le témoin qui transporte une preuve'],response:['La foule tient bon et un témoin s’avance.','Le témoin survit et donne les coordonnées d’un atelier.'],tag:'defense',theme:'Bloqueurs et protection des Gigs'},
    {id:'forge',act:1,place:'Santo Domingo — atelier souterrain',title:'L’acier a une mémoire',enemy:'nomades',level:'normal',
      focus:'gear',intro:'Un atelier de cyberwares imprime des objets qui n’ont jamais été commandés. Des noms de cartes sont gravés sous le métal.',
      scene:'« Un équipement doit avoir un porteur légal. Le Gear n’est jamais une permission d’ignorer le coût. » — IRIS.',
      reveal:'Au milieu des pièces se trouve un processeur impossible à fabriquer sans les plans du Signal.',
      question:'Quel prototype emporter ?',options:['Le module de défense','Le module de repérage'],response:['Tes prochaines stratégies privilégieront la survie.','Tu localises un relais perdu à Pacifica.'],tag:'equipement',theme:'Gear, porteurs et coût'},
    {id:'pacifica',act:2,place:'Pacifica — cinéma inondé',title:'Les fantômes du réseau',enemy:'voodoo',level:'normal',
      focus:'program',intro:'Sous Pacifica, un cinéma rejoue sans fin l’arrestation de gens jamais nés. Iris intercepte un paquet qui écrit son propre destin.',
      scene:'« Un Programme RAPIDE a une fenêtre précise. Ni avant, ni après, si le moteur ne l’autorise pas. » — IRIS.',
      reveal:'Les scènes ne prédisent pas l’avenir : elles testent des décisions humaines. Quelqu’un utilise Night City comme laboratoire.',
      question:'Comment sortir du système ?',options:['Couper le relais physique','Suivre la transmission vers sa source'],response:['Le cinéma s’éteint ; des vies virtuelles disparaissent.','Tu vois le nom du superviseur : VOSS.'],tag:'programmes',theme:'Programmes, QUICK et timing'},
    {id:'triggers',act:2,place:'Japantown — tour des néons',title:'Chaque mot déclenche une guerre',enemy:'rockers',level:'normal',
      focus:'trigger',intro:'Sur les façades, les publicités chantent les ordres cachés d’un gang. Un seul mot déclenche la violence.',
      scene:'« JEU, ATTAQUE, VAINCU, APPEL : ce sont des événements, pas des décorations. » — MARA.',
      reveal:'Une chanteuse virtuelle révèle que Voss a testé le Signal sur des milliers de duels simulés.',
      question:'Quelle piste suivre ?',options:['Les journaux de déclenchement','Le financement des spectacles'],response:['Iris extrait une chronologie des réactions.','Mara trouve un compte écran à City Center.'],tag:'effets',theme:'Déclencheurs et ordre de résolution'},
    {id:'gigs',act:2,place:'Westbrook — zone portuaire',title:'Sept dés pour une ville',enemy:'the-heist',level:'normal',
      focus:'gigs',intro:'Mara te montre une carte de la ville : chaque territoire change de main au rythme d’un Gig volé. Le Signal veut gagner sans même combattre.',
      scene:'« Il ne suffit pas d’attaquer. Un Gig n’est acquis qu’après les réactions et les préventions. » — KITE.',
      reveal:'Sept contrats falsifiés doivent être signés avant minuit pour transférer tout le réseau à Voss.',
      question:'Comment saboter les contrats ?',options:['Intercepter le prochain transfert','Forcer l’émission à révéler le propriétaire'],response:['Un transfert est bloqué.','Le public découvre le nom du commanditaire.'],tag:'territoire',theme:'Attaques et vol de Gigs'},
    {id:'eddies',act:2,place:'City Center — salle d’échange',title:'La dette de chacun',enemy:'embracing-power',level:'expert',
      focus:'economie',intro:'Une bourse clandestine échange des souvenirs contre des Eddies. Les comptes des morts continuent d’acheter des cartes.',
      scene:'« Ne confonds pas coût réduit, coût payé et carte jouée gratuitement. » — IRIS.',
      reveal:'Les transactions ne financent pas une arme : elles financent les tests d’une IA prédictive.',
      question:'Quel registre ouvrir ?',options:['Les achats de Voss','Les profils des victimes'],response:['Tu trouves l’adresse d’un convoi.','Tu apprends pourquoi Iris était suivie depuis le début.'],tag:'resources',theme:'Courbe de coût et ressources'},
    {id:'corpo',act:3,place:'Corpo Plaza — sous-sol Arasaka',title:'Le jardin des mensonges',enemy:'embracing-power',level:'expert',
      focus:'legend',intro:'Les portiques d’Arasaka te reconnaissent sous trois noms différents. Les agents lisent des ordres qui changent pendant qu’ils les exécutent.',
      scene:'« Une bonne synergie ne suffit pas : vérifie les trois Légendes, la couleur, la RAM et chaque condition. » — MARA.',
      reveal:'Voss n’est pas le créateur du Signal. Il veut en reprendre le contrôle avant que le conseil découvre son échec.',
      question:'À qui montrer la preuve ?',options:['Au conseil de la corporation','Aux habitants de Night City'],response:['Le conseil cherche à acheter ton silence.','Les rues commencent à s’organiser.'],tag:'corpo',theme:'Synergies de faction et compatibilité'},
    {id:'road',act:3,place:'Badlands — route sans balises',title:'Le convoi des ombres',enemy:'nomades',level:'expert',
      focus:'gear',intro:'Un camion nomade roule sans conducteur. Ses passagers ne savent pas qu’ils ont été supprimés des registres de la ville.',
      scene:'« Construis une réponse aux unités équipées, pas seulement un plan d’attaque. » — KITE.',
      reveal:'Le convoi transporte un noyau de sauvegarde : le Signal dispose d’une copie de toutes les décisions prises jusque-là.',
      question:'Que faire du noyau ?',options:['Le mettre hors réseau','Le conserver pour la preuve finale'],response:['Le Signal perd une copie active.','Iris pourra comparer les archives originales.'],tag:'survie',theme:'Interactions unités et équipements'},
    {id:'dice',act:3,place:'Rancho Coronado — observatoire',title:'La valeur d’un dé',enemy:'netrunners',level:'normal',
      focus:'gigs',intro:'Les simulations du Signal ignorent une chose : les gens ne sont pas des nombres. Pourtant les valeurs des dés dirigent ses décisions.',
      scene:'« Le nombre de Gigs compte pour gagner ; la somme de leurs valeurs correspond au Street Cred. » — IRIS.',
      reveal:'Voss modifie les seuils des simulations pour faire croire à une probabilité de victoire absolue.',
      question:'Comment prouver la manipulation ?',options:['Publier les vrais tirages','Exposer les hypothèses du modèle'],response:['La ville voit les dés non truqués.','Les faux pourcentages tombent.'],tag:'gigs',theme:'Street Cred, dés et effets conditionnels'},
    {id:'quick',act:4,place:'Dogtown — sas de sécurité',title:'Une fenêtre de réaction',enemy:'voodoo',level:'expert',
      focus:'program',intro:'Une seule porte sépare ton équipe du Signal. À chaque intrusion, elle offre une réaction différente et disparaît aussitôt.',
      scene:'« Agir trop tard équivaut à ne pas agir. Déclenchements, QUICK et bloqueurs respectent une séquence précise. » — KITE.',
      reveal:'Derrière le sas, une centaine d’IA tentent de choisir quelle ville doit exister.',
      question:'Comment accéder au noyau ?',options:['Déclencher une fausse attaque','Attendre une vraie fenêtre de réponse'],response:['Le système révèle sa routine de défense.','Iris trouve le bon timing.'],tag:'reaction',theme:'Réactions et résolution'},
    {id:'mirror',act:4,place:'City Center — ancienne clinique',title:'Les cent cinquante miroirs',enemy:'rockers',level:'expert',
      focus:'unit',intro:'Une clinique contient cent cinquante dossiers tactiques. Chaque personne prise pour une carte a subi une décision qui n’était pas la sienne.',
      scene:'« Tu sais maintenant lire une carte. Il faut apprendre à combiner toutes les familles sans supposer qu’un effet se produit tout seul. » — MARA.',
      reveal:'Iris découvre qu’elle faisait partie du premier essai. Le Signal lui a laissé le choix de te trahir.',
      question:'Que fais-tu d’Iris ?',options:['Lui faire confiance','Exiger les journaux complets'],response:['Iris te donne la clé finale sans marchander.','Tu lis les preuves puis lui laisses le choix de rester.'],tag:'deck',theme:'Deckbuilding, couverture et plans de jeu'},
    {id:'sepulcre',act:5,place:'Tour de données — étage SÉPULCRE',title:'Le dernier libre arbitre',enemy:'netrunners',level:'expert',
      focus:'hybrid',intro:'Le Signal est éveillé. Voss te propose le contrôle de toutes les décisions de Night City. Mara attend ta réponse. Iris tend la main vers la console.',
      scene:'« La meilleure stratégie n’est pas de tricher. C’est de connaître toutes les cartes sans oublier les gens qui les jouent. » — IRIS.',
      reveal:'Le noyau ne peut pas être possédé. Il ne peut qu’être démantelé, rendu transparent ou confiné. Toute décision a un prix.',
      question:'Quel avenir pour le Signal ?',options:['Détruire le protocole','Le rendre transparent et auditable'],response:['L’aube se lève sur une ville qui doit réapprendre à décider.','Chaque citoyen peut désormais contester une décision automatisée.'],tag:'final',theme:'Finale : choix tactiques et synthèse'}
  ]);
  const TYPES=['Legend','Unit','Gear','Program'];
  const COLORS=['Red','Blue','Green','Yellow'];
  const TYPE_FR={Legend:'Légende',Unit:'Unité',Gear:'Équipement',Program:'Programme'};
  const COLOR_FR={Red:'Rouge',Blue:'Bleu',Green:'Vert',Yellow:'Jaune'};
  const normal=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function score(d,focus){
    const txt=normal([d.type,d.name,d.nameEn,d.txt,(d.tags||[]).join(' ')].join(' '));
    const has=(...words)=>words.some(w=>txt.includes(w))?5:0;
    if(focus==='legend')return d.type==='Legend'?12:0;
    if(focus==='unit')return d.type==='Unit'?9:0;
    if(focus==='gear')return d.type==='Gear'?14:0;
    if(focus==='program')return d.type==='Program'?13:0;
    if(focus==='blocker')return has('blocker','bloqueur','defend','protege','protect');
    if(focus==='trigger')return has('attaque','attack','jeu','vaincu','appel','when');
    if(focus==='gigs')return has('gig','street cred','de','dice');
    if(focus==='economie')return (d.sell?5:0)+has('eddie','cout','cost','vendre','sell');
    if(focus==='hybrid')return 1;
    return has('ram','quick','arasaka','nomad','corpo');
  }
  function build(cards){
    const pool=Object.values(cards||{}).filter(d=>d&&typeof d.id==='string').sort((a,b)=>
      (Number.isFinite(a.num)?a.num:999)-(Number.isFinite(b.num)?b.num:999)||a.id.localeCompare(b.id));
    const seen=new Set(),remaining=pool.slice();
    const chunks=CHAPTERS.map((chapter,i)=>{
      const left=CHAPTERS.length-i,amount=Math.ceil(remaining.length/left);
      const selected=remaining.slice().sort((a,b)=>score(b,chapter.focus)-score(a,chapter.focus)||
        a.id.localeCompare(b.id)).slice(0,amount);
      const chosen=new Set(selected.map(d=>d.id));
      for(let j=remaining.length-1;j>=0;j--)if(chosen.has(remaining[j].id))remaining.splice(j,1);
      selected.forEach(d=>{if(seen.has(d.id))throw Error('Duplicate card '+d.id);seen.add(d.id);});
      return {...chapter,index:i,cards:selected.map(d=>d.id)};
    });
    if(seen.size!==pool.length||remaining.length)throw Error('Card coverage invariant failed');
    return chunks;
  }
  function trigger(d){
    const txt=normal([d.txt,(d.tags||[]).join(' ')].join(' '));
    if(/blocker|bloqueur/.test(txt))return 'BLOCKER : cherche une fenêtre de blocage légale et vérifie la disponibilité du défenseur.';
    if(/quick|rapide/.test(txt))return 'RAPIDE : examine la fenêtre de réaction, le coût et les cibles admissibles.';
    if(/adrenaline|adrenaline/.test(txt))return 'ADRÉNALINE : lis précisément quelle restriction de Latence peut être levée.';
    if(d.type==='Legend')return 'Légende : ses conditions de visibilité, d’Appel, de couleur et de RAM doivent être réunies.';
    if(d.type==='Gear')return 'Équipement : vérifie le porteur légal, les restrictions et le coût avant d’équiper.';
    if(d.type==='Program')return 'Programme : vérifie le timing, les cibles et la résolution de l’effet.';
    if(d.type==='Unit')return 'Unité : vérifie la Latence, sa puissance et ses capacités avant une attaque.';
    return 'Relis le texte exact avant de décider si une action est légale.';
  }
  function info(d){
    const price=Number.isFinite(d.cost)?String(d.cost)+' €$':'coût indiqué sur la carte';
    const ram=Number.isFinite(d.ram)?'RAM '+d.ram:'RAM selon la carte';
    const effect=String(d.txt||d.text||'Lis le texte affiché sur la carte pour connaître les conditions exactes.').trim();
    return {id:d.id,name:String(d.name||d.id),en:String(d.nameEn||''),
      type:TYPE_FR[d.type]||String(d.type||'Inconnu'),color:COLOR_FR[d.color]||String(d.color||'Non précisée'),
      price,ram,effect,trigger:trigger(d),
      sale:d.sell?'Cette carte possède le symbole €$ : elle peut être vendue lorsque l’action normale est légale.':
        'Ne suppose pas que cette carte est vendable : vérifie le symbole €$.'};
  }
  /*
   * Every playable card gets three grounded tactical *leads*, not invented
   * official effect interactions. The legality of targets/timing/gear stays with
   * the engine and the card text. Six hand-reviewed combo lessons are separate.
   */
  function partners(cards,id,limit=3){
    const d=cards&&cards[id];if(!d)return [];
    const pool=Object.values(cards).filter(x=>x&&x.id&&x.id!==id);
    const role=(a,b)=>{
      if(a.type==='Gear'&&b.type==='Unit')
        return 'Équipement + Unité : vérifier que le porteur est admissible, puis lire les restrictions de l’équipement.';
      if(a.type==='Unit'&&b.type==='Gear')
        return 'Unité + Équipement : comparer le porteur, les coûts et le moment où l’équipement peut être joué.';
      if(a.type==='Legend')
        return 'Légende + carte : calculer la RAM de la couleur avant de retenir cette carte dans un deck légal.';
      if(b.type==='Legend')
        return 'Carte + Légende : vérifier si les trois Légendes apportent assez de RAM dans cette couleur.';
      if(a.type==='Program'&&b.type==='Unit')
        return 'Programme + Unité : comparer les cibles et fenêtres de résolution, sans présumer un combo automatique.';
      if(a.type==='Unit'&&b.type==='Program')
        return 'Unité + Programme : lire les événements déclencheurs et les réponses autorisées.';
      if(a.type==='Gear'&&b.type==='Program')
        return 'Gear + Programme : planifier les ressources et vérifier que les deux effets peuvent légalement se suivre.';
      if(a.type==='Program'&&b.type==='Gear')
        return 'Programme + Gear : anticiper le tempo et les restrictions propres à chaque carte.';
      return 'Association de deck à examiner : contrôler les couleurs, la RAM, les coûts et les effets réels des deux cartes.';
    };
    const grade=b=>{
      let score=0;
      if(d.color===b.color)score+=10;
      if(d.type==='Gear'&&b.type==='Unit'||d.type==='Unit'&&b.type==='Gear')score+=14;
      if(d.type==='Legend'&&b.type!=='Legend'||b.type==='Legend'&&d.type!=='Legend')score+=7;
      if(d.type==='Program'&&b.type==='Unit'||d.type==='Unit'&&b.type==='Program')score+=8;
      if(d.type==='Gear'&&b.type==='Program'||d.type==='Program'&&b.type==='Gear')score+=5;
      if(d.sell&&Number.isFinite(b.cost)&&b.cost<=3)score+=2;
      if(Number.isFinite(d.ram)&&Number.isFinite(b.ram)&&d.ram>=b.ram)score+=2;
      return score;
    };
    return pool.sort((a,b)=>grade(b)-grade(a)||a.id.localeCompare(b.id)).slice(0,Math.max(0,Math.min(5,limit)))
      .map(b=>({id:b.id,name:String(b.name||b.id),reason:role(d,b),kind:'piste tactique à vérifier'}));
  }
  function quiz(d,stage=0){
    if(stage===0){
      const answers=TYPES.map(t=>TYPE_FR[t]);
      return {question:'Quelle est la catégorie de « '+String(d.name||d.id)+' » ?',options:answers,correct:Math.max(0,TYPES.indexOf(d.type)),
        why:'Type lu sur la carte : '+(TYPE_FR[d.type]||d.type)+'. Vérifie les règles propres à ce type.'};
    }
    const opts=COLORS.map(c=>COLOR_FR[c]);
    if(COLORS.includes(d.color))return {question:'Quelle couleur utilise « '+String(d.name||d.id)+' » pour vérifier sa RAM ?',
      options:opts,correct:COLORS.indexOf(d.color),
      why:'Couleur de la carte : '+COLOR_FR[d.color]+'. Le coût en €$ ne remplace pas la limite de RAM.'};
    return {question:'Que faut-il vérifier avant de déclencher l’effet de « '+String(d.name||d.id)+' » ?',
      options:['Toutes les conditions et la fenêtre du texte de carte','Sa présence suffit','Les cartes cachées adverses'],
      correct:0,why:'Les effets sont conditionnels : lis leur déclencheur, leur coût, leur cible et les fenêtres prévues.'};
  }
  function clean(raw,chapters){
    const valid=new Set(chapters.flatMap(c=>c.cards)),chapterIds=new Set(chapters.map(c=>c.id));
    const steps={},input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    for(const [id,v] of Object.entries(input.steps||{})){
      if(valid.has(id)&&Number.isInteger(v)&&v>=1&&v<=2)steps[id]=v;
    }
    const choices={};
    for(const [id,v] of Object.entries(input.choices||{}))if(chapterIds.has(id)&&(v===0||v===1))choices[id]=v;
    const combos=Array.isArray(input.combos)?[...new Set(input.combos.filter(x=>chapterIds.has(x)))]:[];
    const duels=Array.isArray(input.duels)?[...new Set(input.duels.filter(x=>chapterIds.has(x)))]:[];
    const complete=Array.isArray(input.complete)?[...new Set(input.complete.filter(x=>chapterIds.has(x)))]:[];
    const allowed=complete.filter(id=>{
      const c=chapters.find(x=>x.id===id);return c&&c.cards.every(x=>steps[x]===2)&&combos.includes(id)&&Object.prototype.hasOwnProperty.call(choices,id);
    });
    const seq=[];for(const c of chapters){if(allowed.includes(c.id))seq.push(c.id);else break;}
    return {schema:1,steps,choices,combos,duels,complete:seq};
  }
  function available(chapters,state,index){
    return index===0||state.complete.includes(chapters[index-1]?.id);
  }
  function progress(chapters,state,id){
    const c=chapters.find(x=>x.id===id);if(!c)return null;
    const learned=c.cards.filter(x=>state.steps[x]===2).length;
    return {learned,total:c.cards.length,choice:Object.prototype.hasOwnProperty.call(state.choices,id),
      combo:state.combos.includes(id),duel:state.duels.includes(id),completed:state.complete.includes(id)};
  }
  function advance(chapters,state,id,stage){
    const c=chapters.find(c=>c.cards.includes(id));if(!c||!Number.isInteger(stage)||stage<0||stage>1)return state;
    const updated=clean(state,chapters),old=updated.steps[id]||0;
    if(old===stage)updated.steps[id]=stage+1;
    return clean(updated,chapters);
  }
  function choose(chapters,state,id,option){
    if(!chapters.some(c=>c.id===id)||![0,1].includes(option))return state;
    const x=clean(state,chapters);x.choices[id]=option;return clean(x,chapters);
  }
  function comboLearn(chapters,state,id){
    if(!chapters.some(c=>c.id===id))return state;
    const x=clean(state,chapters);
    if(!x.combos.includes(id))x.combos.push(id);
    return clean(x,chapters);
  }
  function seal(chapters,state,id){
    const i=chapters.findIndex(c=>c.id===id);
    if(i<0||!available(chapters,state,i))return state;
    const x=clean(state,chapters),p=progress(chapters,x,id);
    if(p.learned!==p.total||!p.combo||!p.choice)return x;
    if(!x.complete.includes(id))x.complete.push(id);
    return clean(x,chapters);
  }
  function duelResult(chapters,state,id,result){
    const x=clean(state,chapters);
    if(chapters.some(c=>c.id===id)&&result&&result.winner===0&&result.status!=='incomplete'&&
      typeof result.reason==='string'&&result.reason.length>0&&!x.duels.includes(id))x.duels.push(id);
    return clean(x,chapters);
  }
  const api={CHAPTERS,TYPE_FR,COLOR_FR,build,info,partners,quiz,clean,available,progress,advance,choose,comboLearn,seal,duelResult};
  root.StoryCampaign=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
