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
}

export function emptyIo(): Io {
  return { AI: 0, DI: 0, AO: 0, DO: 0, COM: 0 };
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

export const IO_LABELS: Record<IoType, string> = {
  AI: "Entrée analogique",
  DI: "Entrée logique",
  AO: "Sortie analogique",
  DO: "Sortie logique",
  COM: "Communication",
};
