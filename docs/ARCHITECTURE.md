# DumTools — Architecture & fonctionnement (état courant)

> Document de référence de l'application après la **fusion** des deux outils
> historiques en un outil unique **« Projet GTB »**, et l'ajout des écrans de
> configuration (base matériel, catalogue de points, documentation).
> Branche de travail : `fusion-liste-affectation`. Voir aussi
> [plan-fusion-liste-affectation.md](plan-fusion-liste-affectation.md) et
> [A_FAIRE-base-materiel.md](A_FAIRE-base-materiel.md).
>
> 🆕 **Couche « Affaire » (pivot multi-outils) & multi-automate : [`AFFAIRES.md`](AFFAIRES.md).**

---

## 1. Vue d'ensemble

DumTools est le SaaS interne de **Dumortier (Groupe Fareneït)**, intégrateur GTB.
Stack : **Next.js 16** (App Router, RSC) · **PostgreSQL + Prisma 7** (client dans
`src/generated/prisma`, adaptateur `@prisma/adapter-pg`) · **Auth.js v5** (JWT,
rôles ADMIN/MEMBRE) · **Tailwind v4** (tokens 3 étages) · Docker Compose.

Les données sont **partagées** entre tous les collègues. Deux **pivots** agrègent
la production de tous les outils : le **client** (`Client`) et l'**affaire**
(`Chantier`, 1 par n° Why — voir [`AFFAIRES.md`](AFFAIRES.md)).

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
| **Affectation** | Vérif/ajustement des bornes (signal/module/canal/relais), **Ré-affecter automatiquement** ; le tableau récapitulatif est une **page du document Aperçu**, pas une impression à part | `affectation-tab.tsx` |
| **Mise en service** | Suivi des tests par module (cartes déroulantes, statut coloré, commentaire) + **Imprimer le rapport** | `tests-tab.tsx` / `tests-report.tsx` |
| **Aperçu** | **Le** document d'affectation E/S (A4 paysage : couverture, page automate, **tableau récapitulatif**, schéma à bornes + tableaux par module) + impression | `apercu.tsx` + `recap-affectation.tsx` |

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
| `User` | comptes (ADMIN/MEMBRE), bcrypt — **gérables** via `/configuration/utilisateurs` (ADMIN) |
| `Client` | référentiel client partagé |
| `Chantier` | **= « Affaire » : le pivot** (`numeroWhy @unique`, `etat` enum `EtatAffaire`) — voir [`AFFAIRES.md`](AFFAIRES.md) |
| `PointsList` | **outil autonome (déprécié)** — conservé pour migration |
| `PointCatalog` | catalogue de points partagé (nom → type ; COM porte un **protocole**) |
| `Modele` | modèles de saisie (sections pré-remplies) — éditables |
| `AutomateModele` | base matériel : automates (E/S intégrées, extensibilité, `maxModules`, `maxPoints`, `docUrl`, `modulesCompat`) |
| `ModuleModele` | base matériel : modules (extension/communication/accessoire, `docUrl`) |
| `AffectationProjet` | **un automate** — `data` (JSON `Project`) + `clientId`/`numeroWhy` + **`chantierId`** (rattachement Affaire) |

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

### Le nom dit CE QUE C'EST, le texte libre dit OÙ

Règle **impérative**, transverse à l'outil, au MCP et aux imports :

| | |
|---|---|
| **`nom`** | le **générique**, repris tel quel du catalogue — « Cde contacteur dalle chauffante », « Sonde ambiance », « Commande » |
| **`note`** (texte libre) | ce qui **distingue** ce point d'un autre identique : le local, la zone, le repère, le n° de trame — « Salle Communale 1 », « CR Mairie » |

Donc « Cde contacteur dalle chauffante Salle Communale **1** » et « … **2** » sont
**deux fois le même point**, pas deux points. Le catalogue est le **vocabulaire de
l'entreprise** (un type de point réutilisable d'une affaire à l'autre), jamais un
journal des points d'un chantier.

