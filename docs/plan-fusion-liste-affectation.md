# Plan — Fusion « Liste de points » dans « Affectation E/S »

> Statut : **IMPLÉMENTÉ** sur la branche `fusion-liste-affectation` (build de prod OK).
> Reste uniquement le retrait définitif destructif (Phase 5.2), tenu en attente de
> validation. Voir « RÉALISÉ » en bas.

---

## RÉALISÉ (branche `fusion-liste-affectation`)

**Choix d'architecture** : approche **dérivation** (Option A) et non renommage du
modèle. Le projet stocke `rows` (saisie liste, source) ; `points` (bornes) en est
**dérivé** (`derivation.ts` : `syncPoints`, préserve borne/test par id). Aperçu,
tests et reco lisent `points` **inchangés** → risque isolé.

- ✅ **0.1** Type d'E/S exclusif (liste) — commit précédent.
- ✅ **0.2** `affectation-auto.ts` : `affecterAuto` (remplit module/canal/repère).
- ✅ **1** `derivation.ts` (`syncPoints`, `pointsToRows`, `ioTypeOf`,
  `signalParDefaut`) ; `Project.rows` ajouté ; imports GFX/PDF posent `rows`.
- ✅ **2** `RowsEditor` extrait (réutilisé par la liste standalone ET l'onglet).
  Onglets projet : Projet · **Liste de points** · Modules · **Affectation** ·
  Mise en service · Aperçu. `points-tab.tsx` supprimé.
- ✅ **3** Impression A4 liste + **Générer GFX** dans l'onglet Liste (réutilise
  les composants de liste-points).
- ✅ **4** Registre → 1 carte « **Projet GTB** » ; provider client unifié.
- ✅ **5.1** Migration `PointsList → AffectationProjet`
  (`scripts/migrate-listes-vers-projets.mts`, idempotente, non destructive) —
  **14 listes migrées**. `getProjet` dérive `rows` des anciens projets (rétro-compat).

