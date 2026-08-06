"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { produitParCode, type ProduitBref } from "./queries";
import {
  SENS_MOUVEMENT,
  TYPES_SAISISSABLES,
  cleReferentiel,
  estTypeDepot,
  estTypeMouvement,
  peutCorrigerStock,
  peutGererReferentiel,
  peutVoirPrix,
  type TypeMouvement,
} from "./model";

/* =============================================================================
 * ÉCRITURES DU MAGASIN
 *
 * Deux niveaux de droit (voir model.ts) :
 *  - TOUT LE MONDE fait bouger du stock (sinon personne ne le tiendrait) ;
 *  - le RÉFÉRENTIEL (produits, fournisseurs, nomenclature, validation
 *    d'inventaire) et les PRIX sont réservés à ACHATS / ADMIN.
 * ========================================================================== */

const RAYON = "/outils/magasin";

interface Acteur {
  id: string;
  role: string | undefined;
}

async function acteur(): Promise<Acteur> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return { id, role: session.user.role };
}

async function acteurReferentiel(): Promise<Acteur> {
  const a = await acteur();
  if (!peutGererReferentiel(a.role)) {
    throw new Error("Réservé aux profils Achats et Administrateur");
  }
  return a;
}

function texte(v: unknown): string {
  return String(v ?? "").trim();
}

function texteOuNull(v: unknown): string | null {
  const t = texte(v);
  return t === "" ? null : t;
}

