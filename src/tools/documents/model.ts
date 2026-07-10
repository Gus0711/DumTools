// Types & constantes de l'outil « Documents » (GED).
// Client-safe : pas de "server-only" ni de Prisma ici — importé par l'UI ET le
// serveur. Voir la note mémoire ged-documents-kdrive pour l'architecture.

/** Catégories = sous-dossiers kDrive d'entreprise (liste FERMÉE, ordre d'affichage).
 *  Chaque valeur correspond littéralement au nom du sous-dossier kDrive de l'affaire. */
export const CATEGORIES = [
  "Achat",
  "Administratif",
  "Armoire",
  "Documentation",
  "Prog",
  "Public",
  "Vente",
] as const;

export type Categorie = (typeof CATEGORIES)[number];

export function estCategorie(v: string): v is Categorie {
  return (CATEGORIES as readonly string[]).includes(v);
}

/** Taille maximale d'un fichier (500 Mo). */
export const TAILLE_MAX = 500 * 1024 * 1024;

export type StatutSync = "EN_ATTENTE" | "EN_COURS" | "SYNC" | "ERREUR";

export const STATUT_LABEL: Record<StatutSync, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "Synchro…",
  SYNC: "Sur kDrive",
  ERREUR: "Échec",
};

/** Ton sémantique pour le badge de statut (utilitaires du design system). */
export const STATUT_TON: Record<StatutSync, string> = {
  EN_ATTENTE: "bg-surface-2 text-muted",
  EN_COURS: "bg-surface-2 text-brand",
  SYNC: "bg-io-do/10 text-io-do",
  ERREUR: "bg-danger/10 text-danger",
};

export type PolitiqueConflit = "VERSION" | "RENAME";

/** Formate une taille d'octets en Ko/Mo lisible. */
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}
