import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { lireMediaVisite } from "@/tools/visites/stockage";

export const runtime = "nodejs";

/** Sert le binaire d'un média de visite (photo / note vocale), authentifié.
 *  Les <img>/<audio> de la fiche visite pointent ici (cookie de session envoyé). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const media = await prisma.visiteMedia.findUnique({
    where: { id },
    select: { fichier: true, mimeType: true },
  });
  if (!media) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  let contenu: Buffer;
  try {
    contenu = await lireMediaVisite(media.fichier);
  } catch {
    return NextResponse.json({ error: "Fichier absent du stockage" }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(contenu.byteLength),
      // Un média de visite est immuable (UUID) : cache privé long.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
