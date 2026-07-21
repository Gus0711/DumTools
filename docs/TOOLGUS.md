# ToolGus — « espaces perso » & outil **Scanner**

> Doc de référence de la couche **espaces perso** (ToolGus) et de son premier
> outil, le **Scanner** (`/perso/gus/modems`), implémentés le 2026-07-16.
> À lire après [`ARCHITECTURE.md`](ARCHITECTURE.md).

## 1. L'idée en une phrase

Deux choses distinctes :

1. **Espaces perso** — un mécanisme pour ranger des **outils personnels** (les
   bricoles de chacun), **accessibles à toute l'équipe** mais **à l'écart** des
   outils métier, pour ne pas polluer l'accueil ni la navigation. Le premier
   espace est **ToolGus** (les outils de Gus).
2. **Scanner** — le premier outil de ToolGus : un **scanner universel de codes**
   (QR + codes-barres) qui alimente un **tableau partagé exportable**, reconnaît
   en plus les **modems Teltonika (RUT…)** pour en extraire les infos matériel,
   et permet de **grouper / rattacher / rechercher / filtrer** les scans.

## 2. Décisions structurantes (validées avec Augustin)

| Sujet | Décision |
|---|---|
| Pourquoi un espace perso | « ToolGus, mais tout le monde a accès, et ensuite chacun pourrait avoir le sien » → modèle **multi-propriétaire** dès le départ |
| Point d'entrée | **Carte sur l'accueil → page dédiée** `/perso/{slug}`. **Pas** d'item dans la sidebar (volontaire, anti-pollution) |
| Autonomie des outils perso | **Pas** inscrits dans `PROVIDERS` → n'apparaissent **pas** dans l'agrégation affaire/client |
| Portée du scan | **Universel** : QR + codes-barres, avec **reconnaissance modem** en bonus |
| Persistance | **Serveur, partagée** à toute l'équipe (table Postgres) |
| Regroupement | **Affaire** (`chantierId`) **ET/OU** groupe libre (`groupe`) — cf. §6 |
| Visible sur la fiche affaire ? | **Non (pour l'instant)** — rattachement visible seulement dans le Scanner. Intégration `PROVIDERS` = évolution possible |
| Moteur caméra | **`BarcodeDetector` natif** en priorité (Android), **ZXing** en repli (iOS) — cf. §5 |

## 3. Espaces perso — l'architecture

Tout part du **registre d'outils** `src/tools/registry.ts` (source de vérité de la
plateforme).

### 3.1 Le champ `proprietaire`

```ts
export interface Tool {
  // …
  /** Espace perso propriétaire (slug). undefined = outil métier « cœur ». */
  proprietaire?: string;
}
```

- `proprietaire` **absent** → outil **cœur** : carte d'accueil + item de sidebar (comportement historique).
- `proprietaire: "gus"` → rangé dans l'espace `/perso/gus`, **hors** accueil/sidebar.

### 3.2 Le registre des espaces

```ts
export interface EspacePerso { slug: string; nom: string; description: string; icon: LucideIcon; }
export const ESPACES_PERSO: EspacePerso[] = [
  { slug: "gus", nom: "ToolGus", description: "…", icon: FlaskConical },
];
```

