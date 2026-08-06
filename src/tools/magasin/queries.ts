import "server-only";
import { prisma } from "@/lib/db";
import type { ClientArtefact } from "@/lib/clients/types";
import {
  formatEuros,
  type CategorieVue,
  type DepotVue,
  type EtatExemplaire,
  type FabricantVue,
  type ExemplaireVue,
  type LigneNomenclature,
  type MouvementVue,
  type ProduitRayon,
  type SourcePrix,
  type TypeDepot,
  type TypeMouvement,
} from "./model";

/* =============================================================================
 * LECTURES DU MAGASIN
 *
 * Le stock n'est stocké nulle part : il est recalculé à la demande comme la
 * somme des mouvements (invariant 1, voir model.ts). À l'échelle de quelques
 * centaines de produits c'est deux agrégats indexés — si la table de mouvements
 * grossit vraiment, on passera à une vue matérialisée SANS changer l'invariant.
 * ========================================================================== */

/** Dépôts qui tiennent réellement un stock : les « dortoirs » (camions) en sont
 *  exclus — ce qui y entre est considéré comme consommé. */
export async function depotsTenus(): Promise<string[]> {
  const depots = await prisma.depot.findMany({
    where: { dortoir: false, actif: true },
    select: { id: true },
  });
  return depots.map((d) => d.id);
}

export async function listerDepots(): Promise<DepotVue[]> {
  const depots = await prisma.depot.findMany({
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
  });
  return depots.map((d) => ({
    id: d.id,
    nom: d.nom,
    code: d.code,
    type: d.type as TypeDepot,
    dortoir: d.dortoir,
    actif: d.actif,
  }));
}

/** Stock par produit, tous dépôts tenus confondus. */
async function stockParProduit(): Promise<Map<string, number>> {
  const tenus = await depotsTenus();
  if (tenus.length === 0) return new Map();

  const [entrees, sorties] = await Promise.all([
    prisma.mouvementStock.groupBy({
      by: ["produitId"],
      where: { depotDestId: { in: tenus } },
      _sum: { quantite: true },
    }),
    prisma.mouvementStock.groupBy({
      by: ["produitId"],
      where: { depotSourceId: { in: tenus } },
      _sum: { quantite: true },
    }),
  ]);

  const stock = new Map<string, number>();
  for (const e of entrees) stock.set(e.produitId, e._sum.quantite ?? 0);
  for (const s of sorties) {
    stock.set(s.produitId, (stock.get(s.produitId) ?? 0) - (s._sum.quantite ?? 0));
  }
  return stock;
}

/** Quantités encore réservées (non servies) par produit. */
async function reserveParProduit(): Promise<Map<string, number>> {
  const lignes = await prisma.reservationStock.groupBy({
    by: ["produitId"],
    where: { etat: "RESERVEE" },
    _sum: { quantite: true },
  });
  return new Map(lignes.map((l) => [l.produitId, l._sum.quantite ?? 0]));
}

export interface PrixProduit {
  /** Prix moyen pondéré des réceptions valorisées : ce que le stock a coûté. */
  pmp: number | null;
  /** Dernier prix réellement payé — sert à pré-remplir une saisie. */
  dernier: number | null;
  /** Prix d'achat annoncé, porté par le produit (un produit = un fournisseur). */
  achat: number | null;
}

/**
 * Prix d'un produit, par ordre de fiabilité décroissante :
 *   1. le PRIX MOYEN PONDÉRÉ des réceptions — ce qu'on a réellement payé ;
 *   2. à défaut, le PRIX D'ACHAT annoncé sur la fiche — ce qu'on devrait payer.
 *
 * Le premier n'existe qu'après une réception valorisée ; le second permet de
 * chiffrer un produit qu'on n'a jamais acheté. Sans ce repli, un magasin qui
 * vient d'être créé n'affiche aucun prix nulle part, ce qui donne l'impression
 * que la fonction ne marche pas.
 */
