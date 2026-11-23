# 7 Gigs PRIME 2.7.5 — audit complet et corrections

Mise à jour de contenu OTA (`version_code=27005`, `min_shell=25004`). Elle s'installe via **Menu → Mise à jour** sans réinstaller l'APK. Les decks, la collection, la campagne et **les duels en cours** sont conservés.

## 1. Problème principal : le moteur testé n'était pas le moteur publié

`native/engine.js`, que valident tous les tests de règles (oracles), était extrait de l'ancien runtime `prime_v220_runtime.html`. Le jeu publié (2.7.0 → 2.7.4) venait de `prime_v272_runtime.html`. Les corrections de règles arrivaient dans `engine.js` et la copie 2.2.0, et les tests passaient. Le jeu réellement installé gardait les bugs.

Résultat mesuré sur le moteur publié en 2.7.4 : **9 tests de règles en échec**, auxquels s'ajoutent 2 bugs nouvellement détectés (Caliber, Padre).

Corrections structurelles :
- `native/extract_engine.cjs` extrait désormais le moteur du runtime publié (`prime_v275_runtime.html`), avec les mêmes bornes que `build_ota_content.py`.
- `node native/extract_engine.cjs --check` échoue si `engine.js` diffère du moteur publié.
- Les workflows 2.7.5 (`prime275-preflight.yml`, `publish-prime275-ota.yml`) vérifient `cmp native/engine.js <moteur du paquet>`, puis lancent les 359 oracles **avant** toute publication.

## 2. Règles corrigées dans le jeu publié

| Carte | Erreur dans 2.7.4 | Comportement 2.7.5 |
|---|---|---|
| Viktor Vektor — Drop Your Illusions | Un CYBERWARE joué gratuitement ne consommait pas la réduction « premier CYBERWARE du tour » : on pouvait cumuler gratuit puis -3 €$. | Toute pose de CYBERWARE, même gratuite, consomme la réduction (3 tests). |
| Alt Cunningham — Soulkiller Architect | Un Programme joué gratuitement laissait la réduction « prochain Programme » active. | La réduction est consommée par le prochain Programme réellement joué. |
| Nocturne OP55 N1 | Le choix « EN SOLO -2 €$ » imposait de désigner une Légende déjà face visible. La réduction était aussi refusée sans Légende EN SOLO visible. | La réduction vaut pour n'importe quelle Légende amie ce tour, coûte au minimum 1 €$, n'est consommée que par un EN SOLO réussi et expire en fin de tour (4 tests). |
| Arasaka Emergency Radioport | Après un Appel, l'effet ne permettait même plus de **regarder** la Légende face cachée. | Regarder reste permis ; seul l'Appel gratuit est bloqué (un seul Appel par tour). |
| Caliber — Totentanz's Top Dog | [VAINCU] : la défausse supplémentaire dépendait du coût de Caliber (5). | Elle dépend du coût de la **carte défaussée**, selon le texte officiel : « If the card's cost equals… ». |
| Padre — Man of the Cross | [⟳] : on pouvait copier la valeur d'un de ses propres Gigs sur un autre de ses Gigs. | La copie se fait uniquement entre les Gigs de **deux joueurs différents** (« a player's Gig … another player's Gig »). |

Les cinq premières corrections existaient déjà dans `engine.js` mais n'avaient jamais été livrées. Caliber et Padre sont nouvelles. Leurs tests échouent sur 2.7.4 et passent sur 2.7.5.

### Concordance avec les 150 textes anglais officiels

