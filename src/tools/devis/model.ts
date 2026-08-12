// Modèle de l'outil « Devis » — PARTAGÉ client/serveur.
// Aucun import Prisma ici : l'éditeur recalcule les totaux sous les doigts, il
// dépend donc de ce fichier (même règle que src/tools/magasin/model.ts).
//
// Cadrage complet : docs/DEVIS.md.

import type { DureePartage } from "@/lib/partage/model";
import { extraireTexte, type NoteContenu } from "@/tools/notes/model";

/* =============================================================================
 * LES TROIS PRINCIPES
 *
 * 1. LE DEVIS FIGE, LE MAGASIN VIT. Chaque ligne COPIE désignation, déboursé,
 *    coefficient et prix de vente au moment de l'ajout. Le lien vers le produit
 *    ne sert QU'À PROPOSER un rafraîchissement — jamais à afficher.
 *
 * 2. UN SEUL CHEMIN DE CALCUL : déboursé × coefficient = prix de vente. Le
 *    coefficient se lit en CASCADE (ligne → produit → catégorie → devis) et son
 *    ORIGINE voyage avec la valeur : un coefficient qu'on ne peut pas expliquer
 *    est un coefficient qu'on n'ose pas défendre devant le client.
 *
 * 3. CE QU'ON NE SAIT PAS CHIFFRER EST DIT. Une ligne sans déboursé connu n'est
 *    jamais comptée pour zéro : elle est exclue du total et signalée.
 * ========================================================================== */

/* =============================================================================
 * LES UNITÉS — trois échelles, aucune virgule flottante
 *
 * cents     : l'argent (convention de la maison, cf. magasin & notes de frais)
 * millième  : les coefficients (1350 = ×1,350) ET les quantités (2500 = 2,5)
 * pour mille: les remises (50 = 5,0 %)
 * centième de % : la TVA (2000 = 20,00 %)
 *
 * Un prix qui passe par un flottant finit toujours par afficher 63 299,999997.
 * ========================================================================== */

export const MILLE = 1000;

export type EtatDevis = "BROUILLON" | "EMIS" | "ACCEPTE" | "REFUSE";

export const ETATS_DEVIS: EtatDevis[] = ["BROUILLON", "EMIS", "ACCEPTE", "REFUSE"];

export const ETAT_DEVIS_LABEL: Record<EtatDevis, string> = {
  BROUILLON: "Brouillon",
  EMIS: "Émis",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
};

/** Ce que l'état raconte, en une ligne (affiché sous le sélecteur). */
export const ETAT_DEVIS_AIDE: Record<EtatDevis, string> = {
  BROUILLON: "En cours de chiffrage — rien n'est parti chez le client.",
  EMIS: "Envoyé au client, en attente de sa réponse.",
  ACCEPTE: "Le client a dit oui.",
  REFUSE: "Perdu, ou abandonné.",
};

export function estEtatDevis(v: unknown): v is EtatDevis {
  return typeof v === "string" && (ETATS_DEVIS as string[]).includes(v);
}

export type GenreLigne = "PRODUIT" | "PRESTATION" | "LIBRE" | "TEXTE";

export const GENRES_LIGNE: GenreLigne[] = ["PRODUIT", "PRESTATION", "LIBRE", "TEXTE"];

export const GENRE_LIGNE_LABEL: Record<GenreLigne, string> = {
  PRODUIT: "Article",
  PRESTATION: "Prestation",
  LIBRE: "Divers",
  TEXTE: "Texte",
};

export function estGenreLigne(v: unknown): v is GenreLigne {
  return typeof v === "string" && (GENRES_LIGNE as string[]).includes(v);
}

/** Une ligne TEXTE n'a ni quantité, ni prix, ni total : c'est un commentaire
 *  intercalé. Le moteur l'ignore partout — d'où ce prédicat, plutôt qu'un
 *  `genre === "TEXTE"` recopié à sept endroits. */
export function ligneChiffree(genre: GenreLigne): boolean {
  return genre !== "TEXTE";
}

/* =============================================================================
 * LE TEXTE RICHE D'UNE LIGNE « TEXTE »
 *
 * Une ligne TEXTE porte un DOCUMENT (blocs BlockNote), pas une phrase : c'est le
 * même moteur que Notes et Wiki, donc le même « / » (titres, listes, tableau,
 * image, lien…). Deux règles tiennent l'ensemble :
 *
 *  1. `designation` RESTE LE RÉSUMÉ EN TEXTE BRUT du document, recalculé à
 *     chaque sauvegarde. Tout ce qui lit une ligne sans savoir la rendre (index,
 *     export, futur PDF client) continue d'avoir une phrase lisible — et une
 *     ligne dont le libellé serait un objet JSON serait illisible partout.
 *
 *  2. LE CAS COURANT NE MONTE PAS D'ÉDITEUR. Un commentaire d'une ligne se rend
 *     en texte nu (`texteNu`) ; seul un document réellement riche paie un
 *     BlockNote en lecture. Un devis porte dix commentaires, pas un document.
 * ========================================================================== */

/** Document riche — mêmes blocs que les notes (le schéma est partagé). */
export type ContenuRiche = NoteContenu;

/** 25 Mo : on colle des photos d'armoire et des fiches techniques, pas des
 *  vidéos. (Les notes montent à 50 Mo ; un devis n'a pas cet usage.) */
export const TAILLE_MAX_MEDIA_DEVIS = 25 * 1024 * 1024;

/** Préfixe de la route média des devis. Source de vérité unique : l'URL écrite
 *  dans le document et la regex de purge en dépendent toutes les deux. */
export const PREFIXE_MEDIA_DEVIS = "/api/devis/media/";

export function urlMediaDevis(mediaId: string): string {
  return `${PREFIXE_MEDIA_DEVIS}${mediaId}`;
}

/** Le libellé de repli d'une ligne TEXTE vide — `designation` est NOT NULL, et
 *  une ligne sans aucun libellé ne se retrouve plus dans une liste. */
export const TEXTE_LIGNE_REPLI = "Commentaire";

/** Un document d'un seul paragraphe portant `texte`. Sert à amorcer une ligne :
 *  celle qu'on vient de créer en tapant sa phrase, et celle d'avant la bascule
 *  en riche (contenu null), qu'on ouvre sur son ancienne désignation. */
export function contenuTexteSimple(texte: string): ContenuRiche {
  const t = texte.trim();
  if (!t) return [];
  return [{ type: "paragraph", content: [{ type: "text", text: t, styles: {} }] }];
}

/** Props qu'un bloc porte SANS avoir été mis en forme — BlockNote les écrit
 *  toujours, même sur un paragraphe qu'on n'a pas touché. */
const PROPS_NEUTRES: Record<string, unknown> = {
  textColor: "default",
  backgroundColor: "default",
  textAlignment: "left",
};

/**
 * Le texte du document s'il se réduit à un paragraphe SANS AUCUNE MISE EN FORME
 * — sinon `null` (le document mérite alors un vrai rendu).
 *
 * `""` pour un document vide : c'est un texte nu, simplement absent.
 */
