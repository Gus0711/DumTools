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
| `scanneLe` | Horodatage du scan **sur l'appareil** — axe de classement jour/semaine/mois/année (§7.1) |
| `photos` → `ScanPhoto[]` | Photos rattachées (§9) |
| `createdById` → `User?`, `createdAt`, `updatedAt` | Traçabilité (`createdAt` = écriture en base, ≠ `scanneLe`) |

> ⚠️ Le champ de regroupement libre s'appelle **`groupe`** (labellisé « Groupe »
> en UI) et **non `lot`**, car `lot` est déjà pris par le **lot de fabrication**
> du modem (clé `B` du QR).

**Migrations** (dans l'ordre) :
- `20260716131421_toolgus_scan_modems` — modèle de base ;
- `20260716143239_scan_format_generique` — ajout `format` (scan universel) ;
- `20260716144703_scan_rattachement_affaire_groupe` — ajout `chantierId` + `groupe` ;
- `20260728123559_scan_horodatage_appareil` — ajout `scanneLe` + backfill +
  index `[scanneLe]` / `[chantierId, scanneLe]` (⚠️ dérive Prisma/wiki, cf. §7.1) ;
- `20260728130640_scan_photos` — table `ScanPhoto` (⚠️ **même dérive**, cf. §7.1).

Relation inverse `scans ModemScan[]` sur `Chantier`, désormais exploitée par le
bloc « Scans » de la fiche affaire (§8.1).

## 5. Le Scanner (`src/tools/modems/`)

- `model.ts` — **client-safe** : `parseModemQr`, `estModem`, `formatLabel`,
  `CHAMPS_MODEM`, `FORMAT_LABEL`.
- `periodes.ts` — **client-safe** : découpage jour/semaine ISO/mois/année et
  construction de l'arbre (§7.2).
- `export.ts` — **client-safe** : colonnes, CSV, TSV (§8).
- `queries.ts` — `listerScansModem()` et `listerScansAffaire(chantierId)`
  (serveur), joignent l'affaire.
- `actions.ts` — server actions (§6.3).
- `scan-modems.tsx` — le composant client (caméra, tableau groupé, sélection,
  filtres).
- `arbre-periodes.tsx` — le navigateur temporel (§7.3).
- `scans-affaire.tsx` — le bloc de la fiche affaire (§8.1).
- `photos.tsx` — capture, vignettes, visionneuse (§9).
- `stockage.ts` — écriture/lecture/suppression des binaires sur disque (§9).

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
| `enregistrerScanModem(raw, format?, chantierId?, groupe?, scanneLeIso?)` | crée un scan ; renvoie `{ id, scanneLe }` (cf. §7.1) |
| `assignerScans(ids, patch)` | `patch = { chantierId?, groupe? }` — **partiel** : champ absent = inchangé, `null` = vidé |
| `supprimerScans(ids)` | suppression en lot |
| `majNoteScanModem(id, note)` | note libre |

## 7. Recherche & filtres

Toute la liste étant chargée côté client, tout est **instantané** (pas d'appel
serveur).

- **Recherche texte** (`texteRecherche`) : contenu, SSID, série, IMEI, MAC, pass
  WiFi, identifiants, lot, groupe, nom d'affaire, n° Why, note, type.
- **Filtres** (combinés en ET) : **Période** (§7.2), **Affaire** (Toutes / Sans
  affaire / une précise), **Groupe** (Tous / Sans groupe / un précis), **Type**
  (Modem / QR / EAN-13 / …). Chaque select n'apparaît que si des valeurs
  existent.
- **Réinitialiser** + compteur « X **sur** N » quand filtré.
- **Sélection/Export/Copier agissent sur la vue filtrée** → filtrer un groupe →
  tout sélectionner → exporter = export du groupe seul.

## 7.1 L'axe temporel — `scanneLe` (et pas `createdAt`)

`ModemScan.scanneLe` est l'horodatage du scan **sur l'appareil** ; `createdAt`
reste l'écriture en base. Les deux divergent dès qu'un enregistrement échoue et
qu'on le relance (bouton « Réessayer »), ou le jour où l'on ajoutera la saisie
hors-ligne : sans ce champ, un scan du mardi soir réenregistré le mercredi
matin changerait de jour dans tous les regroupements.

- Le client envoie son heure ; le serveur la **valide** (`horodatageSain`) et
  retombe sur l'heure serveur si elle est hors de `[-365 j, +10 min]` — une
  tablette à l'horloge déréglée ne doit pas polluer l'arbre de tout le monde.
  L'action renvoie le `scanneLe` retenu, que le client réapplique.
- Tri, affichage, regroupement et export s'appuient tous dessus.
- Migration `20260728123559_scan_horodatage_appareil` : ajout + backfill
  `scanneLe = createdAt` + index `[scanneLe]` et `[chantierId, scanneLe]`.

> ⚠️ **Piège rencontré** : `prisma migrate dev --create-only` a glissé dans
> cette migration un `DROP INDEX "WikiPage_recherche_idx"` et un
> `ALTER ... "recherche" DROP DEFAULT`. C'est de la **dérive** — la colonne
> tsvector générée et son index GIN sont posés en SQL brut par la migration
> `outil_wiki`, que le schéma Prisma ne sait pas décrire. Ces lignes ont été
> retirées à la main ; les appliquer **casse la recherche plein-texte du wiki**.
> À revérifier à chaque future migration touchant au schéma.

## 7.2 Découpage temporel (`periodes.ts`)

Jour / semaine ISO / mois / année sont **dérivés**, jamais stockés (les figer en
colonnes les ferait rancir au premier changement de fuseau). Trois partis pris,
qui sont exactement les trois façons de se tromper sur des dates :

1. **Tout en heure locale** — jamais `toISOString()`, qui ferait basculer un
   scan de 23h30 CEST au lendemain en UTC.
2. **Semaine ISO-8601** — lundi → dimanche, et **année ISO ≠ année civile**
   (le 29/12/2025 est en `2026-S01`, le 01/01/2021 en `2020-S53`).
3. **Arbre construit bottom-up depuis les jours** — une semaine à cheval sur
   deux mois (S31 = 27 juil. → 2 août) est **découpée** entre juillet et août,
   avec le libellé de son étendue réelle (« 27 → 31 juil. »). Invariant : le
   total d'un nœud est **toujours** la somme de ses enfants.

Couvert par des assertions (cas de bascule d'année, invariant de somme) —
rejouables via un script `tsx` important le module.

## 7.3 Navigation & regroupement (l'UI)

Deux contrôles **orthogonaux**, et c'est le point de la refonte :

| | Rôle | Composant |
|---|---|---|
| **Sélecteur de période** | *quelles* lignes (filtre) | `arbre-periodes.tsx` → `SelecteurPeriode` : un bouton dans la barre de filtres, popover contenant l'arbre |
| **« Grouper par »** | *comment* elles s'empilent (affichage) | segmented control : Jour · Semaine · Mois · Année · **Affaire** · **Groupe** · Aucun |

- L'arbre affiche Année ▸ Mois ▸ Semaine ▸ Jour avec compteurs ; un clic filtre
  sur les **clés jour** du nœud (pas une plage de dates : aucun piège de
  bornes/heure d'été).
- **Pourquoi un popover et pas un rail latéral** : la première version mettait
  l'arbre en colonne de gauche. Sur PC, elle prenait 15 rem de large à un
  tableau qui a déjà quatorze colonnes — mauvais arbitrage, puisqu'on ne change
  de période que quelques fois par session. Le bouton **porte la période
  active** (avec une croix pour la lever), donc rien n'est perdu en lisibilité,
  et la même implantation marche au doigt comme à la souris — plus de repli
  mobile à gérer. Le popover se ferme au clic extérieur et à Échap ; l'export
  d'un nœud ne le ferme pas, pour enchaîner plusieurs périodes.
- Le libellé du bouton est **autonome** (`libelleComplet`) : dans l'arbre,
  « Juillet » ou « Lun. 28 » se lisent grâce au parent ; seuls, ils sont
  ambigus — on redonne l'année et le mois.
- Les filtres se **composent** : l'arbre se construit sur la vue déjà filtrée
  par affaire/groupe/type/recherche (« quand a-t-on scanné pour ce chantier ? »),
  et l'export d'un nœud réapplique ces mêmes filtres.
- Le tableau est **une seule `<table>`** avec un `<tbody>` par groupe, en-tête de
  groupe en `<td colSpan>` portant la classe `cell-card-title` (nécessaire pour
  que le mode cartes mobile ne lui colle pas de libellé ni ne l'aligne à droite).
  Chaque en-tête porte : compteur, nb de modems, **sélectionner / copier /
  exporter ce groupe**.

## 8. Export

- **Export CSV** — séparateur `;` + BOM (ouverture directe Excel FR). La date est
  **éclatée en six colonnes** — `Date` (28/07/2026), `Heure`, `Jour` (mardi),
  `Semaine` (2026-S31), `Mois` (2026-07), `Année` — pour servir directement
  d'axes de **tableau croisé dynamique** sans retoucher le fichier. Puis Type,
  Contenu, tous les champs modem, Groupe, Affaire, N° Why, Note, Par, et enfin
  `Enregistré le` (= `createdAt`, pour repérer les écarts avec `scanneLe`).
- **Trois portées, un clic chacune** : la vue filtrée (bouton d'en-tête), **un
  groupe** (bouton dans son en-tête), **un nœud de l'arbre** (bouton ⬇), plus la
  sélection multiple.
- **Copier** — même contenu en **TSV** (collage direct dans un tableur).
- **Injection de formule neutralisée** : une cellule commençant par `=`, `+` ou
  `@` est préfixée d'une apostrophe. Le contenu d'un QR est arbitraire et
  l'export circule entre collègues.

## 8.1 Bloc « Scans » sur la fiche Affaire

`scans-affaire.tsx` (client, lecture seule) affiche sur `/affaires/[id]` les
scans rattachés, **groupés par jour**, avec export CSV global et par journée, et
un lien vers le Scanner. Alimenté par `listerScansAffaire(chantierId)`. La
section est **masquée** si l'affaire n'a aucun scan.

> Le Scanner reste **hors `PROVIDERS`** : ce bloc est branché en dur sur la fiche
> affaire, il n'apparaît donc pas dans « Autres réalisations » (pas de doublon).


- **Export CSV** — séparateur `;` + BOM (ouverture directe Excel FR). Colonnes :
  Type, Contenu, tous les champs modem, **Groupe, Affaire, N° Why**, Note,
  Scanné le, Par.
- **Copier** — même contenu en **TSV** (collage direct dans un tableur).
- Les deux portent sur la **vue filtrée** (ou la sélection via « Exporter »).

## 9. Photos de scan

Une photo documente ce qu'un code ne dit pas : **où** le modem est posé, une
plaque illisible, une réserve. Modèle `ScanPhoto` (§4) — le binaire vit sur le
disque de la VM (`SCANS_MEDIA_DIR`, hors `public/`), servi par la route
authentifiée `GET /api/scans/media/[id]`. Même patron que les médias de visite.

### 9.1 Deux sources de capture, choisies toutes seules

| Situation | Source | Pourquoi |
|---|---|---|
| Caméra du scanner **ouverte** | frame du flux (`capturerDepuisVideo`) | instantané, zéro changement d'écran : on enchaîne scan → photo → scan |
| Caméra **arrêtée** | `<input capture>` → appareil photo natif | cadrage, mise au point, zoom |
| Bouton 📷 d'une **ligne du tableau** | toujours l'appareil natif | on documente après coup, la vue de scan n'est plus la bonne |

Compression ~1600 px JPEG q0.82 dans les deux cas (`compresserPhoto`, réutilisé
de `@/tools/visites/capture` — précédent déjà posé par les notes de frais).

### 9.2 À quoi la photo se rattache

À la **dernière ligne créée dans la session** (`dernierScanRef`), et non « la
plus récente du tableau » : sinon, ouvrir l'outil et appuyer sur Photo
rattacherait à un scan vieux de trois jours. S'il n'y en a pas, la photo crée
une **ligne photo** — `raw = ""`, `format = "photo"` (`estLignePhoto`), une
observation sans code-barres qui hérite du contexte affaire/groupe et se classe
comme un scan. Un indice sous la zone de scan annonce la cible avant l'appui.

### 9.3 Envoi : file d'attente et réessai

Une photo ne peut partir qu'une fois **sa ligne persistée** (la route répond 409
sinon). Or on photographie souvent dans la seconde qui suit le scan, pendant que
la ligne est encore en `temp-…` :

1. capture → vignette immédiate (objectURL) marquée « en attente » ;
2. si la ligne a déjà son id réel → envoi direct ; sinon la photo entre dans
   `attentePhotosRef`, vidée par `appliquerIdReel` dès la réponse du serveur ;
3. échec réseau → vignette bordée de rouge, **cliquable pour réessayer** (le
   binaire est gardé en mémoire jusqu'au succès). En local technique le réseau
   tombe, et une photo déjà prise ne doit pas être perdue.

### 9.4 Garde-fous (vérifiés)

- **Auth** sur les deux routes ; anonyme → redirigé par le proxy.
- **MIME en liste blanche** : `jpeg`/`png`/`webp` seulement. **Pas de SVG** —
  c'est du XML exécutable, et on le servirait sur notre propre origine.
- **UUID validé** côté serveur : le nom de fichier ne vient jamais du client
  (`../../etc/passwd` → 400), donc aucune traversée de chemin possible.
- **Idempotent** par UUID : un renvoi ne duplique jamais.
- **15 Mo** max.
- **Suppression** : la cascade Prisma efface les lignes `ScanPhoto` mais **pas**
  les binaires — `supprimerScans` relève les chemins avant, nettoie le disque
  après. Sans ça, les fichiers s'accumulent en orphelins sur la VM.

### 9.5 Où elles apparaissent

Colonne **Photos** du tableau (vignettes + bouton d'ajout, visionneuse plein
écran avec suppression), compteur 📷 dans les en-têtes de groupe, et colonne
**Photos** (nombre) à l'export CSV — pas d'URL : un lien vers une route
authentifiée ne sert à rien dans un tableur. Sur la fiche affaire, les vignettes
sont en **lecture seule** (l'ajout/suppression reste dans le Scanner).

### 9.6 Déploiement

`SCANS_MEDIA_DIR` : volume `scans_media` → `/data/scans-media` (docker-compose),
`$PWD/.scans-media` en prod locale (`serve-prod.sh`). **À sauvegarder** comme les
autres volumes média.

## 10. Dépendances ajoutées

`@zxing/browser` (+ sa dépendance `@zxing/library`, importée directement pour le
nom de symbologie). `BarcodeDetector` est natif (aucune dépendance).

## 11. Reste à faire / pistes

- Tri par colonne, filtre **par auteur**.
- **Volumétrie** : tout est chargé et filtré côté client. Confortable jusqu'à
  quelques milliers de lignes ; au-delà, basculer l'arbre sur un
  `date_trunc`/`GROUP BY` serveur (les index `[scanneLe]` et
  `[chantierId, scanneLe]` sont déjà là pour ça).
- Renommage éventuel des identifiants internes (`modems`, `ModemScan`,
  `scan-modems`) — purement cosmétique, sans impact utilisateur.
