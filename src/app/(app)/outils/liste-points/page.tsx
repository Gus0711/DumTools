import type { Metadata } from "next";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/ui";
import { creerDocument } from "@/tools/liste-points/actions";
import { listerDocuments } from "@/tools/liste-points/queries";
import { ListeFiltrable } from "@/tools/liste-points/liste-filtrable";

export const metadata: Metadata = { title: "Liste de Points GTB" };

export default async function Page() {
  const docs = await listerDocuments();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">
            Liste de Points GTB
          </h1>
          <p className="mt-1 text-muted">
            Vos listes de points par chantier — partagées avec l’équipe.
          </p>
        </div>
        <form action={creerDocument}>
          <Button type="submit">
            <Plus className="h-4 w-4" /> Nouvelle liste
          </Button>
        </form>
      </header>

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">
            Aucune liste pour l’instant. Créez la première.
          </p>
        </div>
      ) : (
        <ListeFiltrable docs={docs} />
      )}
    </div>
  );
}
