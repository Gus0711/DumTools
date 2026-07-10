// Constantes d'état d'affaire — client-safe (pas de "server-only" ni de Prisma),
// réutilisées par les composants (badge, sélecteur) ET les requêtes serveur.
import type { EtatAffaire } from "@/generated/prisma/enums";

/** États d'une affaire, dans l'ordre du cycle de vie (le financier reste dans Why). */
export const ETATS_AFFAIRE: { value: EtatAffaire; label: string }[] = [
  { value: "DEVIS", label: "Devis" },
  { value: "COMMANDE", label: "Commande" },
  { value: "EN_COURS", label: "En cours" },
  { value: "LIVRE", label: "Livrée" },
  { value: "CLOTURE", label: "Clôturée" },
];

export function etatLabel(etat: EtatAffaire): string {
  return ETATS_AFFAIRE.find((e) => e.value === etat)?.label ?? etat;
}
