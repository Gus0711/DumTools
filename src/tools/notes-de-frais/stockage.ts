import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/* Stockage disque des justificatifs (photos de tickets, PDF de factures).
 * Le binaire vit ICI durablement : il alimente le PDF remis à la compta et fait
 * office de pièce comptable. Hors de public/ : servi uniquement par la route
 * /api/ndf/media/[id], qui vérifie EN PLUS la propriété (données financières
 * nominatives). Nom de fichier = UUID du justificatif → sûr par construction,
 * upload idempotent. Calqué sur src/tools/formulaires/stockage.ts.
 *
 * ⚠️ NDF_MEDIA_DIR est déclaré dans docker-compose.yml avec son volume : sans
 * volume, les justificatifs partent au premier redéploiement. */

export function ndfMediaDir(): string {
  return process.env.NDF_MEDIA_DIR ?? join(process.cwd(), ".ndf-media");
}

export async function ecrireJustificatif(
  id: string,
  contenu: Buffer,
): Promise<string> {
  const dir = ndfMediaDir();
  await mkdir(dir, { recursive: true });
  const chemin = join(dir, id);
  await writeFile(chemin, contenu);
  return chemin;
}

export function lireJustificatif(chemin: string): Promise<Buffer> {
  return readFile(chemin);
}

export async function supprimerJustificatifFichier(
  chemin: string,
): Promise<void> {
  await rm(chemin, { force: true }).catch(() => {});
}