`native/official_text_dump.cjs` (workflow `official-text-review.yml`) récupère depuis le CI le texte anglais officiel actuel de chaque carte sur cyberpunktcg.com.
- **Métadonnées** : 150/150 identiques (type, coût, puissance, RAM). Le catalogue officiel compte 152 cartes : les deux absentes du jeu (Rebecca, Lucyna) sont des cartes promotionnelles.
- **Effets** : chaque texte officiel a été relu clause par clause face au code. Écarts trouvés : Caliber et Padre (corrigés ci-dessus), et la traduction française de **Rogue Amendiares — Queen of the Afterlife**.
- Rogue : le texte officiel dit « steals a Gig with value less than **its** power », c'est-à-dire la puissance de l'unité qui vole. Le moteur était correct, mais la traduction française (« la puissance de cette Unité ») ne l'était pas. Elle devient « sa propre puissance », et un test fige le comportement officiel.
- Registre sémantique reconstruit avec les textes officiels : 150/150 textes disponibles, 280 segments officiels, dont 122 reliés à des tests indépendants. Aucune revue manuelle n'est périmée.
- L'échec ponctuel « STALE OFFICIAL TEXT for mox-inciters » d'une exécution CI venait d'une page mal servie par le site. Le texte officiel récupéré 4 minutes plus tard a exactement l'empreinte attendue, et la seconde exécution sur le même commit est verte.

## 3. Compatibilité entre les cartes

`native/audit_275_chaos.cjs` génère des decks **légaux aléatoires** à partir des 150 cartes. Les joueurs choisissent au hasard parmi les actions légales : attaques, blocages, réactions, ventes, Appels, EN SOLO, capacités et choix d'effets. Cela explore des combinaisons qu'une IA ne tente jamais. Après **chaque action**, le test vérifie :
- chaque carte existe exactement une fois (aucune duplication, aucune perte) ;
- chaque joueur possède toujours ses 43 cartes ;
- les cartes en main, dans le deck, au rebut ou en Eddies appartiennent au joueur de cette zone ;
- aucun équipement ne reste attaché hors du terrain ;
- les puissances sont des nombres valides et les Gigs restent dans les bornes de leur dé ;
- la partie se termine sans erreur moteur.

Résultat : **5 000 parties, ~200 000 actions, 0 erreur, 0 violation**. Les 124 cartes non-Légende ont toutes été jouées au moins une fois. Une relecture manuelle des 150 définitions (texte français et texte anglais officiel ↔ code) a été faite en complément ; voir la section 2.

Le moteur ne masque aucune erreur d'effet de carte (aucun `catch` silencieux). Un effet défaillant fait donc échouer le test au lieu de passer inaperçu.

## 4. Jouabilité et performances (Chromium, PC 1280×800 et mobile 390×844)

`native/ui_full_duel_275.cjs` joue des **duels complets** humain contre IA dans l'interface réelle. Les fenêtres de choix et de réaction sont cliquées comme le ferait un joueur.

| Mesure | Résultat |
|---|---|
| Duels complets PC + mobile | 8/8 terminés, 0 erreur JavaScript, 0 blocage |
| Reprise d'une partie sauvegardée par 2.7.4 dans 2.7.5 | 6/6 reprises au tour 6–7 et jouées jusqu'à la fin |
| Rafraîchissement du plateau | p95 6–11 ms (< 16 ms pour 60 images/s) |
| Démarrage jusqu'au menu (processeur ralenti ×4) | ~0,46 s (2.7.4 : ~0,45 s) |
| Décision IA Expert (moteur seul) | médiane 43 ms, maximum 168 ms, calculée dans un Worker séparé |

Aucune optimisation de performance n'était nécessaire. Il n'y en a donc pas eu, pour ne pas risquer de régression.

## 5. NIGHTMARE

**L'adversaire NIGHTMARE** (niveau expert) fonctionnait déjà. Avec un processeur ralenti 4 fois pour imiter un téléphone, il a pris 83 décisions sur 4 duels, toutes calculées en moins de 40 ms et sans aucun repli sur l'IA rapide.

