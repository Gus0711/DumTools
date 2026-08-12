# Outil « Devis » — conception & plan

> Doc de référence du prochain outil : **le moteur de chiffrage**.
> À lire après [`MAGASIN.md`](MAGASIN.md) (d'où vient le déboursé),
> [`AFFAIRES.md`](AFFAIRES.md) (le pivot) et [`TOOLGUS.md`](TOOLGUS.md)
> (le rangement en espace perso).
>
> **Statut : V0.1 IMPLÉMENTÉE le 2026-08-07** — les phases 1 à 4 d'un coup, à la
> demande d'Augustin. `tsc`, `eslint` et `next build` passent ; le moteur est
> couvert par **106 contrôles** (`npx tsx scripts/devis-smoke.mts`) et l'outil a
> été **déroulé en navigateur réel contre la vraie base** — 39 contrôles à la
> livraison, dont le figé des prix, le rafraîchissement, la révision et le
> cloisonnement Achats, puis **34 de plus** pour le texte riche (§14) et **14**
> pour le correctif d'autosave (§14.3).
>
> **Les sections 1 à 12 sont la trace de CONCEPTION**, conservées telles quelles.
> **L'état réel se lit à partir du §13** : livré et vérifié (§13), texte libre en
> document riche (§14), associations de produits à l'ajout (§15), champs
> modifiables (§16), et **ce qu'il reste à faire (§17)**.
>
> **Outil de développement**, rangé dans **ToolGus** (`/perso/gus/devis`) le
> temps qu'il fasse ses preuves ; conçu dès le départ pour être promu outil
> métier sans reprise de données (voir §7.3).

---

## 1. L'idée en une phrase

Un **moteur de chiffrage** qui transforme ce que le Magasin sait déjà — le
**déboursé** — en **prix de vente**, par application d'un **coefficient en
cascade**, et compose un devis **structuré en lots** : soit à partir d'une page
blanche, soit en **aspirant la BOM d'une affaire** déjà dérivée de ses projets
GTB.

Dans le cycle A→Z ([`ROADMAP.md`](ROADMAP.md) §1), il complète l'**étape 2
(étude & chiffrage)** : le Magasin a livré *combien ça nous coûte*, il manquait
*combien on le vend*.

---

## 2. Les trois principes directeurs

### 2.1 Le devis fige, le magasin vit

Un devis est un **engagement daté**. Chaque ligne **copie** au moment où on
l'ajoute : désignation, référence, déboursé, coefficient, prix de vente. Un
devis rouvert trois mois plus tard affiche **exactement** ce qui a été chiffré,
même si le tarif fournisseur a bougé, même si l'article a été archivé.

Le lien vers le produit **est conservé** — mais il ne sert qu'à *proposer* :

```
⚠ 4 lignes ont un prix d'achat plus récent          [ Rafraîchir ]
```

La mise à jour est un **geste explicite**, ligne par ligne ou en bloc. Jamais
automatique : un total qui change tout seul entre deux consultations est le
meilleur moyen d'envoyer un prix qu'on n'a pas relu.

> C'est le même parti pris que le **snapshot du schéma par réponse** des
> Formulaires, et l'inverse assumé de la **BOM d'affaire**, qui elle doit rester
> dérivée (elle décrit un besoin présent, pas une promesse passée).

### 2.2 Un seul chemin de calcul : `déboursé × coefficient = prix de vente`

Pas de second référentiel de tarifs de vente à tenir à jour. Le coefficient se
lit **en cascade**, le premier trouvé gagne :

```
  1. la ligne de devis        ×1,50   ◀ forcé ici
  2. le produit               —
  3. la catégorie « Automate » ×1,25
  4. le défaut du devis       ×1,35
```

Et l'écran **dit toujours d'où vient le coefficient appliqué** — exactement
comme le Magasin annonce d'où sort un prix (`sourcePrix` : *prix moyen payé* /
*prix d'achat annoncé*). Un coefficient qu'on ne peut pas expliquer est un
coefficient qu'on n'ose pas défendre devant le client.

### 2.3 Ce qu'on ne sait pas chiffrer est dit à voix haute

Doctrine reprise telle quelle de la BOM (`nbSansPrix`) : une ligne dont le
déboursé est inconnu **n'est pas comptée pour zéro**. Elle reste visible, elle
est exclue des totaux, et le nombre d'exclues est affiché. **Un total
faussement complet est pire que pas de total du tout** — sur un devis, c'est de
l'argent perdu, pas juste une colonne vide.

> **Corollaire sur la marge.** La main d'œuvre est saisie en **taux de vente
> direct**, sans coût interne (décision §3) : l'outil ne peut donc pas connaître
> la marge de la main d'œuvre. Le chiffre affiché s'appelle **« marge sur la
> fourniture »**, jamais « marge du devis ». Le libellé n'est pas cosmétique :
> c'est la différence entre un indicateur et un mensonge.

---

## 3. Décisions prises (2026-08-07)

| Sujet | Décision | Pourquoi |
|---|---|---|
| **Prix de vente** | **Coefficient multiplicateur sur le déboursé**, en cascade *ligne → produit → catégorie → devis*. | Aucun tarif de vente à maintenir : le référentiel d'achat reste la seule source de vérité, la marge devient un **réglage** et non une donnée qui rancit. |
| **Point de départ** | **Les deux** : document autonome, **et** bouton « Reprendre le matériel de l'affaire X » qui verse la BOM dérivée en lignes. | Couvre le devis d'avant-projet (aucune affaire n'existe encore) *et* celui adossé à une liste de points. Sans le second, on ressaisirait ce que le Projet GTB sait déjà. |
| **Main d'œuvre** | **Table de prestations** (Étude, Programmation, Mise en service, Câblage armoire, Déplacement…) **au taux de vente direct**, **plus** des **lignes libres « divers »**. | La table capitalise d'un devis à l'autre ; les lignes libres absorbent l'imprévu sans obliger à créer une prestation pour un cas unique. Pas de coût horaire interne en base — donnée sensible, et pas indispensable au chiffrage. |
| **Structure** | **Lots** nommés avec sous-totaux, lignes réordonnables, lignes **« option »** (affichées, hors total), **remises** en % ou en € à la ligne et sur le total. | Un devis GTB mélange fourniture, armoire et main d'œuvre : à plat il est illisible dès la deuxième page. Les options se négocient, elles ne se suppriment pas. |
| **TVA** | **Un taux par devis**, 20 % par défaut, dont **0 % pour l'autoliquidation** en sous-traitance bâtiment. | Le tertiaire est l'essentiel de l'activité. Le multi-taux par ligne (10 % / 5,5 % rénovation de logement) ajouterait une colonne à vérifier sur chaque ligne pour un cas rare — à rouvrir si le cas se présente. |
| **Cycle de vie** | **N° séquentiel au format maison `DT{AA}{NNNN}`** (ex. `DT260052` = le 52ᵉ devis de 2026), états **Brouillon → Émis → Accepté / Refusé**, et **« Nouvelle révision »** qui duplique en v2 en gardant le lien vers v1. | Le format est celui déjà utilisé chez Dumortier : on ne réinvente pas une référence que les gens savent lire. On garde la trace de ce qui a été chiffré **avant** négociation — sans chaînage, on ne sait plus ce qu'on a lâché ni pourquoi. |
| **Droits** | **`ACHATS` + `ADMIN`**, via les helpers existants (`peutVoirPrix`, `peutGererReferentiel`). | L'outil expose le déboursé — déjà réservé à ces rôles — **et** les coefficients de marge de la maison, qui le sont encore davantage. |
| **Intégration** | **Hors `PROVIDERS`**, **hors recherche ⌘K**. Mais l'entité porte `clientId` / `chantierId` / `numeroWhy` **dès le premier jour**. | Règle ToolGus : les outils perso restent autonomes. Surtout : la fiche client est visible de **toute** l'équipe — y afficher des devis ferait fuiter l'information hors du périmètre Achats. Porter les clés dès maintenant rend la promotion future gratuite (§7.3). |
| **Restitution client** | **Hors périmètre de la v1.** On construit le **moteur** et le **générateur** ; le PDF à en-tête, les mentions légales et les CGV se cadreront après. | Décision explicite d'Augustin : d'abord que le calcul soit juste et la saisie rapide. |

---

## 4. Modèle de données (esquisse Prisma)

> Conventions de la maison : `cuid()`, `createdById`/`updatedById` pour
> l'attribution, **argent en centimes** (jamais de flottant, jamais de
> `Decimal` à sérialiser), relations vers `User` explicitement nommées.

```prisma
enum EtatDevis { BROUILLON  EMIS  ACCEPTE  REFUSE }

model Devis {
  id       String     @id @default(cuid())
  /// Format maison : DT{AA}{NNNN} — DT260052 = 52ᵉ devis de 2026 (voir §4.1).
  numero   String
  revision Int        @default(1)
  /// Chaînage des révisions : v2 pointe vers v1. Null = première version.
  parentId String?
  parent   Devis?     @relation("DevisRevision", fields: [parentId], references: [id], onDelete: SetNull)
  enfants  Devis[]    @relation("DevisRevision")
  titre    String     @default("")
  etat     EtatDevis  @default(BROUILLON)

  // --- Rattachements (conventions de la maison, même sans PROVIDERS) -------
  clientNom  String    @default("")
  clientId   String?   // → Client, onDelete: SetNull
  numeroWhy  String?   // la référence WhySoft de l'affaire
  chantierId String?   // → Chantier, onDelete: SetNull

  // --- Réglages de chiffrage ----------------------------------------------
  /// Coefficient par défaut du devis, en MILLIÈMES (1350 = ×1,350).
  /// Initialisé depuis le coefficient global à la création, puis figé : changer
  /// le réglage de la maison ne doit pas modifier un devis déjà chiffré.
  coefDefautMillieme Int @default(1350)
  /// Taux de TVA en CENTIÈMES DE POURCENT (2000 = 20,00 % ; 0 = autoliquidation).
  tauxTvaCentieme    Int @default(2000)
  /// Remise globale, exclusive : l'une des deux est renseignée, jamais les deux.
  remiseGlobalePourMille Int?   // 30 = 3,0 %
  remiseGlobaleCents     Int?
  validiteJours          Int    @default(30)
  note                   String @default("")

  emisLe    DateTime?
  createdById String?
  updatedById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  lots   LotDevis[]
  lignes LigneDevis[]

  @@unique([numero, revision])
  @@index([clientId])
  @@index([chantierId])
  @@index([etat])
}

/// Regroupement affiché avec son sous-total (« Fourniture GTB », « Armoire »,
/// « Main d'œuvre », ou un bâtiment). Une ligne sans lot se range en fin de devis.
model LotDevis {
  id      String @id @default(cuid())
  devisId String
  titre   String
  /// Insertion au point médian des voisins (même patron que TacheAffaire.ordre).
  ordre   Float
  note    String @default("")
  lignes  LigneDevis[]
  @@index([devisId])
}

/// PRODUIT    : article du Magasin, déboursé × coefficient.
/// PRESTATION : entrée du référentiel de prestations, au taux de VENTE.
/// LIBRE      : le « divers » — libellé et prix saisis à la main.
/// TEXTE      : commentaire intercalé, sans montant (ni quantité ni total).
enum GenreLigne { PRODUIT  PRESTATION  LIBRE  TEXTE }

model LigneDevis {
  id      String     @id @default(cuid())
  devisId String
  lotId   String?
  ordre   Float
  genre   GenreLigne

  /// Lien conservé vers la source — il ne sert QU'À PROPOSER un rafraîchissement
  /// (§2.1). Se vide sans rien casser : tout ce qui s'affiche est copié ci-dessous.
  produitId    String?   // → Produit,     onDelete: SetNull
  prestationId String?   // → Prestation,  onDelete: SetNull

  // --- LA COPIE (c'est elle qui fait foi) ---------------------------------
  designation String
  refInterne  String?
  unite       String @default("U")
  /// Quantité en MILLIÈMES (2500 = 2,5) : les heures se comptent en demies,
  /// et on ne met pas de flottant dans un calcul de prix.
  quantiteMillieme Int  @default(1000)
  /// Déboursé unitaire copié au moment de l'ajout. Null = inconnu (ligne exclue
  /// des totaux et comptée dans `nbSansPrix`) ou sans objet (PRESTATION, LIBRE).
  debourseCents    Int?
  /// Coefficient effectivement appliqué, copié. Null si le PV est saisi en direct.
  coefMillieme     Int?
  /// D'où venait ce coefficient : "ligne" | "produit" | "categorie" | "devis".
  /// Copié pour que l'explication survive à un changement de réglage.
  origineCoef      String @default("devis")
  /// Le prix de vente unitaire retenu, en centimes. TOUJOURS renseigné : c'est
  /// le seul champ dont dépendent les totaux.
  pvUnitaireCents  Int

  /// Remise de ligne, en pour mille (50 = 5,0 %).
  remisePourMille Int     @default(0)
  /// Option : affichée, chiffrée, mais HORS TOTAL. Elle se négocie, on ne la
  /// supprime pas — sinon on perd le travail de chiffrage à chaque aller-retour.
  option          Boolean @default(false)
  note            String  @default("")

  @@index([devisId, ordre])
  @@index([lotId])
  @@index([produitId])
}

/// Référentiel de main d'œuvre — au TAUX DE VENTE (pas de coût interne, §3).
model Prestation {
  id             String  @id @default(cuid())
  libelle        String  @unique
  /// h | j | forfait | U
  unite          String  @default("h")
  prixVenteCents Int
  /// Regroupement d'affichage (« Bureau d'études », « Terrain »…).
  famille        String  @default("")
  ordre          Int     @default(0)
  actif          Boolean @default(true)
  note           String  @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

/// Les coefficients de vente, dans une table À L'OUTIL — et non en colonnes
/// posées sur `Produit` / `CategorieProduit`.
///
/// Deux raisons. (1) L'outil est en développement : tout ce qu'il ajoute doit
/// pouvoir disparaître sans toucher au Magasin, qui tourne. (2) Un coefficient
/// n'est pas une propriété de l'article, c'est une **politique commerciale** :
/// elle se révise en bloc, elle s'exporte, elle a une date.
model CoefVente {
  id       String @id @default(cuid())
  /// GLOBAL | CATEGORIE | PRODUIT
  portee   String
  /// L'id de la CategorieProduit ou du Produit visé ; null pour GLOBAL.
  cibleId  String?
  coefMillieme Int
  note     String @default("")
  updatedById String?
  updatedAt   DateTime @updatedAt
  @@unique([portee, cibleId])
}
```

**Ce qu'on ne stocke pas** : aucun total en base. Les totaux sont **dérivés**
des lignes à chaque lecture (§5) — une colonne `totalHtCents` maintenue à la
main finit toujours par mentir. Si l'index de devis devient lent, on ajoutera un
cache **explicitement nommé comme tel**, jamais une colonne qui ressemble à la
vérité.

### 4.1 La numérotation — `DT{AA}{NNNN}`

`DT` + les **deux chiffres de l'année** + un **compteur à 4 chiffres**, remis à
zéro chaque année : `DT260052` est le 52ᵉ devis de 2026. C'est le format déjà
en usage dans la maison — l'outil s'y plie, il ne l'invente pas.

Trois points de vigilance, parce qu'un numéro de devis en double est un
incident, pas un détail :

1. **Le numéro est attribué à la création**, pas à l'émission. Un brouillon
   abandonné laisse donc un trou dans la série — c'est voulu : renuméroter
   après coup ferait bouger la référence d'un devis déjà cité au téléphone.
2. **L'attribution est sérialisée en base**, pas calculée par un `max + 1` lu
   puis écrit : deux créations simultanées prendraient le même numéro. Une
   petite table `CompteurDevis { annee Int @id, dernier Int }` mise à jour par
   un `UPDATE … RETURNING` atomique (ou un `upsert` dans la même transaction que
   la création) suffit et se lit d'un coup d'œil.
3. **La révision ne consomme pas de numéro** : `DT260052` v1 et v2 partagent le
   même, d'où la clé `@@unique([numero, revision])`. C'est le même devis, pas
   deux.

> Le **4 chiffres plafonne à 9 999 devis par an** — largement au-delà du
> volume réel. Le générateur doit malgré tout **refuser de déborder
> silencieusement** plutôt que de produire un `DT2610000` à 9 caractères que
> personne n'attend.

---

## 5. Le moteur de calcul (le cœur de l'outil)

Tout le calcul vit dans **`src/tools/devis/model.ts`** : **fonctions pures,
client-safe, aucun import Prisma** — exactement le patron de
`src/tools/magasin/model.ts`. C'est ce qui le rend testable par un script
`tsx` sans base ni navigateur, et réutilisable dans l'éditeur en direct (les
totaux se recalculent sous les doigts, sans aller-retour serveur).

