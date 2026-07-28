import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dessin, type NomDessin } from "./dessins";

/**
 * État vide « actif » : un écran vide est une invitation à agir, pas un
 * constat en gris. Toujours un titre qui dit ce qui manque, et si possible
 * l'action qui le comble.
 *
 * Préférer `dessin` à `icone` : un dessin du monde GTB (bornier vide, automate
 * sans modules…) dit la même chose qu'une icône, en donnant une gueule à
 * l'écran. `icone` reste pour les vides sans équivalent dessiné.
 */
export function EtatVide({
  icone: Icone,
  dessin,
  titre,
  texte,
  action,
  compact = false,
  className,
}: {
  icone?: LucideIcon;
  dessin?: NomDessin;
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
      {dessin ? (
        <Dessin nom={dessin} petit={compact} className="mb-2" />
      ) : (
        Icone && (
          <span
            aria-hidden
            className={cn(
              "mb-1 flex items-center justify-center border border-dashed border-border bg-surface-2 text-subtle",
              compact ? "h-8 w-8" : "h-11 w-11",
            )}
          >
            <Icone className={compact ? "h-4 w-4" : "h-5 w-5"} />
          </span>
        )
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
