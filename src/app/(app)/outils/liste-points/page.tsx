import type { Metadata } from "next";
import { FileText, Plus } from "lucide-react";
import { Button, Cartouche, EtatVide } from "@/ui";
import { creerDocument } from "@/tools/liste-points/actions";
import { listerDocuments } from "@/tools/liste-points/queries";
import { ListeFiltrable } from "@/tools/liste-points/liste-filtrable";

export const metadata: Metadata = { title: "Liste de Points GTB" };

export default async function Page() {
  const docs = await listerDocuments();

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Bibliothèque"
        titre="Liste de Points GTB"
        description="Les listes de points par chantier, partagées avec l’équipe."
        actions={
          <form action={creerDocument}>
            <Button type="submit">
              <Plus className="h-4 w-4" /> Nouvelle liste
            </Button>
          </form>
        }
        champs={[{ label: "Listes", valeur: docs.length, fort: true }]}
        className="mb-6"
      />

      {docs.length === 0 ? (
        <div className="data-card">
          <EtatVide
            icone={FileText}
            titre="Aucune liste pour l’instant"
            texte="Créez la première avec « Nouvelle liste »."
          />
        </div>
      ) : (
        <ListeFiltrable docs={docs} />
      )}
    </div>
  );
}
