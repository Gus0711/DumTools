import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button, Cartouche, Input } from "@/ui";
import { listerClients } from "@/lib/clients/queries";
import { creerClient } from "@/lib/clients/actions";
import { ClientsIndex } from "@/lib/clients/clients-index";

export const metadata: Metadata = { title: "Clients" };

export default async function Page() {
  const clients = await listerClients();
  const avecRealisations = clients.filter((c) => c.nbRealisations > 0).length;

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Référentiel"
        titre="Clients"
        description="La fiche d'un client regroupe tout ce qui a été produit pour lui, à travers tous les outils."
        actions={
          <form action={creerClient} className="flex items-center gap-2">
            <Input name="nom" required placeholder="Nom du client" className="w-52" />
            <Button type="submit">
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </form>
        }
        champs={[
          { label: "Clients", valeur: clients.length, fort: true },
          { label: "Avec réalisations", valeur: avecRealisations, fort: true },
        ]}
        className="mb-6"
      />

      <ClientsIndex clients={clients} />
    </div>
  );
}