### 5.1 La cascade du coefficient

```ts
coefPourProduit(produitId, categorieId, coefs, forceLigne?) : {
  coefMillieme: number;
  origine: "ligne" | "produit" | "categorie" | "devis";
}
```

Le premier trouvé gagne, et **l'origine remonte avec la valeur** : l'écran
n'affiche jamais un coefficient sans dire d'où il sort.

### 5.2 L'arrondi : un seul point, documenté

Un devis qui ne retombe pas sur ses pattes à l'euro près est un devis qu'on ne
signe pas. Une seule règle, écrite une fois :

1. `pvUnitaireCents = arrondi(debourseCents × coefMillieme / 1000)` — **au
   moment de l'ajout**, puis figé ;
2. `totalLigneCents = arrondi(pvUnitaireCents × quantiteMillieme / 1000)` ;
3. remise de ligne appliquée sur ce total, arrondie ;
4. sous-totaux, total HT, remise globale, TVA, TTC : **sommes d'entiers**, plus
   aucun arrondi.

Autrement dit : on arrondit **sur la ligne**, jamais sur le total. Un `Σ` de
lignes arrondies est reproductible ; un total arrondi séparément dérive de
quelques centimes et fait perdre une heure à quelqu'un.

### 5.3 Ce que renvoie `calculerDevis(devis, lignes)`

| Champ | Contenu |
|---|---|
| `lots[]` | chaque lot avec ses lignes calculées et son **sous-total** |
| `totalHtCents` | hors options, après remises de ligne |
| `remiseGlobaleCents` | résolue (% → €) |
| `netHtCents`, `tvaCents`, `totalTtcCents` | la suite |
| `optionsCents` | total des lignes « option », **affiché à part** |
| `debourseTotalCents` | somme des déboursés connus (fourniture seule) |
| `margeFournitureCents`, `tauxMargeFourniture` | et **seulement** la fourniture (§2.3) |
| `nbSansPrix` | lignes sans déboursé connu — **dites, jamais comptées zéro** |
| `nbPerimees` | lignes dont le déboursé figé diffère du prix de référence actuel |

### 5.4 La fraîcheur

Une requête compare, pour toutes les lignes qui portent encore un `produitId`,
le `debourseCents` figé au `prixReference()` du Magasin d'aujourd'hui. D'où le
bandeau, et un bouton **Rafraîchir** qui réapplique déboursé **et** cascade de
coefficient — ligne par ligne ou en bloc, jamais en silence.

### 5.5 Vérification

`scripts/devis-smoke.mts`, sur le modèle de `magasin-smoke.mts` : cascade du
coefficient (les 4 étages et leur origine), arrondis (le cas qui dérive si on
arrondit le total), options hors total, remise % vs €, TVA à 0 %
(autoliquidation), lignes sans prix exclues, invariant `Σ lots = total HT`.

---

## 6. Les écrans

| Route | Écran | Contenu |
|---|---|---|
| `/perso/gus/devis` | **Index** | liste (n°, révision, client, affaire, état, total HT, marge fourniture), recherche, filtres état/client, « Nouveau devis » |
| `/perso/gus/devis/[id]` | **L'éditeur** | *le* écran de l'outil (voir ci-dessous) |
| `/perso/gus/devis/referentiels` | **Prestations & coefficients** | table de prestations + les trois étages de coefficients (global, par catégorie, par produit) |

**L'éditeur**, dans la grammaire de la maison :

- un **`<Cartouche>`** en tête — estampille `DEVIS`, n° + révision, état, et le
  pavé de champs de référence : client (combobox `@/ui`), affaire, n° Why, coef
  par défaut, TVA, validité ;
- des **lots repliables**, chacun avec son sous-total ; lignes en `.data-table`
  dense (jamais une `<table>` re-stylée), réordonnables au glisser-déposer ;
- **une seule barre d'ajout** : on tape, elle cherche **en même temps** dans les
  produits (`rechercherProduits`), les prestations, et propose « ligne libre » /
  « texte ». C'est le geste le plus répété de l'outil — il ne doit pas coûter un
  choix de menu avant chaque saisie ;
- un **panneau de totaux collant** : HT, remise, net, TVA, TTC, options à part,
  et dessous — en plus petit — déboursé, marge fourniture, `n` lignes sans prix ;
- le **bandeau de fraîcheur** (§5.4) quand il y a lieu ;
- « **Reprendre le matériel d'une affaire** » : choisir l'affaire, voir les
  lignes de sa BOM (`bomAffaire`) avec cases à cocher — hors fourniture et
  trous **affichés mais non versés** — et verser la sélection dans un lot.

---

## 7. Points d'intégration

### 7.1 Ce qu'on réutilise sans rien modifier

