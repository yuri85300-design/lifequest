# Les Cendres du Signal — Campagne narrative PRIME 2.8.0

## Présentation

Nouvelle campagne solo et hors ligne au sein de 7 Gigs PRIME, indépendante des **12 missions de la campagne précédente**. Une intrigue originale de cyberpunk à Night City autour de Mara Vex (Fixer), Iris (netrunner), Kite (mercenaire) et Voss (corporation) suit le vol d'un fragment de mémoire et la découverte du **Protocole SÉPULCRE**, une IA qui tente de déterminer les choix des habitants.

**Entrée dans le jeu :** Accueil → « Les Cendres du Signal · Histoire des 150 cartes ». Un raccourci existe depuis la préparation d'un duel et depuis l'Académie.

**Progression :** 15 chapitres, chacun présentant 10 cartes uniques, 2 questions par carte, un exemple de synergie et une décision narrative. Les décisions se répercutent dans les réponses des personnages et dans l'épilogue. La mission suivante exige d'avoir terminé les dix dossiers, réussi le test de synergie et pris une décision. Une erreur de quiz ne supprime pas les réponses acquises.

## Les cinq actes

| Acte | Chapitres | Fil narratif | Compétences |
| --- | --- | --- | --- |
| I | 1–5 | Mémoire volée à Watson, trois clés, embuscade Maelstrom, crise de Heywood, atelier souterrain | Vente, trois Légendes, RAM, Latence, défense et équipements |
| II | 6–9 | Pacifica, déclencheurs cachés, guerre des Gigs, marché de souvenirs | QUICK, actions conditionnelles, vol et ressources |
| III | 10–12 | Corpo Plaza, convoi dans les Badlands, probabilités truquées | Construction légale, équipements, dés et Street Cred |
| IV | 13–14 | Sas de Dogtown, clinique des cent cinquante dossiers | Réactions, timing, assemblage de deck et lecture des effets |
| V | 15 | Confrontation avec SÉPULCRE et choix de l'avenir du Signal | Synthèse et épilogue narratif |

## Couverture pédagogique et limites

- **150/150 cartes** du runtime, distribuées sans doublons (10 cartes par chapitre).
- **300 questions** : 150 sur les catégories ; 143 sur des extraits des effets réellement définis dans le jeu, 7 sur les mots-clés/affiliations, car ces cartes n'ont pas de texte d'effet détaillé.
- **450 pistes de partenaires** (3 par carte) avec conseils pour évaluer leur complémentarité. Il s'agit **d'hypothèses pédagogiques**, et non de 450 combos vérifiés par les règles officielles. Six associations documentées dans l'Académie des synergies fournissent aussi des explications conditionnelles étape par étape, répétées aux moments pertinents de l'intrigue.
- **15 duels facultatifs** contre les decks réels de PRIME. Un insigne est attribué uniquement à la victoire d'un duel achevé par le moteur ; aucun quiz, choix narratif ou limite de calcul ne fabrique une victoire.
- Le texte intégral de chaque effet est affiché dans le dossier ; le bouton de la fiche détaillée ouvre la carte du jeu. L'existence d'un dossier maîtrisé ne prouve **pas** la connaissance exhaustive de toutes les interactions ou de tous les errata.
- Le système de cartes, les 12 contrats historiques, l'Académie, NIGHTMARE et les sauvegardes antérieures restent indépendants.

## Sauvegarde et sécurité

État dans `septgigs.storyCindersV1` (schéma 1), comprenant les étapes de lecture, décisions, combos validés, chapitres achevés et duels réellement gagnés. Au chargement, les identifiants et états non reconnus sont ignorés ; un chapitre ne peut rester indiqué terminé si ses dix dossiers et ses prérequis ne sont pas validés. L'état d'une partie de l'histoire est stocké comme `storyRun` dans la sauvegarde du duel afin qu'une reprise de partie conserve son contexte.

Les anciens decks et données de collection ne sont pas réinitialisés. Les victoires narratives n'accordent ni objets réels ni cartes de collection.

## Architecture et tests

- `native/story_campaign_280.cjs` — intrigue, génération déterministe des 15 lots, dossiers, questionnaires, partenaires et progression normalisée.
- `native/story_ui_280.cjs` — pages accessibles au toucher et au clavier, liens entre cartes, décisions, quiz, duels, retour au récit.
- `native/prime_v280_runtime.html` — version autonome, contenant les deux modules en ligne pour mise à jour OTA.
- `native/story_campaign_280.test.cjs` — contrôles automatisés du runtime : couverture de 150 cartes, 300 questions, verrouillage, sauvegarde, mauvaise réponse, combinaisons, épilogue et interdiction des fausses victoires.
- `.github/workflows/story-prime280-preflight.yml` et `.github/workflows/publish-prime280-ota.yml` — test de construction et blocage de publication tant que les scénarios, les vérifications de règles et NOVICE RAGE ne passent pas.

**Tests à compléter à terme :** parcours de jeu longs, lectorat en situation réelle, compatibilité des anciens Android physiques, qualité de toutes les interactions combinatoires, validation humaine du rythme du récit. Une exécution verte ne constitue pas une garantie universelle d'absence de bugs.

## Extension PRIME 2.8.1 — entraînement appliqué sur toutes les cartes

Cette version ajoute un **exercice de décision tactique pour chacune des 150 cartes**, après les deux questions de lecture déjà présentes. Le joueur doit choisir l'action conforme à la catégorie et, lorsqu'ils sont présents, aux mots-clés pertinents (par exemple BLOCKER ou RAPIDE). Une mauvaise réponse n'est pas validée ; une bonne décision est enregistrée localement. Les exercices sont des mises en situation pédagogiques sur la légalité, **pas des résolutions de partie exécutées par le moteur**.

Chaque chapitre présente aussi un **atelier d'association de deux cartes prises parmi ses dix dossiers**. Les 15 ateliers sont différents ; ils demandent de comparer les textes, les couleurs, la RAM, les coûts et les fenêtres d'action. Ils sont clairement signalés comme des pistes de construction à vérifier, non comme des combos d'effets officiels certifiés. Les six synergies documentées restent disponibles à côté.

**Parcours requis pour les nouveaux chapitres :** dix dossiers étudiés (deux questions chacun), dix décisions tactiques correctes, un contrôle de synergie et un choix narratif. Les duels contre l'IA restent facultatifs et une victoire n'est comptée que lorsqu'elle provient réellement du moteur.

**Sauvegardes existantes :** les chapitres légitimement terminés en 2.8.0 restent terminés après migration vers le schéma 2. Les chapitres non terminés acquièrent les nouvelles décisions tactiques à réaliser. La sauvegarde conserve la clé `septgigs.storyCindersV1` et n'affecte pas les decks, la collection ni les autres campagnes.

**Sources et validations :** `native/story_campaign_281.cjs`, `native/story_ui_281.cjs`, `native/prime_v281_runtime.html`, `native/story_campaign_281.test.cjs` et workflows `story-prime281-preflight.yml` et `publish-prime281-ota.yml`. La campagne vérifie 150 dossiers, 300 questions originales, 150 décisions tactiques, 15 ateliers distincts, la non-validation des réponses incorrectes, les sauvegardes et le déroulement séquentiel.

**Limites :** ces 150 décisions ne sont pas 150 validations indépendantes de tous les effets. Les interactions combinatoires du jeu et les errata officiels nécessitent toujours des tests sémantiques distincts, et les duels réels restent essentiels pour apprendre à jouer.