export function texteNu(contenu: ContenuRiche | null): string | null {
  if (!Array.isArray(contenu)) return null;
  if (contenu.length === 0) return "";
  if (contenu.length > 1) return null;

  const bloc = contenu[0] as {
    type?: string;
    props?: Record<string, unknown>;
    content?: unknown;
    children?: unknown[];
  };
  if (bloc?.type !== "paragraph") return null;
  if (Array.isArray(bloc.children) && bloc.children.length > 0) return null;
  for (const [cle, val] of Object.entries(bloc.props ?? {})) {
    if (PROPS_NEUTRES[cle] !== val) return null;
  }

  if (bloc.content === undefined) return "";
  if (!Array.isArray(bloc.content)) return null;

  let texte = "";
  for (const item of bloc.content) {
    const i = item as { type?: string; text?: string; styles?: Record<string, unknown> };
    // Un lien, une mention, une formule : ce n'est plus du texte nu.
    if (i?.type !== "text" || typeof i.text !== "string") return null;
    if (i.styles && Object.keys(i.styles).length > 0) return null;
    texte += i.text;
  }
  return texte;
}

/** Le résumé en texte brut à recopier dans `designation` à chaque sauvegarde. */
export function resumeTexteLigne(contenu: ContenuRiche, repli = TEXTE_LIGNE_REPLI): string {
  return extraireTexte(contenu, 160) || repli;
}

/* =============================================================================
 * DROITS
 * L'outil expose le déboursé (déjà réservé) ET les coefficients de marge de la
 * maison (qui le sont davantage). On réutilise les helpers du Magasin plutôt
 * que d'inventer un troisième vocabulaire de droits.
 * ========================================================================== */

export function peutVoirDevis(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "ACHATS";
}

/** Modifier le référentiel de prestations et les coefficients de vente : c'est
 *  la politique commerciale de la maison, pas un réglage d'écran. */
export function peutGererReferentielDevis(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "ACHATS";
}

/* =============================================================================
 * ARGENT & FORMATAGE
 * Repris à l'identique du Magasin (formatage à la main, pas Intl : ses espaces
 * insécables diffèrent entre Node et le navigateur → écarts d'hydratation).
 * ========================================================================== */

