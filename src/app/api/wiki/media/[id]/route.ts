import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { lireMediaWiki } from "@/tools/wiki/stockage";

export const runtime = "nodejs";

/** Sert le binaire d'un média de page wiki, AUTHENTIFIÉ. Le wiki est 100 %
 *  interne : il n'existe aucune route publique pour ces médias. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  let contenu: Buffer;
  try {
    contenu = await lireMediaWiki(media.fichier);
  } catch {
    return NextResponse.json({ error: "Fichier absent du stockage" }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(contenu.byteLength),
      ...(media.nom
        ? { "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.nom)}` }
        : {}),
      // Un média de page est immuable (UUID) : cache privé long.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
