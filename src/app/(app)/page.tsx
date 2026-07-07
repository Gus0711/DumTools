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