Helpers exportés : `getEspacePerso(slug)`, `TOOLS_COEUR` (outils sans
propriétaire), `toolsDeProprietaire(slug)`, `espacesPersoActifs()` (espaces
ayant ≥ 1 outil — n'affiche pas un espace vide).

### 3.3 Où c'est consommé

| Endroit | Fichier | Comportement |
|---|---|---|
| Accueil — grille | `src/app/(app)/page.tsx` | grille = `TOOLS_COEUR` ; section « Espaces perso » = `espacesPersoActifs()` → `EspacePersoCard` |
| Carte d'espace | `src/components/espace-perso-card.tsx` | tuile → `/perso/{slug}` |
| Sidebar | `src/components/app-shell/sidebar.tsx` | `TOOLS_COEUR` uniquement (perso volontairement absent) |
| Landing perso | `src/app/(app)/perso/[qui]/page.tsx` | route **dynamique** : liste les outils de `qui` (`ToolCard`), 404 si slug inconnu |
| Page d'outil | `src/app/(app)/perso/[qui]/modems/page.tsx` | garde : 404 si `getTool("scan-modems").proprietaire !== qui` |

### 3.4 Recettes

**Ajouter une personne** → une entrée dans `ESPACES_PERSO`. Sa page `/perso/{slug}`
et sa carte d'accueil apparaissent dès qu'elle a ≥ 1 outil.

**Ajouter un outil perso** → une entrée de registre avec `proprietaire: "<slug>"`
+ sa page sous `src/app/(app)/perso/[qui]/…`. Ne **pas** l'inscrire dans
`PROVIDERS` (il reste autonome).

## 4. Modèle de données (`prisma/schema.prisma`)

Modèle **`ModemScan`** (nom interne historique ; l'outil est « Scanner » côté
UI). **Autonome** : pas de `numeroWhy`/`clientId` dénormalisés, juste un
rattachement optionnel à l'affaire.

| Champ | Rôle |
|---|---|
| `raw` | Contenu brut du code scanné (= « Contenu ») |
| `format` | Symbologie (`qr_code`, `ean_13`, `code_128`…) ; `null` = saisi/inconnu |
| `ssid`,`serie`,`imei`,`mac`,`wifiPass`,`adminUser`,`adminPass`,`lot`,`wifiType` | Infos modem extraites du QR `WIFI:` (cf. §5.1) — `lot` = **lot de fabrication** (clé `B`) |
| `note` | Note libre éditable |
| `chantierId` → `Chantier?` (`onDelete: SetNull`) | Rattachement **affaire** (regroupement) |
| `groupe` | Regroupement libre (ex. « sonde bureau1 ») — **≠ `lot`** |
| `createdById` → `User?`, `createdAt`, `updatedAt` | Traçabilité |

> ⚠️ Le champ de regroupement libre s'appelle **`groupe`** (labellisé « Groupe »
> en UI) et **non `lot`**, car `lot` est déjà pris par le **lot de fabrication**
> du modem (clé `B` du QR).

