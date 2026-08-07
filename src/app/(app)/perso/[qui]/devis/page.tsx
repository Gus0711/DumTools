import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Settings2 } from "lucide-react";
import { Cartouche } from "@/ui";
import { listerClients } from "@/lib/clients/queries";
import { listerAffaires } from "@/lib/chantiers/queries";
import { listerDevis, statsDevis } from "@/tools/devis/queries";
import { IndexDevis } from "@/tools/devis/index-devis";
import { garde } from "./garde";

export const metadata: Metadata = { title: "Devis · ToolGus" };

export default async function Page({ params }: { params: Promise<{ qui: string }> }) {
  const { qui } = await params;
  await garde(qui);

  const [devis, clients, affaires] = await Promise.all([
    listerDevis(),
    listerClients(),
    listerAffaires(),
  ]);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="ToolGus · Espace perso"
        retour={{ href: `/perso/${qui}`, label: "ToolGus" }}
        titre={
          <span className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-6 w-6 text-accent" />
            Devis
          </span>
        }
        titreTexte="Devis"
        description="Le chiffrage : le prix de vente se déduit du déboursé du magasin par un coefficient, on compose en lots, et on reprend d'un clic le matériel d'une affaire."
        actions={
          <Link
            href={`/perso/${qui}/devis/referentiels`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
          >
            <Settings2 className="h-4 w-4" /> Prestations & coefficients
          </Link>
        }
        className="mb-6"
      />

      <IndexDevis
        devis={devis}
        stats={statsDevis(devis)}
        clients={clients.map((c) => c.nom)}
        affaires={affaires.map((a) => ({
          id: a.id,
          nom: a.nom,
          numeroWhy: a.numeroWhy,
          clientNom: a.clientNom,
        }))}
      />
    </div>
  );
}
