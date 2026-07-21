import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { TAILLE_MAX_MEDIA_NOTE } from "@/tools/notes/model";
import { ecrireMediaNote } from "@/tools/notes/stockage";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Réception d'un média de note (image collée dans l'éditeur, pièce jointe).
 * IDEMPOTENT par UUID média : re-tenter un envoi ne duplique jamais.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const form = await req.formData();
  const mediaId = String(form.get("mediaId") || "").toLowerCase();
  const noteId = String(form.get("noteId") || "");
  const file = form.get("file");

  if (!UUID_RE.test(mediaId) || !noteId) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > TAILLE_MAX_MEDIA_NOTE) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 50 Mo)" }, { status: 413 });
  }

  const note = await prisma.note.findUnique({ where: { id: noteId }, select: { id: true } });
  if (!note) {
    return NextResponse.json({ error: "Note inconnue" }, { status: 404 });
  }

  const existant = await prisma.noteMedia.findUnique({ where: { id: mediaId }, select: { id: true } });
  if (existant) return NextResponse.json({ ok: true, deja: true });

  const contenu = Buffer.from(await file.arrayBuffer());
  const chemin = await ecrireMediaNote(mediaId, contenu);

  await prisma.noteMedia.create({
    data: {
      id: mediaId,
      noteId,
      nom: file.name || "",
      mimeType: file.type || "application/octet-stream",
      taille: contenu.byteLength,
      fichier: chemin,
    },
  });

  return NextResponse.json({ ok: true });
}