| Besoin | Existant |
|---|---|
| Déboursé d'un article | `prixReference()` — *prix moyen payé*, sinon *tarif annoncé*, sinon `null` (`magasin/queries.ts`) |
| Chercher un article | `rechercherProduits(q)` / `produitParCode(code)` |
| Le matériel d'une affaire | `bomAffaire(chantierId)` (`magasin/bom.ts`) |
| Client / affaire | `listerClients`, `resoudreClientId`, `listerAffaires`, `resoudreChantierId` |
| Argent | `formatEuros` / `parseEuros` (centimes, formatage maison — pas `Intl`, qui casse l'hydratation) |
| Droits | `peutVoirPrix`, `peutGererReferentiel` (`magasin/model.ts`) |
| Kit UI | `Cartouche`, `Combobox`, `Chiffre`, `EnteteBloc`, `EtatVide`, `.data-card` / `.data-table` |

### 7.2 Ce qu'on ajoute

- une entrée de registre `devis` avec `proprietaire: "gus"` (signal **`ao`**
  violet, « ce qu'on émet » — libre dans l'espace perso) ;
- un `garde.ts` sous `src/app/(app)/perso/[qui]/devis/`, sur le modèle de celui
  des Notes de frais, qui vérifie l'espace **et** `peutVoirPrix`. ⚠️ La garde va
  aussi **dans chaque server action**, pas seulement sur la page : un écran
  fermé n'est pas une autorisation refusée ;
- la migration : **`prisma migrate dev --create-only`**, retirer le
  `DROP INDEX "WikiPage_recherche_idx"` et le `ALTER … DROP DEFAULT` que Prisma
  y glissera, puis **`prisma migrate deploy`**, puis vérifier que l'index GIN du
  wiki existe toujours. Suivi de `npm run db:generate` **et** d'un redémarrage
  du serveur.

### 7.3 Ce qu'on ne fait **pas** (et qui reste gratuit plus tard)

Ni `PROVIDERS`, ni recherche ⌘K, ni carte d'accueil : l'outil est réservé aux
Achats, ces trois surfaces sont visibles de tous. Mais comme l'entité porte
`clientId`, `chantierId` et `numeroWhy` **dès le premier jour**, la promotion en
outil métier se réduira à : retirer `proprietaire` du registre, exporter
`listerPourClient` / `listerPourChantier`, deux lignes dans les `PROVIDERS`, une
entrée dans le `Promise.all` de la recherche. **Aucune reprise de données.**

---

## 8. Phasage

Chaque phase est utilisable seule et se termine par une vérification concrète.

**Phase 1 — Le moteur nu.** `Devis` + `LotDevis` + `LigneDevis`, `model.ts` pur
(cascade, arrondis, totaux), `scripts/devis-smoke.mts`, et l'éditeur minimal :
lots, lignes produit et libres, panneau de totaux.
*Utilisable seul : on peut déjà chiffrer.*

**Phase 2 — Les référentiels.** `Prestation`, `CoefVente` et ses trois étages,
l'écran de réglage, l'affichage de l'origine du coefficient partout.

**Phase 3 — L'affaire.** Rattachement client/affaire, reprise de la BOM,
bandeau de fraîcheur et « Rafraîchir ».

**Phase 4 — Le cycle.** Numérotation séquentielle, états, révisions liées,
duplication, options et remises.

**Phase 5 — La restitution.** *À cadrer le moment venu* : PDF client à en-tête,
export Excel, et — si l'outil a fait ses preuves — la promotion en outil métier
(§7.3).

---

## 9. Risques identifiés

| Risque | Parade |
|---|---|
| **Le total silencieusement faux** — une ligne sans déboursé comptée zéro. | `nbSansPrix` affiché, ligne exclue et signalée (§2.3). Doctrine déjà éprouvée sur la BOM. |
| **Le coefficient invisible** — « pourquoi cette ligne est à ce prix ? ». | L'origine du coefficient est **copiée sur la ligne** et affichée. Elle survit donc à un changement de réglage. |
| **La dérive d'arrondi** entre le total et la somme des lignes. | Un seul point d'arrondi, sur la ligne (§5.2), couvert par le smoke. |
| **La fuite des marges** hors du périmètre Achats. | Garde **dans chaque server action**, hors `PROVIDERS`, hors ⌘K. Le devis n'apparaît nulle part où un `MEMBRE` regarde. |
| **La marge trompeuse** — la MO n'a pas de coût interne. | Le chiffre s'appelle **« marge sur la fourniture »**. Jamais « marge du devis ». |
| **La dérive vers un CRM** — relances, factures, acomptes. | WhySoft reste maître du commercial et du financier. Ici on **chiffre**, on ne suit pas. |
| **Le référentiel de prestations qui pourrit** — dix libellés pour trois métiers. | Même remède que les fabricants du Magasin : libellé unique, archivage plutôt que suppression, renommage sur un nom pris = fusion. |

---

## 10. Questions ouvertes (à trancher à l'usage)

1. **Le pont retour** : un devis **accepté** doit-il alimenter l'affaire —
   lignes manuelles de BOM, réservations de stock ? Séduisant, mais c'est le
   genre de couplage qui se regrette : à voir une fois que des devis réels
   existent.
2. **Les devis-types** : une bibliothèque de gabarits par typologie de chantier
   (chaufferie, CTA, GTB de site), ou la simple duplication d'un devis existant
   suffit-elle ? La duplication est gratuite — commencer par là.
3. **Frais généraux et aléas** en étages séparés du coefficient matériel :
   écarté au cadrage (trois réglages à comprendre au lieu d'un), noté ici parce
   que c'est la première chose qui manquera si le coefficient unique s'avère
   trop grossier.
4. **TVA multi-taux par ligne** — rouvert seulement si un chantier de rénovation
   de logements se présente.
5. **La restitution client** : forme du document, mentions légales, CGV,
   conditions de paiement, et **qui** l'envoie (l'outil, ou WhySoft à partir de
   l'export).

---

## 13. État réel après implémentation (2026-08-07)

### Ce qui est livré

| Route | Écran |
|---|---|
| `/perso/gus/devis` | **Index** : compteurs (devis, en chiffrage, **en jeu** = net des devis émis, **accepté**), recherche, filtre d'état, création (objet / affaire / client / n° Why), colonne marge fourniture et pastille « n lignes sans prix » |
| `/perso/gus/devis/[id]` | **L'éditeur** : cartouche éditable, barre d'ajout unique, lots à sous-totaux, lignes éditables au clavier, options, remises, panneau de totaux collant, bandeau de fraîcheur, révision, suppression |
| `/perso/gus/devis/referentiels` | **Prestations & coefficients** : coefficient global, coefficients par catégorie, table de prestations (archivage automatique si portées par un devis) |
| `GET /api/devis/articles` | Recherche d'articles pour la barre d'ajout — **contrôle de droit en clair dans la route** (403 pour un membre) |

Transverse : entrée de registre (signal **AO** violet, `proprietaire: "gus"`,
`status: "en-cours"`), garde `peutVoirDevis` sur les écrans **et** dans chaque
server action, moteur pur partagé client/serveur.

### Ce qui a été vérifié, et comment

- **`npx tsx scripts/devis-smoke.mts` — 90 contrôles** sur le moteur pur :
  cascade du coefficient (4 étages + origine), arrondi (dont le cas à trois
  lignes qui dérive d'un centime si l'on arrondit le total), options hors total
  *et* hors marge, les deux formes de remise, TVA 0 / 5,5 / 20 % sur le net,
  lignes sans déboursé, lignes de texte, lots et ordre, fraîcheur, numérotation,
  aller-retour de tous les formats de saisie.
- **Navigateur réel + vraie base — 39 contrôles** (Chromium piloté, compte
  temporaire créé puis détruit) : création et numérotation `DT260001`, copie du
  déboursé / coefficient / désignation sur la ligne, `PV = déboursé × coef`,
  **le prix du magasin modifié ne bouge pas le devis** mais lève le bandeau,
  **« Rafraîchir » l'applique**, prestation au taux de vente sans déboursé,
  révision v2 chaînée avec lignes et lots recopiés, **changer le coefficient
  global ne modifie pas un devis déjà chiffré**, un `MEMBRE` ne voit rien de
  l'outil et l'API lui répond 403, zéro erreur console.

### Refonte de la composition (2026-08-07, après première prise en main)

La première version posait **une barre de saisie unique en tête d'écran**, avec
un menu « Dans quel lot ? » à côté. À l'usage, trois choses n'allaient pas, et
elles se répondent :

1. **On ne voyait pas comment créer le lot de prestations.** Les deux lots
   suggérés n'apparaissaient que sur un devis *vide* : créer « Matériel »
   faisait disparaître « Prestations » du même coup. Ils sont désormais proposés
   **tant que le lot n'existe pas**, quel que soit l'état du devis.
2. **Le geste le plus répété coûtait un aller-retour.** Ajouter une ligne
   demandait de remonter en haut de l'écran, puis de choisir sa destination dans
   un menu. Chaque lot porte maintenant **sa propre zone d'ajout, au bas de ses
   lignes** — la ligne atterrit là où l'on a cliqué, sans rien désigner. C'est
   la grammaire de la **liste de points** du Projet GTB, que l'outil aurait dû
   emprunter dès le départ.
3. **Le coefficient ne se reprenait pas.** Forcer un prix de vente une seule
   fois effaçait le coefficient *et* la case qui permettait d'en ressaisir un :
   la ligne était condamnée au prix figé. La case est désormais saisissable
   **dès qu'il y a un déboursé à multiplier**, quel que soit le genre de ligne —
   y compris pour rendre au calcul une ligne dont le prix avait été forcé.

Ajouté au passage : une **poignée de glisser-déposer** par ligne (déplacement
dans le lot *et* d'un lot à l'autre), servie par `reordonnerLignes()` qui reçoit
l'ordre complet du lot d'arrivée — une seule écriture, et l'ordre enregistré est
exactement celui qu'on voyait à l'écran. Les flèches restent : le glisser-déposer
ne marche pas au doigt.

Vérifié en navigateur (17 contrôles) : lots suggérés persistants, ligne déposée
dans le bon lot sans menu, prestations listées sans rien taper, coefficient
repris après un P.V. forcé, réordonnancement.

### Écarts par rapport au plan

1. **Le déplacement se fait par flèches**, pas au glisser-déposer (lots et
   lignes). Deux boutons échangent les positions de deux voisins — pas de
   renumérotation globale, et ça marche au doigt. Le glisser-déposer viendra
   s'il manque à l'usage.
2. **Le déboursé est éditable à la main sur la ligne.** Pas prévu au plan, mais
   sans ça un article hors magasin ou un prix négocié pour l'affaire n'avait
   aucun chemin. Le PV suit alors le coefficient en place.
3. **Pas de champ « note » par ligne dans l'interface** (la colonne existe en
   base). L'écran a déjà sept colonnes ; à ajouter quand le besoin se dira.
4. **Le libellé d'une ligne est une zone de texte, pas un champ d'une ligne.**
   Une désignation de catalogue fait couramment quarante caractères et se
   coupait au milieu — sur un devis, c'est la colonne qu'on lit.
5. **Une prestation affiche « taux vendu » et non « P.V. forcé »** dans la
   colonne coefficient. Elle n'a pas de coefficient *par construction* : parler
   de forçage laisserait croire à une décision là où il n'y en a pas eu.
6. **L'en-tête de lot compte les lignes qui pèsent dans son sous-total**
   (options exclues) : « 4 lignes » à côté d'un total qui n'en comptait que 3
   est le genre de détail qui fait recompter tout le devis à la main.

### Pièges rencontrés (à ne pas re-découvrir)

- **La dérive tsvector du wiki est toujours là.** `prisma migrate dev
  --create-only` a de nouveau glissé `DROP INDEX "WikiPage_recherche_idx"` +
  `ALTER … "recherche" DROP DEFAULT` dans la migration. Retirés à la main, puis
  `prisma migrate deploy` ; `WikiPage_recherche_idx` vérifié présent après coup.
- **`notFound()` sous un rendu streamé répond 200.** La coquille part avant que
  la garde ne lève : la page « introuvable » s'affiche bien, mais le code HTTP
  reste 200. Ne pas tester ce chemin sur le statut — tester le **contenu**. La
  route d'API, elle, répond bien 403.
- **Le serveur standalone a besoin qu'on lui recopie `.next/static` et
  `public`** après chaque build. Sans ça la page rend en SSR mais **n'hydrate
  pas** : les boutons ne font rien et rien dans les logs ne le dit.
- **`pkill -f "<motif>"` se tue lui-même** quand le motif figure dans sa propre
  ligne de commande (code 144). Tuer par PID.

---

## 14. Le texte libre est un DOCUMENT RICHE (2026-08-07)

Une ligne `TEXTE` ne porte plus une phrase mais un **document** : le moteur des
Notes et du Wiki (BlockNote), avec son « / » — titres, listes, cases à cocher,
**tableau**, **image**, lien, séparateur, saut de page. Le devis est le
**troisième consommateur** du socle `src/lib/editeur-riche/` et du schéma
`src/tools/notes/blocs/schema.tsx`, qu'il ne modifie pas.

### 14.1 Les quatre règles

**1. `designation` reste le résumé en TEXTE BRUT.** Elle est recalculée à chaque
sauvegarde (`resumeTexteLigne`, 160 caractères). Tout ce qui lit une ligne sans
savoir rendre des blocs — l'index, un export, le futur PDF client — continue de
trouver une phrase lisible. Une désignation qui serait devenue un objet JSON
aurait cassé silencieusement tout ce qui ne regarde pas l'éditeur.

**2. Le cas courant ne monte pas d'éditeur.** Un devis porte dix commentaires
d'une ligne, pas un document. `texteNu(contenu)` rend la chaîne d'un document
qui se réduit à **un paragraphe sans aucune mise en forme**, et `null` sinon :
le premier cas s'affiche en `<p>`, sans une seule instance ProseMirror. Seul un
document réellement riche paie un rendu BlockNote, et **seule la ligne qu'on
modifie** paie un éditeur.

**3. Éditer suspend le glisser-déposer.** Sous un parent `draggable`, Chrome
refuse la sélection de texte à la souris : la rangée relâche son `draggable`
tant que son éditeur est ouvert. Sans ça on ne pourrait pas sélectionner un mot
dans le texte qu'on est en train d'écrire.

**4. Ce qu'on PROPOSE n'est pas ce qu'on sait LIRE.** Le menu « / » du devis est
allégé (`sansBlocsTechniques`) : ni bloc de code, ni HTML embarqué, ni table de
données typée — ces textes finissent sous les yeux d'un client. Le **schéma**,
lui, reste entier : un document se rend toujours avec le schéma qui l'a produit,
et un bloc collé depuis une note doit s'afficher.

### 14.2 Ce que ça ajoute

| Où | Quoi |
|---|---|
| `LigneDevis.contenu` (Json?) | le document. **Null** = ligne d'avant la bascule : l'éditeur l'amorce depuis `designation`. `[]` = document volontairement vide. |
| `LigneDevis.version` | verrou optimiste **du document seul** — les autres champs de la ligne sont des cases indépendantes, pas un texte qu'on se dispute. |
| `DevisMedia` + `/api/devis/media[/id]` | images et pièces jointes. Parent = **le devis**, pas la ligne (une image survit au déplacement de sa ligne). **Aucune route publique** : un devis ne se partage pas par lien, et la garde Achats est **en clair dans les deux routes**. |
| `sauverTexteLigne` | autosave 700 ms (`useSauvegardeDocument`), `updateManyAndReturn`, purge des médias orphelins. **Sans `revalidatePath`** : l'action part à chaque frappe et aucun total ne dépend d'un texte. |
| `ajouterLigneTexte` | la ligne naît avec son contenu et **s'ouvre en écriture** : on vient de demander un texte, la première chose à faire est de le taper. |

**La révision recopie les binaires.** Une v2 qui citerait les médias de la v1
perdrait ses images le jour où l'on purge ou supprime la v1. `copierMedias`
duplique les fichiers sous de nouveaux ids et `reecrireMedias` réécrit les URLs
du document copié — chaque révision reste autosuffisante, exactement comme ses
prix figés.

### 14.3 Le piège de l'autosave silencieux (corrigé après signalement)

`sauverTexteLigne` n'invalide **volontairement** aucun écran. La conséquence
n'avait pas été tirée : la prop `contenu` reste alors celle du **dernier
chargement de page**, et le mode lecture la rendait telle quelle. Deux effets,
le second bien pire que le premier :

1. fermer l'éditeur **réaffichait l'ancien texte** — il fallait recharger la
   page pour voir ce qu'on venait d'écrire ;
2. **rouvrir repartait sur l'ancienne `version`** : la sauvegarde suivante était
   refusée pour conflit (« modifié ailleurs ») et le travail de cette seconde
   session était **perdu**.

`TexteRiche` tient désormais l'état de **ce qu'il vient d'écrire** :
`sauverTexteLigne` remonte `{contenu, version, updatedAt}` à chaque sauvegarde
acceptée. Le serveur ne reprend la main que s'il est **au moins aussi récent**
(comparaison de **version**, jamais d'identité de prop : un `router.refresh()`
déclenché par une autre action peut très bien rapporter des données d'avant
notre save). Le rendu de lecture porte une `key` sur la version — BlockNote ne
lit `initialContent` qu'au montage.

> **La règle générale**, à ressortir au prochain autosave sans revalidation :
> *qui n'invalide pas doit afficher son propre état.* Ne pas invalider est un
> bon choix ici (l'action part à chaque frappe, aucun total ne dépend d'un
> texte) — mais il oblige le composant à être la source de vérité de ce qu'il a
> écrit, verrou de version compris.

### 14.4 Vérifié

- **`npx tsx scripts/devis-smoke.mts` — 106 contrôles** (16 de plus) : amorce et
  aller-retour du texte nu, tout ce qui **n'est pas** du texte nu (titre, gras,
  lien, deux paragraphes, paragraphe surligné), props par défaut de BlockNote
  tolérées, résumé borné et jamais vide.
