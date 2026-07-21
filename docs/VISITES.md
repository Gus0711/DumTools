# Outil « Visite de chantier » — conception & plan

> Doc de référence du prochain outil : **les visites de chantier terrain**.
> À lire après [`ROADMAP.md`](ROADMAP.md) (priorités), [`ARCHITECTURE.md`](ARCHITECTURE.md)
> et [`AFFAIRES.md`](AFFAIRES.md).
> **Statut : IMPLÉMENTÉ le 2026-07-14** (Phases 1 + une partie de la 2, d'un
> coup, à la demande d'Augustin) — voir **§11** pour l'état réel, les écarts par
> rapport au plan ci-dessous, et la **procédure de test guidée** à dérouler.
> Le build (`tsc` + eslint + `next build`) passe ; **rien n'est encore testé sur
> device** — c'est l'étape suivante, à faire ensemble (§11.3).
> Les sections 1 à 10 sont conservées telles quelles comme trace de conception.
>
> ⚠️ **Encadrement demandé** — l'utilisateur (Augustin) souhaite être **guidé pas à
> pas** pour **tester** et pour **utiliser** l'outil à chaque étape (installation
> PWA, mode avion, capture photo/audio, synchro…). Chaque phase du plan doit se
> terminer par une **procédure de test manuelle explicite** que je déroule avec lui,
> pas seulement du code livré. Voir §10.

---

## 1. L'idée en une phrase

Un outil **terrain**, utilisable **sur mobile/tablette dans une armoire sans
réseau**, pour **ne rien oublier** pendant une visite de chantier : checklist,
**photos**, **notes vocales**, **réserves** (punch list), puis **compte-rendu**
généré et déposé sur l'affaire une fois de retour en ligne.

Dans le cycle A→Z de Dumortier (voir [`ROADMAP.md`](ROADMAP.md) §1), les visites
couvrent les **deux bouts** : l'étape **1 (relevé avant chiffrage)** qui ouvre
l'affaire, et l'étape **7 (exploitation/SAV)** qui la suit dans le temps — plus
le suivi et la réception entre les deux.

---

## 2. Principe directeur : un îlot local-first, pas une app offline

Décision d'architecture centrale : **on ne rend PAS toute l'app offline.**

- Le reste de DumTools reste **online** (RSC, server actions, Postgres) comme
  aujourd'hui — 90 % des écrans n'ont pas besoin d'offline et s'accommodent mal
  d'un service worker généralisé.
- L'outil visite est un **îlot autonome** sous `/outils/visites` : un **client
  component pur**, qui ne dépend **pas du serveur au runtime**, avec son propre
  stockage local et sa file de synchro.
- Il se raccroche à la plateforme **uniquement** par le patron habituel : entité
  rattachée à l'**Affaire** (pivot) + **1 ligne dans `PROVIDERS`**.

> Ce principe a été **appliqué et validé** (au build) avec l'îlot « Mode terrain »
> de la mise en service. Les visites sont le **2e îlot** posé sur le même socle.

---

## 3. Ce qui existe déjà (à réutiliser tel quel)

Le socle offline/PWA de la mise en service fournit **toutes les briques
génériques** — les visites n'en réécrivent aucune :