function entierPositif(v: unknown, champ: string): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${champ} : entier positif attendu`);
  return n;
}

/* --- Catégories & fabricants ----------------------------------------------- */

/**
 * Retrouve une entrée de référentiel par son NOM, à la casse, aux accents et aux
 * espaces près (`cleReferentiel`). C'est le garde-fou anti-doublon : « SIEMENS »
 * saisi à l'import et « Siemens » saisi à la main désignent le même fabricant.
 * Ce qu'il ne peut pas rattraper — « Siemnes » — se fusionne à la main depuis
 * l'écran des référentiels.
 */
async function trouverParNom<T extends { id: string; nom: string }>(
  lignes: T[],
  nom: string,
): Promise<T | undefined> {
  const cle = cleReferentiel(nom);
  return lignes.find((l) => cleReferentiel(l.nom) === cle);
}

/** id explicite > nom à rapprocher > rien. Créer par le nom reste possible :
 *  sans ça, un import ou une saisie rapide se retrouverait bloqué. */
async function resoudreFabricantId(
  id: string | null | undefined,
  nom: string | null | undefined,
): Promise<string | null> {
  const choisi = texteOuNull(id);
  if (choisi) return choisi;
  const libelle = texte(nom);
  if (!libelle) return null;
  const existants = await prisma.fabricant.findMany({ select: { id: true, nom: true } });
  const trouve = await trouverParNom(existants, libelle);
  if (trouve) return trouve.id;
  const cree = await prisma.fabricant.create({
    data: { nom: libelle },
    select: { id: true },
  });
  return cree.id;
}

async function resoudreCategorieId(
  id: string | null | undefined,
  nom: string | null | undefined,
): Promise<string | null> {
  const choisie = texteOuNull(id);
  if (choisie) return choisie;
  const libelle = texte(nom);
  if (!libelle) return null;
  const existantes = await prisma.categorieProduit.findMany({ select: { id: true, nom: true } });
  const trouvee = await trouverParNom(existantes, libelle);
  if (trouvee) return trouvee.id;
  const derniere = await prisma.categorieProduit.findFirst({
    orderBy: { ordre: "desc" },
    select: { ordre: true },
  });
  const creee = await prisma.categorieProduit.create({
    data: { nom: libelle, ordre: (derniere?.ordre ?? 0) + 1 },
    select: { id: true },
  });
  return creee.id;
}

export async function enregistrerCategorie(p: {
  id?: string;
  nom: string;
  ordre?: number;
  actif?: boolean;
}): Promise<{ id: string }> {
  await acteurReferentiel();
  const nom = texte(p.nom);
  if (!nom) throw new Error("Nom de catégorie requis");

  // Renommer vers un nom déjà pris n'est pas une erreur mais une FUSION : c'est
  // le geste qui répare les doublons hérités (« Sondes » et « Sonde »). Les
  // produits suivent, la catégorie vidée disparaît.
  const homonyme = await trouverParNom(
    await prisma.categorieProduit.findMany({ select: { id: true, nom: true } }),
    nom,
  );
  if (homonyme && homonyme.id !== p.id) {
    if (!p.id) throw new Error(`La catégorie « ${homonyme.nom} » existe déjà`);
    await prisma.$transaction([
      prisma.produit.updateMany({ where: { categorieId: p.id }, data: { categorieId: homonyme.id } }),
      prisma.categorieProduit.delete({ where: { id: p.id } }),
    ]);
    revalidatePath(RAYON, "layout");
    return { id: homonyme.id };
  }

  const data = {
    nom,
    ...(p.ordre === undefined ? {} : { ordre: Math.round(Number(p.ordre)) || 0 }),
    ...(p.actif === undefined ? {} : { actif: Boolean(p.actif) }),
  };
  const categorie = p.id
    ? await prisma.categorieProduit.update({ where: { id: p.id }, data, select: { id: true } })
    : await prisma.categorieProduit.create({
        data: { ...data, ordre: data.ordre ?? 0 },
        select: { id: true },
      });
  revalidatePath(RAYON, "layout");
  return { id: categorie.id };
}

/**
 * Supprime une catégorie. Si des produits la portent, il faut dire ce qu'ils
 * deviennent : `remplacerParId` les bascule ailleurs, sinon ils se retrouvent
 * « sans catégorie » — jamais supprimés, jamais silencieusement rangés ailleurs.
 */
export async function supprimerCategorie(p: {
  id: string;
  remplacerParId?: string | null;
}): Promise<void> {
  await acteurReferentiel();
  const remplacant = texteOuNull(p.remplacerParId);
  if (remplacant === p.id) throw new Error("Une catégorie ne peut pas se remplacer elle-même");
  await prisma.$transaction([
    prisma.produit.updateMany({
      where: { categorieId: p.id },
      data: { categorieId: remplacant },
    }),
    prisma.categorieProduit.delete({ where: { id: p.id } }),
  ]);
  revalidatePath(RAYON, "layout");
}

export async function enregistrerFabricant(p: {
  id?: string;
  nom: string;
  note?: string;
  actif?: boolean;
}): Promise<{ id: string }> {
  await acteurReferentiel();
  const nom = texte(p.nom);
  if (!nom) throw new Error("Nom de fabricant requis");

  // Même règle que les catégories : renommer sur un existant fusionne. C'est
  // exactement ce qu'on veut le jour où l'on découvre « Siemnes » dans le rayon.
  const homonyme = await trouverParNom(
    await prisma.fabricant.findMany({ select: { id: true, nom: true } }),
    nom,
  );
  if (homonyme && homonyme.id !== p.id) {
    if (!p.id) throw new Error(`Le fabricant « ${homonyme.nom} » existe déjà`);
    await prisma.$transaction([
      prisma.produit.updateMany({ where: { fabricantId: p.id }, data: { fabricantId: homonyme.id } }),
      prisma.fabricant.delete({ where: { id: p.id } }),
    ]);
    revalidatePath(RAYON, "layout");
    return { id: homonyme.id };
  }

  const data = {
    nom,
    ...(p.note === undefined ? {} : { note: texte(p.note) }),
    ...(p.actif === undefined ? {} : { actif: Boolean(p.actif) }),
  };
  const fabricant = p.id
    ? await prisma.fabricant.update({ where: { id: p.id }, data, select: { id: true } })
    : await prisma.fabricant.create({ data, select: { id: true } });
  revalidatePath(RAYON, "layout");
  return { id: fabricant.id };
}

export async function supprimerFabricant(p: {
  id: string;
  remplacerParId?: string | null;
}): Promise<void> {
  await acteurReferentiel();
  const remplacant = texteOuNull(p.remplacerParId);
  if (remplacant === p.id) throw new Error("Un fabricant ne peut pas se remplacer lui-même");
  await prisma.$transaction([
    prisma.produit.updateMany({ where: { fabricantId: p.id }, data: { fabricantId: remplacant } }),
    prisma.fabricant.delete({ where: { id: p.id } }),
  ]);
  revalidatePath(RAYON, "layout");
}

/* --- Produits -------------------------------------------------------------- */

export interface SaisieProduit {
  id?: string;
  refInterne: string;
  refFabricant?: string | null;
  designation: string;
  /** Le fabricant est CHOISI dans le référentiel. */
  fabricantId?: string | null;
  /** …ou nommé, si l'utilisateur a explicitement demandé à en créer un. Le nom
   *  est rapproché de l'existant à la casse et aux accents près : on ne crée
   *  jamais un doublon de « Siemens » sans le vouloir. */
  fabricantNom?: string | null;
  categorieId?: string | null;
  /** Idem pour la catégorie (chemin d'import, surtout). */
  categorieNom?: string | null;
  unite?: string;
  serialisable?: boolean;
  seuilMini?: number;
  emplacement?: string | null;
  docUrl?: string;
  note?: string;
  remplaceParId?: string | null;
  /** Un produit = un fournisseur (docs/MAGASIN.md §3). */
  fournisseurId?: string | null;
  /** Nom d'un fournisseur à créer à la volée, si `fournisseurId` est vide :
   *  saisir un prix ne doit pas obliger à quitter l'écran. */
  fournisseurNom?: string | null;
  refFournisseur?: string | null;
  prixAchatCents?: number | null;
  delaiJours?: number | null;
}

export async function enregistrerProduit(p: SaisieProduit): Promise<{ id: string }> {
  const a = await acteurReferentiel();

  const refInterne = texte(p.refInterne);
  const designation = texte(p.designation);
  if (!refInterne) throw new Error("Référence interne requise");
  if (!designation) throw new Error("Désignation requise");

  const [fabricantId, categorieId] = await Promise.all([
    resoudreFabricantId(p.fabricantId, p.fabricantNom),
    resoudreCategorieId(p.categorieId, p.categorieNom),
  ]);

  const seuil = Math.max(0, Math.round(Number(p.seuilMini ?? 0)) || 0);

  // Fournisseur : choisi, ou créé au vol depuis son seul nom.
  let fournisseurId = texteOuNull(p.fournisseurId);
  const nomFournisseur = texteOuNull(p.fournisseurNom);
  if (!fournisseurId && nomFournisseur) {
    const existant = await prisma.fournisseur.findUnique({
      where: { nom: nomFournisseur },
      select: { id: true },
    });
    fournisseurId =
      existant?.id ??
      (await prisma.fournisseur.create({ data: { nom: nomFournisseur }, select: { id: true } })).id;
  }

  const prixAchatCents =
    p.prixAchatCents === null || p.prixAchatCents === undefined
      ? null
      : Math.max(0, Math.round(Number(p.prixAchatCents)));
  const delai =
    p.delaiJours === null || p.delaiJours === undefined ? null : Math.round(Number(p.delaiJours));

  const data = {
    refInterne,
    refFabricant: texteOuNull(p.refFabricant),
    designation,
    fabricantId,
    categorieId,
    unite: texte(p.unite) || "U",
    serialisable: Boolean(p.serialisable),
    seuilMini: seuil,
    emplacement: texteOuNull(p.emplacement),
    docUrl: texte(p.docUrl),
    note: texte(p.note),
    remplaceParId: texteOuNull(p.remplaceParId),
    fournisseurId,
    refFournisseur: texteOuNull(p.refFournisseur),
    // Le prix n'est visible et modifiable que par les profils Achats/Admin ;
    // acteurReferentiel() garantit déjà qu'on en est un ici.
    prixAchatCents: Number.isFinite(prixAchatCents as number) ? prixAchatCents : null,
    delaiJours: Number.isFinite(delai as number) ? delai : null,
    updatedById: a.id,
  };

  try {
    const produit = p.id
      ? await prisma.produit.update({ where: { id: p.id }, data })
      : await prisma.produit.create({ data: { ...data, createdById: a.id } });
    revalidatePath(RAYON);
    revalidatePath(`${RAYON}/produits/${produit.id}`);
    return { id: produit.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error(`La référence interne « ${refInterne} » existe déjà`);
    }
    throw e;
  }
}

/**
 * Brouillon d'article saisi AILLEURS que dans le rayon : réparation d'un trou de
 * BOM, ajout de matériel sur une affaire. Le strict nécessaire pour ne pas
 * quitter l'écran en cours — la fiche complète se remplit plus tard.
 */
export interface BrouillonProduit {
  refInterne: string;
  designation: string;
  refFabricant?: string | null;
  fabricantId?: string | null;
  fabricantNom?: string | null;
  categorieId?: string | null;
  categorieNom?: string | null;
  unite?: string;
  prixAchatCents?: number | null;
  /** Fournisseur choisi dans l'existant. Prioritaire sur `fournisseurNom`. */
  fournisseurId?: string | null;
  /** Fournisseur inconnu au référentiel : créé au vol depuis son seul nom. */
  fournisseurNom?: string | null;
}

/**
 * Résout un brouillon en produit. Une référence interne déjà connue n'est pas
 * une erreur : c'est le même article, on le réutilise plutôt que de refuser la
 * saisie — le rayon masque les articles archivés, l'utilisateur ne pouvait pas
 * savoir. La création passe par `enregistrerProduit`, donc par le contrôle de
 * droit du référentiel : une seule porte d'écriture pour les produits.
 */
async function produitDuBrouillon(b: BrouillonProduit | undefined): Promise<string> {
  if (!b) throw new Error("Choisissez un produit, ou créez-en un");
  const refInterne = texte(b.refInterne);
  if (!refInterne) throw new Error("Référence interne requise");
  const existant = await prisma.produit.findUnique({
    where: { refInterne },
    select: { id: true },
  });
  if (existant) return existant.id;
  const { id } = await enregistrerProduit(b);
  return id;
}

/**
 * ARCHIVER : le geste normal pour un produit qu'on n'achète plus. Il sort du
 * rayon et des listes de choix, mais son historique reste intact — c'est ce qui
 * permet, deux ans plus tard, de savoir ce qu'on avait posé sur un site.
 */
export async function basculerActifProduit(id: string, actif: boolean): Promise<void> {
  const a = await acteurReferentiel();
  await prisma.produit.update({ where: { id }, data: { actif, updatedById: a.id } });
  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/produits/${id}`);
}

