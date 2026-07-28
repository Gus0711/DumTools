import { cn } from "@/lib/cn";
import { IO_LABEL, type IoType } from "./badge";

/* =============================================================================
 * JAUGE DE SIGNAUX E/S
 *
 * Répartition des entrées/sorties d'un automate. Deux règles non négociables :
 *
 * 1. L'ordre est FIXE — AI · DI · AO · DO · COM (entrées, sorties, puis bus).
 *    Jamais trié par valeur : la couleur suit le type, jamais son rang.
 * 2. La couleur ne porte JAMAIS l'information seule. Les teintes E/S sont
 *    contractuelles (elles sont imprimées sur les documents remis au client) et
 *    deux d'entre elles — DO vert et COM turquoise — sont trop proches pour
 *    être distinguées de façon fiable, y compris en vision normale. Chaque
 *    segment porte donc son sigle et son compte en clair ; la couleur ne fait
 *    que redoubler l'information.
 * ========================================================================== */

const ORDRE: IoType[] = ["AI", "DI", "AO", "DO", "COM"];

const FOND: Record<IoType, string> = {
  AI: "bg-io-ai",
  DI: "bg-io-di",
  AO: "bg-io-ao",
  DO: "bg-io-do",
  COM: "bg-io-com",
};

export type CompteES = Partial<Record<IoType, number>>;

export function JaugeES({
  compte,
  className,
}: {
  compte: CompteES;
  className?: string;
}) {
  const presents = ORDRE.map((t) => ({ type: t, n: compte[t] ?? 0 })).filter((s) => s.n > 0);
  const total = presents.reduce((s, x) => s + x.n, 0);

  if (total === 0) {
    return (
      <p className={cn("text-sm text-subtle", className)}>Aucune entrée/sortie déclarée.</p>
    );
  }

  return (
    <div className={className}>
      {/* Libellés directs — c'est eux qui portent l'information. */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        {presents.map((s) => (
          <span key={s.type} className="inline-flex items-baseline gap-1.5" title={IO_LABEL[s.type]}>
            <span aria-hidden className={cn("h-2 w-2 translate-y-px rounded-[1px]", FOND[s.type])} />
            <span className="font-mono text-xs font-semibold text-muted">{s.type}</span>
            <span className="font-display text-sm font-bold tabular-nums text-fg">{s.n}</span>
          </span>
        ))}
      </div>

      {/* Barre proportionnelle. Le filet de 2px entre segments est du fond de
          surface : sans lui, deux teintes voisines se soudent visuellement.
          Les segments poussent depuis zéro, dans l'ordre AI→COM : on voit la
          répartition se composer au lieu de la trouver déjà là. */}
      <div className="jauge jauge-anim" role="img" aria-label={resume(presents)}>
        {presents.map((s) => (
          <span
            key={s.type}
            className={FOND[s.type]}
            style={{ flexGrow: s.n, flexBasis: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

function resume(segments: { type: IoType; n: number }[]) {
  return `Répartition des E/S : ${segments.map((s) => `${s.n} ${IO_LABEL[s.type]}`).join(", ")}.`;
}
