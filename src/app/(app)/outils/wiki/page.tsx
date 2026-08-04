import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Cartouche } from "@/ui";
import { listerRubriques } from "@/tools/wiki/queries";
import { RechercheWiki } from "@/tools/wiki/recherche";
import { NoteRapide } from "@/tools/wiki/boutons";
import { IconeRubrique, teinteRubrique } from "@/tools/wiki/apparence";

export const metadata: Metadata = { title: "Wiki" };

export default async function Page() {
  const rubriques = await listerRubriques();
  const total = rubriques.reduce((n, r) => n + r.nbPages, 0);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Base de connaissances"
        titre="Wiki"
        description="Procédures, savoir-faire GTB, méthodes — classés par thème, tagués et cherchables."
        champs={[
          { label: "Rubriques", valeur: rubriques.length, fort: true },
          { label: "Pages", valeur: total, fort: true },
        ]}
        actions={<NoteRapide variant="primary" />}
        enfants={
          <div>
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
        }
        className="mb-8"
      />

      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rubriques.map((r) => {
          const t = teinteRubrique(r.couleur);
          return (
            <Link
              key={r.id}
              href={`/outils/wiki/${r.slug}`}
              className={`group relative overflow-hidden border border-hairline bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md ${t.ring}`}
            >
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} />
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${t.chip}`}
                >
                  <IconeRubrique nom={r.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold text-fg transition-colors group-hover:text-brand">
                    {r.nom}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{r.description}</p>
                </div>
              </div>
              <p className="stamp mt-4">
                {r.nbPages === 0
                  ? "Aucune page — à écrire"
                  : `${r.nbPages} page${r.nbPages > 1 ? "s" : ""}`}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
