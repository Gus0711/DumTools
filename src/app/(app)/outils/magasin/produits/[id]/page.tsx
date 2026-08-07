import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Badge, Cartouche } from "@/ui";
import { listerAffaires } from "@/lib/chantiers/queries";
import { lienRetour } from "@/lib/retour";
import { FicheProduitVue } from "@/tools/magasin/fiche-produit";
import { AssociationsProduit } from "@/tools/magasin/associations-produit";
import {
  formatEuros,
  peutCorrigerStock,
  peutGererReferentiel,
  peutVoirPrix,
} from "@/tools/magasin/model";
import {
  ficheProduit,
  groupesDassociation,
  listerAssociations,
  listerCategories,
  listerDepots,
  listerFabricants,
  listerFournisseurs,
  listerRayon,
} from "@/tools/magasin/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fiche = await ficheProduit(id);
  return { title: fiche ? `${fiche.refInterne} — Magasin` : "Produit — Magasin" };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retour?: string }>;
}) {
  const { id } = await params;
  const { retour } = await searchParams;
  const session = await auth();
  const role = session?.user?.role;

  const fiche = await ficheProduit(id);
  if (!fiche) notFound();

  const [depots, affaires, fournisseurs, rayon, fabricants, categories, associations, groupesConnus] =
    await Promise.all([
      listerDepots(),
      listerAffaires(),
      listerFournisseurs(),
      listerRayon(),
      listerFabricants(),
      listerCategories(),
      listerAssociations(id),
      groupesDassociation(),
    ]);

  const prix = peutVoirPrix(role);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Produit"
        titre={fiche.designation}
        titreTexte={fiche.designation}
        sousTitre={fiche.fabricantNom ?? undefined}
        retour={lienRetour(retour, { href: "/outils/magasin", label: "Le rayon" })}
        statut={
          fiche.actif ? (
            fiche.stock <= 0 ? (
              <Badge tone="danger" point>
                En rupture
              </Badge>
            ) : fiche.seuilMini > 0 && fiche.disponible < fiche.seuilMini ? (
              <Badge tone="warning" point>
                Sous le seuil
              </Badge>
            ) : (
              <Badge tone="success" point>
                En stock
              </Badge>
            )
          ) : (
            <Badge tone="neutral">Archivé</Badge>
          )
        }
        champs={[
          { label: "Réf. interne", valeur: fiche.refInterne, ref: true },
          { label: "Réf. fabricant", valeur: fiche.refFabricant ?? undefined, ref: true },
          { label: "Stock", valeur: fiche.stock, fort: true },
          { label: "Réservé", valeur: fiche.reserve, fort: true },
          { label: "Disponible", valeur: fiche.disponible, fort: true },
          { label: "Emplacement", valeur: fiche.emplacement ?? undefined, ref: true },
          // Un seul prix mis en avant : celui qui sert à chiffrer. Le détail de
          // sa provenance est dans la section « Prix d'achat » de la fiche.
          ...(prix
            ? [
                {
                  label:
                    fiche.sourcePrix === "achat" ? "Prix (annoncé)" : "Prix unitaire",
                  valeur: formatEuros(fiche.prixRefCents),
                },
              ]
            : []),
        ]}
        className="mb-6"
      />

      <FicheProduitVue
        fiche={fiche}
        depots={depots}
        affaires={affaires
          .filter((a) => a.etat !== "CORBEILLE")
          .map((a) => ({
            id: a.id,
            nom: a.nom,
            clientNom: a.clientNom,
            numeroWhy: a.numeroWhy,
          }))}
        fournisseurs={fournisseurs}
        fabricants={fabricants}
        categories={categories}
        autresProduits={rayon.map((l) => ({
          id: l.id,
          refInterne: l.refInterne,
          designation: l.designation,
        }))}
        peutPrix={prix}
        peutGerer={peutGererReferentiel(role)}
        peutCorriger={peutCorrigerStock(role)}
      />

      {/* « Ce produit en appelle d'autres » — réglé ICI parce que c'est un fait
          sur le produit, vrai partout, et non une préférence de devis. */}
      <AssociationsProduit
        produitId={fiche.id}
        associations={associations}
        groupesConnus={groupesConnus}
        peutGerer={peutGererReferentiel(role)}
      />
    </div>
  );
}
