# NOVICE RAGE — constats du 23 novembre 2026

**Révision testée :** PRIME 2.7.8, runtime reconstruit depuis le dépôt.  
**Exécution :** [GitHub Actions 45155783781](https://github.com/yuri85300-design/lifequest/actions/runs/45155783781).  
**Traces, JSON et captures :** [artefact 14807918573](https://github.com/yuri85300-design/lifequest/actions/runs/45155783781/artifacts/14807918573).  
**Graine reproductible :** `RAGE_SEED=278001`.  
**Périmètre :** Chromium 320/390/768/1280 px, 74 scénarios, 220 actions d'exploration.

## Résultat

- **70 scénarios réussis**, **4 en échec**.
- **8 signalements « critical »**, **10 « major »**, **14 « minor »**, en comptant les observations répétées sur plusieurs résolutions.
- **15 intitulés distincts** après regroupement ; certains sont des doublons ou des conséquences du même défaut.
- Le workflow se termine en **échec intentionnel**, car les défauts majeurs sont désormais bloquants.

## Défauts à corriger en priorité

### P0 — L'écran Mes decks plante après corruption du stockage

- **Reproduction :** navigateur isolé ; enregistrer dans `localStorage` la valeur `{"prototype":{}}` sous `septgigs.decks`, puis recharger et ouvrir « Mes decks ».
- **Observé :** `TypeError: Cannot read properties of undefined (reading 'reduce')` dans `decksScreen`, à l'accès à `dk.main.reduce` (ligne ~7573 de PRIME 2.7.8).
- **Cause plausible :** les decks personnalisés lus depuis le stockage ne sont pas tous revalidés/normalisés avant leur affichage.
- **Correction suggérée :** filtrer les enregistrements dont `main` ou `legends` sont absents, vérifier les IDs, conserver un catalogue intact et offrir une récupération des données sans plantage.
- **Précision :** scénario d'injection volontaire ; il mesure la résilience face à une sauvegarde altérée, pas un crash observé en utilisation normale.

### P1 — Importation CSV standard non fonctionnelle

- **Reproduction :** « Ma collection » → « Importer une liste » → choisir un CSV avec `quantite,carte` puis `2,mantis-blades` et `1,corpo-security` → valider.
- **Observé :** aucune copie supplémentaire n'a été enregistrée. Confirmé sur mobile et ordinateur.
- **Correction suggérée :** accepter explicitement les séparateurs CSV, l'en-tête et les guillemets ; conserver le support des lignes TXT `2x nom` et signaler les lignes rejetées.

### P1 — Filtres sans noms accessibles

- **Constats WCAG (axe-core) :** `select-name` sur `#color` du catalogue et `#collectionType` de la collection.
- **Correction suggérée :** vrais `label for` ou `aria-label` explicites pour chaque filtre, puis revalidation avec lecteur d'écran.

## Accessibilité et ergonomie

- **ARIA interdit :** `.tcg-deck-arts[aria-label]` sur la liste de decks ; ajouter une sémantique adaptée (par exemple `role="group"`) ou déplacer le libellé.
- **Défilement clavier :** `.collection-missing` et `.scroll` de l'écran Règles signalés par `scrollable-region-focusable` ; prévoir un accès clavier.
- **Petite cible tactile :** commande `forgeAuto` du laboratoire mesurée à 13 × 13 px ; agrandir sa zone cliquable sans forcément agrandir le graphisme.
- **Cliquabilité dans l'exploration aléatoire :** quelques clics ont dépassé le délai de 2 secondes (retour, palmarès, nouveau deck). **À qualifier** : ils peuvent être masqués temporairement par une feuille modale ou dépendre d'un scroll. Ne pas les considérer automatiquement comme des bugs avérés.

## Méthode et limites

L'agent exécute une politique d'exploration déterministe avec vérifications d'invariants et axe-core, **pas** une IA multimodale qui interprète librement tous les écrans. Les rapports conservent les scénarios, sélecteurs et captures. Ces résultats ne certifient ni le moteur de règles ni NIGHTMARE, et ne remplacent pas les tests sur Android physique.

## Ordre de correction recommandé

1. Protéger `decksScreen` et les lectures de stockage contre les structures invalides.
2. Réparer l'importation CSV avec tests de non-régression.
3. Ajouter les libellés des filtres et corriger les autres erreurs d'accessibilité.
4. Examiner les clics bloqués puis les défauts tactiles.
5. Relancer **NOVICE RAGE** après chaque correctif : un résultat vert doit correspondre à zéro anomalie critique/majeure détectée, pas à la désactivation des tests.
