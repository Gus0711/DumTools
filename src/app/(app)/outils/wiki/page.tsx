import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { listerRubriques } from "@/tools/wiki/queries";
import { RechercheWiki } from "@/tools/wiki/recherche";
import { IconeRubrique, teinteRubrique } from "@/tools/wiki/apparence";

export const metadata: Metadata = { title: "Wiki" };

export default async function Page() {
  const rubriques = await listerRubriques();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Wiki</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Base de connaissances interne : procédures, savoir-faire GTB, méthodes — classées par
          thème, taguées et cherchables.
        </p>
      </header>

      <div className="mb-8">
        <RechercheWiki />
        <div className="mt-2 text-right">
          <Link
            href="/outils/wiki/recherche"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-subtle transition-colors hover:text-brand"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Recherche avancée (tags, rubrique, auteur)
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rubriques.map((r) => {
          const t = teinteRubrique(r.couleur);
          return (
            <Link
              key={r.id}
              href={`/outils/wiki/${r.slug}`}
              className={`group relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:shadow-md ${t.ring}`}
            >
              <span className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} />
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${t.chip}`}
                >
                  <IconeRubrique nom={r.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold text-fg group-hover:text-brand">
                    {r.nom}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{r.description}</p>
                </div>
              </div>
              <p className="mt-4 text-xs font-medium text-subtle">
                {r.nbPages} page{r.nbPages > 1 ? "s" : ""}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
