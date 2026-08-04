import "server-only";
import { supprimerMedia } from "./stockage";
import { GRACE_ORPHELIN_MS, referencesMedias } from "./references";

/**
 * Supprime — du disque puis de la base — les médias qu'un document ne cite
 * plus. Appelé après chaque sauvegarde acceptée.
 *
 * L'ordre compte : le binaire d'abord, la ligne ensuite. Si le processus meurt
 * entre les deux, il reste une ligne sans fichier (la route répond 410, la
 * purge suivante la nettoie) — l'inverse laisserait un fichier que plus rien ne
 * référence, donc invisible et éternel.
 *
 * `candidats` reçoit les ids à ÉPARGNER et l'instant avant lequel un média non
 * cité est considéré perdu (cf. GRACE_ORPHELIN_MS) ; c'est l'appelant qui tient
 * la requête Prisma, donc le modèle reste typé.
 */
export async function purgerMediasOrphelins<M extends { id: string; fichier: string }>(cfg: {
  contenu: unknown;
  /** Préfixe d'URL de la route média de l'outil (`/api/notes/media/`). */
  prefixeUrl: string;
  candidats(gardes: string[], avant: Date): Promise<M[]>;
  oublier(ids: string[]): Promise<void>;
}): Promise<void> {
  const gardes = [...referencesMedias(cfg.contenu, cfg.prefixeUrl)];
  const avant = new Date(Date.now() - GRACE_ORPHELIN_MS);

  const orphelins = await cfg.candidats(gardes, avant);
  if (orphelins.length === 0) return;

  await Promise.all(orphelins.map((m) => supprimerMedia(m.fichier)));
  await cfg.oublier(orphelins.map((m) => m.id));
}
