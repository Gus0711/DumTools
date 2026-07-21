import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lireMediaNote } from "@/tools/notes/stockage";

export const runtime = "nodejs";

/** Sert le binaire d'un média d'une note PARTAGÉE, sans session : l'accès est
 *  scopé au jeton (le média doit appartenir à LA note de ce jeton — un jeton
 *  valide ne donne jamais accès aux médias d'une autre note). Route exclue du
 *  matcher d'auth (src/proxy.ts) via le préfixe api/public/. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jeton: string; id: string }> },
) {
  const { jeton, id } = await params;
  if (!jeton || jeton.length < 16) {
    return NextResponse.json({ error: "Jeton invalide" }, { status: 404 });
  }

  const note = await prisma.note.findUnique({
    where: { jetonPartage: jeton },
    select: { id: true },
  });
  if (!note) return NextResponse.json({ error: "Note introuvable" }, { status: 404 });

  const media = await prisma.noteMedia.findUnique({
    where: { id },
    select: { noteId: true, fichier: true, mimeType: true, nom: true },
  });
  if (!media || media.noteId !== note.id) {
    return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
  }

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
      // Cache court : une révocation du partage doit couper l'accès rapidement.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
