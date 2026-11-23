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
