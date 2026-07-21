import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { periodeValide } from "@/tools/notes-de-frais/model";
import {
  depensesDuMois,
  fichiersJustificatifs,
  identitePourExport,
} from "@/tools/notes-de-frais/queries";
import {
  genererExcel,
  nomFichierExcel,
} from "@/tools/notes-de-frais/excel";
import {
  genererPdfJustificatifs,
  nomFichierPdf,
} from "@/tools/notes-de-frais/pdf-justificatifs";

// ExcelJS et pdf-lib lisent des fichiers et manipulent des Buffer.
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Produit les deux livrables du mois : `?format=excel` remplit le gabarit
 * historique, `?format=pdf` assemble les justificatifs numérotés.
 *
 * Seules les dépenses COMPLÈTES sont exportées (règle centrale) et le tri est
 * identique dans les deux fichiers : le n° de pièce de la colonne A correspond
 * toujours à la page du PDF.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ periode: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { periode } = await params;
  if (!periodeValide(periode)) {
    return NextResponse.json({ error: "Période invalide" }, { status: 400 });
  }
  const format = new URL(req.url).searchParams.get("format") ?? "excel";
  if (format !== "excel" && format !== "pdf") {
    return NextResponse.json({ error: "Format inconnu" }, { status: 400 });
  }

  const [identite, depenses] = await Promise.all([
    identitePourExport(userId),
    depensesDuMois(userId, periode),
  ]);
  if (!identite.profil) {
    return NextResponse.json(
      { error: "Aucun profil de note de frais associé à ce compte" },
      { status: 403 },
    );
  }
  if (depenses.length === 0) {
    return NextResponse.json(
      { error: "Aucune dépense justifiée sur ce mois" },
      { status: 409 },
    );
  }

  if (format === "excel") {
    const buf = await genererExcel({
      profil: identite.profil,
      nomComplet: identite.nom,
      periode,
      depenses,
    });
    return fichier(
      buf,
      nomFichierExcel(identite.nom, periode),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  const fichiers = await fichiersJustificatifs(userId, periode);
  const buf = await genererPdfJustificatifs({
    nomComplet: identite.nom,
    periode,
    depenses,
    fichiers,
  });
  return fichier(buf, nomFichierPdf(identite.nom, periode), "application/pdf");
}

function fichier(buf: Buffer, nom: string, type: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(buf.byteLength),
      "Content-Disposition": `attachment; filename="${nom}"`,
      // Document reconstruit à la demande : jamais de cache, sinon une
      // correction de dernière minute ne se voit pas dans le fichier téléchargé.
      "Cache-Control": "no-store",
    },
  });
}
