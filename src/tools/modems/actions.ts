"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseModemQr } from "./model";

/** Enregistre un scan (contenu + type + rattachement optionnel) → id créé. */
export async function enregistrerScanModem(
  raw: string,
  format?: string | null,
  chantierId?: string | null,
  groupe?: string | null,
): Promise<{ id: string } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Non authentifié" };

  const t = raw.trim();
  if (!t) return { error: "Code vide" };

  const info = parseModemQr(t);
  const row = await prisma.modemScan.create({
    data: {
      raw: t,
      format: format ?? null,
      chantierId: chantierId ?? null,
      groupe: groupe?.trim() || null,
      ...info,
      createdById: userId,
    },
    select: { id: true },
  });
  return { id: row.id };
}

/**
 * Rattache un lot de scans. Patch PARTIEL : un champ absent n'est pas touché,
 * `null` le vide. Ex. `{ groupe: "X" }` fixe le groupe sans changer l'affaire ;
 * `{ chantierId: null, groupe: null }` détache tout.
 */
export async function assignerScans(
  ids: string[],
  patch: { chantierId?: string | null; groupe?: string | null },
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || ids.length === 0) return;
  const data: { chantierId?: string | null; groupe?: string | null } = {};
  if ("chantierId" in patch) data.chantierId = patch.chantierId ?? null;
  if ("groupe" in patch) data.groupe = patch.groupe?.trim() || null;
  if (Object.keys(data).length === 0) return;
  await prisma.modemScan.updateMany({ where: { id: { in: ids } }, data });
}

/** Supprime un lot de scans. */
export async function supprimerScans(ids: string[]): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || ids.length === 0) return;
  await prisma.modemScan.deleteMany({ where: { id: { in: ids } } });
}

/** Met à jour la note libre d'un scan. */
export async function majNoteScanModem(id: string, note: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.modemScan.update({ where: { id }, data: { note: note.slice(0, 500) } });
}
