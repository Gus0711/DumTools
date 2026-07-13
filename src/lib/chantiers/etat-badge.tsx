import { cn } from "@/lib/cn";
import type { EtatAffaire } from "@/generated/prisma/enums";
import { etatLabel } from "./etats";

/** Ton (fond + texte) par état — partagé par le badge et les puces de filtre. */
export const ETAT_TONE: Record<EtatAffaire, string> = {
  DEVIS: "bg-accent/12 text-accent",
  COMMANDE: "bg-brand/12 text-brand",
  EN_COURS: "bg-io-ai/12 text-io-ai",
  LIVRE: "bg-success/12 text-success",
  CLOTURE: "bg-surface-2 text-subtle",
  CORBEILLE: "bg-danger/10 text-danger",
};

export function EtatBadge({ etat, className }: { etat: EtatAffaire; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        ETAT_TONE[etat],
        className,
      )}
    >
      {etatLabel(etat)}
    </span>
  );
}
