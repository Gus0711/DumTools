import "server-only";
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { kdriveConfigured, uploadFile, getFile } from "./client";
import { resolveAffaireDirId, resolveCategorieDirId, buildKdrivePath } from "./resolution";

export { kdriveConfigured } from "./client";

/** Pousse un document (depuis son spool) vers kDrive, vérifie l'intégrité, puis
 *  purge le spool. Idempotent tant que non SYNC. Lève en cas d'échec (le worker
 *  attrape et marque ERREUR + backoff). Ne purge JAMAIS le spool sans confirmation
 *  d'intégrité (taille kDrive == taille locale). */
export async function pousserVersKdrive(documentId: string): Promise<void> {
  if (!kdriveConfigured()) {
    throw new Error("kDrive non configuré — dépôt conservé en attente sur le spool");
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { chantier: { include: { client: true } } },
  });
  if (!doc) throw new Error("Document introuvable");
  if (doc.statutSync === "SYNC" && doc.kdriveFileId) return; // déjà poussé
  if (!doc.spoolPath) throw new Error("Spool absent — rien à pousser");

  const chantier = doc.chantier;
  const client = chantier.client;
  // Le chemin ne casse jamais : à défaut d'année saisie, on retombe sur l'année
  // de création de l'affaire.
  const annee = chantier.annee ?? chantier.createdAt.getFullYear();
  const clientDossier = (client.kdriveDossier?.trim() || client.nom).trim();
  const affaireNom = chantier.nom;

  // Dossier d'affaire : cache sur Chantier, sinon résolution + mémorisation.
  let affaireDirId = chantier.kdriveDirId;
  if (!affaireDirId) {
    affaireDirId = await resolveAffaireDirId(annee, clientDossier, affaireNom);
    await prisma.chantier.update({
      where: { id: chantier.id },
      data: { kdriveDirId: affaireDirId },
    });
  }
  const dirId = await resolveCategorieDirId(affaireDirId, doc.categorie);

  const conflict = doc.politiqueConflit === "RENAME" ? "rename" : "version";
  const entry = await uploadFile({
    dirId,
    fileName: doc.nom,
    filePath: doc.spoolPath,
    conflict,
    mimeType: doc.mimeType,
  });

  // Contrôle d'intégrité AVANT purge du spool (SPIKE : affiner si kDrive expose
  // un hash plutôt que la seule taille).
  const meta = await getFile(entry.id);
  if (typeof meta.size === "number" && meta.size !== doc.taille) {
    throw new Error(
      `Intégrité kDrive : ${meta.size} o reçus ≠ ${doc.taille} o attendus (spool conservé)`,
    );
  }

  const spool = doc.spoolPath;
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      kdriveFileId: entry.id,
      kdrivePath: buildKdrivePath(annee, clientDossier, affaireNom, doc.categorie),
      statutSync: "SYNC",
      spoolPath: null,
      syncError: null,
    },
  });
  await rm(spool, { force: true }).catch(() => {});
}
