import { ToolCard } from "@/components/tool-card";
import { TOOLS } from "@/tools/registry";

export default function AccueilPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-fg">
          Outils internes
        </h1>
        <p className="mt-1.5 text-muted">
          Sélectionnez un outil. De nouveaux outils sont ajoutés au fil des
          besoins.
        </p>
      </header>

      <section
        aria-label="Outils disponibles"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {TOOLS.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </section>
    </div>
  );
}
