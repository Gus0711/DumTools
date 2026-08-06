import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * En-tête de BLOC — la barre de titre d'une section, posée DANS le cadre.
 *
 * C'est la grammaire de l'accueil (voir `ParcAffaires`, `Fil`, `MesTaches`) :
 * icône à la couleur du signal de l'outil, titre en display, compteur en mono,
 * mention estampillée, actions poussées à droite. Le titre appartient au bloc
 * qu'il annonce — un titre qui flotte au-dessus du cadre ne dit pas à quoi il
 * se rapporte, et deux sections voisines se lisent alors comme une seule.
 *
 * À poser en premier enfant d'un `.bloc`. La teinte vient du `signal-*` du
 * conteneur (`classeSignal(teinte)`) ; sans lui, `--signal` vaut le bleu marine.
 */
export function EnteteBloc({
  icone: Icone,
  titre,
  compteur,
  mention,
  actions,
  className,
}: {
  icone?: LucideIcon;
  titre: React.ReactNode;
  /** Pastille en mono, à droite du titre. Omise quand la section n'a rien à
   *  compter — un « 0 » posé là mentirait. */
  compteur?: number;
  /** Une poignée de mots : ce que la section contient, pas ce qu'elle fait. */
  mention?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bloc-entete flex-wrap gap-y-1.5", className)}>
      {Icone && <Icone className="text-signal h-4 w-4 shrink-0" />}
      <h2 className="font-display text-sm font-semibold text-fg">{titre}</h2>
      {compteur != null && (
        <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted">
          {compteur}
        </span>
      )}
      {mention && <span className="stamp min-w-0 truncate">{mention}</span>}
      {actions && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * En-tête de section — le repère qui structure une fiche longue.
 * Libellé estampillé, compteur, filet qui court jusqu'aux actions : la même
 * grammaire que le cartouche, un cran plus bas dans la hiérarchie.
 *
 * ⚠️ Titre POSÉ AU-DESSUS du cadre. Sur une fiche faite de blocs (l'affaire,
 * l'accueil), préférer `EnteteBloc` — le titre entre alors dans le cadre.
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
