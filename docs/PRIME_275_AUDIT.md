# 7 Gigs PRIME 2.7.5 — audit complet et corrections

Mise à jour de contenu OTA (`version_code=27005`, `min_shell=25004`). Elle s'installe via **Menu → Mise à jour** sans réinstaller l'APK. Les decks, la collection, la campagne et **les duels en cours** sont conservés.

## 1. Problème principal : le moteur testé n'était pas le moteur publié

`native/engine.js`, que valident tous les tests de règles (oracles), était extrait de l'ancien runtime `prime_v220_runtime.html`. Le jeu publié (2.7.0 → 2.7.4) venait de `prime_v272_runtime.html`. Les corrections de règles arrivaient dans `engine.js` et la copie 2.2.0, et les tests passaient. Le jeu réellement installé gardait les bugs.

Résultat mesuré sur le moteur publié en 2.7.4 : **10 tests de règles en échec sur 357**.

Corrections structurelles :
- `native/extract_engine.cjs` extrait désormais le moteur du runtime publié (`prime_v275_runtime.html`), avec les mêmes bornes que `build_ota_content.py`.
- `node native/extract_engine.cjs --check` échoue si `engine.js` diffère du moteur publié.
- Les workflows 2.7.5 (`prime275-preflight.yml`, `publish-prime275-ota.yml`) vérifient `cmp native/engine.js <moteur du paquet>`, puis lancent les 357 oracles **avant** toute publication.

## 2. Règles corrigées dans le jeu publié

| Carte | Erreur dans 2.7.4 | Comportement 2.7.5 |
|---|---|---|
| Viktor Vektor — Drop Your Illusions | Un CYBERWARE joué gratuitement ne consommait pas la réduction « premier CYBERWARE du tour » : on pouvait cumuler gratuit puis -3 €$. | Toute pose de CYBERWARE, même gratuite, consomme la réduction (3 tests). |
| Alt Cunningham — Soulkiller Architect | Un Programme joué gratuitement laissait la réduction « prochain Programme » active. | La réduction est consommée par le prochain Programme réellement joué. |
| Nocturne OP55 N1 | Le choix « EN SOLO -2 €$ » imposait de désigner une Légende déjà face visible. La réduction était aussi refusée sans Légende EN SOLO visible. | La réduction vaut pour n'importe quelle Légende amie ce tour, coûte au minimum 1 €$, n'est consommée que par un EN SOLO réussi et expire en fin de tour (4 tests). |
| Arasaka Emergency Radioport | Après un Appel, l'effet ne permettait même plus de **regarder** la Légende face cachée. | Regarder reste permis ; seul l'Appel gratuit est bloqué (un seul Appel par tour). |
| Rogue Amendiares — Queen of the Afterlife | Le Gig volé était comparé à la puissance de l'**unité voleuse**. | Il est comparé à la puissance de **Rogue** (« de cette Unité »). Nouveau test : Animals Wrecker (10) vole un 6 alors que Rogue a 4 de puissance → aucun Eddie redressé. |

Les cinq premières corrections existaient déjà dans `engine.js` mais n'avaient jamais été livrées. La correction de Rogue est nouvelle. Son test échoue sur 2.7.4 et passe sur 2.7.5.

## 3. Compatibilité entre les cartes

`native/audit_275_chaos.cjs` génère des decks **légaux aléatoires** à partir des 150 cartes. Les joueurs choisissent au hasard parmi les actions légales : attaques, blocages, réactions, ventes, Appels, EN SOLO, capacités et choix d'effets. Cela explore des combinaisons qu'une IA ne tente jamais. Après **chaque action**, le test vérifie :
- chaque carte existe exactement une fois (aucune duplication, aucune perte) ;
- chaque joueur possède toujours ses 43 cartes ;
- les cartes en main, dans le deck, au rebut ou en Eddies appartiennent au joueur de cette zone ;
- aucun équipement ne reste attaché hors du terrain ;
- les puissances sont des nombres valides et les Gigs restent dans les bornes de leur dé ;
- la partie se termine sans erreur moteur.

Résultat : **5 000 parties, ~200 000 actions, 0 erreur, 0 violation**. Les 124 cartes non-Légende ont toutes été jouées au moins une fois. Une relecture manuelle des 150 définitions (texte français ↔ code) a été faite en complément ; elle a trouvé l'écart de Rogue.

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

## 5. Ce qui reste hors périmètre

- **Certification officielle carte par carte** : toujours bloquée (pas de comparaison automatisée avec les fiches anglaises officielles depuis cet environnement). Le verrou NIGHTMARE reste fermé.
- **PvP public**, **signature permanente de l'APK** : inchangés (voir `docs/prime_272_readiness.md`).

## Reproduire

```bash
python3 native/build_ota_content.py --source native/prime_v275_runtime.html --version 2.7.5 --version-code 27005 --out /tmp/prime275
node native/extract_engine.cjs --check && cmp native/engine.js /tmp/prime275/engine.js
(cd native && node semantic_oracle_runner.cjs && node card_lifecycle_oracles.cjs)
CHAOS_GAMES=5000 PRIME_ENGINE_PATH=/tmp/prime275/engine.js node native/audit_275_chaos.cjs
UI_DUELS=3 node native/ui_full_duel_275.cjs /tmp/prime275 index.html    # nécessite playwright
```
