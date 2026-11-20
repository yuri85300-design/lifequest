# 7 Gigs PRIME — Registre de validation

Dernière mise à jour : 2026-11-20. Audit V8 mesuré : voir [AUDIT_PC_2026-11-20.md](AUDIT_PC_2026-11-20.md).

## Niveau de preuve

| Élément | État |
| --- | --- |
| Runtime UI : campagne, statistiques, défi local | Implémenté, non validé sur téléphone |
| 150 cartes du runtime | 150 déclarations ; 150 entrées en jeu synthétiques réussies ; vérification officielle de chaque texte non réalisée |
| Interactions par paires | 22 500 / 22 500 invariants techniques réussis en V8 ; conformité sémantique non prouvée |
| Simulation IA | 1 000 / 1 000 parties terminées en V8 ; 0 coup illégal, 0 exception |
| Comparaison avec les textes officiels anglais | NON EFFECTUÉE |
| Comparaison avec errata | NON EFFECTUÉE |
| Certification des cartes | NON ACQUISE |
| NIGHTMARE réentraînement compétitif | BLOQUÉ par NIGHTMARE_TRAINING_CERTIFIED=false |
| Web Worker tactique | Chargement et choix légal validés sur 1 état synthétique ; tests complets navigateur en attente |
| APK Android | Workflow assembleDebug ajouté ; compilation réelle et artefact à valider |
| Essai Android réel | NON EFFECTUÉ |
| PvP direct / réseau | NON IMPLÉMENTÉ |
| Défi local alternatif | Deux matchs contre IA avec graine partagée, scores comparés |

## Commandes reproductibles

```sh
node native/extract_engine.cjs
node --check native/engine.js
node --check native/ai-worker.js
node native/audit_220.cjs
```

Le rapport de l'audit porte exclusivement sur des invariants techniques et des
exécutions synthétiques. Un contrôle combinatoire par paires ne valide pas
automatiquement l'intégralité des timings, effets, choix et errata officiels.

Les workflows **7 Gigs PRIME - audit technique** et
**7 Gigs PRIME - Android debug APK** se trouvent dans GitHub Actions.
L'APK compilée, si la tâche aboutit, est déposée en artefact du workflow.
Il faut encore installer et tester cet artefact sur appareil Android réel.

## Sources de référence à confronter

- Règles complètes officielles (anglais) :
  https://cyberpunktcg.com/comprehensive-rules
- Cartes officielles :
  https://cyberpunktcg.com/cards

Les textes anglais publiés par l'éditeur priment sur les traductions locales.
Ne pas annoncer de conformité officielle ou réentraîner/promouvoir NIGHTMARE
avant comparaison clause par clause et preuves de tests concluantes.
