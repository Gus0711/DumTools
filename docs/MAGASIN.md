# Outil « Magasin » — conception & plan

> Doc de référence du prochain outil : **le référentiel produit et le stock**.
> À lire après [`ROADMAP.md`](ROADMAP.md) (priorités), [`ARCHITECTURE.md`](ARCHITECTURE.md)
> et [`AFFAIRES.md`](AFFAIRES.md).
> **Statut : IMPLÉMENTÉ le 2026-07-28** — les phases 1 à 5 d'un coup, à la
> demande d'Augustin. `tsc` + `eslint` + `next build` passent, et un test de
> bout en bout contre la vraie base vérifie les invariants
> (`npx tsx scripts/magasin-smoke.mts`, 14 contrôles). **Rien n'est encore testé
> dans un navigateur ni sur un téléphone** — voir §12 pour l'état réel, les
> écarts par rapport au plan et ce qu'il reste à dérouler.
> Les sections 1 à 11 sont conservées telles quelles comme trace de conception.

---

## 1. L'idée en une phrase

Un **référentiel produit** (le « mini CRM produit » : références, fournisseurs,
prix d'achat) doublé d'une **gestion de stock** (réception, sortie, inventaire,
au clavier ou **au scan**), branché sur le Projet GTB pour que **le matériel
d'une affaire se dérive de ce qu'on a déjà saisi** au lieu d'être recompté à la
main.

Dans le cycle A→Z ([`ROADMAP.md`](ROADMAP.md) §1), le Magasin couvre le chaînon
manquant entre l'**étape 2 (étude & chiffrage** — la BOM matérielle) et
l'**étape 3 (fabrication de l'armoire** — sortir physiquement le matériel).

---

## 2. Principe directeur : la technique et le commerce ne se mélangent pas

La base matériel actuelle (`AutomateModele`, `ModuleModele`) décrit des
**capacités** : « 8 UI, 6 UO, extensible, compatible tel module ». C'est elle qui
pilote la reco automate et l'affectation E/S. Elle ne doit **pas** devenir un
catalogue commercial : elle change au rythme des gammes constructeur, pas au
rythme des tarifs.

Le `Produit` décrit un **article qu'on achète et qu'on stocke** : référence
interne, prix, fournisseur, quantité, emplacement. Il change au rythme des
commandes.

Les deux se relient par un simple `produitId?` posé sur les modèles techniques.

```
   TECHNIQUE (existant)              COMMERCE / LOGISTIQUE (nouveau)
   AutomateModele ─── produitId ───▶ Produit ◀─── CodeBarreProduit (appris au scan)
   ModuleModele   ─── produitId ───▶    │
                                        ├──▶ Fournisseur       (UN produit = UN fournisseur)
                                        ├──▶ MouvementStock    (le stock EST leur somme)
                                        ├──▶ Exemplaire        (n° de série, quand on le connaît)
                                        └──▶ NomenclaturePoint (un point d'E/S appelle N produits)
```

**Conséquence importante** : les produits qui n'ont pas de modèle technique en
face (sondes, vannes, servomoteurs, presse-étoupes) existent quand même. C'est
ce qui comble le trou constaté au cadrage — aujourd'hui une sonde n'existe nulle
part dans la plateforme, elle n'est qu'un *point* dans une liste.

### Le second principe : le stock est la somme des mouvements

Aucune colonne « quantité en stock » modifiée en place. Une seule règle,
valable pour tous les types de mouvement :

> **la source décrémente, la destination incrémente ; la quantité est toujours positive.**

