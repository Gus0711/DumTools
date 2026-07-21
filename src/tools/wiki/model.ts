/* Modèle de l'outil « Wiki » — types client-safe partagés entre l'éditeur
 * (client) et les queries/actions (serveur). Aucun import serveur ici.
 *
 * Le contenu d'une page est le document de l'éditeur BlockNote : un tableau de
 * blocs JSON. On réutilise le schéma et les helpers de texte de l'outil Notes
 * (mêmes blocs), seul le stockage des médias diffère (préfixe /api/wiki/…). */

import { extraireTexte, resumeNote } from "@/tools/notes/model";

export type WikiContenu = unknown[];

// Réexport des helpers de texte génériques (index, recherche, résumé).
export { extraireTexte, resumeNote };

/* --- Tags : slug canonique ---------------------------------------------------
 * La recherche à facettes (docs/RECHERCHE-WIKI.md, Étape 1) traite les tags comme
 * une DIMENSION STRUCTURÉE : on stocke leur slug normalisé dans WikiPage.tagSlugs
 * (text[] + index GIN) et on filtre par ensembles (ET/OU/SANS). Pour que « N4 »,
 * « n4 » et « N4 » (espace) désignent le même tag, on canonicalise :
 *   minuscule → dé-accentué (NFD/strip) → tout non-[a-z0-9] en tiret → tirets rognés.
 * Doit rester IDENTIQUE au backfill SQL de la migration wiki_tags_facette
 * (translate des diacritiques français). Idempotent : slugTag(slugTag(x)) = slugTag(x)
 * → on peut l'appliquer aussi bien sur un libellé que sur un slug déjà normalisé. */
export function slugTag(nom: string): string {
  return (nom ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slugs de tags dédupliqués (vides retirés) — forme stockée dans WikiPage.tagSlugs. */
export function slugsTags(noms: string[]): string[] {
  return [...new Set((noms ?? []).map(slugTag).filter(Boolean))];
}

/* --- Recherche : filtres à facettes ------------------------------------------
 * Combinés au match plein-texte : d'abord on filtre par la dimension sélective
 * (tags/rubrique/auteur), puis on classe le reste par pertinence. Les tags sont
 * des SLUGS (slugTag) ; les fonctions serveur les re-normalisent par sécurité,
 * donc un libellé ou un slug sont tous deux acceptés. */
export interface FiltresWiki {
  /** La page doit porter TOUS ces tags (intersection, opérateur @>). */
  tagsEt?: string[];
  /** La page doit porter AU MOINS UN de ces tags (chevauchement, opérateur &&). */
  tagsOu?: string[];
  /** La page ne doit porter AUCUN de ces tags (exclusion, NOT &&). */
  tagsSauf?: string[];
  /** Restreindre à une rubrique (slug). */
  rubriqueSlug?: string;
  /** Restreindre à un auteur (id utilisateur). */
  auteurId?: string;
}

/* --- Médias ------------------------------------------------------------------ */

/** Images collées + pièces jointes : 50 Mo de marge (comme les notes). */
export const TAILLE_MAX_MEDIA_WIKI = 50 * 1024 * 1024;

/** URL canonique d'un média de page wiki. Route AUTHENTIFIÉE : le wiki est
 *  100 % interne (aucune vue publique, contrairement aux notes partagées). */
export function urlMediaWiki(mediaId: string): string {
  return `/api/wiki/media/${mediaId}`;
}

/** Extrait les ids de médias référencés par un document (pour la purge des
 *  médias orphelins au save). */
export function mediasReferences(contenu: WikiContenu): Set<string> {
  const ids = new Set<string>();
  const json = JSON.stringify(contenu ?? []);
  const re = /\/api\/wiki\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  for (const m of json.matchAll(re)) ids.add(m[1].toLowerCase());
  return ids;
}

/* --- Recherche : surlignage des extraits -------------------------------------
 * ts_headline encadre les termes trouvés par ces marqueurs (caractères de
 * contrôle, jamais présents dans du texte réel → aucune collision, et rien à
 * échapper : on n'injecte pas de HTML, on découpe en segments pour React). */

export const MARQUEUR_DEBUT = "\u0001";
export const MARQUEUR_FIN = "\u0002";

export interface SegmentSurligne {
  texte: string;
  /** true = terme trouvé (à mettre en évidence). */
  fort: boolean;
}

/** Découpe un extrait ts_headline en segments (normal / surligné). */
export function segmentsSurlignes(extrait: string): SegmentSurligne[] {
  const out: SegmentSurligne[] = [];
  const re = new RegExp(`${MARQUEUR_DEBUT}([^${MARQUEUR_FIN}]*)${MARQUEUR_FIN}`, "g");
  let dernier = 0;
  for (const m of extrait.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > dernier) out.push({ texte: extrait.slice(dernier, i), fort: false });
    out.push({ texte: m[1], fort: true });
    dernier = i + m[0].length;
  }
  if (dernier < extrait.length) out.push({ texte: extrait.slice(dernier), fort: false });
  return out;
}
