import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/ui";
import { ToolCard } from "@/components/tool-card";
import { getEspacePerso, toolsDeProprietaire } from "@/tools/registry";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ qui: string }>;
}): Promise<Metadata> {
  const { qui } = await params;
  const espace = getEspacePerso(qui);
  return { title: espace ? espace.nom : "Espace perso" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string }>;
}) {
  const { qui } = await params;
  const espace = getEspacePerso(qui);
  if (!espace) notFound();

  const tools = toolsDeProprietaire(qui);
  const Icon = espace.icon;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Accueil
      </Link>

      <header className="mb-7 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand/10 bg-brand-soft text-brand">
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              {espace.nom}
            </h1>
            <Badge tone="neutral">Accessible à tous</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-muted">{espace.description}</p>
        </div>
      </header>

      {tools.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
          Aucun outil pour le moment.
        </div>
      ) : (
        <section
          aria-label="Outils"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>
      )}
    </div>
  );
}
