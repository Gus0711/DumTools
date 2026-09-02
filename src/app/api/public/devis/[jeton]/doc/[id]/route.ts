import { NextResponse } from "next/server";
import { CACHE_MEDIA_PUBLIC, reponseMedia } from "@/lib/medias-document/routes";
import { getDocumentationDevisPublic } from "@/tools/devis/queries";
import { mimeSur } from "@/tools/magasin/model";

export const runtime = "nodejs";
// Le jeton peut expirer, et la liste des annexes suit le devis vivant : rien
// ici ne se met en cache côté serveur.
export const dynamic = "force-dynamic";

/**
 * Une fiche technique annexée à un devis PUBLIÉ — servie SANS session.
 *
 * Route exclue du matcher de `src/proxy.ts` (préfixe `api/public/`), donc
 * accessible au monde entier : toute la sûreté tient dans la requête, et elle
 * est double (voir `getDocumentationDevisPublic`) —
 *
 *   1. le jeton doit être ACTIF (`partageActif` : existence ET échéance) ;
 *   2. la fiche doit faire partie des annexes de CE devis-là.
 *
 * La seconde n'est pas une ceinture de plus : sans elle, n'importe quel jeton de
 * devis servirait n'importe quelle documentation de la maison — y compris celle
 * des produits d'un bloc forfaitaire, que ce devis prend justement soin de ne
 * pas nommer.
 *
 * Un jeton échu, une fiche étrangère au devis et un identifiant inventé donnent
 * tous les trois le même 404 : on ne dit pas à un lien périmé qu'il a existé.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ jeton: string; id: string }> },
) {
  const { jeton, id } = await params;
  const doc = await getDocumentationDevisPublic(jeton, id);
  if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  return reponseMedia(req, { ...doc, mimeType: mimeSur(doc.mimeType) }, CACHE_MEDIA_PUBLIC);
}
