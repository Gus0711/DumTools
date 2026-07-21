import { Check, CircleDashed, CircleDot, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { EtatJalon, Jalon } from "./jalons";

/* Frise du cycle d'une affaire (docs/ROADMAP.md §3) — 7 étapes métier, état
 * dérivé des artefacts réels (voir jalons.ts). Purement informatif : rien n'est
 * cliquable ni cochable, c'est un miroir de l'état de l'affaire. */

const TON: Record<EtatJalon, { pastille: string; texte: string; icone: typeof Check }> = {
  fait: {
    pastille: "border-success/40 bg-success/12 text-success",
    texte: "text-fg",
    icone: Check,
  },
  encours: {
    pastille: "border-accent/45 bg-accent/12 text-accent",
    texte: "text-fg",
    icone: CircleDot,
  },
  attente: {
    pastille: "border-border bg-surface-2 text-subtle",
    texte: "text-muted",
    icone: CircleDashed,
  },
  sansobjet: {
    pastille: "border-dashed border-border bg-transparent text-subtle",
    texte: "text-subtle",
    icone: Minus,
  },
};

export function FriseCycle({ jalons }: { jalons: Jalon[] }) {
  return (
    <section aria-label="Avancement technique de l'affaire" className="data-card overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-surface-2 px-4 py-2">
        <h2 className="text-sm font-semibold text-fg">Avancement</h2>
        <p className="text-xs text-subtle">
          déduit de ce qui a réellement été produit — rien à cocher
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-7">
        {jalons.map((j) => {
          const ton = TON[j.etat];
          const Icone = ton.icone;
          return (
            <li key={j.cle} className="flex items-start gap-2.5 bg-surface px-3 py-3">
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                  ton.pastille,
                )}
              >
                <Icone className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className={cn("block truncate text-sm font-medium", ton.texte)}>
                  {j.libelle}
                </span>
                <span className="block text-xs leading-snug text-subtle">{j.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
