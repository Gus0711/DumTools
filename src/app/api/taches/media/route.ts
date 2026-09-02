import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { routeTeleversementMedia } from "@/lib/medias-document/routes";
import { DEPOT_MEDIAS_TACHES } from "@/lib/chantiers/taches-stockage";
import { TAILLE_MAX_MEDIA_TACHE } from "@/lib/chantiers/taches";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

const televerser = routeTeleversementMedia({
  depot: DEPOT_MEDIAS_TACHES,
  tailleMax: TAILLE_MAX_MEDIA_TACHE,
  champParent: "tacheId",
  libelleParent: "Tâche",
  parentExiste: async (id) =>
    !!(await prisma.tacheAffaire.findUnique({ where: { id }, select: { id: true } })),
  mediaExiste: async (id) =>
    !!(await prisma.tacheMedia.findUnique({ where: { id }, select: { id: true } })),
  enregistrer: async (m) => {
    await prisma.tacheMedia.create({
      data: {
        id: m.id,
        tacheId: m.parentId,
        nom: m.nom,
        mimeType: m.mimeType,
        taille: m.taille,
        fichier: m.fichier,
      },
    });
  },
});

/**
 * Réception d'un média collé dans le corps d'une tâche.
 *
 * ⚠️ Le contrôle d'accès n'est PAS factorisé (règle du socle médias) : la
 * fabrique n'exige qu'une session, et chaque route porte sa garde EN CLAIR.
 * Ici la garde est simple — les tâches sont ouvertes à toute l'équipe, comme
 * les affaires — mais elle est écrite, pas supposée.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  return televerser(req);
}