async function prixParProduit(): Promise<Map<string, PrixProduit>> {
  const [moyens, derniers] = await Promise.all([
    prisma.$queryRaw<{ produitId: string; total: number; qte: number }[]>`
      SELECT "produitId",
             SUM("quantite" * "prixUnitaireCents")::double precision AS total,
             SUM("quantite")::double precision AS qte
        FROM "MouvementStock"
       WHERE "type" = 'RECEPTION' AND "prixUnitaireCents" IS NOT NULL
       GROUP BY "produitId"`,
    prisma.$queryRaw<{ produitId: string; prix: number }[]>`
      SELECT DISTINCT ON ("produitId") "produitId", "prixUnitaireCents"::double precision AS prix
        FROM "MouvementStock"
       WHERE "type" = 'RECEPTION' AND "prixUnitaireCents" IS NOT NULL
       ORDER BY "produitId", "faitLe" DESC, "createdAt" DESC`,
  ]);

  const achats = await prisma.produit.findMany({
    where: { prixAchatCents: { not: null } },
    select: { id: true, prixAchatCents: true },
  });

  const vide = (): PrixProduit => ({ pmp: null, dernier: null, achat: null });
  const out = new Map<string, PrixProduit>();
  for (const m of moyens) {
    const courant = out.get(m.produitId) ?? vide();
    courant.pmp = m.qte > 0 ? Math.round(m.total / m.qte) : null;
    out.set(m.produitId, courant);
  }
  for (const d of derniers) {
    const courant = out.get(d.produitId) ?? vide();
    courant.dernier = Math.round(d.prix);
    out.set(d.produitId, courant);
  }
  for (const a of achats) {
    const courant = out.get(a.id) ?? vide();
    courant.achat = a.prixAchatCents;
    out.set(a.id, courant);
  }
  return out;
}

/** Le prix qui sert à chiffrer, et d'où il vient (voir prixParProduit). */
export function prixReference(p: PrixProduit | undefined): {
  cents: number | null;
  source: SourcePrix;
} {
  if (p?.pmp != null) return { cents: p.pmp, source: "pmp" };
  if (p?.achat != null) return { cents: p.achat, source: "achat" };
  return { cents: null, source: null };
}

export interface FiltresRayon {
  q?: string;
  categorieId?: string | "TOUTES";
  /** N'afficher que ce qui est sous le seuil de réapprovisionnement. */
  sousSeuil?: boolean;
  /** Inclure les produits archivés. */
  avecArchives?: boolean;
}

