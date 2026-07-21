// Constantes d'état d'affaire — client-safe (pas de "server-only" ni de Prisma),
// réutilisées par les composants (badge, sélecteur) ET les requêtes serveur.
import type { EtatAffaire } from "@/generated/prisma/enums";

/** États d'une affaire, dans l'ordre du cycle de vie (le financier reste dans Why).
 *  CORBEILLE = mise de côté (perdue / erreur), masquée par défaut du tableau de bord. */
export const ETATS_AFFAIRE: { value: EtatAffaire; label: string }[] = [
  { value: "DEVIS", label: "Devis" },
  { value: "COMMANDE", label: "Commande" },
  { value: "EN_COURS", label: "En cours" },
  { value: "LIVRE", label: "Livrée" },
  { value: "CLOTURE", label: "Clôturée" },
  { value: "CORBEILLE", label: "Corbeille" },
];

/** Le cycle de vie proprement dit (Corbeille exclue : ce n'est pas une étape,
 *  c'est une sortie de piste). Sert au fil d'étapes de la fiche Affaire. */
export const CYCLE_AFFAIRE = ETATS_AFFAIRE.filter((e) => e.value !== "CORBEILLE");

/** États affichés par défaut sur le tableau de bord (affaires « actives »). */
export const ETATS_ACTIFS: EtatAffaire[] = ["DEVIS", "COMMANDE", "EN_COURS"];

export function etatLabel(etat: EtatAffaire): string {
  return ETATS_AFFAIRE.find((e) => e.value === etat)?.label ?? etat;
}