**Le laboratoire NIGHTMARE**, lui, était bloqué : son bouton d'entraînement restait désactivé en permanence. Un mode d'entraînement fonctionnel existait dans la copie 2.2.0, mais il n'avait jamais été reporté dans le jeu publié, et son test vérifiait cette copie 2.2.0. En 2.7.5 :
- Le bouton **Lancer 300 auto-duels** est actif. Dix variantes de NIGHTMARE s'affrontent en ligue Elo sur les 10 decks de test, puis la meilleure joue 80 duels de validation contre le champion en place. L'interface reste utilisable : tâche la plus longue 172 ms, 4 s sur PC.
- **Correction** : chaque session rejouait exactement les mêmes 380 duels, avec des graines fixes, et donnait toujours le même verdict. Relancer l'entraînement ne servait donc à rien. Chaque session tire maintenant sa propre graine. La validation reste équitable, car chaque donne est jouée dans les deux sens.
- Un challenger n'est proposé que s'il marque **au moins 49 points sur 80** contre le champion. Le joueur l'adopte d'un clic (**Adopter le nouveau champion**), l'ancien champion est conservé, et **Revenir au champion d'origine** annule tout.
- Résultat honnête : sur 12 sessions de test, le meilleur challenger a fait 44/80, ce qui n'est statistiquement pas mieux. Le champion d'origine reste donc en place. Le seuil n'a pas été abaissé, pour ne pas faire adopter un champion plus faible.
- `NIGHTMARE_TRAINING_CERTIFIED` reste `false` : rien n'est présenté comme officiellement certifié.

Tests : `nightmare_training_contract.cjs` (sur le runtime publié), `nightmare_training_browser_smoke.cjs` et `nightmare_training_real_smoke.cjs` (entraînement réel de 300 + 80 duels), et `nightmare_lab_275.cjs` (18 contrôles dans Chromium : entraînement réel, adoption, rechargement, duel contre le champion adopté, restauration).

## 6. NIGHTMARE apprend seul : Forge de decks, contre-decks, évolution automatique

Nouveau module moteur `NightmareForge`. Il est testable dans Node et disponible dans l'application.
- **Créer un deck** : trois Légendes aléatoires, une liste légale, puis une évolution carte par carte contre six decks de test.
- **Améliorer le meilleur deck** : chaque session repart du meilleur deck NIGHTMARE, ce qui fait progresser NIGHTMARE de session en session.
- **Contrer un deck** : NIGHTMARE essaie tous les decks qu'il connaît contre le deck visé, garde le meilleur match-up, puis le fait évoluer contre ce deck.
- **Mutations guidées** : on ajoute plutôt des cartes bien notées et on retire plutôt les plus faibles. Toutes les mutations restent légales (2 000 sur 2 000 en test).
- **Sélection en course** : un enfant et le deck en place jouent les mêmes donnes, et le gagnant est confirmé sur de nouvelles donnes.
- **Validation finale** : sur des donnes jamais vues pendant l'évolution, avec un test statistique (z ≥ 2).
  - Une première version sans ce test sur-apprenait : des decks « améliorés » ne gagnaient pas plus sur des parties indépendantes. La version actuelle ne retient plus que des gains confirmés.
  - Mesures sur 16 sessions : 3 améliorations acceptées, toutes confirmées sur des parties indépendantes (+11, +12 et +19 points), et aucun faux positif.
  - Les contre-decks ont été trouvés et confirmés pour 4 decks de test sur 6 (58 à 95 % de victoires). Contre le deck le plus solide, NIGHTMARE répond honnêtement qu'aucun deck ne le bat.