| Brique existante | Fichier | Réutilisation visites |
|---|---|---|
| Wrapper IndexedDB (base `dumtools-offline`) | `src/lib/offline/idb.ts` | tel quel — **ajouter les stores visites** dans `STORES` + bump `DB_VERSION` |
| Patron snapshot + file de mutations + rejeu | `src/lib/offline/mise-en-service.ts` | **modèle à décliner** en `src/lib/offline/visites.ts` (stores propres, même logique) |
| État réseau réactif | `src/lib/offline/use-online.ts` | tel quel |
| Bandeau d'état de synchro | `src/components/offline/sync-indicator.tsx` | tel quel |
| PWA : manifest, SW network-first, enregistrement prod-only | `src/app/manifest.ts` · `public/sw.js` · `src/components/pwa/register-sw.tsx` | tel quel (le SW couvre déjà toute l'app) |
| Upload différé vers kDrive | `src/tools/documents/spool.ts` (spool de la GED) | photos & audio remontent dans le **même spool**, classés sous l'affaire |

Ce que le socle **ne prouve pas encore** (et qui fait l'objet de la Phase 0
révisée, §7) : les **blobs médias hors-ligne** (photos/audio en IndexedDB,
compression, remontée vers le spool) et la **création d'entité complète
offline** (une visite naît sur le terrain avec un UUID client, pas seulement des
mutations sur un snapshot pré-chargé comme en mise en service).

---

## 4. Architecture offline (le cœur technique)

| Brique | Choix retenu | État |
|---|---|---|
| Installation | **PWA** : manifest + SW (network-first, jamais d'auth en cache) | ✅ fait (socle) |
| Données structurées | **IndexedDB** via le wrapper maison `idb.ts` (décision : **pas de Dexie**, on maîtrise le peu qu'on utilise) | ✅ fait (socle) |
| Blobs (photos/audio) | **Blobs dans IndexedDB** en V1 (OPFS seulement si les quotas/perfs posent problème sur device) | 🔶 spike Phase 0b |
| Identifiants | **UUID générés côté client** (`crypto.randomUUID()`) → création d'une visite 100 % offline | 🔶 spike Phase 0b |
| Synchro | **File de mutations rejouée** au retour réseau (event `online` + bouton manuel) — écrit *toujours* local d'abord | ✅ patron fait (socle) |
| Conflits | **Last-write-wins par champ** (visite quasi mono-utilisateur / append-only → pas de CRDT) | ✅ patron fait (socle) |
| Média → cloud | **Compression client** (WebP/JPEG ~1600 px) puis upload vers le **spool kDrive de la GED** | 🔶 spike Phase 0b |
| Confiance | **Indicateur d'état visible** (« 1 visite, 12 photos en attente ») | ✅ composant fait (socle) |
| Auth terrain | Session JWT valide offline pour l'affichage ; en cas d'expiration la synchro échoue proprement, **la file est conservée** | ⚠️ allonger les sessions (P0) |

**Notes vocales — transcription :** on **enregistre l'audio offline**
(`MediaRecorder`, simple, 100 % hors ligne). La **transcription se fait côté
serveur au moment du sync** (Whisper auto-hébergeable sur la VM Proxmox) — **pas**
la Web Speech API (qui passe par Google, pas vraiment offline, souci de
confidentialité). La transcription peut ensuite **pré-remplir le compte-rendu**
ou alimenter une note d'item.

**Plateformes** *(acté le 2026-07-13)* : **device de dev = Android/Chrome** ;
des collègues sont sur iPhone → on **code pour le plancher iOS** (pas de
Background Sync, quotas serrés, permissions caméra/micro capricieuses). Un test
iPhone réel fait partie de P0 puis de chaque phase.

---

## 5. Modèle de données (esquisse, à affiner)

```
Visite
  id            String  (UUID client)
  chantierId    String? (→ Affaire, onDelete SetNull)
  clientId      String? / clientNom String   (dénormalisé, patron habituel)
  numeroWhy     String?
  type          enum  RELEVE | SUIVI | RECEPTION | MAINTENANCE
  date, duree, meteo?
  participants  Json   [{ nom, role }]
  items         Json   [{ id, libelle, statut OK|KO|NA, note?, photoIds[] }]
  reserves      Json   [{ id, libelle, localisation, gravite, responsable,
                          statut OUVERT|LEVE, echeance?, photoIds[] }]
  medias        Json   [{ id, type PHOTO|AUDIO, blobRef, contexte, transcription? }]
  signatureClient?  blobRef
  syncState     enum  LOCAL | EN_ATTENTE | SYNCHRO   (côté client)
  createdAt, updatedAt

ModeleVisite   (même esprit que `Modele` de points : éditable, partagé)
  type + liste d'items pré-remplie par type de visite
```

Comme pour Projet GTB, le gros du contenu peut vivre en **JSON** côté entité ; la
source de vérité de saisie est **locale** jusqu'au sync.

**Différence clé avec la mise en service** : la mise en service *modifie* un
snapshot pré-chargé (mutations fines sur des points existants) ; une visite est
**créée entièrement offline** (UUID client) puis *poussée* — la file de synchro
porte donc des visites complètes (ou des patchs de visite), pas des mutations de
points. Le rejeu reste idempotent (upsert par `id`).

---

## 6. Le métier : « ne rien oublier », à chaque étape du cycle

### 6.1 Un type de visite par étape du cycle A→Z

Chaque type porte son **modèle de checklist** (patron `Modele`, éditable en
base, partagé) et son **pré-remplissage** depuis les données de l'affaire :

| Type | Étape du cycle ([`ROADMAP.md`](ROADMAP.md) §1) | Checklist type (« ne rien oublier ») | Pré-remplissage depuis l'affaire |
|---|---|---|---|
| **`RELEVE`** ⭐ cible n°1 recommandée | 1 — avant chiffrage | armoires existantes, alims dispo, points de raccordement, cotes/réserves de place, accès, réseaux existants, photos de l'électrique | client + adresse ; **alimente ensuite la Liste de points** (étape 2) |
| **`SUIVI`** | 3–4 — pendant travaux | avancement pose, coordination corps d'état, blocages, photos d'avancement | automates prévus, réserves ouvertes des visites précédentes |
| **`RECEPTION`** | 6 — livraison | levée des réserves, essais contradictoires, remise des accès supervision, **signature client** → PV en GED | réserves ouvertes, % mise en service (déjà en base), livrables GED |
| **`MAINTENANCE`** | 7 — exploitation/SAV | contrôles périodiques, dérives constatées, photos avant/après | historique des réserves et visites |

*(La **mise en service** n'est pas un type de visite : elle existe déjà dans
Projet GTB avec son mode terrain offline — une visite la **référence**, ne la
duplique pas.)*

### 6.2 Les mécaniques

- **Réserves (punch list) = colonne vertébrale** : une réserve **ouverte** dans une
  visite **réapparaît** dans la suivante tant qu'elle n'est pas **levée** — quel
  que soit le type de visite. C'est ça, concrètement, « ne rien oublier ».
- **Checklist conditionnelle** : OK / KO / N/A ; si **KO → photo + note obligatoires**.
- **Compte-rendu généré** (PDF A4, réutilise les patrons d'impression
  `apercu`/`tests-report`) : en-tête affaire, participants, météo, checklist,
  réserves avec photos, **signature client au doigt** → **déposé dans la GED
  Documents** de l'affaire.
- **Confort terrain** : gros boutons (patron de l'écran mise en service mobile),
  dictée > clavier, génération de la trame de la **prochaine visite** à partir
  des items non résolus.
- Les visites alimentent les **jalons du cycle** sur la fiche Affaire
  ([`ROADMAP.md`](ROADMAP.md) §3) : « relevé fait », « livré » (PV signé), « N
  réserves ouvertes ».

---

## 7. Plan de découpage en phases (révisé 2026-07-14)

### Phase 0a — Valider le socle existant sur device ⭐ prérequis, commun

**= le P0 de [`ROADMAP.md`](ROADMAP.md)** : dérouler les procédures A (dev) et
B (HTTPS/Android) de
[`A_FAIRE-mise-en-service-offline.md`](A_FAIRE-mise-en-service-offline.md#-procédure-de-test-à-dérouler-avec-augustin),
icônes PNG, sessions JWT longues, test iPhone. **Un seul cycle de validation
sert les deux outils** — si le socle passe sur device, l'architecture visites
est déjà aux ¾ prouvée.

### Phase 0b — Spike médias offline (jetable, le seul risque restant)

**But : prouver la chaîne média, pas livrer.** Une mini-page branchée sur le
**vrai** spool kDrive, en **mode avion**, doit permettre de :

1. **Prendre une photo** (`<input capture>` / `getUserMedia`) + **enregistrer 10 s
   d'audio** (`MediaRecorder`), réseau coupé.
2. Compresser la photo côté client (~1600 px WebP/JPEG) et stocker les **blobs en
   IndexedDB** ; fermer / rouvrir → **toujours là**.
3. Créer un « enregistrement » complet avec **UUID client** (pas un patch d'un
   snapshot pré-chargé).
4. Rallumer le réseau → l'enregistrement remonte (upsert idempotent) **et** les
   blobs partent dans le **spool kDrive existant**, classés sous une affaire.
5. Mesurer au passage : poids/quota IndexedDB avec ~30 photos, comportement
   Android **et** iPhone (permissions, quotas).

Si ces 5 points passent → toute l'archi visites est validée. Ce qui coince
s'apprend sur du jetable.

### Phase 1 — Socle de l'outil

- Entité `Visite` + rattachement Affaire (strict : démarrée depuis la fiche
  affaire, ou créée offline puis rattachée au sync) + `PROVIDERS` (×2 : client
  et affaire) + carte registre.
- **1 type de visite** (`RELEVE` recommandé) + **1 modèle de checklist** éditable.
- **Photos** (capture + compression + stockage local) et **notes vocales**
  (enregistrement, **sans** transcription) — reprises du spike 0b.
- Îlot local-first : `src/lib/offline/visites.ts` (décliné du patron
  mise-en-service) + **indicateur de synchro** existant.
- 🧪 Fin de phase : **une vraie visite de relevé de bout en bout** en mode avion,
  guidée pas à pas (§10), synchro vérifiée jusque dans la fiche affaire.

### Phase 2 — Métier

- **Réserves persistantes inter-visites** (réapparition tant que non levées).
- **Compte-rendu PDF** + **signature client au doigt** + **dépôt GED** automatique.
- **Modèles de visite éditables** par type ; ajout des types `SUIVI`, `RECEPTION`,
  `MAINTENANCE` (le type `RECEPTION` + PV signé = brique du dossier de livraison,
  [`ROADMAP.md`](ROADMAP.md) P2).
- 🧪 Fin de phase : cycle réserve complet (ouverte visite N → levée visite N+1)
  + un PV signé déposé en GED.

### Phase 3 — Confort

- **Transcription serveur** des notes vocales (Whisper sur Proxmox) →
  pré-remplissage du compte-rendu.
- **Annotation photo** (flèches/cercles au doigt).
- **Report d'items** non résolus vers la trame de la visite suivante.
- **Jalons du cycle** sur la fiche Affaire ([`ROADMAP.md`](ROADMAP.md) §3), les
  signaux visites étant désormais disponibles.

---

## 8. Décisions — tranchées et restantes

**Tranchées :**

2. ~~Offline~~ → **OUI, vrai offline complet** (armoire/chaufferie sans réseau).
   Acté et déjà construit pour la mise en service — ce n'est plus une option.
3. ~~Transcription vocale~~ → **Phase 3** ; l'audio est enregistré dès la
   Phase 1, rien n'est perdu, la transcription arrive après coup.
4. ~~Plateforme de test~~ → **Android/Chrome pour le dev**, **plancher iOS**
   comme contrainte de conception, test iPhone réel à chaque phase (acté 2026-07-13).

**Restante (à confirmer avec Augustin, ne bloque que le 1er modèle de checklist) :**

1. **Cible d'usage n°1 = `RELEVE` avant chiffrage** (recommandation) : c'est
   l'étape 1 du cycle A→Z, la valeur est immédiate (le relevé alimente le
   chiffrage et la Liste de points) et elle n'exige pas les réserves (Phase 2).
   L'alternative — réception/punch-list d'abord — ferait remonter les réserves
   en Phase 1. → à confirmer avant de construire le 1er modèle.

---

## 9. Fichiers clés (prévisionnel révisé)

```
RÉUTILISÉS TELS QUELS (socle existant)
  src/lib/offline/idb.ts                    + stores visites dans STORES (bump DB_VERSION)
  src/lib/offline/use-online.ts
  src/components/offline/sync-indicator.tsx
  src/app/manifest.ts · public/sw.js · src/components/pwa/register-sw.tsx
  src/tools/documents/spool.ts              remontée des médias vers kDrive

À CRÉER
  src/lib/offline/visites.ts               store local + file de synchro visites
                                           (décliné de mise-en-service.ts) + blobs médias
  src/tools/visites/
    model.ts                               types Visite / Reserve / Media / ModeleVisite
    page + îlot client                     /outils/visites (offline pur)
    checklist.tsx, reserves.tsx, medias.tsx, compte-rendu.tsx
    queries.ts                             listerPourChantier / listerPourClient
    actions.ts                             upsert idempotent au sync (+ push spool kDrive)
  src/tools/registry.ts                    + 1 carte
  src/lib/{clients,chantiers}/providers.ts + 1 ligne chacun
  prisma/                                  migration : table Visite (+ enums)
```

---

## 10. Encadrement des tests & de l'utilisation (rappel)

À **chaque phase**, je dois **guider Augustin pas à pas**, pas seulement livrer du
code. Concrètement, chaque phase se termine par une **procédure manuelle** que je
déroule avec lui, par ex. :

- **Installer la PWA** : où cliquer sur Android/Chrome et sur PC, comment vérifier
  que l'icône apparaît.
- **Tester le mode avion** : couper le réseau, saisir, fermer, rouvrir, vérifier la
  persistance.
- **Photo / audio** : accorder les permissions caméra/micro, vérifier le stockage
  local puis la remontée.
- **Synchro** : rallumer le réseau, observer l'indicateur passer de « en attente »
  à « synchronisé », vérifier l'arrivée dans l'affaire + la GED kDrive.
- **Utilisation métier** : dérouler une vraie visite type de bout en bout et générer
  le compte-rendu.

> Ne jamais supposer que « c'est testé » : chaque étape s'accompagne d'une check-list
> d'actions concrètes et de ce qu'on doit observer à l'écran.

---

## 11. RÉALISÉ (2026-07-14) — état de l'implémentation

### 11.1 Ce qui est construit

L'outil complet est codé et intégré à la plateforme (build OK). Trois routes :

| Route | Rôle |
|---|---|
| `/outils/visites` | **Index bureau** : visites synchronisées, lien fiche, CTA « Mode terrain » |
| `/outils/visites/terrain` | **Îlot terrain offline** : liste + création + édition, photos live, notes vocales, réserves — une seule route, aucune navigation serveur pendant la visite |
| `/outils/visites/[id]` | **Fiche bureau** (lecture seule) : checklist, médias servis par l'API, réserves |

**Fichiers livrés :**

```
src/tools/visites/
  model.ts             types client-safe (Visite, VisiteData, Reserve, MediaMeta…), uuid(), stats
  modeles-defaut.ts    les 4 checklists guides (GTB + armoire électrique), embarquées dans le bundle → offline
  capture.tsx          PhotoButton (input capture + compression canvas ~1600 px JPEG),
                       AudioRecorderButton (MediaRecorder webm/opus → mp4 iOS), vignettes, lightbox
  terrain.tsx          l'îlot : liste, création par type, 4 onglets (checklist / réserves / médias / infos)
  stockage.ts          binaires sur disque VM (env VISITES_MEDIA_DIR, défaut .visites-media/)
  actions.ts           syncVisite (upsert idempotent, last-write-wins par updatedTs), supprimerVisite
  queries.ts           index, fiche, snapshotAffairesPourTerrain (réserves ouvertes), providers
src/lib/offline/
  visites.ts           stores IDB (visites / visite-blobs / visites-cache, DB_VERSION 2),
                       synchro : visites d'abord, puis médias (upload FormData idempotent)
  use-visites.ts       hook de l'îlot : local-first, synchro auto au retour réseau (debounce 1,2 s)
src/app/api/visites/media/route.ts        POST upload (409 si visite pas encore poussée → la file réessaie)
src/app/api/visites/media/[id]/route.ts   GET authentifié (sert <img>/<audio> de la fiche)
+ carte registre, providers client & affaire, migration Prisma 20260714160108_outil_visites
```

**Mécaniques métier en place** : les 4 types de visite avec leurs checklists
guides (items + pense-bêtes `aide`), statuts OK/KO/N-A par item (KO → rappel
« ajouter une photo/note »), notes vocales stockées en **fichier audio**
(transcription = Phase 3, rien n'est perdu), **réserves inter-visites** (une
réserve ouverte est pré-remplie dans la visite suivante de la même affaire,
badge « Reportée », levée propagée), création **sans affaire** possible avec
rattachement ultérieur (onglet Infos **ou fiche bureau** — voir §11.5).

**UX terrain (refonte 2026-07-14 soir, carte blanche)** — l'îlot est découpé en
`terrain.tsx` (accueil), `editeur.tsx`, `guide.tsx`, `terrain-ui.tsx` :

- **Mode « Dérouler »** (`guide.tsx`) — la signature : checklist plein écran,
  UN point à la fois, gros boutons N/A · KO · OK dans la zone du pouce, avance
  automatique + retour haptique (`navigator.vibrate`). KO → on reste sur place
  (photo/note/réserve en un tap), fin → écran « Rien d'oublié. » avec bilan
  (KO, réserves, médias) et rappel des KO sans preuve.
- **Accueil terrain** : carte « Reprendre la visite » (la plus récente non
  finie, barre de progression), création en 2 taps (cartes de type avec icône,
  couleur E/S et pense-bête), cartes de visite avec rail couleur par type.
- **Éditeur** : en-tête compact sticky (retour, type, titre, pastille de
  synchro, barre de progression) + **dock de navigation en bas** (zone du
  pouce) avec badges (réserves ouvertes, médias, alerte « non rattachée ») ;
  checklist filtrable « À faire (n) » ; un point KO crée sa **réserve
  pré-remplie en un tap** (libellé + section) ; gravité des réserves en chips ;
  le titre de la visite s'édite dans Infos.
- Micro-animations (entrée d'un point, pop du bouton choisi) dans
  `globals.css`, désactivées si `prefers-reduced-motion`.

### 11.2 Écarts par rapport au plan (§5–§9)

- **Médias : PAS via le spool kDrive de la GED** (contrairement au §3/§9). Les
  binaires vivent en propre : disque VM (`VISITES_MEDIA_DIR`) + table
  `VisiteMedia` + route GET authentifiée. Raisons : catégories GED fermées,
  identifiants kDrive pas encore branchés, `chantierId` obligatoire côté
  Document alors qu'une visite peut naître sans affaire. Le miroir kDrive
  viendra avec le compte-rendu PDF (Phase 2 restante).
- **Modèles de checklist embarqués dans le bundle** (`modeles-defaut.ts`), pas
  en base (`ModeleVisite`) : disponibles offline sans pré-chargement. L'édition
  des modèles en base reste une évolution possible.
- **Les 4 types livrés d'un coup** (pas seulement `RELEVE`) et **réserves dès la
  Phase 1** — demande explicite d'Augustin (« construis complètement »).
- **Reste de la Phase 2** : compte-rendu PDF + signature client + dépôt GED.
  **Phase 3 inchangée** : transcription Whisper, annotation photo, jalons Affaire.

### 11.3 🧪 Procédure de test guidée (à dérouler ENSEMBLE, dans l'ordre)

> Rappel §10 : ne rien supposer testé. Chaque étape dit **quoi faire** et **quoi
> observer**. Étapes A–B sur PC (5 min), C–F sur téléphone Android via
> https://dumtools.datagtb.com (le SW et `crypto.randomUUID` exigent HTTPS).

**A. Sur PC, en ligne (vérifier le circuit complet)**
1. `npm run dev` → ouvrir `/outils/visites` → la page « Visites de chantier »
   s'affiche avec le bouton **Mode terrain** ; la carte « Visites de chantier »
   est sur l'accueil.
2. Cliquer **Mode terrain** → choisir **Relevé avant chiffrage** + une affaire →
   **Créer la visite**. *Observer : l'éditeur s'ouvre, la checklist « guide »
   (Site & accès, Armoire électrique…) est pré-remplie.*
3. Cocher 2–3 items (OK/KO), écrire une note sur un KO, prendre une « photo »
   (sur PC : sélecteur de fichier), enregistrer 5 s de vocal (autoriser le micro).
4. *Observer : l'indicateur de synchro passe par « en attente » puis
   « synchronisé » (~1–2 s après la dernière saisie).*
5. Retour `/outils/visites` → la visite est dans le tableau → ouvrir sa **fiche** :
   checklist, photo visible, lecteur audio qui joue. Vérifier aussi la
   **fiche affaire** (`/affaires/[id]`) : la visite apparaît dans les réalisations.

**B. Sur PC — réserves inter-visites**
1. Dans la visite, onglet **Réserves** : créer une réserve (gravité haute),
   laisser **Ouverte**. Attendre la synchro.
2. Créer une **2e visite** (type Suivi) **sur la même affaire**. *Observer : à la
   création, l'encart annonce la réserve reportée ; dans l'onglet Réserves elle
   est là avec le badge « Reportée ».*
3. La passer **Levée** dans la visite 2 → synchro → créer une 3e visite :
   *la réserve ne se reporte plus.*

**C. Sur Android — installation PWA**
1. Chrome → https://dumtools.datagtb.com → se connecter → menu ⋮ →
   **« Installer l'application »** (ou « Ajouter à l'écran d'accueil »).
2. *Observer : l'icône DumTools sur l'écran d'accueil ; l'app s'ouvre plein
   écran sans barre d'adresse.*

**D. Sur Android — capture réelle**
1. Ouvrir le **Mode terrain**, créer une visite de relevé.
2. Bouton **Photo** sur un item → *l'appareil photo s'ouvre directement*
   (pas la galerie) → prendre la photo → *la vignette apparaît sous l'item*.
3. Bouton **Vocal** → autoriser le micro → parler 10 s → stop → *le lecteur
   apparaît, la note se réécoute*.

**E. Sur Android — LE test clé : mode avion**
1. Ouvrir le Mode terrain **en ligne** d'abord (charge le cache des affaires).
2. **Mode avion ON.** Créer une **nouvelle** visite sur une affaire, cocher des
   items, **prendre 3–4 photos**, un vocal, une réserve.
   *Observer : tout marche, l'indicateur affiche « hors ligne / en attente ».*
3. **Fermer complètement l'app** (swipe), la rouvrir **toujours en avion** :
   *la visite et ses photos sont toujours là* (IndexedDB).
4. **Mode avion OFF** → *l'indicateur passe à « synchronisation… » puis
   « synchronisé » ; les sabliers ⏳ des vignettes disparaissent.*
5. Sur PC : ouvrir la fiche de cette visite → *photos et audio visibles,
   pris entièrement hors ligne*.

**F. Si dispo — iPhone d'un collègue**
Refaire C–E sur Safari iOS (« Ajouter à l'écran d'accueil »). Points de
vigilance : permission micro, l'audio doit être en **mp4** (repli automatique),
quotas IndexedDB plus stricts.

**En cas de souci** : noter l'étape exacte + ce qui s'affiche, et me le
rapporter tel quel — chaque étape isole une brique précise (SW, IDB, capture,
synchro), on saura tout de suite où chercher.

### 11.4 Config déploiement à ne pas oublier

- **`VISITES_MEDIA_DIR`** : chemin de stockage des médias sur la VM (défaut
  `.visites-media/` dans le cwd). En Docker → **volume persistant**, sinon les
  photos disparaissent au redéploiement (les métadonnées resteraient en base →
  fiches avec « fichier absent », 410).
- Prévoir la **sauvegarde** de ce dossier avec celle de Postgres.
- ⚠️ **Le test offline n'est valable qu'en PRODUCTION** (`next build` +
  standalone) : en dev le SW est volontairement désenregistré → « site
  inaccessible » à la réouverture hors-ligne. Pendant les tests device, le
  port 3000 (tunnel dumtools.datagtb.com) doit servir le build de prod.

### 11.5 Ajouts de la session de test device (2026-07-14 après-midi/soir)

Corrections issues du premier test réel d'Augustin (Android, mode avion) :

- **Fiche bureau actionnable** (`fiche-actions.tsx`) : la fiche
  `/outils/visites/[id]` n'est plus en lecture seule — **Rattacher / changer
  d'affaire** (cas relevé : l'affaire est créée APRÈS la visite), **Modifier**
  (rouvre la visite dans l'éditeur terrain via `?ouvrir=<id>` : l'îlot importe
  la copie synchronisée dans IndexedDB — `importVisiteLocale`), **Supprimer**.
  Règle de fusion serveur : une re-synchro du téléphone « sans affaire » ne
  détache JAMAIS une visite rattachée au bureau ; un média supprimé côté
  terrain est purgé (base + disque) au sync suivant.
- **Service worker v2** (`public/sw.js`) : le tout premier chargement d'une
  page n'étant pas intercepté par le SW, les pages clés sont mises en cache
  **proactivement** (message `CACHE_PAGES` envoyé par `register-sw.tsx` au
  démarrage + par l'îlot terrain, re-posté au `controllerchange`) ;
  `ignoreVary` au match (les en-têtes `Vary` de Next cassaient toute relecture
  du cache) ; repli `offline.html` (exclu du proxy d'auth) au lieu de l'erreur
  navigateur ; match sans query string (réouverture PWA avec `?source=pwa`).
- Validé sur device : la **saisie hors-ligne synchronise** bien au retour du
  réseau (couche données OK dès le premier test).
