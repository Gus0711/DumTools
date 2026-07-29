import type { Metadata } from "next";
import { Cartouche } from "@/ui";
import { listerAffaires } from "@/lib/chantiers/queries";
import { ScanMagasin } from "@/tools/magasin/scan-magasin";
import { listerDepots, listerRayon } from "@/tools/magasin/queries";

export const metadata: Metadata = { title: "Scanner — Magasin" };

export default async function Page() {
  const [lignes, depots, affaires] = await Promise.all([
    listerRayon(),
    listerDepots(),
    listerAffaires(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Magasin"
        titre="Scanner"
        retour={{ href: "/outils/magasin", label: "Le rayon" }}
        description="On choisit une fois le contexte — réception ou sortie — puis on enchaîne les codes. Un code inconnu s'associe à un produit et sera reconnu pour toujours."
        className="mb-6"
      />

      <ScanMagasin
        produits={lignes.map((l) => ({
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
        affaires={affaires
          .filter((a) => a.etat !== "CORBEILLE")
          .map((a) => ({
            id: a.id,
            nom: a.nom,
            clientNom: a.clientNom,
            numeroWhy: a.numeroWhy,
          }))}
      />
    </div>
  );
}
