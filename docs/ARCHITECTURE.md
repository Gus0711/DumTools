# DumTools — Architecture & fonctionnement (état courant)

> Document de référence de l'application après la **fusion** des deux outils
> historiques en un outil unique **« Projet GTB »**, et l'ajout des écrans de
> configuration (base matériel, catalogue de points, documentation).
> Branche de travail : `fusion-liste-affectation`. Voir aussi
> [plan-fusion-liste-affectation.md](plan-fusion-liste-affectation.md) et
> [A_FAIRE-base-materiel.md](A_FAIRE-base-materiel.md).

---

## 1. Vue d'ensemble

DumTools est le SaaS interne de **Dumortier (Groupe Fareneït)**, intégrateur GTB.
Stack : **Next.js 16** (App Router, RSC) · **PostgreSQL + Prisma 7** (client dans
`src/generated/prisma`, adaptateur `@prisma/adapter-pg`) · **Auth.js v5** (JWT,
rôles ADMIN/MEMBRE) · **Tailwind v4** (tokens 3 étages) · Docker Compose.

Les données sont **partagées** entre tous les collègues. La **base client**
(`Client`) est le pivot : la fiche client agrège la production de tous les outils.

### Les deux outils historiques ont fusionné

Avant : deux outils séparés — `Liste de Points GTB` (`PointsList`) et
`Affectation E/S depuis GFX` (`AffectationProjet`), avec **double saisie** des
points. Depuis la fusion : **un seul outil « Projet GTB »** (route conservée
`/outils/affectation-es`). La liste de points est devenue un **onglet** du projet.

L'outil autonome « Liste de points » n'est plus dans le registre/menu, mais ses
**routes et son code restent** (réutilisés comme bibliothèque : voir §8). Le
retrait définitif (suppression du dossier + drop de la table `PointsList`) est en
attente de validation (Phase 5.2 du plan).

---

## 2. L'outil « Projet GTB »

Un projet = une affaire chantier, du chiffrage à la mise en service.
Éditeur : `src/tools/affectation-es/editeur.tsx`. Onglets :

| Onglet | Rôle | Composant |
|---|---|---|
| **Projet** | Identification seule (nom, client, N° Why, en-tête, titre, version, date) | `ProjetTab` (editeur.tsx) |
| **Liste de points** | Saisie unique des points (catalogue, modèles, sections, drag&drop, totaux) + **Imprimer la liste A4** + **Générer GFX** | `liste-tab.tsx` → `RowsEditor` |
| **Automate & modules** | Choix automate (+ **reco**), alimentation, réseaux, Wi-Fi, modules d'extension, **lien fiche technique** | `AutomateModulesTab` (editeur.tsx) |
| **Affectation** | Vérif/ajustement des bornes (signal/module/canal/relais), **Ré-affecter automatiquement** | `affectation-tab.tsx` |
| **Mise en service** | Suivi des tests par module (cartes déroulantes, statut coloré, commentaire) + **Imprimer le rapport** | `tests-tab.tsx` / `tests-report.tsx` |
| **Aperçu** | Document d'affectation E/S (A4 paysage : couverture, page automate, schéma à bornes + tableaux par module) + impression | `apercu.tsx` |

### Flux de travail

```
Import .gfx / PDF ─┐
                   ├─► Liste de points ─► Automate & modules ─► Affectation ─► Mise en service ─► Aperçus
Saisie manuelle ───┘        (rows)         (auto-affectation)    (bornes)        (tests)         (impressions)
```

Choisir un automate **génère automatiquement** l'affectation aux bornes. Éditer
la liste **resynchronise** et réaffecte. Trois impressions : **liste A4**,
**document d'affectation**, **rapport de mise en service**.

---

## 3. Modèle de données

### 3.1 Le point unifié — approche « dérivation »

Décision d'architecture clé : plutôt que de renommer le modèle `Point`, le projet
stocke **deux représentations liées** :

- **`Project.rows`** : la saisie « liste de points » (format `PointRow` :
  `{ id, kind:'point'|'section', nom, note?, io }`). **Source de vérité de la saisie.**
  Règle métier : **1 ligne = 1 type d'E/S exclusif** (`io` = un seul de AI/DI/AO/DO/COM).
- **`Project.points`** : les E/S physiques affectées aux bornes (format `Point` :
  `{ uid, direction, active, designation, repere, signal, relay, module, channel, testStatus, testComment }`).
  **Dérivé** de `rows`. Consommé par l'aperçu, les tests et la reco (inchangés).

**Dérivation** (`src/tools/affectation-es/derivation.ts`) :
- `syncPoints(rows, existants)` : régénère `points` depuis `rows`. 1 ligne point
  non-COM → 1 point (COM = pas de borne physique). **Préserve** borne
  (module/canal/repère), signal affiné et suivi de test en réappariant par id
  (`row.id === point.uid`). Le signal suit la **famille** du type : DI↔AI change
  bien D↔0-10V, mais un signal analogique affiné (PT1000…) est conservé.