/**
 * SUPPRIMER : réservé au produit créé par erreur, jamais utilisé. Refusé dès
 * qu'il existe un mouvement, un exemplaire ou une réservation.
 *
 * Ce garde-fou n'est pas de la prudence décorative : `MouvementStock` est en
 * `onDelete: Cascade` sur le produit. Sans ce contrôle, supprimer un article
 * emporterait silencieusement tout son historique de stock — l'inverse exact de
 * l'invariant que tient cet outil.
 */
export async function supprimerProduit(id: string): Promise<void> {
  await acteurReferentiel();

  const [nbMouvements, nbExemplaires, nbReservations] = await Promise.all([
    prisma.mouvementStock.count({ where: { produitId: id } }),
    prisma.exemplaire.count({ where: { produitId: id } }),
    prisma.reservationStock.count({ where: { produitId: id } }),
  ]);
  if (nbMouvements > 0 || nbExemplaires > 0 || nbReservations > 0) {
    const details = [
      nbMouvements > 0 ? `${nbMouvements} mouvement${nbMouvements > 1 ? "s" : ""}` : null,
      nbExemplaires > 0 ? `${nbExemplaires} exemplaire${nbExemplaires > 1 ? "s" : ""}` : null,
      nbReservations > 0 ? `${nbReservations} réservation${nbReservations > 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Ce produit a une histoire (${details}) : archivez-le plutôt que de la supprimer avec lui.`,
    );
  }

  // Ce qui part avec lui n'est que du rattachement, jamais de l'historique :
  // codes appris, nomenclature, lignes de BOM (cascades du schéma).
  await prisma.produit.delete({ where: { id } });
  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/nomenclature`);
}

/* --- Codes-barres appris --------------------------------------------------- */

export async function apprendreCode(p: {
  code: string;
  produitId: string;
  format?: string | null;
}): Promise<void> {
  const a = await acteur();
  const code = texte(p.code);
  if (!code) throw new Error("Code vide");

  const existant = await prisma.codeBarreProduit.findUnique({
    where: { code },
    include: { produit: { select: { refInterne: true } } },
  });
  if (existant && existant.produitId !== p.produitId) {
    throw new Error(`Ce code est déjà associé à ${existant.produit.refInterne}`);
  }
  if (existant) return;

  await prisma.codeBarreProduit.create({
    data: {
      code,
      format: texteOuNull(p.format),
      produitId: p.produitId,
      createdById: a.id,
    },
  });
  revalidatePath(`${RAYON}/produits/${p.produitId}`);
}

export async function oublierCode(id: string): Promise<void> {
  await acteurReferentiel();
  const code = await prisma.codeBarreProduit.delete({ where: { id } });
  revalidatePath(`${RAYON}/produits/${code.produitId}`);
}

/**
 * Le geste qui manquait au scan : un code inconnu dont l'article n'existe pas
 * encore. On crée le produit ET on apprend le code dans la foulée — séparer les
 * deux, c'était laisser l'utilisateur avec un produit tout neuf qu'il faudrait
 * rescanner pour l'associer.
 *
 */
export async function creerProduitDepuisCode(p: {
  code: string;
  format?: string | null;
  produit: BrouillonProduit;
}): Promise<{ id: string; refInterne: string; designation: string; unite: string; stock: number }> {
  await acteurReferentiel();
  const code = texte(p.code);
  if (!code) throw new Error("Code vide");

  const dejaPris = await prisma.codeBarreProduit.findUnique({
    where: { code },
    include: { produit: { select: { refInterne: true } } },
  });
  if (dejaPris) throw new Error(`Ce code est déjà associé à ${dejaPris.produit.refInterne}`);

  const produitId = await produitDuBrouillon(p.produit);
  await apprendreCode({ code, produitId, format: p.format });

  const cree = await prisma.produit.findUniqueOrThrow({
    where: { id: produitId },
    select: { id: true, refInterne: true, designation: true, unite: true },
  });
  revalidatePath(RAYON);
  // Un produit tout juste créé n'a par construction aucun mouvement : son stock
  // de départ est zéro, inutile de le recalculer.
  return { ...cree, stock: 0 };
}

/* --- Mouvements ------------------------------------------------------------ */

export interface SaisieMouvement {
  type: string;
  produitId: string;
  quantite: number;
  depotSourceId?: string | null;
  depotDestId?: string | null;
  /** En centimes. Ignoré si l'utilisateur n'a pas le droit de voir les prix. */
  prixUnitaireCents?: number | null;
  numeroAchat?: string | null;
  chantierId?: string | null;
  note?: string;
  /** N° de série captés (0 à n, jamais imposés — invariant 2). */
  series?: string[];
  /** Horodatage du geste si différé (défaut : maintenant). */
  faitLe?: string | null;
}

/**
 * Le seul point d'entrée pour faire bouger du stock. Valide le couple
 * (type, dépôts) selon SENS_MOUVEMENT, écrit le mouvement et met à jour les
 * exemplaires sérialisés — le tout dans une transaction, pour qu'un stock ne
 * puisse jamais diverger de ses numéros de série.
 */
export async function enregistrerMouvement(m: SaisieMouvement): Promise<{ id: string }> {
  const a = await acteur();

  if (!estTypeMouvement(m.type)) throw new Error("Type de mouvement inconnu");
  const type = m.type as TypeMouvement;
  if (!TYPES_SAISISSABLES.includes(type)) {
    throw new Error("Un écart d'inventaire ne se saisit pas à la main : il sort d'un comptage");
  }

  const quantite = entierPositif(m.quantite, "Quantité");
  const sens = SENS_MOUVEMENT[type];
  const source = texteOuNull(m.depotSourceId);
  const dest = texteOuNull(m.depotDestId);

  if (sens.source && !source) throw new Error("Dépôt de départ requis");
  if (sens.dest && !dest) throw new Error("Dépôt d'arrivée requis");
  if (!sens.source && source) throw new Error("Ce mouvement n'a pas de dépôt de départ");
  if (!sens.dest && dest) throw new Error("Ce mouvement n'a pas de dépôt d'arrivée");
  if (source && dest && source === dest) {
    throw new Error("Un transfert doit changer de dépôt");
  }

  const produit = await prisma.produit.findUnique({
    where: { id: texte(m.produitId) },
    select: { id: true, refInterne: true },
  });
  if (!produit) throw new Error("Produit inconnu");

  // Les séries en double dans une même saisie sont une faute de frappe, pas une
  // intention : on dédoublonne sans bruit plutôt que de faire échouer le scan.
  const series = Array.from(
    new Set((m.series ?? []).map((s) => texte(s)).filter((s) => s.length > 0)),
  );
  if (series.length > quantite) {
    throw new Error(
      `${series.length} numéros de série pour une quantité de ${quantite} : la quantité fait foi`,
    );
  }

  const prix = peutVoirPrix(a.role) ? m.prixUnitaireCents ?? null : null;
  const faitLe = m.faitLe ? new Date(m.faitLe) : new Date();
  if (Number.isNaN(faitLe.getTime())) throw new Error("Date invalide");

  const mouvement = await prisma.$transaction(async (tx) => {
    const cree = await tx.mouvementStock.create({
      data: {
        type,
        produitId: produit.id,
        quantite,
        depotSourceId: source,
        depotDestId: dest,
        prixUnitaireCents: type === "RECEPTION" ? prix : null,
        numeroAchat: type === "RECEPTION" ? texteOuNull(m.numeroAchat) : null,
        chantierId: texteOuNull(m.chantierId),
        note: texte(m.note),
        faitLe,
        createdById: a.id,
      },
    });

    for (const numeroSerie of series) {
      const entrant = sens.dest;
      const etat = type === "REBUT" ? "REBUT" : entrant ? "EN_STOCK" : "SORTI";
      await tx.exemplaire.upsert({
        where: { produitId_numeroSerie: { produitId: produit.id, numeroSerie } },
        create: {
          produitId: produit.id,
          numeroSerie,
          etat,
          depotId: entrant ? dest : null,
          chantierId: entrant ? null : texteOuNull(m.chantierId),
          receptionId: entrant ? cree.id : null,
          sortieId: entrant ? null : cree.id,
        },
        update: {
          etat,
          depotId: entrant ? dest : null,
          chantierId: entrant ? null : texteOuNull(m.chantierId),
          ...(entrant ? { receptionId: cree.id, sortieId: null } : { sortieId: cree.id }),
        },
      });
    }

    return cree;
  });

  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/produits/${produit.id}`);
  if (m.chantierId) {
    revalidatePath(`/affaires/${m.chantierId}`);
    revalidatePath(`${RAYON}/affaires/${m.chantierId}`);
  }
  return { id: mouvement.id };
}