- **Navigateur réel + vraie base — 34 contrôles** (compte ACHATS et compte
  MEMBRE temporaires, détruits ensuite) : la ligne s'ouvre en écriture, le menu
  « / » propose bien titre/tableau/image et **ne propose pas** code/HTML/table de
  données, le titre inséré est un vrai bloc `heading` en base, `designation` est
  le résumé brut, la version avance, cliquer ailleurs referme, le document
  survit au rechargement, un texte simple **ne monte aucune instance
  BlockNote**, une image téléversée par l'éditeur s'affiche et survit au
  rechargement, un `MEMBRE` reçoit **403** sur la route média, zéro erreur
  console.
- Le menu « / » des **Notes** a été revérifié en navigateur : il propose
  toujours bloc de code, table de données, HTML embarqué et carte lien.
- **14 contrôles sur le scénario du §14.3, sans jamais recharger** : trois
  passes d'écriture d'affilée (texte, ré-ouverture, puis mise en forme), chacune
  visible immédiatement, aucune refusée pour conflit, et un rechargement final
  qui n'apporte rien de nouveau — la preuve que l'écran disait déjà la vérité.

### 14.5 Corrigé au passage

L'en-tête de lot annonçait « 2 lignes » à côté d'un sous-total de 0,00 € quand
le lot ne contenait que des textes. Il compte désormais les lignes qui **pèsent
dans le sous-total** — options *et* textes exclus, ce que la règle du §13
disait déjà.

---

## 15. Associations de produits — la proposition à l'ajout (2026-08-07)

> Le mécanisme lui-même vit dans le Magasin : **[`MAGASIN.md` §14](MAGASIN.md)**.
> Ici, ce que le devis en fait.

« Si j'ajoute A, propose-moi D, E ou F. » Un automate appelle son alimentation
et son coffret ; une sonde de gaine appelle son doigt de gant. La table est
posée sur le **produit** — un fait vrai partout — et non sur le devis, qui n'est
qu'un consommateur.

**Le panneau n'existe que s'il y a quelque chose à décider.** Un article sans
association s'ajoute d'un clic, exactement comme avant. Ouvrir une boîte de
dialogue pour dire « rien à signaler » est le meilleur moyen de la faire fermer
sans la lire.

**Rien n'est posé tant qu'on n'a pas validé — y compris le déclencheur.**
Renoncer, c'est renoncer à l'ajout ; on ne se retrouve pas avec une ligne à
moitié posée dont on ne voulait plus. C'est aussi ce qui permet de régler la
quantité de A dans le panneau et de voir les accessoires se recalculer avant
d'écrire quoi que ce soit.

**Chaque associé rejoue SA cascade de coefficient.** `ajouterProduitAvecAssocies`
appelle `ajouterLigneProduit` une ligne à la fois, jamais un `createMany` : un
automate est en catégorie « Automate » à ×1,25, son alimentation ne l'est
peut-être pas. Un lot d'insertion perdrait exactement ce qui fait la valeur du
chiffrage.

---

## 16. Une case creusée pour ce qui se modifie (2026-08-07)

Dans une table de saisie, un `<input>` sans bordure est invisible : on ne sait
pas ce qui se corrige et ce qui se lit. Mais border une cellule sur deux ferait
une grille dans la grille.

D'où **`.champ-inline`** (`globals.css`, étage des signatures) : la surface du
fond d'entête, un **filet pointillé** sous la valeur, le survol qui cerne, le
focus qui allume au marine. Le vocabulaire du cartouche — une case à remplir sur
un plan. Posée sur la quantité, le déboursé, le coefficient, le P.V., la remise,
les libellés de ligne, le nom de lot et l'objet du devis.

> ⚠️ **Piège JSX rencontré ici** : un bloc de texte qui **commence par une
> espace ET contient une entité HTML** (`&apos;`) perd cette espace à la
> compilation — « 1 **lignesans** prix ». Le bloc voisin, sans entité, gardait la
> sienne. Corrigé par un `{" "}` explicite. Le dépôt utilisant `&apos;` partout,
> le piège existe sans doute ailleurs.

---

## 17. Ce qu'il reste à faire

- [ ] **L'ouvrir soi-même** et chiffrer une vraie affaire de bout en bout —
      c'est le seul juge du rythme de saisie. Rien de ce qui précède n'a encore
      servi sur un devis réel.
- [ ] **Amorcer les prestations** (les quatre ou cinq facturées le plus souvent)
      et poser les coefficients par catégorie.
- [ ] **Amorcer les associations** sur les articles qui en appellent d'autres
      (§15) : un automate sans son alimentation ne propose rien, et la
      fonctionnalité reste invisible tant que la table est vide.
- [ ] **La restitution client** (§8, phase 5) : PDF à en-tête, mentions,
      conditions — à cadrer une fois le moteur éprouvé. **Elle devra rendre les
      documents riches** du §14 : c'est le seul chantier que celui-ci alourdit
      (le PDF des notes, `pdf-note.ts`, sait déjà le faire — il est réutilisable).
- [ ] Trancher les questions ouvertes du §10 à l'usage.

---

## 17. Dupliquer, et viser un prix (2026-08-07)

Deux ajouts issus de la relecture de l'outil livré. Le reste de cette relecture
est en attente dans [`amelioration_devis.md`](amelioration_devis.md).

### 17.1 Duplication — à ne pas confondre avec la révision

|  | Numéro | Chaînage | Sert à |
|---|---|---|---|
| **Nouvelle révision** | le **même** | `parentId` → la version précédente | poursuivre **une** négociation, en gardant la trace de ce qui a été chiffré avant |
| **Dupliquer** | un **nouveau** | aucun | ouvrir le devis **d'à côté** : la même chaufferie pour un autre client |

D'où deux boutons aux libellés explicites plutôt qu'un seul « dupliquer » : ce
sont deux gestes différents, et les confondre casse la numérotation ou perd
l'historique de négociation.

Une copie repart en **brouillon**, **sans date d'émission**, quel que soit
l'état de la source — on duplique aussi bien un devis accepté qu'un refusé. Les
**prix restent figés tels qu'ils étaient** : c'est une copie, pas un
rechiffrage. « Tout rafraîchir » est là pour ça, et reste un geste explicite
(§2.1). Les médias des textes riches sont **recopiés**, pas partagés : supprimer
la source ne doit pas vider les images de la copie.

### 17.2 Le prix cible — l'inverse du chiffrage

Le moteur va du déboursé vers le prix. En négociation, la question part de
l'autre bout : **« le client veut 60 000 € »**. Le champ « Atteindre un prix
(net HT) » calcule la remise globale nécessaire, **et annonce la marge qui
resterait** avant d'appliquer quoi que ce soit.

Deux refus explicites plutôt qu'un calcul silencieux :

- une cible **au-dessus du total** ne produit pas une remise négative — un
  devis ne se gonfle pas par une remise, ce sont les prix qui montent ;
- **sans aucun déboursé connu**, on ne prétend pas simuler une marge.

Et le cas qui justifie la fonction : quand la cible fait passer la fourniture
**à perte**, c'est dit en rouge, chiffres à l'appui.

### 17.3 Au passage : la marge tenait compte de tout, sauf de la remise globale

La remise globale porte sur le **total**, pas sur les lignes. La marge affichée,
elle, se calculait sur les totaux de lignes — donc **elle ignorait complètement
la remise globale et se surestimait d'autant**, exactement au moment où l'on
vient de lâcher du prix.

La marge affichée est désormais la marge **nette** : la remise est répartie au
prorata du poids de la fourniture dans le vendu.

```
Fourniture vendue 10 000 (déboursé 6 000) + prestations 10 000 → total 20 000
Remise globale 10 %  =  2 000
   la fourniture pèse la moitié du vendu → elle en encaisse 1 000
   marge brute  : 10 000 − 6 000 = 4 000   (ce qui s'affichait avant)
   marge nette  :  9 000 − 6 000 = 3 000   (ce qu'on encaisse vraiment)
```

Sur un devis **sans** remise globale, les deux coïncident : rien ne change à
l'écran. Quand il y en a une, la marge brute reste lisible en dessous, en petit.

---

## 18. La passe UX & design (2026-08-07)

L'outil calculait juste, mais il ne se **lisait** pas encore comme le reste de
la plateforme : l'index posait ses filtres au-dessus d'un tableau sans cadre,
l'éditeur ouvrait sur un cartouche sans le filet des cinq signaux, et les lots
portaient leur propre grammaire d'entête. Trois écrans à raccorder à l'accueil
et à la fiche Affaire, plus un manque de fond : **une table de chiffrage ne se
lit pas pareil selon le poste**.

### 18.1 Harmonisation — la grammaire de la maison, appliquée telle quelle

