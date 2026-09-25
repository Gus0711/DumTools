import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { Cartouche } from "@/ui";
import {
  getContratDetail,
  listerClientsAvecSites,
} from "@/tools/maintenance/queries";
import { EditeurContrat } from "@/tools/maintenance/editeur-contrat";
import { garde } from "../../garde";

export const metadata: Metadata = { title: "Modifier · Maintenance" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string; id: string }>;
}) {
  const { qui, id } = await params;
  await garde(qui);

  const [contrat, clients] = await Promise.all([
    getContratDetail(id),
    listerClientsAvecSites(),
  ]);
  if (!contrat) notFound();

  return (
    <div className="signal-com mx-auto max-w-4xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Contrat de maintenance"
        retour={{
          href: `/perso/${qui}/maintenance/${contrat.id}`,
          label: contrat.intitule,
        }}
        titre={
          <span className="flex items-center gap-2.5">
            <LifeBuoy className="text-signal h-6 w-6" />
            Modifier le contrat
          </span>
        }
        titreTexte="Modifier le contrat"
        sousTitre={contrat.clientNom}
        className="mb-6"
      />
      <EditeurContrat qui={qui} clients={clients} contrat={contrat} />
    </div>
  );
}
