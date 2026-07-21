import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatEuros, LIBELLE_CATEGORIE, titrePeriode } from "./model";
import type { DepenseVue, Periode } from "./model";
import { lireJustificatif } from "./stockage";

/* Assemble tous les justificatifs d'un mois en UN seul PDF, dans l'ordre des
 * n° de pièce du tableur. Chaque page porte son numéro : la correspondance
 * entre la ligne de l'Excel et la pièce jointe est immédiate, plus rien à
 * agrafer ni à annoter à la main.
 *
 * Le PDF accepte deux natures de justificatif :
 *  - une PHOTO (le cas courant) → une page A4 par photo, en-tête récapitulatif ;
 *  - un PDF déposé depuis un PC (facture) → ses pages sont recopiées telles
 *    quelles et tamponnées du n° de pièce, sans être ré-imagées (on ne dégrade
 *    jamais un document qui fait foi). */

const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = 36;
const HAUTEUR_ENTETE = 74;

const ENCRE = rgb(0.06, 0.09, 0.16);
const GRIS = rgb(0.42, 0.45, 0.5);
const TRAIT = rgb(0.85, 0.87, 0.9);

export interface OptionsPdf {
  nomComplet: string;
  periode: Periode;
  /** Dépenses complètes du mois, déjà triées — même ordre que l'Excel. */
  depenses: DepenseVue[];
  /** Chemins disque des justificatifs, par identifiant. */
  fichiers: Map<string, { chemin: string; mimeType: string }>;
}

/**
 * Helvetica est encodé en WinAnsi. Cela couvre le français en entier — accents,
 * mais aussi le SIGNE EURO, les tirets cadratins et les apostrophes typo, qui
 * vivent dans le bloc 0x80-0x9F de WinAnsi bien qu'ils soient hors Latin-1.
 * Les oublier remplacerait « 12,40 € » par « 12,40 ? » sur chaque page.
 * Tout ce qui sort de ce répertoire (emoji collé dans un descriptif…) devient
 * « ? » plutôt que de faire échouer la génération entière.
 */
const WINANSI_HORS_LATIN1 =
  "€‚ƒ„…†‡ˆ‰Š‹Œ" +
  "Ž‘’“”•–—˜™š›" +
  "œžŸ";

const HORS_REPERTOIRE = new RegExp(
  `[^\\x20-\\xFF\\n${WINANSI_HORS_LATIN1}]`,
  "g",
);

function ansi(s: string): string {
  return s.replace(HORS_REPERTOIRE, "?");
}