| Avant | Après |
|---|---|
| Index : recherche + `<select>` d'état **flottant** au-dessus du tableau | Un **bloc au signal** (violet `ao`), `EnteteBloc` qui porte titre et compte, **barre de filtres DANS le cadre** — le patron de `AffairesListe` |
| État filtré par menu déroulant | **Puces d'état comptées** (multi-sélection), comme les états d'affaire |
| Filtres perdus au retour de fiche | Filtres **dans l'URL** (`useSyncUrl`) — l'écran se remet où on l'avait laissé, et l'adresse se colle dans un message |
| Rangée de chiffres détachée | Collée au cartouche (`-mt-px`) : un seul objet, comme `/affaires` |
| Éditeur : `.cartouche` sans estampille ni filet | Composition **exacte** du `<Cartouche>` du kit — retour au-dessus du cadre, filet des 5 signaux, ligne d'estampille close par l'état, pavé de champs |
| Badge d'état **+** menu d'état (le même mot deux fois) | Le menu **prend la couleur du badge** : il annonce et il change |
| Entêtes de lot maison | `EnteteBloc` (icône au signal, compteur, sous-total à droite) |
| Panneau de totaux à `h2.stamp` | `EnteteBloc` également — « ce qu'on montre au client » / « ce qui nous regarde » |
| Quatre pictogrammes par ligne, en permanence | `.actions-rangee` : effacés au repos, rendus au **survol et au focus clavier**. Aucun repli là où il n'y a pas de survol (le doigt) |
| L'option marquée d'une icône « copier » | Un **astérisque** — c'est le signe de l'option sur un devis, et « copier » se lisait « dupliquer la ligne » |

Le **Net HT** entre dans le pavé du cartouche : au bureau le panneau de totaux
est à droite, mais au téléphone il vient **après toutes les lignes**. On ne doit
pas dérouler un devis entier pour savoir combien il fait.

### 18.2 Chacun règle sa table — `useColonnes` (`src/ui/colonnes.tsx`)

Aux achats on regarde le déboursé et le coefficient ; en réunion on ne veut que
la désignation et le total. Plutôt que d'arbitrer une fois pour toutes dans le
code, **chaque poste règle sa table** — largeur, ordre, visibilité — et le
réglage lui reste (`localStorage`, comme le thème et la densité). C'est un
primitif du **design system**, pas une pièce du devis : il est dans `@/ui`, et
la première table venue peut l'adopter.

Trois choix portent tout :

1. **Le défaut doit être bon.** Le réglage est un ajustement, pas une
   configuration obligatoire. Les colonnes d'appoint (`masqueeDefaut` : n° Why,
   total HT, nombre de lignes, auteur, référence interne) sont **présentes mais
   repliées** — le bouton affiche « −4 », ce qui se lit comme une invitation.
   « Réinitialiser » efface l'entrée de stockage plutôt que d'y écrire le
   défaut : une table jamais réglée suivra les évolutions du code.
2. **Une colonne SOUPLE prend la place qui reste** (la désignation). Les autres
   portent une largeur en pixels, et `--tbl-min` est un `calc()` **de ces mêmes
   variables**. La table remplit donc toujours son cadre, et ne défile
   horizontalement que lorsque les colonnes fixes ne tiennent plus — **sans une
   seule mesure JavaScript**.
3. **Le tirage ne re-rend rien.** Pendant le glissement on écrit la variable CSS
   dans le DOM ; l'état n'est figé qu'au lâcher. Un devis de cent lignes se
   redimensionne sans à-coup — et **tous les lots partagent le réglage** en
   héritant des variables posées sur leur conteneur commun : leurs tables se
   lisent en colonne, elles doivent s'aligner.

Deux colonnes sont **ancrées** (poignée de déplacement, boutons de ligne) :
hors du panneau, jamais déplacées. Une poignée au milieu de la table ne rendrait
service à personne, et masquer les boutons retirerait le seul moyen de bouger
une ligne au doigt.

Le réglage se lit comme ce qu'il est — une source **extérieure** à React — via
`useSyncExternalStore` : le rendu serveur donne le défaut (aucune divergence
d'hydratation), une écriture prévient tous les abonnés d'un coup, et un autre
onglet qui règle sa table se voit ici aussi (événement `storage`).

> ⚠️ Le conteneur se retrouve par un **attribut** (`data-colonnes`), pas par une
> ref. Une ref rendue par un hook fait crier le lint React dès qu'on passe
> l'objet entier à un composant (même piège que `useLecteurCode`, voir
> `CLAUDE.md`) — et elle n'apporte rien : le tirage est un événement, pas un
> rendu.

**Accessibilité.** La poignée est un `role="separator"` focalisable : les
flèches gauche/droite règlent par pas de 16 px, `Échap` remet la largeur
d'origine (double-clic à la souris). Le panneau se ferme au clic dehors et à
`Échap`, et l'ordre se change aussi bien au glisser qu'aux flèches — le
glisser-déposer HTML5 ne fonctionne pas au doigt.

**Au téléphone**, `.table-cards` reprend la main : les largeurs ne veulent plus
rien dire (`table-layout` et `--tbl-min` sont neutralisés sous 640 px, sinon une
pile de cartes défilerait horizontalement), mais **l'ordre et les colonnes
masquées valent toujours**.

### 18.3 Le tri de l'index

Les entêtes marquées `triable` deviennent des boutons de tri (`aria-sort` posé
sur le `<th>`). Le comparateur reste chez l'appelant : seule la liste sait ce
que « trier par état » veut dire. Le premier clic part dans le sens qu'on attend
de la colonne — le texte de A à Z, **les montants et les dates du plus grand au
plus petit** : on clique « Net HT » pour voir les gros devis, pas les petits. Un
devis sans déboursé connu n'a pas de taux de marge : il se range en bout de
liste plutôt qu'au milieu, où il passerait pour une marge nulle.

---

## 19. Le pupitre, et la marche arrière (2026-08-07)

Seconde passe, après relecture d'écran. Trois choses ne tenaient pas.

### 19.1 « Ce qui se pose se retire » — le défaut le plus gênant

**On ne pouvait pas annuler une remise globale posée par le prix cible.** Les
deux champs de remise étaient **non contrôlés** (`defaultValue`) : une remise
écrite par « Appliquer » ne s'y affichait donc jamais. Rien ne disait qu'il y en
avait une, rien ne permettait de la retirer — sauf à deviner qu'il fallait
cliquer dans le champ « ou en € », vide, et en sortir.

Trois réparations, dans l'ordre de ce qu'on cherche du regard :

1. **La ligne de la cascade porte sa croix.** « Remise globale − 1 580,00 € [×] »
   — on la retire là où on la lit.
2. **Un seul champ, une bascule d'unité** (`%` / `€`), **contrôlé** et resynchronisé
   sur la valeur du serveur (même patron d'ancre que les cases du tableau). Sous
   le champ, la remise effective en euros et un bouton **Retirer**. Les deux
   champs côte à côte demandaient une phrase pour s'expliquer (« l'une ou
   l'autre : poser un montant efface le pourcentage ») : la bascule le dit sans
   phrase.
3. **Le prix cible propose « Annuler »** — et pas « retirer la remise » :
   il **remet celle d'avant**, qui pouvait très bien être un pourcentage négocié
   la semaine précédente. La proposition ne s'affiche que tant qu'elle est
   vraie : dès que la remise appliquée n'est plus celle qu'on a posée, elle
   disparaît plutôt que de mentir.

### 19.2 Le pupitre — un instrument, pas deux cartes

« Totaux » et « Marge » étaient deux cartes de même poids, lues l'une après
l'autre. Or **tout l'outil tient dans leur va-et-vient** : je lâche du prix, où
en est la marge ? D'où une seule `.planche` en trois registres :

| Registre | Ce qu'on y fait |
|---|---|
| **Le prix** | les deux aiguilles côte à côte **en grand** (net HT · taux de marge), la **jauge de marge**, la charge en main d'œuvre, puis la cascade en petit |
| **Négocier** | les deux leviers — remise décidée, prix à atteindre — et de quoi faire marche arrière |
| **Le document** | réviser, dupliquer, supprimer : ce qui ne se fait qu'une fois, dans un cadre au lieu de trois boutons flottants |

La **jauge de marge** répond à ce qu'un taux ne dit pas : *22 %, c'est
beaucoup ?* La barre montre la part du vendu qui part en achats et celle qui
reste. À perte, elle est entièrement rouge — une proportion n'aurait plus de
sens, et un segment de largeur négative non plus. Comme la jauge E/S, **chaque
segment porte son libellé** : la couleur ne fait que redoubler l'information.

Sur un petit portable la colonne peut dépasser la hauteur de l'écran : elle
défile alors **dans elle-même** (`max-h` + `overflow-y`) plutôt que de rendre son
bas inatteignable — c'est le défaut classique d'un `sticky` trop haut.

### 19.3 Trois manques de la liste « améliorations », traités au passage

- **Dupliquer une ligne** (`dupliquerLigne`) — la même sonde à un autre étage.
  La copie se glisse **juste sous l'originale** (`ordreEntre`), pas en bas d'un
  lot de quarante lignes. Et elle copie **la ligne**, pas l'article : repasser
  par le magasin recopierait le prix d'**aujourd'hui**, et la copie repartirait
  sur un déboursé différent de son jumeau sans que rien ne le dise. Le document
  riche d'une ligne TEXTE suit ; ses images sont parentées au devis, il n'y a
  rien à recopier sur le disque.
- **La charge en main d'œuvre** (`chargeMainOeuvre`, fonction pure, 7 contrôles
  au smoke). « 58 000 € » ne dit pas si l'on part pour trois jours ou pour trois
  semaines. Regroupée **par unité, sans aucune conversion** — 7 h ne font pas
  1 j chez tout le monde — et **options exclues**, comme des totaux : ce n'est
  pas du travail engagé tant que le client ne les a pas prises.
- **Le clavier dans la zone d'ajout** : `↑` `↓` pour choisir, `Entrée` pour
  ajouter, `Échap` pour fermer, la proposition active gardée dans le champ de
  vision. C'est le geste le plus répété de l'outil — le faire à la souris coûtait
  un aller-retour clavier → souris **à chaque ligne**.

Au passage, l'icône « copier » de la colonne d'actions **dit enfin ce qu'elle
veut dire** : elle duplique. L'option, elle, prend l'**astérisque** — le signe
qu'elle porte sur un devis depuis toujours.

---

## 20. « La croix ne fonctionne pas » — l'écran restait en arrière (2026-08-07)

Signalé à l'usage : le bouton × retirait bien la remise… en apparence rien ne
se passait. La mesure a démenti l'apparence, et c'est elle qui a tout appris.

### 20.1 Ce que la mesure a dit

Un harnais de bout en bout (Playwright + lecture de la base + trace serveur ET
client) a rejoué le geste des dizaines de fois. Verdict, invariable :

| | |
|---|---|
| **La base** | vidée à **tous** les coups |
| **Le serveur** | rendait bien `remiseCents=null` à **tous** les coups |
| **Le client** | ne se re-rendait pas **une fois sur cinq** — aucun rendu, pas même un rendu avec l'ancienne valeur |

Autrement dit : l'écriture n'a jamais été en cause. La réponse du serveur, non
plus. C'est son **application côté client** qui se perdait.

### 20.2 Pourquoi ça ne se voyait que là

Toutes les autres commandes de l'éditeur portent leur propre état local : une
quantité qu'on tape s'affiche parce qu'on l'a tapée, pas parce que le serveur
l'a confirmée. **Le × n'a rien de tel** — le retour du serveur est son seul
retour. Le défaut existait donc partout, invisible partout, sauf sur le premier
bouton dont l'effet ne se voit que dans la réponse.

### 20.3 Les trois causes, dans l'ordre où elles ont été éliminées

