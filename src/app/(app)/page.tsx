import Link from "next/link";
import { ArrowRight, Briefcase } from "lucide-react";
import { Badge } from "@/ui";
import { FeaturedToolCard, ToolCard } from "@/components/tool-card";
import { TOOLS } from "@/tools/registry";

export default function AccueilPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">
      {/* Héros — bande marine « plan d'architecte ». Pose l'univers GTB avant
          d'entrer dans les outils. */}
      <section className="bg-brand-gradient text-brand-fg relative mb-9 overflow-hidden rounded-2xl shadow-lg">
        <div
          aria-hidden
          className="blueprint-grid pointer-events-none absolute inset-0"
        />
        {/* Filet de signaux E/S — la « langue » couleur du métier. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 flex h-1"
        >
          <span className="flex-1 bg-io-ai" />
          <span className="flex-1 bg-io-di" />
          <span className="flex-1 bg-io-ao" />
          <span className="flex-1 bg-io-do" />
          <span className="flex-1 bg-io-com" />
        </div>

        <div className="relative px-7 py-9 md:px-10 md:py-11">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-muted">
            Groupe Fareneït · Dumortier
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
            La boîte à outils de la GTB, réunie au même endroit.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-sidebar-fg/85">
            Listes de points, affectation des E/S, base matériel et référentiel
            client — partagés avec toute l’équipe.
          </p>
        </div>
      </section>

      {/* Affaires — le pivot de la plateforme, au-dessus des outils. */}
      <section aria-label="Affaires" className="mb-9">
        <Link href="/affaires" className="group block">
          <div className="relative overflow-hidden rounded-2xl border border-brand/25 bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg">
            <span aria-hidden className="rule-accent absolute inset-x-0 top-0 h-0.5" />
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-7">
              <div className="bg-brand-gradient relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-md">
                <span aria-hidden className="blueprint-grid absolute inset-0" />
                <Briefcase className="relative h-9 w-9 text-white" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-fg">
                    Affaires
                  </h2>
                  <Badge tone="accent">Point d&apos;entrée</Badge>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  Le pivot de la plateforme : une affaire par numéro Why, qui regroupe tout ce
                  qui est produit pour un client à travers tous les outils. Client, n° Why et
                  suivi partent d&apos;ici.
                </p>
              </div>

              <span className="bg-brand text-brand-fg shadow-sm transition-colors group-hover:bg-brand-strong inline-flex shrink-0 items-center gap-2 self-start rounded-lg px-5 py-2.5 text-sm font-semibold sm:self-auto">
                Voir les affaires
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>
      </section>

      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">Outils</h2>
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-subtle">
          De nouveaux outils sont ajoutés au fil des besoins
        </span>
      </div>

      {TOOLS.length === 1 ? (
        <section aria-label="Outils disponibles">
          <FeaturedToolCard tool={TOOLS[0]} />
        </section>
      ) : (
        <section
          aria-label="Outils disponibles"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {TOOLS.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>
      )}
    </div>
  );
}
