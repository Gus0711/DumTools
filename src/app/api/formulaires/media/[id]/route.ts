import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { lireMediaFormulaire } from "@/tools/formulaires/stockage";

export const runtime = "nodejs";

/** Sert le binaire d'un média de réponse (photo / signature), authentifié.
 *  Les <img> de la fiche réponse et du PDF pointent ici (cookie de session). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const media = await prisma.formulaireMedia.findUnique({
    where: { id },
    select: { fichier: true, mimeType: true },
  });
  if (!media)
    return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  let contenu: Buffer;
  try {
    contenu = await lireMediaFormulaire(media.fichier);
  } catch {
    return NextResponse.json(
      { error: "Fichier absent du stockage" },
      { status: 410 },
    );
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(contenu.byteLength),
      // Immuable (UUID) : cache privé long.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
