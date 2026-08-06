// Constantes d'état d'affaire — client-safe (pas de "server-only" ni de Prisma),
// réutilisées par les composants (badge, sélecteur) ET les requêtes serveur.
import type { EtatAffaire } from "@/generated/prisma/enums";

/** États d'une affaire, dans l'ordre du cycle de vie (le financier reste dans Why).
 *  CORBEILLE = mise de côté (perdue / erreur), masquée par défaut du tableau de bord.
 *
 *  `aide` dit ce que l'étape SIGNIFIE, en langage de chantier. Un libellé seul
 *  (« Commande ») ne suffit pas à quelqu'un qui découvre l'outil : il ne sait ni
 *  ce qu'il déclare en cliquant, ni quand le faire. C'est affiché sous le rail
 *  du cycle sur la fiche Affaire, et repris en infobulle. */
export const ETATS_AFFAIRE: { value: EtatAffaire; label: string; aide: string }[] = [
  {
    value: "DEVIS",
    label: "Devis",
    aide: "Chiffrage remis au client — on attend sa réponse, rien n'est engagé.",
  },
  {
    value: "COMMANDE",
    label: "Commande",
    aide: "Le client a commandé. Les travaux ne sont pas encore lancés.",
  },
  {
    value: "EN_COURS",
    label: "En cours",
    aide: "Au travail : étude, armoire, programmation, mise en service.",
  },
  {
    value: "LIVRE",
    label: "Livrée",
    aide: "Installation remise au client et en service. Reste la levée des réserves.",
  },
  {
    value: "CLOTURE",
    label: "Clôturée",
    aide: "Tout est soldé — plus rien à faire sur cette affaire.",
  },
  {
    value: "CORBEILLE",
    label: "Corbeille",
    aide: "Mise de côté : affaire perdue, doublon ou saisie par erreur.",
  },
];

/** Le cycle de vie proprement dit (Corbeille exclue : ce n'est pas une étape,
 *  c'est une sortie de piste). Sert au fil d'étapes de la fiche Affaire. */
export const CYCLE_AFFAIRE = ETATS_AFFAIRE.filter((e) => e.value !== "CORBEILLE");

/** Ce qu'« affaire active » VEUT DIRE — sert aux compteurs (accueil, chiffres
 *  du tableau de bord) et aux extraits de parc. */
export const ETATS_ACTIFS: EtatAffaire[] = ["DEVIS", "COMMANDE", "EN_COURS"];

/** Les puces cochées à l'OUVERTURE de la liste des affaires. Plus étroit que
 *  `ETATS_ACTIFS` : à l'ouverture on veut ce sur quoi on travaille, pas les
 *  chiffrages en attente de réponse. Les autres états restent à un clic, et
 *  leur puce annonce déjà son compte. */
export const ETATS_VUE_DEFAUT: EtatAffaire[] = ["EN_COURS"];

export function etatLabel(etat: EtatAffaire): string {
  return ETATS_AFFAIRE.find((e) => e.value === etat)?.label ?? etat;
}

export function etatAide(etat: EtatAffaire): string {
  return ETATS_AFFAIRE.find((e) => e.value === etat)?.aide ?? "";
}

/** L'étape SUIVANTE du cycle, ou null si l'affaire est au bout (ou à la
 *  corbeille, qui n'est pas une étape). Sert au bouton d'action explicite : le
 *  rail dit où on en est, le bouton dit quoi faire ensuite. */
export function etapeSuivante(etat: EtatAffaire): { value: EtatAffaire; label: string } | null {
  const i = CYCLE_AFFAIRE.findIndex((e) => e.value === etat);
  if (i < 0 || i >= CYCLE_AFFAIRE.length - 1) return null;
  const suivante = CYCLE_AFFAIRE[i + 1];
  return { value: suivante.value, label: suivante.label };
}
