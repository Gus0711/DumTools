// Génération du PDF du document d'affectation (onglet Aperçu) entièrement côté
// navigateur : on CAPTURE les pages déjà rendues (`.print-page`) avec
// html2canvas-pro, puis on les assemble avec jsPDF. On réutilise ainsi le visuel
// exact (photos matériel, schémas de bornes) sans Chromium ni ré-écriture de mise
// en page — l'aperçu écran et le PDF partagent le même DOM, donc restent
// identiques. Contrepartie : rendu rastérisé (image par page). Libs chargées à la
// demande (import dynamique → hors bundle initial).
//
// C'est le chemin d'impression FIABLE : window.print() est cassé sur ce document
// (le montage @page nommé + .print-root absolu du CSS global le borne à une seule
// page). On génère donc toujours le PDF, que ce soit pour imprimer ou pour kDrive.

export type OrientationApercu = "landscape" | "portrait";

/** Dimensions A4 (mm) selon l'orientation. Doivent correspondre à la taille des
 *  `.print-page` en CSS (voir `.affectation-doc.portrait .print-page`). */
const DIMENSIONS: Record<OrientationApercu, [number, number]> = {
  landscape: [297, 210],
  portrait: [210, 297],
};

/**
 * Construit le PDF depuis le conteneur des pages de l'aperçu et renvoie le Blob.
 * L'orientation doit correspondre à celle appliquée au DOM (classe `.portrait`
 * sur la racine) : html2canvas capture la page TELLE QU'AFFICHÉE, l'image épouse
 * donc déjà le bon ratio — on se contente de dimensionner la page jsPDF.
 */
export async function genererApercuPdf(
  root: HTMLElement,
  orientation: OrientationApercu = "landscape",
): Promise<Blob> {
  const pages = Array.from(root.querySelectorAll<HTMLElement>(".print-page"));
  if (pages.length === 0) {
    throw new Error("Aucune page à exporter — ouvrez l'onglet Aperçu.");
  }

  const [h2cMod, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  const html2canvas = ((h2cMod as { default?: unknown }).default ?? h2cMod) as (
    el: HTMLElement,
    opts?: Record<string, unknown>,
  ) => Promise<HTMLCanvasElement>;

  const [w, h] = DIMENSIONS[orientation];
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });

  // L'aperçu écran met les pages à l'échelle avec `zoom: 0.62`. html2canvas
  // rend TRÈS mal les éléments `zoom`és (contenu décalé, texte tassé) : on
  // neutralise le zoom (classe `.pdf-capturing`) le temps de la capture, et on
  // sort la racine du flux (fixed, hors écran) pour éviter un flash à taille
  // réelle sous les yeux de l'utilisateur.
  root.classList.add("pdf-capturing");
  const s = root.style;
  const sauv = {
    position: s.position,
    left: s.left,
    top: s.top,
    zIndex: s.zIndex,
  };
  s.position = "fixed";
  s.left = "-10000px";
  s.top = "0";
  s.zIndex = "-1";

  try {
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const img = canvas.toDataURL("image/jpeg", 0.85);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, w, h);
    }
  } finally {
    s.position = sauv.position;
    s.left = sauv.left;
    s.top = sauv.top;
    s.zIndex = sauv.zIndex;
    root.classList.remove("pdf-capturing");
  }

  return pdf.output("blob");
}