**Reste (à valider avant exécution) — Phase 5.2 destructive :**
- Retrait des routes `/outils/liste-points/*` (aujourd'hui conservées, non surfacées).
- Suppression du dossier standalone (garder `rows-editor`, `impression`,
  `generer-gfx`, `gfx-export`, `catalog`, `config-*`, `queries`, `actions`,
  `model` : réutilisés par le projet unifié — déplacer sous `affectation-es/` ou
  `src/lib/` plutôt que supprimer).
- Migration Prisma de suppression de la table `PointsList` (après confirmation que
  toutes les listes sont bien migrées en prod).

---

## Plan initial (référence)

## 1. Objectif

Supprimer la **double saisie** des points. Aujourd'hui :

- `Liste de points` (`PointsList`) : inventaire fonctionnel (nom + type d'E/S, sections, modèles, catalogue, impression A4, génération GFX).
- `Affectation E/S` (`AffectationProjet`) : saisie **des mêmes points** une seconde fois, borne par borne, dans les onglets **Entrées** et **Sorties**.

**Cible** : les onglets *Entrées* / *Sorties* de l'affectation sont **remplacés par l'éditeur Liste de points**. La liste devient la **saisie unique** des points du projet ; l'affectation aux bornes, l'aperçu, les tests et la génération GFX sont **dérivés** de cette liste.

## 2. Règle fondatrice : 1 ligne = 1 type d'E/S

Décision métier actée : **une ligne de liste porte exactement un type** parmi `AI / DI / AO / DO / COM`. Les cases multi-types cochables aujourd'hui (`toggleIo` bascule chaque type indépendamment) sont un **défaut de conception** à corriger.

Conséquences :

- La sélection de type devient **exclusive** (radio, pas cases indépendantes).
- Une ligne de liste **EST** un point d'affectation → correspondance 1:1, sans passerelle à inventer.
- C'est cohérent avec le **catalogue de points** qui est déjà mono-type (`{nom, type}` dans `src/tools/liste-points/catalog.ts` + modèle `PointCatalog`).

Correspondance directe :

| Liste de points | Affectation dérivée |
|---|---|
| Nom de la ligne | Désignation de la borne |
| Type `AI` | Entrée analogique (signal ex. 0-10V / PT1000…) |
| Type `DI` | Entrée TOR (`D`) |
| Type `AO` | Sortie analogique |
| Type `DO` | Sortie TOR (relais) |
| Type `COM` | Communication (pas de borne physique) |
| Section | Regroupement (conservé) |
| Note | Commentaire |

## 3. Modèle de données cible

### 3.1 Le « point unifié »

On fusionne `PointRow` (liste) et `Point` (affectation) en une seule structure, stockée dans le JSON `AffectationProjet.data` (`Project.points`).

```ts
// Avant — src/tools/liste-points/model.ts
interface PointRow { id; kind:'point'|'section'; nom; note?; io?:Record<IoType,number> }

// Avant — src/tools/affectation-es/model.ts
interface Point { uid; direction:'input'|'output'; active; designation; repere?;
                  signal?; source?; relay?; module?; channel?; testStatus?; testComment? }

// Cible — point unifié (une ligne de projet)
interface Ligne {
  id: string;
  kind: 'point' | 'section';
  nom: string;                       // désignation (= liste)
  note?: string;                     // note / commentaire libre
  // --- points uniquement ---
  ioType?: 'AI'|'DI'|'AO'|'DO'|'COM';// LE type unique (remplace io{})
  active?: boolean;                  // inclus dans l'affectation
  // dérivés / affectation :
  signal?: string;                   // signal précis (0-10V, PT1000, D…) dérivé du type, ajustable
  relay?: string;                    // sorties TOR
  module?: number | null;            // affectation borne
  channel?: number | null;
  repere?: string;                   // code borne généré (UIx / UOx)
  // mise en service :
  testStatus?: 'non-teste'|'ok'|'defaut';
  testComment?: string;
}
```

Helpers dérivés (pas stockés) :
- `direction(ligne)` : `AI|DI → 'input'`, `AO|DO → 'output'`, `COM → aucune borne physique`.
- `signalParDefaut(ioType)` : `AI → '0-10V'`, `DI → 'D'`, `AO → '0-10V'`, `DO → 'D'`.

### 3.2 Prisma / stockage

- **Aucun nouveau modèle** : les points restent dans `AffectationProjet.data` (JSON). Le format des lignes change (voir §3.1).
- `PointsList` : **conservé pour la migration**, puis retiré (voir §11).
- `PointCatalog` : **conservé tel quel** (catalogue partagé mono-type, réutilisé par la liste).
- Pas de migration SQL de schéma (données JSON) — la migration est une **transformation de données** applicative (§11).

## 4. Architecture des onglets du projet

`src/tools/affectation-es/editeur.tsx` — `TABS` passe de :

```
Projet · Modules · Entrées · Sorties · Mise en service · Aperçu
```

à :

```
Projet · Liste de points · Automate & modules · Affectation (bornes) · Mise en service · Aperçus
```

- **Projet** : identité, client, N° Why, réseaux, Wi-Fi (inchangé).
- **Liste de points** *(remplace Entrées + Sorties)* : porte l'éditeur liste complet (§6).
- **Automate & modules** : choix automate + reco + modules (existant, inchangé).
- **Affectation (bornes)** : **vue de vérification/ajustement** du mapping auto (§5) — ne sert plus à *saisir* les points, seulement à réviser l'affectation aux bornes. Peut démarrer comme une version simplifiée (tableau borne → point) et gagner le drag-and-drop ensuite.
- **Mise en service** : inchangé (lit les points affectés). `tests-tab.tsx` / `tests-report.tsx` déjà OK.
- **Aperçus** : doc affectation (existant) + bouton impression liste A4 (§8).

## 5. Dérivation & affectation automatique aux bornes

Nouveau module `src/tools/affectation-es/affectation-auto.ts` :

- `pointsActifs(projet)` : lignes `kind==='point' && active && ioType!=='COM'`.
- `affecterAuto(projet, catalogue)` :
  - trie les entrées (`AI`+`DI`) et les sorties (`AO`+`DO`) dans l'ordre de la liste ;
  - remplit les canaux des modules dans l'ordre : entrées → bornes `UI` (ou `DI`), sorties → bornes `UO`/`DO` ;
  - respecte les capacités (`inputCount`/`outputCount`) et pose `module`, `channel`, `repere` (`modulePointCode`) ;
  - laisse intactes les affectations déjà **verrouillées manuellement** (option) ou tout ré-affecte (bouton « Ré-affecter automatiquement »).
- Réutilise la logique existante d'assignation de l'import GFX (`gfx-import.ts`) — la factoriser ici.

Déclencheurs : à l'ajout/suppression de points, au changement de modules, ou via un bouton explicite. Les `COM` n'occupent pas de borne (rattachés à un module MBUS/RS485 en info).

## 6. Aides de saisie à préserver (onglet Liste de points)

À porter depuis `src/tools/liste-points/` vers l'onglet Liste du projet, **sans perte** :

1. **Catalogue de points partagé** (`PointCatalog` + `catalog.ts` `CATALOG`) : combobox nom → **type auto** (unique), enrichissable (`ajouterPointCatalogue`).
2. **Modèles** (`TEMPLATES`) : insèrent une **section pré-remplie** de points types (Chaudière, CTA…).
3. **Sections** (`kind:'section'`), **réordonnancement**, **totaux live** (`computeTotals`).
4. **Impression A4** de la liste (`impression.tsx`).
5. **Génération GFX** (§7).

Adaptation clé : le composant liste doit écrire dans le **modèle unifié** (`ioType` exclusif au lieu de `io{}`), et travailler sur `projet.points` (état du projet) plutôt que sur une entité `PointsList` séparée.

## 7. GFX — import ET génération sur le même projet

Symétrie entrée/sortie :

- **Import `.gfx`** (`gfx-import.ts`, existant) : produit désormais des **lignes unifiées** (`ioType` déduit du signal). Adapter le mapping de sortie.
- **Génération `.gfx`** (`generer-gfx.tsx` + `gfx-export/`, depuis liste-points) : lit les lignes de la liste → **fonctionne tel quel** (même format nom+type). À déplacer sous `affectation-es/` (ou `src/lib/gfx/` partagé). Conserver la validation d'ouverture EC-gfxProgram côté utilisateur.
- **Import PDF** (`pdf-import.ts`) : idem GFX, produit des lignes unifiées (adapter le mapping).

## 8. Impressions du projet unifié

Trois sorties, boutons du même projet :

1. **Liste A4** (`impression.tsx` porté) — inventaire fonctionnel.
2. **Document d'affectation E/S** (`apercu.tsx`, paysage) — existant.
3. **Rapport de mise en service** (`tests-report.tsx`, portrait) — existant.

## 9. Base client (agrégation multi-outils)

`src/lib/clients/providers.ts` : aujourd'hui **deux** providers (liste + affectation). Après fusion → **un seul** provider (le projet). Retirer `listerPourClient` de liste-points, garder celui d'affectation (qui couvre tout). La fiche client `/clients/[id]` se simplifie (1 artefact par affaire).

## 10. Registre, navigation, nommage

- `src/tools/registry.ts` : passe de **2 cartes** à **1**. Retirer l'entrée `liste-points`.
- **Nommage** : « Affectation E/S depuis GFX » ne décrit plus le périmètre. Proposition : **« Projet GTB »** ou **« Affaire chantier »** (id de route à conserver `affectation-es` pour ne pas casser les liens, ou migrer proprement). → **décision ouverte** (§13).
- Sidebar : inchangée (Accueil + l'outil unique + section Configuration).

## 11. Sort de l'outil autonome + migration des données

### 11.1 Décision
- L'usage « liste seule » (chiffrage) est couvert par un **projet au stade Liste** (onglets suivants vides). → On peut **retirer** l'outil autonome sans perdre l'usage.

### 11.2 Migration des `PointsList` existants → `AffectationProjet`
Script applicatif (type `scripts/migrate-listes.mts`) :
- pour chaque `PointsList` :
  - créer un `AffectationProjet` (`clientNom`, `clientId`, `numeroWhy`, `createdById`) ;
  - `Project.name` = titre ; `header` = client - chantier ;
  - convertir `rows` → lignes unifiées :
    - `kind:'section'` → conservé ;
    - `kind:'point'` avec `io{}` : **éclater les lignes multi-types** existantes en une ligne par type actif (dette de l'ancien modèle) ; `ioType` = le type ;
  - points **non affectés** (module/channel nuls) — l'affectation auto (§5) se fera après choix d'automate.
- conserver `PointsList` en base jusqu'à validation, puis suppression du modèle (migration Prisma) dans un second temps.

### 11.3 Migration des `AffectationProjet` existants
- `data.points` (format `Point`) → lignes unifiées : `direction`+`signal` → `ioType`
  (`input`+analog→`AI`, `input`+`D`→`DI`, `output`+analog→`AO`, `output`+`D`→`DO`) ;
  conserver `module/channel/repere/relay/testStatus/testComment`. Pas de sections (flat).

## 12. Plan d'exécution par phases

Chaque phase est **livrable et vérifiable** isolément.

**Phase 0 — Préparation (sans rupture)**
- 0.1 Corriger la liste autonome : **type d'E/S exclusif** (radio) dans `liste-points/editeur.tsx`.
- 0.2 Factoriser la logique d'affectation auto de `gfx-import.ts` → `affectation-auto.ts`.

**Phase 1 — Modèle unifié**
- 1.1 Définir le type `Ligne` + helpers (`direction`, `signalParDefaut`) dans `affectation-es/model.ts`.
- 1.2 Adapter `apercu.tsx`, `tests-tab.tsx`, `tests-report.tsx`, `reco-automate.ts` pour lire les lignes unifiées (dérivation `direction`).
- 1.3 Adapter les mappings de sortie de `gfx-import.ts` / `pdf-import.ts` → lignes unifiées.

**Phase 2 — Onglet Liste dans le projet**
- 2.1 Porter l'éditeur liste (catalogue, modèles, sections, totaux, réordonnancement) en composant travaillant sur `projet.points`.
- 2.2 Remplacer les onglets `Entrées`/`Sorties` par l'onglet `Liste de points` (`editeur.tsx` `TABS`).
- 2.3 Nouvel onglet `Affectation (bornes)` : tableau borne→point + bouton « Ré-affecter automatiquement ».

**Phase 3 — Impressions & GFX**
- 3.1 Porter l'impression A4 liste (`impression.tsx`) dans le projet.
- 3.2 Déplacer la génération GFX (`generer-gfx.tsx` + `gfx-export/`) sous le projet.

**Phase 4 — Base client, registre, nommage**
- 4.1 Fusionner les providers (`providers.ts`).
- 4.2 Retirer la carte `liste-points` du registre ; renommer l'outil (décision §13).

**Phase 5 — Migration & retrait**
- 5.1 Script de migration `PointsList` → `AffectationProjet` (§11.2) + migration in-place des `AffectationProjet` existants (§11.3).
- 5.2 Après validation : retrait des routes `/outils/liste-points`, suppression du dossier `src/tools/liste-points/`, migration Prisma de suppression de `PointsList`.

## 13. Décisions encore ouvertes

1. **Nommage & route** de l'outil fusionné : garder `affectation-es` (route stable) avec libellé « Projet GTB » ? ou nouvelle route + redirections ?
2. **Onglet Affectation (bornes)** : version minimale (tableau + ré-affecter auto) d'abord, drag-and-drop plus tard ? (recommandé : oui, minimal d'abord).
3. **Verrouillage des affectations manuelles** lors d'une ré-affectation auto : opt-in par borne, ou tout recalculer ?
4. **COM** : simple info rattachée à un module MBUS/RS485, ou ligne listée sans borne dans le doc ?
5. **Liste autonome** : retrait complet (recommandé) ou conservation d'un accès « liste rapide » séparé ?

## 14. Risques & points d'attention

- **Migration destructive** : travailler sur copie / `scripts/backup-db.sh` avant, migration idempotente, `PointsList` conservé jusqu'à validation.
- **Points sans module** (COM, ou pas encore affectés) : bien gérés dans l'aperçu (déjà le cas : filtrés).
- **Éclatement des lignes multi-types** anciennes : à logguer (nombre de lignes éclatées) pour contrôle.
- **Heuristiques GFX/PDF** : ne changer que le **mapping de sortie** (vers lignes unifiées), pas les heuristiques de parsing.
- **`PointCatalog` mono-type** : cohérent avec la règle §2, aucun changement nécessaire.
