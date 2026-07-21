import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { optionsRecherche } from "@/tools/wiki/queries";
import { RechercheAvanceeWiki } from "@/tools/wiki/recherche-avancee";

export const metadata: Metadata = { title: "Recherche — Wiki" };

/* Recherche à facettes du wiki (docs/RECHERCHE-WIKI.md, Étape 1). Le catalogue
 * des facettes (tags/rubriques/auteurs + compteurs) est chargé côté serveur ;
 * la composition des filtres et l'interrogation se font ensuite côté client. */
export default async function Page() {
  const catalogue = await optionsRecherche();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <Link
          href="/outils/wiki"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          Wiki
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Recherche</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Combinez la recherche plein-texte et les filtres par tags (inclure / exclure), rubrique
          et auteur.
        </p>
      </header>

      <RechercheAvanceeWiki catalogue={catalogue} />
    </div>
  );
}
