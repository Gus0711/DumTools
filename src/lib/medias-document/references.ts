/* Médias référencés par un document riche — client-safe (aucun import serveur :
 * les `model.ts` des outils le réexportent vers l'éditeur).
 *
 * Un média est « vivant » tant qu'une URL du document le cite. On ne parcourt
 * pas l'arbre de blocs bloc par bloc : le document est sérialisé et balayé à la
 * regex. C'est volontaire — un média peut être cité par un bloc natif (image,
 * fichier), par un bloc métier maison, ou par un lien inline dans du texte
 * riche ; la seule chose qu'ils ont en commun est l'URL. */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Ids des médias cités par un document.
 *
 * @param prefixe préfixe d'URL de la route média de l'outil, ex. `/api/notes/media/`
 */
export function referencesMedias(contenu: unknown, prefixe: string): Set<string> {
  const ids = new Set<string>();
  const json = JSON.stringify(contenu ?? []);
  // Le préfixe vient du code (jamais d'une saisie), mais on l'échappe quand
  // même : une regex construite par concaténation est un piège classique.
  const re = new RegExp(`${prefixe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(${UUID})`, "gi");
  for (const m of json.matchAll(re)) ids.add(m[1].toLowerCase());
  return ids;
}

/** Fenêtre de grâce avant qu'un média non cité soit considéré orphelin.
 *  Un téléversement n'apparaît dans le document qu'une fois le bloc inséré :
 *  sans ce délai, un autosave déclenché pendant l'envoi supprimerait le média
 *  qui vient d'arriver. */
export const GRACE_ORPHELIN_MS = 5 * 60 * 1000;