| Type | Source | Destination |
|---|---|---|
| `RECEPTION` | — (le fournisseur) | dépôt |
| `SORTIE` | dépôt | — (l'affaire, le camion, la benne) |
| `RETOUR` | — | dépôt |
| `TRANSFERT` | dépôt A | dépôt B |
| `REBUT` | dépôt | — |
| `ECART` | dépôt *(si compté < théorique)* | dépôt *(si compté > théorique)* |

D'où trois propriétés gratuites : l'historique est auditable (« où sont passés
les 3 modules ? »), **l'historique des prix d'achat est l'historique des
réceptions** (aucune table de prix à tenir, le PMP se calcule tout seul), et un
écart d'inventaire reste **visible** au lieu d'être silencieusement corrigé.

---

## 3. Décisions prises (2026-07-28)

| Sujet | Décision | Pourquoi |
|---|---|---|
| Périmètre | **Matériel GTB** : automates, modules, sondes, vannes, servomoteurs, réseau, accessoires de pose. Pas la quincaillerie d'armoire ni les consommables. | Peu d'articles, chers : une erreur de stock s'y voit tout de suite. Bon terrain d'apprentissage du rituel. |
| Référence | **Double** : `refInterne` (clé maison, imprimable) + `refFabricant`. Plus les codes-barres appris. | La référence interne survit à un changement de gamme ou de marque. |
| Grain | Quantités pour tout ; **n° de série opportuniste** sur automates, modules, modems/passerelles. | La quantité du mouvement fait foi ; la série est un raffinement (0..n par mouvement). Aucune saisie imposée. |
| Dépôts | Le **modèle** porte source/destination dès le départ ; l'**usage livré** est « camion = dortoir » (sortie = consommé). | Le dépôt est pénible à rajouter après. Passer un camion en stock réel devient un réglage (`Depot.dortoir = false`), pas une migration. |
| Prix | Prix d'**achat** seulement, visibles par un nouveau rôle **`ACHATS`** (et les `ADMIN`). Pas de prix de vente, pas de marge. | Le financier reste dans WhySoft (règle de la maison). |
| Fin de vie d'un produit | **Archiver** par défaut (il quitte le rayon et les listes de choix, son historique reste). **Supprimer** uniquement s'il n'a ni mouvement, ni exemplaire, ni réservation. Un produit obsolète peut désigner son **remplaçant**. | `MouvementStock` est en `onDelete: Cascade` sur le produit : supprimer un article qui a bougé emporterait tout son historique de stock — l'inverse de l'invariant. Le garde-fou est côté serveur, pas seulement dans l'écran. |
| Correction manuelle | **Réservée aux `ADMIN`** (pas même aux Achats) : on saisit le stock RÉEL, le système écrit l'écart. **Motif obligatoire.** | Le cas arrive (matériel pris sans scanner, coup de rush) et ouvrir une campagne d'inventaire pour une référence serait absurde. Mais c'est le seul geste qui court-circuite le récit des mouvements : il doit rester rare, attribuable et expliqué. L'invariant tient — c'est un mouvement `ECART`, rien n'est modifié en place. |
| Commandes | **Aucun modèle de commande.** Les achats sont passés dans WhySoft ; on ne les ressaisit pas. La réception porte simplement un **`numeroAchat`** (référence WhySoft, texte libre). | Zéro double saisie. Même principe que `numeroWhy` pour les affaires : on référence, on ne recopie pas. |
| Amorçage | Par **import** (CSV/Excel), pas au clavier. Et le moteur d'import reste disponible ensuite (mise à jour de prix, nouveaux catalogues). | Personne ne saisira 300 produits à la main, et les tarifs arrivent en Excel de toute façon. |
| Étiquettes | Plus tard. On démarre sur les codes fabricant appris au scan. | On verra à l'usage ce qui n'est pas scannable avant d'investir dans une planche d'étiquettes. |
| Fournisseur | **UN produit = UN fournisseur**, porté par le produit (`fournisseurId`, `refFournisseur`, `prixAchatCents`, `delaiJours`). Pas de table de tarifs. Décision du **2026-07-29**. | Le multi-fournisseur existe chez Dumortier mais reste rare. La table de tarifs coûtait un import en deux passes, un aller-retour pour créer le fournisseur avant de saisir un prix, et une notion de « fournisseur préféré » à arbitrer — pour un cas marginal. Le cas exceptionnel se note dans le champ `note` du produit. Fait le jour où la table était encore VIDE : coût nul, alors qu'à 300 produits c'eût été une migration de données. |
| Point → produits | **Oui, à terme** : un point d'E/S appelle un ou plusieurs produits (`NomenclaturePoint`). | C'est le plus gros levier : la BOM se dérive de la liste de points, avant même le choix de l'automate. |

---

## 4. Modèle de données (esquisse Prisma)

> Conventions de la maison : ids `cuid()`, `createdById` + `updatedById` pour
> l'attribution ([`CLAUDE.md`](../CLAUDE.md) « Fil d'activité »), relations
> multiples vers `User` explicitement nommées, `chantierId` pour le
> rattachement à l'affaire.

