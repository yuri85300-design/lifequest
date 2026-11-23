# NOVICE — Agent QA du premier joueur

## Objet

NOVICE se comporte comme un nouveau joueur de **7 Gigs PRIME 2.7.8**. Il part d'un navigateur propre, découvre les routes rendues par l'application, explore les écrans puis essaie des opérations simples sans manipuler les comptes réels.

Il s'agit d'un **agent logiciel autonome à politique de découverte**, pas d'un LLM connecté ni d'un test sur un téléphone Android physique. Il n'invente pas des bugs : chaque signalement se rattache à une action observable, un résultat ou une erreur Javascript, et les preuves sont archivées.

## Scénarios

- Première ouverture de l'accueil, sans historique ni collection
- Exploration des principales destinations découvertes dans les boutons de l'accueil
- Vérification du débordement horizontal et des surfaces tactiles trop petites
- Lecture des 150 cartes et ouverture de leur fiche
- Tutoriel des règles avant la première partie
- Ajout de cartes, persistance après rechargement, import TXT et CSV, refus des cartes inconnues
- Tutoriel des synergies : progresser, ouvrir les cartes, changer de combinaison
- Création puis récupération d'un brouillon de deck
- Première partie contre l'IA en difficulté « Initiation », main de départ et plateau
- Parcours sur deux formats : mobile 390 × 844 et ordinateur 1280 × 800

## Exécution

GitHub Actions → **NOVICE - Agent QA debutant PRIME 2.7.8** → **Run workflow**, ou automatiquement lors d'une modification du runtime ou de l'agent.

Le workflow construit le paquet du runtime dans un répertoire temporaire. Il exécute `node native/novice_qa_agent.cjs /tmp/prime278-novice /tmp/novice-report` avec Playwright et Chromium.

Rapports à lire : résumé du workflow GitHub Actions, puis artefact `novice-agent-prime278-report` :

- `novice-agent-report.md` : anomalies classées par gravité et scénarios exécutés
- `novice-agent-report.json` : mesures et détails exploitables
- `captures/` : captures d'écran des écrans visités

Les échecs de scénario sont consignés pour revue. Une erreur JavaScript critique échoue également le workflow. **Un workflow vert n'équivaut pas à un jeu sans bugs.**

## Garde-fous

- Aucune transaction, aucune modification de dépôt par l'agent, aucun vrai compte ni données d'utilisateur
- Les validations de gameplay n'affirment jamais la conformité exhaustive des 150 cartes aux règles officielles
- L'exécution navigateur ne remplace pas les contrôles APK physique, OTA, réseau réel, performances des anciens téléphones et accessibilité à des lecteurs d'écran
- L'agent est conçu pour être reproductible : ses parcours sont bornés, aucune action destructive ou monétisée n'est explorée au hasard
- Le code est installé dans `native/novice_qa_agent.cjs`, le workflow dans `.github/workflows/novice-qa-agent.yml`

## Améliorations recommandées à terme

Un mode avec planificateur LLM facultatif pourra être ajouté pour analyser sémantiquement les captures, hésitations et messages d'erreur, une fois une autorisation de coût, des limites d'appels et un traitement des données définis. Le présent agent fonctionne sans clé API externe et fournit un rapport factuel reproductible.

## NOVICE RAGE — mode adversarial (ajout novembre 2026)

La deuxième batterie `native/novice_qa_rage.cjs` n'est pas un agent LLM : c'est un explorateur **piloté par l'état de l'interface** et un générateur de scénarios reproductibles. Elle réalise 4 profils (320, 390, 768, 1280 px), découvre les routes réelles, exécute un parcours aléatoire borné (graine `RAGE_SEED`, défaut `278001`) et vérifie les fonctionnalités par des invariants indépendants.

Contrôles nouveaux : exploration agressive des boutons non destructifs, WCAG via axe-core sur les pages principales, boutons sans nom accessible, débordements horizontaux, tailles tactiles, navigation arrière/avant des tutoriels, progression de toutes les combinaisons pédagogiques, 150 identifiants de cartes et saturation à 99 copies, rapidité des clics +/- et persistance, import CSV `quantite,carte`, import de fichiers trop grands, recherche de cartes inexistantes, annulation de remise à zéro, sauvegarde de brouillon partiel, refus de decks illégaux, structure des decks officiels et stockage local malformé. Chaque scénario est vérifié sur une session neuve pour éviter toute opération sur un compte réel.

**Politique qualité stricte :** le job GitHub Actions devient **rouge** si une anomalie `critical` ou `major` est détectée ou si un scénario échoue. Un job rouge est un résultat utile de l'agent, pas un signe que le rapport a été perdu. Le résumé et l'artefact contiennent les traces, preuves et captures. Un `minor` est également remonté, sans bloquer une publication.

Pour reproduire un scénario localement : construire le paquet HTML via `native/build_ota_content.py`, installer `playwright@1.56.1` et `axe-core@4.10.3`, installer Chromium, puis `RAGE_SEED=278001 RAGE_ACTIONS=55 node native/novice_qa_rage.cjs /tmp/prime278-novice /tmp/novice-rage-report`.

Le testeur ne remplace pas un humain testant des heures sur un vrai Android. Il peut signaler des faux positifs (notamment des timings ou des critères d'accessibilité), qui doivent être triés et, si nécessaire, reproduits avant correction.
