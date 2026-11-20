# Audit officiel des cartes — 20 novembre 2026

## Résultats exécutés contre cyberpunktcg.com

L'outil `native/official_card_audit.cjs` a parcouru les **152 entrées
du catalogue officiel** (trois pages de 60, 60 et 32 fiches), et consulté
chacune des **150 cartes jouables du moteur**.

- **150 / 150** fiches officielles anglaises accessibles (après reprise
  explicite des deux URL Judy Álvarez).
- **150 / 150** jeux de caractéristiques correspondants : type, coût,
  puissance et RAM.
- **0** désaccord sur ces quatre caractéristiques.
- **0** carte du moteur absente du catalogue officiel.
- Les textes officiels en anglais ont été lus et leur empreinte SHA-256
  enregistrée dans l'artefact GitHub Actions. L'empreinte permet de détecter
  une modification future du texte ; elle ne démontre **pas** la bonne
  implémentation de ses effets.

## Deux cartes supplémentaires hors des 150 cartes du simulateur

Le catalogue public inclut également deux cartes spéciales « Set 1 Promos » :

1. **Rebecca: Having a Moment**
   https://cyberpunktcg.com/cards/rebecca-having-a-moment
   La fiche publique consultée ne contient ni statistiques jouables
   ni texte d'effet officiel.
2. **Lucyna Kushinada: Fresh Beginnings**
   https://cyberpunktcg.com/cards/lucyna-kushinada-fresh-beginnings
   Légende promotionnelle avec effet `Call`.

Elles n'appartiennent pas à l'ensemble fixe des 150 cartes de base
actuellement implémenté. Elles sont signalées, non ajoutées
silencieusement à la collection ni aux decks existants.

## Errata officiels examinés

Source : https://cyberpunktcg.com/errata

- Johnny Silverhand: Never Stop Fighting — pas de vente (sell=false) :
  **conforme sur le cas contrôlé**.
- Kiroshi Optics — équipement possible sur une Unité amie ou une
  Légende amie face visible : **conforme sur le cas contrôlé**.
- Nocturne OP55N1, Judy Álvarez: Nothing to Doubt,
  Yorinobu Arasaka: Embracing Destruction, Towerfall, Corpo Security :
  corrections de crédits d'illustrateurs, sans effet de mécanique
  démontré par les textes d'errata.

## Règles officielles

https://cyberpunktcg.com/comprehensive-rules

Dernière mise à jour officielle observée : 17 novembre 2026,
74 modifications signalées.

## État de certification

**NON CERTIFIÉ** au niveau sémantique. Les 150 effets n'ont pas chacun
fait l'objet d'une confrontation indépendante clause par clause entre
le texte anglais, la traduction locale et les branches de code en
toutes situations. La certification exige notamment les effets
conditionnels, les réactions, le séquencement, les changements de
contrôleur, les zones cachées et les interactions combinées.

Les tests invariants (22 500 paires), les 1 000 parties automatiques et
la correspondance de 150 métadonnées ne sont pas une preuve suffisante
pour débloquer le réentraînement compétitif de NIGHTMARE.

## Exécution

- Workflow: `.github/workflows/official-cards.yml`.
- Résultats JSON: artefact `prime-official-card-comparison`.
- Source de la collecte: `native/official_card_audit.cjs`.
- Politique: échec du contrôle si une des 150 cartes de base est
  introuvable ou si l'une des quatre caractéristiques est différente.
  Les deux cartes promotionnelles supplémentaires restent informatives.