/**
 * CORRECTION MANUELLE DU STOCK — réservée aux administrateurs.
 *
 * Le cas réel : un technicien a pris deux modules sans scanner, on s'en aperçoit
 * trois jours plus tard. Ouvrir une campagne d'inventaire pour une référence
 * serait absurde ; laisser le stock faux serait pire.
 *
 * On saisit ce qu'il y a VRAIMENT (« il en reste 3 »), pas un écart à calculer
 * de tête. Le système en déduit la différence et écrit un mouvement `ECART` :
 * l'invariant tient, rien n'est modifié en place, et l'historique garde la trace
 * de qui a corrigé, quand et POURQUOI — le motif est obligatoire, sans quoi un
 * stock se met à dériver sans que personne ne puisse le reconstituer.
 */
export async function corrigerStock(p: {
  produitId: string;
  depotId: string;
  quantiteReelle: number;
  motif: string;
}): Promise<{ ecart: number }> {
  const a = await acteur();
  if (!peutCorrigerStock(a.role)) {
    throw new Error("La correction de stock est réservée aux administrateurs");
  }

  const motif = texte(p.motif);
  if (!motif) throw new Error("Motif obligatoire : une correction sans explication est ingérable");

  const reelle = Math.round(Number(p.quantiteReelle));
  if (!Number.isFinite(reelle) || reelle < 0) throw new Error("Quantité réelle invalide");

  const [entrees, sorties] = await Promise.all([
    prisma.mouvementStock.aggregate({
      where: { produitId: p.produitId, depotDestId: p.depotId },
      _sum: { quantite: true },
    }),
    prisma.mouvementStock.aggregate({
      where: { produitId: p.produitId, depotSourceId: p.depotId },
      _sum: { quantite: true },
    }),
  ]);
  const theorique = (entrees._sum.quantite ?? 0) - (sorties._sum.quantite ?? 0);
  const delta = reelle - theorique;
  if (delta === 0) throw new Error("Le stock est déjà à cette valeur — rien à corriger");

  await prisma.mouvementStock.create({
    data: {
      type: "ECART",
      produitId: p.produitId,
      quantite: Math.abs(delta),
      // Même règle que partout : la destination incrémente, la source décrémente.
      depotDestId: delta > 0 ? p.depotId : null,
      depotSourceId: delta < 0 ? p.depotId : null,
      note: `Correction manuelle : ${theorique} → ${reelle}. ${motif}`,
      createdById: a.id,
    },
  });

  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/produits/${p.produitId}`);
  return { ecart: delta };
}

/** Annule un mouvement en écrivant son inverse — on ne supprime jamais une
 *  ligne d'historique (c'est ce qui rend le stock auditable). */
export async function contrepasserMouvement(id: string, motif: string): Promise<void> {
  const a = await acteur();
  const m = await prisma.mouvementStock.findUnique({ where: { id } });
  if (!m) throw new Error("Mouvement introuvable");
  if (m.type === "ECART") throw new Error("Un écart d'inventaire ne se contrepasse pas");

  await prisma.mouvementStock.create({
    data: {
      type: m.type,
      produitId: m.produitId,
      quantite: m.quantite,
      // L'inverse d'un mouvement, c'est le même mouvement dépôts échangés.
      depotSourceId: m.depotDestId,
      depotDestId: m.depotSourceId,
      chantierId: m.chantierId,
      prixUnitaireCents: null,
      note: `Annulation du mouvement du ${m.faitLe.toLocaleDateString("fr-FR")}${
        motif.trim() ? ` — ${motif.trim()}` : ""
      }`,
      createdById: a.id,
    },
  });

  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/produits/${m.produitId}`);
  if (m.chantierId) revalidatePath(`/affaires/${m.chantierId}`);
}

