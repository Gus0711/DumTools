import type { Metadata } from "next";
import { Cartouche, EtatVide } from "@/ui";
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
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Vue transverse"
        titre="Projet GTB"
        description="Tous les automates, toutes affaires confondues — pour retrouver un projet quand on ne sait plus à quelle affaire il appartient. Au quotidien, on y entre par la fiche de l’affaire."
        champs={[{ label: "Automates", valeur: projets.length, fort: true }]}
        className="mb-6"
      />

      {projets.length === 0 ? (
        <div className="data-card">
          <EtatVide
            dessin="automate"
            titre="Aucun automate pour l’instant"
            texte="Les automates se créent depuis la fiche d’une affaire, avec « Ajouter un automate »."
          />
        </div>
      ) : (
        <ProjetsFiltrables projets={projets} orphelinsParDefaut={sansAffaire} />
      )}
    </div>
  );
}
