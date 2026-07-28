import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ecrirePhotoScan } from "@/tools/modems/stockage";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Une photo compressée (~1600 px JPEG) fait quelques centaines de Ko. 15 Mo
 *  laisse passer un original non compressé sans ouvrir la porte à n'importe quoi. */
const TAILLE_MAX = 15 * 1024 * 1024;

/** Seuls des formats image, et seulement ceux qu'un navigateur rend sans risque.
 *  Pas de SVG : c'est du XML exécutable, servi ici sur notre propre origine. */
const MIMES_AUTORISES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Réception d'une photo de scan. IDEMPOTENT par UUID : re-tenter un envoi
 * (réseau capricieux en local technique) ne duplique jamais la ligne.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const form = await req.formData();
  const photoId = String(form.get("photoId") || "");
  const scanId = String(form.get("scanId") || "");
  const mimeType = String(form.get("mimeType") || "image/jpeg");
  const file = form.get("file");

  if (!UUID_RE.test(photoId)) {
    return NextResponse.json({ error: "Identifiant photo invalide" }, { status: 400 });
  }
  if (!scanId) {
    return NextResponse.json({ error: "Scan manquant" }, { status: 400 });
  }
  if (!MIMES_AUTORISES.has(mimeType)) {
    return NextResponse.json({ error: "Format d'image non accepté" }, { status: 415 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > TAILLE_MAX) {
    return NextResponse.json({ error: "Photo trop volumineuse (max 15 Mo)" }, { status: 413 });
  }

  // Le scan doit exister : le client envoie sa photo après la persistance de la
  // ligne. 409 → le client réessaie une fois l'id réel connu.
  const scan = await prisma.modemScan.findUnique({
    where: { id: scanId },
    select: { id: true },
  });
  if (!scan) {
    return NextResponse.json(
      { error: "Scan inconnu — enregistrer le scan d'abord" },
      { status: 409 },
    );
  }

  const existant = await prisma.scanPhoto.findUnique({
    where: { id: photoId },
    select: { id: true },
  });
  if (existant) return NextResponse.json({ ok: true, deja: true });

  const contenu = Buffer.from(await file.arrayBuffer());
  const chemin = await ecrirePhotoScan(photoId, contenu);

  await prisma.scanPhoto.create({
    data: {
      id: photoId,
      scanId,
      mimeType,
      taille: contenu.byteLength,
      fichier: chemin,
    },
  });

  return NextResponse.json({ ok: true, id: photoId });
}