Ce n'est pas cosmétique : la **BOM apparie sur le nom EXACT**
(`magasin/bom.ts` → `PointCatalog.nom`). Un nom localisé = une nomenclature
introuvable, donc du matériel absent de la liste. Faute de règle écrite, le
catalogue avait enflé de **63 entrées en une semaine** et les documents portaient
**342 libellés distincts pour une vingtaine de concepts réels** (quatre synonymes
pour la sonde d'ambiance, quatre pour la sortie de commande).

Ce qui tient la règle :
- `nomLocalise()` (`liste-points/model.ts`) — détecteur partagé. Le MCP
  **refuse** un nom localisé au catalogue (`dumtools_upsert_catalog_point`) ;
  l'interface se contente d'**avertir** (un humain peut avoir raison).
- Le générateur GFX **compose `nom + note` à la demande**
  (`gfx-export/assign.ts`) : le nom générique reste net tant qu'il est unique, et
  le texte libre ne vient le compléter que pour départager une collision. Sans
  ça, dix commandes deviendraient « Commande (2) … (10) » dans le programme, et
  la seule échappatoire serait de remettre le local dans le nom. La modale
  « Générer GFX » signale les noms encore en doublon.
- **L'import GFX/PDF applique la règle À L'ENTRÉE**
  (`liste-points/vocabulaire.ts` → `nommeurImport`, `derivation.ts`) : il ne
  recopie plus la désignation brute du programme client. Voir « L'import ne
  pollue plus » ci-dessous.
- L'aperçu imprime déjà la note sous le libellé (`apercu.tsx`) : sortir le local
  du nom ne perd rien sur le document client.
- Remise à niveau d'une base déjà polluée :
  **`npx tsx scripts/normaliser-points.mts`** (propose une table CSV à valider),
  puis `--appliquer`. Les lignes gardent leur `id` → affectations aux bornes et
  suivi de mise en service intacts.

### L'import ne pollue plus (2026-08-31)

L'import GFX/PDF recopiait la **désignation brute de l'automate** dans `nom`
(`ODM_Dalles_Secretariat`) : troisième source de pollution, et la seule qui se
rechargeait toute seule — chaque nouveau programme client relançait le mal que le
script venait de réparer.

Le moteur de vocabulaire du script (coupe au local, synonymes, regroupements) a
donc quitté `scripts/normaliser-points.mts` pour
**`src/tools/liste-points/vocabulaire.ts`**, où l'import s'en sert aussi.
`normaliserPourImport(libelle, type, catalogue)` conclut par **quatre voies**, de
la plus précise à la plus générale :

| | |
|---|---|
| **catalogue** | le libellé EST un point connu, à la variante d'écriture près (`SONDE_RETOUR` → « Sonde retour ») — et c'est l'**orthographe du catalogue** qui gagne, la BOM apparie sur le nom exact |
| **coupe** | on coupe au local, le générique restant est au catalogue (`Amb_Salle_Conseil` → « Sonde ambiance » + « Salle Conseil ») |
| **préfixe** | le plus long générique connu qui **ouvre** le libellé le nomme (`Defaut Bruleur CHD` → « Defaut » + « Bruleur CHD ») |
| **type** | faute de mieux, le **type d'E/S** nomme le point — une sortie est toujours un ordre : DO → « Commande », AO → « Pilotage » — et le libellé d'origine part **entier** au texte libre |

Trois garde-fous portent le reste :

- **On n'invente jamais de vocabulaire** : chacune des quatre voies doit
  retomber sur une entrée qui existe DÉJÀ au catalogue, sinon on ne touche à
  rien et le libellé brut passe tel quel (l'écran de saisie avertit déjà, un
  humain tranchera). Sans catalogue, l'import est inchangé.
- **Les ENTRÉES ne se laissent pas nommer par leur type** (`GENERIQUE_PAR_TYPE`
  ne contient que DO et AO) : un défaut, un retour de marche et un comptage sont
  trois DI différents, une sonde de départ, de retour et d'ambiance trois AI
  différents. Deviner y perdrait la seule information que porte le libellé.
- ⚠️ **Un type qui CONTREDIT le point disqualifie la cible.** « Commande V6V Z1 »
  est une sortie **analogique**, mais « Commande » est une entrée de catalogue
  **TOR** : l'y coller ferait entrer sa nomenclature — un relais — dans la BOM
  de l'affaire, ce que tout ce mécanisme existe justement pour empêcher. La
  cible est donc écartée et le point repart sur « Pilotage ». On ne s'autorise
  cette exigence **que là où le type sait nommer le point tout seul** (AO/DO) :
  sur une entrée, elle ferait perdre un appariement correct sans rien offrir en
  échange. Sans effet sur l'historique — les 351 libellés donnent exactement les
  mêmes 283 accords.
- **Rien n'est perdu** : ce qui ne faisait que distinguer le point rejoint le
  texte libre **devant** le repère de câblage que l'import y écrit déjà —
  « Dalles — Secretariat — Import GFX - Module 2 / UO3 ». Le distinctif se lit
  en premier, la traçabilité reste derrière, et le générateur GFX recompose
  `nom + note` quand il faut départager des homonymes.

Le résumé d'import le **dit** (« · 31 libellés ramenés au vocabulaire ») : la
désignation du programme client a changé de forme, ça ne doit pas se découvrir.

Rejoué sur les 351 libellés réels de la base d'août 2026
(`scripts/normalisation-points-relecture1.csv`, la table relue à la main) :
**283 retombent sur le nom exact qu'un humain avait choisi**, 34 sur un
générique plus court, 18 restent bruts. Contrôles :
`npx tsx scripts/vocabulaire-smoke.mts` (25, sans base).

---

### La page module se pagine (2026-08-31)

`.module-table-area` est une boîte à **hauteur fixe** (153 mm en paysage, 147 en
portrait) en **`overflow: hidden`** : ce qui dépasse disparaît, sans un mot.

Sur l'affaire *restaurant Wignehies*, le module **8UI6UO** y demandait
**179 mm** — il perdait ses **deux dernières sorties** et sa légende, et comme
`apercu-pdf.ts` capture ce même DOM avec html2canvas, **le PDF partait tronqué
sur le chantier**. Aucun contrôle automatique ne pouvait le voir : le document
restait un PDF valide, avec le bon nombre de pages.

Deux causes se cumulaient :

1. **Un point qui porte un TEXTE LIBRE occupe deux lignes** (la note se rend
   sous la désignation). L'import GFX en pose un sur *chaque* point — le tableau
   double donc de hauteur dès qu'un projet vient d'un programme client.
2. **Le 8UI6UO est le pire cas** : 14 bornes en **deux** tableaux, donc deux
   cartouches et deux lignes d'en-tête (~19 mm) de plus qu'un 16DI, qui porte
   autant de bornes en un seul tableau.

`paginerModule()` (`apercu.tsx`) fait donc ce que le récapitulatif faisait déjà :
répartir en pages de hauteur **connue** plutôt que s'en remettre à un flux CSS
qui se fait rogner. Un tableau qui déborde continue en page suivante, cartouche
repris en « (suite) » ; une section qui finit en milieu de page laisse la
suivante enchaîner dessous. Les **pages de suite abandonnent le schéma à
bornes** — il est déjà imprimé sur la première — et le tableau prend toute la
largeur (`.module-plan.sans-schema`).

Ce qui porte le reste :

- **`GABARIT_MODULE` est MESURÉ, jamais estimé** — au navigateur, sur le rendu
  réel, par `scripts/apercu-affectation-regard.mts`. Deux pièges de mesure :
  l'aperçu écran applique `zoom: 0.62`, donc `getBoundingClientRect()` rend des
  millimètres faux (lire `offsetHeight`) ; et le corps passé à `page.evaluate`
  doit l'être **en chaîne**, esbuild injectant un helper `__name` absent de la
  page.
- **Deux hauteurs de ligne**, `ligne` (avec texte libre) et `ligneSimple` : c'est
  toute la différence entre un projet saisi à la main et un projet importé.
- **La légende est réservée sur CHAQUE page** : on ne sait pas encore laquelle
  sera la dernière, et `MARGE_MODULE` garde un fond de page libre — la zone reste
  en `overflow: hidden`, mieux vaut un blanc en bas qu'une ligne rognée.
- ⚠️ **Sur une page de suite, la légende ne se pousse plus en bas de zone** : le
  tableau y occupe toute la largeur, et son `margin-top: auto` la faisait se
  coucher sur le logo du pied (`.logo-dumortier`, en position absolue à gauche —
  sur la première page, la colonne du schéma l'en protégeait).
- Le découpage se fait **avant la numérotation** des pages, sinon le
  « page n / N » du pied mentirait.

Vérification : `npx tsx scripts/apercu-affectation-regard.mts <projet>` — il
capture chaque page **dans les deux orientations** et annonce le débordement de
chacune. Sur Wignehies : 8 pages en paysage, 6 en portrait, **0,0 mm de
débordement partout**.

---

## 6. Documentation technique

> **Déplacée dans le Magasin le 2026-08-12** — voir
> [`MAGASIN.md` §15](MAGASIN.md). Une fiche technique appartient au **produit**,
> pas à un dossier de PDF rangé à côté de l'application : c'est ce qui permet de
> la retrouver depuis la base matériel **et** de l'annexer aux devis qui
> chiffrent ce produit, sans jamais la saisir deux fois.

- Modèle **`Documentation`** + jonction **`ProduitDocumentation`** (N↔N : « ECY
  IO Modules » couvre les six modules d'extension). Source = un binaire
  téléversé sur le disque de la VM (`DOC_MEDIA_DIR`) **ou** un lien constructeur.
- Écrans : bloc « Documentation » sur la fiche produit, bibliothèque
  **`/outils/magasin/documentation`** (lecture ouverte à tous, gestion Achats).
- La **base matériel lit par `produitId`** (`catalogue-queries.ts` →
  `AutomateDef.docs`). Le champ **`docUrl`** hérité (PDF de
  `public/materiel/Documentations_Distech/`) reste comme **repli** tant qu'un
  modèle n'est relié à aucun produit — c'est encore le cas de 23 modèles sur 27.
- L'ancienne page `/documentation` et son entrée de nav ont été **supprimées** ;
  les PDF de `public/` sont **conservés** (le repli s'en sert).
- Reprise : `npx tsx scripts/documentation-reprise.mts` (puis `--appliquer`).

---

## 7. Navigation / écrans de configuration

Sidebar (`components/app-shell/sidebar.tsx`) :
- **Outils** : Accueil · **Affaires** · Projet GTB.
- **Configuration** : Clients · Catalogue & modèles · Base matériel ·
  **Utilisateurs** (ADMIN uniquement). *(« Documentation » a été retirée : les
  fiches vivent dans le Magasin, cf. §6.)*

Registre `src/tools/registry.ts` : une seule carte « Projet GTB ».
Agrégation multi-outils : deux pivots, même patron `PROVIDERS` —
**fiche client** (`src/lib/clients/providers.ts`) et **fiche affaire**
(`src/lib/chantiers/providers.ts`, voir [`AFFAIRES.md`](AFFAIRES.md)).

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
  apercu.tsx           LE document d'affectation imprimable (A4 paysage) :
                       couverture, automate, récap, une page par module
  recap-affectation.tsx  pages du tableau récapitulatif, montées dans apercu.tsx
                       (même patron de pagination que paginerModule, §5)
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
  impression.tsx + impression-print.css   document A4 de la liste (cartouche,
                       synthèse, sous-totaux de section, pagination mesurée)
  pdf-liste.ts         même document en PDF vectoriel (pdfmake) pour kDrive
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

- **Multi-automate — brique 3** : livrables consolidés au niveau affaire (dossier
  unique multi-automate + nomenclature/BOM cumulée) ; 1er outil satellite **GED
  « Documents »** (backup `.gfx`, plans, schémas). Voir [`AFFAIRES.md`](AFFAIRES.md) §9.
- **Phase 5.2 (destructif, à valider)** : retrait des routes `/outils/liste-points`,
  déplacement du code réutilisé sous `affectation-es/`/`lib/`, **drop de la table
  `PointsList`** (après confirmation que tout est migré en prod).
- **Import GFX/PDF piloté par la base matériel** (aujourd'hui détection sur les
  constantes `catalog.ts`) — voir `A_FAIRE-base-materiel.md`.

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

### Travaux récents (session en cours, non encore commités)

- **Gestion des utilisateurs** — écran `/configuration/utilisateurs` (ADMIN) :
  créer / éditer (nom, rôle, actif) / réinitialiser le mot de passe. Pas de
  suppression (désactivation via « actif »). Garde-fou anti-lockout (dernier
  admin actif). `src/lib/users/`.
- **Affectation « capability-aware » (triac)** — l'ECY-303 a 4 sorties **triac DO
  (TOR seul)** : l'affectation ne place plus jamais un point **analogique** sur
  un triac. Algo 2 passes (bornes dédiées puis universelles) dans
  `affectation-auto.ts` (`capaciteBorne`/`pointEstTor` dans `model.ts`) +
  **validation visuelle** (onglet Affectation + aperçu) des incompatibilités.
- **Protocoles COM** — les points de communication portent un **protocole**
  (`Modbus RTU/TCP · BACnet MS/TP · BACnet IP · M-Bus · LoRaWAN · KNX`) dans le
  champ `signal` (`COM_SIGNALS` dans `liste-points/model.ts`) : menu dans la liste,
  le catalogue et affichage à l'impression.
- **Pivot « Affaire » + multi-automate** — la grosse addition : voir
  [`AFFAIRES.md`](AFFAIRES.md). Identification (client, n° Why) déplacée sur
  l'affaire ; N automates par affaire ; IP par port (`controller_ip_2`).
  *(Un « plan réseau » partagé sur l'affaire a été essayé puis retiré : le réseau
  reste géré par automate.)*
