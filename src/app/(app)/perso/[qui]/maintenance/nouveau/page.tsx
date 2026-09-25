import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { Cartouche } from "@/ui";
import { listerClientsAvecSites } from "@/tools/maintenance/queries";
import { EditeurContrat } from "@/tools/maintenance/editeur-contrat";
import { garde } from "../garde";

export const metadata: Metadata = { title: "Nouveau contrat · Maintenance" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string }>;
}) {
  const { qui } = await params;
  await garde(qui);
  const clients = await listerClientsAvecSites();

  return (
    <div className="signal-com mx-auto max-w-4xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Contrat de maintenance"
        retour={{ href: `/perso/${qui}/maintenance`, label: "Maintenance" }}
        titre={
          <span className="flex items-center gap-2.5">
            <LifeBuoy className="text-signal h-6 w-6" />
            Nouveau contrat
          </span>
        }
        titreTexte="Nouveau contrat"
        description="Un client, des sites, et un forfait d'heures qui repart à zéro à chaque date anniversaire."
        className="mb-6"
      />
      <EditeurContrat qui={qui} clients={clients} />
    </div>
  );
}