/* --- Session de scan ------------------------------------------------------- */

/** Résolution d'un code lu, pour l'écran de scan (action, donc appelable depuis
 *  le client). Null = code inconnu → l'écran proposera de l'associer. */
export async function chercherParCode(code: string): Promise<ProduitBref | null> {
  await acteur();
  return produitParCode(code);
}

export interface LigneScan {
  produitId: string;
  quantite: number;
  series?: string[];
}

/**
 * Écrit d'un coup tous les articles d'une session de scan. Une transaction :
 * une session validée passe en entier ou pas du tout — sinon on ne saurait plus
 * ce qui a été compté.
 */
export async function enregistrerLotScan(p: {
  type: string;
  lignes: LigneScan[];
  depotId: string;
  chantierId?: string | null;
  numeroAchat?: string | null;
}): Promise<{ nb: number }> {
  const a = await acteur();

  if (!estTypeMouvement(p.type)) throw new Error("Type de mouvement inconnu");
  const type = p.type as TypeMouvement;
  if (type !== "RECEPTION" && type !== "SORTIE") {
    throw new Error("Une session de scan est soit une réception, soit une sortie");
  }
  const lignes = p.lignes.filter((l) => l.quantite > 0);
  if (lignes.length === 0) throw new Error("Rien à enregistrer");

  const entrant = type === "RECEPTION";
  const chantierId = entrant ? null : texteOuNull(p.chantierId);

  await prisma.$transaction(async (tx) => {
    for (const l of lignes) {
      const mouvement = await tx.mouvementStock.create({
        data: {
          type,
          produitId: l.produitId,
          quantite: Math.round(l.quantite),
          depotSourceId: entrant ? null : p.depotId,
          depotDestId: entrant ? p.depotId : null,
          numeroAchat: entrant ? texteOuNull(p.numeroAchat) : null,
          chantierId,
          note: "Session de scan",
          createdById: a.id,
        },
      });
      for (const numeroSerie of new Set((l.series ?? []).filter(Boolean))) {
        await tx.exemplaire.upsert({
          where: { produitId_numeroSerie: { produitId: l.produitId, numeroSerie } },
          create: {
            produitId: l.produitId,
            numeroSerie,
            etat: entrant ? "EN_STOCK" : "SORTI",
            depotId: entrant ? p.depotId : null,
            chantierId,
            ...(entrant ? { receptionId: mouvement.id } : { sortieId: mouvement.id }),
          },
          update: {
            etat: entrant ? "EN_STOCK" : "SORTI",
            depotId: entrant ? p.depotId : null,
            chantierId,
            ...(entrant ? { receptionId: mouvement.id } : { sortieId: mouvement.id }),
          },
        });
      }
    }
  });

  revalidatePath(RAYON);
  if (chantierId) {
    revalidatePath(`/affaires/${chantierId}`);
    revalidatePath(`${RAYON}/affaires/${chantierId}`);
  }
  return { nb: lignes.length };
}

/* --- Dépôts ---------------------------------------------------------------- */

