# 7 Gigs PRIME — état de livraison 2.7.2

## Application Android
- Coque native installable de référence : **PRIME 2.5.4**.
- Contenu OTA : **2.7.2**, `version_code=27002`, `min_shell=25004`.
- Mise à jour dans **Menu → Mise à jour**, sans bouton flottant.
- Les 150 illustrations VF sont embarquées dans la coque Android et doivent fonctionner hors connexion.
- Sauvegardes existantes : aucun changement du schéma de sauvegarde de duel `gameV230`; états de campagne conservés dans `primeCampaignV1`.

## Fonctionnalités vérifiées par les tests de prépublication
- **Campagne** : 2 chapitres, 12 contrats, validation des victoires réelles.
- **Académie** : 12 énigmes tactiques, actions proposées par le moteur, résultats vérifiés.
- **Décks** : filtres, illustrations, recherche, probabilités de main, suggestions légales prévisualisables dans un nouveau brouillon.
- **Duels** : guide interactif, actions contextuelles, informations publiques et tailles de texte adaptées.
- **Replays** : captures publiques, bilan descriptif des ventes, actions, Gigs et résultats ; ne révèle pas de main adverse cachée.
- **NIGHTMARE** : diagnostic sur 12 situations tactiques, comparaison de légalité. **Pas de promotion d'une politique entraînée sans certification**.
- **OTA** : manifeste monotone à mise à jour atomique, pas de rétrogradation automatique ; SHA-256 du paquet validée par l'application.

## Tests reproductibles
- `native/audit_271.cjs` : campagne, données de deck, navigation.
- `native/audit_271_puzzles.cjs` : 12 actions et états finaux.
- `native/audit_271_ai.cjs` : 12 situations tactiques et absence de certification artificielle.
- `native/audit_272.cjs` : trois observations de replay et absence de fuite d'informations privées.
- `native/audit_270_league.cjs` : ligue de politique rapide, non assimilable au champion NIGHTMARE.
- `native/audit_220.cjs` / `audit_230.cjs` : invariants du moteur, interactions et sauvegardes.
- `multiplayer/protocol.test.mjs` / `match-coordinator.test.mjs` : primitives de sécurité du futur serveur multijoueur.

## Trois limites avant une livraison compétitive définitive
1. **Certification sémantique des 150 cartes** : les 150 textes sur les pages et l'API publiées correspondent caractère par caractère, mais cela ne prouve pas que chaque effet et chaque interaction est implémenté parfaitement. Le verrou reste activé.
2. **PvP public** : le dépôt contient des composants de protocole et de coordination côté serveur. Ils ne forment pas un mode multijoueur disponible. Avant ouverture : serveur faisant autorité, identité et sessions, TLS/WSS, contrôle d'abus, reconnect, horloges, journal des décisions, tests de charge et audit de sécurité.
3. **Signature native des mises à jour APK** : en l'absence d'une clé de signature persistante configurée, une future mise à jour de la coque Android peut exiger une réinstallation. L'OTA de contenu est distincte de cette contrainte.

## Installation
1. Conserver la coque PRIME 2.5.4 installée.
2. Dans le jeu : **☰ Menu → Mise à jour**.
3. Télécharger et activer la plus récente version OTA, puis relancer.
4. Vérifier que les sauvegardes sont présentes avant toute modification de l'installation.

Ce fichier décrit les composants existants et leurs limites. Aucune revendication de certification compétitive officielle.
