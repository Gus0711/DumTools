import type { Metadata } from "next";
import { CircuitBoard } from "lucide-react";
import { listerProjets } from "@/tools/affectation-es/queries";
import { listerAffaires } from "@/lib/chantiers/queries";
import { ProjetsFiltrables } from "@/tools/affectation-es/projets-filtrables";
import { NouveauProjet } from "@/tools/affectation-es/boutons-affaire";

export const metadata: Metadata = { title: "Projet GTB" };

export default async function Page() {
  const [projets, affaires] = await Promise.all([listerProjets(), listerAffaires()]);
  const optionsAffaires = affaires.map((a) => ({
    id: a.id,
    nom: a.nom,
    clientNom: a.clientNom,
    numeroWhy: a.numeroWhy,
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Projet GTB</h1>
          <p className="mt-1 text-muted">
            Liste de points, affectation E/S Distech, GFX et mise en service — un projet par
            chantier, partagé avec l’équipe.
          </p>
        </div>
        <NouveauProjet affaires={optionsAffaires} />
      </header>

      {projets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <CircuitBoard className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">Aucun projet pour l’instant. Créez le premier.</p>
        </div>
      ) : (
        <ProjetsFiltrables projets={projets} />
      )}
    </div>
  );
}
