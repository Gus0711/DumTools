import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Cartouche, EtatVide } from "@/ui";
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
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Espace perso"
        retour={{ href: "/", label: "Accueil" }}
        titre={
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-brand/15 bg-brand-soft text-brand">
              <Icon className="h-5 w-5" />
            </span>
            {espace.nom}
          </span>
        }
        titreTexte={espace.nom}
        description={espace.description}
        statut={<Badge tone="neutral">Accessible à tous</Badge>}
        champs={[{ label: "Outils", valeur: tools.length, fort: true }]}
        className="mb-6"
      />

      {tools.length === 0 ? (
        <div className="bloc">
          <EtatVide icone={Icon} titre="Aucun outil pour le moment" />
        </div>
      ) : (
        <section
          aria-label="Outils"
          className="stagger planche sm:grid-cols-2 lg:grid-cols-3"
        >
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>
      )}
    </div>
  );
}
