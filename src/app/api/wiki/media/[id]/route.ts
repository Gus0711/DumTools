import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { CACHE_MEDIA_INTERNE, reponseMedia } from "@/lib/medias-document/routes";

export const runtime = "nodejs";

/** Sert le binaire d'un média de page wiki, AUTHENTIFIÉ — c'est la route que
 *  citent les documents. Une page partagée temporairement est lue via
 *  /api/public/wiki/[jeton]/media/[id], scopée au jeton.
 *  `?dl=1` force le téléchargement (voir dispositionMedia). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const media = await prisma.wikiMedia.findUnique({
    where: { id },
    select: { fichier: true, mimeType: true, nom: true },
  });
  if (!media) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  return reponseMedia(req, media, CACHE_MEDIA_INTERNE);
}
