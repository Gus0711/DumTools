import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/* Stockage disque des médias d'une réponse de formulaire (photos, signatures).
 * Le binaire vit ICI durablement (il alimente la fiche réponse et le PDF).
 * Hors de public/ : servi uniquement par la route authentifiée
 * /api/formulaires/media/[id]. Nom de fichier = UUID du média (sûr par
 * construction, upload idempotent). Calqué sur src/tools/visites/stockage.ts. */

export function formulairesMediaDir(): string {
  return (
    process.env.FORMULAIRES_MEDIA_DIR ??
    join(process.cwd(), ".formulaires-media")
  );
}

export async function ecrireMediaFormulaire(
  mediaId: string,
  contenu: Buffer,
): Promise<string> {
  const dir = formulairesMediaDir();
  await mkdir(dir, { recursive: true });
  const chemin = join(dir, mediaId);
  await writeFile(chemin, contenu);
  return chemin;
}

export function lireMediaFormulaire(chemin: string): Promise<Buffer> {
  return readFile(chemin);
}

export async function supprimerMediaFormulaire(chemin: string): Promise<void> {
  await rm(chemin, { force: true }).catch(() => {});
}
