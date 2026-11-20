# 7 Gigs PRIME — Registre de validation

Dernière mise à jour : 2026-11-20.

## Niveau de preuve

| Élément | État |
| --- | --- |
| Runtime UI : campagne, statistiques, défi local | Implémenté, non validé sur téléphone |
| 150 cartes du runtime | 150 attendues par le test technique ; vérification détaillée non réalisée |
| Interactions par paires | Audit programmé pour 150 × 150 = 22 500 couples ; résultats non vérifiés |
| Simulation IA | 1 000 duels configurés dans l'audit ; résultats non vérifiés |
| Comparaison avec les textes officiels anglais | NON EFFECTUÉE |
| Comparaison avec errata | NON EFFECTUÉE |
| Certification des cartes | NON ACQUISE |
| NIGHTMARE réentraînement compétitif | BLOQUÉ par NIGHTMARE_TRAINING_CERTIFIED=false |
| Web Worker tactique | Code restauré ; comportement à confirmer en appareil |
| APK Android | Workflow assembleDebug ajouté ; artefact à valider |
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
