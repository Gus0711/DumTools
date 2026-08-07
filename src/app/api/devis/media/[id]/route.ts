import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { CACHE_MEDIA_INTERNE, reponseMedia } from "@/lib/medias-document/routes";
import { peutVoirDevis } from "@/tools/devis/model";

export const runtime = "nodejs";

/**
 * Sert le binaire d'un média de devis — AUTHENTIFIÉ **et** cloisonné Achats.
 * Les `<img>` des textes libres de l'éditeur pointent ici (cookie de session).
 *
 * Aucune variante publique, contrairement aux notes : un devis ne se partage
 * pas par lien, et une photo de tarif fournisseur n'a rien à faire hors du
 * périmètre Achats. `?dl=1` force le téléchargement (voir dispositionMedia).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!peutVoirDevis(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;
  const media = await prisma.devisMedia.findUnique({
    where: { id },
    select: { fichier: true, mimeType: true, nom: true },
  });
  if (!media) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  return reponseMedia(req, media, CACHE_MEDIA_INTERNE);
}
