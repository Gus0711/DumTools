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