/** 41250 → « 412,50 € ». */
export function formatEuros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const negatif = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const centimes = String(abs % 100).padStart(2, "0");
  const milliers = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negatif ? "−" : ""}${milliers},${centimes} €`;
}

/** « 412,50 € » / « 412.5 » / « 1 412,50 » → 41250. null si illisible. */
export function parseEuros(saisie: string): number | null {
  const nettoye = String(saisie)
    .replace(/[€\s  ]/g, "")
    .replace(/,/g, ".")
    .trim();
  if (!nettoye) return null;
  const n = Number(nettoye);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** 2500 → « 2,5 » (on ne montre pas « 2,500 » : personne n'écrit ça). */
export function formatQuantite(millieme: number): string {
  const negatif = millieme < 0;
  const abs = Math.abs(millieme);
  const entier = Math.floor(abs / MILLE);
  const reste = abs % MILLE;
  if (reste === 0) return `${negatif ? "−" : ""}${entier}`;
  const dec = String(reste).padStart(3, "0").replace(/0+$/, "");
  return `${negatif ? "−" : ""}${entier},${dec}`;
}

/** « 2,5 » / « 2.5 » → 2500. null si illisible. */
export function parseQuantite(saisie: string): number | null {
  const nettoye = String(saisie)
    .replace(/[\s  ]/g, "")
    .replace(/,/g, ".")
    .trim();
  if (!nettoye) return null;
  const n = Number(nettoye);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * MILLE);
}

/** 1350 → « ×1,35 ». */
export function formatCoef(millieme: number | null | undefined): string {
  if (millieme === null || millieme === undefined) return "—";
  return `×${formatQuantite(millieme)}`;
}

/** « 1,35 » / « ×1.35 » / « 1,350 » → 1350. null si illisible ou ≤ 0.
 *  Un coefficient nul ou négatif n'a aucun sens : il ferait un prix de vente à
 *  zéro sans que rien ne le signale. */
export function parseCoef(saisie: string): number | null {
  const n = parseQuantite(String(saisie).replace(/^[×x*]/i, ""));
  if (n === null || n <= 0) return null;
  return n;
}

/** 2000 → « 20 % » ; 550 → « 5,5 % ». */
export function formatPourcent(centieme: number): string {
  const entier = Math.floor(Math.abs(centieme) / 100);
  const reste = Math.abs(centieme) % 100;
  const signe = centieme < 0 ? "−" : "";
  if (reste === 0) return `${signe}${entier} %`;
  return `${signe}${entier},${String(reste).padStart(2, "0").replace(/0+$/, "")} %`;
}

/** « 20 » / « 20,5 % » → 2000 / 2050 (centièmes de pourcent). */
export function parsePourcent(saisie: string): number | null {
  const nettoye = String(saisie)
    .replace(/[%\s  ]/g, "")
    .replace(/,/g, ".")
    .trim();
  if (!nettoye) return null;
  const n = Number(nettoye);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** 50 (pour mille) → « 5 % ». */
export function formatRemise(pourMille: number): string {
  return formatPourcent(Math.round(pourMille * 10));
}

/** « 5 » / « 5,5 % » → 50 / 55 (pour mille). null si hors [0, 1000]. */
export function parseRemise(saisie: string): number | null {
  const centieme = parsePourcent(saisie);
  if (centieme === null) return null;
  const pourMille = Math.round(centieme / 10);
  if (pourMille < 0 || pourMille > MILLE) return null;
  return pourMille;
}

/* =============================================================================
 * LA CASCADE DU COEFFICIENT
 * ========================================================================== */

export type OrigineCoef = "ligne" | "produit" | "categorie" | "devis";

export const ORIGINE_COEF_LABEL: Record<OrigineCoef, string> = {
  ligne: "forcé sur la ligne",
  produit: "réglé sur l'article",
  categorie: "réglé sur la catégorie",
  devis: "défaut du devis",
};

export function estOrigineCoef(v: unknown): v is OrigineCoef {
  return v === "ligne" || v === "produit" || v === "categorie" || v === "devis";
}

/** Les coefficients de vente en vigueur, aplatis pour la cascade. */
export interface GrilleCoefs {
  /** Coefficient global de la maison — sert à INITIALISER un nouveau devis. */
  globalMillieme: number;
  /** categorieId → coefficient. */
  parCategorie: Record<string, number>;
  /** produitId → coefficient. */
  parProduit: Record<string, number>;
}

export const GRILLE_VIDE: GrilleCoefs = {
  globalMillieme: 1350,
  parCategorie: {},
  parProduit: {},
};

/**
 * Le premier trouvé gagne — et l'origine remonte AVEC la valeur, pour que
 * l'écran puisse toujours dire d'où sort le prix (principe n°2).
 *
 * `forceLigne` est le coefficient saisi à la main sur la ligne : il court-circuite
 * tout le reste, y compris un changement ultérieur de la grille.
 */
export function coefApplicable(
  grille: GrilleCoefs,
  coefDefautDevis: number,
  cible: { produitId?: string | null; categorieId?: string | null },
  forceLigne?: number | null,
): { coefMillieme: number; origine: OrigineCoef } {
  if (forceLigne !== null && forceLigne !== undefined && forceLigne > 0) {
    return { coefMillieme: forceLigne, origine: "ligne" };
  }
  const parProduit = cible.produitId ? grille.parProduit[cible.produitId] : undefined;
  if (parProduit !== undefined && parProduit > 0) {
    return { coefMillieme: parProduit, origine: "produit" };
  }
  const parCategorie = cible.categorieId ? grille.parCategorie[cible.categorieId] : undefined;
  if (parCategorie !== undefined && parCategorie > 0) {
    return { coefMillieme: parCategorie, origine: "categorie" };
  }
  return { coefMillieme: coefDefautDevis, origine: "devis" };
}

/* =============================================================================
 * L'ARRONDI — un seul point, sur la LIGNE, jamais sur le total
 *
 * Un devis qui ne retombe pas sur ses pattes à l'euro près est un devis qu'on
 * ne signe pas. La règle, écrite une seule fois :
 *
 *   1. pvUnitaire = arrondi(déboursé × coef / 1000)      — figé à l'ajout
 *   2. totalLigne = arrondi(pvUnitaire × quantité / 1000)
 *   3. remise de ligne appliquée sur ce total, arrondie
 *   4. sous-totaux, HT, remise globale, TVA, TTC : SOMMES D'ENTIERS, plus
 *      aucun arrondi.
 *
 * Autrement dit : un Σ de lignes arrondies est reproductible ; un total arrondi
 * séparément dérive de quelques centimes et fait perdre une heure à quelqu'un.
 * ========================================================================== */

/** Arrondi commercial : 0,5 s'éloigne de zéro (Math.round penche vers +∞ sur
 *  les négatifs, ce qui rend −0,5 asymétrique). */
export function arrondi(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** Prix de vente unitaire dérivé du déboursé — l'étape 1 ci-dessus. */
export function pvDepuisDebourse(debourseCents: number, coefMillieme: number): number {
  return arrondi((debourseCents * coefMillieme) / MILLE);
}

/* =============================================================================
 * LES TYPES DE VUE
 * ========================================================================== */

/** Une ligne telle qu'elle vit en base (et telle que l'éditeur la manipule). */
export interface LigneDevisVue {
  id: string;
  lotId: string | null;
  ordre: number;
  genre: GenreLigne;
  produitId: string | null;
  prestationId: string | null;
  designation: string;
  /** Le document riche d'une ligne TEXTE. Null = jamais passée en riche :
   *  l'éditeur l'amorce alors depuis `designation`. */
  contenu: ContenuRiche | null;
  /** Verrou optimiste du document riche (cf. sauverTexteLigne). */
  version: number;
  refInterne: string | null;
  unite: string;
  quantiteMillieme: number;
  debourseCents: number | null;
  coefMillieme: number | null;
  origineCoef: OrigineCoef;
  pvUnitaireCents: number;
  remisePourMille: number;
  option: boolean;
  note: string;
  /** Prix de référence du Magasin AUJOURD'HUI, s'il diffère du déboursé figé.
   *  Null quand il n'y a rien à proposer. C'est la seule donnée « vivante »
   *  d'une ligne — et elle ne sert qu'à alimenter le bandeau de fraîcheur. */
  debourseActuelCents: number | null;
  /** Dernière modification, ISO — l'horodatage que la sauvegarde du document
   *  riche fait avancer (affiché en infobulle de l'indicateur). */
  majLe: string;
}

/** Comment le CLIENT voit un bloc. Chaîne validée plutôt qu'enum Postgres
 *  (même choix que `OrigineCoef`) : le vocabulaire peut grandir sans migration. */
export type RenduLot = "DETAILLE" | "CONDENSE";

export const RENDUS_LOT: RenduLot[] = ["DETAILLE", "CONDENSE"];

export const RENDU_LOT_LABEL: Record<RenduLot, string> = {
  DETAILLE: "détaillé",
  CONDENSE: "forfait",
};

export function estRenduLot(v: unknown): v is RenduLot {
  return typeof v === "string" && (RENDUS_LOT as string[]).includes(v);
}

/** Un lot est un BLOC DU CLIENT (docs/DEVIS-DETAIL.md) : ce qu'on chiffre d'un
 *  côté, ce que le client lit de l'autre. */
export interface LotDevisVue {
  id: string;
  /** Le nom INTERNE — celui du rail de l'éditeur. */
  titre: string;
  ordre: number;
  /** La description non exhaustive, imprimée en puces sous la désignation. */
  note: string;
  rendu: RenduLot;
  /** La désignation lue par le client sur un bloc condensé. Vide = `titre`. */
  libelleClient: string;
}

/** Ce que le client lira en tête de ce bloc : sa phrase, ou à défaut le titre
 *  interne. Un seul endroit décide — l'éditeur, le document et la
 *  récapitulation de publication doivent dire la même chose. */
export function designationClient(lot: LotDevisVue): string {
  return lot.libelleClient.trim() || lot.titre.trim();
}

/**
 * Un texte libre en puces — une ligne saisie = une puce.
 *
 * ⚠️ Le document client n'a `white-space: pre-wrap` NI sur `.lot-note` NI sur
 * `td.des` : un texte multiligne s'y écraserait en un seul paragraphe, sans que
 * rien ne le signale. C'est donc bien une liste d'éléments qu'il faut produire,
 * jamais un `\n` laissé au CSS.
 */
export function puces(texte: string): string[] {
  return texte
    .split("\n")
    .map((l) => l.replace(/^[-•*·]\s*/, "").trim())
    .filter(Boolean);
}

export interface DevisEntete {
  id: string;
  numero: string;
  revision: number;
  parentId: string | null;
  titre: string;
  etat: EtatDevis;
  clientNom: string;
  clientId: string | null;
  numeroWhy: string | null;
  chantierId: string | null;
  chantierNom: string | null;
  coefDefautMillieme: number;
  tauxTvaCentieme: number;
  remiseGlobalePourMille: number | null;
  remiseGlobaleCents: number | null;
  validiteJours: number;
  /** Pavé destinataire du document client, une ligne par ligne. */
  destinataire: string;
  /** Publication (docs/DEVIS.md §21) — le lien public et ce qu'il montre. */
  jetonPartage: string | null;
  partageExpireLe: Date | null;
  publieLe: Date | null;
  montrerPrixUnitaires: boolean;
  montrerSousTotauxLots: boolean;
  montrerOptions: boolean;
  /** Combien de fois le lien a été ouvert, et quand pour la dernière fois. */
  nbConsultations: number;
  derniereConsultation: Date | null;
  emisLe: Date | null;
  createdAt: Date;
  updatedAt: Date;
  auteur: string | null;
  /** Fonction de l'auteur — c'est lui qui signe le document client. */
  auteurFonction: string | null;
  modifiePar: string | null;
}

/* =============================================================================
 * LE CALCUL
 * ========================================================================== */

export interface LigneCalculee {
  ligne: LigneDevisVue;
  /** pvUnitaire × quantité, arrondi (avant remise de ligne). */
  brutCents: number;
  /** La remise de ligne en euros. */
  remiseCents: number;
  /** brut − remise : ce qui entre dans le sous-total (0 pour une ligne TEXTE). */
  totalCents: number;
  /** déboursé × quantité, arrondi. Null si le déboursé est inconnu. */
  debourseTotalCents: number | null;
  /** Le déboursé figé diffère du prix d'aujourd'hui — proposé, jamais appliqué. */
  perimee: boolean;
}

export interface LotCalcule {
  lot: LotDevisVue | null;
  lignes: LigneCalculee[];
  /** Hors options : une option ne compte nulle part tant qu'elle n'est pas levée. */
  sousTotalCents: number;
  optionsCents: number;
}

export interface TotauxDevis {
  lots: LotCalcule[];
  /** Somme des sous-totaux, hors options, après remises de ligne. */
  totalHtCents: number;
  /** Remise globale résolue en euros (que la saisie soit en % ou en €). */
  remiseGlobaleCents: number;
  netHtCents: number;
  tvaCents: number;
  totalTtcCents: number;
  /** Total des lignes « option » — affiché À PART, jamais additionné. */
  optionsCents: number;
  /** Déboursé des lignes dont on connaît le prix de revient (fourniture seule). */
  debourseCents: number;
  /** Vendu correspondant à ces mêmes lignes — c'est la seule base honnête de
   *  comparaison : comparer un déboursé partiel à un vendu total gonflerait la
   *  marge d'un tiers sans que rien ne le dise. */
  venduFournitureCents: number;
  /** venduFourniture − déboursé. Ne couvre QUE la fourniture (la main d'œuvre
   *  est saisie au taux de vente, sans coût interne) : à afficher sous le
   *  libellé « marge sur la fourniture », JAMAIS « marge du devis ». */
  margeFournitureCents: number;
  /** Taux de marge sur le vendu, en centièmes de pourcent. Null si rien à
   *  comparer (aucune ligne chiffrée en déboursé). */
  tauxMargeFournitureCentieme: number | null;
  /**
   * La marge une fois la REMISE GLOBALE encaissée.
   *
   * La remise globale porte sur le total, pas sur les lignes : la marge brute
   * ci-dessus l'ignore donc complètement et surestime d'autant. On répartit la
   * remise au prorata de ce que la fourniture pèse dans le vendu — c'est la
   * seule façon d'obtenir un chiffre qu'on puisse défendre après négociation.
   *
   * Sans remise globale, ces valeurs sont identiques aux brutes.
   */
  venduFournitureNetCents: number;
  margeFournitureNetteCents: number;
  tauxMargeFournitureNetteCentieme: number | null;
  /** Lignes chiffrées sans déboursé connu — dites, jamais comptées zéro. */
  nbSansPrix: number;
  /** Lignes dont le déboursé figé diffère du prix de référence d'aujourd'hui. */
  nbPerimees: number;
  nbLignes: number;
  nbOptions: number;
}

/** Remise d'une ligne, appliquée sur son brut (étape 3 de l'arrondi). */
function remiseDeLigne(brutCents: number, remisePourMille: number): number {
  if (remisePourMille <= 0) return 0;
  return arrondi((brutCents * remisePourMille) / MILLE);
}

export function calculerLigne(ligne: LigneDevisVue): LigneCalculee {
  if (!ligneChiffree(ligne.genre)) {
    return {
      ligne,
      brutCents: 0,
      remiseCents: 0,
      totalCents: 0,
      debourseTotalCents: null,
      perimee: false,
    };
  }
  const brutCents = arrondi((ligne.pvUnitaireCents * ligne.quantiteMillieme) / MILLE);
  const remiseCents = remiseDeLigne(brutCents, ligne.remisePourMille);
  const debourseTotalCents =
    ligne.debourseCents === null
      ? null
      : arrondi((ligne.debourseCents * ligne.quantiteMillieme) / MILLE);
  return {
    ligne,
    brutCents,
    remiseCents,
    totalCents: brutCents - remiseCents,
    debourseTotalCents,
    perimee:
      ligne.debourseActuelCents !== null &&
      ligne.debourseCents !== null &&
      ligne.debourseActuelCents !== ligne.debourseCents,
  };
}

/**
 * Le calcul complet d'un devis. Fonction PURE : elle ne lit rien, n'écrit rien,
 * et c'est ce qui la rend vérifiable par un script sans base ni navigateur
 * (scripts/devis-smoke.mts) tout en servant l'éditeur en direct.
 */
export function calculerDevis(
  entete: Pick<DevisEntete, "tauxTvaCentieme" | "remiseGlobalePourMille" | "remiseGlobaleCents">,
  lots: LotDevisVue[],
  lignes: LigneDevisVue[],
): TotauxDevis {
  const lotsTries = [...lots].sort((a, b) => a.ordre - b.ordre);
  const parLot = new Map<string | null, LigneCalculee[]>();
  for (const l of [...lignes].sort((a, b) => a.ordre - b.ordre)) {
    // Une ligne dont le lot a été supprimé retombe dans le groupe « hors lot »
    // plutôt que de disparaître : on ne perd jamais une ligne de chiffrage.
    const cle = l.lotId && lots.some((x) => x.id === l.lotId) ? l.lotId : null;
    const liste = parLot.get(cle);
    if (liste) liste.push(calculerLigne(l));
    else parLot.set(cle, [calculerLigne(l)]);
  }

  const groupes: LotCalcule[] = [];
  for (const lot of lotsTries) {
    groupes.push(construireLot(lot, parLot.get(lot.id) ?? []));
  }
  const horsLot = parLot.get(null) ?? [];
  // Le groupe « hors lot » n'apparaît que s'il porte quelque chose, et TOUJOURS
  // en dernier : ce qui n'est pas rangé se lit à la fin, pas en tête.
  if (horsLot.length > 0) groupes.push(construireLot(null, horsLot));

  let totalHtCents = 0;
  let optionsCents = 0;
  let debourseCents = 0;
  let venduFournitureCents = 0;
  let nbSansPrix = 0;
  let nbPerimees = 0;
  let nbLignes = 0;
  let nbOptions = 0;

  for (const g of groupes) {
    totalHtCents += g.sousTotalCents;
    optionsCents += g.optionsCents;
    for (const lc of g.lignes) {
      if (!ligneChiffree(lc.ligne.genre)) continue;
      nbLignes += 1;
      if (lc.ligne.option) nbOptions += 1;
      if (lc.perimee) nbPerimees += 1;
      // Les options sortent de TOUTES les statistiques de total, marge comprise :
      // sinon la marge affichée serait celle d'un devis qu'on n'a pas vendu.
      if (lc.ligne.option) continue;
      if (lc.debourseTotalCents === null) {
        // Une prestation n'a pas de déboursé PAR CONSTRUCTION (taux de vente
        // direct) : ce n'est pas un trou de chiffrage, on ne l'alerte pas.
        if (lc.ligne.genre === "PRODUIT") nbSansPrix += 1;
      } else {
        debourseCents += lc.debourseTotalCents;
        venduFournitureCents += lc.totalCents;
      }
    }
  }

  const remiseGlobaleCents = resoudreRemiseGlobale(entete, totalHtCents);
  const netHtCents = totalHtCents - remiseGlobaleCents;
  const tvaCents = arrondi((netHtCents * entete.tauxTvaCentieme) / 10_000);

  const margeFournitureCents = venduFournitureCents - debourseCents;

  // La part de remise globale qui retombe sur la fourniture, au prorata de son
  // poids dans le vendu. Sur un devis sans remise globale, c'est zéro.
  const partRemiseFourniture =
    remiseGlobaleCents > 0 && totalHtCents > 0
      ? arrondi((remiseGlobaleCents * venduFournitureCents) / totalHtCents)
      : 0;
  const venduFournitureNetCents = venduFournitureCents - partRemiseFourniture;
  const margeFournitureNetteCents = venduFournitureNetCents - debourseCents;

  return {
    lots: groupes,
    totalHtCents,
    remiseGlobaleCents,
    netHtCents,
    tvaCents,
    totalTtcCents: netHtCents + tvaCents,
    optionsCents,
    debourseCents,
    venduFournitureCents,
    margeFournitureCents,
    tauxMargeFournitureCentieme:
      venduFournitureCents > 0
        ? arrondi((margeFournitureCents * 10_000) / venduFournitureCents)
        : null,
    venduFournitureNetCents,
    margeFournitureNetteCents,
    tauxMargeFournitureNetteCentieme:
      venduFournitureNetCents > 0
        ? arrondi((margeFournitureNetteCents * 10_000) / venduFournitureNetCents)
        : null,
    nbSansPrix,
    nbPerimees,
    nbLignes,
    nbOptions,
  };
}

function construireLot(lot: LotDevisVue | null, lignes: LigneCalculee[]): LotCalcule {
  let sousTotalCents = 0;
  let optionsCents = 0;
  for (const lc of lignes) {
    if (lc.ligne.option) optionsCents += lc.totalCents;
    else sousTotalCents += lc.totalCents;
  }
  return { lot, lignes, sousTotalCents, optionsCents };
}

/**
 * La remise globale est EXCLUSIVE : en pour mille ou en euros, jamais les deux.
 * Si les deux sont posées (donnée héritée, import futur), le montant fixe gagne
 * — c'est le plus explicite des deux, donc le moins surprenant.
 */
/* =============================================================================
 * LA CHARGE — ce que le devis représente en travail
 *
 * Un devis GTB ne se juge pas qu'en euros : « 58 000 € » ne dit pas si l'on
 * s'engage sur trois jours ou sur trois semaines. L'information est déjà dans
 * les lignes (les prestations portent leur unité), elle n'était simplement
 * jamais totalisée — on la recomptait à la main, ou pas du tout.
 *
 * Les OPTIONS en sont exclues, comme des totaux : ce n'est pas du travail
 * engagé tant que le client ne les a pas prises. Le regroupement se fait par
 * unité et rien n'est converti — 7 h ne font pas 1 j chez tout le monde, et une
 * conversion inventée ici serait fausse quelque part.
 * ========================================================================== */

export interface ChargeUnite {
  unite: string;
  /** Total en millièmes, comme les quantités de ligne. */
  quantiteMillieme: number;
}

export function chargeMainOeuvre(lignes: LigneDevisVue[]): ChargeUnite[] {
  const parUnite = new Map<string, number>();
  for (const l of lignes) {
    if (l.genre !== "PRESTATION" || l.option) continue;
    const u = l.unite.trim() || "U";
    parUnite.set(u, (parUnite.get(u) ?? 0) + l.quantiteMillieme);
  }
  return [...parUnite.entries()]
    .filter(([, q]) => q > 0)
    // Les unités de temps d'abord (c'est la question qu'on se pose), le reste
    // ensuite, par ordre alphabétique pour que l'affichage soit stable.
    .sort((a, b) => rangUnite(a[0]) - rangUnite(b[0]) || a[0].localeCompare(b[0]))
    .map(([unite, quantiteMillieme]) => ({ unite, quantiteMillieme }));
}

function rangUnite(u: string): number {
  const i = ["j", "h", "forfait"].indexOf(u.toLowerCase());
  return i < 0 ? 99 : i;
}

export function resoudreRemiseGlobale(
  entete: Pick<DevisEntete, "remiseGlobalePourMille" | "remiseGlobaleCents">,
  totalHtCents: number,
): number {
  if (entete.remiseGlobaleCents !== null && entete.remiseGlobaleCents !== undefined) {
    return Math.min(entete.remiseGlobaleCents, totalHtCents);
  }
  if (entete.remiseGlobalePourMille) {
    return arrondi((totalHtCents * entete.remiseGlobalePourMille) / MILLE);
  }
  return 0;
}

/* =============================================================================
 * LE PRIX CIBLE — l'inverse du chiffrage
 *
 * Le moteur va du déboursé vers le prix. En négociation, la question part de
 * l'autre bout : « le client veut 60 000 € ». Sans cet outil on tâtonne sur la
 * remise, et surtout on ne voit pas à quel moment on est passé sous la ligne.
 *
 * La cible porte sur le NET HT — c'est le montant qui se négocie. La TVA suit,
 * elle ne se discute pas.
 * ========================================================================== */

export interface SimulationCible {
  /** Remise globale nécessaire pour atteindre la cible, en centimes. */
  remiseCents: number;
  /** La même, en pour mille du total HT — pour la lire en pourcentage. */
  remisePourMille: number;
  /** Marge sur la fourniture qui resterait, remise encaissée. Null si aucune
   *  ligne n'a de déboursé connu : on ne simule pas ce qu'on ignore. */
  margeNetteCents: number | null;
  tauxMargeNetteCentieme: number | null;
  /** La cible est au-dessus du total : il n'y a rien à remiser. On ne propose
   *  JAMAIS une remise négative — un devis ne se gonfle pas par une remise, on
   *  remonte les prix. */
  cibleAuDessus: boolean;
  /** La marge restante est nulle ou négative : on vend à perte sur la
   *  fourniture. Le dire est tout l'intérêt de la simulation. */
  aPerte: boolean;
}

/**
 * Ce qu'il faudrait remiser pour atteindre `cibleNetCents`, et ce qu'il
 * resterait comme marge.
 *
 * ⚠️ La marge simulée tient compte de la remise, au prorata du poids de la
 * fourniture dans le vendu (même règle que `calculerDevis`). Répondre avec la
 * marge brute donnerait un chiffre systématiquement trop beau — précisément au
 * moment où l'on décide de lâcher du prix.
 */
export function simulerPrixCible(
  t: Pick<TotauxDevis, "totalHtCents" | "venduFournitureCents" | "debourseCents">,
  cibleNetCents: number,
): SimulationCible {
  const cible = Math.max(0, Math.round(cibleNetCents));
  const brut = t.totalHtCents - cible;
  const cibleAuDessus = brut <= 0;
  const remiseCents = cibleAuDessus ? 0 : Math.min(brut, t.totalHtCents);
  const remisePourMille =
    t.totalHtCents > 0 ? arrondi((remiseCents * MILLE) / t.totalHtCents) : 0;

  if (t.debourseCents <= 0) {
    return {
      remiseCents,
      remisePourMille,
      margeNetteCents: null,
      tauxMargeNetteCentieme: null,
      cibleAuDessus,
      aPerte: false,
    };
  }

  const part =
    remiseCents > 0 && t.totalHtCents > 0
      ? arrondi((remiseCents * t.venduFournitureCents) / t.totalHtCents)
      : 0;
  const venduNet = t.venduFournitureCents - part;
  const margeNetteCents = venduNet - t.debourseCents;

  return {
    remiseCents,
    remisePourMille,
    margeNetteCents,
    tauxMargeNetteCentieme: venduNet > 0 ? arrondi((margeNetteCents * 10_000) / venduNet) : null,
    cibleAuDessus,
    aPerte: margeNetteCents <= 0,
  };
}

/* =============================================================================
 * LA NUMÉROTATION — DT{AA}{NNNN}
 * ========================================================================== */

/** 2026, 52 → « DT260052 ». */
export function formatNumeroDevis(annee: number, rang: number): string {
  const aa = String(annee % 100).padStart(2, "0");
  return `DT${aa}${String(rang).padStart(4, "0")}`;
}

/** Le compteur à 4 chiffres plafonne à 9 999 devis par an — très au-delà du
 *  volume réel. Le générateur doit malgré tout REFUSER de déborder plutôt que
 *  de produire un « DT2610000 » à 9 caractères que personne n'attend. */
export const RANG_DEVIS_MAX = 9999;

/** Étiquette complète d'un devis, révision comprise : « DT260052 v2 ». */
export function libelleDevis(numero: string, revision: number): string {
  return revision > 1 ? `${numero} v${revision}` : numero;
}

/* =============================================================================
 * DIVERS
 * ========================================================================== */

export const UNITES_PRESTATION = ["h", "j", "forfait", "U"] as const;

export interface PrestationVue {
  id: string;
  libelle: string;
  unite: string;
  prixVenteCents: number;
  famille: string;
  ordre: number;
  actif: boolean;
  note: string;
  /** Combien de lignes de devis la portent — décide si on peut la supprimer. */
  nbLignes: number;
}

/** Ce que l'écran d'un devis reçoit du serveur, d'un bloc. */
export interface DevisComplet {
  entete: DevisEntete;
  lots: LotDevisVue[];
  lignes: LigneDevisVue[];
}

export interface DevisResume {
  id: string;
  numero: string;
  revision: number;
  titre: string;
  etat: EtatDevis;
  clientNom: string;
  numeroWhy: string | null;
  chantierId: string | null;
  chantierNom: string | null;
  totalHtCents: number;
  netHtCents: number;
  margeFournitureCents: number;
  tauxMargeFournitureCentieme: number | null;
  nbLignes: number;
  nbSansPrix: number;
  updatedAt: Date;
  auteur: string | null;
  /** Nombre de révisions ultérieures : une v1 dépassée doit se voir comme telle. */
  nbRevisions: number;
  /** Le lien client est-il en service MAINTENANT (jeton posé et non échu) ? */
  publie: boolean;
  /** Ouvertures du lien — « émis, jamais ouvert » est l'information qui décide
   *  d'un coup de téléphone. */
  nbConsultations: number;
}

/* =============================================================================
 * LA RESTITUTION CLIENT — le document qui part chez le client
 *
 * Cadrage : docs/DEVIS.md §21. Tout ce qui suit est PUR : c'est la seule façon
 * de vérifier au script (scripts/devis-smoke.mts) ce qu'un client verra, sans
 * base ni navigateur.
 *
 * La règle qui porte tout : ON NE MONTRE JAMAIS LE DÉBOURSÉ, NI LE COEFFICIENT,
 * NI LA MARGE, NI LA RÉFÉRENCE INTERNE. Le document client se construit depuis
 * `TotauxDevis` — dont on ne lit que les prix de vente. Un écran interne qui
 * oublie un chiffre est un désagrément ; un document qui sort le déboursé chez
 * le client est un incident commercial.
 * ========================================================================== */

/** Racine de l'URL publique d'un devis. Une seule source de vérité : le panneau
 *  de partage, la page publique et le générateur de PDF en dépendent. */
export const BASE_URL_DEVIS_PUBLIC = "/d/";

/** Les médias d'un devis sont derrière une garde Achats ; sur la page publique
 *  ils passent par la route scopée au jeton (même patron que les notes). */
export function reecrireMediasPublicsDevis(contenu: ContenuRiche, jeton: string): ContenuRiche {
  const json = JSON.stringify(contenu ?? []);
  return JSON.parse(
    json.replaceAll(PREFIXE_MEDIA_DEVIS, `/api/public/devis/${jeton}/media/`),
  ) as ContenuRiche;
}

/* --- L'identité de la maison ------------------------------------------------ */

/** Les réglages société, tels que le document les consomme (miroir de
 *  `ReglageSociete`, sans `updatedAt`). */
export interface SocieteVue {
  raisonSociale: string;
  formeCapital: string;
  adresse: string;
  codePostal: string;
  ville: string;
  telephone: string;
  email: string;
  siteWeb: string;
  rcs: string;
  codeApe: string;
  tvaIntracom: string;
  iban: string;
  bic: string;
  reglement: string;
  conditionsReglement: string;
  acomptePourMille: number;
  dureeRealisation: string;
  remarques: string;
}

/**
 * Ce que la maison est, à défaut de réglage en base.
 *
 * Repris des devis historiques (`public/devis_template/`) : un premier document
 * imprimé sans pied de page ni IBAN serait pire qu'inutile — il serait faux.
 * L'écran de réglages sert à CORRIGER ceci, pas à le saisir de zéro.
 */
export const SOCIETE_DEFAUT: SocieteVue = {
  raisonSociale: "DUMORTIER",
  formeCapital: "SAS au capital de 38 112,25 €",
  adresse: "ZAC du Château",
  codePostal: "02800",
  ville: "CHARMES",
  telephone: "03 23 38 18 88",
  email: "dumortier@fareneit.fr",
  siteWeb: "www.fareneit.fr",
  rcs: "RCS ST QUENTIN 317 324 119",
  codeApe: "4615Z",
  tvaIntracom: "FR 13 317 324 119",
  iban: "FR76 3002 7177 6100 0192 6410 194",
  bic: "",
  reglement: "Virement",
  conditionsReglement: "30 jours NET",
  acomptePourMille: 500,
  dureeRealisation: "15 jours",
  remarques: "",
};

/** Les lignes du pied de page légal, dans l'ordre. Une mention absente ne laisse
 *  pas de séparateur orphelin : c'est tout l'objet de cette fonction. */
export function mentionsLegales(s: SocieteVue): string[] {
  const joindre = (parts: (string | false | null | undefined)[], sep = " · ") =>
    parts
      .map((p) => (p || "").trim())
      .filter(Boolean)
      .join(sep);
  return [
    joindre([s.raisonSociale, s.formeCapital]),
    joindre([
      s.adresse,
      joindre([s.codePostal, s.ville], " "),
      s.telephone && `Tél. ${s.telephone}`,
      s.email,
    ]),
    joindre([
      s.rcs,
      s.codeApe && `Code APE ${s.codeApe}`,
      s.tvaIntracom && `TVA ${s.tvaIntracom}`,
      s.siteWeb,
    ]),
  ].filter(Boolean);
}

/** Le pavé destinataire : les lignes saisies, ou le seul nom du client à défaut.
 *  Jamais vide — un devis sans destinataire ne s'envoie pas. */
export function lignesDestinataire(destinataire: string, clientNom: string): string[] {
  const lignes = destinataire
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lignes.length > 0) return lignes;
  return clientNom.trim() ? [clientNom.trim()] : [];
}

/* --- L'acompte -------------------------------------------------------------- */

/** L'acompte demandé, en centimes du TTC. 0 (donc absent du document) si aucun
 *  acompte n'est réglé ou si le devis est vide. */
export function acompteCents(totalTtcCents: number, acomptePourMille: number): number {
  if (acomptePourMille <= 0 || totalTtcCents <= 0) return 0;
  return arrondi((totalTtcCents * acomptePourMille) / MILLE);
}

/* --- La validité ------------------------------------------------------------ */

/** La date jusqu'à laquelle l'offre tient, à partir de sa date d'établissement. */
export function dateValidite(etabliLe: Date, validiteJours: number): Date {
  const d = new Date(etabliLe);
  d.setDate(d.getDate() + Math.max(0, validiteJours));
  return d;
}

/**
 * Les durées offertes au partage d'un devis. La première — et le défaut — est
 * calée sur la VALIDITÉ de l'offre : un lien qui survit à l'offre qu'il porte
 * laisse un prix périmé accessible, et c'est exactement ce dont on ne veut pas.
 * Les autres existent parce qu'une négociation dure parfois plus longtemps que
 * prévu (le jeton se prolonge alors À LA MÊME URL).
 */
export function dureesPartageDevis(validiteJours: number): DureePartage[] {
  const j = Math.max(1, validiteJours);
  return [
    { id: "validite", libelle: `Validité de l'offre (${j} j)`, heures: j * 24 },
    { id: "60j", libelle: "60 jours", heures: 60 * 24 },
    { id: "180j", libelle: "6 mois", heures: 180 * 24 },
  ];
}

