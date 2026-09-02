import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
import { getClient, listerClients } from "@/lib/clients/queries";
import { listerAffaires } from "@/lib/chantiers/queries";
import { getDevis, listerFil, listerPrestations } from "@/tools/devis/queries";
import { EditeurDevis } from "@/tools/devis/editeur-devis";
import { libelleDevis, paveDestinatairePropose } from "@/tools/devis/model";
import { garde } from "../garde";

export const metadata: Metadata = { title: "Devis" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await garde();
  const session = await auth();

  const devis = await getDevis(id);
  if (!devis) notFound();

  const [prestations, clients, affaires, fil, fiche] = await Promise.all([
    listerPrestations(),
    listerClients(),
    listerAffaires(),
    // Le fil de la CHAÎNE de révisions, pas du seul devis (docs/DEVIS-FIL.md).
    listerFil(id, userId),
    // La fiche du client de CE devis : son adresse et ses personnes. Elle sert
    // à proposer, jamais à afficher — ce que le devis montre est ce qu'il a
    // figé (docs/DEVIS.md §24).
    devis.entete.clientId ? getClient(devis.entete.clientId) : Promise.resolve(null),
  ]);

  /* Ce que le référentiel PROPOSERAIT aujourd'hui pour ce devis. Calculé ici, au
     serveur, pour que l'écran puisse dire « ≠ fiche client » sans refaire la
     requête — et avec la personne DÉJÀ choisie quand elle tient toujours :
     reprendre l'adresse ne doit pas changer le destinataire. */
  const contactPropose =
    fiche?.contacts.find((c) => c.id === devis.entete.contactId) ??
    fiche?.contacts.find((c) => c.principal && c.actif) ??
    null;
  const paveClient = fiche ? paveDestinatairePropose(fiche, contactPropose) : "";

  return (
    <>
      {/* Écran-outil sans cartouche du kit : il rend son propre en-tête, donc
          il alimente la barre de chrome à la main (convention de la maison). */}
      <TitreEcran
        estampille="Devis"
        titre={libelleDevis(devis.entete.numero, devis.entete.revision)}
      />
      <EditeurDevis
        devis={devis}
        prestations={prestations}
        clients={clients.map((c) => c.nom)}
        contacts={fiche?.contacts.filter((c) => c.actif) ?? []}
        paveClient={paveClient}
        affaires={affaires.map((a) => ({
          id: a.id,
          nom: a.nom,
          numeroWhy: a.numeroWhy,
          clientNom: a.clientNom,
        }))}
        fil={fil ?? { filId: id, entrees: [], nbMessages: 0, nbNonLus: 0 }}
        moiId={userId}
        moiNom={session?.user?.name ?? session?.user?.email ?? "Moi"}
      />
    </>
  );
}
