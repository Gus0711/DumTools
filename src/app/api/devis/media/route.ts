import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { routeTeleversementMedia } from "@/lib/medias-document/routes";
import { TAILLE_MAX_MEDIA_DEVIS } from "@/tools/devis/model";
import { DEPOT_MEDIAS_DEVIS } from "@/tools/devis/stockage";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

const televerser = routeTeleversementMedia({
  depot: DEPOT_MEDIAS_DEVIS,
  tailleMax: TAILLE_MAX_MEDIA_DEVIS,
  champParent: "devisId",
  libelleParent: "Devis",
  parentExiste: async (id) =>
    !!(await prisma.devis.findUnique({ where: { id }, select: { id: true } })),
  mediaExiste: async (id) =>
    !!(await prisma.devisMedia.findUnique({ where: { id }, select: { id: true } })),
  enregistrer: async (m) => {
    await prisma.devisMedia.create({
      data: {
        id: m.id,
        devisId: m.parentId,
        nom: m.nom,
        mimeType: m.mimeType,
        taille: m.taille,
        fichier: m.fichier,
      },
    });
  },
});

/**
 * Réception d'un média de devis (image collée dans un texte libre, pièce
 * jointe). La fabrique partagée n'exige qu'une session : le CLOISONNEMENT
 * Achats est ajouté ici, en clair — c'est la règle de l'outil (la garde vit
 * dans chaque écran, chaque action ET chaque route), et celle du socle médias,
 * qui refuse justement de factoriser le contrôle d'accès.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  /* ⚠️ Plus de garde de rôle : l'outil Devis est ouvert à toute l'équipe depuis
     le 2026-08-12 (note « DROITS » de src/tools/devis/model.ts). Une session
     suffit — mais elle reste EXIGÉE : cette route sert du chiffrage interne. */
  return televerser(req);
}
