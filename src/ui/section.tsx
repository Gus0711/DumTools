import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * En-tête de section — le repère qui structure une fiche longue.
 * Libellé estampillé, compteur, filet qui court jusqu'aux actions : la même
 * grammaire que le cartouche, un cran plus bas dans la hiérarchie.
 */
export function EnteteSection({
  icone: Icone,
  titre,
  compteur,
  actions,
  className,
}: {
  icone?: LucideIcon;
  titre: string;
  /** Affiché en pastille à droite du titre ; masqué si non fourni. */
  compteur?: number;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-3", className)}>
      {Icone && <Icone className="h-4 w-4 shrink-0 text-brand" />}
      <h2 className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-fg">
        {titre}
      </h2>
      {compteur != null && (
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted">
          {compteur}
        </span>
      )}
      <span aria-hidden className="h-px flex-1 bg-border-soft" />
      {actions}
    </div>
  );
}
