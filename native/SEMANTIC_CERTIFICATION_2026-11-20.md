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

## Résultats CI vérifiés — matrice officielle et laboratoire (20 novembre 2026)

Exécution GitHub Actions **44789497136** : `official-catalogue` **success**.
La matrice de cohérence, le test Chromium du laboratoire expérimental,
l'audit des textes anglais officiels, les oracles indépendants, les cycles
de vie et la génération de `semantic-gap-matrix.json` ont tous réussi.
Journal : **218/218 oracles PASS (0 FAIL)**, **150 cartes**, **280 fragments
candidats**, **40 rapprochements partiels**, **240 sans oracle associé**,
**0 carte intégralement certifiée**. Il s'agit de l'état de l'exécution
sur le commit `8a9ba2f47e6c2be07ba6e52005e032981d111c36`, et non d'une
certification du dépôt actuel.

Audit : https://github.com/yuri85300-design/lifequest/actions/runs/44789497136

L'écart bloquant est maintenant mesuré par un artefact effectivement généré.
Aucune déclaration de 100 % de conformité ne doit être tirée de ce workflow.

## Régressions de livraison corrigées et validées

Le workflow PC Chromium auparavant rouge a été adapté au mode expérimental
NIGHTMARE : le bouton `labTrain` doit être actif, tout en affichant que
les effets ne sont pas intégralement certifiés. Exécution
[44791319227](https://github.com/yuri85300-design/lifequest/actions/runs/44791319227)
: **16/16 tests PASS** (PC et mobile Chromium).

L'échec d'installation SDK du workflow Android debug (`sdkmanager tools` :
paquet obsolète) a été corrigé en demandant explicitement `platform-tools`,
`platforms;android-35` et `build-tools;35.0.0`. Exécution
[44791005469](https://github.com/yuri85300-design/lifequest/actions/runs/44791005469)
: **success**, artefact APK debug publié. Cela prouve une compilation
Android, sans constituer une installation réelle sur tous les appareils.

La matrice officielle sur
[44789497136](https://github.com/yuri85300-design/lifequest/actions/runs/44789497136)
a réussi : **218/218 oracles, 40/280 segments avec témoins partiels,
240 sans rapprochement, 0/150 carte intégralement certifiée**.
Le laboratoire expérimental fonctionne dans les scénarios prouvés,
mais `NIGHTMARE_TRAINING_CERTIFIED` reste `false` faute de preuve exhaustive.

## Contrôles supplémentaires exécutés sur le moteur

Le workflow [44791582804](https://github.com/yuri85300-design/lifequest/actions/runs/44791582804)
a réussi un **véritable** essai de `DeckPlanAI.trainLeague` (et non la
substitution par un entraîneur simulé) : 4 auto-duels achevés, 80
validations achevées, 40 victoires / 40 défaites, 0 validation incomplète,
aucune mutation du champion actif. C'est une preuve du pipeline, pas
une mesure suffisante de performance compétitive.

De nouveaux oracles manuels ont été ajoutés sur Arasaka Emergency
Radioport (5 scénarios : refus, conditions d'Appel, plafond d'un
Appel, déclenchement de l'hôte) et Evelyn Parker: Beautiful Enigma
(5 scénarios : CORPO/GANGER, unités non éligibles, vol adverse,
provocation, absence de cible). Leurs empreintes de texte anglais et
les fragments concernés sont consignés dans
`native/official_clause_witnesses.cjs` et référencés dans les workflows.

Exécution indépendante [44792017284](https://github.com/yuri85300-design/lifequest/actions/runs/44792017284)
: **228/228 oracles PASS**, **0 FAIL**. Les rapprochements officiels
additionnels des trois fragments ne pourront être comptabilisés dans la
matrice qu'après réussite de l'audit complet sur les nouveaux commits.

La certification intégrale reste non acquise et le verrou compétitif
`NIGHTMARE_TRAINING_CERTIFIED = false` doit rester actif.

## Nouvelle divergence corrigée : Arasaka Emergency Radioport

Une revue du texte officiel anglais a révélé une restriction indue :
`native/engine.js` et `native/prime_v220_runtime.html` bloquaient aussi
l'action facultative de **regarder** une Légende face cachée lorsque le joueur
avait déjà appelé une Légende ce tour. Le texte imprimé limite uniquement
l'action d'**appeler** une Légende une fois par tour. Le contrôle
`calledThisTurn` a donc été déplacé de l'entrée du déclencheur vers
la condition de l'appel gratuit. L'oracle exige maintenant que le regard
reste possible tout en refusant un second appel.

Workflow officiel [44792836433](https://github.com/yuri85300-design/lifequest/actions/runs/44792836433)
: **success**, 228/228 oracles PASS ; 43/280 segments liés partiellement,
237 non liés, 0 carte intégralement certifiée. Il s'agit d'une correction
d'effet réellement fonctionnelle, sans revendication de certification totale.

## Exécution réelle de la campagne complète NIGHTMARE

[44792475752](https://github.com/yuri85300-design/lifequest/actions/runs/44792475752)
: **300/300 auto-duels** terminés, **80/80 validations** terminées,
40 victoires / 40 défaites, 0 égalité, 0 validation incomplète,
champion initial inchangé. Ce résultat prouve le fonctionnement du cycle
d'entraînement dans ce scénario, pas la supériorité statistique du candidat.

## Android 15 : preuve d'installation et d'ouverture

Le workflow [44792915847](https://github.com/yuri85300-design/lifequest/actions/runs/44792915847)
a réussi l'assemblage debug, l'installation et l'ouverture sur un émulateur
Android 15. Son prédécesseur avait déjà prouvé que l'activité principale
s'ouvrait sans crash ; l'échec provenait du test shell, corrigé depuis.
Le contrôle ne remplace pas un essai sur les téléphones physiques concernés.

**NIGHTMARE expérimental : actif. Certification compétitive : toujours
`false`, tant que toutes les clauses et interactions officielles ne sont pas
indépendamment démontrées.**

## Reprise de la certification — nouvelles clauses vérifiées (20 novembre 2026, soirée)

Le registre a été étendu avec des oracles de branches indépendants pour
Jackie Welles (Pour One Out For Me), Zetatech Faceplate,
Augmented Negotiators, Minotaur, Meredith Stout (Stone Cold Corpo),
Goro Takemura (Vengeful Bodyguard) et Valentino Street Racer.
Les contrôles couvrent des déclenchements, options acceptées/refusées,
seuils, types de cible, coûts et durées. Ils constituent des preuves
**partielles** sur des scénarios précis et non des certifications intégrales.

- Audit officiel **Goro** : [44808216653](https://github.com/yuri85300-design/lifequest/actions/runs/44808216653),
  **success**, 254/254 oracles PASS, 55/280 fragments avec témoins
  partiels, 225 fragments sans rapprochement, **0/150 carte pleinement certifiée**.
- Nouvelle batterie **Valentino** : [44808572549](https://github.com/yuri85300-design/lifequest/actions/runs/44808572549),
  **success**, 258/258 oracles PASS, sans échec.
- L'association officielle des fragments de Valentino exige la
  réussite séparée du workflow complet déclenché par le commit
  `a9f11d660c1fe03e626a6204c462d5392ee80a8b`.
- Le test initial Jackie avait par erreur employé Kiroshi Optics (jaune)
  comme équipement bleu : l'oracle a été rectifié avec
  Tetratronic Rippler, réellement bleu, puis passé en CI.

Aucune de ces améliorations ne modifie
`NIGHTMARE_TRAINING_CERTIFIED = false`. L'entraînement expérimental
reste disponible. La certification réclame la qualification humaine
de chaque clause atomique et les interactions opposées pertinentes.

## Nouvelles campagnes de rapprochement et de branches (20 novembre 2026)

Les tests supplémentaires portent sur des *scénarios réellement exécutés*
par `native/semantic_oracle_runner.cjs`, et non sur une certification
déduite de la présence d'un handler.

- `native/semantic_oracles_cyberware_timing.cjs` : NetWatch Netdriver,
  Tetratronic Rippler, Dying Night, ordre de résolution de plusieurs
  équipements sur le même hôte et fenêtres `spent` / `turnEnd`.
- `native/semantic_oracles_core_conditions.cjs` : Field Operator,
  Delamain Cab, Corpo Security, Hacked Corpo ; valeurs limites de
  Street Cred, fin de tour, interdiction d'attaque et transfert de cartes
  du dessus du deck vers les zones de jeu.
- `native/semantic_oracles_trigger_conditions.cjs` : Evelyn Parker
  Scheming Siren, Jacked-In Voodoo Boy, Maelstrom Goons, Chrome Reverie ;
  attaque, effets facultatifs, Gig volé et conditions pour appeler
  une Légende. Deux échecs initiaux Maelstrom ont révélé une main
  adverse vide dans le fixture ; ils ont été corrigés, sans masquer
  les résultats historiques d'échec.
- `native/semantic_oracles_high_risk_replacements.cjs` :
  Deadman Transmitter, Synapse Burnout et Pepe Najarro ;
  remplacement de défaite, bonus de combat limité au Rival,
  expiration et sélection facultative des Légendes MERC.

Résultats **indépendants vérifiés** :
- [44813699899](https://github.com/yuri85300-design/lifequest/actions/runs/44813699899) : 295/295 PASS.
- [44814125066](https://github.com/yuri85300-design/lifequest/actions/runs/44814125066) : 298/298 PASS.
- [44814466782](https://github.com/yuri85300-design/lifequest/actions/runs/44814466782) : **309/309 PASS**.

Résultat **officiel complet vérifié** :
[44813699978](https://github.com/yuri85300-design/lifequest/actions/runs/44813699978),
295/295 PASS, **72/280 segments avec témoins partiels, 208 sans
rapprochement, 0/150 cartes intégralement certifiées**. Les runs officiels
ultérieurs doivent être consultés pour confirmer les nouveaux témoins.

Un passage officiel intermédiaire a échoué parce que le catalogue de
152 références n'avait livré que 120 liens en pagination client.
`native/official_card_audit.cjs` effectue désormais des tentatives
de navigation supplémentaires tout en conservant le verrou
`listingComplete`. Les trois pages (60+60+32) ont ensuite été
observées sur l'exécution réussie, sans ignorer les 32 dernières références.

**NIGHTMARE reste en entraînement expérimental ; aucune promotion
certifiée ni certification sémantique intégrale n'est affirmée.**
