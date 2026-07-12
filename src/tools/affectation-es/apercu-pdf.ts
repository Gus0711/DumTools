// Génération du PDF du document d'affectation (onglet Aperçu) entièrement côté
// navigateur : on CAPTURE les pages déjà rendues (`.print-page`, A4 paysage) avec
// html2canvas-pro, puis on les assemble avec jsPDF. On réutilise ainsi le visuel
// exact (photos matériel, schémas de bornes) sans Chromium ni ré-écriture de mise
// en page. Contrepartie : rendu rastérisé (image par page). Libs chargées à la
// demande (import dynamique → hors bundle initial).

const PAGE_W_MM = 297; // A4 paysage
const PAGE_H_MM = 210;

/** Construit le PDF depuis le conteneur des pages de l'aperçu et renvoie le Blob. */
export async function genererApercuPdf(root: HTMLElement): Promise<Blob> {
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

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const img = canvas.toDataURL("image/jpeg", 0.85);
    if (i > 0) pdf.addPage();
    pdf.addImage(img, "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
  }

  return pdf.output("blob");
}