- **Poids tactiques** (AdaptiveAI, jamais utilisés jusqu'ici) : ligue de 300 duels, puis 200 duels face au champion sur des donnes neuves. Les nouveaux poids ne sont adoptés que s'ils font ≥ 55 % avec z ≥ 2. Les plans de jeu ont presque aucune influence avec les poids actuels ; ce sont les poids qui portent la force de NIGHTMARE.

Dans le jeu :
- Section **Forge NIGHTMARE** du laboratoire, avec quatre boutons : Cycle complet (poids, plans, création, amélioration, contre-deck), Créer, Améliorer, Contrer mon deck.
- Liste des decks NIGHTMARE avec leur taux validé et leur « technique » (cartes ajoutées ou retirées), et trois actions : Affronter, Copier dans mes decks, Supprimer.
- Deck adverse **« ◈ NIGHTMARE adaptatif »** : NIGHTMARE joue son contre-deck validé à votre deck, sinon son meilleur deck.
- **Évolution automatique** (désactivable, active par défaut) :
  - après chacun de vos duels (hors campagne), NIGHTMARE cherche en arrière-plan un contre-deck au deck que vous venez de jouer ;
  - il s'arrête dès qu'un nouveau duel commence ;
  - il adopte seul les champions validés.
- Tout est sauvegardé (`nightmareDecksV1`, `championBrain`, `nightmareAutoLast`) et se retrouve après un rechargement ou une mise à jour. **Exporter / Importer NIGHTMARE** transfère decks, champion et mémoire des duels.
- Interface fluide pendant la forge : tâche la plus longue 168 ms, cycle complet d'environ 20 s sur PC.
- `autoDeck` ignore la qualité des cartes : il passe la fiche au lieu de l'identifiant à `cardRating`, qui vaut donc toujours 0. Je ne l'ai pas modifié, car cela changerait les six decks prédéfinis des joueurs. La forge, elle, utilise la note correctement.

Tests : `native/nightmare_forge_test.cjs` (moteur : légalité, déterminisme, annulation, contre-deck confirmé sur des donnes indépendantes, significativité) et `native/nightmare_forge_ui_275.cjs` (22 contrôles dans Chromium : contre-deck réel, cycle complet, adversaire adaptatif en duel réel, apprentissage après le duel, copie, suppression, export → effacement → import).

## 7. Ce qui reste hors périmètre

- **Certification formelle carte par carte** : la relecture manuelle des 150 textes officiels est faite, mais le registre exige que chacun des 280 segments soit relié à un test indépendant (122/280 aujourd'hui). Le verrou NIGHTMARE reste donc fermé.
- **PvP public**, **signature permanente de l'APK** : inchangés (voir `docs/prime_272_readiness.md`).

## 2.7.6 — Éditeur de deck : ajouter toutes les cartes voulues

**Problème signalé.** Dans « Nouveau deck », sans Légende choisie, le catalogue restait vide et on ne pouvait ajouter aucune carte.
- **Cause.** Les limites de RAM se calculent à partir des trois Légendes. Sans Légende, elles valent 0 pour toutes les couleurs, et le filtre masquait donc toutes les cartes.
- **Autre défaut, même origine.** Choisir ensuite des Légendes **supprimait en silence** les cartes que les Légendes ne pouvaient pas jouer. Le bouton « Compléter » en faisait autant.

**Maintenant :**
- Les 124 cartes sont ajoutables à tout moment, avant ou après le choix des Légendes. Tant que les trois Légendes ne sont pas choisies, aucune carte n'est considérée comme illégale.
- Une carte hors couleur ou hors RAM n'est jamais supprimée. Elle est marquée « ⚠ hors Légendes » dans le catalogue et « ⚠ non jouable » dans le deck. Un message l'annonce, et l'enregistrement reste bloqué tant que le deck n'est pas légal.
- Une case « Seulement les cartes jouables avec mes Légendes » filtre le catalogue, et le filtre de couleur propose toutes les couleurs.
- « Compléter » garde toutes vos cartes et ne complète qu'avec des cartes jouables.
- Dans l'onglet « Mon deck » vide, un bouton ramène au catalogue.
- Test `native/deck_editor_276.cjs` (19 contrôles dans Chromium). Il reproduit le cas de la capture : sur 2.7.5 il échoue, car le catalogue ne contient aucun bouton « + », et sur 2.7.6 il passe.

Aucune règle ni aucun effet de carte n'est modifié : `engine.js` reste identique. Les workflows 2.7.5 ne se lancent plus que manuellement ; 2.7.6 a les siens (`prime276-preflight.yml`, `publish-prime276-ota.yml`).

## 2.7.7 — Brouillons de deck

**Besoin.** Un deck inachevé (moins de 40 cartes, Légendes manquantes) ne pouvait pas être enregistré : quitter l'éditeur le faisait disparaître.

**Maintenant :**
- **Enregistrer le brouillon** : bouton dans l'éditeur. Il garde le deck tel quel, même avec 0 Légende et 5 cartes.
- **Sauvegarde automatique** (0,6 s après chaque modification, et immédiatement si l'application passe en arrière-plan ou se ferme). Une session d'éditeur où l'on ne change rien ne crée aucun brouillon.
- **Section « Brouillons »** dans Mes decks : nom, nombre de cartes et de Légendes, date, et ce qui reste à faire (« il manque 3 Légendes et 37 cartes »). On peut **Reprendre** ou **Supprimer** (avec confirmation).
- **« Enregistrer » exige toujours un deck légal.** Un brouillon n'est donc ni jouable, ni sélectionnable, ni vu par NIGHTMARE (stockage séparé : `deckDraftsV1`). L'enregistrement légal d'un deck repris supprime son brouillon.
- Modifier un deck enregistré puis quitter sans enregistrer **ne touche pas le deck** : il crée un brouillon, qui l'écrasera seulement si vous l'enregistrez.
- Le stockage est assaini à chaque lecture : cartes inconnues, identifiants invalides, doublons et JSON corrompu sont ignorés ; 30 brouillons au maximum (les plus récents sont conservés).

**Défaut trouvé par le test et corrigé.** En quittant l'éditeur par la flèche de retour, la liste s'affichait avant l'écriture du brouillon : il était sauvegardé, mais n'apparaissait pas avant d'avoir rouvert l'écran. L'écriture est maintenant forcée avant l'affichage de la liste.

Test `native/deck_drafts_277.cjs` : 25 contrôles dans Chromium (format mobile), dont la reprise après rechargement, la sauvegarde à la fermeture, le stockage corrompu et le plafond de 30. `engine.js` reste identique.

## 2.7.8 — « Ma collection » : liste des cartes illisible

**Problème signalé (capture d'écran).** Dans « Ma collection & synergies », le nom des cartes s'affichait lettre par lettre en colonne, et les boutons « − / + » étaient hors de vue.
- **Cause.** Le bloc de quantité `.sim-qty` hérite de `width:100%`, prévu pour les vignettes verticales de l'éditeur de deck. Dans les lignes horizontales de la collection, il occupait toute la largeur, et la colonne du nom tombait à **0 px**. Chaque ligne atteignait environ 830 px de haut.
- **Correctif.** Dans la collection, le bloc de quantité prend sa largeur naturelle (116 px) et ses boutons font 36 px. Le nom reprend la place restante : 178 px sur un téléphone de 390 px, 108 px sur un petit écran de 320 px. Une ligne fait de 70 à 125 px. Le catalogue de l'éditeur, qui utilise le même bloc en colonne, n'est pas touché.
- **Doublons de noms.** L'écran affichait « Adam Smasher — Acheveur De Légendes · Adam Smasher » ou « (Don't Fear) The Reaper · (Don't Fear) The Reaper ». Le nom anglais n'est désormais ajouté que s'il diffère du nom français.

Test `native/collection_layout_278.cjs` : contrôle les **150 lignes** sur trois tailles d'écran (390, 320 et 1280 px), soit 7 vérifications par taille : nom lisible, bloc compact, ligne pas trop haute, boutons dans la ligne et assez grands, pas de nom répété, « + » et « − » fonctionnels. Il échoue sur 2.7.7 et passe sur 2.7.8. `engine.js` reste identique.

## Reproduire

```bash
python3 native/build_ota_content.py --source native/prime_v275_runtime.html --version 2.7.5 --version-code 27005 --out /tmp/prime275
node native/extract_engine.cjs --check && cmp native/engine.js /tmp/prime275/engine.js
(cd native && node semantic_oracle_runner.cjs && node card_lifecycle_oracles.cjs)
CHAOS_GAMES=5000 PRIME_ENGINE_PATH=/tmp/prime275/engine.js node native/audit_275_chaos.cjs
UI_DUELS=3 node native/ui_full_duel_275.cjs /tmp/prime275 index.html    # nécessite playwright
```
