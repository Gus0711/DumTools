/* Export PDF d'une note : capture du rendu de l'aperçu (html2canvas-pro) puis
 * découpe en pages A4 portrait (jsPDF). Même famille d'export raster que
 * l'aperçu d'affectation (apercu-pdf.ts) — les deux libs sont importées
 * dynamiquement pour rester hors du bundle initial.
 * Limite connue : les iframes (blocs HTML embarqués) ne sont pas capturées par
 * html2canvas — pour un rendu fidèle de ces blocs, passer par Imprimer. */

export async function genererNotePdf(root: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(root, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });

  const pageW = 210;
  const pageH = 297;
  const marge = 12;
  const largeurImg = pageW - marge * 2;
  const pxParMm = canvas.width / largeurImg;
  const hauteurPagePx = Math.floor((pageH - marge * 2) * pxParMm);

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  let y = 0;
  let premiere = true;
  while (y < canvas.height) {
    const h = Math.min(hauteurPagePx, canvas.height - y);
    const tranche = document.createElement("canvas");
    tranche.width = canvas.width;
    tranche.height = h;
    const ctx = tranche.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

    if (!premiere) pdf.addPage();
    pdf.addImage(tranche.toDataURL("image/jpeg", 0.92), "JPEG", marge, marge, largeurImg, h / pxParMm);
    premiere = false;
    y += hauteurPagePx;
  }

  return pdf.output("blob");
}
