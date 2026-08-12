import "server-only";
import { prisma } from "@/lib/db";
import { partageActif } from "@/lib/partage/model";
import { prixParProduit, prixReference } from "@/tools/magasin/queries";
import {
  GRILLE_VIDE,
  SOCIETE_DEFAUT,
  calculerDevis,
  estEtatDevis,
  condenserLots,
  designationClient,
  estGenreLigne,
  estOrigineCoef,
  estRenduLot,
  estEvenementEnregistre,
  reecrireMediasPublicsDevis,
  type ContenuRiche,
  type DevisComplet,
  type DevisResume,
  type EntreeFil,
  type FilDevis,
  type GenreEntreeFil,
  type GrilleCoefs,
  type LigneDevisVue,
  type LotDevisVue,
  type PieceFilVue,
  type PrestationVue,
  type SocieteVue,
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
      createdBy: { select: { nom: true, fonction: true } },
      updatedBy: { select: { nom: true } },
      // La dernière ouverture du lien, et le compte : deux lignes de SQL pour
      // répondre à « le client l'a-t-il vu ? » là où on se pose la question.
      consultations: { orderBy: { vuLe: "desc" }, take: 1, select: { vuLe: true } },
      _count: { select: { consultations: true } },
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
      destinataire: d.destinataire,
      jetonPartage: d.jetonPartage,
      partageExpireLe: d.partageExpireLe,
      publieLe: d.publieLe,
      montrerPrixUnitaires: d.montrerPrixUnitaires,
      montrerSousTotauxLots: d.montrerSousTotauxLots,
      montrerOptions: d.montrerOptions,
      nbConsultations: d._count.consultations,
      derniereConsultation: d.consultations[0]?.vuLe ?? null,
      emisLe: d.emisLe,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      auteur: d.createdBy?.nom ?? null,
      auteurFonction: d.createdBy?.fonction ?? null,
      modifiePar: d.updatedBy?.nom ?? null,
    },
    lots: d.lots.map(
      (l): LotDevisVue => ({
        id: l.id,
        titre: l.titre,
        ordre: l.ordre,
        note: l.note,
        rendu: estRenduLot(l.rendu) ? l.rendu : "DETAILLE",
        libelleClient: l.libelleClient,
      }),
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
      _count: { select: { enfants: true, consultations: true } },
    },
  });

  return devis.map((d) => {
    const lots = d.lots.map(
      (l): LotDevisVue => ({
        id: l.id,
        titre: l.titre,
        ordre: l.ordre,
        note: l.note,
        rendu: estRenduLot(l.rendu) ? l.rendu : "DETAILLE",
        libelleClient: l.libelleClient,
      }),
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
      // `partageActif` est le SEUL juge : un jeton échu reste en base pour être
      // prolongé à la même URL, donc `!!d.jetonPartage` serait un trou.
      publie: partageActif(d),
      nbConsultations: d._count.consultations,
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

/* =============================================================================
 * LA RESTITUTION CLIENT (docs/DEVIS.md §21)
 * ========================================================================== */

/**
 * L'identité de la maison. La table est une LIGNE UNIQUE qui peut ne pas exister
 * encore : on retombe alors sur `SOCIETE_DEFAUT` plutôt que sur des champs
 * vides — un premier devis imprimé sans pied de page serait faux, pas
 * « à compléter ».
 */
export async function getSociete(): Promise<SocieteVue> {
  // Le `select` explicite tient le contrat : `SocieteVue` ne porte ni `id` ni
  // `updatedAt`, et un champ ajouté au modèle demain n'arrivera pas ici par
  // surprise.
  const r = await prisma.reglageSociete.findUnique({
    where: { id: "societe" },
    select: {
      raisonSociale: true,
      formeCapital: true,
      adresse: true,
      codePostal: true,
      ville: true,
      telephone: true,
      email: true,
      siteWeb: true,
      rcs: true,
      codeApe: true,
      tvaIntracom: true,
      iban: true,
      bic: true,
      reglement: true,
      conditionsReglement: true,
      acomptePourMille: true,
      dureeRealisation: true,
      remarques: true,
    },
  });
  return r ?? SOCIETE_DEFAUT;
}

/** Le document client, tel qu'un lien public le sert. */
export interface DevisPublic {
  devis: DevisComplet;
  societe: SocieteVue;
  /** Le jeton par lequel on est entré — les médias des textes riches y sont
   *  réécrits, et la balise de consultation le renvoie. */
  jeton: string;
}

/**
 * Un devis PAR SON JETON, pour la page publique — jamais par son id.
 *
 * Deux gardes, et aucune n'est facultative :
 *   1. `partageActif()` juge le jeton ET son échéance (un jeton échu reste en
 *      base pour être prolongé : `if (jeton)` serait un trou) ;
 *   2. les URL de médias sont réécrites vers la route scopée au jeton — la route
 *      interne `/api/devis/media/...` porte une garde Achats que le client n'a
 *      évidemment pas.
 *
 * Ce qui NE SORT PAS d'ici : le déboursé, le coefficient, l'origine du
 * coefficient, la référence interne, la note interne du devis. Ce n'est pas au
 * composant d'y penser — un champ absent de la réponse ne peut pas fuir.
 */
export async function getDevisPublic(jeton: string): Promise<DevisPublic | null> {
  if (!jeton) return null;

  const d = await prisma.devis.findUnique({
    where: { jetonPartage: jeton },
    include: {
      lots: { orderBy: { ordre: "asc" } },
      lignes: { orderBy: { ordre: "asc" } },
      createdBy: { select: { nom: true, fonction: true } },
    },
  });
  if (!d || !partageActif(d)) return null;

  const societe = await getSociete();

  const lots = d.lots.map((l): LotDevisVue => {
    const rendu = estRenduLot(l.rendu) ? l.rendu : "DETAILLE";
    return {
      id: l.id,
      // Sur un bloc forfaitaire, le TITRE INTERNE ne sort pas : il porte notre
      // vocabulaire (« Matériel Distech + MO »), pas celui du client. On envoie
      // la phrase qu'il doit lire, et rien d'autre.
      titre: rendu === "CONDENSE" ? designationClient({ ...l, rendu }) : l.titre,
      ordre: l.ordre,
      note: l.note,
      rendu,
      libelleClient: l.libelleClient,
    };
  });

  const lignesReelles = d.lignes.map((l): LigneDevisVue => {
    const contenu = Array.isArray(l.contenu) ? (l.contenu as ContenuRiche) : null;
    return {
      id: l.id,
      lotId: l.lotId,
      ordre: l.ordre,
      genre: estGenreLigne(l.genre) ? l.genre : "LIBRE",
      produitId: null,
      prestationId: null,
      designation: l.designation,
      contenu: contenu ? reecrireMediasPublicsDevis(contenu, jeton) : null,
      version: l.version,
      refInterne: null,
      unite: l.unite,
      quantiteMillieme: l.quantiteMillieme,
      // Le déboursé et le coefficient s'arrêtent ici. Le moteur les accepte
      // à null et se contente du prix de vente, qui est tout ce dont un
      // document client a besoin.
      debourseCents: null,
      coefMillieme: null,
      origineCoef: "devis",
      pvUnitaireCents: l.pvUnitaireCents,
      remisePourMille: l.remisePourMille,
      option: l.option,
      // La note d'une ligne est INTERNE (le pendant de la description d'un
      // bloc, qui elle est imprimée). Rien ne l'affiche sur le document, et
      // elle n'a donc rien à faire dans la réponse.
      note: "",
      debourseActuelCents: null,
      majLe: l.updatedAt.toISOString(),
    };
  });

  return {
    jeton,
    societe,
    devis: {
      entete: {
        id: d.id,
        numero: d.numero,
        revision: d.revision,
        parentId: null,
        titre: d.titre,
        etat: estEtatDevis(d.etat) ? d.etat : "BROUILLON",
        clientNom: d.clientNom,
        clientId: null,
        // La référence WhySoft est NOTRE référence de CRM : elle n'a rien à
        // faire sur un document client, qui porte déjà le numéro de devis.
        numeroWhy: null,
        chantierId: null,
        chantierNom: null,
        // Le coefficient de la maison ne sort pas d'ici. La valeur est
        // structurellement exigée par le type ; on ne l'affiche nulle part sur
        // le document, et on la neutralise pour qu'elle ne PUISSE pas fuir.
        coefDefautMillieme: 0,
        tauxTvaCentieme: d.tauxTvaCentieme,
        remiseGlobalePourMille: d.remiseGlobalePourMille,
        remiseGlobaleCents: d.remiseGlobaleCents,
        validiteJours: d.validiteJours,
        destinataire: d.destinataire,
        jetonPartage: d.jetonPartage,
        partageExpireLe: d.partageExpireLe,
        publieLe: d.publieLe,
        montrerPrixUnitaires: d.montrerPrixUnitaires,
        montrerSousTotauxLots: d.montrerSousTotauxLots,
        montrerOptions: d.montrerOptions,
        nbConsultations: 0,
        derniereConsultation: null,
        emisLe: d.emisLe,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        auteur: d.createdBy?.nom ?? null,
        auteurFonction: d.createdBy?.fonction ?? null,
        modifiePar: null,
      },
      lots,
      // ⚠️ LA CONDENSATION EST FAITE ICI, DANS LA REQUÊTE (docs/DEVIS-DETAIL.md
      // §4.4). Les lignes réelles d'un bloc forfaitaire ne sortent pas du
      // serveur — ni dans le HTML, ni dans la charge utile du composant. Ce
      // n'est pas au document d'y penser : un détail absent de la réponse ne
      // peut pas fuir par distraction.
      lignes: condenserLots(
        {
          tauxTvaCentieme: d.tauxTvaCentieme,
          remiseGlobalePourMille: d.remiseGlobalePourMille,
          remiseGlobaleCents: d.remiseGlobaleCents,
        },
        lots,
        lignesReelles,
      ),
    },
  };
}

/** Un média de devis, servi par la route publique scopée au jeton. La garde
 *  vit dans la requête : le média DOIT appartenir au devis de ce jeton. */
export async function getMediaDevisPublic(jeton: string, mediaId: string) {
  if (!jeton || !mediaId) return null;
  const media = await prisma.devisMedia.findFirst({
    where: { id: mediaId, devis: { jetonPartage: jeton } },
    include: { devis: { select: { jetonPartage: true, partageExpireLe: true } } },
  });
  if (!media || !partageActif(media.devis)) return null;
  return media;
}

/** Les dernières ouvertures du lien, pour le bloc de publication. */
export async function listerConsultations(devisId: string, max = 12) {
  return prisma.devisConsultation.findMany({
    where: { devisId },
    orderBy: { vuLe: "desc" },
    take: max,
    select: { id: true, vuLe: true, ip: true },
  });
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


/* =============================================================================
 * LE FIL DU DEVIS (docs/DEVIS-FIL.md)
 *
 * Une seule colonne de temps, alimentée par deux sources qui ne se recouvrent
 * jamais : ce que le modèle SAIT DÉJÀ (déduit, aucune écriture) et ce qu'on a
 * ÉCRIT (messages, et les rares faits sans colonne pour les dater).
 * ========================================================================== */

/** Combien de consultations client on détaille avant de les regrouper. Au-delà,
 *  une par ligne noierait la conversation — et « ouvert 40 fois » se lit mieux
 *  que quarante lignes identiques. */
const CONSULTATIONS_DETAILLEES = 12;

/**
 * Le fil d'un devis — c'est-à-dire de sa CHAÎNE de révisions.
 *
 * `depuis` sert au compteur de non-lus : les messages postés après cette date
 * par quelqu'un d'autre. Les faits n'y entrent pas — personne ne les écrit,
 * personne n'a à les « lire ».
 */
export async function listerFil(
  devisId: string,
  lecteurId?: string,
): Promise<FilDevis | null> {
  const devis = await prisma.devis.findUnique({
    where: { id: devisId },
    select: { id: true, filId: true },
  });
  if (!devis) return null;
  const filId = devis.filId || devis.id;

  const [versions, messages, lecture] = await Promise.all([
    // Toute la chaîne : c'est elle qui porte les faits déductibles.
    prisma.devis.findMany({
      where: { filId },
      select: {
        id: true,
        revision: true,
        parentId: true,
        createdAt: true,
        emisLe: true,
        publieLe: true,
        createdBy: { select: { nom: true } },
        consultations: { select: { vuLe: true }, orderBy: { vuLe: "desc" } },
      },
      orderBy: { revision: "asc" },
    }),
    prisma.messageDevis.findMany({
      where: { filId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        corps: true,
        epingle: true,
        evenement: true,
        createdAt: true,
        modifieLe: true,
        auteurId: true,
        auteur: { select: { nom: true } },
        devis: { select: { revision: true } },
        pieces: {
          select: { id: true, nom: true, mimeType: true, taille: true, verseeLe: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    lecteurId
      ? prisma.lectureFilDevis.findUnique({
          where: { userId_filId: { userId: lecteurId, filId } },
          select: { vuLe: true },
        })
      : null,
  ]);

  const entrees: EntreeFil[] = [];

  const fait = (
    id: string,
    genre: GenreEntreeFil,
    quand: Date,
    revision: number | null,
    detail: string | null,
    auteur: string | null = null,
  ): EntreeFil => ({
    id,
    genre,
    quand,
    corps: "",
    auteur,
    auteurId: null,
    epingle: false,
    modifieLe: null,
    revision,
    detail,
    pieces: [],
  });

  for (const v of versions) {
    entrees.push(
      fait(
        `cree:${v.id}`,
        v.parentId ? "revision" : "cree",
        v.createdAt,
        v.revision,
        v.parentId ? `depuis la v${v.revision - 1}` : null,
        v.createdBy?.nom ?? null,
      ),
    );
    if (v.emisLe) entrees.push(fait(`emis:${v.id}`, "emis", v.emisLe, v.revision, null));
    if (v.publieLe) {
      entrees.push(fait(`publie:${v.id}`, "publie", v.publieLe, v.revision, null));
    }

    // Les consultations : détaillées tant qu'elles se comptent, regroupées
    // au-delà. Une ligne par ouverture sur un devis relancé trois fois
    // enterrerait tout le reste.
    const vues = v.consultations;
    if (vues.length > CONSULTATIONS_DETAILLEES) {
      const recentes = vues.slice(0, CONSULTATIONS_DETAILLEES);
      for (const [i, c] of recentes.entries()) {
        entrees.push(fait(`vu:${v.id}:${i}`, "consultation", c.vuLe, v.revision, null));
      }
      const reste = vues.length - recentes.length;
      const plusAncienne = vues[vues.length - 1];
      entrees.push(
        fait(
          `vu:${v.id}:reste`,
          "consultation",
          plusAncienne.vuLe,
          v.revision,
          `et ${reste} ouverture${reste > 1 ? "s" : ""} plus ancienne${reste > 1 ? "s" : ""}`,
        ),
      );
    } else {
      for (const [i, c] of vues.entries()) {
        entrees.push(fait(`vu:${v.id}:${i}`, "consultation", c.vuLe, v.revision, null));
      }
    }
  }

  let nbMessages = 0;
  let nbNonLus = 0;
  for (const m of messages) {
    const evenement = estEvenementEnregistre(m.evenement) ? m.evenement : null;
    if (!evenement) {
      nbMessages += 1;
      if (lecture && m.createdAt > lecture.vuLe && m.auteurId !== lecteurId) nbNonLus += 1;
    }
    entrees.push({
      id: m.id,
      genre: evenement ?? "message",
      quand: m.createdAt,
      corps: m.corps,
      auteur: m.auteur?.nom ?? null,
      auteurId: m.auteurId,
      epingle: m.epingle,
      modifieLe: m.modifieLe,
      // `devis` est null quand la version d'où le message vient a été
      // supprimée : la conversation survit, la pastille de version non.
      revision: m.devis?.revision ?? null,
      detail: null,
      pieces: m.pieces.map(
        (p): PieceFilVue => ({
          id: p.id,
          nom: p.nom,
          mimeType: p.mimeType,
          taille: p.taille,
          verseeLe: p.verseeLe,
        }),
      ),
    });
  }

  /* Le plus ancien en haut : on lit un fil comme une messagerie, et le
     composeur est en bas.

     ⚠️ Départage à la MÊME SECONDE : `emisLe` est posé dans la foulée de la
     création sur un devis émis d'un geste, et « Émis au client » s'affichait
     alors AVANT « Devis créé ». L'horloge ne suffit pas à raconter l'ordre —
     le rang du genre le complète. */
  entrees.sort((a, b) => a.quand.getTime() - b.quand.getTime() || rang(a.genre) - rang(b.genre));

  return { filId, entrees, nbMessages, nbNonLus };
}

/**
 * Les non-lus de plusieurs devis d'un coup — pour l'index, qui affiche une
 * pastille par ligne sans monter le fil de chacun.
 */
export async function compterNonLusFils(
  devisIds: string[],
  lecteurId: string,
): Promise<Map<string, number>> {
  const compte = new Map<string, number>();
  if (devisIds.length === 0) return compte;

  const devis = await prisma.devis.findMany({
    where: { id: { in: devisIds } },
    select: { id: true, filId: true },
  });
  const fils = [...new Set(devis.map((d) => d.filId).filter(Boolean))];
  if (fils.length === 0) return compte;

  const [messages, lectures] = await Promise.all([
    prisma.messageDevis.findMany({
      where: { filId: { in: fils }, evenement: null, auteurId: { not: lecteurId } },
      select: { filId: true, createdAt: true },
    }),
    prisma.lectureFilDevis.findMany({
      where: { userId: lecteurId, filId: { in: fils } },
      select: { filId: true, vuLe: true },
    }),
  ]);

  const vuLe = new Map(lectures.map((l) => [l.filId, l.vuLe]));
  const parFil = new Map<string, number>();
  for (const m of messages) {
    const seuil = vuFil(vuLe, m.filId);
    if (seuil === null || m.createdAt > seuil) {
      parFil.set(m.filId, (parFil.get(m.filId) ?? 0) + 1);
    }
  }
  for (const d of devis) {
    const n = parFil.get(d.filId) ?? 0;
    if (n > 0) compte.set(d.id, n);
  }
  return compte;
}

/** Jamais ouvert = tout est neuf. */
function vuFil(vues: Map<string, Date>, filId: string): Date | null {
  return vues.get(filId) ?? null;
}


/** L'ordre naturel des faits d'une même seconde : on crée, puis on émet, puis
 *  on publie, puis le client ouvre. Un message vient après tout ça — c'est
 *  qu'on a réagi. */
function rang(genre: GenreEntreeFil): number {
  const ordre: GenreEntreeFil[] = [
    "cree",
    "revision",
    "emis",
    "publie",
    "consultation",
    "accepte",
    "refuse",
    "rouvert",
    "message",
  ];
  const i = ordre.indexOf(genre);
  return i < 0 ? ordre.length : i;
}
