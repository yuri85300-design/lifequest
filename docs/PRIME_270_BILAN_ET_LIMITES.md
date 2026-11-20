# 7 Gigs PRIME 2.7.0 — bilan et seuils de publication

## Fonctionnalités en service (contenu OTA Android 2.5.4+)

- Accueil TCG avec menu de mise à jour uniquement dans les menus.
- Éditeur de decks illustré, validation RAM, copies, taille et contrôle de collection.
- Probabilités exactes d’au moins une carte-cible en main de six, sans remise.
- Conseiller de remplacement heuristique, chaque échange devant préserver les contraintes détectées ; aucune optimisation compétitive n’est garantie.
- Combat : bouton « Pourquoi ? », récapitulatif public, actions légales présentes, historique public et statut des ressources.
- Six missions tactiques exécutées dans le moteur, dix-sept quiz de formation.
- Campagne solo de six étapes avec introduction narrative et palmarès persistant ; seules les parties réellement conclues sont enregistrées.
- Confort : texte agrandi et animations réduites, persistés localement.
- NIGHTMARE : six sondes de décision sans entraînement, vérification de légalité, résultat attendu séparé des replis ; historique d’apprentissage humain conservé.
- Mise à jour : manifeste monotone avec contrôle de concurrence, comparaison de version et empreinte d’archive.

## Vérifications automatiques

- Compilations JavaScript et sauvegarde/reprise.
- Régression du moteur (dont les 150 cartes présentes), scénarios d’interactions et simulation.
- Toutes les six missions jouées avec actions autorisées.
- Benchmarks 40 duels, statuts incomplets/erreurs séparés, jamais de victoire issue d’une limite de calcul.
- Validations du menu, des images, de la saisie, des champs cachés et des scénarios de décision IA.
- Tests de conflit de version (ancien manifeste, manifest concurrent, incrément).
- Couche PvP : vérification technique des intentions liées à un match et à une séquence, validation exclusivement contre les coups générés par le moteur, suppression des zones privées dans la projection. Aucun mécanisme cryptographique de signature ou d’authentification n’est encore implémenté.

## Ce qui n’est PAS prêt à annoncer comme certifié

1. **NIGHTMARE entraînement champion : bloqué.** `NIGHTMARE_TRAINING_CERTIFIED=false`. Il reste à qualifier toutes les branches sémantiques et errata des effets des 150 cartes. Une comparaison exacte des textes des 150 cartes entre pages et API ne vaut pas validation des implémentations du moteur.
2. **Catalogue compétitif complet : à vérifier.** Les audits publics ont détecté deux fiches additionnelles hors des 150 cartes embarquées ; il faut confirmer leur statut, leur légalité et mettre à jour la collection uniquement avec preuve.
3. **PvP réseau : non déployé.** `multiplayer/protocol.mjs` est une couche de sécurité testable, pas un matchmaking. Un serveur faisant autorité sur l’intégralité des règles, une authentification, une gestion des déconnexions, des débits, de la persistance et une QA adversariale restent à fournir avant d’exposer une interface PvP aux joueurs.
4. **Validation tactile Android : distincte du test Node.** Les runs d'émulateur Android 15 doivent valider l’installation de 2.5.4 vers 2.7.0, les 150 images, la reprise et l’ouverture des nouveaux panneaux. Une simulation d’UI ne prouve pas tous les gestes d’un appareil réel.

## Interdictions de certification

- Ne pas convertir une partie `incomplete`, un dépassement de budget ou une erreur du moteur en victoire.
- Ne jamais divulguer les cartes de la main ou du deck adverse dans les journaux, guides ou protocoles.
- Ne jamais télécharger un manifeste inférieur à la version déjà publiée.
- Ne pas activer l’entraînement compétitif sans preuves sémantiques.
- Ne jamais présenter les six sondes et les 40 essais comme un classement certifié.

## Prochain seuil technique

Documenter les différences de règles carte par carte, construire les oracles indépendants manquants et une campagne de validation avec sièges inversés. Pour le PvP, héberger un serveur sécurisé avec l’état maître et valider l’interaction entre deux clients réels sur les réseaux mobiles. Ne pas activer ces fonctions pour les utilisateurs tant que les tests de conformité et de confidentialité n’ont pas réussi.