1. **Le double rafraîchissement.** `revalidatePath` (dans l'action) **plus**
   `router.refresh()` (dans le client) demandent deux fois le même écran. Les
   deux réponses se courent après ; il arrivait qu'aucune des deux ne soit
   appliquée. *Mesuré : 2 échecs sur 8.*
2. **La resynchronisation pendant le rendu.** Comparer l'identité du tableau
   `lignes` (neuve à chaque réponse) déclenchait un `setState` **pendant le
   rendu** à chaque écriture, même sans rapport. On compare désormais une
   **empreinte** de l'ordre — ce qui change vraiment. *Restait 3 sur 15.*
3. **`useTransition`.** C'est la cause principale. Une écriture **n'est pas un
   changement de vue** : React se réserve le droit d'interrompre puis de
   rejouer un rendu de transition, et la réponse s'y perdait. Un simple booléen
   `enCours` rend le même service (griser les commandes) sans cette
   contrepartie. *Passé à 1 échec sur 20.*

### 20.4 Et le dernier vingtième : on ne le subit pas, on le peint

Même avec un seul rafraîchissement et sans transition, le routeur de Next
laissait tomber une réponse de temps en temps. Plutôt que de courir après le
framework, **l'écran affiche le retrait sans attendre** — le même principe que
l'ordre des lignes au glisser-déposer, et il tient en une expression, sans
aucun état à nettoyer :

```ts
const entetePeinte =
  remiseLocale && remiseLocale.avant === empreinteRemise   // le serveur montre encore l'ancienne
    ? { ...entete, remiseGlobalePourMille: null, remiseGlobaleCents: null }
    : entete;                                              // il a bougé → c'est lui qui parle
```

La valeur locale ne s'applique **que tant que le serveur n'a pas bougé**. Dès
qu'il répond — de lui-même ou par une autre écriture — il reprend la main : pas
de nettoyage, pas d'état qui traîne, pas de mensonge possible.

**Résultat : 40 cycles sur 40, puis 20 sur 20 sur le build final.**

### 20.5 Ce qu'il faut en retenir ailleurs

- **Un seul rafraîchissement par écriture.** Soit l'action revalide, soit le
  client rafraîchit — jamais les deux pour le même écran.
- **Pas de `useTransition` autour d'une écriture.** Un booléen suffit.
- **Pas de `setState` pendant le rendu** pour se resynchroniser sur une prop :
  une `key`, une empreinte, ou rien.
- **Tout bouton dont le seul retour est la réponse du serveur doit peindre son
  effet** sans l'attendre.

### 20.6 Au passage : la liste des clients

Le champ Client de l'éditeur était un `<datalist>` natif — le seul de l'appli :
liste non filtrée à la frappe selon le navigateur, aucune apparence commune,
pas de navigation au clavier. Il prend la **combobox de la maison**, celle de la
fiche affaire et de la création de devis. `<Combobox>` gagne au passage un
`onBlur` (facultatif) pour enregistrer une **saisie libre** — un nom de client
qui n'est pas encore dans la base ne passe par aucun `onPick`.

---

## 21. La restitution client — le document qui part chez le client (2026-08-08)

Jusqu'ici, un devis chiffré ne **sortait pas**. Le moteur savait tout calculer,
et le seul moyen de le montrer à un client était de retaper les lignes dans
WhySoft. C'est cette dernière marche que ce chantier franchit : une **page HTML
de présentation**, à l'adresse publique `/d/{jeton}`, qu'on envoie par mail — le
client l'ouvre, la lit sur son téléphone, l'enregistre en PDF ; ou bien on lui
envoie le PDF nous-mêmes.

Le point de départ est dans `public/devis_template/` : deux devis réels sortis de
l'ERP historique. On en garde la **structure** (cartouche, pavé destinataire
encadré, tableau à en-tête marine, conditions financières, bon pour accord, pavé
des totaux) et les **mentions** ; on abandonne la mise en page pour celle de la
maison — celle du document de liste de points (`impression-print.css`).

### 21.1 Les décisions, et ce qu'elles coûtent

Six choix ont été arrêtés avec Augustin le 2026-08-08. Ils sont notés ici avec
leur contrepartie : c'est elle qu'on oublie six mois plus tard.

| Choix | Contrepartie assumée |
|---|---|
| **Interrupteurs par devis** (prix unitaires, sous-totaux de lot, options) | Trois réglages de plus sur l'écran. Le défaut est le devis détaillé, celui de la maison. |
| **Le lien montre le devis VIVANT**, pas un instantané | Modifier un devis publié change ce que le client voit (§21.2). |
| **Page web continue**, pas des feuilles A4 simulées | Les sauts de page sont laissés au navigateur, guidés par des `break-inside`. |
| **PDF généré côté serveur** + journal de consultation | Il faut un Chromium sur la machine (§21.5). |
| **Pas de lettre d'accompagnement** : le document ouvre sur le cartouche | Un devis sans phrase d'introduction. C'est plus direct, et c'est voulu. |
| **Conditions et mentions GLOBALES**, rien par devis | La durée de réalisation et les remarques particulières deviennent des constantes — ce qu'elles étaient déjà en pratique (identiques sur les deux devis historiques). |
| **Pas d'acceptation en ligne, pas de CGV** | Le cadre « Bon pour accord » s'imprime mais ne s'actionne pas. |

### 21.2 « Le devis vivant » — un choix qui va contre le défaut n°1

[`amelioration_devis.md` §1](amelioration_devis.md) reproche à l'outil de laisser
**modifier un devis émis sans rien dire**. Servir le lien public depuis la base
aggrave exactement ce défaut : le prix change sous les yeux du client.

Le choix est celui d'Augustin et il est appliqué tel quel. Deux garde-fous, qui
ne coûtaient rien, le rendent au moins **visible** :

1. le document porte en clair **« mis à jour le … »** dès que `updatedAt` dépasse
   `publieLe` de plus d'une minute — le client peut s'apercevoir seul que ce
   qu'il lit n'est plus ce qu'il avait reçu ;
2. le **journal de consultation** dit s'il avait déjà ouvert le lien avant la
   modification — donc s'il faut le prévenir.
3. le bloc de publication **avertit** dès qu'on a touché à un devis publié, et
   renvoie vers la **nouvelle révision** : c'est elle qui garde une trace de ce
   qui a réellement été envoyé (une révision **ne reprend ni le jeton ni la date
   de publication** de son parent, justement pour ça).

### 21.3 Ce qui ne peut PAS fuir

La règle est simple à énoncer et elle porte tout le chantier : **on ne montre
jamais le déboursé, ni le coefficient, ni la marge, ni la référence interne.**

Elle n'est pas tenue par le composant — elle est tenue par la **requête**.
`getDevisPublic()` (`queries.ts`) ne renvoie ni `debourseCents`, ni
`coefMillieme`, ni `refInterne`, ni `numeroWhy`, ni la note interne du devis, et
neutralise `coefDefautMillieme`. Un champ absent de la réponse ne peut pas être
affiché par distraction. Le harnais le vérifie sur la page ET dans le PDF.

Le **n° Why** ne sort pas non plus : c'est notre référence de CRM, le document
porte déjà son numéro de devis.

### 21.4 Le rendu sans JavaScript, et le rendu serveur des textes riches

La page publique s'affiche **sans une ligne de JavaScript** : `DocumentDevis` est
un composant serveur. Seule la barre du lecteur (imprimer, télécharger) est un
îlot client. Trois raisons :

1. **l'impression et le PDF ne dépendent d'aucune hydratation** — un
   « Chargement… » capturé par le moteur de PDF, c'est un devis blanc ;
2. la page n'embarque pas un éditeur de 200 ko pour afficher trois paragraphes ;
3. le HTML produit est le nôtre, donc il se pagine (`break-inside`).

