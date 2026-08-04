// Modèle de l'outil « Magasin » — PARTAGÉ client/serveur.
// Aucun import Prisma ici : les composants clients en dépendent (même règle que
// src/lib/recherche/types.ts). Les enums de la base sont recopiés en unions de
// chaînes et validés au passage de frontière (voir est*()).
//
// Cadrage complet : docs/MAGASIN.md.

/* =============================================================================
 * LES DEUX INVARIANTS
 *
 * 1. LE STOCK EST LA SOMME DES MOUVEMENTS. Rien n'est jamais modifié en place.
 *    Une seule règle : LA SOURCE DÉCRÉMENTE, LA DESTINATION INCRÉMENTE, et la
 *    quantité est toujours positive (voir SENS_MOUVEMENT / deltaPourDepot).
 *
 * 2. LA SÉRIALISATION EST OPPORTUNISTE : on capte un n° de série quand on l'a,
 *    on ne l'exige jamais. Le nombre d'exemplaires d'un mouvement peut aller de
 *    0 à sa quantité — le stock reste juste dans tous les cas.
 * ========================================================================== */

export type CategorieProduit =
  | "AUTOMATE"
  | "MODULE"
  | "SONDE"
  | "VANNE"
  | "SERVOMOTEUR"
  | "RESEAU"
  | "ACCESSOIRE"
  | "AUTRE";

export const CATEGORIES: CategorieProduit[] = [
  "AUTOMATE",
  "MODULE",
  "SONDE",
  "VANNE",
  "SERVOMOTEUR",
  "RESEAU",
  "ACCESSOIRE",
  "AUTRE",
];

export const CATEGORIE_LABEL: Record<CategorieProduit, string> = {
  AUTOMATE: "Automate",
  MODULE: "Module",
  SONDE: "Sonde",
  VANNE: "Vanne",
  SERVOMOTEUR: "Servomoteur",
  RESEAU: "Réseau",
  ACCESSOIRE: "Accessoire",
  AUTRE: "Autre",
};

export function estCategorie(v: unknown): v is CategorieProduit {
  return typeof v === "string" && (CATEGORIES as string[]).includes(v);
}

export type TypeDepot = "ATELIER" | "VEHICULE" | "CHANTIER";

export const TYPE_DEPOT_LABEL: Record<TypeDepot, string> = {
  ATELIER: "Atelier",
  VEHICULE: "Véhicule",
  CHANTIER: "Chantier",
};

export function estTypeDepot(v: unknown): v is TypeDepot {
  return v === "ATELIER" || v === "VEHICULE" || v === "CHANTIER";
}

export type TypeMouvement = "RECEPTION" | "SORTIE" | "RETOUR" | "TRANSFERT" | "REBUT" | "ECART";

export const TYPES_MOUVEMENT: TypeMouvement[] = [
  "RECEPTION",
  "SORTIE",
  "RETOUR",
  "TRANSFERT",
  "REBUT",
  "ECART",
];

export const MOUVEMENT_LABEL: Record<TypeMouvement, string> = {
  RECEPTION: "Réception",
  SORTIE: "Sortie",
  RETOUR: "Retour",
  TRANSFERT: "Transfert",
  REBUT: "Rebut",
  ECART: "Écart",
};

/** Ce que le mouvement raconte, en une ligne — affiché sous le choix du type. */
export const MOUVEMENT_AIDE: Record<TypeMouvement, string> = {
  RECEPTION: "Du matériel arrive : le fournisseur livre, on range.",
  SORTIE: "Du matériel part : pour une affaire, un dépannage, un prêt.",
  RETOUR: "Du matériel revient au dépôt : reliquat de chantier, matériel non posé.",
  TRANSFERT: "Le matériel change de dépôt sans quitter la maison.",
  REBUT: "Le matériel est perdu, cassé ou hors service.",
  ECART: "Correction : comptage d'inventaire, ou remise à la réalité par un administrateur.",
};

export function estTypeMouvement(v: unknown): v is TypeMouvement {
  return typeof v === "string" && (TYPES_MOUVEMENT as string[]).includes(v);
}

/**
 * Quels dépôts porte chaque type de mouvement. C'est CETTE table qui donne son
 * sens au mouvement — pas le signe de la quantité, toujours positive.
 * `source` = d'où ça part (décrémente) · `dest` = où ça arrive (incrémente).
 */
export const SENS_MOUVEMENT: Record<TypeMouvement, { source: boolean; dest: boolean }> = {
  RECEPTION: { source: false, dest: true },
  SORTIE: { source: true, dest: false },
  RETOUR: { source: false, dest: true },
  TRANSFERT: { source: true, dest: true },
  REBUT: { source: true, dest: false },
  // Un écart peut aller dans les deux sens : il n'est jamais saisi comme les
  // autres, il est PRODUIT — par la validation d'un inventaire, ou par une
  // correction d'administrateur (corrigerStock).
  ECART: { source: false, dest: false },
};

