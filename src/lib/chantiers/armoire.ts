// Constantes « Besoin armoire » — client-safe (pas de "server-only" ni de
// Prisma), réutilisées par le sélecteur de la fiche affaire ET le serveur.
import type { BesoinArmoire } from "@/generated/prisma/enums";

/** Dossier kDrive (catégorie de document) où doit se trouver le schéma d'armoire. */
export const DOSSIER_SCHEMA_ARMOIRE = "Armoire";

/** Choix de besoin en armoire, dans l'ordre d'affichage. `null` = non défini. */
export const BESOINS_ARMOIRE: { value: BesoinArmoire; label: string }[] = [
  { value: "INTEGRATION", label: "Intégration (existant)" },
  { value: "NOUVELLE", label: "Nouvelle armoire" },
];

export function besoinArmoireLabel(besoin: BesoinArmoire | null | undefined): string {
  if (!besoin) return "Non défini";
  return BESOINS_ARMOIRE.find((b) => b.value === besoin)?.label ?? besoin;
}
