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

/* -----------------------------------------------------------------------------
 * CATÉGORIES & FABRICANTS — deux référentiels, pas deux listes en dur
 *
 * La catégorie était une enum Postgres et le fabricant un texte libre. Les deux
 * ont changé de nature le 2026-08-04, pour deux raisons opposées mais qui se
 * répondent : on ne pouvait pas RETIRER une catégorie (une enum ne se dégonfle
 * pas), et on pouvait AJOUTER un fabricant sans le vouloir (« Siemnes »).
 *
 * Les composants ne connaissent donc plus aucune liste : elle leur est passée
 * en props depuis le serveur. `nom` est la clé unique — c'est ce qui rend le
 * rapprochement possible à l'import.
 * -------------------------------------------------------------------------- */

export interface CategorieVue {
  id: string;
  nom: string;
  ordre: number;
  actif: boolean;
  /** Combien de produits la portent — c'est ce qui décide si on peut la
   *  supprimer sans rien casser. */
  nbProduits: number;
}

export interface FabricantVue {
  id: string;
  nom: string;
  actif: boolean;
  note: string;
  nbProduits: number;
}

/** Référence interne lisible proposée à partir d'un libellé libre — une
 *  suggestion, corrigeable, jamais imposée. Partagée par tous les endroits où
 *  l'on crée un article à la volée (BOM d'affaire, scan). */
