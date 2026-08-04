import { prisma } from "@/lib/db";
import { routeTeleversementMedia } from "@/lib/medias-document/routes";
import { TAILLE_MAX_MEDIA_NOTE } from "@/tools/notes/model";
import { DEPOT_MEDIAS_NOTES } from "@/tools/notes/stockage";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

/** Réception d'un média de note (image collée dans l'éditeur, pièce jointe). */
export const POST = routeTeleversementMedia({
  depot: DEPOT_MEDIAS_NOTES,
  tailleMax: TAILLE_MAX_MEDIA_NOTE,
  champParent: "noteId",
  libelleParent: "Note",
  parentExiste: async (id) =>
    !!(await prisma.note.findUnique({ where: { id }, select: { id: true } })),
  mediaExiste: async (id) =>
    !!(await prisma.noteMedia.findUnique({ where: { id }, select: { id: true } })),
  enregistrer: async (m) => {
    await prisma.noteMedia.create({
      data: {
        id: m.id,
        noteId: m.parentId,
        nom: m.nom,
        mimeType: m.mimeType,
        taille: m.taille,
        fichier: m.fichier,
      },
    });
  },
});