/** Les types saisissables dans le formulaire de mouvement (l'écart, lui, sort
 *  d'un inventaire ou d'une correction d'administrateur). */
export const TYPES_SAISISSABLES: TypeMouvement[] = [
  "RECEPTION",
  "SORTIE",
  "RETOUR",
  "TRANSFERT",
  "REBUT",
];

/** Effet d'un mouvement sur un dépôt donné : +q s'il y arrive, −q s'il en part. */
export function deltaPourDepot(
  m: { quantite: number; depotSourceId: string | null; depotDestId: string | null },
  depotId: string,
): number {
  let d = 0;
  if (m.depotDestId === depotId) d += m.quantite;
  if (m.depotSourceId === depotId) d -= m.quantite;
  return d;
}

/** Sens d'affichage d'une ligne d'historique du point de vue du magasin. */
export function sensAffiche(t: TypeMouvement): "entree" | "sortie" | "interne" {
  if (t === "RECEPTION" || t === "RETOUR") return "entree";
  if (t === "SORTIE" || t === "REBUT") return "sortie";
  return "interne";
}

export type EtatExemplaire = "EN_STOCK" | "SORTI" | "REBUT";

export const ETAT_EXEMPLAIRE_LABEL: Record<EtatExemplaire, string> = {
  EN_STOCK: "En stock",
  SORTI: "Sorti",
  REBUT: "Rebut",
};

export type EtatInventaire = "OUVERT" | "VALIDE" | "ANNULE";

export const ETAT_INVENTAIRE_LABEL: Record<EtatInventaire, string> = {
  OUVERT: "En cours",
  VALIDE: "Validé",
  ANNULE: "Annulé",
};

export type EtatReservation = "RESERVEE" | "SERVIE" | "ANNULEE";

/* =============================================================================
 * DROITS
 * Le rôle ACHATS est un cran ENTRE membre et administrateur : il ouvre les prix
 * et le référentiel, jamais l'administration (comptes, suppressions sensibles).
 * Tout le monde peut faire bouger du stock — sinon personne ne le tiendrait.
 * ========================================================================== */

/** Prix d'achat, tarifs fournisseurs, valorisation, coût matériel d'affaire. */
export function peutVoirPrix(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "ACHATS";
}

/** Créer/modifier un produit, un fournisseur, importer, valider un inventaire.
 *  La saisie des mouvements, elle, est ouverte à tous. */
export function peutGererReferentiel(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "ACHATS";
}

/**
 * Corriger le stock à la main (« il en reste 3, point »). Réservé aux
 * ADMINISTRATEURS — pas même aux Achats : c'est le seul geste qui court-circuite
 * le récit des mouvements, il doit rester rare et attribuable. Il n'écrase
 * pourtant rien : il écrit un mouvement d'écart, motif obligatoire.
 */
export function peutCorrigerStock(role: string | undefined | null): boolean {
  return role === "ADMIN";
}

/* =============================================================================
 * ARGENT
 * En CENTIMES partout (convention de la maison, cf. notes de frais) : pas de
 * flottant, pas de Decimal à sérialiser. Le formatage est fait à la main plutôt
 * qu'avec Intl : les espaces insécables d'Intl diffèrent entre Node et le
 * navigateur, ce qui produit des écarts d'hydratation.
 * ========================================================================== */

