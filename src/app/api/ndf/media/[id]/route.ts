import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { lireJustificatif } from "@/tools/notes-de-frais/stockage";

export const runtime = "nodejs";

/**
 * Sert le binaire d'un justificatif.
 *
 * ⚠️ Contrairement aux autres routes média de la plateforme, qui se contentent
 * de vérifier la SESSION, celle-ci vérifie la PROPRIÉTÉ : un justificatif de
 * note de frais est une donnée financière nominative, connaître son UUID ne
 * doit pas suffire à le lire. Le filtre remonte jusqu'à `depense.createdById`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const justif = await prisma.justificatifFrais.findFirst({
    where: { id, depense: { createdById: userId } },
    select: { fichier: true, mimeType: true },
  });
  // Même réponse qu'un identifiant inexistant : on ne révèle pas l'existence
  // d'un justificatif appartenant à quelqu'un d'autre.
  if (!justif) {
    return NextResponse.json({ error: "Justificatif introuvable" }, { status: 404 });
  }

  let contenu: Buffer;
  try {
    contenu = await lireJustificatif(justif.fichier);
  } catch {
    return NextResponse.json(
      { error: "Fichier absent du stockage" },
      { status: 410 },
    );
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": justif.mimeType,
      "Content-Length": String(contenu.byteLength),
      // Immuable (UUID) : cache PRIVÉ long — jamais de cache partagé sur des
      // données nominatives.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
