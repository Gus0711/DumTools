import "server-only";
import { prisma } from "@/lib/db";
import { prixParProduit, prixReference } from "@/tools/magasin/queries";
import {
  GRILLE_VIDE,
  calculerDevis,
  estEtatDevis,
  estGenreLigne,
  estOrigineCoef,
  type ContenuRiche,
  type DevisComplet,
  type DevisResume,
  type GrilleCoefs,
  type LigneDevisVue,
  type LotDevisVue,
  type PrestationVue,
} from "./model";

/* =============================================================================
 * LECTURES DE L'OUTIL DEVIS
 *
 * Un seul point d'attention, mais il porte tout : ce qui s'affiche vient de la
 * LIGNE (la copie figée), jamais du produit. Le référentiel n'est interrogé que
 * pour une chose — savoir si le prix a bougé depuis, et le PROPOSER.
 * ========================================================================== */

/* --- Coefficients ----------------------------------------------------------- */

/** La grille en vigueur, aplatie pour la cascade (voir coefApplicable). */
export async function grilleCoefs(): Promise<GrilleCoefs> {
  const lignes = await prisma.coefVente.findMany();
  const grille: GrilleCoefs = {
    globalMillieme: GRILLE_VIDE.globalMillieme,
    parCategorie: {},
    parProduit: {},
  };
  for (const l of lignes) {
    if (l.portee === "GLOBAL") grille.globalMillieme = l.coefMillieme;
    else if (l.portee === "CATEGORIE" && l.cibleId) grille.parCategorie[l.cibleId] = l.coefMillieme;
    else if (l.portee === "PRODUIT" && l.cibleId) grille.parProduit[l.cibleId] = l.coefMillieme;
  }
  return grille;
}

export interface CoefLigneVue {
  id: string;
  portee: string;
  cibleId: string | null;
  /** Libellé de la cible, résolu pour l'affichage (la table n'a pas de FK). */
  cibleNom: string | null;
  coefMillieme: number;
  note: string;
  updatedAt: Date;
}

/**
 * Les coefficients avec le nom de leur cible. La table ne portant pas de FK
 * (elle doit pouvoir être retirée d'un bloc), une cible disparue donne un nom
 * null : la ligne reste visible et supprimable au lieu de devenir un mystère.
 */
export async function listerCoefs(): Promise<CoefLigneVue[]> {
  const lignes = await prisma.coefVente.findMany({ orderBy: { updatedAt: "desc" } });
  const catIds = lignes.filter((l) => l.portee === "CATEGORIE" && l.cibleId).map((l) => l.cibleId!);
  const prodIds = lignes.filter((l) => l.portee === "PRODUIT" && l.cibleId).map((l) => l.cibleId!);
  const [cats, prods] = await Promise.all([
    catIds.length
      ? prisma.categorieProduit.findMany({ where: { id: { in: catIds } }, select: { id: true, nom: true } })
      : Promise.resolve([]),
    prodIds.length
      ? prisma.produit.findMany({
          where: { id: { in: prodIds } },
          select: { id: true, refInterne: true, designation: true },
        })
      : Promise.resolve([]),
  ]);
  const nomCat = new Map(cats.map((c) => [c.id, c.nom]));
  const nomProd = new Map(prods.map((p) => [p.id, `${p.refInterne} — ${p.designation}`]));
  return lignes.map((l) => ({
    id: l.id,
    portee: l.portee,
    cibleId: l.cibleId,
    cibleNom:
      l.portee === "GLOBAL"
        ? null
        : l.portee === "CATEGORIE"
          ? (nomCat.get(l.cibleId ?? "") ?? null)
          : (nomProd.get(l.cibleId ?? "") ?? null),
    coefMillieme: l.coefMillieme,
    note: l.note,
    updatedAt: l.updatedAt,
  }));
}

/* --- Prestations ------------------------------------------------------------ */

export async function listerPrestations(): Promise<PrestationVue[]> {
  const lignes = await prisma.prestation.findMany({
    orderBy: [{ ordre: "asc" }, { libelle: "asc" }],
    include: { _count: { select: { lignes: true } } },
  });
  return lignes.map((p) => ({
    id: p.id,
    libelle: p.libelle,
    unite: p.unite,
    prixVenteCents: p.prixVenteCents,
    famille: p.famille,
    ordre: p.ordre,
    actif: p.actif,
    note: p.note,
    nbLignes: p._count.lignes,
  }));
}

/* --- Recherche d'articles pour la barre d'ajout ----------------------------- */

export interface ArticleChoix {
  produitId: string;
  refInterne: string;
  refFabricant: string | null;
  designation: string;
  unite: string;
  categorieId: string | null;
  categorieNom: string | null;
  /** Le déboursé retenu — c'est lui qui sera COPIÉ sur la ligne. */
  debourseCents: number | null;
  /** D'où il sort (« prix moyen payé » / « prix d'achat annoncé »). */
  sourcePrix: "pmp" | "achat" | null;
}

