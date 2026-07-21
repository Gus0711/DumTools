/* Export PDF d'une réponse — « document » A4 façon Projet GTB (apercu-pdf.ts),
 * mais en mieux : au lieu de trancher une capture unique (qui coupe au milieu
 * d'un champ), on capture CHAQUE champ comme un bloc INDIVISIBLE (html2canvas-pro)
 * et on les empile page par page — un champ n'est jamais scindé. L'EN-TÊTE (logo
 * Dumortier + titre + méta) et le PIED (n° de page, mentions) sont dessinés en
 * VECTORIEL par jsPDF → texte net, non rasterisé. Libs importées dynamiquement
 * (hors bundle initial). Les blocs à capturer portent l'attribut [data-bloc]. */

export interface MetaReponse {
  formulaireNom: string;
  titre: string;
  auteur?: string | null;
  dateStr: string;
  /** Affaire liée (libellé d'un champ « référence »), si présente. */
  affaire?: string | null;
}

const NAVY: [number, number, number] = [43, 58, 143]; // #2b3a8f (bleu Dumortier)
const ORANGE: [number, number, number] = [238, 125, 27]; // #ee7d1b (orange Dumortier)
const GRIS: [number, number, number] = [107, 114, 128];
const TRAIT: [number, number, number] = [221, 226, 232];

/** Charge une image same-origin en dataURL + dimensions naturelles (logo). */
async function chargerImage(
  src: string,
): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const dim = await new Promise<{ w: number; h: number }>((resolve) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
      im.onerror = () => resolve({ w: 1, h: 1 });
      im.src = data;
    });
    return { data, ...dim };
  } catch {
    return null;
  }
}

/** Attend que toutes les images du conteneur soient chargées avant capture. */
async function attendreImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((im) =>
      im.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            im.onload = () => res();
            im.onerror = () => res();
          }),
    ),
  );
}

export async function genererReponsePdf(
  root: HTMLElement,
  meta: MetaReponse,
): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  await attendreImages(root);

  const blocs = Array.from(root.querySelectorAll<HTMLElement>("[data-bloc]"));
  const logo = await chargerImage("/logo-dumortier.png");

  const W = 210;
  const H = 297;
  const ML = 15;
  const CW = W - ML * 2; // largeur de contenu (180 mm)
  const GAP = 4;
  const footerY = H - 12;
  const contentBottom = H - 16;
  const pt = (n: number) => n * 0.3528; // pt → mm

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  let creees = 0;
  let pageStartY = 0;

  function enTetePage1(): number {
    let y = 13;
    if (logo) {
      const h = 8;
      const w = h * (logo.w / logo.h);
      pdf.addImage(logo.data, "PNG", ML, y, w, h);
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...GRIS);
    pdf.text(meta.formulaireNom.toUpperCase(), W - ML, y + 1.5, {
      align: "right",
      baseline: "top",
    });
    y += 13;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(19);
    pdf.setTextColor(...NAVY);
    const titre = meta.titre?.trim() || "Réponse";
    const lignes = pdf.splitTextToSize(titre, CW) as string[];
    const lh = pt(19) * 1.14;
    for (const l of lignes.slice(0, 3)) {
      pdf.text(l, ML, y, { baseline: "top" });
      y += lh;
    }
    y += 1.5;

    const bits = [meta.auteur || null, meta.dateStr, meta.affaire || null].filter(
      Boolean,
    ) as string[];
    if (bits.length) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...GRIS);
      pdf.text(bits.join("    ·    "), ML, y, { baseline: "top" });
      y += pt(9.5) * 1.2;
    }
    y += 3;
    pdf.setDrawColor(...ORANGE);
    pdf.setLineWidth(0.7);
    pdf.line(ML, y, ML + CW, y);
    return y + 5.5;
  }

  function enTetePageN(): number {
    let y = 13;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...NAVY);
    pdf.text(meta.formulaireNom.toUpperCase(), ML, y, { baseline: "top" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...GRIS);
    const t = (pdf.splitTextToSize(meta.titre?.trim() || "Réponse", CW * 0.5) as string[])[0] ?? "";
    pdf.text(t, W - ML, y, { align: "right", baseline: "top" });
    y += 5.5;
    pdf.setDrawColor(...TRAIT);
    pdf.setLineWidth(0.3);
    pdf.line(ML, y, ML + CW, y);
    return y + 5;
  }

  function nouvellePage(premiere: boolean): number {
    if (creees > 0) pdf.addPage();
    creees += 1;
    const top = premiere ? enTetePage1() : enTetePageN();
    pageStartY = top;
    return top;
  }

  function pied(i: number, total: number) {
    pdf.setDrawColor(...TRAIT);
    pdf.setLineWidth(0.3);
    pdf.line(ML, footerY - 2.5, ML + CW, footerY - 2.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...GRIS);
    pdf.text("DumTools · Fareneït Dumortier", ML, footerY, { baseline: "top" });
    pdf.text("www.dumortier02.fr", W / 2, footerY, {
      align: "center",
      baseline: "top",
    });
    pdf.text(`Page ${i} / ${total}`, W - ML, footerY, {
      align: "right",
      baseline: "top",
    });
  }

  let y = nouvellePage(true);
  // Hauteur utile d'une page « suivante » pleine (cf. enTetePageN : 13 + 5.5 + 5).
  const maxH = contentBottom - 23.5;

  for (const bloc of blocs) {
    const canvas = await html2canvas(bloc, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    if (!canvas.width || !canvas.height) continue;
    const data = canvas.toDataURL("image/jpeg", 0.92);
    const hmm = (canvas.height / canvas.width) * CW;
    // Bloc GPS → toute sa zone devient une annotation de lien cliquable (Maps).
    const lien = bloc.dataset.gpsUrl;

    if (hmm > maxH) {
      // Bloc plus haut qu'une page entière → page dédiée, réduit pour tenir.
      if (y > pageStartY + 0.5) y = nouvellePage(false);
      const s = maxH / hmm;
      const w2 = CW * s;
      const x = ML + (CW - w2) / 2;
      pdf.addImage(data, "JPEG", x, y, w2, maxH);
      if (lien) pdf.link(x, y, w2, maxH, { url: lien });
      y += maxH + GAP;
      continue;
    }
    if (y + hmm > contentBottom) y = nouvellePage(false);
    pdf.addImage(data, "JPEG", ML, y, CW, hmm);
    if (lien) pdf.link(ML, y, CW, hmm, { url: lien });
    y += hmm + GAP;
  }

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pied(i, total);
  }

  return pdf.output("blob");
}
