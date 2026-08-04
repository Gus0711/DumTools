import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CACHE_MEDIA_PUBLIC, reponseMedia } from "@/lib/medias-document/routes";
import { partageActif } from "@/lib/partage/model";

export const runtime = "nodejs";

/** Sert le binaire d'un média d'une page de wiki PARTAGÉE, sans session.
 *  Trois gardes, toutes nécessaires :
 *    1. le jeton existe ET n'est pas échu (partageActif) ;
 *    2. le média appartient à LA page de ce jeton — un jeton valide ne donne
 *       jamais accès aux médias d'une autre page ;
 *    3. cache court, pour qu'une révocation coupe l'accès sans délai.
 *  Route exclue du matcher d'auth (src/proxy.ts) via le préfixe api/public/. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ jeton: string; id: string }> },
) {
  const { jeton, id } = await params;
  if (!jeton || jeton.length < 16) {
    return NextResponse.json({ error: "Jeton invalide" }, { status: 404 });
  }

  const page = await prisma.wikiPage.findUnique({
    where: { jetonPartage: jeton },
    select: { id: true, jetonPartage: true, partageExpireLe: true },
  });
  if (!page || !partageActif(page)) {
    return NextResponse.json({ error: "Page introuvable" }, { status: 404 });
  }

  const media = await prisma.wikiMedia.findUnique({
    where: { id },
    select: { pageId: true, fichier: true, mimeType: true, nom: true },
  });
  if (!media || media.pageId !== page.id) {
    return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
  }

  return reponseMedia(req, media, CACHE_MEDIA_PUBLIC);
}