/** Recherche d'articles pour la barre d'ajout de l'éditeur. */
export async function rechercherArticles(q: string, limite = 15): Promise<ArticleChoix[]> {
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
    select: {
      id: true,
      refInterne: true,
      refFabricant: true,
      designation: true,
      unite: true,
      categorieId: true,
      categorie: { select: { nom: true } },
    },
  });
  const prix = await prixParProduit();
  return produits.map((p) => {
    const ref = prixReference(prix.get(p.id));
    return {
      produitId: p.id,
      refInterne: p.refInterne,
      refFabricant: p.refFabricant,
      designation: p.designation,
      unite: p.unite,
      categorieId: p.categorieId,
      categorieNom: p.categorie?.nom ?? null,
      debourseCents: ref.cents,
      sourcePrix: ref.source,
    };
  });
}

/** La catégorie de chaque produit — nécessaire à la cascade du coefficient au
 *  moment d'un rafraîchissement en lot (on ne peut pas se fier à la ligne : elle
 *  ne stocke pas la catégorie, qui n'est pas une donnée du devis). */
export async function categoriesDesProduits(ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const produits = await prisma.produit.findMany({
    where: { id: { in: ids } },
    select: { id: true, categorieId: true },
  });
  return new Map(produits.map((p) => [p.id, p.categorieId]));
}

/* --- Le devis --------------------------------------------------------------- */

/**
 * Prix de référence d'aujourd'hui pour les produits cités par des lignes — la
 * SEULE donnée vivante d'un devis, et elle ne sert qu'au bandeau de fraîcheur.
 */
async function deboursesActuels(produitIds: string[]): Promise<Map<string, number | null>> {
  if (produitIds.length === 0) return new Map();
  const prix = await prixParProduit();
  return new Map(produitIds.map((id) => [id, prixReference(prix.get(id)).cents]));
}

export async function getDevis(id: string): Promise<DevisComplet | null> {
  const d = await prisma.devis.findUnique({
    where: { id },
    include: {
      lots: { orderBy: { ordre: "asc" } },
      lignes: { orderBy: { ordre: "asc" } },
      chantier: { select: { nom: true } },
      createdBy: { select: { nom: true } },
      updatedBy: { select: { nom: true } },
    },
  });
  if (!d) return null;

  const produitIds = [...new Set(d.lignes.map((l) => l.produitId).filter((x): x is string => !!x))];
  const actuels = await deboursesActuels(produitIds);

  return {
    entete: {
      id: d.id,
      numero: d.numero,
      revision: d.revision,
      parentId: d.parentId,
      titre: d.titre,
      etat: estEtatDevis(d.etat) ? d.etat : "BROUILLON",
      clientNom: d.clientNom,
      clientId: d.clientId,
      numeroWhy: d.numeroWhy,
      chantierId: d.chantierId,
      chantierNom: d.chantier?.nom ?? null,
      coefDefautMillieme: d.coefDefautMillieme,
      tauxTvaCentieme: d.tauxTvaCentieme,
      remiseGlobalePourMille: d.remiseGlobalePourMille,
      remiseGlobaleCents: d.remiseGlobaleCents,
      validiteJours: d.validiteJours,
      note: d.note,
      emisLe: d.emisLe,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      auteur: d.createdBy?.nom ?? null,
      modifiePar: d.updatedBy?.nom ?? null,
    },
    lots: d.lots.map(
      (l): LotDevisVue => ({ id: l.id, titre: l.titre, ordre: l.ordre, note: l.note }),
    ),
    lignes: d.lignes.map((l): LigneDevisVue => {
      const actuel = l.produitId ? (actuels.get(l.produitId) ?? null) : null;
      return {
        id: l.id,
        lotId: l.lotId,
        ordre: l.ordre,
        genre: estGenreLigne(l.genre) ? l.genre : "LIBRE",
        produitId: l.produitId,
        prestationId: l.prestationId,
        designation: l.designation,
        refInterne: l.refInterne,
        unite: l.unite,
        quantiteMillieme: l.quantiteMillieme,
        debourseCents: l.debourseCents,
        coefMillieme: l.coefMillieme,
        origineCoef: estOrigineCoef(l.origineCoef) ? l.origineCoef : "devis",
        pvUnitaireCents: l.pvUnitaireCents,
        remisePourMille: l.remisePourMille,
        option: l.option,
        note: l.note,
        debourseActuelCents: actuel,
        // Le document riche d'une ligne TEXTE. Prisma rend un `JsonValue` : on
        // ne retient que la forme attendue (un tableau de blocs) — une valeur
        // bricolée à la main en base ferait sinon planter l'éditeur.
        contenu: Array.isArray(l.contenu) ? (l.contenu as ContenuRiche) : null,
        version: l.version,
        majLe: l.updatedAt.toISOString(),
      };
    }),
  };
}

