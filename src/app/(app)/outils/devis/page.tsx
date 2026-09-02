import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Settings2 } from "lucide-react";
import { Cartouche } from "@/ui";
import { listerClients } from "@/lib/clients/queries";
import { listerAffaires } from "@/lib/chantiers/queries";
import { listerDevis, statsDevis } from "@/tools/devis/queries";
import { IndexDevis } from "@/tools/devis/index-devis";
import { garde } from "./garde";

export const metadata: Metadata = { title: "Devis" };

export default async function Page() {
  await garde();

  const [devis, clients, affaires] = await Promise.all([
    listerDevis(),
    listerClients(),
    listerAffaires(),
  ]);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Outil"
        titre={
          <span className="flex items-center gap-2.5">
            <FileSpreadsheet className="text-signal h-6 w-6" />
            Devis
          </span>
        }
        titreTexte="Devis"
        description="Le chiffrage : le prix de vente se déduit du déboursé du magasin par un coefficient, on compose en lots, et on reprend d'un clic le matériel d'une affaire."
        actions={
          <Link
            href="/outils/devis/referentiels"
            className="press inline-flex h-[var(--control-h)] items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg transition-[background-color,border-color] duration-150 hover:border-brand/45 hover:bg-surface-2"
          >
            <Settings2 className="h-4 w-4" /> Référentiels
          </Link>
        }
        /* Le signal de l'outil (violet « ce qu'on émet »), comme sur l'accueil. */
        className="signal-ao"
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
