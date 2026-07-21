import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { lireMediaNote } from "@/tools/notes/stockage";

export const runtime = "nodejs";

/** Sert le binaire d'un média de note, authentifié. Les <img> et cartes de
 *  fichiers de l'éditeur pointent ici (cookie de session envoyé). La vue
 *  publique passe par /api/public/notes/[jeton]/media/[id]. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const media = await prisma.noteMedia.findUnique({
    where: { id },
    select: { fichier: true, mimeType: true, nom: true },
  });
  if (!media) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  let contenu: Buffer;
  try {
    contenu = await lireMediaNote(media.fichier);
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
      // Un média de note est immuable (UUID) : cache privé long.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
