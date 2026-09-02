import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CACHE_MEDIA_INTERNE, reponseMedia } from "@/lib/medias-document/routes";
import { fichierDocumentation } from "@/tools/magasin/documentation";
import { mimeSur } from "@/tools/magasin/model";

export const runtime = "nodejs";

/**
 * Sert le binaire d'une documentation — à tout collègue CONNECTÉ.
 *
 * Volontairement pas de garde Achats en lecture, contrairement au reste du
 * magasin : une fiche constructeur ne porte ni prix d'achat ni marge, et c'est
 * le technicien en armoire qui en a besoin. Ce qui reste réservé, c'est de la
 * déposer et de la modifier (route POST, `peutGererReferentiel`).
 *
 * La variante PUBLIQUE — les annexes d'un devis envoyé au client — est une
 * autre route, scopée au jeton : `/api/public/devis/[jeton]/doc/[id]`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await fichierDocumentation(id);
  if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  return reponseMedia(req, { ...doc, mimeType: mimeSur(doc.mimeType) }, CACHE_MEDIA_INTERNE);
}