/** 41250 → « 412,50 € ». */
export function formatEuros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const negatif = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const centimes = String(abs % 100).padStart(2, "0");
  const milliers = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negatif ? "−" : ""}${milliers},${centimes} €`;
}

/** « 412,50 € » / « 412.5 » / « 1 412,50 » → 41250. null si illisible. */
export function parseEuros(saisie: string): number | null {
  const nettoye = saisie
    .replace(/[€\s  ]/g, "")
    .replace(/,/g, ".")
    .trim();
  if (!nettoye) return null;
  const n = Number(nettoye);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Entier positif d'une saisie libre (quantités). null si illisible. */
export function parseQuantite(saisie: string): number | null {
  const n = Number(String(saisie).replace(/\s| | /g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const arrondi = Math.round(n);
  return arrondi;
}

/* =============================================================================
 * TYPES DE VUE (partagés serveur → composants clients)
 * ========================================================================== */

export interface DepotVue {
  id: string;
  nom: string;
  code: string;
  type: TypeDepot;
  dortoir: boolean;
  actif: boolean;
}

/* =============================================================================
 * D'OÙ VIENT UN PRIX
 * « pmp »   : moyenne pondérée de ce qu'on a RÉELLEMENT payé (réceptions).
 * « achat » : le prix ANNONCÉ sur la fiche produit — utilisé tant qu'on n'a
 *             rien acheté.
 * null      : aucun prix connu ; le produit est alors exclu des totaux, et on
 *             le dit plutôt que de le compter pour zéro.
 * ========================================================================== */
export type SourcePrix = "pmp" | "achat" | null;

export const SOURCE_PRIX_LABEL: Record<"pmp" | "achat", string> = {
  pmp: "prix moyen payé",
  achat: "prix d'achat annoncé",
};

export interface ProduitRayon {
  id: string;
  refInterne: string;
  refFabricant: string | null;
  designation: string;
  marque: string | null;
  categorie: CategorieProduit;
  unite: string;
  emplacement: string | null;
  seuilMini: number;
  serialisable: boolean;
  actif: boolean;
  /** Somme des mouvements sur les dépôts qui tiennent un stock (hors dortoirs). */
  stock: number;
  /** Quantités réservées à des affaires, encore à servir. */
  reserve: number;
  /** stock − reserve : ce sur quoi on peut réellement compter. */
  disponible: number;
  /** Prix moyen pondéré des réceptions valorisées, en centimes. Null si aucune. */
  pmpCents: number | null;
  /** Dernier prix payé, en centimes — sert à pré-remplir une saisie. */
  dernierPrixCents: number | null;
  /** Prix d'achat annoncé sur la fiche produit. */
  prixAchatCents: number | null;
  /** Le prix retenu pour chiffrer : PMP si on a déjà acheté, prix annoncé sinon. */
  prixRefCents: number | null;
  sourcePrix: SourcePrix;
  /** stock > 0 && seuilMini > 0 && stock < seuilMini, ou stock ≤ 0 avec seuil. */
  sousSeuil: boolean;
}

export interface MouvementVue {
  id: string;
  type: TypeMouvement;
  quantite: number;
  produitId: string;
  produitRef: string;
  produitDesignation: string;
  unite: string;
  depotSource: string | null;
  depotDest: string | null;
  prixUnitaireCents: number | null;
  numeroAchat: string | null;
  chantierId: string | null;
  chantierNom: string | null;
  note: string;
  faitLe: Date;
  auteur: string | null;
  nbExemplaires: number;
  /** Écarts : renseigné si l'écart vient d'une campagne d'inventaire ; vide
   *  s'il s'agit d'une correction manuelle. */
  inventaireId: string | null;
}

export interface ExemplaireVue {
  id: string;
  numeroSerie: string;
  etat: EtatExemplaire;
  depot: string | null;
  chantierId: string | null;
  chantierNom: string | null;
  note: string;
}

/** Une ligne de la nomenclature d'un point du catalogue. */
export interface LigneNomenclature {
  id: string;
  produitId: string;
  refInterne: string;
  designation: string;
  quantite: number;
  optionnel: boolean;
}

/** Une ligne de la BOM d'une affaire, avec sa provenance. */
export interface LigneBom {
  produitId: string;
  refInterne: string;
  designation: string;
  unite: string;
  categorie: CategorieProduit;
  /** Quantité totale nécessaire. */
  besoin: number;
  /** D'où vient le besoin — la même ligne peut avoir plusieurs origines. */
  origines: OrigineBom[];
  stock: number;
  reserve: number;
  sorti: number;
  /** besoin − (réservé + déjà sorti), borné à 0. */
  manquant: number;
  /** Prix retenu pour chiffrer la ligne (payé si connu, tarif sinon). */
  pmpCents: number | null;
  /** Coché « hors de notre fourniture » : nécessaire au chantier, mais déjà sur
   *  place ou fourni par un autre lot. La ligne reste visible et sort des
   *  totaux (`manquant` forcé à 0). */
  horsFourniture: boolean;
}

export interface OrigineBom {
  /** « Automate ECY-303 du projet X », « 12 × Sonde T° gaine », « Ajout manuel ». */
  libelle: string;
  quantite: number;
  source: "projet" | "points" | "manuel";
}

/** Ce que la BOM ne sait pas chiffrer : un point sans nomenclature, un automate
 *  ou un module de la base matériel qui n'est relié à aucun produit. On le dit
 *  plutôt que d'afficher un total faussement complet — et on porte de quoi
 *  RÉPARER sur place (voir associerTrou). */
export interface TrouBom {
  /** Libellé affiché (« Automate ECY-303 », « Sonde T° départ »). */
  nom: string;
  occurrences: number;
  genre: GenreTrou;
  /** Clé technique : référence d'automate, type de module, ou nom du point. */
  cle: string;
  /** Points seulement : type d'E/S relevé sur la ligne, pour créer l'entrée de
   *  catalogue quand le point n'y figure pas encore. */
  typeIo?: string | null;
}

export type GenreTrou = "automate" | "module" | "point";

export const GENRE_TROU_LABEL: Record<GenreTrou, string> = {
  automate: "Automate",
  module: "Module",
  point: "Point",
};