/** Le rayon : tous les produits avec leur stock, leur réservé et leurs prix. */
export async function listerRayon(f: FiltresRayon = {}): Promise<ProduitRayon[]> {
  const q = f.q?.trim();
  const produits = await prisma.produit.findMany({
    where: {
      ...(f.avecArchives ? {} : { actif: true }),
      ...(f.categorieId && f.categorieId !== "TOUTES" ? { categorieId: f.categorieId } : {}),
      ...(q
        ? {
            OR: [
              { refInterne: { contains: q, mode: "insensitive" as const } },
              { refFabricant: { contains: q, mode: "insensitive" as const } },
              { designation: { contains: q, mode: "insensitive" as const } },
              { fabricant: { nom: { contains: q, mode: "insensitive" as const } } },
              { emplacement: { contains: q, mode: "insensitive" as const } },
              { codes: { some: { code: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    include: { categorie: { select: { nom: true, ordre: true } }, fabricant: { select: { nom: true } } },
    // Les produits sans catégorie ferment la marche plutôt que de l'ouvrir :
    // ce qui n'est pas rangé ne doit pas s'imposer en tête du rayon.
    orderBy: [
      { categorie: { ordre: "asc" } },
      { categorie: { nom: "asc" } },
      { refInterne: "asc" },
    ],
  });

  const [stock, reserve, prix] = await Promise.all([
    stockParProduit(),
    reserveParProduit(),
    prixParProduit(),
  ]);

  const lignes: ProduitRayon[] = produits.map((p) => {
    const s = stock.get(p.id) ?? 0;
    const r = reserve.get(p.id) ?? 0;
    const pr = prix.get(p.id);
    const ref = prixReference(pr);
    return {
      id: p.id,
      refInterne: p.refInterne,
      refFabricant: p.refFabricant,
      designation: p.designation,
      fabricantId: p.fabricantId,
      fabricantNom: p.fabricant?.nom ?? null,
      categorieId: p.categorieId,
      categorieNom: p.categorie?.nom ?? null,
      unite: p.unite,
      emplacement: p.emplacement,
      seuilMini: p.seuilMini,
      serialisable: p.serialisable,
      actif: p.actif,
      stock: s,
      reserve: r,
      disponible: s - r,
      pmpCents: pr?.pmp ?? null,
      dernierPrixCents: pr?.dernier ?? null,
      prixAchatCents: pr?.achat ?? null,
      prixRefCents: ref.cents,
      sourcePrix: ref.source,
      sousSeuil: p.seuilMini > 0 && s - r < p.seuilMini,
    };
  });

  return f.sousSeuil ? lignes.filter((l) => l.sousSeuil) : lignes;
}

/**
 * Les deux seuls chiffres dont l'accueil a besoin : la taille du rayon et ce
 * qui est passé sous son seuil de réapprovisionnement.
 *
 * Volontairement séparé de `listerRayon()` — celui-ci calcule aussi tous les
 * prix (PMP, dernier payé, prix d'achat), soit trois requêtes d'agrégation qui
 * ne servent à rien pour une pastille. Sur l'écran le plus visité de l'appli,
 * ça faisait 150 ms pour deux nombres.
 */
export async function alerteRayon(): Promise<{ nbProduits: number; nbSousSeuil: number }> {
  const [produits, stock, reserve] = await Promise.all([
    prisma.produit.findMany({ where: { actif: true }, select: { id: true, seuilMini: true } }),
    stockParProduit(),
    reserveParProduit(),
  ]);
  // Même règle que le rayon : c'est le DISPONIBLE (stock moins réservé) qui
  // déclenche l'alerte, sinon on croit avoir de quoi faire avec du matériel
  // déjà promis à une affaire.
  const nbSousSeuil = produits.filter(
    (p) => p.seuilMini > 0 && (stock.get(p.id) ?? 0) - (reserve.get(p.id) ?? 0) < p.seuilMini,
  ).length;
  return { nbProduits: produits.length, nbSousSeuil };
}

export interface StatsMagasin {
  nbProduits: number;
  nbSousSeuil: number;
  /** Valorisation au PMP, en centimes. Les produits sans prix connu comptent 0. */
  valeurCents: number;
  nbSansPrix: number;
  nbMouvements30j: number;
}

export async function statsMagasin(lignes: ProduitRayon[]): Promise<StatsMagasin> {
  const depuis = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const nbMouvements30j = await prisma.mouvementStock.count({ where: { faitLe: { gte: depuis } } });
  let valeurCents = 0;
  let nbSansPrix = 0;
  for (const l of lignes) {
    if (l.prixRefCents === null) {
      if (l.stock > 0) nbSansPrix += 1;
      continue;
    }
    valeurCents += l.prixRefCents * Math.max(0, l.stock);
  }
  return {
    nbProduits: lignes.length,
    nbSousSeuil: lignes.filter((l) => l.sousSeuil).length,
    valeurCents,
    nbSansPrix,
    nbMouvements30j,
  };
}

/* --- Fiche produit -------------------------------------------------------- */

export interface StockDepot {
  depotId: string;
  depot: string;
  code: string;
  quantite: number;
  dortoir: boolean;
}

export interface FicheProduit {
  id: string;
  refInterne: string;
  refFabricant: string | null;
  designation: string;
  fabricantId: string | null;
  fabricantNom: string | null;
  categorieId: string | null;
  categorieNom: string | null;
  unite: string;
  serialisable: boolean;
  seuilMini: number;
  emplacement: string | null;
  image: string;
  docUrl: string;
  note: string;
  actif: boolean;
  remplaceParId: string | null;
  remplacePar: { id: string; refInterne: string; designation: string } | null;
  /** Vraiment supprimable : aucun mouvement, aucun exemplaire, aucune
   *  réservation. Sinon il faut ARCHIVER — supprimer effacerait l'historique
   *  du stock en cascade, ce qui est exactement ce qu'on refuse. */
  supprimable: boolean;
  stock: number;
  reserve: number;
  disponible: number;
  pmpCents: number | null;
  dernierPrixCents: number | null;
  prixAchatCents: number | null;
  prixRefCents: number | null;
  sourcePrix: SourcePrix;
  fournisseurId: string | null;
  fournisseurNom: string | null;
  refFournisseur: string | null;
  delaiJours: number | null;
  parDepot: StockDepot[];
  codes: { id: string; code: string; format: string | null; appris: Date; par: string | null }[];
  mouvements: MouvementVue[];
  exemplaires: ExemplaireVue[];
  /** Points du catalogue qui appellent ce produit (nomenclature inverse). */
  pointsAppelants: { id: string; nom: string; quantite: number }[];
  /** Modèles techniques reliés (base matériel). */
  modelesTechniques: { type: "automate" | "module"; reference: string }[];
  updatedAt: Date;
}

export async function ficheProduit(id: string): Promise<FicheProduit | null> {
  const p = await prisma.produit.findUnique({
    where: { id },
    include: {
      remplacePar: { select: { id: true, refInterne: true, designation: true } },
      codes: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { nom: true } } },
      },
      fournisseur: { select: { id: true, nom: true } },
      fabricant: { select: { id: true, nom: true } },
      categorie: { select: { id: true, nom: true } },
      nomenclature: {
        include: { pointCatalog: { select: { id: true, nom: true } } },
        orderBy: { pointCatalog: { nom: "asc" } },
      },
      automates: { select: { reference: true } },
      modules: { select: { type: true } },
    },
  });
  if (!p) return null;

  const [mouvementsBruts, exemplairesBruts, depots, reserveAgg, prix, entrees, sorties, nbLiens] =
    await Promise.all([
    prisma.mouvementStock.findMany({
      where: { produitId: id },
      orderBy: [{ faitLe: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        depotSource: { select: { nom: true } },
        depotDest: { select: { nom: true } },
        chantier: { select: { id: true, nom: true } },
        createdBy: { select: { nom: true } },
        _count: { select: { exemplairesEntres: true, exemplairesSortis: true } },
      },
    }),
    prisma.exemplaire.findMany({
      where: { produitId: id },
      orderBy: [{ etat: "asc" }, { numeroSerie: "asc" }],
      include: { depot: { select: { nom: true } }, chantier: { select: { id: true, nom: true } } },
    }),
    prisma.depot.findMany({ orderBy: [{ ordre: "asc" }, { nom: "asc" }] }),
    prisma.reservationStock.aggregate({
      where: { produitId: id, etat: "RESERVEE" },
      _sum: { quantite: true },
    }),
    prixParProduit(),
    // Le stock par dépôt s'agrège sur TOUS les mouvements — surtout pas sur les
    // 200 derniers affichés dans l'historique, qui donneraient un stock faux dès
    // qu'un produit a beaucoup bougé.
    prisma.mouvementStock.groupBy({
      by: ["depotDestId"],
      where: { produitId: id, depotDestId: { not: null } },
      _sum: { quantite: true },
    }),
    prisma.mouvementStock.groupBy({
      by: ["depotSourceId"],
      where: { produitId: id, depotSourceId: { not: null } },
      _sum: { quantite: true },
    }),
    Promise.all([
      prisma.mouvementStock.count({ where: { produitId: id } }),
      prisma.exemplaire.count({ where: { produitId: id } }),
      prisma.reservationStock.count({ where: { produitId: id } }),
    ]),
  ]);

  const entreesParDepot = new Map(entrees.map((e) => [e.depotDestId, e._sum.quantite ?? 0]));
  const sortiesParDepot = new Map(sorties.map((s) => [s.depotSourceId, s._sum.quantite ?? 0]));

  const parDepot: StockDepot[] = [];
  let stock = 0;
  for (const d of depots) {
    const q = (entreesParDepot.get(d.id) ?? 0) - (sortiesParDepot.get(d.id) ?? 0);
    if (q !== 0 || !d.dortoir) {
      parDepot.push({ depotId: d.id, depot: d.nom, code: d.code, quantite: q, dortoir: d.dortoir });
    }
    if (!d.dortoir && d.actif) stock += q;
  }

  const reserve = reserveAgg._sum.quantite ?? 0;
  const pr = prix.get(id);
  const ref = prixReference(pr);

  return {
    id: p.id,
    refInterne: p.refInterne,
    refFabricant: p.refFabricant,
    designation: p.designation,
    fabricantId: p.fabricantId,
    fabricantNom: p.fabricant?.nom ?? null,
    categorieId: p.categorieId,
    categorieNom: p.categorie?.nom ?? null,
    unite: p.unite,
    serialisable: p.serialisable,
    seuilMini: p.seuilMini,
    emplacement: p.emplacement,
    image: p.image,
    docUrl: p.docUrl,
    note: p.note,
    actif: p.actif,
    remplaceParId: p.remplaceParId,
    remplacePar: p.remplacePar,
    supprimable: nbLiens.every((n) => n === 0),
    stock,
    reserve,
    disponible: stock - reserve,
    pmpCents: pr?.pmp ?? null,
    dernierPrixCents: pr?.dernier ?? null,
    prixAchatCents: pr?.achat ?? null,
    prixRefCents: ref.cents,
    sourcePrix: ref.source,
    fournisseurId: p.fournisseurId,
    fournisseurNom: p.fournisseur?.nom ?? null,
    refFournisseur: p.refFournisseur,
    delaiJours: p.delaiJours,
    parDepot,
    codes: p.codes.map((c) => ({
      id: c.id,
      code: c.code,
      format: c.format,
      appris: c.createdAt,
      par: c.createdBy?.nom ?? null,
    })),
    mouvements: mouvementsBruts.map((m) => ({
      id: m.id,
      type: m.type as TypeMouvement,
      quantite: m.quantite,
      produitId: m.produitId,
      produitRef: p.refInterne,
      produitDesignation: p.designation,
      unite: p.unite,
      depotSource: m.depotSource?.nom ?? null,
      depotDest: m.depotDest?.nom ?? null,
      prixUnitaireCents: m.prixUnitaireCents,
      numeroAchat: m.numeroAchat,
      chantierId: m.chantier?.id ?? null,
      chantierNom: m.chantier?.nom ?? null,
      note: m.note,
      faitLe: m.faitLe,
      auteur: m.createdBy?.nom ?? null,
      nbExemplaires: m._count.exemplairesEntres + m._count.exemplairesSortis,
      inventaireId: m.inventaireId,
    })),
    exemplaires: exemplairesBruts.map((e) => ({
      id: e.id,
      numeroSerie: e.numeroSerie,
      etat: e.etat as EtatExemplaire,
      depot: e.depot?.nom ?? null,
      chantierId: e.chantier?.id ?? null,
      chantierNom: e.chantier?.nom ?? null,
      note: e.note,
    })),
    pointsAppelants: p.nomenclature.map((n) => ({
      id: n.pointCatalog.id,
      nom: n.pointCatalog.nom,
      quantite: n.quantite,
    })),
    modelesTechniques: [
      ...p.automates.map((a) => ({ type: "automate" as const, reference: a.reference })),
      ...p.modules.map((m) => ({ type: "module" as const, reference: m.type })),
    ],
    updatedAt: p.updatedAt,
  };
}

/* --- Journal des mouvements ----------------------------------------------- */

export interface FiltresMouvements {
  produitId?: string;
  chantierId?: string;
  type?: TypeMouvement;
  limite?: number;
}

export async function listerMouvements(f: FiltresMouvements = {}): Promise<MouvementVue[]> {
  const mouvements = await prisma.mouvementStock.findMany({
    where: {
      ...(f.produitId ? { produitId: f.produitId } : {}),
      ...(f.chantierId ? { chantierId: f.chantierId } : {}),
      ...(f.type ? { type: f.type } : {}),
    },
    orderBy: [{ faitLe: "desc" }, { createdAt: "desc" }],
    take: f.limite ?? 100,
    include: {
      produit: { select: { refInterne: true, designation: true, unite: true } },
      depotSource: { select: { nom: true } },
      depotDest: { select: { nom: true } },
      chantier: { select: { id: true, nom: true } },
      createdBy: { select: { nom: true } },
      _count: { select: { exemplairesEntres: true, exemplairesSortis: true } },
    },
  });

  return mouvements.map((m) => ({
    id: m.id,
    type: m.type as TypeMouvement,
    quantite: m.quantite,
    produitId: m.produitId,
    produitRef: m.produit.refInterne,
    produitDesignation: m.produit.designation,
    unite: m.produit.unite,
    depotSource: m.depotSource?.nom ?? null,
    depotDest: m.depotDest?.nom ?? null,
    prixUnitaireCents: m.prixUnitaireCents,
    numeroAchat: m.numeroAchat,
    chantierId: m.chantier?.id ?? null,
    chantierNom: m.chantier?.nom ?? null,
    note: m.note,
    faitLe: m.faitLe,
    auteur: m.createdBy?.nom ?? null,
    nbExemplaires: m._count.exemplairesEntres + m._count.exemplairesSortis,
    inventaireId: m.inventaireId,
  }));
}

/* --- Recherche / scan ------------------------------------------------------ */

export interface ProduitBref {
  id: string;
  refInterne: string;
  refFabricant: string | null;
  designation: string;
  unite: string;
  serialisable: boolean;
  stock: number;
  dernierPrixCents: number | null;
}

/** Recherche pour les comboboxes (mouvement, nomenclature, BOM). */
export async function rechercherProduits(q: string, limite = 20): Promise<ProduitBref[]> {
  const requete = q.trim();
  const produits = await prisma.produit.findMany({
    where: {
      actif: true,
      ...(requete
        ? {
            OR: [
              { refInterne: { contains: requete, mode: "insensitive" as const } },
              { refFabricant: { contains: requete, mode: "insensitive" as const } },
              { designation: { contains: requete, mode: "insensitive" as const } },
              { fabricant: { nom: { contains: requete, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { refInterne: "asc" },
    take: limite,
  });
  const [stock, prix] = await Promise.all([stockParProduit(), prixParProduit()]);
  return produits.map((p) => ({
    id: p.id,
    refInterne: p.refInterne,
    refFabricant: p.refFabricant,
    designation: p.designation,
    unite: p.unite,
    serialisable: p.serialisable,
    stock: stock.get(p.id) ?? 0,
    dernierPrixCents: prix.get(p.id)?.dernier ?? null,
  }));
}

/**
 * Résolution d'un code scanné. Cherche d'abord un code APPRIS, puis retombe sur
 * les références (un code-barres qui contient littéralement la référence, cas
 * fréquent des étiquettes fabricant). Null = code inconnu → on proposera de
 * l'associer, et il sera appris pour toujours.
 */
export async function produitParCode(code: string): Promise<ProduitBref | null> {
  const propre = code.trim();
  if (!propre) return null;

  const appris = await prisma.codeBarreProduit.findUnique({
    where: { code: propre },
    select: { produitId: true },
  });

  const produit = appris
    ? await prisma.produit.findUnique({ where: { id: appris.produitId } })
    : await prisma.produit.findFirst({
        where: {
          actif: true,
          OR: [
            { refInterne: { equals: propre, mode: "insensitive" as const } },
            { refFabricant: { equals: propre, mode: "insensitive" as const } },
          ],
        },
      });
  if (!produit) return null;

  const [stock, prix] = await Promise.all([stockParProduit(), prixParProduit()]);
  return {
    id: produit.id,
    refInterne: produit.refInterne,
    refFabricant: produit.refFabricant,
    designation: produit.designation,
    unite: produit.unite,
    serialisable: produit.serialisable,
    stock: stock.get(produit.id) ?? 0,
    dernierPrixCents: prix.get(produit.id)?.dernier ?? null,
  };
}

/* --- Fournisseurs ---------------------------------------------------------- */

export interface FournisseurVue {
  id: string;
  nom: string;
  contact: string;
  email: string;
  tel: string;
  delaiJours: number | null;
  note: string;
  actif: boolean;
  nbProduits: number;
}

export async function listerFournisseurs(): Promise<FournisseurVue[]> {
  const fournisseurs = await prisma.fournisseur.findMany({
    orderBy: { nom: "asc" },
    include: { _count: { select: { produits: true } } },
  });
  return fournisseurs.map((f) => ({
    id: f.id,
    nom: f.nom,
    contact: f.contact,
    email: f.email,
    tel: f.tel,
    delaiJours: f.delaiJours,
    note: f.note,
    actif: f.actif,
    nbProduits: f._count.produits,
  }));
}

/* --- Catégories & fabricants ----------------------------------------------- */

/** Les catégories, dans l'ordre du magasinier. `nbProduits` n'est pas décoratif :
 *  c'est lui qui décide si une catégorie peut disparaître sans laisser de
 *  produits derrière elle. */
export async function listerCategories(): Promise<CategorieVue[]> {
  const categories = await prisma.categorieProduit.findMany({
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    include: { _count: { select: { produits: true } } },
  });
  return categories.map((c) => ({
    id: c.id,
    nom: c.nom,
    ordre: c.ordre,
    actif: c.actif,
    nbProduits: c._count.produits,
  }));
}

export async function listerFabricants(): Promise<FabricantVue[]> {
  const fabricants = await prisma.fabricant.findMany({
    orderBy: { nom: "asc" },
    include: { _count: { select: { produits: true } } },
  });
  return fabricants.map((f) => ({
    id: f.id,
    nom: f.nom,
    actif: f.actif,
    note: f.note,
    nbProduits: f._count.produits,
  }));
}

/* --- Nomenclature des points ---------------------------------------------- */

export interface PointAvecNomenclature {
  id: string;
  nom: string;
  type: string;
  /** Marqué à la main comme ne demandant aucun matériel (voir model.ts). */
  sansMateriel: boolean;
  lignes: LigneNomenclature[];
}

export async function listerNomenclatures(): Promise<PointAvecNomenclature[]> {
  const points = await prisma.pointCatalog.findMany({
    orderBy: { nom: "asc" },
    include: {
      nomenclature: {
        include: { produit: { select: { id: true, refInterne: true, designation: true } } },
        orderBy: { produit: { refInterne: "asc" } },
      },
    },
  });
  return points.map((p) => ({
    id: p.id,
    nom: p.nom,
    type: p.type,
    sansMateriel: p.sansMateriel,
    lignes: p.nomenclature.map((n) => ({
      id: n.id,
      produitId: n.produitId,
      refInterne: n.produit.refInterne,
      designation: n.produit.designation,
      quantite: n.quantite,
      optionnel: n.optionnel,
    })),
  }));
}

/* --- Inventaires ----------------------------------------------------------- */

export interface InventaireResume {
  id: string;
  libelle: string;
  depot: string;
  etat: string;
  ouvertLe: Date;
  valideLe: Date | null;
  ouvertPar: string | null;
  nbLignes: number;
  nbComptees: number;
  nbEcarts: number;
}

export async function listerInventaires(): Promise<InventaireResume[]> {
  const inventaires = await prisma.inventaire.findMany({
    orderBy: { ouvertLe: "desc" },
    include: {
      depot: { select: { nom: true } },
      ouvertPar: { select: { nom: true } },
      lignes: { select: { compte: true, theorique: true } },
    },
  });
  return inventaires.map((i) => ({
    id: i.id,
    libelle: i.libelle,
    depot: i.depot.nom,
    etat: i.etat,
    ouvertLe: i.ouvertLe,
    valideLe: i.valideLe,
    ouvertPar: i.ouvertPar?.nom ?? null,
    nbLignes: i.lignes.length,
    nbComptees: i.lignes.filter((l) => l.compte !== null).length,
    nbEcarts: i.lignes.filter((l) => l.compte !== null && l.compte !== l.theorique).length,
  }));
}

export interface LigneInventaireVue {
  id: string;
  produitId: string;
  refInterne: string;
  designation: string;
  unite: string;
  emplacement: string | null;
  theorique: number;
  compte: number | null;
  ecart: number | null;
}

export interface InventaireDetail {
  id: string;
  libelle: string;
  note: string;
  depotId: string;
  depot: string;
  etat: string;
  ouvertLe: Date;
  valideLe: Date | null;
  ouvertPar: string | null;
  lignes: LigneInventaireVue[];
}

export async function inventaireDetail(id: string): Promise<InventaireDetail | null> {
  const i = await prisma.inventaire.findUnique({
    where: { id },
    include: {
      depot: { select: { id: true, nom: true } },
      ouvertPar: { select: { nom: true } },
      lignes: {
        include: {
          produit: {
            select: {
              id: true,
              refInterne: true,
              designation: true,
              unite: true,
              emplacement: true,
            },
          },
        },
        orderBy: { produit: { refInterne: "asc" } },
      },
    },
  });
  if (!i) return null;
  return {
    id: i.id,
    libelle: i.libelle,
    note: i.note,
    depotId: i.depot.id,
    depot: i.depot.nom,
    etat: i.etat,
    ouvertLe: i.ouvertLe,
    valideLe: i.valideLe,
    ouvertPar: i.ouvertPar?.nom ?? null,
    lignes: i.lignes.map((l) => ({
      id: l.id,
      produitId: l.produitId,
      refInterne: l.produit.refInterne,
      designation: l.produit.designation,
      unite: l.produit.unite,
      emplacement: l.produit.emplacement,
      theorique: l.theorique,
      compte: l.compte,
      ecart: l.compte === null ? null : l.compte - l.theorique,
    })),
  };
}

/* --- Journal des imports --------------------------------------------------- */

export interface ImportResume {
  id: string;
  genre: string;
  nomFichier: string;
  nbLignes: number;
  nbCreees: number;
  nbMajs: number;
  nbRejetees: number;
  par: string | null;
  createdAt: Date;
}

export async function listerImports(limite = 20): Promise<ImportResume[]> {
  const imports = await prisma.importMagasin.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
    include: { createdBy: { select: { nom: true } } },
  });
  return imports.map((i) => ({
    id: i.id,
    genre: i.genre,
    nomFichier: i.nomFichier,
    nbLignes: i.nbLignes,
    nbCreees: i.nbCreees,
    nbMajs: i.nbMajs,
    nbRejetees: i.nbRejetees,
    par: i.createdBy?.nom ?? null,
    createdAt: i.createdAt,
  }));
}

/* --- Provider fiche Affaire ------------------------------------------------ */

/**
 * Une seule ligne par affaire : « le matériel de l'affaire ». Le détail (BOM,
 * réservations, sorties) vit sur l'écran dédié — la fiche Affaire ne doit pas
 * se transformer en journal de magasin.
 */
export async function listerPourChantier(chantierId: string): Promise<ClientArtefact[]> {
  const [mouvements, reservations, lignes, chantier] = await Promise.all([
    prisma.mouvementStock.findMany({
      where: { chantierId },
      select: { quantite: true, type: true, faitLe: true, prixUnitaireCents: true, produitId: true },
    }),
    prisma.reservationStock.count({ where: { chantierId, etat: "RESERVEE" } }),
    prisma.ligneMaterielAffaire.count({ where: { chantierId } }),
    prisma.chantier.findUnique({ where: { id: chantierId }, select: { numeroWhy: true } }),
  ]);

  if (mouvements.length === 0 && reservations === 0 && lignes === 0) return [];

  const sorties = mouvements.filter((m) => m.type === "SORTIE");
  const retours = mouvements.filter((m) => m.type === "RETOUR");
  const references = new Set(sorties.map((m) => m.produitId));
  const derniere = mouvements.reduce<Date | null>(
    (max, m) => (max === null || m.faitLe > max ? m.faitLe : max),
    null,
  );

  const morceaux: string[] = [];
  if (references.size > 0) {
    const total = sorties.reduce((s, m) => s + m.quantite, 0);
    morceaux.push(`${total} article${total > 1 ? "s" : ""} sorti${total > 1 ? "s" : ""}`);
  }
  if (retours.length > 0) morceaux.push(`${retours.length} retour${retours.length > 1 ? "s" : ""}`);
  if (reservations > 0) morceaux.push(`${reservations} réservation${reservations > 1 ? "s" : ""}`);
  if (lignes > 0) morceaux.push(`${lignes} ligne${lignes > 1 ? "s" : ""} ajoutée${lignes > 1 ? "s" : ""}`);

  return [
    {
      id: `magasin-${chantierId}`,
      titre: "Matériel de l'affaire",
      href: `/outils/magasin/affaires/${chantierId}`,
      numeroWhy: chantier?.numeroWhy ?? null,
      updatedAt: derniere ?? new Date(),
      resume: morceaux.join(" · ") || "Aucun mouvement",
    },
  ];
}

/** Coût matériel réellement sorti sur une affaire (au PMP), en centimes. */
export async function coutMaterielAffaire(chantierId: string): Promise<number> {
  const mouvements = await prisma.mouvementStock.findMany({
    where: { chantierId, type: { in: ["SORTIE", "RETOUR"] } },
    select: { produitId: true, quantite: true, type: true },
  });
  if (mouvements.length === 0) return 0;
  const prix = await prixParProduit();
  let total = 0;
  for (const m of mouvements) {
    const { cents } = prixReference(prix.get(m.produitId));
    if (!cents) continue;
    total += (m.type === "SORTIE" ? 1 : -1) * cents * m.quantite;
  }
  return total;
}

/** Libellé court réutilisé dans les résumés. */
export function resumeValeur(cents: number): string {
  return formatEuros(cents);
}
