import type { Metadata } from "next";
import { CircuitBoard, Plus } from "lucide-react";
import { Button } from "@/ui";
import { creerProjet, creerProjetDepuisListe } from "@/tools/affectation-es/actions";
import { listerProjets } from "@/tools/affectation-es/queries";
import { ProjetsFiltrables } from "@/tools/affectation-es/projets-filtrables";
import { listerDocuments } from "@/tools/liste-points/queries";

export const metadata: Metadata = { title: "Affectation E/S depuis GFX" };

export default async function Page() {
  const [projets, listes] = await Promise.all([
    listerProjets(),
    listerDocuments(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">
            Affectation E/S depuis GFX
          </h1>
          <p className="mt-1 text-muted">
            Documents d’affectation entrées/sorties Distech — partagés avec
            l’équipe.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {listes.length > 0 && (
            <form action={creerProjetDepuisListe} className="flex items-center gap-2">
              <select
                name="listeId"
                required
                defaultValue=""
                className="h-10 max-w-52 rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
              >
                <option value="" disabled>
                  Depuis une liste de points…
                </option>
                {listes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.titre}
                    {l.chantierNom ? ` — ${l.chantierNom}` : ""}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline">
                Convertir
              </Button>
            </form>
          )}
          <form action={creerProjet}>
            <Button type="submit">
              <Plus className="h-4 w-4" /> Nouveau projet
            </Button>
          </form>
        </div>
      </header>

      {projets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <CircuitBoard className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">
            Aucun projet pour l’instant. Créez le premier.
          </p>
        </div>
      ) : (
        <ProjetsFiltrables projets={projets} />
      )}
    </div>
  );
}
