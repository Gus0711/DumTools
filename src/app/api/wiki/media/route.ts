import { prisma } from "@/lib/db";
import { routeTeleversementMedia } from "@/lib/medias-document/routes";
import { TAILLE_MAX_MEDIA_WIKI } from "@/tools/wiki/model";
import { DEPOT_MEDIAS_WIKI } from "@/tools/wiki/stockage";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

/** Réception d'un média de page wiki (image collée, pièce jointe). */
export const POST = routeTeleversementMedia({
  depot: DEPOT_MEDIAS_WIKI,
  tailleMax: TAILLE_MAX_MEDIA_WIKI,
  champParent: "pageId",
  libelleParent: "Page",
  parentExiste: async (id) =>
    !!(await prisma.wikiPage.findUnique({ where: { id }, select: { id: true } })),
  mediaExiste: async (id) =>
    !!(await prisma.wikiMedia.findUnique({ where: { id }, select: { id: true } })),
  enregistrer: async (m) => {
    await prisma.wikiMedia.create({
      data: {
        id: m.id,
        pageId: m.parentId,
        nom: m.nom,
        mimeType: m.mimeType,
        taille: m.taille,
        fichier: m.fichier,
      },
    });
  },
});
