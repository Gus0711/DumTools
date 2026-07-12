// Génération d'un PDF vectoriel de la liste de points, entièrement côté
// navigateur (pdfmake, chargé à la demande via import dynamique → pas de poids
// sur le bundle initial, aucun Chromium serveur). Sous-totaux PAR SECTION +
// total général. Le rendu est propre mais volontairement plus simple que la vue
// d'impression écran (pas de sous-total par page).
import type { TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { ES_TYPES, IO_TYPES, type Io, type IoType, type PointRow } from "./model";

const IO_HEX: Record<IoType, string> = {
  AI: "#1f6feb",
  DI: "#b4690e",
  AO: "#7b41c9",
  DO: "#1a8a4a",
  COM: "#0d8c97",
};

const BLEU = "#003765";
const LAITON = "#c79213";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("fr-FR");
}
function emptyIo(): Io {
  return { AI: 0, DI: 0, AO: 0, DO: 0, COM: 0 };
}
function estPoint(r: PointRow): boolean {
  return r.kind === "point" && ES_TYPES.some((k) => Boolean(r.io?.[k]));
}

/** Charge le logo Dumortier et le convertit en data URL (pdfmake exige un data
 *  URI pour les images). Renvoie null si indisponible (le PDF reste valide). */
async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/logo-dumortier.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function sectionRow(nom: string): TableCell[] {
  return [
    { text: nom, colSpan: 7, fillColor: "#eef1f6", bold: true, color: BLEU, margin: [3, 2, 3, 2] },
    {}, {}, {}, {}, {}, {},
  ];
}

function pointRow(r: PointRow): TableCell[] {
  const note =
    (r.io?.COM && r.signal ? r.signal + (r.note ? " · " : "") : "") + (r.note || "");
  return [
    { text: r.nom || "", margin: [3, 1, 3, 1] },
    { text: note, color: "#555", margin: [3, 1, 3, 1] },
    ...IO_TYPES.map((t): TableCell =>
      r.io?.[t]
        ? { text: t, fillColor: IO_HEX[t], color: "#ffffff", bold: true, alignment: "center", fontSize: 7 }
        : { text: "" },
    ),
  ];
}

function totalRow(label: string, sum: Io, grand: boolean): TableCell[] {
  const fill = grand ? "#eef1f6" : undefined;
  const color = grand ? BLEU : "#333";
  return [
    { text: label, colSpan: 2, bold: true, fontSize: 8, color, fillColor: fill, margin: [3, 2, 3, 2] },
    {},
    ...IO_TYPES.map((t): TableCell => ({
      text: String(sum[t] || 0),
      alignment: "center",
      bold: true,
      fontSize: 8,
      color,
      fillColor: fill,
    })),
  ];
}

export interface ListePdfArgs {
  clientNom: string;
  chantierNom: string;
  date: string | null;
  rows: PointRow[];
}

/** Construit le PDF de la liste de points et renvoie le Blob. */
export async function genererListePdf(args: ListePdfArgs): Promise<Blob> {
  const { clientNom, chantierNom, date, rows } = args;
  const hasSections = rows.some((r) => r.kind === "section");

  const head: TableCell[] = [
    { text: "Nom du point", bold: true, fontSize: 8 },
    { text: "Texte libre", bold: true, fontSize: 8 },
    ...IO_TYPES.map((t): TableCell => ({ text: t, bold: true, alignment: "center", fontSize: 8 })),
  ];
  const body: TableCell[][] = [head];

  let acc = emptyIo();
  let accPts = 0;
  let sectionLabel = "";
  let sectionHasContent = false;

  const flush = () => {
    if (hasSections && sectionHasContent) {
      body.push(
        totalRow(`Sous-total${sectionLabel ? ` · ${sectionLabel}` : ""} — ${accPts} pt${accPts > 1 ? "s" : ""}`, acc, false),
      );
    }
    acc = emptyIo();
    accPts = 0;
    sectionHasContent = false;
  };

  for (const r of rows) {
    if (r.kind === "section") {
      flush();
      sectionLabel = r.nom || "";
      body.push(sectionRow(r.nom || ""));
    } else {
      body.push(pointRow(r));
      for (const k of IO_TYPES) acc[k] += r.io?.[k] ? 1 : 0;
      if (estPoint(r)) accPts++;
      sectionHasContent = true;
    }
  }
  flush();

  const grand = emptyIo();
  let grandPts = 0;
  for (const r of rows) {
    if (r.kind === "point" && r.io) {
      for (const k of IO_TYPES) grand[k] += r.io[k] ? 1 : 0;
      if (estPoint(r)) grandPts++;
    }
  }
  const es = ES_TYPES.reduce((s, k) => s + grand[k], 0);
  body.push(totalRow(`Total général — ${es} E/S · ${grandPts} pt${grandPts > 1 ? "s" : ""}`, grand, true));

  const logo = await logoDataUrl();

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 40, 36, 44],
    defaultStyle: { fontSize: 9 },
    content: [
      {
        columns: [
          logo ? { image: logo, width: 120 } : { text: "" },
          { text: fmtDate(date), alignment: "right", fontSize: 9, color: "#555", margin: [0, 6, 0, 0] },
        ],
      },
      { text: "Liste de Points · GTB / GTC", color: LAITON, bold: true, fontSize: 9, characterSpacing: 1, margin: [0, 10, 0, 0] },
      { text: clientNom || "—", color: BLEU, bold: true, fontSize: 16 },
      { text: chantierNom || "—", color: "#333", fontSize: 10, margin: [0, 1, 0, 12] },
      {
        table: { headerRows: 1, widths: ["*", "*", 16, 16, 16, 16, 22], body },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
          vLineWidth: () => 0,
          hLineColor: (i: number) => (i === 1 ? BLEU : "#e5e8ee"),
          paddingTop: () => 1.5,
          paddingBottom: () => 1.5,
        },
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 8,
      color: "#999999",
      margin: [0, 6, 0, 0],
    }),
  };

  const pdfMakeMod = await import("pdfmake/build/pdfmake");
  const fontsMod = await import("pdfmake/build/vfs_fonts");
  const pdfMake = ((pdfMakeMod as { default?: unknown }).default ?? pdfMakeMod) as {
    vfs: unknown;
    createPdf: (d: TDocumentDefinitions) => { getBlob: (cb: (b: Blob) => void) => void };
  };
  const fonts = (fontsMod as { default?: unknown }).default ?? fontsMod;
  pdfMake.vfs = (fonts as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ?? fonts;

  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBlob((blob: Blob) => resolve(blob));
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Génération PDF impossible"));
    }
  });
}