export const DUREE_PARTAGE_DEVIS_DEFAUT = "validite";

/* --- Ce que le client voit du chiffrage ------------------------------------- */

/** Les trois interrupteurs de publication (portés par le devis). */
export interface OptionsPublication {
  montrerPrixUnitaires: boolean;
  montrerSousTotauxLots: boolean;
  montrerOptions: boolean;
}

export const PUBLICATION_DEFAUT: OptionsPublication = {
  montrerPrixUnitaires: true,
  montrerSousTotauxLots: true,
  montrerOptions: true,
};

export interface LotDocument {
  /** Null pour le groupe « hors lot » : le document ne titre pas ce qui n'a pas
   *  de titre, il enchaîne simplement les lignes.
   *
   *  ⚠️ Null AUSSI pour un bloc condensé : sa ligne de synthèse porte déjà la
   *  phrase du client, et un bandeau de titre au-dessus dirait la même chose à
   *  deux centimètres d'écart. La phrase REMPLACE le titre. */
  titre: string | null;
  note: string;
  lignes: LigneCalculee[];
  sousTotalCents: number;
  /** Ce bloc est-il servi condensé ? Décide de deux choses que la ligne, seule,
   *  ne peut pas savoir : son prix s'affiche même quand les prix unitaires sont
   *  masqués, et aucun sous-total ne se pose sous elle (§6b). */
  condense: boolean;
}