```prisma
// --- Rôle : un cran entre MEMBRE et ADMIN -----------------------------------
enum Role { ADMIN  ACHATS  MEMBRE }   // ACHATS ajouté ; peutVoirPrix = ADMIN | ACHATS

// --- Référentiel produit ----------------------------------------------------
// Catégorie et fabricant sont des TABLES depuis le 2026-08-04 (voir §5 bis) :
// l'enum ne se dégonflait pas, le texte libre se dédoublait.
model CategorieProduit { id String @id @default(cuid())  nom String @unique  ordre Int  actif Boolean }
model Fabricant        { id String @id @default(cuid())  nom String @unique  actif Boolean  note String }

model Produit {
  id           String  @id @default(cuid())
  refInterne   String  @unique          // clé maison, imprimable en étiquette
  refFabricant String?                  // ECY-303, STP100-2…
  designation  String
  fabricantId  String?                  // → Fabricant  (onDelete: SetNull)
  categorieId  String?                  // → CategorieProduit (onDelete: SetNull)
  unite        String  @default("U")    // U | m | kg
  serialisable Boolean @default(false)  // on CAPTE la série si on l'a, on ne l'exige jamais
  seuilMini    Int     @default(0)      // alimente « sous le seuil »
  emplacement  String?                  // bac / étagère
  image        String  @default("")
  docUrl       String  @default("")
  remplaceParId String?                 // obsolescence → produit successeur
  actif        Boolean @default(true)
  // + createdById / updatedById / createdAt / updatedAt
}

/// Un code lu au scan → un produit. Appris une fois, valable pour toujours.
/// Plusieurs codes par produit (fournisseur, fabricant, étiquette maison).
model CodeBarreProduit {
  id        String  @id @default(cuid())
  code      String  @unique
  format    String?                     // ean_13, code_128, qr_code… (cf. ModemScan.format)
  produitId String
  // + createdById / createdAt : un code mal associé doit pouvoir se retrouver
}

// --- Achat ------------------------------------------------------------------
model Fournisseur { id, nom @unique, contact?, email?, tel?, delaiJours?, note }

// PAS de table de tarifs : UN produit = UN fournisseur (décision du 2026-07-29).
// Le produit porte donc lui-même :
//   fournisseurId  String?   // FK Fournisseur, onDelete: SetNull
//   refFournisseur String?   // sa référence à lui (celle du bon de commande)
//   prixAchatCents Int?      // prix annoncé — sert à chiffrer avant tout achat
//   delaiJours     Int?      // délai propre à ce produit
// Le multi-fournisseur, rare, se note dans `Produit.note`.

// PAS de modèle Commande : les achats sont passés dans WhySoft. Une réception
// porte le n° de commande d'achat en référence (MouvementStock.numeroAchat),
// exactement comme une affaire porte son numeroWhy. Aucune double saisie.

// --- Stock ------------------------------------------------------------------
enum TypeDepot     { ATELIER VEHICULE CHANTIER }
model Depot {
  id String @id @default(cuid())
  nom String @unique                    // « Atelier », « Camion Gus »
  code String @unique
  type TypeDepot @default(ATELIER)
  detenteurId String?                   // véhicule rattaché à quelqu'un
  /// « Dortoir » : ce qui y entre est considéré comme consommé, aucun stock
  /// tenu. Réglage de départ des camions — le passer à false leur donne un
  /// vrai stock sans toucher au schéma.
  dortoir Boolean @default(false)
  actif   Boolean @default(true)
}

enum TypeMouvement { RECEPTION SORTIE RETOUR TRANSFERT REBUT ECART }
model MouvementStock {
  id              String @id @default(cuid())
  type            TypeMouvement
  produitId       String
  quantite        Int                   // TOUJOURS positive (cf. §2)
  depotSourceId   String?
  depotDestId     String?
  prixUnitaire    Decimal? @db.Decimal(10,2)   // réceptions : alimente le PMP
  chantierId      String?               // sortie/retour au titre d'une affaire
  numeroAchat     String?               // réception : n° de commande d'achat WhySoft (référence)
  inventaireId    String?               // écart issu d'une campagne
  note            String  @default("")
  /// Horodatage du geste sur l'appareil, distinct de createdAt (même raison
  /// que ModemScan.scanneLe : saisie différée, reprise après échec).
  faitLe          DateTime @default(now())
  // + createdById / createdAt
  @@index([produitId, depotDestId])
  @@index([produitId, depotSourceId])
  @@index([chantierId])
}

enum EtatExemplaire { EN_STOCK SORTI REBUT }
model Exemplaire {
  id          String @id @default(cuid())
  produitId   String
  numeroSerie String
  etat        EtatExemplaire @default(EN_STOCK)
  depotId     String?
  chantierId  String?                   // où il est parti → futur « Parc »
  receptionId String?                   // mouvement d'entrée
  sortieId    String?                   // mouvement de sortie
  /// Rapprochement facultatif avec un scan de l'outil Scanner : les modems y
  /// ont déjà série / IMEI / MAC. Aucune fusion des deux tables.
  modemScanId String?
  @@unique([produitId, numeroSerie])
}

// --- Inventaire -------------------------------------------------------------
enum EtatInventaire { OUVERT VALIDE ANNULE }
model Inventaire      { id, depotId, etat, ouvertLe, valideLe?, ouvertParId, note }
model LigneInventaire { id, inventaireId, produitId, theorique Int, compte Int? }
// La validation d'un inventaire génère les mouvements ECART correspondants.

// --- Besoin (le pont avec le Projet GTB) ------------------------------------
/// Un point du catalogue appelle N produits : « Sonde T° gaine » = 1 sonde +
/// 1 doigt de gant + 1 presse-étoupe. C'est ce qui rend la BOM dérivable.
model NomenclaturePoint {
  id             String @id @default(cuid())
  pointCatalogId String
  produitId      String
  quantite       Int     @default(1)
  optionnel      Boolean @default(false)
  @@unique([pointCatalogId, produitId])
}

/// Complément saisi à la main sur une affaire (ce que la dérivation ne sait pas
/// deviner). La partie automate/modules/points n'est JAMAIS recopiée ici.
model LigneMaterielAffaire { id, chantierId, produitId, quantite Int, note }

enum EtatReservation { RESERVEE SERVIE ANNULEE }
model ReservationStock { id, produitId, chantierId, quantite Int, etat, createdById }
```

**Invariant du stock** :
`dispo(produit, dépôt) = Σ quantité(mouvements dont destination = dépôt) − Σ quantité(mouvements dont source = dépôt)`
— un `groupBy` agrégé, largement suffisant à l'échelle de quelques centaines de
produits. Si la table de mouvements devient grosse, on passera à une vue
matérialisée : l'invariant ne change pas.

**Invariant des séries** : `nombre d'exemplaires ≤ quantité du mouvement`. Une
réception de 4 automates saisie au clavier crée 0 exemplaire et un stock juste ;
la même réception scannée boîte par boîte en crée 4. Les deux coexistent.

---

## 5. La dérivation du besoin d'une affaire

```
Projet GTB (controller + modules[] + power_supply)  ──▶ produits via AutomateModele.produitId / ModuleModele.produitId
Liste de points (rows[] → PointCatalog par le NOM) ──▶ produits via NomenclaturePoint
LigneMaterielAffaire (saisie à la main)            ──▶ le complément
                              ▼
                  BOM de l'AFFAIRE (cumul des N automates)
                              ▼
        Réservation ──▶ Préparation ──▶ Sortie (mouvement)
                              ▼
                   Manquants ──▶ à commander
```

La BOM se place au niveau de **l'affaire**, pas du projet : une affaire = N
automates, et c'est l'affaire qu'on prépare et qu'on livre.

> ⚠️ **Limite connue** : les lignes d'une liste de points sont reliées au
> catalogue **par le nom** (`PointCatalog.nom` est la clé unique) et rien
> n'oblige à saisir un nom du catalogue. Les points tapés à la main resteront
> muets côté nomenclature. Parade retenue : afficher « n lignes sans
> nomenclature » sur la BOM plutôt que de laisser croire à un total complet.

### Créer l'article sans quitter l'affaire (ajouté le 2026-08-04)

