import { NextResponse } from "next/server";
import { CACHE_MEDIA_PUBLIC, reponseMedia } from "@/lib/medias-document/routes";
import { getMediaDevisPublic } from "@/tools/devis/queries";

export const runtime = "nodejs";

/** Sert le binaire d'un média d'un devis PUBLIÉ, sans session — une photo
 *  d'armoire ou un schéma collé dans un texte libre du devis.
 *
 *  Trois gardes, toutes nécessaires (mêmes que la route publique des notes) :
 *    1. le jeton existe ET n'est pas échu (`partageActif`, dans la requête) ;
 *    2. le média appartient au devis DE CE JETON — un jeton valide ne donne
 *       jamais accès aux médias d'un autre devis ;
 *    3. cache court, pour qu'une révocation coupe l'accès sans délai.
 *
 *  La route interne (`/api/devis/media/[id]`) garde sa garde Achats : c'est bien
 *  pour ça que la page publique réécrit les URLs vers ici. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ jeton: string; id: string }> },
) {
  const { jeton, id } = await params;
  if (!jeton || jeton.length < 16) {
    return NextResponse.json({ error: "Jeton invalide" }, { status: 404 });
  }

  const media = await getMediaDevisPublic(jeton, id);
  if (!media) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  return reponseMedia(req, media, CACHE_MEDIA_PUBLIC);
}
