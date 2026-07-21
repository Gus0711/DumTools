import type { EtatTache } from "@/generated/prisma/enums";

/** Tâche telle que servie au kanban de la fiche affaire (voir listerTaches). */
export interface TacheRow {
  id: string;
  titre: string;
  etat: EtatTache;
  ordre: number;
  assigneId: string | null;
  assigneNom: string | null;
}

/** Utilisateur assignable à une tâche (utilisateur actif). */
export interface AssignableUser {
  id: string;
  nom: string;
}

/** Tâche ouverte assignée à l'utilisateur courant, avec son affaire
 *  (vue « Mes tâches » du tableau de bord Affaires). */
export interface MaTacheRow {
  id: string;
  titre: string;
  etat: EtatTache;
  affaireId: string;
  affaireNom: string;
  clientNom: string;
}

/** Colonnes du kanban, dans l'ordre d'affichage. */
export const COLONNES_TACHES: { etat: EtatTache; label: string; dot: string }[] = [
  { etat: "A_FAIRE", label: "À faire", dot: "bg-subtle" },
  { etat: "EN_COURS", label: "En cours", dot: "bg-accent" },
  { etat: "TERMINEE", label: "Terminé", dot: "bg-success" },
];

/** Initiales d'un nom d'utilisateur (« Augustin Duhant » → « AD »). */
export function initialesNom(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/* Tons d'avatar : classes complètes (jamais composées dynamiquement, sinon
 * Tailwind ne les génère pas), piochées dans les tokens sémantiques E/S. */
const TONS_AVATAR = [
  "bg-io-ai/15 text-io-ai",
  "bg-io-di/15 text-io-di",
  "bg-io-ao/15 text-io-ao",
  "bg-io-do/15 text-io-do",
  "bg-io-com/15 text-io-com",
];

/** Ton d'avatar stable pour un utilisateur donné (hash du nom → palette). */
export function tonAvatar(nom: string): string {
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  return TONS_AVATAR[h % TONS_AVATAR.length];
}
