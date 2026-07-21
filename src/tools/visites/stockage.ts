import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/* Stockage disque des médias de visite (photos compressées, notes vocales).
 * Contrairement à la GED (kDrive maître + spool transitoire), le binaire vit ICI
 * durablement : les médias servent la fiche visite et le futur compte-rendu.
 * Hors de public/ : servis uniquement par la route authentifiée
 * /api/visites/media/[id]. Nom de fichier = UUID du média (sûr par construction). */

export function visitesMediaDir(): string {
  return process.env.VISITES_MEDIA_DIR ?? join(process.cwd(), ".visites-media");
}

export async function ecrireMediaVisite(mediaId: string, contenu: Buffer): Promise<string> {
  const dir = visitesMediaDir();
  await mkdir(dir, { recursive: true });
  const chemin = join(dir, mediaId);
  await writeFile(chemin, contenu);
  return chemin;
}

export function lireMediaVisite(chemin: string): Promise<Buffer> {
  return readFile(chemin);
}

export async function supprimerMediaVisite(chemin: string): Promise<void> {
  await rm(chemin, { force: true }).catch(() => {});
}