export interface OptionDocument {
  /** Le lot d'où l'option vient, pour la situer dans la liste de fin. */
  lot: string | null;
  ligne: LigneCalculee;
}

export interface DocumentClient {
  lots: LotDocument[];
  /** Les options, RASSEMBLÉES EN FIN DE DOCUMENT et jamais additionnées au
   *  total. Vide si le devis n'en porte pas, ou si on a choisi de les taire. */
  options: OptionDocument[];
  optionsCents: number;
  /** Vrai si le document affiche une colonne de prix par ligne. */
  avecPrixLigne: boolean;
  avecSousTotaux: boolean;
}

/**
 * La vue du devis destinée au client : les lots dans l'ordre, les options
 * extraites en fin de document, et rien d'autre.
 *
 * Les lignes TEXTE traversent telles quelles — ce sont les commentaires qui
 * expliquent le chiffrage, et c'est précisément ce que le client doit lire.
 */
export function documentClient(
  totaux: TotauxDevis,
  opts: OptionsPublication,
  /** Vue INTERNE : les blocs condensés sont montrés détaillés (le bordereau).
   *  ⚠️ Ce drapeau ne se persiste jamais sur le devis — il ne vit que le temps
   *  d'une URL, sinon il serait à un clic de tout dévoiler au client. */
  detaille = false,
): DocumentClient {
  const lots: LotDocument[] = [];
  const options: OptionDocument[] = [];
  let optionsCents = 0;

  for (const g of totaux.lots) {
    const condense = !detaille && g.lot?.rendu === "CONDENSE";
    const titre = g.lot?.titre?.trim() || null;
    const lignes: LigneCalculee[] = [];
    for (const lc of g.lignes) {
      if (lc.ligne.option) {
        optionsCents += lc.totalCents;
        // ⚠️ Une option d'un bloc condensé ressort NOMMÉMENT ici : le détail
        // fuit par là. C'est juste (une option est une proposition, le client
        // doit la lire) — mais l'éditeur avertit au moment où on la coche.
        if (opts.montrerOptions) options.push({ lot: titre, ligne: lc });
        continue;
      }
      lignes.push(lc);
    }
    // Un lot vidé de ses seules options ne laisse pas un titre sans rien
    // dessous : il disparaît du document. Idem d'un bloc condensé qui ne
    // porterait que des lignes TEXTE : « Ensemble … 0,00 € » est pire que rien.
    if (lignes.length > 0) {
      lots.push({
        // La phrase du client remplace le bandeau de titre (cf. LotDocument).
        titre: condense ? null : titre,
        note: g.lot?.note ?? "",
        lignes,
        sousTotalCents: g.sousTotalCents,
        condense,
      });
    }
  }

  return {
    lots,
    options,
    optionsCents,
    avecPrixLigne: opts.montrerPrixUnitaires,
    // Un sous-total de lot n'a de sens que s'il y a PLUSIEURS lots : sur un
    // devis d'un seul lot, il répéterait le total HT juste au-dessus de lui.
    avecSousTotaux: opts.montrerSousTotauxLots && lots.length > 1,
  };
}

