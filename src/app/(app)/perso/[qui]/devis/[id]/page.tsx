import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
import { listerClients } from "@/lib/clients/queries";
import { listerAffaires } from "@/lib/chantiers/queries";
import { getDevis, listerPrestations } from "@/tools/devis/queries";
import { EditeurDevis } from "@/tools/devis/editeur-devis";
import { libelleDevis } from "@/tools/devis/model";
import { garde } from "../garde";

export const metadata: Metadata = { title: "Devis · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string; id: string }>;
}) {
  const { qui, id } = await params;
  await garde(qui);

  const devis = await getDevis(id);
  if (!devis) notFound();

  const [prestations, clients, affaires] = await Promise.all([
    listerPrestations(),
    listerClients(),
    listerAffaires(),
  ]);

  return (
    <>
      {/* Écran-outil sans cartouche du kit : il rend son propre en-tête, donc
          il alimente la barre de chrome à la main (convention de la maison). */}
      <TitreEcran
        estampille="ToolGus · Devis"
        titre={libelleDevis(devis.entete.numero, devis.entete.revision)}
      />
      <EditeurDevis
        devis={devis}
        prestations={prestations}
        clients={clients.map((c) => c.nom)}
        affaires={affaires.map((a) => ({
          id: a.id,
          nom: a.nom,
          numeroWhy: a.numeroWhy,
          clientNom: a.clientNom,
        }))}
      />
    </>
  );
}
