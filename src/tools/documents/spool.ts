import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

/* Tampon transitoire (« spool ») : le binaire n'est PAS conservé durablement sur
 * la VM (kDrive maître seul). Il vit ici entre le dépôt et le push kDrive, puis
 * est effacé dès SYNC (voir src/lib/kdrive). Répertoire volontairement hors du
 * dossier public : servi uniquement via la route de download authentifiée. */

export function spoolDir(): string {
  return process.env.DOCUMENTS_SPOOL_DIR ?? join(process.cwd(), ".spool");
}

/** Nettoie un nom de fichier pour un usage sûr sur le disque du spool. */
function nomSur(nom: string): string {
  return nom.replace(/[^\w.\- ]+/g, "_").slice(0, 180) || "fichier";
}

/** Écrit un flux (ou un buffer) de fichier déposé dans le spool. Renvoie le chemin. */
export async function ecrireSpool(
  documentId: string,
  nom: string,
  contenu: ReadableStream<Uint8Array> | Buffer,
): Promise<string> {
  const dir = spoolDir();
  await mkdir(dir, { recursive: true });
  const chemin = join(dir, `${documentId}-${nomSur(nom)}`);
  if (Buffer.isBuffer(contenu)) {
    await writeFile(chemin, contenu);
  } else {
    const source = Readable.fromWeb(
      contenu as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    await pipeline(source, createWriteStream(chemin));
  }
  return chemin;
}
