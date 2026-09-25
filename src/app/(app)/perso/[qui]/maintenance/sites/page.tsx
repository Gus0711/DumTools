import type { Metadata } from "next";
import { MapPinned } from "lucide-react";
import { Cartouche } from "@/ui";
import { listerClients } from "@/lib/clients/queries";
import { listerSites } from "@/tools/maintenance/queries";
import { ReferentielSites } from "@/tools/maintenance/referentiel-sites";
import { garde } from "../garde";

export const metadata: Metadata = { title: "Sites · Maintenance" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string }>;
}) {
  const { qui } = await params;
  await garde(qui);

  const [sites, clients] = await Promise.all([listerSites(), listerClients()]);

  return (
    <div className="signal-com mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Référentiel"
        retour={{ href: `/perso/${qui}/maintenance`, label: "Maintenance" }}
        titre={
          <span className="flex items-center gap-2.5">
            <MapPinned className="text-signal h-6 w-6" />
            Sites
          </span>
        }
        titreTexte="Sites"
        description="L'endroit qu'on maintient — le bâtiment, la salle, le poste. Ni le siège du client, ni une affaire qui se referme : un site vit tant qu'on en a la charge."
        champs={[
          { label: "Sites", valeur: sites.length, fort: true },
          {
            label: "Au parc",
            valeur: sites.filter((s) => s.actif).length,
            fort: true,
          },
        ]}
        className="mb-6"
      />
      <ReferentielSites
        sites={sites}
        clients={clients.map((c) => ({ id: c.id, nom: c.nom }))}
      />
    </div>
  );
}
