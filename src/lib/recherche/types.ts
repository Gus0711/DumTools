// Types de la recherche globale (palette ⌘K) — client-safe : pas de
// "server-only", pas de Prisma. La palette (composant client) les importe ici,
// les requêtes vivent dans queries.ts.

export type TypeResultat = "affaire" | "client" | "projet" | "note" | "visite" | "wiki";

export interface ResultatRecherche {
  type: TypeResultat;
  id: string;
  titre: string;
  /** Ligne de contexte : client, n° Why, rubrique… */
  sousTitre: string;
  href: string;
}

/** Libellé de groupe affiché dans la palette — l'ordre des clés fait l'ordre
 *  d'affichage des groupes. */
export const LIBELLE_TYPE: Record<TypeResultat, string> = {
  affaire: "Affaires",
  client: "Clients",
  projet: "Projet GTB",
  note: "Notes",
  visite: "Visites",
  wiki: "Wiki",
};

/** Longueur minimale de la requête — en dessous, tout ressortirait. */
export const MIN_CARACTERES = 2;