function tronquer(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export async function genererPdfJustificatifs(
  opts: OptionsPdf,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Justificatifs — ${titrePeriode(opts.periode)} — ${opts.nomComplet}`);
  const police = await pdf.embedFont(StandardFonts.Helvetica);
  const policeGrasse = await pdf.embedFont(StandardFonts.HelveticaBold);

  /* ------------------------------------------------------ page de sommaire */
  const sommaire = pdf.addPage([A4.largeur, A4.hauteur]);
  let y = A4.hauteur - MARGE - 14;
  sommaire.drawText(ansi("Justificatifs de note de frais"), {
    x: MARGE,
    y,
    size: 16,
    font: policeGrasse,
    color: ENCRE,
  });
  y -= 20;
  sommaire.drawText(
    ansi(`${opts.nomComplet} — ${titrePeriode(opts.periode)}`),
    { x: MARGE, y, size: 11, font: police, color: GRIS },
  );
  y -= 26;
  sommaire.drawLine({
    start: { x: MARGE, y },
    end: { x: A4.largeur - MARGE, y },
    thickness: 0.75,
    color: TRAIT,
  });
  y -= 20;

  const total = opts.depenses.reduce((s, d) => s + d.montantCents, 0);
  opts.depenses.forEach((d, i) => {
    if (y < MARGE + 40) return; // le sommaire tient sur une page : au-delà,
    // les pièces elles-mêmes font foi (chacune porte son numéro).
    const [, m, j] = d.date.split("-");
    sommaire.drawText(ansi(`${i + 1}`.padStart(2, " ")), {
      x: MARGE,
      y,
      size: 9,
      font: policeGrasse,
      color: ENCRE,
    });
    sommaire.drawText(ansi(`${j}/${m}`), {
      x: MARGE + 26,
      y,
      size: 9,
      font: police,
      color: GRIS,
    });
    sommaire.drawText(
      ansi(tronquer(LIBELLE_CATEGORIE[d.categorie], 34)),
      { x: MARGE + 62, y, size: 9, font: police, color: ENCRE },
    );
    sommaire.drawText(ansi(tronquer(d.descriptif || "—", 40)), {
      x: MARGE + 250,
      y,
      size: 9,
      font: police,
      color: GRIS,
    });
    const montant = formatEuros(d.montantCents);
    sommaire.drawText(ansi(montant), {
      x: A4.largeur - MARGE - police.widthOfTextAtSize(ansi(montant), 9),
      y,
      size: 9,
      font: police,
      color: ENCRE,
    });
    y -= 15;
  });

  y -= 6;
  sommaire.drawLine({
    start: { x: MARGE, y },
    end: { x: A4.largeur - MARGE, y },
    thickness: 0.75,
    color: TRAIT,
  });
  y -= 16;
  const libTotal = `Total — ${opts.depenses.length} pièce${opts.depenses.length > 1 ? "s" : ""}`;
  sommaire.drawText(ansi(libTotal), {
    x: MARGE,
    y,
    size: 10,
    font: policeGrasse,
    color: ENCRE,
  });
  const totalTxt = formatEuros(total);
  sommaire.drawText(ansi(totalTxt), {
    x: A4.largeur - MARGE - policeGrasse.widthOfTextAtSize(ansi(totalTxt), 10),
    y,
    size: 10,
    font: policeGrasse,
    color: ENCRE,
  });

  /* ------------------------------------------------- une entrée par dépense */
  for (const [index, d] of opts.depenses.entries()) {
    const numero = index + 1;
    for (const justif of d.justificatifs) {
      const meta = opts.fichiers.get(justif.id);
      if (!meta) continue;

      let binaire: Buffer;
      try {
        binaire = await lireJustificatif(meta.chemin);
      } catch {
        pageManquante(pdf, police, policeGrasse, numero, d, "fichier introuvable");
        continue;
      }

      if (meta.mimeType === "application/pdf") {
        await copierPdf(pdf, policeGrasse, binaire, numero, d);
        continue;
      }

      try {
        const image =
          meta.mimeType === "image/png"
            ? await pdf.embedPng(binaire)
            : await pdf.embedJpg(binaire);
        const page = pdf.addPage([A4.largeur, A4.hauteur]);
        dessinerEntete(page, police, policeGrasse, numero, d);

        const dispoL = A4.largeur - 2 * MARGE;
        const dispoH = A4.hauteur - 2 * MARGE - HAUTEUR_ENTETE;
        const ratio = Math.min(dispoL / image.width, dispoH / image.height, 1);
        const l = image.width * ratio;
        const h = image.height * ratio;
        page.drawImage(image, {
          x: (A4.largeur - l) / 2,
          y: MARGE + (dispoH - h) / 2,
          width: l,
          height: h,
        });
      } catch {
        pageManquante(
          pdf,
          police,
          policeGrasse,
          numero,
          d,
          `format non affichable (${meta.mimeType})`,
        );
      }
    }
  }

  return Buffer.from(await pdf.save());
}

type Page = ReturnType<PDFDocument["addPage"]>;
type Font = Awaited<ReturnType<PDFDocument["embedFont"]>>;

/** Bandeau d'identification en tête de page : n° de pièce, date, rubrique,
 *  montant, descriptif. Rend chaque page auto-portante si elle est détachée. */
function dessinerEntete(
  page: Page,
  police: Font,
  policeGrasse: Font,
  numero: number,
  d: DepenseVue,
) {
  const haut = A4.hauteur - MARGE;
  const [a, m, j] = d.date.split("-");

  page.drawRectangle({
    x: MARGE,
    y: haut - 30,
    width: 44,
    height: 30,
    color: rgb(0.11, 0.16, 0.42),
  });
  const num = `${numero}`;
  page.drawText(ansi(num), {
    x: MARGE + 22 - policeGrasse.widthOfTextAtSize(num, 16) / 2,
    y: haut - 22,
    size: 16,
    font: policeGrasse,
    color: rgb(1, 1, 1),
  });

  page.drawText(ansi(`Pièce n°${numero}`), {
    x: MARGE + 56,
    y: haut - 12,
    size: 12,
    font: policeGrasse,
    color: ENCRE,
  });
  page.drawText(
    ansi(`${j}/${m}/${a}  ·  ${LIBELLE_CATEGORIE[d.categorie]}  ·  ${formatEuros(d.montantCents)}`),
    { x: MARGE + 56, y: haut - 27, size: 9.5, font: police, color: GRIS },
  );

  if (d.descriptif.trim() || d.numeroAffaire.trim()) {
    const bas = [
      d.descriptif.trim(),
      d.numeroAffaire.trim() ? `affaire ${d.numeroAffaire.trim()}` : "",
    ]
      .filter(Boolean)
      .join("  ·  ");
    page.drawText(ansi(tronquer(bas, 110)), {
      x: MARGE,
      y: haut - 48,
      size: 9,
      font: police,
      color: GRIS,
    });
  }

  page.drawLine({
    start: { x: MARGE, y: haut - HAUTEUR_ENTETE + 14 },
    end: { x: A4.largeur - MARGE, y: haut - HAUTEUR_ENTETE + 14 },
    thickness: 0.75,
    color: TRAIT,
  });
}

/** Page de remplacement quand un binaire est illisible : on ne saute jamais une
 *  pièce en silence, sinon la numérotation ment. */
function pageManquante(
  pdf: PDFDocument,
  police: Font,
  policeGrasse: Font,
  numero: number,
  d: DepenseVue,
  raison: string,
) {
  const page = pdf.addPage([A4.largeur, A4.hauteur]);
  dessinerEntete(page, police, policeGrasse, numero, d);
  page.drawText(ansi(`Justificatif non affichable — ${raison}`), {
    x: MARGE,
    y: A4.hauteur / 2,
    size: 11,
    font: police,
    color: GRIS,
  });
}

/** Recopie les pages d'un justificatif PDF et les tamponne du n° de pièce. */
async function copierPdf(
  pdf: PDFDocument,
  policeGrasse: Font,
  binaire: Buffer,
  numero: number,
  d: DepenseVue,
) {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(binaire, { ignoreEncryption: true });
  } catch {
    return;
  }
  const pages = await pdf.copyPages(source, source.getPageIndices());
  for (const p of pages) {
    pdf.addPage(p);
    const { width, height } = p.getSize();
    const etiquette = `Pièce n°${numero}`;
    const l = policeGrasse.widthOfTextAtSize(etiquette, 10) + 14;
    p.drawRectangle({
      x: width - l - 12,
      y: height - 30,
      width: l,
      height: 20,
      color: rgb(0.11, 0.16, 0.42),
    });
    p.drawText(ansi(etiquette), {
      x: width - l - 5,
      y: height - 24,
      size: 10,
      font: policeGrasse,
      color: rgb(1, 1, 1),
    });
  }
  void d;
}

export function nomFichierPdf(nomComplet: string, periode: Periode): string {
  const personne = nomComplet
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
  return `Justificatifs_${personne}_${periode}.pdf`;
}