/* =============================================================================
 * LA CONDENSATION — un bloc devient une ligne
 *
 * `condenserLots` travaille EN AMONT du moteur : elle prend et rend des
 * `LigneDevisVue`, c'est-à-dire l'entrée de `calculerDevis`. Un seul sens de
 * lecture, donc une seule implémentation pour ses deux appelants — la page
 * publique (qui condense DANS la requête, pour que le détail ne sorte pas du
 * serveur) et l'aperçu interne (qui condense au rendu, parce qu'il doit pouvoir
 * montrer les deux versions).
 * ========================================================================== */

/**
 * Les lignes telles que le CLIENT doit les recevoir.
 *
 * ⚠️ Type MARQUÉ, et ce n'est pas de la coquetterie : la ligne de synthèse est
 * une `LIBRE` sans déboursé. Calculer une marge dessus reproduirait exactement
 * le défaut qu'on cherche à corriger (un montant qui sort du déboursé ET du
 * vendu-fourniture, sans que rien ne le dise). Le compilateur refuse donc de la
 * confondre avec les vraies lignes.
 */
declare const pourClient: unique symbol;
export type LignesPourClient = LigneDevisVue[] & { readonly [pourClient]: true };

/**
 * Remplace les lignes de chaque bloc `CONDENSE` par une ligne de synthèse au
 * sous-total du lot. Les options traversent, les autres blocs ne bougent pas.
 *
 * Idempotente : condenser un tableau déjà condensé ne le change plus (la
 * synthèse d'un bloc réduit à sa synthèse vaut la synthèse). C'est ce qui permet
 * de l'appliquer À LA FOIS dans la requête publique et dans le document, sans
 * avoir à savoir laquelle est déjà passée.
 */