- `pointsToRows(points)` : reconstruit des lignes depuis des points (import GFX/PDF).
- `ioTypeOf`, `signalParDefaut` : helpers.

**Affectation auto** (`src/tools/affectation-es/affectation-auto.ts`) :
- `affecterAuto(project)` : remplit `module`/`channel`/`repere` dans l'ordre de la
  liste (entrées → bornes UI/DI, sorties → UO/DO), selon les capacités des modules.
- `moduleIntegre(catalogue, ref)` : module représentant les **E/S intégrées** de
  l'automate (numéro **`0`**). Indispensable pour ECY-300/303/400/600… (sinon
  rien à affecter). `reconcilierModules(...)` le crée/remplace au choix de l'automate.

> ⚠️ Le module intégré porte le numéro **0** (falsy). Utiliser `p.module != null`
> (jamais `p.module &&`) pour tester l'affectation d'un point.

### 3.2 Modèles Prisma (`prisma/schema.prisma`)

| Modèle | Rôle |
|---|---|
| `User` | comptes (ADMIN/MEMBRE), bcrypt |
| `Client` / `Chantier` | référentiel client partagé |
| `PointsList` | **outil autonome (déprécié)** — conservé pour migration |
| `PointCatalog` | catalogue de points partagé (nom → type) |
| `Modele` | modèles de saisie (sections pré-remplies) — éditables |
| `AutomateModele` | base matériel : automates (E/S intégrées, extensibilité, `maxModules`, `maxPoints`, `docUrl`, `modulesCompat`) |
| `ModuleModele` | base matériel : modules (extension/communication/accessoire, `docUrl`) |
| `AffectationProjet` | **le projet unifié** — `data` (JSON `Project`) + `clientId`/`numeroWhy` |

Le `Project` complet (identification, automate, réseaux, `rows`, `points`,
`modules`, suivi tests) est stocké en **JSON** dans `AffectationProjet.data`
(type `Project` dans `model.ts`).

### 3.3 Rétro-compatibilité

`getProjet` (queries.ts) **dérive `rows`** depuis `points` pour les anciens
projets, et `reconcileInitial` (editeur.tsx) crée le module intégré manquant au
chargement → les projets pré-fusion s'auto-réparent.

---

## 4. Base matériel (automates & modules Distech)

Éditable en base, partagée. Écran **`/configuration/materiel`**
(`config-materiel.tsx`). Source de vérité runtime : la BDD ; valeurs par défaut /
seed : `src/tools/affectation-es/catalogue.ts` (`catalogueParDefaut()`).

### Automates (`AutomateModele`)
Référence · image · alim (`alimIntegree` = « pas de module PS à ajouter » +
libellé) · E/S intégrées (type+nombre, codes de bornes pour E/S mixtes) ·
**extensible** · **modules compatibles** · **`maxModules`** · **`maxPoints`** ·
**`docUrl`** (fiche technique).

