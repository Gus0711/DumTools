// Export des scans — CSV (séparateur « ; » + BOM → double-clic = Excel FR) et
// copie TSV (collage direct dans un tableur). Client-safe.
//
// La date est ÉCLATÉE en six colonnes (Date, Heure, Jour, Semaine, Mois, Année)
// au lieu de l'unique horodatage français d'avant. C'est tout l'intérêt : Excel
// reconnaît `Date` comme une vraie date, et `Semaine`/`Mois`/`Année` servent
// directement d'axes de tableau croisé dynamique, sans retoucher le fichier.
//
// La colonne de référence est `scanneLe` (le scan sur l'appareil). `createdAt`
// est conservé en dernière colonne : quand les deux diffèrent, c'est qu'un
// enregistrement a échoué puis été relancé, et on veut pouvoir le voir.

import { CHAMPS_MODEM, formatLabel, estModem } from "./model";
import type { ModemScanRow } from "./queries";

import {
  cleAnnee,
  cleMois,
  cleSemaine,
  nomJourSemaine,
} from "./periodes";

/**
 * Ce dont l'export a besoin d'une ligne. Volontairement plus large que
 * `ModemScanRow` sur les photos (seul leur nombre compte ici) : le tableau les
 * enrichit d'un état d'envoi côté client, et les deux formes doivent passer.
 */
export type LigneExportable = Omit<ModemScanRow, "photos"> & {
  photos: { id: string }[];
};

const fmtDateFr = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtHeure = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Horodatage court affiché dans le tableau (`28/07/26 14:32`). */
export function fmtDateHeure(d: Date): string {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const EN_TETES = [
  "Date",
  "Heure",
  "Jour",
  "Semaine",
  "Mois",
  "Année",
  "Type",
  "Contenu",
  ...CHAMPS_MODEM.map((c) => c.libelle),
  "Groupe",
  "Affaire",
  "N° Why",
  "Note",
  "Photos",
  "Par",
  "Enregistré le",
];

export function celluleValeurs(l: LigneExportable): string[] {
  const d = new Date(l.scanneLe);
  return [
    fmtDateFr.format(d),
    fmtHeure.format(d),
    nomJourSemaine(d),
    cleSemaine(d),
    cleMois(d),
    cleAnnee(d),
    formatLabel(l.format, l),
    l.raw,
    ...CHAMPS_MODEM.map((c) => l[c.cle] ?? ""),
    l.groupe ?? "",
    l.chantierNom ?? "",
    l.chantierWhy ?? "",
    l.note ?? "",
    // Le nombre, pas les URL : un lien vers une route authentifiée n'a aucune
    // valeur dans un tableur. Les photos se consultent dans l'outil.
    l.photos.length ? String(l.photos.length) : "",
    l.auteur ?? "",
    fmtDateHeure(l.createdAt),
  ];
}

/**
 * Neutralise l'injection de formule : un tableur interprète une cellule qui
 * commence par `=`, `+` ou `@`. Le contenu d'un QR est arbitraire et l'export
 * circule entre collègues — on préfixe d'une apostrophe, qu'Excel absorbe.
 * `-` est volontairement laissé passer (nombres négatifs légitimes).
 */
function neutraliser(v: string): string {
  return /^[=+@\t\r]/.test(v) ? `'${v}` : v;
}

function csvCell(v: string): string {
  const s = neutraliser(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Nom de fichier sûr, dérivé du libellé de ce qu'on exporte. */
function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "scans"
  );
}

/** Déclenche le téléchargement du CSV. `libelle` nomme le fichier. */
export function telechargerCsv(rows: LigneExportable[], libelle = "scans") {
  const contenu = [EN_TETES, ...rows.map(celluleValeurs)]
    .map((r) => r.map(csvCell).join(";"))
    .join("\r\n");
  const blob = new Blob(["﻿" + contenu], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scans-${slug(libelle)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Contenu TSV (presse-papier → collage direct dans un tableur). */
export function versTsv(rows: LigneExportable[]): string {
  return [EN_TETES, ...rows.map(celluleValeurs)]
    .map((r) => r.map((c) => neutraliser(c).replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

/** Résumé d'un lot de scans, affiché dans les en-têtes de groupe. */
export function resumeLot(rows: LigneExportable[]): {
  modems: number;
  affaires: number;
  photos: number;
} {
  const affaires = new Set<string>();
  let modems = 0;
  let photos = 0;
  for (const r of rows) {
    if (estModem(r)) modems++;
    if (r.chantierId) affaires.add(r.chantierId);
    photos += r.photos.length;
  }
  return { modems, affaires: affaires.size, photos };
}
