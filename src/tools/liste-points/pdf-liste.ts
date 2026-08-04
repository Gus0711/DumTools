// Génération d'un PDF vectoriel de la liste de points, entièrement côté
// navigateur (pdfmake, chargé à la demande via import dynamique → pas de poids
// sur le bundle initial, aucun Chromium serveur).
//
// Le document reprend la charte de l'impression écran (impression-print.css) :
// bandeau or/marine, cartouche, bandeau de synthèse, tableau à en-tête marine,
// titres de section au laiton, sous-total PAR SECTION + total général. Seule
// différence assumée avec l'aperçu écran : pas de sous-total par page —
// pdfmake pagine lui-même, il ne sait pas ce qu'il vient de poser sur la page.
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
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
const LAITON_DOUX = "#faf4e4";
const MUET = "#7b8794";
const LIGNE = "#d7dee6";
const BLEU_DOUX = "#eef2f7";

/** Marges de page : le tableau dispose donc de 523 pt de large. */
const MARGE_H = 36;
const LARGEUR_UTILE = 595.28 - 2 * MARGE_H;

const LIB_SYNTHESE: Record<IoType, string> = {
  AI: "entrées\nanalogiques",
  DI: "entrées\nlogiques",
  AO: "sorties\nanalogiques",
  DO: "sorties\nlogiques",
  COM: "objets\ncommunicants",
};

function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("fr-FR");
}
function emptyIo(): Io {
  return { AI: 0, DI: 0, AO: 0, DO: 0, COM: 0 };
}
function totalES(somme: Io): number {
  return ES_TYPES.reduce((s, k) => s + somme[k], 0);
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

// --- Lignes du tableau ------------------------------------------------------

function ligneSection(nom: string): TableCell[] {
  return [
    {
      text: nom.toUpperCase(),
      colSpan: 8,
      fillColor: LAITON_DOUX,
      color: LAITON,
      bold: true,
      fontSize: 6.6,
      characterSpacing: 0.6,
      margin: [3, 3, 3, 3],
    },
    {}, {}, {}, {}, {}, {}, {},
  ];
}

function lignePoint(r: PointRow, n: number): TableCell[] {
  // Le signal complète le texte libre ; « D » (contact sec) n'apprend rien de
  // plus que la colonne DI/DO — on ne l'imprime pas.
  const signal = r.signal && r.signal !== "D" ? r.signal : "";
  const com = Boolean(r.io?.COM);
  const libre: Content[] = [];
  if (signal) libre.push({ text: signal, color: com ? IO_HEX.COM : MUET, bold: com, fontSize: 7 });
  if (signal && r.note) libre.push({ text: " · ", color: MUET });
  if (r.note) libre.push({ text: r.note, color: MUET });

  return [
    { text: String(n), alignment: "center", color: MUET, fontSize: 6.8, margin: [0, 1.5, 0, 1.5] },
    { text: r.nom || "", margin: [3, 1.5, 3, 1.5] },
    { text: libre, fontSize: 7.6, margin: [3, 1.5, 3, 1.5] },
    ...IO_TYPES.map((t): TableCell => (r.io?.[t] ? pastille(t) : { text: "" })),
  ];
}

/** Pastille E/S : un aplat de la teinte du signal, à la taille du sigle et non
 *  de la cellule — d'où la table imbriquée, pdfmake ne sachant pas remplir
 *  autrement qu'une cellule entière. */
function pastille(t: IoType): TableCell {
  return {
    margin: [5, 1, 5, 1],
    table: {
      widths: ["*"],
      body: [[{ text: t, fillColor: IO_HEX[t], color: "#ffffff", bold: true, alignment: "center", fontSize: 6.4, margin: [0, 0.5, 0, 0.5] }]],
    },
    layout: "noBorders",
  };
}

function ligneSousTotal(nom: string, somme: Io): TableCell[] {
  return [
    {
      text: `Sous-total · ${nom} — ${totalES(somme)} E/S`,
      colSpan: 3,
      alignment: "right",
      italics: true,
      color: MUET,
      fontSize: 7,
      margin: [3, 2, 3, 2],
    },
    {}, {},
    ...IO_TYPES.map((t): TableCell => ({
      text: somme[t] ? String(somme[t]) : "",
      alignment: "center",
      bold: true,
      color: BLEU,
      fontSize: 7.4,
      margin: [0, 2, 0, 2],
    })),
  ];
}

function ligneTotalGeneral(somme: Io): TableCell[] {
  return [
    {
      text: `Total général — ${totalES(somme)} E/S physiques`,
      colSpan: 3,
      bold: true,
      color: "#ffffff",
      fillColor: BLEU,
      fontSize: 8,
      margin: [3, 4, 3, 4],
    },
    {}, {},
    ...IO_TYPES.map((t): TableCell => ({
      text: String(somme[t] || 0),
      alignment: "center",
      bold: true,
      color: "#ffffff",
      fillColor: BLEU,
      fontSize: 9.5,
      margin: [0, 3, 0, 3],
    })),
  ];
}

// --- Cartouche & synthèse ---------------------------------------------------

function cartouche(a: ListePdfArgs, logo: string | null): Content[] {
  const titre = a.chantierNom || a.clientNom || "Liste de points";
  const soustitre = a.chantierNom ? a.clientNom : "";
  const refs: [string, string][] = [
    ["Réf. affaire", a.numeroWhy || ""],
    ["Projet", a.projetNom || ""],
    ["Version", a.version || ""],
    ["Établie le", fmtDate(a.date)],
    ["Automate", a.automate || ""],
  ];
  const meta: Content[] = [];
  for (const [k, v] of refs.filter(([, v]) => v)) {
    if (meta.length) meta.push({ text: "     ", color: MUET });
    meta.push({ text: k, bold: true, color: BLEU }, { text: ` · ${v}`, color: MUET });
  }

  const marque: Content[] = [];
  if (logo) marque.push({ image: logo, fit: [44, 62], alignment: "right" });
  if (a.numeroWhy) {
    marque.push({
      columns: [
        { text: "", width: "*" },
        {
          width: "auto",
          table: { body: [[{ text: a.numeroWhy, color: "#ffffff", fillColor: BLEU, fontSize: 7.4, bold: true, margin: [5, 2, 5, 2] }]] },
          layout: "noBorders",
        },
      ],
      margin: [0, 5, 0, 0],
    });
  }

  return [
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "LISTE DE POINTS · GTB / GTC", color: LAITON, bold: true, fontSize: 7, characterSpacing: 1.1 },
            { text: titre, color: BLEU, bold: true, fontSize: 17, margin: [0, 5, 0, 0] },
            ...(soustitre ? [{ text: soustitre, color: BLEU, bold: true, fontSize: 9.5, margin: [0, 3, 0, 0] } as Content] : []),
          ],
        },
        { width: 66, stack: marque },
      ],
      columnGap: 16,
    },
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: LARGEUR_UTILE, y2: 0, lineWidth: 1.6, lineColor: BLEU }],
      margin: [0, 12, 0, 7],
    },
    { text: meta, fontSize: 7.6, margin: [0, 0, 0, 12] },
  ];
}

