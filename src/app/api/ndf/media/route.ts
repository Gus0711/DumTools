import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ecrireJustificatif } from "@/tools/notes-de-frais/stockage";
import { resoudrePeriode } from "@/tools/notes-de-frais/queries";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Photo compressée ≈ 200 Ko, PDF de facture parfois quelques Mo. 25 Mo = marge
 *  large sans ouvrir la porte à un dépôt aberrant. */
const TAILLE_MAX = 25 * 1024 * 1024;

const MIMES_OK = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

/**
 * Dépôt d'un justificatif. IDEMPOTENT par UUID : re-tenter un envoi ne duplique
 * jamais. La dépense doit exister ET appartenir à l'appelant.
 *
 * Effet de bord important : si c'est le PREMIER justificatif, la dépense devient
 * « complète » et entre donc dans un récap. On recalcule sa période à cet
 * instant précis — c'est là que s'applique la règle de rattrapage (si le mois
 * d'origine a été transmis entre-temps, la dépense bascule sur le mois ouvert
 * suivant plutôt que de réapparaître dans un fichier déjà remis).
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const form = await req.formData();
  const id = String(form.get("id") || "");
  const depenseId = String(form.get("depenseId") || "");
  const mimeType = String(form.get("mimeType") || "application/octet-stream");
  const nomOrigine = String(form.get("nomOrigine") || "").slice(0, 200);
  const file = form.get("file");

  if (!UUID_RE.test(id) || !UUID_RE.test(depenseId)) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 400 });
  }
  if (!MIMES_OK.includes(mimeType)) {
    return NextResponse.json(
      { error: "Format non accepté (photo ou PDF uniquement)" },
      { status: 400 },
    );
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > TAILLE_MAX) {
    return NextResponse.json(
      { error: "Justificatif trop volumineux (max 25 Mo)" },
      { status: 413 },
    );
  }

  // Propriété vérifiée ici, pas seulement l'existence.
  const depense = await prisma.depenseFrais.findFirst({
    where: { id: depenseId, createdById: userId },
    select: { id: true, date: true, _count: { select: { justificatifs: true } } },
  });
  if (!depense) {
    // 409 (et non 404) : la file d'envoi peut réessayer si la dépense n'est
    // pas encore enregistrée.
    return NextResponse.json(
      { error: "Dépense inconnue — l'enregistrer d'abord" },
      { status: 409 },
    );
  }

  const existant = await prisma.justificatifFrais.findUnique({
    where: { id },
    select: { id: true },
  });
  if (existant) return NextResponse.json({ ok: true, deja: true });

  const contenu = Buffer.from(await file.arrayBuffer());
  const chemin = await ecrireJustificatif(id, contenu);

  await prisma.justificatifFrais.create({
    data: {
      id,
      depenseId,
      mimeType,
      nomOrigine,
      taille: contenu.byteLength,
      fichier: chemin,
    },
  });

  let reportee = false;
  if (depense._count.justificatifs === 0) {
    const { periode, periodeOrigine } = await resoudrePeriode(
      userId,
      depense.date,
    );
    await prisma.depenseFrais.update({
      where: { id: depenseId },
      data: { periode, periodeOrigine },
    });
    reportee = periodeOrigine !== null;
  }

  return NextResponse.json({ ok: true, reportee });
}
