# Outil « Notes » — documents riches d'affaire (type Notion/Coda)

> Doc de référence de l'outil **Notes** (`/outils/notes`), implémenté le
> 2026-07-15. À lire après [`ARCHITECTURE.md`](ARCHITECTURE.md) et
> [`AFFAIRES.md`](AFFAIRES.md).

## 1. L'idée en une phrase

Des **notes riches rattachées aux affaires** — texte structuré, **tables de
données typées** (esprit Coda), images, fichiers, code, **pages HTML
embarquées** — éditées en blocs façon Notion, **imprimables**, **exportables**
(PDF, kDrive, Markdown) et **partageables par lien public** en lecture seule.

C'est un outil satellite standard de la plateforme : il suit la recette
d'intégration d'[`AFFAIRES.md`](AFFAIRES.md) §3 (registre, `chantierId`,
providers) — une note apparaît donc automatiquement sur la fiche affaire
(section dédiée + Réalisations) et la fiche client.

## 2. Décisions structurantes (validées avec Augustin)

| Sujet | Décision |
|---|---|
| Éditeur | **BlockNote** (cœur MPL-2.0 ; les packages « XL » GPL/payants sont exclus) |
| Tables | bloc custom « **table de données** » typée — pas de formules/relations en v1 |
| Collaboration | **autosave débouncé + anti-collision par version** (pas de temps réel Yjs) |
| Portée | **affaire d'abord (strict)** — une note naît depuis la fiche affaire, jamais orpheline |
| Partage | **lien public par jeton** `/n/[jeton]`, fonctionnel pour des externes (l'app est exposée via le tunnel Cloudflare) |
| Médias | patron **disque VM** des Visites (`NoteMedia` + `NOTES_MEDIA_DIR`), pas le spool kDrive |

## 3. Modèle de données (`prisma/schema.prisma`)

- **`Note`** — `titre`, `contenu Json` (document BlockNote = tableau de blocs),
  **`version Int`** (anti-collision), **`jetonPartage String? @unique`**
  (partage public, null = privée), `chantierId` **obligatoire** (Cascade),
  `clientId`/`numeroWhy` dénormalisés (providers), `createdById`.
- **`NoteMedia`** — `id` = **UUID client** (upload idempotent), `nom`,
  `mimeType`, `taille`, `fichier` (chemin du binaire sur la VM). Binaire hors
  `public/`, servi par routes dédiées (voir §6).

Convention JSON-in-Postgres habituelle : le serveur stocke le document tel
quel (`unknown[]`), seul l'éditeur (qui possède le schéma) le type.

## 4. L'éditeur (`src/tools/notes/`)

- **BlockNote 0.51** + thème Mantine, locale **française**, schéma custom
  (`blocs/schema.tsx`) : blocs standard (titres, listes, todo, tableaux riches,
  images, fichiers, vidéo/audio) + **code avec coloration** (`@blocknote/code-block`)
  + 3 blocs métier :
  - **`tableDonnees`** (`blocs/table-donnees.tsx`) — colonnes typées
    (texte/nombre/date/case/choix/URL), tri par en-tête, filtre, totaux Σ des
    colonnes nombre. Données JSON dans les props du bloc (elles voyagent avec
    la note). Tri/filtre = état local d'affichage, jamais persisté.
  - **`embedHtml`** (`blocs/embed-html.tsx`) — HTML collé, rendu dans une
    iframe **`sandbox="allow-scripts"`** (jamais `allow-same-origin` : origine
    opaque, pas d'accès aux cookies ni à l'API — indispensable pour le partage
    public).
  - **`lienCarte`** (`blocs/lien-carte.tsx`) — carte cliquable : URL externe
    ou **document GED de la même affaire** (liste fournie par
    `blocs/contexte.tsx`). Le lien GED reste authentifié : visible dans une
    note publique, mais fichier réservé aux connectés (volontaire).
- Le menu **`/`** ajoute les 3 blocs métier au groupe « DumTools »
  (`itemsMenuSlash`). Il inclut aussi le **saut de page** (opt-in BlockNote
  `withPageBreak`, inséré DANS le groupe « Blocs de base » — ajouté en fin de
  liste il créerait un 2e en-tête de groupe) : pointillés à l'écran,
  `page-break-after` à l'impression (pointillés masqués en print, notes.css).
- **Locale ajustée** (`dictionnaireNotes`, schema.tsx) : le trait horizontal
  est renommé « **Séparateur** » avec alias fr (BlockNote dit « Diviseur »,
  alias sans « séparateur » → introuvable au clavier), et les groupes
  « Médias »/« Média » de la locale fr d'origine sont fusionnés. Utilisée par
  l'éditeur ET la lecture.
- **Chrome de l'éditeur** (refonte UX 2026-07-16) : barre **sticky** (fil
  d'ariane affaire/client/n° Why, état de sauvegarde horodaté, actions), titre
  en **textarea auto-dimensionné** (`Entrée`/`↓` → focus du document, note
  fraîche = titre présélectionné), ligne méta auteur/date, **suppression en
  deux temps** dans le menu « ⋯ » (plus de `confirm()` natif).
- **Sommaire flottant** (`sommaire.tsx`) : rail de mini-barres à droite
  (≥ 1280px, ≥ 2 titres) qui se déploie au survol/focus en table des matières
  cliquable ; section active suivie au défilement (le scroll est sur `<main>`
  → écouteur en capture) ; navigation par `scrollIntoView` sur
  `.bn-block-outer[data-id]` + `scroll-margin-top` (notes.css).
- BlockNote est **client-only** : `editeur.tsx` (et `lecture.tsx`) sont des
  wrappers `next/dynamic` `ssr: false` autour de `editeur-impl.tsx` /
  `lecture-impl.tsx`.
- Thème : `theme.ts` observe `data-theme` (même système que `ThemeToggle`) ;
  `notes.css` re-pointe les variables `--bn-*` vers les tokens sémantiques
  (aucun `#hex` hors zones print).

### ⚠️ Pièges BlockNote appris à la dure

- Ne **jamais rendre de balises `<table>/<td>/<th>`** dans un bloc custom :
  l'extension « poignées de tableau » de BlockNote s'accroche aux TD/TH du DOM
  et suppose ensuite que le bloc est un tableau BlockNote (`block.content.rows`
  → `TypeError` au survol). Le bloc `tableDonnees` est donc rendu en **grille
  CSS** (divs + `role="table"`).
- Un menu contextuel dans un bloc qui vit dans un conteneur `overflow-x-auto`
  (la table) est **rogné** s'il est `absolute` : le menu d'options de colonne
  est rendu en **portal `document.body`** (position fixe, bascule au-dessus de
  l'ancre près du bas d'écran, fermé par clic dehors/Échap/défilement).
- Le menu « / » du thème Mantine n'a **ni hauteur max ni overflow** : en bas de
  page il débordait de l'écran sans défiler. Règle globale dans `notes.css`
  (`.bn-suggestion-menu { max-height + overflow-y }`) — non scopée car le menu
  est portalé dans `<body>`, hors `.note-doc`.
- Les blocs BlockNote portent des **`undefined` dans des tableaux JS** (ex.
  `columnWidths` des tableaux intégrés). Les server actions Next les
  **préservent** et Prisma les refuse en JSON (« Can not use undefined value
  within array ») → un tableau intégré rendait la note insauvable (500,
  « Non enregistré »). Toute écriture de `contenu` passe par
  `JSON.parse(JSON.stringify(...))` (normalise en `null`, forme native) —
  fait dans `sauverNote` (web) ET `markdownVersBlocs` (MCP).

## 5. Autosave & anti-collision

- Autosave **débouncé 700 ms** (patron Projet GTB), état discret quand tout va
  bien (« Enregistré · 14:32 »), voyant quand ça casse (« Non enregistré » est
  un bouton **Réessayer** ; Conflit en rouge).
- **Filets anti-perte** : `Ctrl+S` force la sauvegarde immédiate ; un onglet
  qui passe en arrière-plan (`visibilitychange`/`pagehide`) vide le debounce
  en cours ; fermer avec des modifs non écrites déclenche l'avertissement
  natif (`beforeunload`). **Une seule sauvegarde en vol** (garde `enVolRef`) :
  deux saves concurrents sur la même version de base concluraient à tort à un
  conflit.
- `sauverNote(id, { titre, contenu, versionBase })` fait un
  `updateMany({ where: { id, version: versionBase } })` : si la version en base
  a bougé (un collègue a sauvé), **rien n'est écrit**, l'éditeur affiche une
  bannière « modifiée par quelqu'un d'autre » et **cesse d'écraser** jusqu'au
  rechargement. Pas d'écrasement silencieux, dans les deux sens.
- Au save réussi : **purge des médias orphelins** (plus référencés par le
  document, avec un délai de grâce de 5 min pour la course upload/autosave).

## 6. Médias

- Upload : `POST /api/notes/media` (authentifié, idempotent par UUID,
  max 50 Mo) → binaire écrit dans **`NOTES_MEDIA_DIR`** (défaut
  `.notes-media/`), ligne `NoteMedia`.
- Service authentifié : `GET /api/notes/media/[id]` (cache privé long,
  immuable par UUID).
- Service **public** : `GET /api/public/notes/[jeton]/media/[id]` — vérifie que
  le média appartient à **LA** note de ce jeton (un jeton ne donne jamais accès
  aux médias d'une autre note). Cache court (révocation rapide).
- Le document stocke l'URL **canonique** (`/api/notes/media/…`) ; la page
  publique réécrit vers la route à jeton (`reecrireMediasPublics`).

## 7. Partage public `/n/[jeton]`

- **La seule route applicative sans session** — exclusions `n/` et
  `api/public/` dans le matcher de `src/proxy.ts` (⚠️ l'app étant exposée sur
  internet, tout ajout au matcher est public monde entier).
- Jeton **24 octets aléatoires base64url**, posé/révoqué depuis l'éditeur
  (bouton Partager → lien copiable / Révoquer → le lien meurt aussitôt).
- La page charge **par jeton uniquement** (jamais par id), rend en **lecture
  seule** (même schéma → rendu identique à l'éditeur), `robots: noindex`.

## 8. Impression & exports (aperçu `/outils/notes/[id]/apercu`)

- **Imprimer** : patron `.print-root` global + feuille A4 portrait
  (`.note-print .note-sheet`, en-tête titre + client/affaire/n° Why/date).
  À l'écran : feuille sur fond atelier (comme l'aperçu affectation).
- **PDF** : `pdf-note.ts` — capture `html2canvas-pro` découpée en pages A4
  (`jsPDF`), imports dynamiques. *Limite : les iframes (HTML embarqué) ne sont
  pas capturées — pour ces blocs, passer par Imprimer.*
- **Sauvegarder sur kDrive** : réutilise `BoutonSauvegardeKdrive` (dépôt GED
  « Documentation », versionné, synchro immédiate).
- **Markdown** : convertisseurs du cœur BlockNote (`blocksToMarkdownLossy`,
  éditeur headless) — les blocs métier sont ignorés (lossy).

## 9. Fichiers clés

```
src/tools/notes/
  model.ts             types client-safe (TableDonnees, médias, résumé, réécriture URLs publiques)
  queries.ts           listerNotes/-Affaire, getNote, getNotePublique (par jeton), providers
  actions.ts           creerNotePourAffaire, sauverNote (anti-collision), jeton partage, suppression
  stockage.ts          binaires sur disque VM (env NOTES_MEDIA_DIR, défaut .notes-media/)
  editeur[-impl].tsx   éditeur BlockNote (dynamic ssr:false) + chrome sticky + autosave/filets + menu ⋯
  sommaire.tsx         sommaire flottant (rail minimap → TOC au survol, section active)
  index-notes.tsx      index client : recherche instantanée, résumés, dates relatives, mode cartes
  lecture[-impl].tsx   rendu lecture seule (aperçu + page publique)
  apercu-note.tsx      aperçu A4 (barre sticky) + boutons Markdown/PDF/kDrive/Imprimer
  partage.tsx          popover lien public (statut, copier, ouvrir, révocation en 2 temps)
  boutons.tsx          « Nouvelle note » (réutilise SelecteurAffaire)
  pdf-note.ts          export PDF raster paginé
  notes.css            thème BlockNote → tokens sémantiques + rythme typo + CSS print + anims
  blocs/               schema.tsx, table-donnees.tsx, embed-html.tsx, lien-carte.tsx, contexte.tsx
src/app/(app)/outils/notes/            index + [id] (éditeur) + [id]/apercu
src/app/n/[jeton]/page.tsx             page publique (hors shell, sans session)
src/app/api/notes/media/               upload + service authentifié
src/app/api/public/notes/[jeton]/media/[id]/   service public scopé au jeton
prisma/migrations/20260715180048_outil_notes/
```

## 9 bis. Accès MCP (pour les IA)

Le serveur MCP DumTools (`mcp/`) expose l'outil : `dumtools_list_notes`,
`dumtools_get_note`, `dumtools_create_note`, `dumtools_update_note`,
`dumtools_share_note`, `dumtools_delete_note` — et `dumtools_get_affaire`
liste les notes de l'affaire. Le contenu s'échange en **markdown**
(conversion `mcp/notes-markdown.mts`, via `@blocknote/server-util`) : blocs
métier rendus en équivalents à la lecture ; à l'écriture le markdown devient
des blocs standard. Le bloc **saut de page** est ignoré à la conversion (pas
d'équivalent markdown, et le schéma standard du `ServerBlockNoteEditor` ne le
connaît pas — il ferait planter `blocksToMarkdownLossy`). `update_note`
remplace tout le contenu, avec la même anti-collision par version que
l'éditeur. Détails : `mcp/README.md`.

## 10. Config déploiement à ne pas oublier

- **`NOTES_MEDIA_DIR`** (et `VISITES_MEDIA_DIR`) : câblés dans
  `docker-compose.yml` sur des **volumes persistants** (`notes_media`,
  `visites_media`). À inclure dans la sauvegarde avec Postgres.
- Rituel Prisma 7 : après pull de la migration → `npm run db:generate` +
  **redémarrer** `next dev`.

## 11. Vérifié (E2E Playwright, 2026-07-15 ; refonte UX re-vérifiée 2026-07-16)

Refonte UX (2026-07-16, notes jetables supprimées après test) : autofocus +
présélection du titre d'une note fraîche → `Entrée` descend dans le document →
autosave → sommaire flottant (déploiement, navigation) → `Ctrl+S` → partage
(création, lecture publique sans session, révocation en 2 temps) → aperçu →
recherche de l'index (desktop + cartes mobile) → suppression en 2 temps →
thème sombre et largeur téléphone. Console propre partout. Parcours d'origine :

Login → création depuis la fiche affaire → autosave + persistance →
insertion table de données + édition de cellule → bloc HTML embarqué
(JS exécuté dans la sandbox) → lien public créé et lisible **sans cookie**
(lecture seule, 404 sur jeton invalide) → **conflit de version** détecté
(bannière, écriture stoppée) → aperçu A4 → upload média + service authentifié
(401/redirect sans session) + service public scopé au jeton (404 mauvais
jeton). Console navigateur propre.

## 12. Limites connues / envies pour plus tard

- Table de données : pas de **formules**, relations inter-tables ni vues
  multiples (le « Coda complet » écarté en v1).
- PDF raster (pas vectoriel) et sans les iframes — l'impression navigateur
  reste la voie fidèle.
- Marqueur kDrive de l'aperçu non persisté (l'état « Sur kDrive » repart à
  zéro au rechargement ; le dépôt versionne côté kDrive de toute façon).
- Pas de mode hors-ligne (réutiliser le kit `src/lib/offline/` si le besoin
  terrain apparaît).
- Suppression de note sans corbeille (confirmation simple).