export async function enregistrerDepot(p: {
  id?: string;
  nom: string;
  code: string;
  type: string;
  dortoir?: boolean;
  actif?: boolean;
  detenteurId?: string | null;
}): Promise<void> {
  await acteurReferentiel();
  const nom = texte(p.nom);
  const code = texte(p.code).toUpperCase();
  if (!nom) throw new Error("Nom du dépôt requis");
  if (!code) throw new Error("Code du dépôt requis");
  if (!estTypeDepot(p.type)) throw new Error("Type de dépôt inconnu");

  const data = {
    nom,
    code,
    type: p.type,
    // Un véhicule est un dortoir par défaut (décision de cadrage : sortir vers un
    // camion, c'est déjà considérer le matériel comme consommé).
    dortoir: p.dortoir ?? p.type === "VEHICULE",
    actif: p.actif ?? true,
    detenteurId: texteOuNull(p.detenteurId),
  };

  try {
    if (p.id) await prisma.depot.update({ where: { id: p.id }, data });
    else await prisma.depot.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Un dépôt porte déjà ce nom ou ce code");
    }
    throw e;
  }
  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/depots`);
}

/* --- Fournisseurs & tarifs ------------------------------------------------- */

export async function enregistrerFournisseur(p: {
  id?: string;
  nom: string;
  contact?: string;
  email?: string;
  tel?: string;
  delaiJours?: number | null;
  note?: string;
  actif?: boolean;
}): Promise<void> {
  await acteurReferentiel();
  const nom = texte(p.nom);
  if (!nom) throw new Error("Nom du fournisseur requis");
  const delai = p.delaiJours === null || p.delaiJours === undefined ? null : Math.round(Number(p.delaiJours));
  const data = {
    nom,
    contact: texte(p.contact),
    email: texte(p.email),
    tel: texte(p.tel),
    delaiJours: Number.isFinite(delai as number) ? delai : null,
    note: texte(p.note),
    actif: p.actif ?? true,
  };
  try {
    if (p.id) await prisma.fournisseur.update({ where: { id: p.id }, data });
    else await prisma.fournisseur.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Un fournisseur porte déjà ce nom");
    }
    throw e;
  }
  revalidatePath(`${RAYON}/fournisseurs`);
}

/* --- Nomenclature (point du catalogue → produits) -------------------------- */

export async function enregistrerNomenclature(p: {
  pointCatalogId: string;
  produitId: string;
  quantite: number;
  optionnel?: boolean;
  /** Groupe de variantes ; vide = ligne toujours fournie. */
  variante?: string | null;
  /** Option retenue quand l'affaire n'a rien choisi. */
  parDefaut?: boolean;
}): Promise<void> {
  await acteurReferentiel();
  const quantite = entierPositif(p.quantite, "Quantité");
  const variante = texteOuNull(p.variante);
  const parDefaut = Boolean(variante) && Boolean(p.parDefaut);
  const champs = { quantite, optionnel: Boolean(p.optionnel), variante, parDefaut };

  await prisma.$transaction(async (tx) => {
    await tx.nomenclaturePoint.upsert({
      where: {
        pointCatalogId_produitId: { pointCatalogId: p.pointCatalogId, produitId: p.produitId },
      },
      create: { pointCatalogId: p.pointCatalogId, produitId: p.produitId, ...champs },
      update: champs,
    });
    if (!variante) return;
    // Un seul défaut par groupe : le poser sur une ligne le retire des autres.
    // Deux défauts se seraient départagés par l'ordre de lecture — donc au
    // hasard, et le hasard se commande en huit exemplaires.
    if (parDefaut) {
      await tx.nomenclaturePoint.updateMany({
        where: { pointCatalogId: p.pointCatalogId, variante, produitId: { not: p.produitId } },
        data: { parDefaut: false },
      });
      return;
    }
    // Un groupe SANS défaut ne produit aucune ligne de BOM : il n'y aurait donc
    // rien sur quoi cliquer pour échanger la fourniture. La première variante
    // d'un groupe en devient le défaut — modifiable d'un clic, sur la ligne.
    const dejaUnDefaut = await tx.nomenclaturePoint.findFirst({
      where: { pointCatalogId: p.pointCatalogId, variante, parDefaut: true },
      select: { id: true },
    });
    if (!dejaUnDefaut) {
      await tx.nomenclaturePoint.update({
        where: {
          pointCatalogId_produitId: { pointCatalogId: p.pointCatalogId, produitId: p.produitId },
        },
        data: { parDefaut: true },
      });
    }
  });
  revalidatePath("/configuration/points");
  revalidatePath(`${RAYON}/produits/${p.produitId}`);
}

export async function supprimerNomenclature(id: string): Promise<void> {
  await acteurReferentiel();
  await prisma.nomenclaturePoint.delete({ where: { id } });
  revalidatePath("/configuration/points");
}

/* --- Matériel d'affaire : lignes manuelles & réservations ------------------ */

/**
 * Ajoute (ou remet à jour) une ligne manuelle de BOM. L'article peut ne pas
 * encore exister au magasin : `nouveauProduit` le crée au passage plutôt que
 * d'obliger à quitter l'affaire, saisir la fiche dans le rayon, puis revenir.
 * Ajouter un article connu reste ouvert à tous ; en créer un est un geste de
 * référentiel, et `produitDuBrouillon` en porte le contrôle de droit.
 *
 * DEUX GESTES, DEUX SENS — et c'est l'appelant qui tranche :
 *   · `cumuler: true` — « il m'en faut 2 de plus » : la quantité s'AJOUTE à ce
 *     qui est déjà saisi. C'est le geste du bouton « Ajouter » : ajouter deux
 *     fois le même article devait additionner, il écrasait.
 *   · sans `cumuler` — « il m'en faut 6 en tout » : la quantité REMPLACE.
 *     C'est le geste de la correction sur la ligne du tableau.
 * La note, elle, n'est écrasée que si on en fournit une : un ré-ajout ne doit
 * pas effacer la raison notée la première fois.
 */
export async function enregistrerLigneMateriel(p: {
  chantierId: string;
  produitId?: string | null;
  nouveauProduit?: BrouillonProduit;
  quantite: number;
  note?: string;
  cumuler?: boolean;
}): Promise<{ produitId: string }> {
  await acteur();
  const quantite = entierPositif(p.quantite, "Quantité");
  const produitId = texteOuNull(p.produitId) ?? (await produitDuBrouillon(p.nouveauProduit));
  const note = p.note === undefined ? undefined : texte(p.note);
  await prisma.ligneMaterielAffaire.upsert({
    where: { chantierId_produitId: { chantierId: p.chantierId, produitId } },
    create: { chantierId: p.chantierId, produitId, quantite, note: note ?? "" },
    update: {
      quantite: p.cumuler ? { increment: quantite } : quantite,
      ...(note === undefined ? {} : { note }),
    },
  });
  revalidatePath(`${RAYON}/affaires/${p.chantierId}`);
  revalidatePath(`/affaires/${p.chantierId}`);
  return { produitId };
}

export async function supprimerLigneMateriel(id: string): Promise<void> {
  await acteur();
  const l = await prisma.ligneMaterielAffaire.delete({ where: { id } });
  revalidatePath(`${RAYON}/affaires/${l.chantierId}`);
  revalidatePath(`/affaires/${l.chantierId}`);
}

/**
 * « Hors de notre fourniture » : l'article est nécessaire au chantier mais il
 * est déjà sur place (ou d'un autre lot). Cocher pose la ligne, décocher la
 * retire — strictement symétrique, aucune donnée perdue dans un sens ni dans
 * l'autre. La décision ne vaut que pour CETTE affaire.
 */
export async function basculerHorsFourniture(p: {
  chantierId: string;
  produitId: string;
  valeur: boolean;
}): Promise<void> {
  const a = await acteur();
  const ou = { chantierId_produitId: { chantierId: p.chantierId, produitId: p.produitId } };
  if (p.valeur) {
    await prisma.materielHorsFourniture.upsert({
      where: ou,
      create: { chantierId: p.chantierId, produitId: p.produitId, createdById: a.id },
      update: {},
    });
  } else {
    await prisma.materielHorsFourniture.deleteMany({
      where: { chantierId: p.chantierId, produitId: p.produitId },
    });
  }
  revalidatePath(`${RAYON}/affaires/${p.chantierId}`);
  revalidatePath(`/affaires/${p.chantierId}`);
}

/**
 * « Sur cette affaire, la sonde radio est de l'Enless. »
 *
 * Trancher un groupe de variantes pour UNE affaire. Le catalogue, lui, ne bouge
 * pas : deux produits interchangeables y restent déclarés, et une autre affaire
 * pourra choisir l'autre. `nomenclatureId` null remet le défaut du catalogue —
 * choisir et dé-choisir sont exactement symétriques.
 *
 * Choisir n'est PAS un geste de référentiel : c'est une décision de chantier,
 * ouverte à tous ceux qui travaillent l'affaire.
 */
export async function choisirVariante(p: {
  chantierId: string;
  pointCatalogId: string;
  variante: string;
  nomenclatureId: string | null;
}): Promise<void> {
  const a = await acteur();
  const variante = texte(p.variante);
  if (!variante) throw new Error("Groupe de variantes manquant");
  const ou = {
    chantierId_pointCatalogId_variante: {
      chantierId: p.chantierId,
      pointCatalogId: p.pointCatalogId,
      variante,
    },
  };

  if (!p.nomenclatureId) {
    await prisma.choixVarianteAffaire.deleteMany({
      where: { chantierId: p.chantierId, pointCatalogId: p.pointCatalogId, variante },
    });
  } else {
    // L'option doit appartenir AU groupe qu'on tranche : sans ce contrôle, un
    // identifiant périmé (variante renommée, produit retiré) poserait un choix
    // muet — la BOM retomberait sur le défaut sans jamais dire pourquoi.
    const option = await prisma.nomenclaturePoint.findUnique({
      where: { id: p.nomenclatureId },
      select: { pointCatalogId: true, variante: true },
    });
    if (!option || option.pointCatalogId !== p.pointCatalogId || option.variante !== variante) {
      throw new Error("Cette option n'appartient pas à ce groupe de variantes");
    }
    await prisma.choixVarianteAffaire.upsert({
      where: ou,
      create: {
        chantierId: p.chantierId,
        pointCatalogId: p.pointCatalogId,
        variante,
        nomenclatureId: p.nomenclatureId,
        createdById: a.id,
      },
      update: { nomenclatureId: p.nomenclatureId },
    });
  }
  revalidatePath(`${RAYON}/affaires/${p.chantierId}`);
  revalidatePath(`/affaires/${p.chantierId}`);
}

/** Pose (ou met à jour) une réservation. Quantité 0 = on annule. */
export async function reserver(p: {
  chantierId: string;
  produitId: string;
  quantite: number;
}): Promise<void> {
  const a = await acteur();
  const quantite = Math.max(0, Math.round(Number(p.quantite)) || 0);

  const existante = await prisma.reservationStock.findFirst({
    where: { chantierId: p.chantierId, produitId: p.produitId, etat: "RESERVEE" },
  });

  if (quantite === 0) {
    if (existante) {
      await prisma.reservationStock.update({
        where: { id: existante.id },
        data: { etat: "ANNULEE" },
      });
    }
  } else if (existante) {
    await prisma.reservationStock.update({ where: { id: existante.id }, data: { quantite } });
  } else {
    await prisma.reservationStock.create({
      data: { chantierId: p.chantierId, produitId: p.produitId, quantite, createdById: a.id },
    });
  }

  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/affaires/${p.chantierId}`);
  revalidatePath(`/affaires/${p.chantierId}`);
}

