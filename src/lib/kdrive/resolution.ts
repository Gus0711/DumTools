import "server-only";
import { segmentsEgaux } from "./normalize";
import { listChildren, createDir, rootDirId, type KdriveEntry } from "./client";

/* Résolution de l'arborescence kDrive PRÉEXISTANTE.
 * Principe « réutilise sinon crée » : on navigue depuis la racine, on matche
 * chaque segment en NORMALISÉ (casse/accents/tirets/espaces) pour réutiliser le
 * dossier déjà rangé à la main, et on ne CRÉE que le maillon manquant. Jamais de
 * création aveugle par chemin (qui dupliquerait des dossiers de prod). */

/** Chemin logique (informatif) affiché/stocké sur le Document. */
export function buildKdrivePath(
  annee: number,
  clientDossier: string,
  affaireNom: string,
  categorie: string,
): string {
  return ["chantier", String(annee), clientDossier, affaireNom, categorie].join("/");
}

/** Réutilise le sous-dossier `name` de `parentId` s'il existe (match normalisé),
 *  sinon le crée. Renvoie son id kDrive. */
export async function resolveDir(parentId: string, name: string): Promise<string> {
  const enfants = await listChildren(parentId);
  const existant = enfants.find(
    (e: KdriveEntry) => e.type === "dir" && segmentsEgaux(e.name, name),
  );
  if (existant) return existant.id;
  const cree = await createDir(parentId, name);
  return cree.id;
}

/** Résout (en réutilisant l'existant) le dossier de l'affaire :
 *  chantier/{année}/{Client}/{Affaire}. Renvoie son id — à cacher sur Chantier. */
export async function resolveAffaireDirId(
  annee: number,
  clientDossier: string,
  affaireNom: string,
): Promise<string> {
  let dir = rootDirId();
  dir = await resolveDir(dir, String(annee));
  dir = await resolveDir(dir, clientDossier);
  dir = await resolveDir(dir, affaireNom);
  return dir;
}

/** Résout le sous-dossier de catégorie sous le dossier d'affaire. */
export function resolveCategorieDirId(
  affaireDirId: string,
  categorie: string,
): Promise<string> {
  return resolveDir(affaireDirId, categorie);
}
