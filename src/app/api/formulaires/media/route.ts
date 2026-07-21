import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ecrireMediaFormulaire } from "@/tools/formulaires/stockage";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Photo compressée (~1600 px JPEG) = quelques centaines de Ko, signature PNG
 *  quelques dizaines de Ko. 25 Mo = marge large. */
const TAILLE_MAX_MEDIA = 25 * 1024 * 1024;

/**
 * Réception d'un média poussé par le remplissage (file de synchro). IDEMPOTENT
 * par UUID média : re-tenter un envoi ne duplique jamais. La réponse parente doit
 * exister (poussée avant ses médias) → 409 sinon, pour que la file réessaie.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const form = await req.formData();
  const mediaId = String(form.get("mediaId") || "");
  const reponseId = String(form.get("reponseId") || "");
  const type = String(form.get("type") || "");
  const mimeType = String(form.get("mimeType") || "application/octet-stream");
  const file = form.get("file");

  if (!UUID_RE.test(mediaId) || !UUID_RE.test(reponseId)) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 400 });
  }
  const TYPES_OK = ["photo", "signature", "audio", "dessin", "fichier"];
  if (!TYPES_OK.includes(type)) {
    return NextResponse.json({ error: "Type de média invalide" }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > TAILLE_MAX_MEDIA) {
    return NextResponse.json(
      { error: "Média trop volumineux (max 25 Mo)" },
      { status: 413 },
    );
  }

  const reponse = await prisma.formulaireReponse.findUnique({
    where: { id: reponseId },
    select: { id: true },
  });
  if (!reponse) {
    return NextResponse.json(
      { error: "Réponse inconnue — la synchroniser d'abord" },
      { status: 409 },
    );
  }

  const existant = await prisma.formulaireMedia.findUnique({
    where: { id: mediaId },
    select: { id: true },
  });
  if (existant) return NextResponse.json({ ok: true, deja: true });

  const contenu = Buffer.from(await file.arrayBuffer());
  const chemin = await ecrireMediaFormulaire(mediaId, contenu);

  await prisma.formulaireMedia.create({
    data: {
      id: mediaId,
      reponseId,
      type,
      mimeType,
      taille: contenu.byteLength,
      fichier: chemin,
    },
  });

  return NextResponse.json({ ok: true });
}
