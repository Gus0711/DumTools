// Empreinte stable du contenu imprimé de la liste, pour détecter une
// modification depuis la dernière sauvegarde kDrive. Client-safe, non
// cryptographique (FNV-1a 32 bits) — sert uniquement à comparer deux états.
import { IO_TYPES, type PointRow } from "./model";

/** Empreinte FNV-1a 32 bits (hex) d'une chaîne. Non cryptographique. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashListe(
  rows: PointRow[],
  clientNom: string,
  chantierNom: string,
  date: string | null,
): string {
  return fnv1a(
    JSON.stringify({
      c: clientNom ?? "",
      h: chantierNom ?? "",
      d: date ?? "",
      r: (rows ?? []).map((r) => ({
        k: r.kind,
        n: r.nom ?? "",
        t: r.note ?? "",
        s: r.signal ?? "",
        io: r.io ? IO_TYPES.map((k) => (r.io![k] ? 1 : 0)) : null,
      })),
    }),
  );
}
