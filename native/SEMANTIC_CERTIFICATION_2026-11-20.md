# 7 Gigs PRIME — audit sémantique et preuves indépendantes
Mise à jour : 20 novembre 2026

## Verdict et périmètre

**150/150 cartes disposent d'au moins un oracle comportemental individualisé.
170/170 oracles réussis en CI. Certification sémantique intégrale : NON ACQUISE.**

Ces deux chiffres ne sont pas contradictoires : un test dédié vérifie une ou
plusieurs propriétés concrètes mais ne démontre pas toutes les phrases,
conditions, alternatives, séquences, interactions et errata.

Le verrou `NIGHTMARE_TRAINING_CERTIFIED = false` demeure **actif**.
Ne pas faire dériver automatiquement la certification de la couverture
technique, du nombre d'oracles ou des empreintes officielles.

## Preuves effectivement exécutées

| Test | Résultat | Sens exact |
| --- | --- | --- |
| Déclarations de cartes du moteur | 150 | Collection de base |
| Métadonnées anglaises éditeur | 150/150, sans divergence | Type, coût, puissance, RAM |
| Empreintes officielles en anglais | 150/150 | Fiches enregistrées et versionnées |
| Gestionnaires de déclencheurs imprimés | 0 manquant détecté | Existence du gestionnaire, pas exactitude |
| Scénarios individuels cycle de vie | 150/150 | Entrée en jeu, destination, UID, propriétaire |
| Oracles comportementaux dédiés | **170/170 PASS** | **150 cartes distinctes** |
| Interactions paires techniques | 22 500/22 500 | Invariants d'état |
| Parties IA/IA | 1 000/1 000 | Terminaison, légalité des coups |
| Écran PC / mobile émulé Chromium | 16/16 | Parcours de l'interface |
| Cartes certifiées sur toutes les clauses | **0/150** | Revue exhaustive encore manquante |

Workflow indépendamment exécuté et réussi :
https://github.com/yuri85300-design/lifequest/actions/runs/44773649539

Le workflow produit les preuves `semantic-oracles.json`,
`card-lifecycle.json`, `semantic-register.json` et
`semantic-gaps.md`. Des exécutions réunissant l'audit officiel produisent
également `official-cards.json`, ses SHA-256 et les segments candidats du
texte officiel.

## Infrastructure de validation

- `native/semantic_oracle_runner.cjs` regroupe **10 suites** ;
  il échoue si une carte n'a aucun oracle dédié, si une attente échoue, ou
  si l'inventaire diverge de 150.
- `native/card_lifecycle_oracles.cjs` vérifie le cycle de vie séparément.
- `native/official_card_audit.cjs` contrôle les textes anglais publiés,
  les caractéristiques et les déclencheurs imprimés.
- `native/semantic_register.cjs` conserve les preuves par identifiant,
  les empreintes des textes, les clauses candidates non revues et les lacunes.
- `.github/workflows/semantic-oracles.yml` et
  `.github/workflows/official-cards.yml` exécutent les validations en CI.

## Verrous restant à lever pour une certification effective

1. Découper chaque texte anglais officiel en clauses contrôlées par un réviseur,
   et pas uniquement au moyen d'une séparation automatique en phrases.
2. Relier **chaque clause** à au moins un oracle de comportement indépendant ;
   tester aussi les conditions vraies et fausses, les cibles indisponibles,
   les choix optionnels, les zones cachées et les cas limites.
3. Tester les interactions combinées (plusieurs effets simultanés,
   capacités Quick, protection/vol de Gigs, deck épuisé, effets de remplacement)
   selon les règles complètes et errata du **17 novembre 2026**.
4. Vérifier l'absence d'écart entre comportement, texte anglais et
   règles générales ; conserver les résultats et la version officielle.
5. Ne marquer `semanticCertified: true` qu'après cette démonstration,
   pour chacune des 150 cartes, sans dérogation automatique.

**Le jalon « 100 % des cartes avec oracle individualisé » est atteint. Dix oracles supplémentaires couvrent des branches alternatives de choix, le refus d'un effet facultatif et la consommation de protections.
Le jalon « 100 % des clauses et interactions certifiées » ne l'est pas.**

Références :
https://cyberpunktcg.com/cards
https://cyberpunktcg.com/errata
https://cyberpunktcg.com/comprehensive-rules
