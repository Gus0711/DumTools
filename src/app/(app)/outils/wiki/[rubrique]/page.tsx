import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cartouche } from "@/ui";
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
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Wiki · Rubrique"
        retour={{ href: "/outils/wiki", label: "Wiki" }}
        titre={
          <span className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.chip}`}
            >
              <IconeRubrique nom={r.icon} className="h-5 w-5" />
            </span>
            {r.nom}
          </span>
        }
        titreTexte={r.nom}
        description={r.description}
        actions={<NouvellePage rubriqueId={r.id} />}
        className="mb-6"
      />

      <ArbrePagesRubrique rubriqueId={r.id} rubriqueSlug={r.slug} noeuds={noeuds} />
    </div>
  );
}
