import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/* Stockage disque des médias de page wiki (images collées, pièces jointes).
 * Même patron que les notes/visites (binaire durable sur la VM, hors public/) :
 * servi UNIQUEMENT par la route authentifiée /api/wiki/media/[id] — le wiki n'a
 * pas de vue publique. Nom de fichier = UUID du média (sûr par construction). */

export function wikiMediaDir(): string {
  return process.env.WIKI_MEDIA_DIR ?? join(process.cwd(), ".wiki-media");
}

export async function ecrireMediaWiki(mediaId: string, contenu: Buffer): Promise<string> {
  const dir = wikiMediaDir();
  await mkdir(dir, { recursive: true });
  const chemin = join(dir, mediaId);
  await writeFile(chemin, contenu);
  return chemin;
}

export function lireMediaWiki(chemin: string): Promise<Buffer> {
  return readFile(chemin);
}

export async function supprimerMediaWiki(chemin: string): Promise<void> {
  await rm(chemin, { force: true }).catch(() => {});
}