function synthese(grand: Io, nbPoints: number): Content {
  const largeur = LARGEUR_UTILE / 7;
  // Le libellé tient TOUJOURS sur deux lignes : sans quoi les chiffres d'une
  // case à libellé court remonteraient au-dessus de ceux d'à côté.
  const cellule = (teinte: string, libelle: string, valeur: number, fond?: string): TableCell => ({
    fillColor: fond,
    margin: [0, 0, 0, 0],
    stack: [
      { canvas: [{ type: "rect", x: 0, y: 0, w: largeur, h: 2.6, color: teinte }] },
      { text: libelle, color: MUET, bold: true, fontSize: 5.6, characterSpacing: 0.3, lineHeight: 1.15, margin: [5, 4, 3, 2] },
      { text: String(valeur), color: BLEU, bold: true, fontSize: 14, margin: [5, 0, 3, 5] },
    ],
  });

  return {
    table: {
      widths: Array<number>(7).fill(largeur),
      body: [
        [
          ...IO_TYPES.map((k) => cellule(IO_HEX[k], `${k} · ${LIB_SYNTHESE[k]}`, grand[k])),
          cellule(BLEU, "POINTS\nLISTÉS", nbPoints, BLEU_DOUX),
          cellule(BLEU, "E/S\nPHYSIQUES", totalES(grand), BLEU_DOUX),
        ],
      ],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.7 : 0),
      vLineWidth: () => 0.7,
      hLineColor: () => LIGNE,
      vLineColor: () => LIGNE,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 14],
  };
}

export interface ListePdfArgs {
  clientNom: string;
  chantierNom: string;
  date: string | null;
  rows: PointRow[];
  /** Référence de l'affaire dans WhySoft — estampille du document. */
  numeroWhy?: string;
  projetNom?: string;
  version?: string;
  automate?: string;
}

