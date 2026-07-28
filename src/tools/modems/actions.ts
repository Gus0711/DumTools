"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { FORMAT_PHOTO, parseModemQr } from "./model";
import { supprimerPhotosDisque } from "./stockage";

/**
 * Valide l'horodatage remonté par l'appareil. Il sert d'axe de classement
 * (jour / semaine / mois / année) : une tablette dont l'horloge a dérivé
 * enverrait sinon des scans en 1970 ou en 2043, qui empoisonneraient l'arbre
 * des périodes pour tout le monde. Hors bornes → on retombe sur l'heure serveur.
 */
function horodatageSain(iso?: string | null): Date {
  const maintenant = Date.now();
  if (!iso) return new Date(maintenant);
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return new Date(maintenant);
  // Passé : un scan hors-ligne peut attendre, mais pas des années.
  const PLUS_VIEUX = maintenant - 365 * 86_400_000;
  // Futur : seulement la tolérance de désynchronisation d'horloge.
  const PLUS_RECENT = maintenant + 10 * 60_000;
  if (t < PLUS_VIEUX || t > PLUS_RECENT) return new Date(maintenant);
  return new Date(t);
}

/** Enregistre un scan (contenu + type + rattachement optionnel) → id créé. */
export async function enregistrerScanModem(
  raw: string,
  format?: string | null,
  chantierId?: string | null,
  groupe?: string | null,
  scanneLeIso?: string | null,
): Promise<{ id: string; scanneLe: Date } | { error: string }> {
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
      scanneLe: horodatageSain(scanneLeIso),
      ...info,
      createdById: userId,
    },
    select: { id: true, scanneLe: true },
  });
  return { id: row.id, scanneLe: row.scanneLe };
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

/**
 * Crée une **ligne photo** : une observation sans code-barres (`raw = ""`,
 * `format = "photo"`). Sert quand on prend une photo alors qu'aucun scan n'a été
 * fait dans la session — la photo a quand même besoin d'une ligne à laquelle se
 * rattacher, et elle hérite du contexte affaire/groupe comme un scan.
 */
export async function creerLignePhoto(
  chantierId?: string | null,
  groupe?: string | null,
  scanneLeIso?: string | null,
): Promise<{ id: string; scanneLe: Date } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Non authentifié" };

  const row = await prisma.modemScan.create({
    data: {
      raw: "",
      format: FORMAT_PHOTO,
      chantierId: chantierId ?? null,
      groupe: groupe?.trim() || null,
      scanneLe: horodatageSain(scanneLeIso),
      createdById: userId,
    },
    select: { id: true, scanneLe: true },
  });
  return { id: row.id, scanneLe: row.scanneLe };
}

/** Supprime une photo (ligne + binaire disque). */
export async function supprimerPhotoScan(photoId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const photo = await prisma.scanPhoto.findUnique({
    where: { id: photoId },
    select: { fichier: true },
  });
  if (!photo) return;
  await prisma.scanPhoto.delete({ where: { id: photoId } });
  await supprimerPhotosDisque([photo.fichier]);
}

/**
 * Supprime un lot de scans. La cascade Prisma efface les lignes `ScanPhoto`
 * mais PAS les binaires : on relève les chemins avant, on nettoie le disque
 * après — sinon les fichiers s'accumulent en orphelins sur la VM.
 */
export async function supprimerScans(ids: string[]): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || ids.length === 0) return;
  const photos = await prisma.scanPhoto.findMany({
    where: { scanId: { in: ids } },
    select: { fichier: true },
  });
  await prisma.modemScan.deleteMany({ where: { id: { in: ids } } });
  await supprimerPhotosDisque(photos.map((p) => p.fichier));
}

/** Met à jour la note libre d'un scan. */
export async function majNoteScanModem(id: string, note: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.modemScan.update({ where: { id }, data: { note: note.slice(0, 500) } });
}