export interface FiltresDevis {
  etat?: string;
  chantierId?: string;
}

/**
 * L'index. Les totaux sont recalculés par le moteur — aucune colonne de total
 * en base (voir docs/DEVIS.md §4) : à l'échelle de quelques centaines de devis
 * c'est une lecture des lignes et une boucle, et ça ne peut pas mentir.
 */
export async function listerDevis(f: FiltresDevis = {}): Promise<DevisResume[]> {
  const devis = await prisma.devis.findMany({
    where: {
      ...(f.etat && estEtatDevis(f.etat) ? { etat: f.etat } : {}),
      ...(f.chantierId ? { chantierId: f.chantierId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      lots: true,
      // Tout SAUF `contenu` : l'index calcule des totaux, il ne rend aucun
      // document. Charger les textes riches de tous les devis pour n'en
      // afficher aucun, c'est le genre de détail qui rend un index lent sans
      // qu'on sache pourquoi.
      lignes: {
        select: {
          id: true,
          lotId: true,
          ordre: true,
          genre: true,
          produitId: true,
          prestationId: true,
          designation: true,
          version: true,
          refInterne: true,
          unite: true,
          quantiteMillieme: true,
          debourseCents: true,
          coefMillieme: true,
          origineCoef: true,
          pvUnitaireCents: true,
          remisePourMille: true,
          option: true,
          note: true,
          updatedAt: true,
        },
      },
      chantier: { select: { nom: true } },
      createdBy: { select: { nom: true } },
      _count: { select: { enfants: true } },
    },
  });

  return devis.map((d) => {
    const lots = d.lots.map(
      (l): LotDevisVue => ({ id: l.id, titre: l.titre, ordre: l.ordre, note: l.note }),
    );
    const lignes = d.lignes.map(
      (l): LigneDevisVue => ({
        id: l.id,
        lotId: l.lotId,
        ordre: l.ordre,
        genre: estGenreLigne(l.genre) ? l.genre : "LIBRE",
        produitId: l.produitId,
        prestationId: l.prestationId,
        designation: l.designation,
        refInterne: l.refInterne,
        unite: l.unite,
        quantiteMillieme: l.quantiteMillieme,
        debourseCents: l.debourseCents,
        coefMillieme: l.coefMillieme,
        origineCoef: estOrigineCoef(l.origineCoef) ? l.origineCoef : "devis",
        pvUnitaireCents: l.pvUnitaireCents,
        remisePourMille: l.remisePourMille,
        option: l.option,
        note: l.note,
        // L'index ne fait PAS le contrôle de fraîcheur : il coûterait une lecture
        // du référentiel entier pour une pastille. Il vit sur la fiche.
        debourseActuelCents: null,
        // Ni les documents riches : voir le `select` ci-dessus.
        contenu: null,
        version: l.version,
        majLe: l.updatedAt.toISOString(),
      }),
    );
    const t = calculerDevis(d, lots, lignes);
    return {
      id: d.id,
      numero: d.numero,
      revision: d.revision,
      titre: d.titre,
      etat: estEtatDevis(d.etat) ? d.etat : "BROUILLON",
      clientNom: d.clientNom,
      numeroWhy: d.numeroWhy,
      chantierId: d.chantierId,
      chantierNom: d.chantier?.nom ?? null,
      totalHtCents: t.totalHtCents,
      netHtCents: t.netHtCents,
      margeFournitureCents: t.margeFournitureCents,
      tauxMargeFournitureCentieme: t.tauxMargeFournitureCentieme,
      nbLignes: t.nbLignes,
      nbSansPrix: t.nbSansPrix,
      updatedAt: d.updatedAt,
      auteur: d.createdBy?.nom ?? null,
      nbRevisions: d._count.enfants,
    };
  });
}

/** Statistiques de l'index (les chiffres du cartouche). */
export interface StatsDevis {
  nbTotal: number;
  nbBrouillons: number;
  nbEmis: number;
  /** Montant net des devis émis et en attente de réponse — le « en jeu ». */
  enJeuCents: number;
  /** Montant net des devis acceptés. */
  gagneCents: number;
}

export function statsDevis(lignes: DevisResume[]): StatsDevis {
  let enJeuCents = 0;
  let gagneCents = 0;
  let nbBrouillons = 0;
  let nbEmis = 0;
  for (const d of lignes) {
    if (d.etat === "BROUILLON") nbBrouillons += 1;
    if (d.etat === "EMIS") {
      nbEmis += 1;
      enJeuCents += d.netHtCents;
    }
    if (d.etat === "ACCEPTE") gagneCents += d.netHtCents;
  }
  return { nbTotal: lignes.length, nbBrouillons, nbEmis, enJeuCents, gagneCents };
}
