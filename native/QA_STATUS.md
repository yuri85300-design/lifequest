# 7 Gigs PRIME — Registre de validation

Dernière mise à jour : 2026-11-20. [Registre de preuves sémantiques](SEMANTIC_CERTIFICATION_2026-11-20.md). Voir [AUDIT_PC_2026-11-20.md](AUDIT_PC_2026-11-20.md) et [OFFICIAL_CARD_AUDIT_2026-11-20.md](OFFICIAL_CARD_AUDIT_2026-11-20.md).

## Niveau de preuve

| Élément | État |
| --- | --- |
| Runtime UI : accueil, menus, bibliothèque, decks, campagne, statistiques, labo, défi local, lancement du duel | 16 / 16 tests réels Chromium réussis sur profils PC et mobile ; pas d'essai sur téléphone physique |
| 150 cartes du runtime | 150 déclarations ; 150 entrées en jeu synthétiques réussies ; vérification officielle de chaque texte non réalisée |
| Interactions par paires | 22 500 / 22 500 invariants techniques réussis en V8 ; conformité sémantique non prouvée |
| Simulation IA | 1 000 / 1 000 parties terminées en V8 ; 0 coup illégal, 0 exception |
| Textes anglais des 150 cartes | 150/150 fiches récupérées et empreintes calculées ; examen sémantique clause par clause NON EFFECTUÉ |
| Errata officiels | 7 entrées parcourues ; deux errata de mécanique Johnny/Kiroshi testés, cinq corrections de crédits d'illustration |
| Métadonnées officielles des cartes | 150/150 conformes (type, coût, puissance, RAM) ; 2 légendes promo supplémentaires hors périmètre |
| Oracles sémantiques indépendants | 40/40 contrôles réussis directement sur 31 cartes distinctes ; 119 cartes sans oracle sémantique dédié (validation GitHub à confirmer) |
| Scénarios individuels des cartes | 150/150 cycles de vie réussis en CI ; ce contrôle n'est pas une certification des effets |
| Certification des effets | NON ACQUISE : aucune carte n'est attestée clause par clause avec exhaustivité |
| NIGHTMARE réentraînement compétitif | BLOQUÉ par NIGHTMARE_TRAINING_CERTIFIED=false |
| Web Worker tactique | Chargement en Chromium observé ; 1 action de décision synthétique légale ; stress tests avancés non validés |
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

Les workflows **7 Gigs PRIME - audit technique**, **7 Gigs PRIME - PC browser smoke**, **7 Gigs PRIME - current official card catalogue** et **7 Gigs PRIME - Android debug APK** se trouvent dans GitHub Actions.
Le contrôle Chromium étendu a réussi ses 16 scénarios (8 parcours sur deux formats d'écran).
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
