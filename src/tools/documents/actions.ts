"use server";

import { rm } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { drain } from "@/lib/kdrive/drain";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return id;
}

/** Supprime un document (métadonnées + spool éventuel). Ne supprime PAS le
 *  fichier déjà poussé sur kDrive : kDrive est le stockage maître, on ne détruit
 *  jamais côté drive depuis DumTools. */
export async function supprimerDocument(id: string): Promise<void> {
  await requireUserId();
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { spoolPath: true, chantierId: true },
  });
  if (!doc) return;
  if (doc.spoolPath) await rm(doc.spoolPath, { force: true }).catch(() => {});
  await prisma.document.delete({ where: { id } });
  revalidatePath(`/outils/documents/${doc.chantierId}`);
}

/** Re-programme une synchro échouée (remet EN_ATTENTE, remet le compteur à zéro).
 *  Possible seulement si le spool est encore présent (fichier pas encore poussé). */
export async function relancerSync(id: string): Promise<void> {
  await requireUserId();
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { spoolPath: true, chantierId: true, statutSync: true },
  });
  if (!doc) return;
  if (!doc.spoolPath) throw new Error("Fichier déjà poussé — rien à re-synchroniser");
  await prisma.document.update({
    where: { id },
    data: { statutSync: "EN_ATTENTE", tentatives: 0, syncError: null },
  });
  revalidatePath(`/outils/documents/${doc.chantierId}`);
}

/** Déclenche une synchro immédiate (draine la file), sans attendre le cron.
 *  Renvoie le bilan pour un retour utilisateur. */
export async function synchroniserMaintenant(
  chantierId: string,
): Promise<{ traites: number; erreurs: number }> {
  await requireUserId();
  const bilan = await drain();
  revalidatePath(`/outils/documents/${chantierId}`);
  return bilan;
}
