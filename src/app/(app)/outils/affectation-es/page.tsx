import type { Metadata } from "next";
import { CircuitBoard } from "lucide-react";
import { listerProjets } from "@/tools/affectation-es/queries";
import { ProjetsFiltrables } from "@/tools/affectation-es/projets-filtrables";

export const metadata: Metadata = { title: "Projet GTB" };

/** Vue transverse (recherche) — la création se fait depuis la fiche Affaire. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  // ?sans-affaire=1 → arrive filtré sur les orphelins (lien depuis /affaires).
  const sansAffaire = (await searchParams)["sans-affaire"] === "1";
  const projets = await listerProjets();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Projet GTB</h1>
        <p className="mt-1 text-muted">
          Vue transverse de tous les automates, toutes affaires confondues — pour retrouver
          un projet quand on ne sait plus à quelle affaire il appartient. Au quotidien, on y
          entre par la fiche de l’affaire.
        </p>
      </header>

      {projets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <CircuitBoard className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">
            Aucun projet pour l’instant. Les automates se créent depuis la fiche d’une
            affaire (« Ajouter un automate »).
          </p>
        </div>
      ) : (
        <ProjetsFiltrables projets={projets} orphelinsParDefaut={sansAffaire} />
      )}
    </div>
  );
}
