import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/ui";
import { toolsDeProprietaire, type EspacePerso } from "@/tools/registry";

/**
 * Carte d'un espace perso sur l'accueil (ex. « ToolGus »). Volontairement
 * distincte des cartes d'outils métier : elle mène à `/perso/{slug}` où l'on
 * retrouve les outils de la personne, à l'écart du reste.
 */
export function EspacePersoCard({ espace }: { espace: EspacePerso }) {
  const { icon: Icon, nom, description, slug } = espace;
  const nb = toolsDeProprietaire(slug).length;

  return (
    <Link href={`/perso/${slug}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg">
        <span aria-hidden className="rule-accent absolute inset-x-0 top-0 h-0.5" />
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-brand/10 bg-brand-soft text-brand">
            <Icon className="h-7 w-7" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-lg font-semibold tracking-tight text-fg">
                {nom}
              </h3>
              <Badge tone="neutral">Espace perso</Badge>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
                {nb} outil{nb > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              {description}
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-brand sm:self-auto">
            Ouvrir
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}
