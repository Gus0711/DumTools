/* Partage public par jeton — règles communes aux Notes et au Wiki.
 * Client-safe (aucun import serveur) : le panneau de partage et les routes
 * publiques lisent les mêmes règles.
 *
 * Deux états seulement, et un seul point de vérité pour les distinguer :
 * `partageActif`. La PRÉSENCE d'un jeton ne suffit jamais — un jeton échu reste
 * en base pour que l'auteur puisse prolonger le partage sans redistribuer une
 * nouvelle URL, donc tout code qui teste `if (jetonPartage)` est un trou. */

export interface EtatPartage {
  jetonPartage: string | null;
  /** null = sans échéance. */
  partageExpireLe: Date | null;
}

/** Le lien fonctionne-t-il, maintenant ? */
export function partageActif(etat: EtatPartage, maintenant: Date = new Date()): boolean {
  if (!etat.jetonPartage) return false;
  if (etat.partageExpireLe === null) return true;
  return etat.partageExpireLe.getTime() > maintenant.getTime();
}

/** Un jeton posé mais dépassé — l'auteur peut le prolonger, le lecteur non. */
export function partageEchu(etat: EtatPartage, maintenant: Date = new Date()): boolean {
  return !!etat.jetonPartage && !partageActif(etat, maintenant);
}

/* --- Durées proposées à l'interface ------------------------------------------ */

export interface DureePartage {
  id: string;
  libelle: string;
  /** null = sans échéance (réservé aux notes : le wiki est temporaire par nature). */
  heures: number | null;
}

export const DUREES_PARTAGE: DureePartage[] = [
  { id: "24h", libelle: "24 heures", heures: 24 },
  { id: "7j", libelle: "7 jours", heures: 24 * 7 },
  { id: "30j", libelle: "30 jours", heures: 24 * 30 },
  { id: "illimite", libelle: "Sans limite", heures: null },
];

/** Durées d'une page de wiki : pas d'illimité. Le wiki est la base de
 *  connaissances INTERNE — on en sort une page pour une raison et une période,
 *  jamais « pour toujours au cas où ». */
export const DUREES_PARTAGE_WIKI = DUREES_PARTAGE.filter((d) => d.heures !== null);

export function dureeParId(id: string, choix: DureePartage[] = DUREES_PARTAGE): DureePartage | null {
  return choix.find((d) => d.id === id) ?? null;
}

/** Échéance absolue d'une durée relative (null = sans limite). */
export function echeanceDepuis(heures: number | null, maintenant: Date = new Date()): Date | null {
  if (heures === null) return null;
  return new Date(maintenant.getTime() + heures * 3600 * 1000);
}

/* --- Libellés ---------------------------------------------------------------- */

/** « expire dans 3 jours », « expire dans 5 heures », « expiré depuis hier ».
 *  Volontairement approximatif : personne ne lit une échéance de partage à la
 *  minute près, et un compte à rebours exact demanderait un rendu client. */
export function libelleEcheance(expireLe: Date | null, maintenant: Date = new Date()): string {
  if (expireLe === null) return "Sans échéance";

  const ms = expireLe.getTime() - maintenant.getTime();
  const passe = ms < 0;
  const heures = Math.floor(Math.abs(ms) / 3600_000);

  let quantite: string;
  if (heures < 1) quantite = "moins d'une heure";
  else if (heures < 24) quantite = `${heures} heure${heures > 1 ? "s" : ""}`;
  else {
    const jours = Math.floor(heures / 24);
    quantite = `${jours} jour${jours > 1 ? "s" : ""}`;
  }

  return passe ? `Expiré depuis ${quantite}` : `Expire dans ${quantite}`;
}

/** Date d'échéance en toutes lettres, pour l'infobulle et la vue publique. */
export function dateEcheance(expireLe: Date): string {
  return expireLe.toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
