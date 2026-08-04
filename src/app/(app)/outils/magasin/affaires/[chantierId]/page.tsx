import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
import { prisma } from "@/lib/db";
import { MaterielAffaire } from "@/tools/magasin/materiel-affaire";
import { bomAffaire } from "@/tools/magasin/bom";
import { peutGererReferentiel, peutVoirPrix } from "@/tools/magasin/model";
import {
  coutMaterielAffaire,
  listerCategories,
  listerDepots,
  listerFabricants,
  listerRayon,
} from "@/tools/magasin/queries";

export const metadata: Metadata = { title: "Matériel d'affaire — Magasin" };

export default async function Page({ params }: { params: Promise<{ chantierId: string }> }) {
  const { chantierId } = await params;
  const session = await auth();

  const affaire = await prisma.chantier.findUnique({
    where: { id: chantierId },
    select: { id: true, nom: true, numeroWhy: true, client: { select: { nom: true } } },
  });
  if (!affaire) notFound();

  const [bom, reservations, lignesManuelles, rayon, depots, coutSortiCents, fabricants, categories] =
    await Promise.all([
    bomAffaire(chantierId),
    prisma.reservationStock.findMany({
      where: { chantierId, etat: "RESERVEE" },
      select: { id: true, produitId: true, quantite: true },
    }),
    prisma.ligneMaterielAffaire.findMany({
      where: { chantierId },
      select: { id: true, produitId: true, quantite: true, note: true },
    }),
    listerRayon(),
    listerDepots(),
    coutMaterielAffaire(chantierId),
    listerFabricants(),
    listerCategories(),
  ]);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Matériel d'affaire"
        titre={affaire.nom}
        titreTexte={affaire.nom}
        sousTitre={affaire.client.nom}
        retour={{ href: `/affaires/${chantierId}`, label: "Retour à l'affaire" }}
        description="Ce qu'il faut, ce qu'on a, ce qui manque. Le besoin est dérivé des projets GTB et des listes de points — on n'ajoute à la main que ce qui n'en découle pas."
        champs={[
          { label: "N° Why", valeur: affaire.numeroWhy ?? undefined, ref: true },
          { label: "Références", valeur: bom.lignes.length, fort: true },
        ]}
        className="mb-6"
      />

      <MaterielAffaire
        chantierId={chantierId}
        lignes={bom.lignes}
        trous={bom.trous}
        projets={bom.projets}
        coutPrevuCents={bom.coutPrevuCents}
        nbSansPrix={bom.nbSansPrix}
        nbHorsFourniture={bom.nbHorsFourniture}
        coutSortiCents={coutSortiCents}
        reservations={reservations}
        lignesManuelles={lignesManuelles}
        produits={rayon.map((l) => ({
          id: l.id,
          refInterne: l.refInterne,
          refFabricant: l.refFabricant,
          designation: l.designation,
          unite: l.unite,
          serialisable: l.serialisable,
          stock: l.stock,
          dernierPrixCents: l.dernierPrixCents,
        }))}
        depots={depots}
        fabricants={fabricants}
        categories={categories}
        peutPrix={peutVoirPrix(session?.user?.role)}
        peutGerer={peutGererReferentiel(session?.user?.role)}
      />
    </div>
  );
}
