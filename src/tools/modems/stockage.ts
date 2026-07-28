import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/* Stockage disque des photos de scan. Même logique que les médias de visite :
 * le binaire vit ICI durablement, hors de public/, servi uniquement par la route
 * authentifiée /api/scans/media/[id]. Le nom de fichier est l'UUID du média —
 * jamais un chemin venu du client, donc aucune traversée possible. */

export function scansMediaDir(): string {
  return process.env.SCANS_MEDIA_DIR ?? join(process.cwd(), ".scans-media");
}

export async function ecrirePhotoScan(photoId: string, contenu: Buffer): Promise<string> {
  const dir = scansMediaDir();
  await mkdir(dir, { recursive: true });
  const chemin = join(dir, photoId);
  await writeFile(chemin, contenu);
  return chemin;
}

export function lirePhotoScan(chemin: string): Promise<Buffer> {
  return readFile(chemin);
}

/** Best-effort : un binaire déjà absent ne doit pas faire échouer la suppression
 *  de la ligne en base (la source de vérité reste la base). */
export async function supprimerPhotosDisque(chemins: string[]): Promise<void> {
  await Promise.all(chemins.map((c) => rm(c, { force: true }).catch(() => {})));
}
