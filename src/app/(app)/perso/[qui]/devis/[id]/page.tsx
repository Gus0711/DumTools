import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
import { listerClients } from "@/lib/clients/queries";
import { listerAffaires } from "@/lib/chantiers/queries";
import { getDevis, listerFil, listerPrestations } from "@/tools/devis/queries";
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
  const { userId } = await garde(qui);
  const session = await auth();

  const devis = await getDevis(id);
  if (!devis) notFound();

  const [prestations, clients, affaires, fil] = await Promise.all([
    listerPrestations(),
    listerClients(),
    listerAffaires(),
    // Le fil de la CHAÎNE de révisions, pas du seul devis (docs/DEVIS-FIL.md).
    listerFil(id, userId),
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
        qui={qui}
        fil={fil ?? { filId: id, entrees: [], nbMessages: 0, nbNonLus: 0 }}
        moiId={userId}
        moiNom={session?.user?.name ?? session?.user?.email ?? "Moi"}
      />
    </>
  );
}
