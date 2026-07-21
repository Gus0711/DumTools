// Types & helpers de l'outil ToolGus « Formulaires » (form builder façon Kizeo).
// Client-safe : PAS de "server-only" ni de Prisma ici — importé par l'UI (builder,
// renderer terrain) ET par le serveur (actions de save). Deux mondes :
//   • la DÉFINITION d'un formulaire = un tableau ordonné de ChampDef (colonne
//     Formulaire.schema) ;
//   • une RÉPONSE = un snapshot FIGÉ de ce schéma + les valeurs saisies + les
//     médias (colonne FormulaireReponse.data, type ReponseData).

/** Types de champ disponibles. */
export type TypeChamp =
  // — saisie —
  | "texte" // ligne simple
  | "texteLong" // paragraphe
  | "nombre"
  | "slider" // curseur borné (min/max/pas) → nombre
  | "compteur" // incrément −/+ (min/max/pas) → nombre
  | "date"
  | "dateHeure" // date + heure
  // — choix —
  | "case" // booléen (oui / non)
  | "choix" // options affichées (pastilles), mono/multi
  | "liste" // liste déroulante (select) — longues listes
  // — terrain (médias / capteurs) —
  | "photo" // 1..n photos
  | "signature" // capture manuscrite → PNG
  | "pieceJointe" // fichier libre joint
  | "audio" // note vocale (MediaRecorder)
  | "dessin" // croquis libre → PNG
  | "schema" // annotation par-dessus un plan de fond → PNG
  | "codeBarre" // scan QR / code-barres → valeur texte
  | "reference" // pointeur vers une Affaire
  | "gps" // position { lat, lng, acc }
  // — présentation (pas de valeur) —
  | "separateur" // trait de section
  | "texteFixe" // consigne / texte figé
  | "imageFixe" // image posée à la conception
  // — automatique —
  | "calcul"; // champ calculé (lecture seule)

/** Un champ de la définition. `id` stable : c'est la clé des valeurs saisies ET
 *  du snapshot figé dans chaque réponse (ne jamais réutiliser un id supprimé). */
export interface ChampDef {
  id: string;
  type: TypeChamp;
  libelle: string;
  /** Aide / précision affichée sous le libellé. */
  aide?: string;
  requis?: boolean;
  /** Valeurs proposées pour « choix » et « liste ». */
  options?: string[];
  /** « choix » : autorise la sélection de plusieurs options. */
  multiple?: boolean;
  /** « slider » / « compteur » : bornes et pas. */
  min?: number;
  max?: number;
  pas?: number;
  /** « texteFixe » : le texte figé affiché. */
  contenuFixe?: string;
  /** « imageFixe » / « schema » : l'image (data URL compressée, à la conception). */
  imageData?: string;
  /** « calcul » : opération + champs opérandes (recalcul live). */
  calcul?: ConfigCalcul;
  /** Logique conditionnelle : n'afficher ce champ que si la condition passe. */
  condition?: Condition;
}

/** Opération d'un champ calculé (guidé, pas de formule libre → pas d'`eval`). */
export type TypeOperation =
  | "somme"
  | "difference"
  | "produit"
  | "moyenne"
  | "min"
  | "max"
  | "nbCoches" // nombre de cases cochées parmi les opérandes
  | "concat"; // concaténation de textes

export interface ConfigCalcul {
  operation: TypeOperation;
  /** ChampIds des opérandes (restreints aux champs précédents). */
  operandes: string[];
  /** Séparateur pour « concat ». */
  separateur?: string;
}

/** Opérateur d'une condition d'affichage. */
export type OperateurCond =
  | "rempli"
  | "vide"
  | "coche"
  | "nonCoche"
  | "egal"
  | "different";

export interface Condition {
  /** Champ source (répondu avant). */
  champId: string;
  operateur: OperateurCond;
  /** Valeur de comparaison (pour egal/different). */
  valeur?: string;
}

export const OPERATION_LABEL: Record<TypeOperation, string> = {
  somme: "Somme",
  difference: "Différence",
  produit: "Produit",
  moyenne: "Moyenne",
  min: "Minimum",
  max: "Maximum",
  nbCoches: "Nombre de cases cochées",
  concat: "Concaténation de textes",
};

export const OPERATEUR_COND_LABEL: Record<OperateurCond, string> = {
  rempli: "est rempli",
  vide: "est vide",
  coche: "est coché",
  nonCoche: "n'est pas coché",
  egal: "est égal à",
  different: "est différent de",
};

/** La définition complète d'un formulaire = ses champs ordonnés (Formulaire.schema). */
export type SchemaFormulaire = ChampDef[];

/** Position GPS capturée (navigator.geolocation). */
export interface PositionGps {
  lat: number;
  lng: number;
  /** Précision en mètres, si connue. */
  acc?: number;
}

