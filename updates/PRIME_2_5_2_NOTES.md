# PRIME 2.5.2 — Mise à jour interne (sans nouvelle APK)

## Nouveautés livrées

- **Académie sur le vrai moteur** : 3 missions sur plateau préparé — vendre une carte pour obtenir un Eddie, équiper une Unité avec Gorilla Arms et voler le Gig de victoire. Chaque décision provient de `Game.legalActions(0)` et est résolue par `Game.doAction`. Une action incorrecte ne déverrouille pas artificiellement la mission. Les progrès de l'Académie sont mémorisés séparément.
- **Replay public enrichi** : conservation des états des Unités (prête/engagée), équipements, Gigs (types et valeurs), ressources disponibles et Légendes révélées. Les mains ne sont jamais archivées carte par carte, et les Légendes face cachée restent masquées. Les anciens journaux restent lisibles.
- **Lisibilité sur mobile** : interrupteur dans le menu du duel ; boutons d'au moins 48 px CSS, textes agrandis, contraste renforcé et focus clavier visible. Préférence locale persistante.
- **Aucune modification des règles du TCG** : même moteur et mêmes 150 illustrations françaises dans l'APK 2.5.0.
- **Distribution** : paquet de contenu HTML/IA uniquement via GitHub Releases, empreinte SHA-256 vérifiée par le lanceur. Aucun nouvel APK nécessaire à partir de PRIME 2.5.0.

## Contrôles effectués
Les vérifications GitHub Actions imposent, avant publication du manifeste :
- compilation syntaxique des scripts de la page et du Worker IA ;
- scénarios historiques, 22 500 combinaisons ordonnées de deux cartes, 1 000 simulations de duels IA (tests d'intégration et de stabilité) ;
- exécution des 3 missions sur des actions légalement proposées et contrôle des objectifs par l'état moteur ;
- test du respect des informations cachées dans les nouveaux snapshots de replay ;
- confirmation que les 150 identifiants d'images VF restent présents dans les références locales du paquet de contenu.

## À ne pas surinterpréter
La certification indépendante caractère par caractère des 150 cartes et de leurs errata reste incomplète. Les replays sont des **instantanés publics** du déroulement, pas une réexécution déterministe intégrale. NIGHTMARE n'est pas réentraînée ni statistiquement reconnue supérieure par cette livraison. Le multijoueur local à deux personnes n'est pas encore ajouté.

## Installation et mise à jour
1. Installer une fois PRIME 2.5.0 via l'APK de compilation officielle GitHub (identifiant Android stable `dev.septgigs.neonarena.prime`).
2. Ouvrir le jeu ; toucher **↻ Vérifier les mises à jour**, puis confirmer la version **2.5.2** et relancer.
3. Les 150 illustrations déjà installées et les sauvegardes ne sont pas effacées par cette mise à jour de contenu. Le mode hors ligne fonctionne après activation.

**Attention** : pour les futures mises à jour du lanceur Android, une signature permanente via les secrets GitHub est encore nécessaire ; les APK antérieurs de test signés avec une clé éphémère ne bénéficient pas de la mise à jour native en place.
