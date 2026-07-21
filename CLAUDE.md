# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DumTools is a collection of internal browser tools for **Dumortier (Groupe Fareneït)**, a French building-automation (GTB — *Gestion Technique du Bâtiment*) integrator. It is evolving from a set of standalone `.html` files into a **self-hosted internal SaaS** (see "Cible SaaS" below). The UI and all domain vocabulary are in **French**.

## Cible SaaS (en cours de construction)

Passage des outils HTML autonomes vers une plateforme unique, auto-hébergée sur une **VM Proxmox** interne, données **partagées entre tous** les collègues.

> 📐 **État courant détaillé : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** (à lire en premier).
> 🗺️ **Priorités & reste à faire : [`docs/ROADMAP.md`](docs/ROADMAP.md)** — feuille de route consolidée, ordonnée sur le cycle métier A→Z d'une affaire (visite de relevé → étude/chiffrage → armoire → programmation → mise en service → livraison/supervision → SAV). À lire avant de choisir le prochain chantier de dev.
> Les deux outils historiques ont **fusionné** en un seul, **« Projet GTB »** (route `/outils/affectation-es`) : la « Liste de points » est devenue un **onglet** du projet, qui dérive les E/S affectées aux bornes (`Project.rows` → `Project.points`, voir `derivation.ts`). Écrans de config ajoutés : base matériel, catalogue de points & modèles, documentation Distech. Travail sur la branche `fusion-liste-affectation` ; l'outil autonome « liste-points » reste comme bibliothèque + code déprécié (retrait Phase 5.2 à valider).
>
> 🆕 **Couche « Affaire » (2e pivot) : [`docs/AFFAIRES.md`](docs/AFFAIRES.md).** Le modèle `Chantier` est promu **« Affaire »** (1 par n° Why) : elle **porte l'identification** (client, n° Why — retirée de l'éditeur d'automate) et **regroupe N automates** (multi-automate = N `AffectationProjet` par affaire). Écrans `/affaires` (tableau de bord) + `/affaires/[id]` (fiche). Même patron d'agrégation `PROVIDERS` que la fiche client. Le **financier reste dans WhySoft**. Autres ajouts session : **gestion des utilisateurs** (`/configuration/utilisateurs`, ADMIN), **affectation capability-aware** (jamais d'analogique sur une borne triac DO) + validation, **protocoles COM** (Modbus/BACnet/M-Bus/LoRaWAN/KNX/TCP-IP dans le champ `signal`).
>
> 🧰 **Espaces perso (ToolGus) + outil « Scanner » : [`docs/TOOLGUS.md`](docs/TOOLGUS.md).** Un `Tool.proprietaire?` range des **outils persos** (accessibles à tous) à l'écart des outils métier : carte d'accueil → route dynamique `/perso/[qui]`, **absents de la sidebar**, **non inscrits dans `PROVIDERS`** (autonomes). 1er outil = **Scanner** (`/perso/gus/modems`) : scan **universel** QR + codes-barres (`BarcodeDetector` natif + repli ZXing), reconnaissance des **modems Teltonika** (parsing `WIFI:`), tableau serveur partagé avec **rattachement affaire/groupe**, **sélection multiple**, **recherche/filtres**, export CSV.

- **Stack** : Next.js 16 (App Router, React 19, TypeScript) · PostgreSQL + Prisma · Auth.js (Credentials) · Tailwind v4 (CSS-first `@theme`) · déploiement Docker Compose (app + postgres + caddy).
- **Principe « ultra flexible »** : un **registre d'outils** (`src/tools/registry.ts`). Ajouter un outil = déposer un module + une entrée de registre → carte auto sur l'écran d'accueil.
- **Design system** : tokens en 3 étages (primitives → sémantique → Tailwind `@theme`). Aucun `#hex` en dur dans les composants ; on n'utilise que des utilitaires dérivés des tokens sémantiques. Reskin complet = éditer l'étage sémantique.
- **Entités partagées** : `Client`, `Chantier` (référentiel commun aux outils). La **base client** est centrale (voir « Base client & numéro Why » ci-dessous).
- Les 2 outils historiques (dans `existant/`) sont **réécrits** à la charte ; leur code sert de spec fonctionnelle.

### Base client & numéro Why (transverse à TOUS les outils)

La **base client** (`/clients`, `src/lib/clients/`) est le pivot de la plateforme : depuis la fiche d'un client, on retrouve **tout ce qui a été produit pour lui à travers tous les outils** (présents et futurs). Deux conventions s'appliquent donc à **chaque outil** :

1. **Rattachement au client** — l'entité principale de l'outil porte `clientId String?` (FK → `Client`, `onDelete: SetNull`) **en plus** du libellé dénormalisé `clientNom`. Au save, l'action de l'outil résout le nom saisi en id via `resoudreClientId(nom)` (`src/lib/clients/queries.ts`), qui **crée le client** au besoin (upsert par nom). Renommer un client resynchronise les `clientNom` liés.
2. **Numéro Why** — l'entité porte `numeroWhy String?` : la **référence de l'affaire / du chantier dans WhySoft** (notre CRM). Un document = une affaire Why. Champ éditable dans chaque éditeur, affiché en colonne sur les index et sur la fiche client.

**Agrégation multi-outils** — chaque outil expose `listerPourClient(clientId): Promise<ClientArtefact[]>` (dans son `queries.ts`) et l'enregistre dans `PROVIDERS` de `src/lib/clients/providers.ts`. La fiche client `/clients/[id]` compose tous les providers (triés par date). `ClientArtefact` (`src/lib/clients/types.ts`) = `{ id, titre, href, numeroWhy, updatedAt, resume }`.

> **Ajouter un futur outil à la base client** : (a) `clientId` + `numeroWhy` sur son entité (`schema.prisma`) ; (b) `resoudreClientId` + persistance `numeroWhy` dans son action de save ; (c) champ `numeroWhy` + combobox client dans son éditeur ; (d) `listerPourClient` dans son `queries.ts` ; (e) une ligne dans `PROVIDERS`. Rien d'autre — la fiche client le prend en compte automatiquement.
>
> **Idem pour la fiche Affaire** (2e pivot, [`docs/AFFAIRES.md`](docs/AFFAIRES.md)) : ajouter `chantierId` sur l'entité, résoudre via `resoudreChantierId(numeroWhy, clientId, nom)` au save, exporter `listerPourChantier`, et une ligne dans `PROVIDERS` de `src/lib/chantiers/providers.ts`.

## Domain glossary (needed to read the code)

- **GTB** — building management system. **E/S** = I/O (*entrées/sorties*). **automate** = controller. **module d'extension** = expansion module. **chantier** = worksite/project. **point** = a single I/O point.
- **I/O types**: `AI` (analog in), `DI` (digital in), `AO` (analog out), `DO` (digital out), `COM` (bus/communication — excluded from physical I/O totals).
- **Distech Controls ECLYPSE** controllers: `ECY-300/303/400/450/600/650/PTU/S1000E`. Some models have *integrated* I/O on the controller itself; others rely purely on extension modules.
- **`.gfx`** — a Distech Controls program file. It is a **ZIP archive of XML**, parsed with bundled JSZip + `DOMParser`.

## Les outils historiques (`existant/`)

`existant` ("existing") holds the legacy standalone tools — kept as functional spec while they are rewritten into the SaaS.

### `ListePts_GTB.html` — points-list editor ("Liste de Points GTB")
Editable table where each row is a **point** or a **section** header. A point has a name, free-text note, and per-type I/O counts. Features: client combobox backed by an embedded `DB` object (client list + point templates), drag-and-drop row reorder, insertable templates, live totals, and a **paginated A4 print/PDF view** (`buildPrintPages` etc.) with per-page subtotals and a grand total.
- State model: `rows = [{id, kind:'point'|'section', name, free, io:{AI,DI,AO,DO,COM}, sectionName}]`.
- Legacy persistence: `localStorage['gtb_listepts']`. Palette CSS de référence (voir `:root`) : `--brand-blue:#2b3a8f`, `--brand-orange:#ee7d1b`, couleurs E/S `--ai/#1f6feb --di/#b4690e --ao/#7b41c9 --do/#1a8a4a --com/#0d8c97`.

### `Affectation_ES_depuis_GFX.html` — I/O assignment generator ("Générateur E/S Distech depuis GFX")
The larger, more complex tool (~4 MB — inlined JSZip, Mozilla PDF.js, and hardware photos). It **imports a Distech `.gfx` program and/or an electrical-schematic PDF** and auto-generates the I/O assignment document.
- Two import pipelines, both entirely client-side:
  - **GFX** (`buildGfxModules`, `detectControllerFromGfxXml`, `inferModulesFromPointResources`, `normalizeGfxIntegratedArchitecture`, …): unzip → parse XML → detect controller model, integrated I/O, and extension modules.
  - **PDF** (`extractPdfModulePage`, `associatePdfLabels`, `detectPdfControllerModel`, `ptu*`/`ecy*ControllerPoints`, …): PDF.js text extraction with heavy geometric/positional heuristics to recover point labels and folio references from schematic drawings. This is the most heuristic, fragile part of the codebase.
- Hardware catalog: `CONTROLLER_CATALOG`, `MODULE_IMAGE_DATA`, `CONTROLLER_IMAGE_DATA` (base64 images) drive both the config UI and the printed diagrams.
- Tabbed SPA (`showTab`, `data-tab` = `dashboard|project|modules|inputs|outputs|tests|preview`) with a **commissioning/test tracker** (`buildTestReport`, per-point status + multi-line comments) and a **print preview** producing the full document (cover, controller page, one page per module).
- Central state: `project` + `MODULES`. Legacy persistence: `localStorage['affectation-es-distech-v25-reseaux-editables']`.

## Working in this codebase

- Keep UI strings and identifiers in **French** to match the surrounding code and the users.
- The `.gfx`/PDF parsing logic is worth preserving when rewriting — port it to TypeScript modules (`src/lib/`) rather than reinventing the heuristics.
- Le logo officiel est dans `logo/Logo FARENEIT DUMORTIER.png` (copié en `public/logo-dumortier.png`).

## Notes techniques (pièges des versions récentes)

- **Design system (charte)** : 3 étages — `src/styles/primitives.css` (les seuls #hex) → `src/styles/semantic.css` (rôles + thème sombre, override unique) → `src/app/globals.css` `@theme inline` (Tailwind v4). Les composants n'utilisent QUE des utilitaires sémantiques (`bg-brand`, `text-io-ai`, `border-border`…). Reskin = éditer l'étage sémantique.
- **Fil d'activité & attribution** : `Chantier`, `AffectationProjet`, `Note`, `Visite`, `WikiPage` portent `updatedById` = auteur de la dernière modification **humaine** (relations Prisma nommées `*Creee`/`*Modifiee`). Les server actions le posent dans le même `data` que l'écriture (donc atomique avec les gardes de version des notes/wiki) ; côté MCP, `brancherActeur()` (`mcp/data.mts`, branché par `mcp/server.mts`) fournit l'utilisateur du jeton. **Les écritures techniques n'y touchent pas** : synchro kDrive, propagation de dénormalisation (renommage client / modification d'affaire), réordonnancement de fratrie wiki, cascade de rubrique, scripts de backfill. Agrégé par `src/lib/activite/queries.ts` → carte « Activité récente » de l'accueil (repli sur `createdBy` pour les lignes antérieures).
- **Recherche globale (⌘K / Ctrl+K)** : palette montée une fois dans `src/app/(app)/layout.tsx` (`src/components/recherche/palette-recherche.tsx`) + bouton visible dans le header. Sources agrégées dans `src/lib/recherche/queries.ts` (affaires, clients, projets GTB, notes, visites, wiki), servies par `GET /api/recherche?q=`. Types client-safe dans `src/lib/recherche/types.ts` (la palette est un composant client : ne jamais lui faire importer `queries.ts`, qui est `server-only`). **Ajouter une source** = une entrée dans le `Promise.all` + une clé dans `LIBELLE_TYPE`/`ICONE`.
- **Registre d'outils** : `src/tools/registry.ts`. Ajouter une entrée = carte d'accueil + nav auto. Deux « rangements » possibles : `proprietaire: "<slug>"` → espace perso (`/perso/{slug}`, hors accueil/nav) ; `portee: "affaire"` → **outil d'affaire** (Projet GTB, Notes, Documents) : retiré de la sidebar ET de la grille d'accueil, on y entre par la fiche Affaire (qui porte le bouton de création). Sa route d'index reste vivante comme vue transverse/recherche. Sélecteurs : `TOOLS_NAV` (accueil + sidebar), `TOOLS_AFFAIRE` (outils d'affaire, exclus de l'agrégat « Autres réalisations » de la fiche Affaire).
- **Prisma 7** : générateur `prisma-client` → client dans `src/generated/prisma` (gitignoré, régénéré par `prisma generate` / `postinstall`). Importer `PrismaClient` depuis `@/generated/prisma/client`, les enums depuis `@/generated/prisma/enums`. **Connexion via adaptateur de driver** `@prisma/adapter-pg` : `new PrismaClient({ adapter })` (voir `src/lib/db.ts`) — pas de moteur binaire. `DATABASE_URL` est lu via `prisma.config.ts` (dotenv).
  - ⚠️ `prisma migrate dev` **ne régénère PAS** le client en Prisma 7 : lancer `npm run db:generate` après tout changement de schéma, puis **redémarrer `next dev`** (le serveur garde l'ancien client en mémoire → `prisma.<model>` undefined sinon).
- **Server actions** : l'ID d'action change à chaque recompile ; pour tester une action au curl, récupérer l'ID à jour (HTML pour les actions de form, chunk JS pour celles importées côté client), en-tête `Next-Action: <id>`, corps `Content-Type: text/plain` = `JSON.stringify([...args])`. Un ID périmé/inconnu est redirigé vers `/login` (piège de test, pas un bug).
- **Next 16** : la convention `middleware` est renommée **`proxy`** → `src/proxy.ts`. Sortie `output: "standalone"` pour Docker.
- **Auth.js v5** : split edge/Node — `src/auth.config.ts` (edge-safe, sans Prisma/bcrypt, utilisé par `proxy.ts`) + `src/auth.ts` (Node : provider Credentials + Prisma + bcrypt). Sessions JWT. Rôles `ADMIN`/`MEMBRE`. Seed admin : `npm run db:seed`.
- **Déploiement** : `Dockerfile` multi-stage (deps/builder/runner standalone), `docker-compose.yml` (postgres + migrate + app + caddy), `docker-compose.dev.yml` (postgres seul, port 5433). Détails dans `DEPLOIEMENT.md`.

@AGENTS.md