/**
 * Sert une réservation : écrit la SORTIE correspondante et solde la ligne.
 * C'est le geste de la « préparation » — on sort contre la liste, pas au hasard.
 */
export async function servirReservation(p: {
  reservationId: string;
  depotSourceId: string;
  quantite?: number;
}): Promise<void> {
  const a = await acteur();
  const r = await prisma.reservationStock.findUnique({ where: { id: p.reservationId } });
  if (!r) throw new Error("Réservation introuvable");
  if (r.etat !== "RESERVEE") throw new Error("Réservation déjà soldée");

  const quantite = entierPositif(p.quantite ?? r.quantite, "Quantité");
  if (quantite > r.quantite) throw new Error("Quantité supérieure à la réservation");

  await prisma.$transaction(async (tx) => {
    await tx.mouvementStock.create({
      data: {
        type: "SORTIE",
        produitId: r.produitId,
        quantite,
        depotSourceId: p.depotSourceId,
        chantierId: r.chantierId,
        note: "Préparation d'affaire",
        createdById: a.id,
      },
    });
    // Servir partiellement laisse le reliquat réservé : la préparation peut
    // s'étaler sur plusieurs jours sans perdre le droit posé sur le stock.
    if (quantite === r.quantite) {
      await tx.reservationStock.update({ where: { id: r.id }, data: { etat: "SERVIE" } });
    } else {
      await tx.reservationStock.update({
        where: { id: r.id },
        data: { quantite: r.quantite - quantite },
      });
    }
  });

  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/affaires/${r.chantierId}`);
  revalidatePath(`/affaires/${r.chantierId}`);
}

/* --- Inventaires ----------------------------------------------------------- */

/**
 * Ouvre une campagne : fige le théorique de chaque produit à cet instant.
 * C'est cette photo qui sert de référence — le stock peut continuer de bouger
 * pendant le comptage sans fausser l'écart constaté.
 */
export async function ouvrirInventaire(p: {
  depotId: string;
  libelle?: string;
  categorieId?: string | null;
}): Promise<{ id: string }> {
  const a = await acteurReferentiel();

  const categorieId = texteOuNull(p.categorieId);
  const produits = await prisma.produit.findMany({
    where: { actif: true, ...(categorieId ? { categorieId } : {}) },
    select: { id: true },
  });

  const [entrees, sorties] = await Promise.all([
    prisma.mouvementStock.groupBy({
      by: ["produitId"],
      where: { depotDestId: p.depotId },
      _sum: { quantite: true },
    }),
    prisma.mouvementStock.groupBy({
      by: ["produitId"],
      where: { depotSourceId: p.depotId },
      _sum: { quantite: true },
    }),
  ]);
  const theorique = new Map<string, number>();
  for (const e of entrees) theorique.set(e.produitId, e._sum.quantite ?? 0);
  for (const s of sorties) {
    theorique.set(s.produitId, (theorique.get(s.produitId) ?? 0) - (s._sum.quantite ?? 0));
  }

  const inventaire = await prisma.inventaire.create({
    data: {
      depotId: p.depotId,
      libelle: texte(p.libelle) || `Inventaire du ${new Date().toLocaleDateString("fr-FR")}`,
      ouvertParId: a.id,
      lignes: {
        create: produits.map((prod) => ({
          produitId: prod.id,
          theorique: theorique.get(prod.id) ?? 0,
        })),
      },
    },
  });

  revalidatePath(`${RAYON}/inventaires`);
  return { id: inventaire.id };
}

export async function saisirComptage(p: {
  ligneId: string;
  compte: number | null;
}): Promise<void> {
  await acteur();
  const compte =
    p.compte === null || p.compte === undefined ? null : Math.max(0, Math.round(Number(p.compte)));
  const ligne = await prisma.ligneInventaire.update({
    where: { id: p.ligneId },
    data: { compte },
    select: { inventaireId: true },
  });
  revalidatePath(`${RAYON}/inventaires/${ligne.inventaireId}`);
}

/**
 * Valide la campagne : chaque ligne comptée qui diffère du théorique produit un
 * mouvement ECART. On ne corrige JAMAIS une quantité en place — l'écart reste
 * lisible dans l'historique, et c'est lui qui dit si le rituel tient.
 */
export async function validerInventaire(id: string): Promise<{ nbEcarts: number }> {
  const a = await acteurReferentiel();

  const inventaire = await prisma.inventaire.findUnique({
    where: { id },
    include: { lignes: true },
  });
  if (!inventaire) throw new Error("Inventaire introuvable");
  if (inventaire.etat !== "OUVERT") throw new Error("Inventaire déjà clos");

  const ecarts = inventaire.lignes.filter((l) => l.compte !== null && l.compte !== l.theorique);

  await prisma.$transaction(async (tx) => {
    for (const l of ecarts) {
      const delta = (l.compte as number) - l.theorique;
      await tx.mouvementStock.create({
        data: {
          type: "ECART",
          produitId: l.produitId,
          quantite: Math.abs(delta),
          // Un écart POSITIF est une entrée (le dépôt reçoit ce qu'on avait
          // perdu de vue), un écart négatif une sortie. Même règle que tout le
          // reste : source décrémente, destination incrémente.
          depotDestId: delta > 0 ? inventaire.depotId : null,
          depotSourceId: delta < 0 ? inventaire.depotId : null,
          inventaireId: inventaire.id,
          note: `Inventaire : compté ${l.compte}, théorique ${l.theorique}`,
          createdById: a.id,
        },
      });
    }
    await tx.inventaire.update({
      where: { id },
      data: { etat: "VALIDE", valideLe: new Date() },
    });
  });

  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/inventaires`);
  revalidatePath(`${RAYON}/inventaires/${id}`);
  return { nbEcarts: ecarts.length };
}

