# 7 Gigs PRIME — audit sémantique et preuves indépendantes
Mise à jour : 20 novembre 2026

## Verdict et périmètre

**150/150 cartes disposent d'au moins un oracle comportemental individualisé.
199/199 oracles réussis en CI. Certification sémantique intégrale : NON ACQUISE.**

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
| Oracles comportementaux dédiés | **199/199 PASS** | **150 cartes distinctes** |
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

- `native/semantic_oracle_runner.cjs` regroupe **12 suites** ;
  il échoue si une carte n'a aucun oracle dédié, si une attente échoue, ou
  si l'inventaire diverge de 150.
- `native/card_lifecycle_oracles.cjs` vérifie le cycle de vie séparément.
- `native/official_card_audit.cjs` contrôle les textes anglais publiés,
  les caractéristiques et les déclencheurs imprimés.
- `native/semantic_register.cjs` conserve les preuves par identifiant,
  les empreintes des textes, les clauses candidates non revues et les lacunes.
- `.github/workflows/semantic-oracles.yml` et
  `.github/workflows/official-cards.yml` exécutent les validations en CI.

## Deux divergences de jeu corrigées (non seulement des tests)

- **Viktor Vektor — Drop Your Illusions** : le premier équipement
  CYBERWARE joué gratuitement consomme dorénavant la réduction de son premier
  équipement du tour. Avant correction, le second CYBERWARE pouvait bénéficier
  indûment de la réduction. Régressions : main, rebut, équipement non-CYBERWARE
  et changement de tour.
- **Alt Cunningham — Soulkiller Architect** : sa réduction du prochain
  Programme du tour est maintenant consommée même si ce Programme est joué
  gratuitement. Avant correction, elle était reportée sur le Programme
  suivant. Régressions : gratuit, payé et tentative de jeu invalide.

Source canonique : textes anglais officiels des deux cartes sur
https://cyberpunktcg.com/cards . Le moteur `native/engine.js` et la
version jouable `native/prime_v220_runtime.html` ont été corrigés ensemble.

Les **199 oracles** ont réussi dans GitHub Actions, dont 12 nouveaux contrôles de clauses officielles. Le statut de
l'exécution indépendante GitHub doit être vérifié séparément ; ne jamais
inférer qu'un commit rend les workflows verts.

## Clauses officielles liées à des preuves individualisées

Le 20 novembre 2026, douze nouveaux oracles ont été enregistrés sur sept cartes
ayant une référence textuelle anglaise vérifiée directement auprès de l'éditeur.
Les cartes examinées sont Japantown Jonin, Kerry Eurodyne (The Last Rockerboy),
Royce (Don't Call Me Simon), All is Lost, Shattered Memories, MaxTac AV et Nadia
(Fighting Through Grief). Les conditions positives, négatives et les choix
facultatifs ont été exercés sur les cas explicitement nommés dans les tests.

Le registre `native/official_clause_witnesses.cjs` associe **13 segments officiels**
à leurs empreintes SHA-256 et aux douze tests, avec invalidation en cas de modification
du texte publié. Cette traçabilité reste une **preuve partielle** : elle ne
certifie ni toutes les branches possibles ni toutes les interactions.

Résultats : [199/199 oracles dans GitHub Actions](https://github.com/yuri85300-design/lifequest/actions/runs/44775805966).
Le passage complet officiel et la confrontation des empreintes sont vérifiés
séparément sur GitHub.

## Correction vérifiée entre la version jouable et le moteur partagé

L'audit GitHub a détecté une divergence entre `native/engine.js` et le
moteur embarqué dans `native/prime_v220_runtime.html`, après correction
de Nocturne OP55N1. Le moteur partagé a été **réextrait du runtime HTML**
sans changement fonctionnel arbitraire. Les tests ont été relancés sur
cette version synchronisée.

Le texte anglais officiel de Nocturne OP55N1 a été consulté directement.
La batterie dédiée compte désormais **10 oracles** couvrant le prix fixe
quand la zone Fixer est vide, les trois effets au choix, les paiements
EN SOLO, la consommation/expiration de la remise, le minimum de 1 €$
et la surtaxe de Riot Shield. Les **trois fragments candidats anglais**
de Nocturne ont été liés aux empreintes officielles et aux tests.

Cela porte le total à **199 oracles PASS**, sur **150 cartes distinctes**.
Ces vérifications sont réelles, mais elles ne couvrent pas encore chaque
condition et interaction du référentiel officiel.

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
