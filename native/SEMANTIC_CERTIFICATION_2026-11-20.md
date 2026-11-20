# Certification sémantique — registre de preuves (20 novembre 2026)

## Verdict actuel

**Certification exhaustive non obtenue. Réentraînement compétitif NIGHTMARE toujours verrouillé.**

Six scénarios négatifs complémentaires ont été validés : absence de Gig\néligible pour Gorilla Arms, disparition conditionnelle d'Adrénaline,\nnon-consommation de l'avantage Viktor par un équipement non-CYBERWARE,\nrefus de Corporate Surveillance sans cible légale, choix unique de\nTowerfall lorsque le joueur n'est pas derrière, et absence de révélation\npar Kiroshi Optics lorsqu'aucune Légende n'est face cachée.\n\nUne correspondance de caractéristiques, un contrôle de mots-clés et 22 500
paires d'entrées en jeu n'impliquent pas que toutes les clauses du texte
officiel soient respectées dans tous les états.

## Résultats supplémentaires mesurés

- **40 / 40** oracles comportementaux indépendants réussis, couvrant
  **31 / 150** cartes distinctes sur des branches positives et négatives ciblées.
- Cartes soumises à des oracles : Johnny Silverhand: Never Stop Fighting,
  Corpo Security, Kiroshi Optics, Zetatech Berserk, Viktor Vektor:
  Drop Your Illusions, Riot Shield, Adrenaline Converter, Towerfall,
  Corporate Surveillance, Gorilla Arms, Mandibular Upgrade et Nocturne OP55 N1.
- Vérifications : vente interdite, choix d'hôte, révélation des Légendes,
  ordre et nombre de déclenchements, seuils de puissance, réductions de coût,
  partage des valeurs de Gigs, blocage, priorité des effets, et exceptions
  conditionnelles.
- Source : `native/semantic_oracles.cjs`, invoquée par
  `native/semantic_oracle_runner.cjs` et GitHub Actions.
- Un scénario Towerfall a été corrigé parce que la cible précédente,
  de puissance 6, ne pouvait pas atteindre 0 après -5. Cet écart était
  dans le test, **pas un défaut établi du jeu**.

## Vérification individuelle du cycle de vie

La batterie `native/card_lifecycle_oracles.cjs` a validé **150/150 scénarios** en CI : entrée de chaque carte, destination, zone, hôte d'équipement, identité et propriété des objets. Ce contrôle n'est pas une preuve complète des effets.

Dix autres oracles ont été ajoutés pour Octant, Ruthless Lowlife, Field Operator, Swordwise Huscle, Trauma Team Operatives, MaxTac Heavy, 6th Street Recruits, Maelstrom Zealots, River Ward: Detective on the Hunt et Goro Takemura: Vengeful Bodyguard : réductions conditionnelles, interdiction d'attaque, pioche, seuils de puissance et combats.

## État des 150 cartes

Le registre `native/semantic_register.cjs` produit un fichier
`audit-results/semantic-register.json`, une entrée par carte :

- URL de référence officielle et empreinte SHA-256 du texte anglais
  (lorsque l'audit officiel a été exécuté dans la même tâche) ;
- empreinte de la traduction française, familles de capacités dans le moteur ;
- oracles réussis et zones explicitement non démontrées ;
- `semanticCertified: false` pour toute carte tant que sa revue clause
  par clause n'est pas complète.

Les **119 cartes sans oracle sémantique individualisé** demeurent prioritaires. Les
12 autres cartes ne sont pas davantage certifiées intégralement : leurs
tests prouvent seulement les clauses effectivement examinées.

## Critères nécessaires avant certification

1. Décomposer **chaque** carte en clauses officielles atomiques
   (coût, déclencheur, condition, cible, choix, effet, durée, zone).
2. Pour chaque condition, tester la branche vraie **et** la branche fausse ;
   pour chaque choix, toutes les options, les refus et cas limites.
3. Vérifier indépendamment les fenêtres de timing et les interactions
   avec les règles complètes actuelles et l'errata.
4. Enregistrer une preuve automatique ou vérification humaine séparée
   pour **chacune** de ces clauses, avec version des règles et empreinte du
   texte officiel.
5. Aucune carte ne peut être déclarée certifiée si ses clauses ne sont
   pas toutes rapprochées et démontrées.

La certification reste distincte de la validation technique de
`native/audit_220.cjs`, des tests Chromium et de la conformité
des 150 caractéristiques publiées.

## Reproduction

```bash
node native/semantic_oracle_runner.cjs
node native/semantic_register.cjs
node native/semantic_register.cjs --require-certification  # échec attendu
```

Workflow :
[7 Gigs PRIME — independent semantic oracles](https://github.com/yuri85300-design/lifequest/actions/workflows/semantic-oracles.yml).
