import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { CACHE_MEDIA_INTERNE, reponseMedia } from "@/lib/medias-document/routes";

export const runtime = "nodejs";

/**
 * Sert le binaire d'un média de devis — AUTHENTIFIÉ. Les `<img>` des textes
 * libres de l'éditeur pointent ici (cookie de session).
 *
 * ⚠️ Le cloisonnement Achats a sauté le 2026-08-12 avec l'ouverture de l'outil
 * à toute l'équipe. La session, elle, reste exigée : la variante PUBLIQUE d'un
 * média est une AUTRE route, scopée au jeton du devis
 * (`/api/public/devis/[jeton]/media/[id]`) — celle-ci ne sert jamais le monde
 * extérieur. `?dl=1` force le téléchargement (voir dispositionMedia).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  /* ⚠️ Plus de garde de rôle : l'outil Devis est ouvert à toute l'équipe depuis
     le 2026-08-12 (note « DROITS » de src/tools/devis/model.ts). Une session
     suffit — mais elle reste EXIGÉE : cette route sert du chiffrage interne. */

  const { id } = await params;
  const media = await prisma.devisMedia.findUnique({
    where: { id },
    select: { fichier: true, mimeType: true, nom: true },
  });
  if (!media) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  return reponseMedia(req, media, CACHE_MEDIA_INTERNE);
}
