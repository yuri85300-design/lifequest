# 7 Gigs PRIME — audit sémantique et preuves indépendantes
Mise à jour : 20 novembre 2026

## Verdict et périmètre

**150/150 cartes disposent d'au moins un oracle comportemental individualisé.
217/217 oracles réussis en CI. Certification sémantique intégrale : NON ACQUISE.**

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
| Oracles comportementaux dédiés | **217/217 PASS** | **150 cartes distinctes** |
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

- `native/semantic_oracle_runner.cjs` regroupe **14 suites** ;
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

Les **201 oracles** ont réussi dans GitHub Actions, dont 12 nouveaux contrôles de clauses officielles. Le statut de
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

Résultats : [217/217 oracles dans GitHub Actions](https://github.com/yuri85300-design/lifequest/actions/runs/44775805966).
Le passage complet officiel et la confrontation des empreintes sont vérifiés
séparément sur GitHub.

## Correction vérifiée entre la version jouable et le moteur partagé

L'audit GitHub a détecté une divergence entre `native/engine.js` et le
moteur embarqué dans `native/prime_v220_runtime.html`, après correction
de Nocturne OP55N1. Le moteur partagé a été **réextrait du runtime HTML**
sans changement fonctionnel arbitraire. Les tests ont été relancés sur
cette version synchronisée.

Le texte anglais officiel de Nocturne OP55N1 a été consulté directement.
La batterie dédiée compte désormais **12 oracles** couvrant le prix fixe
quand la zone Fixer est vide, les trois effets au choix, les paiements
EN SOLO, la consommation/expiration de la remise, le minimum de 1 €$
et la surtaxe de Riot Shield. Les **trois fragments candidats anglais**
de Nocturne ont été liés aux empreintes officielles et aux tests.

Cela porte le total à **217 oracles PASS**, sur **150 cartes distinctes**.
Ces vérifications sont réelles, mais elles ne couvrent pas encore chaque
condition et interaction du référentiel officiel.

## Test de résistance des oracles par mutations

La batterie `native/semantic_mutation_audit.cjs` injecte **23 erreurs
sémantiques distinctes**, une à la fois, dans des copies isolées du moteur, sur les coûts, les choix, les protections, les effets Quick, les attaques et les Gigs.

**Résultat GitHub Actions : 9/9 mutations détectées, 0 erreur survivante.**
Les oracles sont donc capables de refuser ces comportements manifestement
erronés, et ne se limitent pas tous à tester l'absence de plantage.

Workflow : https://github.com/yuri85300-design/lifequest/actions/runs/44778053249

Ce taux vaut seulement pour ces 23 mutations ciblées ; il ne représente
ni un taux d'exhaustivité global ni un certificat des 280 segments officiels.

## Progrès des clauses officielles et tests de qualité

- **40 / 280** fragments candidats des textes anglais ont maintenant des preuves
  d'oracles individualisés et une empreinte SHA-256 vérifiée par le service
  officiel, contre 13 auparavant. **240 / 280** n'ont pas cette association.
- **217 / 217** oracles ont réussi dans GitHub Actions pour les 150 cartes.
- **23 / 23** mutations volontairement erronées ont été rejetées par les
  oracles (ne prouve pas la qualité des branches non mutées).
- Les preuves supplémentaires couvrent notamment Cyberpsychosis (bonus selon
  équipement, victoire ou vol entraînant une défaite retardée), Take Control
  (réduction des vols, pioche conditionnelle pour AI/DRONE/VEHICLE), Reboot
  Optics (protection d'un seul combat, expiration) et The Relic
  (résurrection, coût nul, mouvement vers le fond du deck).
- Les autres rapprochements concernent les contraintes de coût, d'attaque,
  de pioche, de BLOQUEUR et plusieurs effets conditionnels.

Audits indépendants :
https://github.com/yuri85300-design/lifequest/actions/runs/44785592330
et https://github.com/yuri85300-design/lifequest/actions/runs/44785592350 .

Ces 40 segments sont **liés à des preuves partielles**, non déclarés certifiés
dans toutes leurs interactions. La révision exhaustive des 280 fragments
et de leurs branches officielles reste ouverte.

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

## Matrice de revue des 240 segments non rapprochés

Le générateur `native/semantic_gap_matrix.cjs` a été ajouté au workflow
`.github/workflows/official-cards.yml`. Il exige 150 fiches officielles,
compare les empreintes des textes, vérifie la cohérence des identifiants de
segments et le nombre de rapprochements avec le registre existant, puis
produit `audit-results/semantic-gap-matrix.json` et
`audit-results/semantic-gap-matrix.md` comme artefacts de CI.

La matrice sépare explicitement les segments avec preuve partielle des
segments sans oracle lié. Pour chaque fragment non lié, elle propose les
branches positives/négatives, seuils, choix, expirations et interactions à
examiner selon les signaux détectés. Cette liste est un **plan de revue** :
les obligations automatiques ne remplacent pas le découpage humain des clauses
et ne permettent aucune certification automatique. Les résultats du nouveau
workflow doivent être consultés avant de confirmer ses nombres ou sa réussite.

**Aucun des 240 segments n'est déclaré nouvellement certifié par ce changement.**

### Contrat automatique de cohérence de la matrice

`native/semantic_gap_matrix_contract.cjs` ajoute cinq scénarios synthétiques :
matrice 280/40/240, texte source périmé, empreinte de segment périmée,
témoin orphelin et total de segments incohérent. Le workflow exécute ces
contrôles avant d'accéder au catalogue officiel. Un jeu de données synthétique
ne vaut ni preuve d'une clause de carte ni certification du moteur.

**Statut d'exécution : non confirmé sur le dernier commit.** La matrice réelle
et les tests de branches/effets combinés devront être exécutés et leurs
résultats inspectés. NIGHTMARE reste bloqué.

## NIGHTMARE — laboratoire expérimental déverrouillé (sans certification)

Le 20 novembre 2026, le bouton de lancement du laboratoire a été réactivé
avec `NIGHTMARE_TRAINING_EXPERIMENTAL = true`, tout en gardant
`NIGHTMARE_TRAINING_CERTIFIED = false`. Il exécute la même campagne bornée de
300 auto-duels et sa phase de validation de 80 duels quand l'utilisateur la
lance dans l'interface. Aucune exécution automatique de campagne n'est
prétendue au moment du commit.

Tant que le jeu n'est pas certifié, les plans et statistiques de l'expérience
sont stockés dans `nightmareSandboxTraining` ; ni `S.brain` ni le stockage
`championBrain` ne sont mis à jour par cette branche. Le champion utilisé
pour les duels conserve donc sa politique de référence. La promotion
compétitive et la certification des 150 cartes restent bloquées.

`native/nightmare_training_contract.cjs` et le workflow sémantique vérifient
les verrous de séparation. Leur résultat CI doit être consulté avant de
qualifier l'ensemble de validé en exécution.

### Vérification du mode entraînement par navigateur

Un test d'intégration Chromium (`native/nightmare_training_browser_smoke.cjs`)
a été ajouté au workflow officiel. Il vérifie l'ouverture du laboratoire,
le bouton disponible, le budget de 300 auto-duels et 80 duels de validation,
puis l'absence de remplacement du champion après une campagne factice.
Ce test utilise un entraîneur simulé déterministe : il ne valide ni les
performances stratégiques réelles ni la fidélité des 280 fragments officiels.

`NIGHTMARE_TRAINING_CERTIFIED` reste `false` parce qu'aucune preuve complète
de certification clause par clause n'a été produite. Seul le mode
expérimental est activé (`NIGHTMARE_TRAINING_EXPERIMENTAL = true`). Une
campagne compétitive certifiée ne doit pas être affirmée sans ses résultats.
