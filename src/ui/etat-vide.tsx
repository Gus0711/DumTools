import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * État vide « actif » : un écran vide est une invitation à agir, pas un
 * constat en gris. Toujours un titre qui dit ce qui manque, et si possible
 * l'action qui le comble.
 */
export function EtatVide({
  icone: Icone,
  titre,
  texte,
  action,
  compact = false,
  className,
}: {
  icone?: LucideIcon;
  titre: string;
  texte?: React.ReactNode;
  action?: React.ReactNode;
  /** Version resserrée, pour une zone interne (colonne de kanban…). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "anim-fade flex flex-col items-center justify-center text-center",
        compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-12",
        className,
      )}
    >
      {Icone && (
        <span
          aria-hidden
          className={cn(
            "mb-1 flex items-center justify-center border border-dashed border-border bg-surface-2 text-subtle",
            compact ? "h-8 w-8" : "h-11 w-11",
          )}
        >
          <Icone className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
      )}
      <p className={cn("font-display font-semibold text-fg", compact ? "text-sm" : "text-base")}>
        {titre}
      </p>
      {texte && (
        <p className="max-w-sm text-sm leading-relaxed text-muted">{texte}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