export function condenserLots(
  entete: Pick<DevisEntete, "tauxTvaCentieme" | "remiseGlobalePourMille" | "remiseGlobaleCents">,
  lots: LotDevisVue[],
  lignes: LigneDevisVue[],
): LignesPourClient {
  const aCondenser = lots.filter((l) => l.rendu === "CONDENSE");
  if (aCondenser.length === 0) return [...lignes] as LignesPourClient;

  // Le sous-total vient du MOTEUR, jamais d'une addition refaite ici : c'est ce
  // qui garantit qu'un devis condensé et le même devis détaillé annoncent le
  // même prix au centime (l'invariant vérifié par le smoke).
  const totaux = calculerDevis(entete, lots, lignes);
  const sousTotaux = new Map<string, number>();
  for (const g of totaux.lots) {
    if (g.lot) sousTotaux.set(g.lot.id, g.sousTotalCents);
  }

  // Un bloc qui ne porte QUE des commentaires n'a rien à synthétiser : sa
  // synthèse vaudrait « TRAVAUX — 0,00 € », et un montant nul affiché avec
  // l'aplomb d'un chiffrage est pire que rien. Le bloc disparaît alors du
  // document, comme un lot vidé de ses seules options.
  const aSynthetiser = new Set(
    aCondenser
      .filter((lot) =>
        lignes.some((l) => l.lotId === lot.id && !l.option && ligneChiffree(l.genre)),
      )
      .map((lot) => lot.id),
  );

  const sortie: LigneDevisVue[] = [];
  const posee = new Set<string>();

  for (const l of [...lignes].sort((a, b) => a.ordre - b.ordre)) {
    const lot = l.lotId ? aCondenser.find((x) => x.id === l.lotId) : undefined;
    if (!lot) {
      sortie.push(l);
      continue;
    }
    // Les options traversent telles quelles : elles sont chiffrées à part, hors
    // du sous-total, et le client doit pouvoir les lire une par une.
    if (l.option) {
      sortie.push(l);
      continue;
    }
    if (!aSynthetiser.has(lot.id)) continue;
    // Une seule synthèse par bloc, à la place de sa première ligne — l'ordre du
    // document suit celui du chiffrage.
    if (posee.has(lot.id)) continue;
    posee.add(lot.id);
    sortie.push(ligneSynthese(lot, sousTotaux.get(lot.id) ?? 0, l.ordre));
  }

  return sortie as LignesPourClient;
}

