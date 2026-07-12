import "server-only";
import { prisma } from "@/lib/db";
import type { ClientArtefact } from "@/lib/clients/types";
import { kdriveConfigured, listChildren, type KdriveEntry } from "@/lib/kdrive/client";
import { trouverAffaireDirId } from "@/lib/kdrive/resolution";
import { segmentsEgaux } from "@/lib/kdrive/normalize";
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

/* --- Miroir kDrive (lecture seule) -------------------------------------------
 * Fichiers RÉELLEMENT présents dans le dossier kDrive de l'affaire mais ajoutés
 * à la main (hors DumTools) : ils n'ont pas de ligne `Document`. On les liste en
 * lecture seule, groupés par sous-dossier, en excluant ceux déjà connus en base.
 * ---------------------------------------------------------------------------- */

export interface FichierKdrive {
  fileId: string;
  nom: string;
  taille: number;
}

export interface GroupeKdrive {
  /** Nom du sous-dossier kDrive ; `"(racine)"` = fichiers à la racine de l'affaire. */
  dossier: string;
  fichiers: FichierKdrive[];
}

/** Liste les fichiers kDrive de l'affaire non déposés via DumTools (par dossier).
 *  Non destructif : ne crée aucun dossier, tolère l'absence/l'erreur (→ []). */
export async function listerFichiersKdrive(chantierId: string): Promise<GroupeKdrive[]> {
  if (!kdriveConfigured()) return [];

  const chantier = await prisma.chantier.findUnique({
    where: { id: chantierId },
    include: {
      client: true,
      documents: { select: { nom: true, categorie: true, kdriveFileId: true } },
    },
  });
  if (!chantier) return [];

  const annee = chantier.annee ?? chantier.createdAt.getFullYear();
  const clientDossier = (chantier.client.kdriveDossier?.trim() || chantier.client.nom).trim();

  const affaireDirId =
    chantier.kdriveDirId ??
    (await trouverAffaireDirId(annee, clientDossier, chantier.nom).catch(() => null));
  if (!affaireDirId) return [];

  // Fichiers déjà référencés en base → à exclure du miroir.
  const idsConnus = new Set(
    chantier.documents.map((d) => d.kdriveFileId).filter((v): v is string => Boolean(v)),
  );
  const nomsConnus = chantier.documents.map((d) => ({ categorie: d.categorie, nom: d.nom }));

  let enfants: KdriveEntry[];
  try {
    enfants = await listChildren(affaireDirId);
  } catch {
    return []; // dossier disparu / droit manquant → pas de miroir
  }

  const groupes: GroupeKdrive[] = [];
  const ajouter = (dossier: string, fichiers: KdriveEntry[]) => {
    const restants = fichiers.filter((f) => {
      if (idsConnus.has(f.id)) return false;
      return !nomsConnus.some(
        (d) => segmentsEgaux(d.categorie, dossier) && segmentsEgaux(d.nom, f.name),
      );
    });
    if (restants.length) {
      groupes.push({
        dossier,
        fichiers: restants.map((f) => ({ fileId: f.id, nom: f.name, taille: f.size ?? 0 })),
      });
    }
  };

  // Fichiers directement à la racine de l'affaire (cas rare mais à ne pas masquer).
  ajouter("(racine)", enfants.filter((e) => e.type === "file"));

  // Un groupe par sous-dossier (les catégories, et tout autre dossier présent).
  await Promise.all(
    enfants
      .filter((e) => e.type === "dir")
      .map(async (sd) => {
        try {
          const fichiers = await listChildren(sd.id);
          ajouter(sd.name, fichiers.filter((f) => f.type === "file"));
        } catch {
          /* sous-dossier illisible → ignoré */
        }
      }),
  );

  // Ordre stable : racine d'abord, puis dossiers par ordre alphabétique.
  groupes.sort((a, b) =>
    a.dossier === "(racine)"
      ? -1
      : b.dossier === "(racine)"
        ? 1
        : a.dossier.localeCompare(b.dossier, "fr"),
  );
  return groupes;
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