Alignés sur les **8 fiches techniques Distech** (`public/materiel/Documentations_Distech/`) :
- Non extensibles : ECY-300/350, ECY-303/-303-M3, ECY-400/450, ECY-PTU-107/207/208.
- Extensibles (bus HD15, jusqu'à N points) : ECY-600/650 (≤ 62), ECY-S1000E-28/48/320,
  **ECY-APEX / ECY-APEX-48** (≤ 320 / 48). `maxModules` = 20 pour les modulaires.

### Modules (`ModuleModele`)
Extension : `8UI6UO, 8UI, 16DI, 8DOR, 4UI4UO, 6UO, 8UI6DOT` + variantes `-HOA`.
Communication : `MBUS, RS485` (RS485 = module pour réseaux Modbus multiples).
Accessoire : `SCREEN`.

### Recommandation d'automate (`reco-automate.ts`)
`proposerAutomates(besoin, catalogue)` classe les solutions complètes
(automate + modules), la plus efficace d'abord (le moins d'appareils, puis le
moins d'E/S gaspillées). Respecte `extensible`, `modulesCompat`, et **exclut** un
automate si le besoin dépasse `maxPoints` ou `maxModules`.

---

## 5. Catalogue de points & modèles

Écran **`/configuration/points`** (`config-points.tsx`).
- **Catalogue de points** (`PointCatalog`) : nom → type d'E/S, CRUD. Alimente le
  combobox de point de l'éditeur (auto-remplit le type).
- **Modèles** (`Modele`) : sections pré-remplies (Chaudière, CTA…) insérables en
  un clic ; éditeur = nom + points ordonnés piochés au catalogue.

---

## 6. Documentation Distech

- PDF dans `public/materiel/Documentations_Distech/` (servis publiquement — le
  `proxy` exclut `materiel/` de l'auth).
- Champ **`docUrl`** sur automates/modules → lien **📄 Fiche technique** dans
  l'écran base matériel **et** sous le sélecteur d'automate de l'éditeur.
- Page **`/documentation`** (`app/(app)/documentation/page.tsx`) : liste les
  fiches avec **Ouvrir** + **Télécharger**. Lien sidebar « Documentation ».

---

## 7. Navigation / écrans de configuration

Sidebar (`components/app-shell/sidebar.tsx`) :
- **Outils** : Accueil · Projet GTB.
- **Configuration** : Clients · Catalogue & modèles · Base matériel · Documentation.

Registre `src/tools/registry.ts` : une seule carte « Projet GTB ».
Fiche client : un seul provider (`src/lib/clients/providers.ts`).

---

## 8. Fichiers clés

```
src/tools/affectation-es/
  editeur.tsx          SPA à onglets (Projet, Liste, Automate&modules, Affectation, Tests, Aperçu)
  model.ts             types Project/Point/Module + helpers (Project.rows ajouté)
  derivation.ts        rows ⇄ points (syncPoints, pointsToRows)
  affectation-auto.ts  affecterAuto, moduleIntegre, reconcilierModules
  liste-tab.tsx        onglet Liste (réutilise RowsEditor + Impression + GenererGfx de liste-points)
  affectation-tab.tsx  onglet Affectation (bornes) + ré-affecter auto
  tests-tab.tsx        onglet Mise en service (cartes déroulantes)
  tests-report.tsx     rapport de mise en service imprimable (A4 portrait)
  apercu.tsx           document d'affectation imprimable (A4 paysage)
  catalogue.ts         base matériel : types + défauts (catalogueParDefaut)
  catalogue-queries.ts lecture BDD (getCatalogue, getMaterielAdmin)
  catalogue-actions.ts CRUD base matériel
  config-materiel.tsx  écran /configuration/materiel
  reco-automate.ts     recommandation d'automate (capacités)
  gfx-import.ts        import .gfx (produit points + rows)
  pdf-import.ts        import PDF schéma
  catalog.ts           constantes héritées (seed/fallback + import) — NE PAS éditer
  apercu-print.css / tests-print.css   styles d'impression

src/tools/liste-points/   (bibliothèque partagée + outil autonome déprécié)
  rows-editor.tsx      éditeur de lignes réutilisable (rows/setRows)
  impression.tsx       impression A4 de la liste
  generer-gfx.tsx + gfx-export/   génération de squelette GFX
  config-points.tsx / config-actions.ts   écran /configuration/points
  catalog.ts           CATALOG + TEMPLATES (seed/fallback)
  model.ts / queries.ts / actions.ts
```

---

## 9. Scripts & migrations

**Scripts** (`scripts/`, lancés via `npx tsx`) :
- `migrate-listes-vers-projets.mts` — migre `PointsList → AffectationProjet`
  (idempotent, non destructif, éclate les anciennes lignes multi-types). **Exécuté : 14 listes.**
- `sync-materiel.mts` — synchronise la base matériel sur les défauts de
  `catalogue.ts` (crée les manquants, met à jour les champs).

**Migrations Prisma** notables (Prisma 7 : `prisma migrate dev` ne régénère PAS le
client → `npm run db:generate` + redémarrer `next dev`) :
- `base_materiel` — AutomateModele + ModuleModele.
- `modeles_points` — Modele.
- `materiel_doc_capacite` — `docUrl`, `maxModules`, `maxPoints`.

---

## 10. Reste à faire

- **Phase 5.2 (destructif, à valider)** : retrait des routes `/outils/liste-points`,
  déplacement du code réutilisé sous `affectation-es/`/`lib/`, **drop de la table
  `PointsList`** (après confirmation que tout est migré en prod).
- **Import GFX/PDF piloté par la base matériel** (aujourd'hui détection sur les
  constantes `catalog.ts`) — voir `A_FAIRE-base-materiel.md`.
- **Esthétique de l'impression A4 de la liste** (signalée moins jolie).
- Variantes matériel non ajoutées : ECY-TU-203, ECY-303-M3 déjà ajouté.

---

## 11. Historique de la session (branche `fusion-liste-affectation`)

```
8350e72  Liste de points : type d'E/S exclusif + catalogue/modèles gérables
24195da  Fusion (1) : modèle dérivation + extraction RowsEditor
3e915d7  Fusion (2) : Liste de points remplace Entrées/Sorties
2485b77  Fusion (3) : outil unifié « Projet GTB » + migration des listes
e37fa2b  Fusion (4) : impression A4 dans l'onglet Liste + finitions
0659d10  Workflow : onglet Projet = identification ; automate → auto-affectation
4cd5a53  Fix : le signal suit le type lors d'un changement DI↔AI
9f739c7  Fix : points sur l'automate intégré (module n°0) en mise en service
2b71a4d  Mise en service : commentaire sur une seule ligne
b4b64a6  Base matériel : alignement spec Distech + capacités + documentation
8d86e8f  Base matériel : ajout ECY-350, ECY-PTU-107/208 + lien fiche éditeur
```

`main` = état de référence d'avant fusion. La branche est poussée sur
GitHub (`Gus0711/DumTools`) ; merge après validation de la Phase 5.2.