/** La ligne unique qui remplace un bloc condensé. */
function ligneSynthese(lot: LotDevisVue, sousTotalCents: number, ordre: number): LigneDevisVue {
  return {
    // Stable et sans collision possible avec un cuid : la même synthèse porte le
    // même id d'un rendu à l'autre (clé React, ancres d'impression).
    id: `synth-${lot.id}`,
    lotId: lot.id,
    ordre,
    // LIBRE et non TEXTE : la ligne est CHIFFRÉE, donc `documentVide()` continue
    // de dire vrai et le sous-total du lot reste le sien.
    genre: "LIBRE",
    produitId: null,
    prestationId: null,
    designation: designationClient(lot),
    contenu: null,
    version: 0,
    refInterne: null,
    unite: "forfait",
    // Quantité 1 et remise nulle : `calculerLigne` rend alors `brut = pv` au
    // centime, sans le moindre arrondi intermédiaire. Les remises de ligne du
    // bloc sont déjà encaissées dans le sous-total.
    quantiteMillieme: MILLE,
    debourseCents: null,
    coefMillieme: null,
    origineCoef: "devis",
    pvUnitaireCents: sousTotalCents,
    remisePourMille: 0,
    option: false,
    note: "",
    debourseActuelCents: null,
    majLe: new Date(0).toISOString(),
  };
}

/** Le devis n'a-t-il rien à montrer ? (Un document vide ne se publie pas.) */
export function documentVide(doc: DocumentClient): boolean {
  return doc.lots.every((l) => l.lignes.every((x) => !ligneChiffree(x.ligne.genre)));
}

/* =============================================================================
 * DIVERS (suite)
 * ========================================================================== */

/** Point médian entre deux voisins — insertion sans renumérotation globale
 *  (même patron que TacheAffaire.ordre). */
export function ordreEntre(avant: number | null, apres: number | null): number {
  if (avant === null && apres === null) return 1000;
  if (avant === null) return (apres as number) - 1000;
  if (apres === null) return avant + 1000;
  return (avant + apres) / 2;
}


/* =============================================================================
 * LE FIL DU DEVIS — la mémoire de ce qui s'est dit autour du chiffrage
 *
 * Cadrage complet : docs/DEVIS-FIL.md. Deux natures s'y mêlent dans une seule
 * colonne de temps :
 *
 *  · les FAITS, qui ne s'écrivent pas — ils se DÉDUISENT de ce que le modèle
 *    retient déjà (créé, émis, publié, ouvert par le client, révision d'une
 *    version précédente). Aucune écriture, aucune reprise : ils existaient
 *    depuis toujours, personne ne les avait mis bout à bout ;
 *  · ce qu'on ÉCRIT — les messages, et les rares faits que le modèle ne sait
 *    pas retenir (passage à Accepté ou Refusé : aucune colonne ne les date,
 *    contrairement à `emisLe` et `publieLe`).
 *
 * La règle qui décide : **on n'enregistre que ce qu'on ne peut pas déduire.**
 * Enregistrer « passé à Émis » alors que `emisLe` existe donnerait deux lignes
 * pour un seul fait, et la première divergence entre les deux serait un bug
 * qu'on ne saurait pas lire.
 * ========================================================================== */

/** Les faits qu'on ENREGISTRE, faute de colonne qui les retienne. */
export const EVENEMENTS_FIL = ["accepte", "refuse", "rouvert"] as const;
export type EvenementEnregistre = (typeof EVENEMENTS_FIL)[number];

export function estEvenementEnregistre(v: unknown): v is EvenementEnregistre {
  return typeof v === "string" && (EVENEMENTS_FIL as readonly string[]).includes(v);
}

/** Ce qu'un changement d'état laisse comme trace — null quand une colonne le
 *  retient déjà (`emisLe`), ou quand il n'y a rien à dire. */
export function evenementDEtat(avant: EtatDevis, apres: EtatDevis): EvenementEnregistre | null {
  if (avant === apres) return null;
  if (apres === "ACCEPTE") return "accepte";
  if (apres === "REFUSE") return "refuse";
  // Revenir en arrière depuis une réponse du client est une décision, pas une
  // correction de frappe : elle mérite sa ligne. Repasser d'Émis à Brouillon,
  // non — c'est le geste de quelqu'un qui reprend son chiffrage.
  if (apres === "BROUILLON" && (avant === "ACCEPTE" || avant === "REFUSE")) return "rouvert";
  return null;
}

/** Le genre d'une entrée de fil — il décide de l'icône et du ton. */
export type GenreEntreeFil =
  | "message"
  | "cree"
  | "revision"
  | "emis"
  | "publie"
  | "consultation"
  | EvenementEnregistre;

/** Une pièce jointe d'un message. */
export interface PieceFilVue {
  id: string;
  nom: string;
  mimeType: string;
  taille: number;
  /** Versée dans la GED de l'affaire — on ne la verse pas deux fois sans le dire. */
  verseeLe: Date | null;
}

/** Une entrée du fil, message ou fait, prête à rendre. */
export interface EntreeFil {
  /** Stable : l'id du message, ou une clé dérivée du fait (« emis:<devisId> »). */
  id: string;
  genre: GenreEntreeFil;
  quand: Date;
  /** Le texte saisi — vide pour un fait. */
  corps: string;
  auteur: string | null;
  auteurId: string | null;
  epingle: boolean;
  modifieLe: Date | null;
  /** La version d'où ça vient : « v2 ». Null si sa version a été supprimée. */
  revision: number | null;
  /** Détail d'un fait (nombre de consultations regroupées, n° de révision…). */
  detail: string | null;
  pieces: PieceFilVue[];
}

/** Ce que l'écran reçoit. */
export interface FilDevis {
  filId: string;
  entrees: EntreeFil[];
  /** Combien de MESSAGES (les faits ne se comptent pas : personne ne les écrit). */
  nbMessages: number;
  /** Messages postés depuis la dernière ouverture de l'onglet, par d'autres. */
  nbNonLus: number;
}

/** Un fait n'a ni auteur à créditer ni corps à relire : il ne se compte pas
 *  comme un message, et il ne se modifie pas. */
export function estFait(genre: GenreEntreeFil): boolean {
  return genre !== "message";
}

/** Taille lisible d'une pièce jointe. */
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Un message vide n'est pas un message. Le plafond évite qu'un collage
 *  malheureux ne fasse d'une colonne de discussion un document. */
export const LONGUEUR_MAX_MESSAGE = 4000;