Le magasin ne connaît pas tout, et il ne le connaîtra jamais : chaque affaire
apporte son article inédit. « Ajouter du matériel » cherche donc dans le rayon
**et** propose, juste à côté, de créer l'article manquant sur place — même geste
que la réparation d'un trou, qui l'offrait déjà. Sans ça, il fallait quitter
l'affaire, saisir la fiche dans le rayon, revenir, retrouver sa ligne : quatre
écrans pour une sonde.

Le formulaire ne demande que le strict nécessaire (réf. interne, désignation,
catégorie, unité, marque — plus le prix et le fournisseur pour un profil
Achats) ; le reste de la fiche se complète plus tard depuis le rayon. Une
référence interne **déjà connue n'en crée pas un second** : c'est le même
article, on le réutilise. Ce n'est pas de la tolérance décorative — le rayon
masque les articles archivés, l'utilisateur ne pouvait donc pas savoir qu'il
existait déjà.

Côté code, `enregistrerLigneMateriel` accepte un `nouveauProduit` et le résout
par `produitDuBrouillon()`, seule et même porte que `associerTrou` : la création
d'un produit passe toujours par `enregistrerProduit`, donc par le contrôle de
droit du référentiel. Ajouter un article **connu** reste ouvert à tous ; en
créer un est un geste d'Achats.

### Catégories & fabricants : deux référentiels (ajouté le 2026-08-04)

Deux champs du produit ont changé de nature le même jour, pour des raisons
symétriques :

| | Avant | Le problème | Après |
|---|---|---|---|
| **Catégorie** | enum Postgres | On ne peut pas RETIRER une valeur d'enum (`ALTER TYPE … DROP VALUE` n'existe pas), et en ajouter une demandait une migration : le magasinier ne tenait pas ses propres rayons. | table `CategorieProduit` (nom unique, `ordre`, `actif`) |
| **Fabricant** | `marque String?`, texte libre | On pouvait en ajouter un SANS LE VOULOIR : « Siemens » un jour, « Siemnes » le lendemain — deux marques, un filtre muet, et rien pour le signaler. | table `Fabricant` (nom unique, `actif`) |

Le fabricant n'est pas le fournisseur : **l'un fabrique, l'autre facture**. Le
champ s'appelait « marque », il s'appelle désormais « fabricant » partout — y
compris dans la colonne d'import, dont les anciens en-têtes (`marque`,
`constructeur`) restent reconnus.

Trois règles portent l'anti-doublon :

1. **Le rapprochement est tolérant** — `cleReferentiel()` ignore la casse, les
   accents et les espaces superflus : « SIEMENS », « Siémens » et « siemens »
   désignent la même ligne, à la saisie comme à l'import.
2. **La création est délibérée** — dans les formulaires, le fabricant est une
   *liste* ; en créer un demande de choisir « ＋ Nouveau fabricant… ». On ne
   crée plus une marque en tapant à côté.
3. **Renommer sur un nom déjà pris FUSIONNE** — c'est le geste qui répare un
   « Siemnes » découvert trois mois plus tard : les produits suivent, l'entrée
   vidée disparaît. Ce que la règle 1 ne peut pas deviner, la règle 3 le répare.

