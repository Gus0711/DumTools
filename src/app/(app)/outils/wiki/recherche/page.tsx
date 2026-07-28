import type { Metadata } from "next";
import { optionsRecherche } from "@/tools/wiki/queries";
import { RechercheAvanceeWiki } from "@/tools/wiki/recherche-avancee";
import { Cartouche } from "@/ui";

export const metadata: Metadata = { title: "Recherche — Wiki" };

/* Recherche à facettes du wiki (docs/RECHERCHE-WIKI.md, Étape 1). Le catalogue
 * des facettes (tags/rubriques/auteurs + compteurs) est chargé côté serveur ;
 * la composition des filtres et l'interrogation se font ensuite côté client. */
export default async function Page() {
  const catalogue = await optionsRecherche();

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Wiki"
        retour={{ href: "/outils/wiki", label: "Wiki" }}
        titre="Recherche avancée"
        description="Combinez la recherche plein-texte et les filtres par tags (inclure / exclure), rubrique et auteur."
        className="mb-6"
      />

      <RechercheAvanceeWiki catalogue={catalogue} />
    </div>
  );
}
