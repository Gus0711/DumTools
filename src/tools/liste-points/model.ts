// Modèle de données de l'outil « Liste de Points GTB » (partagé client/serveur).

export const IO_TYPES = ["AI", "DI", "AO", "DO", "COM"] as const;
export type IoType = (typeof IO_TYPES)[number];

/** Types comptés dans le total « E/S physiques » (COM = communication, exclu). */
export const ES_TYPES = ["AI", "DI", "AO", "DO"] as const;

/** Compteurs 0/1 par type d'E/S pour un point. */
export type Io = Record<IoType, number>;

export interface PointRow {
  id: string;
  kind: "point" | "section";
  nom: string;
  /** Texte libre (points uniquement). */
  note?: string;
  /** E/S activées (points uniquement). */
  io?: Io;
  /** Signal électrique par défaut (issu du catalogue) — seed de l'affectation. */
  signal?: string;
}

// --- Signaux électriques (types de bornes Distech) --------------------------
// Alignés sur les énumérations Distech (input_signal_types_t / output_signal_types_t)
// et les sondes résistives supportées par une entrée universelle (Thermistors.xml).

/** Entrées : familles de signal + sondes résistives. "D" = contact sec (TOR). */
export const INPUT_SIGNALS = ["T", "PT1000", "NI1000", "10K Type II", "10K Type III", "0-10V", "4-20mA", "D"];
/** Sorties : DIGITAL ("D"), PWM, ANALOG 0-10V / 4-20mA. */
export const OUTPUT_SIGNALS = ["0-10V", "4-20mA", "PWM", "D"];
/** COM : protocoles de communication (bus / réseau) — le « signal » d'un point
 *  communicant. Pas de borne physique associée (exclu du total E/S). */
export const COM_SIGNALS = ["Modbus RTU", "Modbus TCP", "BACnet MS/TP", "BACnet IP", "M-Bus", "LoRaWAN", "KNX", "TCP/IP"];

/** Signaux proposés pour un type d'E/S (entrées ↔ INPUT, sorties ↔ OUTPUT, COM ↔ protocoles). */
export function signalsForType(type: IoType | string): string[] {
  if (type === "AI" || type === "DI") return INPUT_SIGNALS;
  if (type === "AO" || type === "DO") return OUTPUT_SIGNALS;
  if (type === "COM") return COM_SIGNALS;
  return [];
}

/**
 * Libellé humain d'un signal. La valeur canonique du TOR reste "D" (sentinelle
 * de détection TOR dans le code + données déjà stockées), mais on l'AFFICHE
 * « Digital ». Les autres signaux sont affichés tels quels.
 */
export function signalLabel(signal: string | null | undefined): string {
  return signal === "D" ? "Digital" : signal ?? "";
}

/**
 * Signal par défaut d'un point du catalogue selon son nom + type, pour un
 * pré-remplissage cohérent avec le matériel Distech :
 * - TOR (DI/DO) → "D" (contact sec / commande logique) ;
 * - sortie analogique (AO) → 0-10V ;
 * - entrée analogique (AI) : sonde de température → PT1000 (standard Distech),
 *   sinon 0-10V (capteur pression, CO2, hygrométrie…) ;
 * - COM → aucun signal (pas de borne physique).
 */
export function signalCatalogueParDefaut(nom: string, type: string): string | null {
  const t = String(type || "").toUpperCase();
  if (t === "DI" || t === "DO") return "D";
  if (t === "AO") return "0-10V";
  if (t === "COM") return null;
  if (t === "AI") {
    const up = String(nom || "").toUpperCase();
    const estTemperature = /\bSONDE\b/.test(up) && !/CO2|PRESSION|HYGRO|QUALIT|ROSEE|CONDENS/.test(up);
    return estTemperature ? "PT1000" : "0-10V";
  }
  return null;
}

export function emptyIo(): Io {
  return { AI: 0, DI: 0, AO: 0, DO: 0, COM: 0 };
}

/** Un point d'un modèle (nom + type d'E/S + signal par défaut). */
export interface ModelePoint {
  nom: string;
  type: IoType;
  /** Signal électrique par défaut (repris du catalogue). */
  signal?: string;
}

/** Un modèle : section pré-remplie de points, insérable en un clic. */
export interface ModeleDef {
  nom: string;
  points: ModelePoint[];
}

export interface Totals extends Io {
  /** Nombre de points ayant au moins une E/S physique. */
  points: number;
  /** Total des E/S physiques (COM exclu). */
  es: number;
}

export function computeTotals(rows: PointRow[]): Totals {
  const t: Io = emptyIo();
  let points = 0;
  for (const r of rows) {
    if (r.kind !== "point" || !r.io) continue;
    for (const k of IO_TYPES) t[k] += r.io[k] ? 1 : 0;
    if (ES_TYPES.some((k) => r.io![k])) points++;
  }
  const es = ES_TYPES.reduce((s, k) => s + t[k], 0);
  return { ...t, points, es };
}

// --- Convention de nommage : générique au nom, local au texte libre ---------
// Le catalogue est le VOCABULAIRE de l'entreprise : une entrée = un type de
// point réutilisable d'une affaire à l'autre. Ce qui distingue deux points
// identiques (le local, la zone, le repère) vit dans le texte libre de la
// ligne. Sans cette règle le catalogue enfle d'un point par local, la BOM —
// qui apparie sur le nom EXACT — ne retrouve plus sa nomenclature, et la
// recherche rend un libellé unique par affaire.

/** Mots de local/zone : leur présence dans un nom trahit un point « localisé ». */
const MOTS_DE_LOCAL =
  /\b(salles?|bureaux?|cuisines?|sanitaires?|hall|vestiaires?|p[ée]risco(?:laire)?|[ée]tage|dortoir|cantine|r[ée]fectoire|couloir|d[ée]gagement|pr[ée]au|classe|gar[çc]ons?|filles?|infirmerie|laverie|r[ée]serve|rangement|douche|logement|mairie|m[ée]diath[èe]que|conseil|secr[ée]tariat|direction|accueil|locaux?|zone|tribune|gymnase)\b/i;

/**
 * Un nom de point porte-t-il un local ? Renvoie la raison, ou null s'il est
 * bien générique.
 *
 * Deux indices : un mot de local, ou un complément après un tiret cadratin
 * (« Sonde ambiance Ss Fil — Bar »). L'indice numérique seul ne compte PAS :
 * « Commande pompe 1 », « Defaut chaudière 2 » sont des repères d'ÉQUIPEMENT,
 * parfaitement légitimes dans le vocabulaire.
 */
export function nomLocalise(nom: string): string | null {
  // Les soulignés des noms importés du GFX (« ODM_Dalles_Secretariat ») sont des
  // caractères de mot : sans cette normalisation, \b ne coupe pas et le local
  // passe inaperçu.
  const m = nom.replace(/_/g, " ").match(MOTS_DE_LOCAL);
  if (m) return `il contient « ${m[0]} », qui désigne un local`;
  if (/\s[—–]\s\S/.test(nom)) return "il porte un complément après un tiret cadratin";
  return null;
}

export const IO_LABELS: Record<IoType, string> = {
  AI: "Entrée analogique",
  DI: "Entrée logique",
  AO: "Sortie analogique",
  DO: "Sortie logique",
  COM: "Communication",
};
