import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button, Input } from "@/ui";
import { listerClients } from "@/lib/clients/queries";
import { creerClient } from "@/lib/clients/actions";
import { ClientsIndex } from "@/lib/clients/clients-index";

export const metadata: Metadata = { title: "Clients" };

export default async function Page() {
  const clients = await listerClients();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Clients</h1>
          <p className="mt-1 text-muted">
            Référentiel client partagé — la fiche d’un client regroupe tout ce
            qui a été produit pour lui, à travers tous les outils.
          </p>
        </div>
        <form action={creerClient} className="flex items-center gap-2">
          <Input
            name="nom"
            required
            placeholder="Nom du client"
            className="h-10 w-52"
          />
          <Button type="submit">
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </form>
      </header>

      <ClientsIndex clients={clients} />
    </div>
  );
}