/** Construit le PDF de la liste de points et renvoie le Blob. */
export async function genererListePdf(args: ListePdfArgs): Promise<Blob> {
  const { clientNom, chantierNom, rows } = args;
  const hasSections = rows.some((r) => r.kind === "section");

  // En-tête + filet des 5 signaux (2 lignes répétées en tête de chaque page).
  const entete: TableCell[] = [
    { text: "N°", alignment: "center", bold: true, fontSize: 6.6, color: "#ffffff", fillColor: BLEU, margin: [0, 3, 0, 3] },
    { text: "Nom du point", bold: true, fontSize: 6.6, color: "#ffffff", fillColor: BLEU, characterSpacing: 0.6, margin: [3, 3, 3, 3] },
    { text: "Texte libre", bold: true, fontSize: 6.6, color: "#ffffff", fillColor: BLEU, characterSpacing: 0.6, margin: [3, 3, 3, 3] },
    ...IO_TYPES.map((t): TableCell => ({
      text: t,
      alignment: "center",
      bold: true,
      fontSize: 6.6,
      color: "#ffffff",
      fillColor: BLEU,
      margin: [0, 3, 0, 3],
    })),
  ];
  const filetSignal: TableCell[] = [
    { text: "", fillColor: BLEU, fontSize: 1 },
    { text: "", fillColor: BLEU, fontSize: 1 },
    { text: "", fillColor: BLEU, fontSize: 1 },
    ...IO_TYPES.map((t): TableCell => ({ text: "", fillColor: IO_HEX[t], fontSize: 1 })),
  ];

  const body: TableCell[][] = [entete, filetSignal];
  /** Indices des lignes à griser : un point sur deux, sections et sous-totaux
   *  n'entrant pas dans le compte (ils portent déjà leur propre fond). */
  const zebre = new Set<number>();

  let acc = emptyIo();
  let n = 0;
  let sectionLabel = "";
  let sectionHasContent = false;

  const clore = () => {
    if (hasSections && sectionHasContent && sectionLabel) {
      body.push(ligneSousTotal(sectionLabel, acc));
    }
    acc = emptyIo();
    sectionHasContent = false;
  };

  for (const r of rows) {
    if (r.kind === "section") {
      clore();
      sectionLabel = r.nom || "";
      body.push(ligneSection(r.nom || ""));
    } else {
      n += 1;
      if (n % 2 === 0) zebre.add(body.length);
      body.push(lignePoint(r, n));
      for (const k of IO_TYPES) acc[k] += r.io?.[k] ? 1 : 0;
      sectionHasContent = true;
    }
  }
  clore();

  const grand = emptyIo();
  let nbPoints = 0;
  for (const r of rows) {
    if (r.kind !== "point") continue;
    if (r.io) for (const k of IO_TYPES) grand[k] += r.io[k] ? 1 : 0;
    nbPoints += 1;
  }
  body.push(ligneTotalGeneral(grand));
  const derniere = body.length - 1;

  const logo = await logoDataUrl();
  const titre = chantierNom || clientNom || "Liste de points";
  const suite = [titre, clientNom && chantierNom ? clientNom : ""].filter(Boolean).join("  ·  ");

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [MARGE_H, 54, MARGE_H, 42],
    defaultStyle: { fontSize: 8.4, color: "#1b2733" },
    content: [
      ...cartouche(args, logo),
      synthese(grand, nbPoints),
      {
        table: { headerRows: 2, widths: [20, 158, "*", 30, 30, 30, 30, 30], body },
        layout: {
          // Filet fin sous chaque ligne ; rien sous l'en-tête (le filet des
          // signaux joue ce rôle) ni au-dessus du total général (aplat marine).
          hLineWidth: (i: number) => (i <= 2 || i === derniere || i === derniere + 1 ? 0 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => LIGNE,
          paddingTop: (i: number) => (i === 1 ? 0 : 1),
          paddingBottom: (i: number) => (i === 1 ? 1.6 : 1),
          paddingLeft: () => 2,
          paddingRight: () => 2,
          fillColor: (i: number) => (zebre.has(i) ? "#fafbfc" : null),
        },
      },
    ],
    // Bandeau d'identité sur toutes les pages + rappel de l'affaire dès la 2e.
    header: (currentPage: number) => {
      const bandeau: Content = {
        canvas: [
          { type: "rect", x: 0, y: 0, w: LARGEUR_UTILE * 0.3, h: 3, color: LAITON },
          { type: "rect", x: LARGEUR_UTILE * 0.3, y: 0, w: LARGEUR_UTILE * 0.7, h: 3, color: BLEU },
        ],
      };
      if (currentPage === 1) return { stack: [bandeau], margin: [MARGE_H, 26, MARGE_H, 0] };
      return {
        stack: [
          bandeau,
          {
            columns: [
              { text: "LISTE DE POINTS · GTB / GTC", color: LAITON, bold: true, fontSize: 6.4, characterSpacing: 1, width: "auto" },
              { text: suite, color: BLEU, bold: true, fontSize: 7.6, width: "*", margin: [12, 0, 0, 0] },
              { text: args.numeroWhy || "", color: MUET, fontSize: 7.2, alignment: "right", width: "auto" },
            ],
            margin: [0, 7, 0, 0],
          },
        ],
        margin: [MARGE_H, 20, MARGE_H, 0],
      };
    },
    footer: (currentPage: number, pageCount: number) => ({
      margin: [MARGE_H, 10, MARGE_H, 0],
      stack: [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: LARGEUR_UTILE, y2: 0, lineWidth: 0.5, lineColor: LIGNE }] },
        {
          columns: [
            { text: [{ text: "DUMORTIER", bold: true, color: BLEU }, { text: " — Groupe Fareneït · Liste de points GTB / GTC" }], width: "*" },
            { text: [titre, args.numeroWhy ? `  ·  ${args.numeroWhy}` : ""].join(""), alignment: "center", width: "*" },
            { text: `Page ${currentPage} / ${pageCount}`, alignment: "right", width: "auto" },
          ],
          fontSize: 6.4,
          color: MUET,
          margin: [0, 5, 0, 0],
        },
      ],
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