Conséquence : les **textes libres** (documents BlockNote, §14) ne peuvent pas
être rendus par `lecture-impl.tsx`, qui est un composant client. D'où
`src/lib/editeur-riche/rendu-serveur.tsx` — **blocs JSON → HTML**, en lecture
seule. Son contrat est explicite : il rend un **sous-ensemble fidèle**, et ce
qu'il ne sait pas rendre est **dit** plutôt qu'escamoté (même règle que « ce
qu'on ne sait pas chiffrer est dit »). Le **HTML embarqué n'est jamais injecté** :
cette page est servie sans session, sur internet.

Le cas courant ne monte rien du tout : `texteNu()` rend la chaîne d'un document
réduit à un paragraphe sans mise en forme — un devis porte dix commentaires, pas
dix documents.

### 21.5 Le PDF : un vrai navigateur, pas une bibliothèque

`src/lib/pdf-navigateur.ts` imprime **la page publique elle-même** avec un
Chromium sans interface. Deux raisons de ne pas composer le PDF autrement :

- une bibliothèque PDF (pdfmake, jsPDF) voudrait dire **deux mises en page** à
  tenir, qui divergeraient à la première retouche ;
- l'autre famille d'export du dépôt (`pdf-note.ts`, `apercu-pdf.ts`) **rasterise
  l'écran** : texte non sélectionnable, non copiable, flou à la loupe. Un devis
  se lit, se recherche et s'archive.

Le PDF s'imprime **depuis le lien public**, pas depuis un écran interne : la page
est joignable sans session, donc il n'y a ni cookie à fabriquer ni identité à
confier au navigateur. Corollaire : **pas de PDF avant publication** — l'aperçu
interne (`/perso/gus/devis/[id]/apercu`) rend le même document et s'imprime au
navigateur, ce qui couvre l'avant-envoi.

Trois pièges, tous rencontrés :

- **le binaire.** Recherché dans l'ordre : `CHROMIUM_PATH`, le cache playwright,
  `/usr/bin`. Le nom du dossier a changé au fil des versions
  (`chrome-linux` → `chrome-linux64`, `chrome-headless-shell-linux64`) : on
  **cherche les fichiers par leur nom**, on ne compose pas un chemin en dur.
  Absent → **503 avec un message en clair**, et l'écran retombe sur « Imprimer ».
  Dans l'image Docker : `apk add chromium` (voir `Dockerfile`).
- **le tracing.** `playwright-core` lit `browsers.json` par `readFile`, pas par
  `import` : le tracing de la sortie standalone ne le voyait pas et la route
  échouait **en production seulement** (`Cannot find module …/browsers.json`).
  D'où l'entrée `outputFileTracingIncludes` dans `next.config.ts` — même piège
  que les gabarits Excel des notes de frais.
- **la pagination.** C'est Chromium qui pose le **pied légal et le numéro de
  page** sur chaque page (`footerTemplate`) ; le document masque alors le sien
  (`?pdf=1` → classe `pour-pdf`). L'impression navigateur, elle, n'a pas ce
  gabarit : elle garde le pied du document, une fois, à la fin — comme une lettre.

### 21.6 ⚠️ Le piège qui rend le PDF blanc, et celui qui vide la page

Les deux se tiennent, et **aucun des deux ne produit d'erreur**.

Le patron d'impression global (`globals.css`) fait deux choses opposées :

```css
.print-root { display: none; }                    /* à l'écran */
@media print {
  body * { visibility: hidden; }                  /* à l'impression */
  .print-root, .print-root * { visibility: visible; }
  .print-root { position: absolute; inset: 0; }   /* borné à UNE page */
}
```

Il a été écrit pour des **aperçus d'impression cachés dans un écran normal**
(liste de points, document d'affectation). Or ici, le document **EST** la page.
Il faut donc les deux moitiés :

- `DocumentDevis` porte la classe **`print-root`** → sans elle, le PDF sort
  **entièrement blanc** (et reste un PDF valide, à deux pages, portant des
  polices : celles du pied de page que Chromium ajoute lui-même — tous les
  contrôles automatiques passaient au vert) ;
- `document-devis.css` **rétablit** `display: block` (deux classes valent mieux
  qu'une, aucun `!important`) → sans cette règle, la page publique est **blanche
  à l'écran** ;
- il **garde `position: absolute`** et ne relâche que `height` et `bottom`.
  C'est contre-intuitif et ça a coûté une correction : remettre le document dans
  le flux (`position: static`) semblait plus propre, et **l'aperçu interne
  n'imprimait alors qu'UNE PAGE sur un devis de quatre**. Le document y vit dans
  la coquille de l'application, dont le cadre est `h-screen overflow-hidden` avec
  un `<main>` en `overflow-auto` (`src/app/(app)/layout.tsx`) : dans ce flux, il
  est clippé à une hauteur d'écran. Un élément **absolument positionné n'est pas
  clippé par l'`overflow` d'un ancêtre non positionné** — c'est ce qui l'en sort.
  Relâcher `height: auto; bottom: auto` lui rend le droit de dépasser la première
  page. C'est exactement la formule de `impression-print.css`, et elle n'était pas
  décorative.

### 21.6 bis ⚠️ Un `<tfoot>` se répète — comme un `<thead>`

Le sous-total de lot était dans un `<tfoot>`. À l'impression, un pied de tableau
**se répète en bas de chaque page**, exactement comme l'en-tête se répète en
haut. Sur un lot qui s'étale sur deux pages, on imprimait donc
« Sous-total du lot : 8 127,00 € » sous une demi-liste, puis à nouveau plus loin.

Un total qui n'est pas celui de ce qui est au-dessus, sur un document commercial,
c'est un chiffre qu'on vient nous contester. La répétition de l'en-tête, elle, est
souhaitable — d'où `display: table-row-group` sur le seul `tfoot` : il redevient
un groupe de rangées ordinaire et ne paraît qu'une fois, à sa place.

Le harnais compte désormais **un sous-total par lot, pas un de plus** (§21.9).

### 21.7 Sur un téléphone

Le client ouvre le lien depuis sa boîte mail, au doigt. Sous 560 px, la table des
prix **se replie en fiches** — même parti que `.table-cards` de l'interface, avec
les intitulés restitués depuis `data-label`. Le repli plutôt que le défilement :
un tableau de prix qu'on balaie de gauche à droite cache justement les colonnes
qui comptent, et **un client ne devine pas qu'il doit glisser**. Les pavés à
largeur fixe (destinataire, colonne des totaux) s'empilent, et les totaux passent
devant les conditions.

### 21.8 Le modèle

- `Devis.jetonPartage` / `partageExpireLe` / `publieLe` — socle de partage
  commun (`src/lib/partage/`). **`partageActif()` est le seul juge** : un jeton
  échu reste en base pour être **prolongé à la même URL**, donc tout
  `if (jetonPartage)` est un trou. Les durées offertes (`dureesPartageDevis`)
  n'ont **aucun illimité**, et la première — le défaut — est calée sur la
  **validité de l'offre** : un lien qui survit à l'offre qu'il porte laisse un
  prix périmé accessible au monde entier.
- `Devis.destinataire` — le pavé du document, **tel qu'il s'imprime**. Ce n'est
  pas l'adresse du client : un service, une TSA de facturation, une personne
  changent d'une affaire à l'autre (les deux devis historiques le montrent), et
  `Client` ne porte aucune adresse. Le jour où il en portera une, elle servira à
  **pré-remplir** ce pavé, jamais à le remplacer.
- `Devis.montrerPrixUnitaires` / `montrerSousTotauxLots` / `montrerOptions` —
  **repris par une révision et par une copie** (c'est de la présentation, pas un
  prix) ; ni le jeton ni la date de publication ne le sont.
- `ReglageSociete` — **ligne unique** (`id = "societe"`), tout global. Volontairement
  du **texte** pour ce qui ne sert qu'à être imprimé (« SAS au capital de
  38 112,25 € ») : le document ne calcule rien avec, et une mention légale mal
  modélisée est une mention légale fausse. Absente en base → `SOCIETE_DEFAUT`,
  renseigné avec les valeurs réelles : un premier devis imprimé sans pied de page
  serait **faux**, pas « à compléter ».
- `User.fonction` — le devis est signé de l'**auteur**, nom **et** qualité.
- `DevisConsultation` — écrit par une **balise côté navigateur**, jamais pendant
  le rendu : un aspirateur de liens (aperçu de messagerie, antivirus de la boîte
  mail du client) n'exécute pas de JavaScript et ne doit pas compter comme une
  lecture, sinon la seule question qu'on se pose reçoit toujours oui. IP
  **tronquée**, et deux ouvertures du même lecteur à moins de 30 minutes comptent
  pour une : sans ça, trois rafraîchissements feraient « consulté 3 fois ».

Sur l'index, la colonne **« Envoi »** dit ce qui s'est passé là où « Émis » dit ce
qu'on a décidé : *en ligne, jamais ouvert* / *vu 3×*. C'est elle qui décide d'une
relance.

### 21.9 Vérifié, et comment

```bash
npx tsx scripts/devis-smoke.mts               # 169 contrôles (moteur pur + document)
npx tsx scripts/devis-restitution-smoke.mts   # 49 contrôles, vraie base + vrai serveur
npx tsx scripts/devis-document-apercu.mts     # REGARDER : écran, téléphone, PDF
```

Le second couvre ce que le premier ne peut pas voir : la page répond **sans
session**, le déboursé n'est **ni dans la page ni dans le PDF**, un jeton
inconnu / échu / révoqué donne 404, le média d'un devis n'est pas servi par le
jeton d'un autre, la balise compte **une** visite pour trois rafraîchissements,
et le PDF porte du **vrai texte extractible** (lu avec pdf.js). Il fabrique en
plus un devis de **trois lots × 14 lignes** — assez pour qu'un lot traverse une
coupure de page — et vérifie que rien n'est perdu, que le cadre à signer survit
et qu'il y a **un sous-total par lot, pas un de plus**.

⚠️ **Ce que ce harnais NE couvre PAS** : l'impression depuis l'aperçu interne,
qui demande une session — et c'est pourtant là que la pagination s'est cassée
(§21.6). Après toute retouche de `document-devis.css`, ouvrir l'aperçu d'un devis
de trois pages et l'imprimer à la main.

⚠️ **Ce dernier point a été renforcé après coup.** La première version se
contentait de chercher `/Font` dans le binaire — et a validé un PDF
**entièrement blanc** (§21.6). Un contrôle qui ne lit pas ce qu'il prétend
vérifier ne vérifie rien.

⚠️ **Et l'extraction sème des espaces.** Chromium écrit « BO N PO UR AC C O RD »
et « CHARGÉ D 'AFFAI RE S » dans la couche de texte (effet du `letter-spacing` des
estampilles) : chercher un libellé tel qu'on l'a écrit échoue sur du contenu
pourtant présent, et ça a failli faire corriger un faux bug. D'où `sansEspaces()`
dans le harnais — qu'il ne faut **jamais** employer pour vérifier une ABSENCE de
montant : sans les espaces, « 840,00 » se trouve dans « 1 840,00 ».

**Les écrans internes ont été ouverts en navigateur** (compte ADMIN temporaire,
21 contrôles) : le bloc « La maison » des référentiels avec son aperçu de pied de
page, le bloc de publication de l'éditeur, la publication (jeton posé, devis passé
en ÉMIS, échéance à 30 jours = la validité), l'aperçu client interne, et la
révocation (jeton effacé). Aucune erreur JavaScript sur les quatre écrans.

Le troisième script existe pour la même raison : **trois défauts réels de ce
document étaient invisibles aux contrôles fonctionnels** — le PDF blanc, les
puces de liste disparues (le reset de l'application enlève `list-style`), et le
débordement horizontal sur téléphone. À relancer après toute retouche de
`document-devis.css` ou de `rendu-serveur.tsx`.

### 21.10 Ce qui reste

- [ ] **L'ouvrir soi-même** : régler les valeurs de la maison
      (`/perso/gus/devis/referentiels`, bloc « La maison »), renseigner sa
      **fonction** dans les utilisateurs, publier un vrai devis et l'envoyer.
- [ ] **Décider du sort de la lettre d'accompagnement.** Elle a été écartée ;
      si elle manque à l'usage, c'est un bloc de plus avant le cartouche, avec
      un texte type dans les réglages.
- [ ] **L'acceptation en ligne** (le client signe, le devis passe ACCEPTÉ) et le
      **dépôt automatique du PDF dans les Documents de l'affaire** : écartés de
      cette version, ni l'un ni l'autre ne demande de reprise pour être ajouté.
- [ ] **La révision comme trace de l'envoyé** (§21.2) : tant qu'on corrige un
      devis publié au lieu de le réviser, le client voit les corrections.

---

## 22. La seconde mise en page de l'éditeur (2026-08-09)

Signalé à l'usage : **« les options sur le côté droit, c'est un peu le
fouillis »**. Un handoff de design a suivi
(`public/devis_template/design_handoff_devis_ux/`, quatre propositions ; c'est
**2a** qui est retenue). Cette section dit ce qui a été repris, ce qui ne l'a
pas été, et pourquoi.

Elle a d'abord vécu **à côté** de l'historique, sur une route parallèle, le
temps de la validation — un double ne doit pas pouvoir casser l'original. Elle
l'a **remplacé** le 2026-08-10 (§22.7) : il n'y a plus qu'un écran de chiffrage,
`src/tools/devis/editeur-devis.tsx` + `editeur-devis.css`. Le moteur, les
actions, les gardes et le modèle n'ont jamais bougé — seule la disposition a
changé.

### 22.1 Le diagnostic — trois métiers dans une colonne

La colonne de droite empilait **quatre blocs toujours dépliés** dans 320 px :
le prix, la négociation, la publication, le document. Trois défauts de fond :

1. **Trois temporalités au même poids visuel.** Ce qu'on surveille en continu,
   ce qu'on manipule de temps en temps, et ce qui se fait une fois en fin de
   course avaient le même cadre, la même taille, la même place.
2. **L'instrument permanent était le premier à sortir de l'écran.** Dès que la
   colonne défilait — c'est-à-dire toujours — les deux aiguilles que le §19.2
   voulait garder sous les yeux partaient vers le haut.
3. **Le prix était écrit trois fois** (cartouche, aiguille du pupitre,
   cascade), le taux de TVA trois fois, et « annuler une remise » existait à
   trois endroits.

### 22.2 Ce que la disposition change

| | Avant | Après |
|---|---|---|
| Coquille | page qui défile | **pleine hauteur** : seule la zone de lignes défile |
| Le prix | trois endroits | **la barre de totaux, en bas, dans le bâti sombre** — et nulle part ailleurs |
| Colonne de droite | 4 blocs toujours ouverts | **3 onglets** : Composition · Négocier · Publier |
| Identification | pavé de champs permanent (4 lignes d'écran) | **pastilles cliquables** dans la barre de devis (client, affaire, coef, TVA, validité) |
| Les lots | un `.bloc` + une table chacun | **un seul tableau**, entête de colonnes collé en haut, entête de lot collé dessous, repliable au chevron |
| Navigation | défiler | **rail de lots** à gauche — navigation ET sous-totaux au même endroit, repliable, ouvert par défaut |
| Ajouter une ligne | un bouton qui déplie un champ | **ligne de saisie permanente** au bas de chaque lot |
| Réviser / dupliquer / supprimer | trois boutons dans la colonne | menu `⋯` de la barre de devis |

La **barre de totaux est du bâti**, pas du plan de travail : même famille que le
rail et la barre de chrome. Ses teintes d'état y sont **relevées**
(`color-mix` sur `--success` / `--danger` dans `editeur-devis.css`) — le vert
du plan de travail, posé sur ce fond, ne se lit plus. Même raison que la
variante `-lift` des signaux.

Les **couleurs de lot** sont **dérivées du rang** (`signalLot`), jamais
stockées : un champ en base pour une pastille de 8 px ne se défend pas, et
l'ordre des lots est déjà ce qu'on lit. On pioche dans les signaux E/S — `ao`
est réservé, c'est le signal de l'outil Devis lui-même.

### 22.3 Ce qui n'a PAS été repris du handoff, et pourquoi

- **Ses tokens** (arrondis 7-10 px, indigo `#6d5cf5`, badges pilule, ombres).
  On garde la charte : angles droits, sans ombre, laiton en accent,
  Archivo/Plex. C'est la structure qui était demandée, pas une seconde identité
  visuelle pour un seul écran.
- **Sa barre d'application** (fil d'ariane, recherche, avatar) : c'est déjà le
  rail + la barre de chrome de DumTools. On s'y raccorde.
- **`⌘K` pour le catalogue** : le raccourci appartient à la palette de recherche
  globale. On ne le vole pas.
- **Un bouton « Densité »** dans la table : le réglage confort/compact existe
  déjà, global, et pilote toute l'interface en rem. Deux densités concurrentes
  sur le même écran, c'est le fouillis qu'on répare.
- **Les fonctions neuves** — sélection multiple et actions groupées, marge par
  ligne et par lot, objectif de marge et ses seuils, historique des versions,
  points d'attention *calculés*. Écartées de cette passe : la demande était la
  mise en page. Les « points d'attention » du panneau ne montrent donc que des
  signaux **que le moteur produit déjà** (`nbSansPrix`, `nbPerimees`,
  `nbOptions`), rassemblés là où on les cherche.

### 22.4 Trois pièges, tous invisibles aux contrôles

1. **La coquille ne donne pas sa hauteur.** `<main>` a bien une hauteur définie,
   mais il range le contenu dans le conteneur d'animation (`.anim-page`), qui se
   dimensionne sur son contenu : `h-full` ne résolvait rien. D'où la règle
   `.anim-page:has(> [data-plein-page])` dans `globals.css` — accordée **à qui
   la demande seulement**, pour ne rien changer aux pages qui défilent.
2. **Une cellule pleine largeur n'est pas une cellule de carte.** Sous 640 px,
   `.table-cards` range à droite toute cellule sans `data-label`
   (`justify-content: flex-end`, `text-align: right`). L'entête de lot, un
   `colSpan` sans libellé, **sortait par la gauche de l'écran**, titre coupé.
   D'où `.dv2-cell-pleine`, qui lui rend un comportement de bloc.
3. **Le rembourrage d'une table de consultation ne convient pas à une table de
   saisie.** Le `1 rem` de `.data-table` ne laissait que 62 px de champ sur une
   colonne de 94 : « 1 494,00 € » s'y affichait « 1 494, ». Resserré à
   `0.45 rem`.

Et une décision qui se voit : la **référence est repliée par défaut**. Trois
colonnes se partagent la largeur restante une fois le rail et le panneau
servis, et la désignation est une **zone de texte qu'on modifie** — elle ne se
coupe pas à l'ellipse comme sur la maquette. Sortie, la référence lui prenait
cent pixels et « AUTOMATE DISTECH ECY-S1000-C50 » tombait sur trois lignes.
Repliée, elle continue de s'afficher **sous** la désignation (le rendu le
prévoyait déjà) et la table tient **jusqu'à 1280 px sans défiler**. Un clic sur
« Colonnes » la ressort.

