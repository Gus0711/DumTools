// Modèle de l'outil « Devis » — PARTAGÉ client/serveur.
// Aucun import Prisma ici : l'éditeur recalcule les totaux sous les doigts, il
// dépend donc de ce fichier (même règle que src/tools/magasin/model.ts).
//
// Cadrage complet : docs/DEVIS.md.

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

export interface LotDevisVue {
  id: string;
  titre: string;
  ordre: number;
  note: string;
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
  note: string;
  emisLe: Date | null;
  createdAt: Date;
  updatedAt: Date;
  auteur: string | null;
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
}

/** Point médian entre deux voisins — insertion sans renumérotation globale
 *  (même patron que TacheAffaire.ordre). */
export function ordreEntre(avant: number | null, apres: number | null): number {
  if (avant === null && apres === null) return 1000;
  if (avant === null) return (apres as number) - 1000;
  if (apres === null) return avant + 1000;
  return (avant + apres) / 2;
}
