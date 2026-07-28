import { cn } from "@/lib/cn";
import type { EtatAffaire } from "@/generated/prisma/enums";
import { CYCLE_AFFAIRE, etatLabel } from "./etats";

/** Ton (fond + texte) par état — partagé par le badge et les puces de filtre. */
export const ETAT_TONE: Record<EtatAffaire, string> = {
  DEVIS: "bg-accent/12 text-accent",
  COMMANDE: "bg-brand/12 text-brand",
  EN_COURS: "bg-io-ai/12 text-io-ai",
  LIVRE: "bg-success/12 text-success",
  CLOTURE: "bg-surface-2 text-subtle",
  CORBEILLE: "bg-danger/10 text-danger",
};

/** Pastille de statut : la couleur seule ne suffit pas, le point la redouble. */
const ETAT_POINT: Record<EtatAffaire, string> = {
  DEVIS: "bg-accent",
  COMMANDE: "bg-brand",
  EN_COURS: "bg-io-ai",
  LIVRE: "bg-success",
  CLOTURE: "bg-subtle",
  CORBEILLE: "bg-danger",
};

export function EtatBadge({ etat, className }: { etat: EtatAffaire; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        ETAT_TONE[etat],
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", ETAT_POINT[etat])} />
      {etatLabel(etat)}
    </span>
  );
}

/* =============================================================================
 * LE SYNOPTIQUE MINIATURE
 * Le même schéma que la frise de la fiche Affaire, réduit à cinq voyants : où
 * en est l'affaire dans son cycle commercial, lisible dans une ligne de
 * tableau. L'affaire est le pivot de la plateforme, elle porte donc le laiton
 * et non un signal E/S.
 *
 * Purement redondant : il accompagne TOUJOURS le badge d'état, qui porte le
 * libellé. Corbeille exclue — ce n'est pas une étape, c'est une sortie de
 * piste, et l'afficher comme un 6ᵉ voyant laisserait croire à une fin de cycle.
 * ========================================================================== */
export function SynoptiqueMini({ etat, className }: { etat: EtatAffaire; className?: string }) {
  if (etat === "CORBEILLE") return null;
  const rang = CYCLE_AFFAIRE.findIndex((e) => e.value === etat);

  return (
    <span
      aria-hidden
      title={`Cycle : ${etatLabel(etat)} (${rang + 1}/${CYCLE_AFFAIRE.length})`}
      className={cn("signal-accent inline-flex shrink-0 items-center gap-[3px]", className)}
    >
      {CYCLE_AFFAIRE.map((e, i) => (
        <span
          key={e.value}
          className={cn(
            "led h-[7px] w-[7px]",
            i < rang && "led-on",
            i === rang && "led-cur",
          )}
        />
      ))}
    </span>
  );
}
