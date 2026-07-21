import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRubriqueParSlug, listerArbreRubrique } from "@/tools/wiki/queries";
import { NouvellePage } from "@/tools/wiki/boutons";
import { ArbrePagesRubrique } from "@/tools/wiki/arbre-pages";
import { IconeRubrique, teinteRubrique } from "@/tools/wiki/apparence";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ rubrique: string }>;
}): Promise<Metadata> {
  const { rubrique } = await params;
  const r = await getRubriqueParSlug(rubrique);
  return { title: r ? `Wiki · ${r.nom}` : "Wiki" };
}

export default async function Page({ params }: { params: Promise<{ rubrique: string }> }) {
  const { rubrique } = await params;
  const r = await getRubriqueParSlug(rubrique);
  if (!r) notFound();

  const noeuds = await listerArbreRubrique(r.id);
  const t = teinteRubrique(r.couleur);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <Link
        href="/outils/wiki"
        className="group mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Wiki
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
            <IconeRubrique nom={r.icon} className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-fg">{r.nom}</h1>
            {r.description && <p className="mt-1 max-w-2xl text-muted">{r.description}</p>}
          </div>
        </div>
        <NouvellePage rubriqueId={r.id} />
      </header>

      <ArbrePagesRubrique rubriqueId={r.id} rubriqueSlug={r.slug} noeuds={noeuds} />
    </div>
  );
}