**Supprimer ne détruit jamais un produit.** Une entrée encore portée demande
d'abord où vont ses produits : vers une autre entrée, ou nulle part — ils
deviennent alors « sans catégorie », visibles en **fin** de rayon (jamais en
tête : un oubli n'est pas une priorité) et retrouvables par le filtre « Sans
catégorie ». `onDelete: SetNull` garantit le reste. L'alternative douce reste
l'**archivage** : retiré des choix, conservé sur les produits qui le portent.

L'import applique la même doctrine : un libellé inconnu **crée** l'entrée
(sinon un fichier légitime serait bloqué), mais un produit importé sans colonne
« catégorie » reste **sans catégorie** plutôt que d'être rangé d'office dans
« Autre » — un fichier parfaitement importé et un rayon parfaitement faux serait
le pire des deux mondes.

Tout se gère sur `/outils/magasin/fournisseurs` (écran « Référentiels du
magasin » : dépôts, fournisseurs, catégories, fabricants).

### Bases de codes-barres externes : testé, puis retiré (2026-08-04)

L'idée était séduisante : un code scanné inconnu, on demande à une base
publique ce qu'est l'article, et le formulaire de création se pré-remplit tout
seul. **UPCitemdb** a été branché (plan gratuit : 100 requêtes/jour, sans clé),
avec cache des réponses, filtrage des non-GTIN et rapprochement du fabricant
sur le référentiel. Testé le jour même sur du vrai matériel : **aucune
réponse**. Retiré dans la foulée — code, table de cache et variable
d'environnement.

À garder en tête si l'idée revient :

- **Ces bases sont peuplées par le commerce de détail**, et plutôt
  nord-américain. Au banc d'essai, un EAN européen aussi banal que celui du
  Nutella (`3017620422003`) en ressortait *inconnu*. Une sonde de gaine n'avait
  aucune chance.
- **La moitié de notre matériel ne porte pas de GTIN du tout.** L'étiquette d'un
  automate donne un numéro de série ou une MAC — identifiants d'exemplaire, pas
  de modèle. Aucune base produit ne les reconnaîtra jamais, quel que soit le
  fournisseur de données.
- **Les deux pistes qui restent**, dans cet ordre : le **catalogue du
  distributeur** (Rexel, Sonepar — EAN, désignation, marque, prix ; le moteur
  d'import existe déjà et ça marche hors ligne ensuite), puis la **lecture de
  l'étiquette en photo** pour tout ce qui n'a pas de code produit.
- Et surtout : `CodeBarreProduit` — « appris une fois, valable pour toujours » —
  reste le mécanisme le plus fiable du lot. Une source externe n'aurait jamais
  été qu'un accélérateur de la *première* fois.

Ce qui **reste** de l'épisode, et qui n'a rien à voir avec une API : depuis
l'écran de scan, un code inconnu dont l'article n'existe pas encore permet de
**créer le produit sur place**, avec apprentissage du code dans la foulée
(`creerProduitDepuisCode`). Avant, il fallait quitter le scan, créer l'article
au rayon, revenir, rescanner.

### « Ce point ne demande aucun matériel »

Tout point n'appelle pas du matériel : une commande sur un contact déjà présent,
un report d'information, une sonde déjà en place. `PointCatalog.sansMateriel`
distingue donc **« rien à fournir »** de **« nomenclature pas encore
renseignée »** — sans quoi ces points resteraient éternellement signalés comme
des trous et on finirait par ne plus lire l'avertissement du tout.

> ⚠️ C'est une décision posée **à la main, point par point**, et réversible d'un
> clic. **Jamais déduite du type d'E/S** : une DO peut parfaitement appeler du
> matériel, et deux points de même type n'ont aucune raison de se comporter
> pareil. Aucune règle automatique ne doit être introduite ici.

Deux endroits pour la poser : le bouton « Aucun matériel » sur la ligne du trou
(écran Matériel d'affaire) et la bascule de l'écran Nomenclature, qui sert aussi
à revenir en arrière (« À chiffrer »).

### « Hors de notre fourniture » (ajouté le 2026-08-03)

L'autre moitié du sujet, et il ne faut **surtout pas** la confondre avec la
précédente : l'article est bel et bien nécessaire au chantier — il se raccorde,
il se met en service, il figure au document — mais **on ne le vend pas**, parce
qu'il est **déjà sur place** ou fourni par un autre lot. Cas courant en rénovation.

| | `PointCatalog.sansMateriel` | `MaterielHorsFourniture` |
|---|---|---|
| Question posée | « ce **type** de point demande-t-il du matériel ? » | « sur **cette affaire**, est-ce nous qui le fournissons ? » |
| Portée | **toutes** les affaires (catalogue) | **une seule** affaire |
| Où | écran Nomenclature / ligne de trou | case à cocher sur la ligne de BOM |

Le geste est une **case à cocher sur la ligne de l'écran Matériel d'affaire** —
pas sur la ligne de point. La liste de points est un artefact **technique**
(qu'est-ce qui se câble, sur quelle borne) ; « qui fournit » est une question
**d'achat** : c'est la règle du §2, et elle décide de l'emplacement. Cela évite
au passage d'alourdir d'une colonne l'écran le plus chargé et le plus fréquenté
de la plateforme.

Cochée, la ligne **reste affichée** (barrée, grisée) mais sort du besoin, du
manquant et du coût prévu — et son prix inconnu cesse d'être signalé, puisqu'on
ne l'achète pas. La **présence de la ligne EST la décision** (`@@unique`
`[chantierId, produitId]`, pas de booléen à maintenir) : cocher et décocher sont
parfaitement symétriques, rien n'est perdu dans un sens ni dans l'autre.

> **Choix assumé : c'est tout ou rien par article.** « 3 sondes déjà en place sur
> les 12 » ne s'exprime pas — il faudrait une quantité déductible, donc un champ
> de saisie là où une case suffit. Décidé ainsi à l'usage ; si le cas partiel se
> présente vraiment, la ligne manuelle sait déjà ajuster une quantité.

---

## 6. La reprise de données (imports)

L'amorçage ne se fait pas au clavier : **on importe**. Et pas seulement au
démarrage — un tarif fournisseur qui arrive en Excel doit pouvoir être rejoué
n'importe quand. Deux imports, un seul moteur :

1. **Produits** — le référentiel, **fournisseur et prix d'achat compris** :
   `refInterne`, `refFabricant`, désignation, marque, catégorie, unité, seuil
   mini, emplacement, **fournisseur** (créé s'il n'existe pas), **sa référence**,
   **prix d'achat**, **délai**. Un produit = un fournisseur, donc tout tient sur
   une ligne — d'où la disparition de l'ancien import « tarifs ».
2. **Stock initial** — produit + dépôt + quantité (+ prix unitaire facultatif).
   Génère des mouvements `RECEPTION` datés du jour de reprise, annotés
   « reprise ». Le stock initial n'est **pas** un cas particulier : c'est un
   mouvement comme un autre, et il reste lisible dans l'historique.
Règles communes, valables pour les deux :

- **Clé d'upsert** : `refInterne` d'abord, `refFabricant` en repli. Une ligne
  sans clé reconnue est une **création**, jamais une modification silencieuse.
- **L'import sert aussi à METTRE À JOUR** — et c'est le chemin normal d'une
  modification de masse (prix, seuils, emplacements) : *exporter l'existant →
  corriger dans Excel → réimporter*. Deux règles rendent ça sûr :
  **une cellule vide (ou une colonne absente) laisse la valeur en place** — un
  fichier « référence + prix » ne doit pas effacer marque, emplacement et note —
  et la **désignation n'est obligatoire qu'à la création**. Pour vider un champ,
  on passe par la fiche produit.
- **Un modèle d'exemple est téléchargeable** pour chaque genre (en-têtes + deux
  lignes remplies), ainsi que l'**export du référentiel** au même format. Le
  fichier produit se remappe donc tout seul — propriété vérifiée par le test de
  bout en bout.
- **Aperçu obligatoire avant écriture** : n lignes créées / mises à jour /
  rejetées, avec le motif ligne par ligne. Rien ne part en base avant validation.
- **Formats** : CSV (séparateur `;` ou `,`, encodage détecté — les exports Excel
  français sortent en `;` + latin-1) et XLSX.
- **Correspondance des colonnes à l'écran** : on ne dicte pas un gabarit, on
  fait correspondre les colonnes du fichier aux champs. Les exports fournisseurs
  changent de forme en permanence.
- **Journal** : qui, quand, combien de lignes, quel fichier — un import raté
  doit pouvoir se comprendre après coup.

Réservé au rôle `ACHATS` (et `ADMIN`).

---

## 7. Les écrans

| Route | Écran | Public |
|---|---|---|
| `/outils/magasin` | **Rayon** — produits, dispo / réservé, **« sous le seuil » en tête** (la liste de courses) | tous |
| `/outils/magasin/scan` | **Scan** — plein pouce, mode Réception ou Sortie, **session continue** | atelier |
| `/outils/magasin/produits/[id]` | **Fiche produit** — infos, prix d'achat, mouvements, exemplaires | bureau |
| `/outils/magasin/import` | **Import** — reprise CSV/Excel avec aperçu avant écriture (§6) | `ACHATS` |
| `/outils/magasin/inventaires` | **Inventaire** — campagne de comptage guidée, écarts | périodique |
| `/affaires/[id]` | **Bloc Matériel** — besoin / réservé / sorti / manquant + coût matériel | chargé d'affaire |

**Le scan est une session, pas un acte unitaire.** Je choisis une fois le mode
(Réception + son n° d'achat, ou Sortie + l'affaire), puis j'enchaîne les codes.
C'est la seule façon de tenir les 5 secondes par article — et c'est ce qui
décide si le stock reste vrai. Un code inconnu ouvre l'association à un produit
à la volée, apprise pour toujours.

---

## 8. Points d'intégration avec l'existant

1. **Moteur de scan** — la boucle `BarcodeDetector` natif + repli ZXing est
   aujourd'hui enfermée dans `src/tools/modems/scan-modems.tsx` (1769 lignes).
   **À extraire dans `src/lib/scan/`** (un hook + un viseur), consommé par le
   Scanner *et* le Magasin. Le Scanner doit continuer de se comporter à
   l'identique — refactor à iso-fonctionnel, vérifié avant d'aller plus loin.
2. **Registre d'outils** — une entrée `magasin` dans `src/tools/registry.ts` :
   signal **`do`** (vert, « ce qui sort »), libre dans le rail puisque Documents
   est un outil d'affaire. Pas de `portee` : c'est un outil transverse comme
   Visites et Wiki.
   ℹ️ La barre du bas (téléphone) n'affiche que les **4 premières** entrées de
   nav (Accueil · Affaires · Visites · Wiki) : le Magasin vit donc dans
   « Plus ». **Validé** — on observera l'usage avant de réordonner.
3. **Fiche Affaire** — `listerPourChantier` dans `queries.ts` + une ligne dans
   `PROVIDERS` de `src/lib/chantiers/providers.ts` (convention maison), pour que
   les sorties matériel apparaissent dans les réalisations de l'affaire.
4. **Reco automate** — `proposerAutomates()` peut afficher « en stock » et le
   prix connu à côté de chaque proposition. La reco cesse d'être purement
   technique.
5. **Recherche globale** — les produits deviennent une source : une entrée dans
   le `Promise.all` de `src/lib/recherche/queries.ts` + une clé dans
   `LIBELLE_TYPE` / `ICONE`. Chercher `ECY-303` doit remonter le produit.
6. **Rôle `ACHATS`** — nouvelle valeur d'enum, helper `peutVoirPrix(role)`, et
   le sélecteur de rôle de `/configuration/utilisateurs` à étendre. Les gardes
   existantes testent `role === "ADMIN"` : ajouter une valeur ne casse rien.
7. **MCP** — plus tard : `dumtools_list_produits`, `dumtools_stock_produit`,
   `dumtools_bom_affaire`.

---

## 9. Phasage

Chaque phase est utilisable seule et se termine par une vérification concrète.

**Phase 1 — Produits, import & stock nu.** Modèle `Produit` + `Depot` +
`MouvementStock`, liens `produitId` sur la base matériel, **import CSV/Excel des
produits et du stock initial** (§6), réception/sortie au clavier, écran Rayon
avec seuils, fiche produit et son historique, rôle `ACHATS`.
*Utilisable seul : on peut déjà tenir le magasin.*

**Phase 2 — Le scan.** Extraction du moteur vers `src/lib/scan/`, écran de scan
Réception/Sortie en session, apprentissage des codes inconnus.
*→ test device obligatoire (caméra, lumière d'atelier, codes réels).*

**Phase 3 — L'affaire.** `NomenclaturePoint`, dérivation de la BOM (projets +
liste de points), réservation, préparation, bloc Matériel sur la fiche Affaire,
provider `PROVIDERS`.

**Phase 4 — L'achat.** Fournisseurs, tarifs (import compris), PMP et coût
matériel d'affaire. Pas de gestion de commandes : elles vivent dans WhySoft.

**Phase 5 — Séries & inventaire.** Exemplaires (dont rapprochement avec les
scans de modems), campagnes de comptage, export CSV.

**Plus tard** : étiquettes maison (planche A4 : référence interne + code-barres,
produits et bacs), camion en dépôt plein exercice, outils MCP.

---

## 10. Risques identifiés

| Risque | Parade |
|---|---|
| **La sortie oubliée** — le mouvement le plus souvent sauté. | Le scan en session (5 s/article) + l'inventaire qui rattrape, avec **l'écart affiché** : on saura vite si le rituel tient. Et la **correction manuelle** (admin, motif obligatoire) pour le cas isolé, sans monter une campagne. |
| **Points tapés à la main** → nomenclature muette, BOM incomplète. | Afficher explicitement « n lignes sans nomenclature » plutôt qu'un total faussement complet (§5). |
| **Codes-barres Distech inconnus** — on ne sait pas encore ce que portent les boîtes. | Apprentissage des codes + sérialisation opportuniste : rien ne bloque si le code ne livre pas la série. |
| **Prix : quel prix ?** | **Prix de référence** à deux étages (`prixReference()`, ajouté le 2026-07-29) : le **prix moyen payé** dès qu'il y a eu une réception valorisée, le **tarif fournisseur** sinon. Aucun des deux → le produit est **exclu** des totaux et le nombre d'exclus est affiché (compter un prix inconnu pour zéro serait un mensonge silencieux). Le **dernier prix payé** ne sert qu'à pré-remplir une saisie. Frais de port hors prix unitaire. |
| **Dérive du périmètre** vers la quincaillerie et les consommables. | Décision §3 : matériel GTB seulement. À rediscuter une fois le rituel installé, pas avant. |

---

## 11. Questions restées ouvertes

1. **Le « déjà commandé »** — sans modèle de commande, la liste à commander
   affiche *besoin − stock*, sans savoir ce qui est déjà en route : risque de
   commander deux fois. Parade la plus légère possible, **à valider** : une
   ligne « attendu » posable en un geste depuis la liste (produit, quantité,
   n° d'achat WhySoft, date attendue), soldée à la réception. C'est une note,
   pas une commande — mais c'est quand même une saisie. À trancher à l'usage :
   on peut très bien démarrer sans et voir si le problème se pose vraiment.

---

## 12. État réel après implémentation (2026-07-28)

### Ce qui est livré

| Route | Écran |
|---|---|
| `/outils/magasin` | **Rayon** : compteurs (références, sous le seuil, valeur du stock au PMP, mouvements 30 j), recherche, filtre catégorie, bascule « sous le seuil », saisie de mouvement, création de produit |
| `/outils/magasin/produits/[id]` | **Fiche produit** : historique, exemplaires sérialisés, stock par dépôt, prix d'achat (payé / annoncé / fournisseur), codes appris, rattachements techniques et nomenclature inverse |
| `/outils/magasin/scan` | **Session de scan** : contexte choisi une fois, incrémentation, apprentissage des codes inconnus, repli clavier, validation en lot |
| `/outils/magasin/import` | **Import** CSV/XLSX : correspondance des colonnes devinée, aperçu obligatoire, journal des imports |
| `/outils/magasin/inventaires` + `/[id]` | **Campagnes** : ouverture (théorique figé), comptage au fil de l'eau, validation → mouvements `ECART` |
| `/outils/magasin/nomenclature` | **Point → produits** (voir écart n°1 ci-dessous) |
| `/outils/magasin/fournisseurs` | **Fournisseurs & dépôts** (dont le réglage « dortoir ») |
| `/outils/magasin/affaires/[chantierId]` | **Matériel d'affaire** : BOM dérivée, origines, manquants, réservation, préparation |

Transverse : entrée de registre (signal **DO** vert), bloc **Matériel** sur la
fiche Affaire, provider `PROVIDERS`, produits dans la **recherche ⌘K** (y compris
par code-barres appris), rôle **`ACHATS`** dans `/configuration/utilisateurs`.

### Écarts par rapport au plan

1. **La nomenclature a son propre écran** (`/outils/magasin/nomenclature`) au
   lieu d'être greffée sur `/configuration/points`. Elle référence des
   *produits*, donc elle appartient au magasin ; et l'éditeur de catalogue
   existant (460 lignes) n'avait pas à être touché pour ça.
2. **Le moteur de scan a bien été extrait** dans `src/lib/scan/lecteur.ts`
   (`useLecteurCode`) et l'outil Scanner le consomme désormais — refactor à
   iso-fonctionnel, `~150 lignes` retirées de `scan-modems.tsx`. ⚠️ Le Scanner
   n'a pas été re-testé caméra en main : c'est le point à vérifier en premier.
3. **Pas d'action « contrepasser » dans l'interface** : `contrepasserMouvement()`
   existe côté serveur (elle écrit l'inverse plutôt que de supprimer) mais aucun
   bouton ne l'appelle encore — à brancher quand le besoin se présentera.
4. **Ajouté après coup, à l'usage** (2026-07-29) : les trous de BOM sont
   **réparables sur place** (bouton « Relier », avec création de l'article à la
   volée) — la première version n'offrait aucun chemin pour relier un automate
   ou un module à un produit. Et un point peut être marqué **« Aucun matériel »**
   (§5), le cas d'une commande sur contact existant.
5. **Prix : repli sur le prix d'achat annoncé** (2026-07-29). La première version
   ne chiffrait qu'au PMP : un produit jamais reçu n'avait donc **aucun prix** —
   colonnes vides partout, y compris le coût prévu d'une affaire. Corrigé par
   `prixReference()` (§2), et les écrans annoncent d'où sort le chiffre.
6. **Un produit = un fournisseur** (2026-07-29). La table `TarifFournisseur` a
   été **supprimée** (elle était vide) : le fournisseur, sa référence, le prix
   d'achat et le délai remontent sur le produit. L'import passe de trois genres
   à deux, la fiche produit perd une section, et saisir un prix ne demande plus
   de créer le fournisseur d'abord — il se crée depuis le formulaire.
7. **« Hors de notre fourniture »** (2026-08-03) — case à cocher par ligne de BOM
   (`MaterielHorsFourniture`), pour le matériel présent sur site qu'on met en
   service sans le vendre. Voir §5. La première tentative avait posé le marquage
   sur la **ligne de point** : mauvais étage (technique au lieu de commerce) et
   sur l'écran déjà le plus chargé de la plateforme — déplacé avant d'être livré.

### Pièges rencontrés (à ne pas re-découvrir)

- **`prisma migrate dev` est inutilisable ici.** Il régénère un `DROP INDEX
  "WikiPage_recherche_idx"` + un `ALTER … DROP DEFAULT` sur la colonne tsvector
  générée, ce que Postgres refuse — la migration échoue **à moitié appliquée**
  (les `CREATE TYPE` passent, le reste non), et l'index GIN du wiki est
  réellement détruit au passage. Marche à suivre : `--create-only`, retirer les
  deux lignes, puis **`prisma migrate deploy`** (qui ne fait pas de détection de
  dérive). Vérifier ensuite que `WikiPage_recherche_idx` existe toujours.
- Une valeur d'enum Postgres **ne se retire pas** : `ALTER TYPE "Role" ADD VALUE
  IF NOT EXISTS 'ACHATS'` pour que la migration reste rejouable.
- Le lint React traite l'objet renvoyé par `useLecteurCode` comme une **ref**
  (il en contient une) : le **déstructurer** à l'appel, sinon chaque lecture de
  `lecteur.scanning` est signalée « Cannot access refs during render ».

### Ce qu'il reste à faire

- [ ] **Ouvrir les écrans dans un navigateur** — rien n'a été vu tourner.
- [ ] **Scanner en main** : un carton Distech réel, l'apprentissage du code, la
      torche, et une session complète réception → validation.
- [ ] **Vérifier que le Scanner (ToolGus) fonctionne toujours** après l'extraction.
- [ ] **Amorcer les données** : import du référentiel puis du stock initial.
- [ ] Décider du « déjà commandé » (§11) une fois le rituel installé.
- [ ] Étiquettes maison, camion en dépôt réel, outils MCP : quand le besoin viendra.

---

---

## 14. Associations de produits — « ce produit en appelle d'autres » (2026-08-07)

Un automate appelle son alimentation et son coffret ; une sonde de gaine appelle
son doigt de gant. Jusqu'ici il fallait s'en souvenir et les chercher un par un.

`AssociationProduit` pose ce fait **sur le produit**, pas sur le devis — c'est le
même arbitrage que §2 : ce qui est vrai partout appartient au référentiel. La
BOM d'affaire pourra s'en servir plus tard **sans reprise de données**.

### Deux natures, et la distinction porte tout

| | Comportement | Exemple |
|---|---|---|
| `ACCESSOIRE` | proposé **en plus** ; on en coche autant qu'on veut, ou aucun | l'alimentation **et** le coffret |
| `VARIANTE` | proposé **à la place** des autres de son `groupe` : un seul, ou aucun | « Type de bus » : 8UI **ou** 4UI4UO |

Même vocabulaire que `NomenclaturePoint.variante` (un *point* appelle des
produits) : deux mécanismes distincts, une seule langue.

### Le réglage qui fait tout le travail : `parUnite`

La quantité de l'associé **suit ou ne suit pas** celle du déclencheur :

```
3 × ECY-600  →  Alimentation  parUnite=true   →  3   (une par automate)
             →  Coffret       parUnite=false  →  1   (un pour les trois)
```

Sans ce réglage, l'une des deux familles serait **toujours** à corriger à la
main — et c'est précisément la correction qu'on ne fait pas. Les deux quantités
arrivent donc pré-remplies justes, et restent corrigeables avant validation.

### Trois garde-fous, côté serveur

1. un produit ne s'appelle **pas lui-même** ;
2. une `VARIANTE` **exige un groupe** : c'est lui qui rend les options
   exclusives, sans lui elle serait exclusive avec rien ;
3. `@@unique([produitId, associeId])` — un même associé ne peut pas être à la
   fois accessoire et variante ; une seconde saisie **met à jour**.

### Ce qui est délibérément absent

- **Aucune cascade.** Si l'associé a lui-même des associés, on ne les propose
  pas : un clic qui en ouvre cinq n'est plus une aide.
- **Aucune réciprocité.** A→D n'implique pas D→A.
- **Rien n'est imposé.** « Aucun » est une option à part entière d'un groupe de
  variantes, et tout accessoire se décoche. On ne vend pas une fourniture que
  personne n'a demandée.

### Où ça se règle, où ça se voit

- **Réglage** : section « Ce produit en appelle d'autres » sur
  `/outils/magasin/produits/[id]` — réservée à `ACHATS`/`ADMIN`, comme le reste
  du référentiel. Le formulaire annonce le résultat avant d'enregistrer
  (« pour 3 de cet article, le devis proposera 3 × … »).
- **Usage** : à l'ajout d'une ligne de devis. Un article **sans** association
  s'ajoute d'un clic, exactement comme avant ; un article associé ouvre la
  proposition, et **rien n'est posé tant qu'on n'a pas validé** — y compris le
  déclencheur. Renoncer, c'est renoncer à l'ajout, pas se retrouver avec une
  ligne à moitié posée.
- Un associé **archivé** au magasin n'est plus proposé (on le vendrait sans
  pouvoir l'acheter) mais reste visible sur la fiche, pour pouvoir retirer la
  règle.

Vérifications : `npx tsx scripts/associations-smoke.mts` (21 contrôles du
rangement et du calcul de quantité) + parcours navigateur complet (20 contrôles :
réglage, proposition, quantités pré-remplies, variante exclusive, coefficient
rejoué pour chaque associé).
