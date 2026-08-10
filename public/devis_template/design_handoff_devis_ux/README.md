# Handoff : refonte UX du générateur de devis (ToolGus / DumTools)

## Overview

Refonte de l'écran d'édition d'un devis dans ToolGus (`/perso/gus/devis/:id`). L'écran actuel fonctionne mais mélange trois métiers — chiffrer, négocier, publier — dans une seule colonne de droite, répète le Net HT à deux endroits, et n'expose aucune action au niveau de la ligne.

Le bundle contient **quatre propositions de mise en page**, à implémenter au choix :

- **2a** — la proposition retenue et la plus aboutie : rail de lots + tableau + panneau à onglets.
- **1a** — première version de 2a (conservée pour l'historique, remplacée par 2a).
- **1b** — variante « vitesse de saisie » : catalogue ouvert à gauche, prix en pied de page.
- **1c** — variante « trois temps » : modes Chiffrer / Négocier / Publier.

Sauf indication contraire, **implémenter 2a**. 1b et 1c sont documentés plus bas comme alternatives.

## About the Design Files

Les fichiers de ce bundle sont des **références de design réalisées en HTML** : des prototypes qui montrent l'apparence et le comportement attendus, **pas du code de production à copier tel quel**.

Le travail consiste à **recréer ces écrans dans l'environnement existant de ToolGus** (React, Next.js, ou ce qui est en place), avec ses composants, ses conventions et sa librairie de styles. Si aucun socle n'existe pour cet écran, choisir le framework le plus adapté au reste du projet et y implémenter le design.

Les maquettes ne sont pas interactives : pas de state, pas de calculs. Les valeurs affichées (6 461,33 €, 20,15 %…) sont des données d'exemple cohérentes entre elles, pour juger de la densité et des alignements.

`reference-ecran-actuel.html` est une sauvegarde de l'écran existant, fournie pour comparaison.

## Fidelity

**High-fidelity.** Couleurs, typographie, tailles et espacements sont définitifs et repris tels quels du produit existant. Le tableau, la barre d'application et les couleurs d'accent viennent de ToolGus — les reprendre depuis le code existant plutôt que depuis ces maquettes quand un composant équivalent existe déjà.

Ce qui est volontairement **non spécifié** : les états de chargement, les erreurs réseau, la validation de formulaire, le responsive sous 1280 px. L'écran est conçu pour un poste de travail, largeur utile 1360–1440 px.

---

## Screens / Views

### 2a — Écran de devis (proposition retenue)

**Purpose** : chiffrer un devis ligne par ligne, suivre la marge en continu, puis négocier et publier sans changer de page.

**Layout global** — colonne verticale, hauteur pleine fenêtre :

| Bande | Hauteur | Contenu |
|---|---|---|
| Barre d'application | 44 px, fixe | fil d'ariane, recherche globale, avatar |
| Barre de devis | auto (~62 px), fixe | numéro, statut, objet, paramètres, actions |
| Corps | `flex:1`, scrollable | rail de lots · tableau · panneau |
| Barre de totaux | 54 px, fixe | Net HT, TTC, marge, options, sauvegarde |

Le corps est un `display:flex; gap:14px; padding:14px` sur fond `#eef2f8`, avec trois enfants :
- rail de lots — `width:196px`, `flex:none`
- tableau — `flex:1; min-width:0`
- panneau — `width:322px`, `flex:none`

**Seule la zone tableau scrolle.** Les deux barres et le rail restent en place.

#### Barre d'application (44 px)

Fond `#0d1220`, bordure basse `2px solid #6d5cf5`, `padding:0 16px`, `gap:14px`.

- « TOOLGUS · DEVIS » — IBM Plex Mono 10 px, `letter-spacing:0.14em`, `#8b93ad`
- séparateur `›` `#3f465c`
- numéro de devis — 13 px / 600 / `#fff`
- spacer
- champ de recherche — 230×26 px, `border-radius:6px`, fond `rgba(255,255,255,0.08)`, placeholder 12 px `#8b93ad`
- avatar — 26 px rond, fond `#f0a500`, initiales 11 px / 600 `#3b2600`

#### Barre de devis

Fond `#fff`, bordure basse `1px solid #e2e8f0`, `padding:11px 20px`, `gap:16px`, `align-items:center`.

De gauche à droite :
1. Chevron retour `‹` — 15 px `#94a3b8`
2. Bloc identité, colonne, `gap:3px` :
   - ligne 1 : numéro IBM Plex Mono 19 px / 600 / `#0f172a` / `letter-spacing:-0.01em` + pastille de statut (11 px / 600, `#166534` sur `#dcfce7`, `padding:3px 8px`, `border-radius:99px`)
   - ligne 2 : objet du devis, 13.5 px `#334155`, `border-bottom:1px dashed #cbd5e1` — indique que le champ est éditable en place
3. Séparateur vertical 1×34 px `#e2e8f0`
4. **Paramètres en pastilles** (`flex:1`, `flex-wrap`, `gap:6px`) — chaque pastille : 12.5 px, `padding:5px 10px`, `border-radius:6px`, `border:1px solid #e2e8f0`.
   - pastille renseignée (client) : texte `#0f172a`, fond `#f1f5f9`
   - pastille par défaut : texte `#475569`, fond `#f8fafc`
   - ordre : client · affaire · coef · TVA · validité
   - un clic ouvre un popover d'édition du paramètre concerné
   - lien de fin « Modifier les paramètres » — 12.5 px `#4338ca`, ouvre le formulaire complet
5. Actions : « Aperçu client » (bouton secondaire — 12.5 px `#334155`, `border:1px solid #cbd5e1`, fond `#fff`, `padding:7px 12px`, `radius:7px`) puis « Publier » (bouton primaire — `#fff` sur `#1e293b`, `padding:8px 14px`, `radius:7px`, poids 500)

> Décision de design : l'en-tête ne contient **aucun total**. Les paramètres qui influencent le calcul (coef, TVA) sont ici parce qu'on les règle une fois ; les résultats sont en bas.

#### Rail de lots (196 px)

Colonne, `gap:8px`.

- Libellé « LOTS » — Mono 9.5 px, `letter-spacing:0.12em`, `#94a3b8`, `padding:0 4px`
- Une carte par lot : fond `#fff`, `border:1px solid #e2e8f0`, `radius:9px`, `padding:10px 11px`, colonne `gap:4px`
  - ligne 1 : pastille de couleur 7×7 `radius:2px` + nom (12.5 px / 600, ellipsis) + `⋯`
  - ligne 2 : compteur, 11 px `#64748b` (ex. « 5 lignes », « 4 lignes · 48 h »)
  - ligne 3 : sous-total, Mono 12.5 px / 600 `#0f172a`
  - carte active : bordure `#c7d2fe`, fond `#f8faff` (à ajouter, non visible sur la maquette)
- « + Nouveau lot » : `border:1px dashed #cbd5e1`, `radius:9px`, `padding:9px 11px`, 12 px `#64748b`, centré
- spacer, puis carte « RACCOURCIS » : 4 lignes `justify-content:space-between`, libellé 11 px `#475569`, touche en Mono

Couleurs de lot : Fourniture `#6d5cf5`, Main d'œuvre `#0ea5a4`, Options `#f59e0b`. Un nouveau lot pioche dans cette palette en rotation.

Comportements :
- clic sur une carte → scroll du tableau jusqu'à l'en-tête du lot
- glisser une carte → réordonne les lots dans le tableau
- `⋯` → renommer, dupliquer, appliquer un coef au lot, supprimer

#### Tableau

Conteneur : `#fff`, `border:1px solid #e2e8f0`, `radius:10px`, `overflow:hidden`, colonne.

**Barre d'outils du tableau** (38 px, fond `#fbfcfe`, bordure basse `#e2e8f0`, `padding:0 14px`, `gap:10px`) : case à cocher « tout sélectionner » (13×13, `border:1.5px solid #cbd5e1`, `radius:3px`), compteur « 9 lignes » 12 px `#64748b`, spacer, puis « ⌕ Référentiel », « Colonnes », « Densité » en 12 px `#4338ca`.

**Grille des colonnes** — identique pour l'en-tête et les lignes :

```css
grid-template-columns: 24px 22px 1fr 128px 58px 92px 74px 92px 108px 62px;
padding: 0 14px;
```

| # | Colonne | Alignement | Format |
|---|---|---|---|
| 1 | case à cocher | — | 13×13 px |
| 2 | poignée `⠿` | — | 11 px `#cbd5e1` |
| 3 | Désignation | gauche | 13 px `#0f172a`, ellipsis |
| 4 | Référence | gauche | Mono 11 px `#64748b`, ellipsis |
| 5 | Qté | droite | Mono 12.5 px `#0f172a` |
| 6 | Déboursé | droite | Mono 12.5 px `#334155` |
| 7 | Coef. | droite | Mono 12.5 px `#334155` |
| 8 | P.V. unit. | droite | Mono 12.5 px `#0f172a` |
| 9 | Total | droite | Mono 13 px / 600 `#0f172a` |
| 10 | Marge | droite | Mono 11.5 px `#15803d` |

En-tête de colonnes : 32 px, fond `#f8fafc`, bordure basse `#e2e8f0`, libellés Mono 9.5 px `letter-spacing:0.1em` `#94a3b8`, en capitales. **Collant** (`position:sticky; top:0`) — un seul en-tête pour tout le tableau, il ne se répète pas par lot.

**En-tête de lot** : 36 px, fond `#f1f5f9`, bordure basse `#e2e8f0`, `gap:11px` — chevron `▾` 10 px `#94a3b8` (repli du lot), pastille de couleur 7×7, nom 13 px / 600, compteur optionnel 11.5 px `#64748b`, spacer, badge de marge (11.5 px / 500, `#15803d` sur `#dcfce7`, `radius:99px`, `padding:2px 8px`), sous-total Mono 13 px / 600, `⋯`. Également collant, sous l'en-tête de colonnes.

**Ligne** : 44 px, fond `#fff`, bordure basse `1px solid #f1f5f9`.
- Désignation : si la ligne est en option, badge « Option » à droite du libellé — 10.5 px `#a16207` sur `#fef3c7`, `radius:99px`, `padding:2px 7px`, `flex:none`
- Lignes de main d'œuvre : référence, déboursé et marge affichent `—` `#cbd5e1` ; la colonne Coef. affiche « taux vendu » en 10 px `#94a3b8`
- **Survol** : fond `#fbfcfe`, et un groupe de 4 boutons-icônes 22×22 (`radius:5px`) apparaît en fin de désignation, `flex:none`, `gap:4px` :
  - `⧉` dupliquer — `#475569` sur `#f1f5f9`, bordure `#e2e8f0`
  - `◇` passer en option — `#a16207` sur `#fef3c7`, bordure `#fde68a`
  - `✕` supprimer — `#b91c1c` sur `#fef2f2`, bordure `#fecaca`
  - `⋯` plus d'actions — comme dupliquer
  
  Le libellé garde `flex:1; min-width:170px` et son ellipsis : les icônes ne le poussent jamais hors champ. Elles occupent une largeur fixe (~112 px) réservée dès le survol pour éviter tout décalage.
- **Ligne sélectionnée** : fond `#f8faff`, bordure gauche 2 px `#6d5cf5`

**Ligne de saisie rapide**, en fin de chaque lot : 42 px, fond `#fafbff`, `display:flex` (surtout **pas** la grille — le contenu doit pouvoir occuper toute la largeur), `gap:10px`, `padding:0 14px`. Spacer 24 px, `+` 12 px `#4338ca` sur 22 px, champ (placeholder 12.5 px `#94a3b8`, `white-space:nowrap`), séparateur 1×16 px, aide clavier Mono 10.5 px `#94a3b8`.

Comportement : saisie libre → autocomplétion sur le référentiel dans un menu sous le champ ; `⏎` valide et recrée une ligne vide en dessous ; `⌘K` ouvre le catalogue complet préfiltré sur le texte saisi ; `Échap` referme.

**Pied du tableau** : boutons « + Lot “Matériel” », « + Lot vierge » en `border:1px dashed #cbd5e1`, `radius:7px`, `padding:6px 11px`, 12.5 px `#475569`.

#### Panneau (322 px)

Fond `#fff`, `border:1px solid #e2e8f0`, `radius:10px`.

**Onglets** : bande 6 px de padding, fond `#f8fafc`, bordure basse `#e2e8f0`, 3 onglets `flex:1` centrés 12.5 px. Actif : fond `#fff`, `border:1px solid #e2e8f0`, `radius:6px`, poids 500, `#0f172a`. Inactif : `#64748b`, sans fond.

- **Composition** (défaut) — décrit ci-dessous
- **Négocier** — prix cible, remises rapides, simulation d'impact sur la marge (voir 1b/1c pour le détail des leviers)
- **Publier** — options de document, destinataires, envoi

Contenu de l'onglet Composition, `padding:16px`, colonne `gap:15px`, séparateurs `1px #eef2f7` :

1. **Marge fourniture** — libellé Mono 9.5 px `#94a3b8` + montant 11.5 px `#64748b` sur la même ligne ; valeur Mono 26 px / 600 `#15803d` ; barre 7 px `radius:99px` (part déboursé `#cbd5e1`, part marge `#16a34a`) ; sous-ligne 11 px `#64748b` « Déboursé … » / « Objectif … ».
   Seuils de couleur : ≥ 20 % `#15803d`, 15–20 % `#b45309`, < 15 % `#b91c1c`.
2. **Composition du Net HT** — barre empilée 9 px proportionnelle aux lots, puis une ligne par lot (pastille + nom à gauche, montant Mono à droite, 12.5 px). Les options en `#a16207` avec la mention « hors total ».
3. **Points d'attention** — liste de signaux calculés : coef isolé, option lourde, ligne à marge faible, quantité nulle. Puce 12 px (`▲` `#b45309` pour un avertissement, `●` `#64748b` pour une information) + texte 12 px `#334155`, `line-height:1.45`.
4. **Historique** — versions, libellé 12 px `#475569`, lien « Voir » `#4338ca`.

#### Barre de totaux (54 px)

Fond `#0f172a`, `padding:0 20px`, `gap:26px`, `align-items:center`. **C'est la seule source permanente du prix — ne pas répéter le Net HT ailleurs.**

Chaque bloc : libellé Mono 9.5 px `letter-spacing:0.12em` `#94a3b8` + valeur, alignés sur la ligne de base, `gap:8px`.

| Bloc | Valeur |
|---|---|
| NET HT | Mono 19 px / 600 `#fff`, `letter-spacing:-0.01em` |
| TTC | Mono 13 px `#cbd5e1` |
| MARGE | Mono 13 px `#4ade80` (couleur suivant les mêmes seuils que le panneau) |
| OPTIONS | Mono 13 px `#fbbf24` |

Puis spacer, indicateur de sauvegarde 12 px `#94a3b8`, et bouton « Négocier » (12.5 px `#e2e8f0`, `border:1px solid rgba(255,255,255,0.2)`, `padding:6px 12px`, `radius:7px`) qui bascule le panneau sur l'onglet Négocier.

---

### 1b — Variante « catalogue à gauche » (alternative)

Même barre d'application, mais :
- **Tiroir référentiel permanent** à gauche, 288 px : recherche, filtres en pastilles (Fourniture / Main d'œuvre / Favoris), liste d'articles (désignation 12.5 px, référence Mono 10.5 px, déboursé, bouton « + Fourniture »). Glisser-déposer d'un article vers un lot.
- **Barre d'actions de sélection** flottante au-dessus du tableau quand ≥ 1 ligne est cochée : fond `#0f172a`, `radius:8px`, `padding:8px 12px` — compteur, puis « Coef ×__ », « Passer en option », « Déplacer vers… », « Dupliquer », « Supprimer » (`#fca5a5`), et « Échap pour désélectionner ».
- **Pied de page clair** (60 px, fond `#fff`) portant Net HT, TTC, jauge de marge 180 px, options, puis « Référentiels » et « Négocier » (primaire `#4338ca`).
- **Popover de négociation** ancré au bouton, 330 px, `radius:10px`, ombre `0 20px 40px -18px rgba(15,23,42,0.4)` : remises rapides, champ de prix cible, et une phrase d'impact (« À 6 000 € net HT : remise 7,1 %, marge ramenée à 12,4 % »).

Intérêt : le tableau gagne ~330 px de large et la saisie depuis le catalogue est immédiate. Coût : le tiroir occupe la place en permanence.

### 1c — Variante « trois temps » (alternative)

Les trois métiers deviennent trois modes, sélectionnés par un segmented control centré dans la barre d'application : **1 · Chiffrer**, **2 · Négocier**, **3 · Publier**.

- **Chiffrer** : tableau plein écran, pas de panneau. Un bandeau de 44 px sous la barre d'application porte l'objet du devis, le déboursé, la marge (valeur + jauge 90 px) et le Net HT, plus le bouton de sortie « Passer à la négo → ».
- **Négocier** : deux colonnes. À gauche (420 px) le prix cible en gros champ Mono 20 px, les remises rapides, l'impact chiffré et une jauge d'alerte (`#f59e0b` sous l'objectif, plancher de validation à 15 %), puis « Retour au chiffrage » / « Passer à la publication → ». À droite, l'aperçu du document client en direct, avec la liste des postes et le total.
- **Publier** : non maquetté.

Intérêt : un seul métier à l'écran, et l'aperçu client visible pendant la négociation. Coût : navigation supplémentaire, et le prix n'est plus visible pendant le chiffrage sans le bandeau.

---

## Interactions & Behavior

| Action | Déclencheur | Effet |
|---|---|---|
| Nouvelle ligne | `⏎` dans la ligne de saisie rapide | valide la ligne, en recrée une vide dessous, focus dans la désignation |
| Catalogue | `⌘K` / `Ctrl+K` | ouvre le référentiel préfiltré sur le texte saisi |
| Dupliquer | `⌘D` ou icône `⧉` | insère une copie sous la ligne, focus sur la quantité |
| Déplacer | `⌥↑` / `⌥↓` | déplace la ligne dans son lot, puis dans le lot voisin |
| Champ suivant | `⇥` | parcourt désignation → réf → qté → déboursé → coef |
| Désélectionner | `Échap` | vide la sélection, referme popover et menus |
| Réordonner | glisser la poignée `⠿` | déplacement libre entre lots, ligne fantôme 2 px `#6d5cf5` à la cible |
| Replier un lot | chevron `▾` de l'en-tête de lot | masque les lignes, garde en-tête et sous-total |
| Passer en option | icône `◇` ou action groupée | la ligne sort du Net HT, badge « Option », total reporté dans OPTIONS |
| Éditer un paramètre | clic sur une pastille de l'en-tête | popover d'édition, application immédiate |
| Éditer une cellule | clic ou `⏎` sur la ligne | passage en champ dans la cellule, recalcul à la sortie |

Transitions : 120 ms `ease-out` sur les fonds de survol et l'apparition des icônes de ligne ; 160 ms sur l'ouverture des popovers ; pas d'animation sur les totaux (changement direct, plus lisible pendant la saisie).

Recalcul : à chaque frappe validée, tous les agrégats (sous-totaux de lot, cartes du rail, panneau, barre de totaux) se mettent à jour ensemble. Aucun état intermédiaire incohérent.

## State Management

État minimal de l'écran :

```
devis: { id, numero, objet, statut, client, affaire, coefDefaut, tva, validiteJours }
lots:  [{ id, nom, couleur, ordre, replie }]
lignes:[{ id, lotId, ordre, designation, reference, quantite, debourse, coef,
          pvUnitaire, estOption }]
ui:    { lotActif, lignesSelectionnees[], ongletPanneau, ligneEnEdition,
         popoverOuvert, sauvegardeEtat }
```

Dérivés (calculés, jamais stockés) : `pvUnitaire = debourse × coef` · `total = pvUnitaire × quantite` · sous-total de lot = somme des lignes non-option · `netHT` = somme des lots · `ttc = netHT × (1 + tva)` · `margeFourniture = (pv − debourse) / pv` sur les lignes de fourniture uniquement · `totalOptions` = somme des lignes en option.

Sauvegarde : autosave débouncée (~2 s après la dernière frappe), état reflété dans la barre du bas. Réordonnancement et suppression sont optimistes avec annulation possible.

## Design Tokens

**Couleurs**

| Usage | Valeur |
|---|---|
| Fond application | `#eef2f8` |
| Surface | `#fff` |
| Surface secondaire | `#f8fafc` / `#fbfcfe` |
| Fond d'en-tête de lot | `#f1f5f9` |
| Bordure | `#e2e8f0` |
| Bordure marquée | `#cbd5e1` |
| Séparateur léger | `#f1f5f9` / `#eef2f7` |
| Texte primaire | `#0f172a` |
| Texte secondaire | `#334155` / `#475569` |
| Texte tertiaire | `#64748b` |
| Texte discret | `#94a3b8` |
| Barre sombre / totaux | `#0f172a` |
| Barre d'application | `#0d1220`, filet `#6d5cf5` |
| Accent / liens | `#4338ca` |
| Accent violet (lot, filet) | `#6d5cf5` |
| Accent sarcelle (lot) | `#0ea5a4` |
| Succès | `#15803d`, fond `#dcfce7`, sur sombre `#4ade80` |
| Avertissement | `#b45309` / `#a16207`, fond `#fef3c7`, bordure `#fde68a`, sur sombre `#fbbf24` |
| Danger | `#b91c1c`, fond `#fef2f2`, bordure `#fecaca`, sur sombre `#fca5a5` |
| Avatar | fond `#f0a500`, texte `#3b2600` |

**Typographie** — IBM Plex Sans pour l'interface, IBM Plex Mono pour tout ce qui est chiffre, référence ou raccourci clavier (l'alignement des colonnes en dépend).

| Rôle | Style |
|---|---|
| Numéro de devis | Mono 19 px / 600 / `-0.01em` |
| Net HT (barre) | Mono 19 px / 600 / `-0.01em` |
| Marge (panneau) | Mono 26 px / 600 |
| Titre de lot | Sans 13 px / 600 |
| Cellule texte | Sans 13 px / 400 |
| Cellule chiffre | Mono 12.5 px |
| Total de ligne | Mono 13 px / 600 |
| Libellé de colonne | Mono 9.5 px / `0.1em` / capitales |
| Étiquette de section | Mono 9.5 px / `0.12em` / capitales |
| Métadonnée | Sans 11–11.5 px |
| Bouton | Sans 12.5 px / 500 |

**Espacements** : 4 · 6 · 8 · 10 · 11 · 14 · 16 · 20 px. Gouttière du corps 14 px, padding horizontal de tableau 14 px, de barre 20 px.

**Hauteurs de rangée** : ligne 44 px · en-tête de lot 36 px · en-tête de colonnes 32 px · saisie rapide 42 px · barre d'outils 38 px. Un mode compact (« Densité ») ramène la ligne à 34 px et la police de cellule à 12 px.

**Rayons** : 3 px (case à cocher) · 5–6 px (petits boutons, pastilles) · 7 px (boutons) · 9–10 px (cartes, panneaux) · 99 px (badges, jauges).

**Ombres** : `0 20px 40px -18px rgba(15,23,42,0.4)` pour les popovers. Aucune ombre sur les cartes ni les panneaux — ils sont délimités par leur bordure.

**Jauges** : hauteur 6–9 px, `radius:99px`, `overflow:hidden`, segments en `flex` proportionnels.

## Assets

Aucun. Pas d'image, pas de police iconographique : les glyphes utilisés dans les maquettes (`⠿ ▾ ⧉ ◇ ✕ ⋯ ⌕ ‹ ▲ ●`) sont des caractères Unicode, à remplacer par les icônes de la librairie du projet (poignée de glissement, chevron, duplication, losange/étiquette, croix, points de suspension, loupe, chevron gauche, triangle d'alerte, point).

## Files

| Fichier | Rôle |
|---|---|
| `Devis — refontes UX.dc.html` | les quatre propositions (2a en haut, puis 1a, 1b, 1c) — ouvrir directement dans un navigateur |
| `support.js` | runtime nécessaire à l'affichage du fichier ci-dessus, sans intérêt pour l'implémentation |
| `reference-ecran-actuel.html` | sauvegarde de l'écran ToolGus existant, pour comparaison |

Chaque proposition porte un badge visible (`2a`, `1a`, `1b`, `1c`) et une ancre du même nom dans le document.