/** Lien « ouvrir dans Google Maps » (recherche du point). */
export function lienGoogleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
/** Lien « ouvrir dans Waze » (navigation vers le point). */
export function lienWaze(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

/** Valeur d'un champ « référence » : pointeur vers une Affaire (id + libellé figé). */
export interface RefValue {
  id: string;
  label: string;
}

/** Option d'affaire proposée au champ « référence » (fournie au remplissage). */
export interface RefOption {
  id: string;
  label: string;
  numeroWhy?: string | null;
}

/** Valeur d'un champ selon son type. Les médias sont référencés par leurs ids
 *  dans un `string[]` ; le binaire vit ailleurs. */
export type ValeurChamp =
  | string // texte, texteLong, date, dateHeure, choix simple, liste, codeBarre
  | number // nombre, slider, compteur
  | boolean // case
  | string[] // choix multiple, ou ids de médias
  | PositionGps
  | RefValue
  | null;

/** Type de média capturé (whitelist partagée avec la route /api/formulaires/media). */
export type TypeMediaChamp = "photo" | "signature" | "audio" | "dessin" | "fichier";

/** Méta d'un média d'une réponse (le binaire vit sur le disque VM — cf.
 *  FormulaireMedia + FORMULAIRES_MEDIA_DIR). `id` = UUID client = nom de fichier. */
export interface MediaMeta {
  id: string;
  type: TypeMediaChamp;
  mimeType: string;
  taille: number;
  /** Nom de fichier d'origine (pièces jointes surtout). */
  nom?: string;
  /** Champ (ChampDef.id) auquel ce média est rattaché. */
  champId?: string;
  /** Poussé sur le serveur ? (false tant que hors-ligne). */
  uploaded?: boolean;
}

/** Le payload JSON d'une réponse (colonne FormulaireReponse.data). */
export interface ReponseData {
  /** Schéma FIGÉ au remplissage → lecture stable même si le formulaire a changé. */
  schemaSnapshot: SchemaFormulaire;
  /** Valeurs saisies, indexées par ChampDef.id. */
  valeurs: Record<string, ValeurChamp>;
  medias: MediaMeta[];
  /** Horloge terrain (Date.now()) pour l'upsert « dernier gagne » (offline). */
  updatedTs: number;
}

/** Libellés lisibles des types de champ (builder + aide). */
export const TYPE_CHAMP_LABEL: Record<TypeChamp, string> = {
  texte: "Texte court",
  texteLong: "Paragraphe",
  nombre: "Nombre",
  slider: "Curseur",
  compteur: "Compteur",
  date: "Date",
  dateHeure: "Date et heure",
  case: "Case à cocher",
  choix: "Liste de choix",
  liste: "Liste déroulante",
  photo: "Photo",
  signature: "Signature",
  pieceJointe: "Pièce jointe",
  audio: "Audio",
  dessin: "Dessin",
  schema: "Schéma",
  codeBarre: "Code-barres / QR",
  reference: "Référence affaire",
  gps: "Position GPS",
  separateur: "Séparateur",
  texteFixe: "Texte fixe",
  imageFixe: "Image fixe",
  calcul: "Calcul",
};

/** Types qui produisent un média (binaire sur disque). */
export const CHAMPS_MEDIA: readonly TypeChamp[] = [
  "photo",
  "signature",
  "pieceJointe",
  "audio",
  "dessin",
  "schema",
] as const;

/** Types de PRÉSENTATION : aucun contenu saisi, jamais obligatoires. */
export const CHAMPS_PRESENTATION: readonly TypeChamp[] = [
  "separateur",
  "texteFixe",
  "imageFixe",
] as const;

export function estMedia(type: TypeChamp): boolean {
  return CHAMPS_MEDIA.includes(type);
}
export function estPresentation(type: TypeChamp): boolean {
  return CHAMPS_PRESENTATION.includes(type);
}

/** Ordre de présentation dans la palette du builder. */
export const TYPES_CHAMP: readonly TypeChamp[] = [
  "texte",
  "texteLong",
  "nombre",
  "slider",
  "compteur",
  "date",
  "dateHeure",
  "case",
  "choix",
  "liste",
  "photo",
  "signature",
  "pieceJointe",
  "audio",
  "dessin",
  "schema",
  "codeBarre",
  "reference",
  "gps",
  "separateur",
  "texteFixe",
  "imageFixe",
  "calcul",
] as const;

/** Valeur initiale « vide » d'un champ (pour amorcer une réponse). */
export function valeurVide(champ: ChampDef): ValeurChamp {
  if (estMedia(champ.type)) return []; // ids de médias
  if (estPresentation(champ.type)) return null;
  switch (champ.type) {
    case "case":
      return false;
    case "nombre":
      return null;
    case "slider":
    case "compteur":
      return champ.min ?? 0;
    case "gps":
    case "reference":
    case "calcul":
      return null;
    case "choix":
      return champ.multiple ? [] : "";
    default:
      return ""; // texte, texteLong, date, dateHeure, liste, codeBarre
  }
}

/** Fabrique un nouveau champ vierge d'un type donné (id généré). */
export function nouveauChamp(type: TypeChamp): ChampDef {
  const champ: ChampDef = {
    id: crypto.randomUUID(),
    type,
    libelle: type === "separateur" ? "" : TYPE_CHAMP_LABEL[type],
  };
  if (type === "choix" || type === "liste")
    champ.options = ["Option 1", "Option 2"];
  if (type === "slider" || type === "compteur") {
    champ.min = 0;
    champ.max = type === "slider" ? 100 : 10;
    champ.pas = 1;
  }
  if (type === "texteFixe")
    champ.contenuFixe = "Texte d'information affiché dans le formulaire.";
  return champ;
}

/** Vrai si un champ requis n'est pas renseigné. */
export function champManquant(champ: ChampDef, valeur: ValeurChamp): boolean {
  if (!champ.requis || estPresentation(champ.type) || champ.type === "calcul")
    return false;
  if (valeur == null) return true;
  if (typeof valeur === "string") return valeur.trim() === "";
  if (Array.isArray(valeur)) return valeur.length === 0;
  return false; // nombre / slider / compteur / booléen / gps présents
}

/** Vrai si une valeur est « vide » (pour les conditions / aDesSaisies). */
export function estVideValeur(v: ValeurChamp): boolean {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Forme comparable (texte) d'une valeur, pour les conditions egal/different. */
function comparableStr(v: ValeurChamp): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.join(",");
  if (typeof v === "object" && "label" in v) return v.label; // RefValue
  return String(v);
}

/** Un champ est-il visible compte tenu de sa condition d'affichage ? */
export function champVisible(
  champ: ChampDef,
  valeurs: Record<string, ValeurChamp>,
): boolean {
  const c = champ.condition;
  if (!c || !c.champId) return true;
  const v = valeurs[c.champId] ?? null;
  switch (c.operateur) {
    case "rempli":
      return !estVideValeur(v);
    case "vide":
      return estVideValeur(v);
    case "coche":
      return v === true;
    case "nonCoche":
      return v !== true;
    case "egal":
      return comparableStr(v) === (c.valeur ?? "");
    case "different":
      return comparableStr(v) !== (c.valeur ?? "");
    default:
      return true;
  }
}

/** Calcule la valeur d'un champ « calcul » à partir des valeurs courantes. */
export function calculerValeur(
  config: ConfigCalcul,
  valeurs: Record<string, ValeurChamp>,
): number | string {
  const ops = config.operandes ?? [];
  if (config.operation === "concat") {
    const parts = ops
      .map((id) => {
        const v = valeurs[id];
        return typeof v === "string" ? v : v == null ? "" : String(v);
      })
      .filter((s) => s !== "");
    return parts.join(config.separateur ?? " ");
  }
  if (config.operation === "nbCoches") {
    return ops.reduce((n, id) => n + (valeurs[id] === true ? 1 : 0), 0);
  }
  // Opérations numériques : on ne garde que les opérandes chiffrables.
  const nums = ops
    .map((id) => {
      const v = valeurs[id];
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
        return Number(v);
      return null;
    })
    .filter((n): n is number => n != null);
  if (nums.length === 0) return 0;
  switch (config.operation) {
    case "somme":
      return nums.reduce((a, b) => a + b, 0);
    case "difference":
      return nums.reduce((a, b) => a - b);
    case "produit":
      return nums.reduce((a, b) => a * b, 1);
    case "moyenne":
      return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
    default:
      return 0;
  }
}

/** Recalcule tous les champs « calcul » du schéma (ordre du schéma → chaînage
 *  possible : un calcul peut dépendre d'un calcul précédent). Pur, sans mutation. */
export function recalculer(
  valeurs: Record<string, ValeurChamp>,
  schema: SchemaFormulaire,
): Record<string, ValeurChamp> {
  let out = valeurs;
  for (const c of schema) {
    if (c.type === "calcul" && c.calcul) {
      const r = calculerValeur(c.calcul, out);
      if (out[c.id] !== r) out = { ...out, [c.id]: r };
    }
  }
  return out;
}

/** Titre lisible dérivé d'une réponse : 1er champ texte renseigné, sinon vide
 *  (le serveur retombe alors sur la date). Borné à 80 caractères. */
export function titreReponse(
  schema: SchemaFormulaire,
  valeurs: Record<string, ValeurChamp>,
): string {
  for (const c of schema) {
    if (c.type === "texte" || c.type === "texteLong") {
      const v = valeurs[c.id];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 80);
    }
  }
  return "";
}
