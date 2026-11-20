# 7 Gigs PRIME — Registre de validation

Dernière mise à jour : 2026-11-20. [Registre de preuves sémantiques](SEMANTIC_CERTIFICATION_2026-11-20.md). Voir [AUDIT_PC_2026-11-20.md](AUDIT_PC_2026-11-20.md) et [OFFICIAL_CARD_AUDIT_2026-11-20.md](OFFICIAL_CARD_AUDIT_2026-11-20.md).

## Niveau de preuve

| Élément | État |
| --- | --- |
| Runtime UI : accueil, menus, bibliothèque, decks, campagne, statistiques, labo, défi local, lancement du duel | 16 / 16 tests réels Chromium réussis sur profils PC et mobile ; pas d'essai sur téléphone physique |
| 150 cartes du runtime | 150 déclarations ; 150 cycles de vie réussis en CI ; 150 fiches officielles rapprochées ; 40 segments liés à des oracles, conformité complète non démontrée |
| Interactions par paires | 22 500 / 22 500 invariants techniques réussis en V8 ; conformité sémantique non prouvée |
| Simulation IA | 1 000 / 1 000 parties terminées en V8 ; 0 coup illégal, 0 exception |
| Textes anglais des 150 cartes | 150/150 fiches récupérées et empreintes calculées ; 40/280 segments avec preuves partielles, 240 à relier ; revue exhaustive NON TERMINÉE |
| Errata officiels | 7 entrées parcourues ; deux errata de mécanique Johnny/Kiroshi testés, cinq corrections de crédits d'illustration |
| Métadonnées officielles des cartes | 150/150 conformes (type, coût, puissance, RAM) ; 2 légendes promo supplémentaires hors périmètre |
| Oracles sémantiques indépendants | 217/217 oracles comportementaux réussis dans GitHub Actions (exécution 44785343305) ; au moins un oracle pour chacune des 150 cartes ; couverture de chaque clause et interaction NON acquise |
| Scénarios individuels des cartes | 150/150 cycles de vie réussis en CI ; ce contrôle n'est pas une certification des effets |
| Résistance des oracles aux erreurs | 23 mutations sémantiques volontairement fautives détectées sur 23 (exécution 44785592350) ; aucune ne survit aux tests ciblés |
| Correction de divergence moteur | Le moteur partagé `native/engine.js` est désormais réextrait du runtime HTML après correction Nocturne OP55N1 ; une incohérence entre version PC et moteur d'audit a été corrigée. |
| Nocturne OP55N1 | 12 oracles ciblés : paiement fixe, 3 choix, réduction EN SOLO, expiration, surtaxe Riot Shield, ciblage d'Unités amies/rivales et durée jusqu'au prochain tour. |
| Corrections Viktor / Alt Cunningham | Le premier CYBERWARE joué gratuitement et le prochain Programme joué gratuitement consomment leurs effets respectifs ; tests de régression ajoutés |
| Segments candidats des textes anglais | 280 segments candidats identifiés ; 40/280 reliés à des preuves d'oracle et empreintes vérifiées dans GitHub Actions ; 240 sans association validée |
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
node native/semantic_oracle_runner.cjs
node native/card_lifecycle_oracles.cjs
node native/semantic_register.cjs
```

Le rapport de l'audit porte exclusivement sur des invariants techniques et des
exécutions synthétiques. Un contrôle combinatoire par paires ne valide pas
automatiquement l'intégralité des timings, effets, choix et errata officiels.

État actuel confirmé par GitHub Actions : **217 oracles PASS sur 150 cartes**,
**150 cycles de vie PASS**, interface Chromium et audit technique PASS.
Workflow : https://github.com/yuri85300-design/lifequest/actions/runs/44785343305 .
Les 280 fragments officiels restent candidats jusqu'à revue indépendante ;
les quarante correspondances de segments reliées aux oracles n'attestent pas une certification totale.
Dernier contrôle officiel consolidé réussi : https://github.com/yuri85300-design/lifequest/actions/runs/44785592330 (150/150 fiches, 201/201 oracles, 13/280 segments associés à des preuves).\nLa certification sémantique est toujours à **0/150**, faute d'une démonstration
de toutes les branches et interactions.

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
