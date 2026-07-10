import "server-only";
import { prisma } from "@/lib/db";
import type { ClientArtefact } from "@/lib/clients/types";
import { formatTaille, type StatutSync } from "./model";

export interface DocResume {
  id: string;
  nom: string;
  categorie: string;
  taille: number;
  mimeType: string;
  statutSync: StatutSync;
  kdriveFileId: string | null;
  syncError: string | null;
  auteur: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Documents d'une affaire (vue outil), du plus récent au plus ancien. */
export async function listerDocuments(chantierId: string): Promise<DocResume[]> {
  const docs = await prisma.document.findMany({
    where: { chantierId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { nom: true } } },
  });
  return docs.map((d) => ({
    id: d.id,
    nom: d.nom,
    categorie: d.categorie,
    taille: d.taille,
    mimeType: d.mimeType,
    statutSync: d.statutSync as StatutSync,
    kdriveFileId: d.kdriveFileId,
    syncError: d.syncError,
    auteur: d.createdBy?.nom ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

/** Existe-t-il déjà un document de même nom dans cette affaire + catégorie ?
 *  Détection de doublon AU DÉPÔT contre la DB locale (indépendant de kDrive). */
export async function trouverDoublon(
  chantierId: string,
  categorie: string,
  nom: string,
): Promise<{ id: string } | null> {
  return prisma.document.findFirst({
    where: { chantierId, categorie, nom },
    select: { id: true },
  });
}

function docsToArtefacts(
  docs: { id: string; nom: string; categorie: string; taille: number; numeroWhy: string | null; chantierId: string; updatedAt: Date }[],
): ClientArtefact[] {
  return docs.map((d) => ({
    id: d.id,
    titre: d.nom,
    href: `/outils/documents/${d.chantierId}`,
    numeroWhy: d.numeroWhy,
    updatedAt: d.updatedAt,
    resume: `${d.categorie} · ${formatTaille(d.taille)}`,
  }));
}

/** Provider fiche affaire : documents rattachés à ce chantier. */
export async function listerPourChantier(chantierId: string): Promise<ClientArtefact[]> {
  const docs = await prisma.document.findMany({
    where: { chantierId },
    orderBy: { updatedAt: "desc" },
  });
  return docsToArtefacts(docs);
}

/** Provider fiche client : documents rattachés à ce client. */
export async function listerPourClient(clientId: string): Promise<ClientArtefact[]> {
  const docs = await prisma.document.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
  });
  return docsToArtefacts(docs);
}