### 22.5 Vérifié, et comment

- `npx tsc --noEmit`, `npx eslint`, `npm run build` — au vert.
- `npx tsx scripts/devis-smoke.mts` — **169 contrôles**, moteur inchangé.
- **Regardé** en prod locale, à trois tailles (1440, 1280, 390) et sur les trois
  onglets, avec un vrai devis et une vraie session : aucune erreur console. Les
  trois pièges ci-dessus n'ont été trouvés que là.

### 22.6 Première relecture — cinq corrections (2026-08-10)

Regardé à l'écran, cinq choses ne tenaient pas. Elles disent toutes la même
chose : **ce qui est important doit être gros, et ce qui ne sert qu'en passant
doit rendre sa place**.

1. **Le cycle de vie n'était pas visible.** Passer un devis de brouillon à émis,
   puis accepté, est la décision la plus lourde de l'écran — c'était un `<select>`
   de six millimètres à côté du numéro. Remplacé par une **piste à trois
   jalons** (`CycleEtat`) : le courant allumé (`.led-cur`), les précédents
   franchis, le suivant offert en clair. **Le refus n'est pas sur le chemin** —
   il sort par le côté, comme dans la vraie vie d'un devis, et une fois posé il
   prend la parole. La couleur ne porte jamais l'information seule : chaque
   jalon garde son libellé.
2. **La TVA se tapait à la main pour un choix binaire.** Sur un devis GTB il n'y
   a en pratique que deux réponses : 20 %, ou **0 % en autoliquidation** quand on
   est sous-traitant du bâtiment — et ce second cas, le seul qui se *décide*,
   n'était annoncé nulle part. Deux boutons, plus « Autre taux… » : 10 % existe,
   et un taux n'est pas notre décision.
3. **Le n° Why était caché dans le panneau qui l'ouvrait.** C'est pourtant sous
   ce numéro que le devis est appelé au téléphone. Il s'affiche maintenant
   **dans** la pastille, en mono et au laiton, à côté du nom de l'affaire. La
   pastille vide dit « Rattacher à une affaire » au lieu de « Sans affaire » —
   un état constaté n'invite à rien.
4. **Le rail de lots prenait 160 px en permanence pour trois cartes.** Il dort
   maintenant **replié** (une tranche de 36 px qui porte les pastilles des lots :
   de loin, on sait déjà combien il y en a), **s'ouvre au survol**, et
   **s'épingle** d'un clic. Le réglage reste au poste (`useSyncExternalStore`,
   comme les colonnes). ⚠️ Au survol il s'ouvre **en surimpression**, jamais en
   poussant le tableau — sinon la table se redessine sous le curseur au moment
   précis où l'on passe à côté. C'est le seul endroit du plan de travail où une
   ombre est permise : le rail survole vraiment, il ne s'y pose pas.
5. **« Référentiels » quittait un chiffrage en cours.** Le bouton invitait à
   partir changer la politique commerciale de la maison au milieu d'un devis. Il
   ne vit plus que sur **l'accueil de l'outil** — retiré des deux éditeurs.

Effet de bord heureux du point 4 : le tableau récupère 160 px, et les
désignations de catalogue tiennent enfin **sur une seule ligne**.

**Complément (même jour) — cliquer dans le panneau flottant installe le rail.**
Un panneau de survol qui se referme dès qu'on a cliqué dedans laisse revenir le
curseur sur une tranche de 36 px : on venait de choisir un lot, on n'a plus rien
pour choisir le suivant. **Cliquer une carte de lot épingle donc le rail** — le
geste dit « je travaille avec cette liste ». Deux conséquences tenues :

- le défilement vers le lot est repoussé **après le rendu**
  (`requestAnimationFrame`) : l'épinglage fait passer le rail de 36 à 160 px, le
  tableau se remet en page, et un `scrollIntoView` lancé avant viserait la
  position d'avant ;
- **« Nouveau lot » est la seule exception** : on crée un lot en passant, on ne
  s'installe pas pour autant. Mais tant que la saisie est ouverte le panneau
  **tient hors survol** — sortir la souris pour aller au clavier ne doit pas
  effacer ce qu'on est en train d'écrire.

Vérifié au harnais navigateur, huit contrôles : replié au chargement · table
inchangée au survol (la surimpression ne pousse rien) · épinglé après clic sur
un lot · table resserrée une fois épinglé · épinglage retenu au rechargement ·
replié dès que la souris s'éloigne · saisie de lot tenue hors survol ·
« Nouveau lot » n'épingle pas.

### 22.7 La disposition est validée, l'éditeur historique est parti (2026-08-10)

Validée à la relecture, après les corrections du §22.6. L'ancien écran a donc
été **supprimé** plutôt que gardé « au cas où » : deux éditeurs sur le même
modèle, c'est deux fois chaque correction, et le second n'est jamais à jour.

Ce que la promotion a demandé, au-delà du `rm` :

- la route `/perso/{qui}/devis/{id}/v2` disparaît, la route canonique rend le
  nouvel écran ; **plus aucun lien interne ne porte `/v2`** (révision,
  duplication, lien vers la révision précédente) ;
- `editeur-devis-v2.{tsx,css}` reprennent le nom sans suffixe, la classe racine
  `.devis-v2` devient `.editeur-devis` et le préfixe `dv2-` devient `ed-` ;
- ⚠️ **les clés de stockage ne bougent PAS** (`devis.lignes.v2` pour les
  colonnes, `dumtools.devis.railEpingle` pour le rail). Les renommer aurait
  remis à zéro des réglages de poste déjà faits — une clé de stockage n'est pas
  un nom public ;
- `BlocPublication` perd son rendu « en bloc » et son prop `nu` : elle n'a plus
  qu'un consommateur, l'onglet ;
- l'entrée « Ancienne mise en page » du menu `⋯` part avec l'écran qu'elle
  ouvrait.

Vérifié : `tsc`, `eslint`, `build`, `devis-smoke` **169/169**, et au harnais
navigateur — `/v2` répond **404**, le cycle d'état, la barre de totaux et le rail
replié sont là, aucun lien résiduel vers `/v2`, l'onglet Publier rend, et
« Référentiels » est bien sur l'accueil de l'outil.

### 22.8 Ce qui reste à trancher

- [ ] Les **fonctions neuves du handoff** listées en 22.3, si elles manquent à
      l'usage. La sélection multiple est la seule qui ne demande **aucune
      reprise de données**.
- [ ] **Le nombre de lots** décide du sort du rail : à deux ou trois lots il
      coûte 160 px pour trois cartes (il est replié par défaut depuis §22.6,
      donc la question est devenue peu urgente).
- [x] ~~**Exposer `LotDevis.note`**~~ — FAIT le 2026-08-12 : elle est devenue la
      **description du bloc**, éditable dans le cartouche « ce que le client
      lira » et imprimée **en puces** (une ligne saisie = une puce). Voir
      [`DEVIS-DETAIL.md`](DEVIS-DETAIL.md).
- [x] ~~**Le fil du devis**~~ — FAIT le 2026-08-10, [`DEVIS-FIL.md`](DEVIS-FIL.md).

---

## 23. Le bloc du client — ce qu'on chiffre, ce qu'il lit (2026-08-12)

Cadrage et rapport de livraison complets : **[`DEVIS-DETAIL.md`](DEVIS-DETAIL.md)**.

Deux collègues demandaient la même chose sans qu'on le voie : l'un ajoute un
détail sous « Fabrication armoire électrique », l'autre veut cacher le détail
d'un « Ensemble de matériel Distech ». Ce sont **les deux faces d'un seul
besoin** — le premier cache aussi son chiffrage (ses heures de câblage), le
second ajoute aussi du texte (« COMPRIS DISTECH + PROGRAMMATION »).

**Un lot n'est donc plus un chapitre : c'est un BLOC du client**, avec deux
faces — les lignes qu'on chiffre, et la désignation + description + prix qu'il
lit. `LotDevis.rendu` (`DETAILLE` / `CONDENSE`) et `LotDevis.libelleClient`, plus
une fonction pure `condenserLots()`. **`calculerDevis` n'a pas bougé** : ses 169
contrôles sont inchangés et verts, c'est la preuve.

Ce qui porte le chantier :

1. **La garde est dans la REQUÊTE.** `getDevisPublic` condense avant de
   répondre : les lignes réelles d'un bloc forfaitaire ne sortent pas du serveur.
   Même doctrine que le §21.3, et le test de fuite porte un **témoin négatif**
   (le bloc détaillé voisin DOIT apparaître) et s'applique **aussi au PDF**.
2. **Le prix appartient au BLOC, pas à la ligne.** Un bloc condensé affiche
   toujours son montant — même « prix unitaires » décoché, même sur un devis d'un
   seul lot — et n'a jamais de sous-total sous lui. Sans cette règle, le client
   reçoit une phrase et aucun chiffre.
3. **Jamais le titre ET la phrase.** Sur un bloc condensé, `LotDocument.titre`
   est `null` : la phrase du client remplace le bandeau, elle ne s'y ajoute pas.
   Un filet (`.lot-condense`) le sépare du bloc précédent, sans quoi il se lit
   comme sa suite — surtout au téléphone.
4. **L'éditeur DESSINE le bloc** : filet vertical, cartouche « ce que le client
   lira » posé dans le tableau, badge `forfait`/`détaillé` sur l'entête et dans le
   rail, et **« + Nouveau forfait »** à côté de « Nouveau lot » — assembler le
   même résultat en quatre gestes ferait contourner l'outil.
5. **Le bordereau interne** = l'aperçu avec `?detail=1` : bandeau « vue interne »
   (⚠️ **dans** `.print-root`), détail révélé **avec `refInterne`** — sans la
   référence fournisseur, la feuille n'est pas un bon de commande. Ce drapeau ne
   vit que le temps d'une URL : persisté, il serait à un clic de tout dévoiler.

⚠️ **Le type de retour de `condenserLots` est marqué** (`LignesPourClient`) : la
ligne de synthèse est une `LIBRE` sans déboursé, donc du poison pour tout calcul
de marge — c'est exactement le défaut qu'on corrige. Le compilateur refuse la
confusion.

Tests : `devis-smoke` **200/200** (169 d'origine inchangés), `devis-restitution-smoke`
**63/63**, et **regarder** avec `devis-document-apercu.mts` — trois défauts réels
(puces perdues, blocs collés, champ tronqué) n'étaient visibles qu'à l'œil.
