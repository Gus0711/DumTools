import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/* Stockage disque des médias de note (images collées, pièces jointes).
 * Même patron que les visites (binaire durable sur la VM, hors public/) :
 * servi par la route authentifiée /api/notes/media/[id], ou par la route
 * publique scopée au jeton pour une note partagée.
 * Nom de fichier = UUID du média (sûr par construction). */

export function notesMediaDir(): string {
  return process.env.NOTES_MEDIA_DIR ?? join(process.cwd(), ".notes-media");
}

export async function ecrireMediaNote(mediaId: string, contenu: Buffer): Promise<string> {
  const dir = notesMediaDir();
  await mkdir(dir, { recursive: true });
  const chemin = join(dir, mediaId);
  await writeFile(chemin, contenu);
  return chemin;
}

export function lireMediaNote(chemin: string): Promise<Buffer> {
  return readFile(chemin);
}

export async function supprimerMediaNote(chemin: string): Promise<void> {
  await rm(chemin, { force: true }).catch(() => {});
}