export async function annulerInventaire(id: string): Promise<void> {
  await acteurReferentiel();
  await prisma.inventaire.update({ where: { id }, data: { etat: "ANNULE" } });
  revalidatePath(`${RAYON}/inventaires`);
  revalidatePath(`${RAYON}/inventaires/${id}`);
}

/* --- Réparer un trou de BOM ------------------------------------------------ */

/**
 * Relie en un geste ce que la BOM ne savait pas chiffrer : un automate ou un
 * module de la base matériel vers son article, ou un point du catalogue vers
 * les produits qu'il appelle. Le produit peut être choisi OU créé à la volée —
 * sans quoi il faudrait quitter l'écran, créer l'article, revenir, et l'endroit
 * où l'on avait vu le problème serait déjà oublié.
 *
 * Un point absent du catalogue y est ajouté au passage (avec son type d'E/S
 * relevé sur la ligne) : la liste de points accepte les noms libres, la
 * nomenclature ne peut donc pas supposer qu'ils existent.
 */
export async function associerTrou(p: {
  genre: "automate" | "module" | "point";
  cle: string;
  typeIo?: string | null;
  produitId?: string | null;
  nouveauProduit?: BrouillonProduit;
  quantite?: number;
  chantierId?: string;
}): Promise<{ produitId: string }> {
  await acteurReferentiel();
  const cle = texte(p.cle);
  if (!cle) throw new Error("Élément à relier manquant");

  const produitId = texteOuNull(p.produitId) ?? (await produitDuBrouillon(p.nouveauProduit));

  if (p.genre === "automate") {
    const { count } = await prisma.automateModele.updateMany({
      where: { reference: cle },
      data: { produitId },
    });
    if (count === 0) throw new Error(`Aucun automate « ${cle} » dans la base matériel`);
  } else if (p.genre === "module") {
    const { count } = await prisma.moduleModele.updateMany({
      where: { type: cle },
      data: { produitId },
    });
    if (count === 0) throw new Error(`Aucun module « ${cle} » dans la base matériel`);
  } else {
    const point =
      (await prisma.pointCatalog.findUnique({ where: { nom: cle }, select: { id: true } })) ??
      (await prisma.pointCatalog.create({
        data: { nom: cle, type: texte(p.typeIo) || "AI" },
        select: { id: true },
      }));
    await prisma.nomenclaturePoint.upsert({
      where: { pointCatalogId_produitId: { pointCatalogId: point.id, produitId } },
      create: {
        pointCatalogId: point.id,
        produitId,
        quantite: Math.max(1, Math.round(Number(p.quantite ?? 1)) || 1),
      },
      update: { quantite: Math.max(1, Math.round(Number(p.quantite ?? 1)) || 1) },
    });
  }

  revalidatePath(RAYON);
  revalidatePath(`${RAYON}/nomenclature`);
  revalidatePath("/configuration/materiel");
  if (p.chantierId) {
    revalidatePath(`${RAYON}/affaires/${p.chantierId}`);
    revalidatePath(`/affaires/${p.chantierId}`);
  }
  return { produitId };
}

/**
 * Marque (ou démarque) un point comme ne demandant AUCUN matériel : une commande
 * sur un contact déjà présent, un report d'information, du matériel déjà en
 * place… La BOM cesse alors de le signaler.
 *
 * ⚠️ Décision manuelle, point par point. Rien ici ne regarde le type d'E/S :
 * une DO peut parfaitement appeler du matériel, et une AI n'en appeler aucune.
 * Le point est créé au catalogue s'il n'y figure pas encore (les listes de
 * points acceptent les noms libres).
 */
export async function marquerPointSansMateriel(p: {
  nom: string;
  valeur: boolean;
  typeIo?: string | null;
  chantierId?: string;
}): Promise<void> {
  await acteurReferentiel();
  const nom = texte(p.nom);
  if (!nom) throw new Error("Point manquant");

  const existant = await prisma.pointCatalog.findUnique({ where: { nom }, select: { id: true } });
  if (existant) {
    await prisma.pointCatalog.update({
      where: { id: existant.id },
      data: { sansMateriel: p.valeur },
    });
  } else {
    await prisma.pointCatalog.create({
      data: { nom, type: texte(p.typeIo) || "AI", sansMateriel: p.valeur },
    });
  }

  revalidatePath(`${RAYON}/nomenclature`);
  revalidatePath("/configuration/points");
  if (p.chantierId) {
    revalidatePath(`${RAYON}/affaires/${p.chantierId}`);
    revalidatePath(`/affaires/${p.chantierId}`);
  }
}

/* --- Pont avec la base matériel (technique ↔ commerce) --------------------- */

/** Relie un modèle TECHNIQUE (automate / module) à son article de magasin. */
export async function relierModeleAuProduit(p: {
  genre: "automate" | "module";
  modeleId: string;
  produitId: string | null;
}): Promise<void> {
  await acteurReferentiel();
  const produitId = texteOuNull(p.produitId);
  if (p.genre === "automate") {
    await prisma.automateModele.update({ where: { id: p.modeleId }, data: { produitId } });
  } else {
    await prisma.moduleModele.update({ where: { id: p.modeleId }, data: { produitId } });
  }
  revalidatePath("/configuration/materiel");
  if (produitId) revalidatePath(`${RAYON}/produits/${produitId}`);
}