**Migrations** (dans l'ordre) :
- `20260716131421_toolgus_scan_modems` — modèle de base ;
- `20260716143239_scan_format_generique` — ajout `format` (scan universel) ;
- `20260716144703_scan_rattachement_affaire_groupe` — ajout `chantierId` + `groupe`.

Relation inverse `scans ModemScan[]` sur `Chantier` (nécessaire à Prisma ; pas
utilisée pour l'instant côté fiche affaire).

## 5. Le Scanner (`src/tools/modems/`)

- `model.ts` — **client-safe** : `parseModemQr`, `estModem`, `formatLabel`,
  `CHAMPS_MODEM`, `FORMAT_LABEL`.
- `queries.ts` — `listerScansModem()` (serveur), joint l'affaire.
- `actions.ts` — server actions (§6.3).
- `scan-modems.tsx` — le composant client (caméra, tableau, sélection, filtres).

### 5.1 Parsing modem (QR Teltonika)

Le QR d'un RUT est au format WiFi standard **`WIFI:`** enrichi :

```
WIFI:T:WPA;S:RUT241_8763;P:Wy7x8N5E;SN:6008788429;I:864431069252361;M:209727AE8761;U:admin;PW:Dz8+^Pc9;B:048;
```

| Clé | Champ | Clé | Champ |
|---|---|---|---|
| `S` | SSID (réseau) | `M` | MAC |
| `P` | mot de passe WiFi | `U` | identifiant admin |
| `SN` | n° de série | `PW` | mot de passe admin |
| `I` | IMEI | `B` | lot de fabrication |
| `T` | type WiFi | | |

`parseModemQr` est **tolérant** (préfixe `WIFI:` optionnel, clés dans tout ordre,
échappement `\` du format MECARD/WiFi géré). `estModem(info)` = vrai si un
**identifiant matériel** est présent (`serie` OU `imei` OU `mac`) — un simple QR
WiFi (SSID + pass sans série) est donc traité comme code **générique**.

### 5.2 Scan universel

Lit **QR + codes-barres** : EAN-13/8, UPC-A/E, Code 128/39/93, ITF, Codabar,
DataMatrix, Aztec, PDF417 (selon le support de l'appareil). Chaque scan stocke
`raw` (contenu) + `format` (type). Colonne **Type** dans le tableau : badge
`Modem` (si `estModem`) ou la symbologie.

### 5.3 Moteur caméra (le point fragile)

Deux moteurs, sélectionnés à chaud dans `demarrer()` :

1. **`BarcodeDetector` natif** (Android/Chrome) — prioritaire. On interroge
   `getSupportedFormats()` et on passe **tous** les formats. Boucle de détection
   `setTimeout` throttlée (~120 ms).
2. **ZXing** (`@zxing/browser` `BrowserMultiFormatReader` + `@zxing/library` pour
   le nom de format) — repli iOS Safari / navigateurs sans BarcodeDetector.
   `decodeFromStream` sur le flux existant.

Réglages **indispensables** (un QR modem est **dense**) :
- **Haute résolution** : `getUserMedia` avec `width/height ideal 1920×1080`
  (le 640×480 par défaut rendait le QR illisible — bug corrigé) ;
- **Caméra arrière** (`facingMode: environment`), **autofocus continu** si dispo ;
- **Grand cadre** de visée + consigne « approche pour remplir le cadre » ;
- **Lampe torche** (bouton, si `track.getCapabilities().torch`) ;
- indicateur **moteur + résolution** sous la vidéo (diagnostic).

Prérequis : **HTTPS** (OK via le tunnel Cloudflare) + permission caméra.
Repli universel : champ **« coller le contenu d'un code »** (desktop / secours).

### 5.4 Anti-doublon & robustesse

- **Cooldown** : le même code re-décodé en boucle est ignoré pendant 3 s.
- **Dédup persistante** : modem → même `serie`/`imei` ; générique → même `raw`.
- **Enregistrement optimiste** : la ligne apparaît immédiatement (statut
  `en-cours`), puis `ok`/`echec` selon la server action ; bouton **réessayer**
  sur échec. Bip + vibration + flash (vert = ajouté, orange = doublon).

## 6. Regroupement & rattachement

Deux mécanismes **indépendants** de rattachement (affaire ET/OU groupe).

### 6.1 Contexte de pré-scan (« scanner 10 sondes dans une affaire »)

Barre **« Rattacher les prochains scans à : [affaire] [groupe] »** au-dessus de
la caméra. Lue via une **ref** (`ctxRef`) → chaque **nouveau** scan hérite du
contexte courant (fonctionne même si on change le contexte en plein scan).

### 6.2 Sélection multiple + actions groupées

- **Cases à cocher** par ligne + **« tout sélectionner »** (agit sur la vue
  **filtrée**).
- Barre d'actions (dès ≥ 1 sélectionné), **auto-suffisante** :
  - **Rattacher à : [affaire] [groupe]** — champs **dans la barre** (c'était le
    piège initial : le bouton était grisé tant que la barre du haut n'était pas
    remplie). **Patch partiel** : un champ laissé vide **ne touche pas** la valeur
    existante (mettre un groupe sans effacer l'affaire).
  - **Détacher** (vide affaire + groupe), **Exporter** (la sélection),
    **Supprimer** (avec confirmation).

### 6.3 Server actions (`actions.ts`)

| Action | Rôle |
|---|---|
| `enregistrerScanModem(raw, format?, chantierId?, groupe?)` | crée un scan |
| `assignerScans(ids, patch)` | `patch = { chantierId?, groupe? }` — **partiel** : champ absent = inchangé, `null` = vidé |
| `supprimerScans(ids)` | suppression en lot |
| `majNoteScanModem(id, note)` | note libre |

## 7. Recherche & filtres

Toute la liste étant chargée côté client, tout est **instantané** (pas d'appel
serveur).

- **Recherche texte** (`texteRecherche`) : contenu, SSID, série, IMEI, MAC, pass
  WiFi, identifiants, lot, groupe, nom d'affaire, n° Why, note, type.
- **Filtres** (combinés en ET) : **Affaire** (Toutes / Sans affaire / une
  précise), **Groupe** (Tous / Sans groupe / un précis), **Type** (Modem / QR /
  EAN-13 / …). Chaque select n'apparaît que si des valeurs existent.
- **Réinitialiser** + compteur « X **sur** N » quand filtré.
- **Sélection/Export/Copier agissent sur la vue filtrée** → filtrer un groupe →
  tout sélectionner → exporter = export du groupe seul.

## 8. Export

- **Export CSV** — séparateur `;` + BOM (ouverture directe Excel FR). Colonnes :
  Type, Contenu, tous les champs modem, **Groupe, Affaire, N° Why**, Note,
  Scanné le, Par.
- **Copier** — même contenu en **TSV** (collage direct dans un tableur).
- Les deux portent sur la **vue filtrée** (ou la sélection via « Exporter »).

## 9. Dépendances ajoutées

`@zxing/browser` (+ sa dépendance `@zxing/library`, importée directement pour le
nom de symbologie). `BarcodeDetector` est natif (aucune dépendance).

## 10. Reste à faire / pistes

- **Fiche affaire** : section « Matériel scanné » sur `/affaires/[id]`
  (intégration `PROVIDERS` — volontairement reportée).
- Tri par colonne, filtres **par date / par auteur**.
- Renommage éventuel des identifiants internes (`modems`, `ModemScan`,
  `scan-modems`) — purement cosmétique, sans impact utilisateur.
