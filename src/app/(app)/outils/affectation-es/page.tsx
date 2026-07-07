import type { Metadata } from "next";
import { CircuitBoard, Plus } from "lucide-react";
import { Button } from "@/ui";
import { creerProjet } from "@/tools/affectation-es/actions";
import { listerProjets } from "@/tools/affectation-es/queries";
import { ProjetsFiltrables } from "@/tools/affectation-es/projets-filtrables";

export const metadata: Metadata = { title: "Projet GTB" };

export default async function Page() {
  const projets = await listerProjets();

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
        <form action={creerProjet}>
          <Button type="submit">
            <Plus className="h-4 w-4" /> Nouveau projet
          </Button>
        </form>
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
