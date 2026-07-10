import { notFound } from "next/navigation";
import { Editeur } from "@/tools/affectation-es/editeur";
import { getProjet } from "@/tools/affectation-es/queries";
import { getCatalogue } from "@/tools/affectation-es/catalogue-queries";
import {
  getCatalogue as getCataloguePoints,
  getModeles,
} from "@/tools/liste-points/queries";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [projet, catalogue, cataloguePoints, modeles] = await Promise.all([
    getProjet(id),
    getCatalogue(),
    getCataloguePoints(),
    getModeles(),
  ]);
  if (!projet) notFound();

  return (
    <Editeur
      id={projet.id}
      initial={{
        nom: projet.nom,
        clientNom: projet.clientNom,
        numeroWhy: projet.numeroWhy,
        chantierId: projet.chantierId,
        affaireNom: projet.affaireNom,
        project: projet.project,
      }}
      catalogue={catalogue}
      cataloguePoints={cataloguePoints}
      modeles={modeles}
    />
  );
}