export function refDepuisLibelle(nom: string): string {
  return nom
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

/** Clé de rapprochement d'un libellé libre (import, saisie) avec le référentiel :
 *  casse, accents et espaces superflus ne font pas deux entrées différentes.
 *  Ce qui reste — « Siemnes » pour « Siemens » — est une vraie faute, que seul
 *  un humain peut trancher : l'écran de référentiel sait fusionner. */
export function cleReferentiel(nom: string): string {
  return nom
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
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
  fabricantId: string | null;
  fabricantNom: string | null;
  categorieId: string | null;
  /** Le libellé, dénormalisé pour l'affichage ; null = sans catégorie (une
   *  catégorie supprimée ne devait pas emporter ses produits). */
  categorieNom: string | null;
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
  /** Groupe de variantes ; null = ligne toujours fournie. Deux lignes d'un même
   *  groupe sont interchangeables — l'affaire tranche (voir VarianteBom). */
  variante: string | null;
  /** L'option retenue tant que l'affaire n'a rien choisi. */
  parDefaut: boolean;
}

/** Une ligne de la BOM d'une affaire, avec sa provenance. */
export interface LigneBom {
  produitId: string;
  refInterne: string;
  designation: string;
  unite: string;
  /** Le libellé de catégorie sert au regroupement de la BOM ; null en fin de
   *  liste, comme tout ce qui n'est pas rangé. */
  categorieNom: string | null;
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
  /**
   * Les groupes de variantes dont CETTE ligne est la fourniture retenue — donc
   * ce qu'on peut échanger sans quitter le tableau. Presque toujours 0 ou 1.
   *
   * Le choix se fait ICI, sur la ligne, et non dans un pavé en tête d'écran :
   * avec une variante on lit les deux, avec quinze on ne lit plus rien.
   */
  variantes: VarianteBom[];
}

export interface OrigineBom {
  /** « Automate ECY-303 du projet X », « 12 × Sonde T° gaine », « Ajout manuel ». */
  libelle: string;
  quantite: number;
  source: "projet" | "points" | "manuel";
  /** Nom du point de catalogue d'où vient la ligne (source « points »). C'est la
   *  clé qui permet de remonter de la ligne de besoin à SA SOURCE : sans elle,
   *  on voit que le matériel est faux sans pouvoir le corriger. */
  point?: string;
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

export type GenreTrou = "automate" | "module" | "point" | "variante";

export const GENRE_TROU_LABEL: Record<GenreTrou, string> = {
  automate: "Automate",
  module: "Module",
  point: "Point",
  variante: "Choix à faire",
};

/**
 * Un groupe de variantes à trancher sur CETTE affaire : « la sonde radio, c'est
 * du Milesight ou de l'Enless ? ». Les lignes d'un groupe sont interchangeables
 * — jamais additionnées.
 */
export interface VarianteBom {
  pointCatalogId: string;
  /** Nom du point de catalogue (« Sonde ambiance Ss Fil »). */
  point: string;
  /** Nom du groupe (« Sonde radio »). */
  variante: string;
  /** Nombre de points de ce nom dans l'affaire — donc la quantité en jeu. */
  occurrences: number;
  /** L'option retenue : le choix de l'affaire, sinon le défaut du catalogue. */
  choisiId: string | null;
  /** true si `choisiId` vient du défaut et non d'une décision prise ici. */
  parDefaut: boolean;
  options: {
    nomenclatureId: string;
    produitId: string;
    refInterne: string;
    designation: string;
    quantite: number;
  }[];
}

/* =============================================================================
 * LE BESOIN CONSOLIDÉ — PLUSIEURS AFFAIRES, UNE SEULE COMMANDE
 *
 * La BOM répond « que faut-il pour CETTE affaire ? ». On passe pourtant les
 * commandes par lot : dix-sept salles de l'USEDA commandées le même mois, c'est
 * UN bon de commande par fournisseur, pas dix-sept. Ouvrir dix-sept écrans et
 * additionner à la main, c'est l'erreur assurée sur la seule ligne qui compte.
 *
 * CE QUI SE SOMME ET CE QUI NE SE SOMME PAS — c'est tout le sujet :
 *
 *   · le BESOIN se somme          (deux affaires veulent deux automates) ;
 *   · le RÉSERVÉ et le SORTI se somment    (ils sont propres à une affaire) ;
 *   · le MANQUANT se somme, borné à zéro affaire par affaire — une affaire
 *     sur-couverte ne doit pas éponger le découvert de sa voisine ;
 *   · ⚠️ le STOCK NE SE SOMME PAS. Il est le même pour tout le monde : une
 *     sonde en rayon est une sonde, pas dix-sept. L'additionner ferait croire
 *     qu'on a le matériel et la commande partirait courte.
 *
 * D'où la forme de `LigneConsolidee` : UNE ligne par produit, portant le stock
 * une seule fois, et la LISTE de ce que chaque affaire y appelle. L'écran
 * recompose le total pour la sélection courante sans repasser par le serveur —
 * cocher une affaire doit se voir tout de suite.
 * ========================================================================== */

/** Ce qu'UNE affaire appelle sur UN produit. */
export interface ContribAffaire {
  chantierId: string;
  besoin: number;
  /** besoin − (réservé + sorti) POUR CETTE AFFAIRE, borné à 0. */
  manquant: number;
  /** Coché « hors de notre fourniture » sur cette affaire-là : la décision est
   *  propre à l'affaire, donc le même produit peut être fourni ici et pas là. */
  horsFourniture: boolean;
}

/** Une ligne du besoin consolidé : un produit, toutes affaires confondues. */
export interface LigneConsolidee {
  produitId: string;
  refInterne: string;
  /** La référence CHEZ LE FOURNISSEUR — celle qui va sur le bon de commande. */
  refFournisseur: string | null;
  designation: string;
  unite: string;
  categorieNom: string | null;
  fournisseurId: string | null;
  fournisseurNom: string | null;
  /** Stock global (dépôts qui en tiennent un). Porté UNE FOIS — voir ci-dessus. */
  stock: number;
  /** Réservations actives TOUTES affaires confondues, y compris hors sélection :
   *  du stock physiquement là mais déjà promis. */
  reserveTotale: number;
  /** Prix retenu pour chiffrer (payé si connu, tarif annoncé sinon). */
  prixCents: number | null;
  contribs: ContribAffaire[];
}

/** Un trou de la dérivation, vu depuis plusieurs affaires à la fois. */
export interface TrouConsolide {
  nom: string;
  genre: GenreTrou;
  cle: string;
  typeIo: string | null;
  parAffaire: { chantierId: string; occurrences: number }[];
}

/** Une affaire candidate au besoin consolidé. */
export interface AffaireBesoin {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: string;
  clientId: string;
  clientNom: string;
}

/**
 * Le total d'un produit pour UNE sélection d'affaires. Calculé côté écran, mais
 * la règle vit ici : elle doit être la même pour le tableau, les compteurs et
 * l'export CSV — trois endroits où une divergence ne se verrait pas.
 */
export interface TotalConsolide {
  besoin: number;
  manquant: number;
  /** stock − réservations actives (toutes affaires) : ce sur quoi on peut
   *  réellement compter, comme la colonne « disponible » du rayon. */
  dispo: number;
  /** Ce qu'il reste à acheter : le manquant que le stock disponible ne couvre
   *  pas. C'est LE chiffre du bon de commande. */
  aCommander: number;
  /** Contributions écartées parce que cochées « hors fourniture ». */
  nbHorsFourniture: number;
  /** Affaires de la sélection qui appellent réellement ce produit. */
  nbAffaires: number;
}

export function totaliser(ligne: LigneConsolidee, retenues: Set<string>): TotalConsolide {
  let besoin = 0;
  let manquant = 0;
  let nbHorsFourniture = 0;
  let nbAffaires = 0;
  for (const c of ligne.contribs) {
    if (!retenues.has(c.chantierId)) continue;
    nbAffaires += 1;
    // Hors fourniture : on la raccorde sans la vendre. Elle ne pèse ni sur le
    // besoin, ni sur ce qu'on commande — mais on la COMPTE, pour pouvoir dire
    // qu'elle a été écartée volontairement plutôt que perdue en route.
    if (c.horsFourniture) {
      nbHorsFourniture += 1;
      continue;
    }
    besoin += c.besoin;
    manquant += c.manquant;
  }
  const dispo = Math.max(0, ligne.stock - ligne.reserveTotale);
  return {
    besoin,
    manquant,
    dispo,
    aCommander: Math.max(0, manquant - dispo),
    nbHorsFourniture,
    nbAffaires,
  };
}

/* =============================================================================
 * ASSOCIATIONS DE PRODUITS — « ce produit en appelle d'autres »
 *
 * Un fait sur le PRODUIT, vrai partout : c'est pourquoi la table vit ici et non
 * dans l'outil Devis (le devis s'en sert pour proposer ; la BOM d'affaire
 * pourra s'en servir plus tard, sans reprise de données).
 *
 * Deux types, et la distinction porte tout :
 *   ACCESSOIRE  on en coche autant qu'on veut (alimentation ET coffret) ;
 *   VARIANTE    un seul par `groupe`, ou aucun (« Type de bus »).
 * ========================================================================== */

export type TypeAssociation = "ACCESSOIRE" | "VARIANTE";

export const TYPE_ASSOCIATION_LABEL: Record<TypeAssociation, string> = {
  ACCESSOIRE: "Accessoire",
  VARIANTE: "Variante",
};

export const TYPE_ASSOCIATION_AIDE: Record<TypeAssociation, string> = {
  ACCESSOIRE: "Proposé EN PLUS. On peut en cocher plusieurs, ou aucun.",
  VARIANTE: "Proposé À LA PLACE des autres de son groupe : un seul, ou aucun.",
};

export function estTypeAssociation(v: unknown): v is TypeAssociation {
  return v === "ACCESSOIRE" || v === "VARIANTE";
}

/** Une association telle qu'elle se règle sur la fiche produit. */
export interface AssociationVue {
  id: string;
  associeId: string;
  refInterne: string;
  designation: string;
  unite: string;
  /** Prix de référence de l'associé — pour juger le réglage sans le quitter. */
  debourseCents: number | null;
  actif: boolean;
  type: TypeAssociation;
  groupe: string | null;
  quantite: number;
  parUnite: boolean;
  parDefaut: boolean;
  note: string;
  ordre: number;
}

/**
 * La quantité à proposer pour un associé, selon la quantité du déclencheur.
 *
 * `parUnite` est la seule chose qui distingue l'accessoire à l'unité (une
 * alimentation par automate) de ce qui est mutualisé (un seul coffret pour
 * trois automates). Sans ce réglage, l'une des deux familles serait toujours à
 * corriger à la main — et c'est justement la correction qu'on ne fait pas.
 *
 * `quantiteDeclencheur` est en unités entières (pas en millièmes) : on ne
 * commande pas 2,5 automates, et une quantité fractionnaire se borne à 1 plutôt
 * que de proposer 0 accessoire.
 */
export function quantiteProposee(
  a: Pick<AssociationVue, "quantite" | "parUnite">,
  quantiteDeclencheur: number,
): number {
  const base = Math.max(1, Math.round(a.quantite));
  if (!a.parUnite) return base;
  return base * Math.max(1, Math.round(quantiteDeclencheur));
}

/** Un groupe de variantes prêt à afficher : ses options, et celle retenue. */
export interface GroupeVariantes {
  nom: string;
  options: AssociationVue[];
  /** L'option cochée à l'ouverture : le `parDefaut` du groupe, sinon aucune.
   *  Aucune n'est un choix légitime — on ne force pas une fourniture. */
  choisiParDefaut: string | null;
}

/**
 * Range les associations d'un produit pour la proposition : les accessoires
 * d'un côté, les groupes de variantes de l'autre.
 *
 * Une VARIANTE sans groupe nommé serait exclusive avec rien du tout : elle est
 * traitée comme un accessoire plutôt que d'ouvrir un groupe fantôme (la saisie
 * est empêchée côté action, ceci n'est qu'un filet).
 */
export function rangerAssociations(assocs: AssociationVue[]): {
  accessoires: AssociationVue[];
  groupes: GroupeVariantes[];
} {
  const tri = (a: AssociationVue, b: AssociationVue) =>
    a.ordre - b.ordre || a.designation.localeCompare(b.designation);

  const accessoires: AssociationVue[] = [];
  const parGroupe = new Map<string, AssociationVue[]>();

  for (const a of assocs) {
    if (!a.actif) continue; // un article archivé ne se propose plus
    if (a.type === "VARIANTE" && a.groupe) {
      const liste = parGroupe.get(a.groupe);
      if (liste) liste.push(a);
      else parGroupe.set(a.groupe, [a]);
    } else {
      accessoires.push(a);
    }
  }

  const groupes: GroupeVariantes[] = [...parGroupe.entries()]
    .map(([nom, options]) => {
      const tries = [...options].sort(tri);
      return {
        nom,
        options: tries,
        choisiParDefaut: tries.find((o) => o.parDefaut)?.id ?? null,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return { accessoires: accessoires.sort(tri), groupes };
}

/* =============================================================================
 * LA DOCUMENTATION D'UN PRODUIT
 *
 * Une fiche technique appartient au PRODUIT, pas à un dossier de PDF rangé à
 * côté : c'est ce qui permet de la retrouver depuis la base matériel, depuis la
 * fiche article, et de l'annexer à un devis sans la chercher.
 *
 * Elle sert N produits (le constructeur publie « ECY IO Modules » pour les six
 * modules d'extension) — d'où la table de jonction, et non un champ.
 * ========================================================================== */

export type CategorieDoc = "fiche" | "notice" | "certificat" | "schema" | "autre";

export const CATEGORIES_DOC: { id: CategorieDoc; libelle: string }[] = [
  { id: "fiche", libelle: "Fiche technique" },
  { id: "notice", libelle: "Notice / manuel" },
  { id: "certificat", libelle: "Certificat / déclaration" },
  { id: "schema", libelle: "Schéma / plan" },
  { id: "autre", libelle: "Autre document" },
];

export function estCategorieDoc(v: unknown): v is CategorieDoc {
  return CATEGORIES_DOC.some((c) => c.id === v);
}

export function libelleCategorieDoc(v: string): string {
  return CATEGORIES_DOC.find((c) => c.id === v)?.libelle ?? "Document";
}

/** 30 Mo : une notice constructeur illustrée dépasse volontiers les dix. */
export const TAILLE_MAX_DOCUMENTATION = 30 * 1024 * 1024;

/** Une documentation telle qu'elle s'affiche — jamais son chemin disque. */
export interface DocumentationVue {
  id: string;
  titre: string;
  categorie: CategorieDoc;
  /** Lien externe (constructeur) ; null si le binaire est chez nous. */
  url: string | null;
  /** Nom du fichier téléversé ; vide pour un lien externe. */
  nom: string;
  mimeType: string;
  taille: number;
  note: string;
  /** Combien de produits s'en servent — c'est ce qui rend la mutualisation
   *  visible, et ce qui prévient avant une suppression. */
  nbProduits: number;
  majLe: Date;
}

/** Une fiche AVEC les produits qu'elle sert — la vue de la bibliothèque. Le
 *  type vit ici, dans le module client-safe : l'écran qui l'affiche est un
 *  composant client, il ne doit jamais importer `documentation.ts`
 *  (`server-only`). */
export interface DocumentationAvecProduits extends DocumentationVue {
  produits: { id: string; refInterne: string; designation: string }[];
}

/**
 * OÙ POINTE LE LIEN — le seul endroit qui le décide.
 *
 * Un document téléversé n'est jamais servi en statique : il passe par une route
 * qui contrôle l'accès. Un document externe pointe chez le constructeur, qui
 * restera à jour tout seul. Le `prefixe` permet à la page publique d'un devis de
 * servir le même document par sa route scopée au jeton, sans que le composant
 * ait à connaître les deux mondes.
 */
export function lienDocumentation(
  doc: Pick<DocumentationVue, "id" | "url">,
  prefixe = "/api/magasin/documentation",
): string {
  return doc.url ?? `${prefixe}/${doc.id}`;
}

/** « 2,4 Mo » — la taille se lit avant de cliquer sur un lien de 30 Mo. */
export function formatTaille(octets: number): string {
  if (octets <= 0) return "";
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * LE TYPE SOUS LEQUEL ON SERT UN DOCUMENT — jamais celui qu'on a reçu.
 *
 * Une documentation part sur la page publique d'un devis, donc sur NOTRE
 * origine. Un fichier HTML servi `inline` y serait du script exécuté chez le
 * client, avec nos cookies dans le voisinage. Ce qui n'est pas un PDF ou une
 * image est donc servi en `application/octet-stream` : le navigateur le
 * télécharge au lieu de l'afficher, et rien ne s'exécute.
 */
const MIMES_INLINE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function mimeSur(mime: string): string {
  return MIMES_INLINE.has(mime) ? mime : "application/octet-stream";
}

/** Ce qu'on accepte de recevoir. Le reste se met en lien plutôt qu'en dépôt. */
export const MIMES_DOCUMENTATION = new Set([
  ...MIMES_INLINE,
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);
