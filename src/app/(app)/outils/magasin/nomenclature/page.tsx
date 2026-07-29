import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
import { Nomenclature } from "@/tools/magasin/nomenclature";
import { peutGererReferentiel } from "@/tools/magasin/model";
import { listerNomenclatures, listerRayon } from "@/tools/magasin/queries";

export const metadata: Metadata = { title: "Nomenclature — Magasin" };

export default async function Page() {
  const session = await auth();
  if (!peutGererReferentiel(session?.user?.role)) redirect("/outils/magasin");

  const [points, rayon] = await Promise.all([listerNomenclatures(), listerRayon()]);
  const nbRelies = points.filter((p) => p.lignes.length > 0).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Magasin"
        titre="Nomenclature des points"
        retour={{ href: "/outils/magasin", label: "Le rayon" }}
        description="Ce qu'un point d'E/S appelle physiquement : une sonde de gaine, c'est une sonde + un doigt de gant + un presse-étoupe. C'est ce tableau qui permet de chiffrer le matériel d'une affaire depuis sa seule liste de points."
        champs={[
          { label: "Points du catalogue", valeur: points.length, fort: true },
          { label: "Avec nomenclature", valeur: nbRelies, fort: true },
        ]}
        className="mb-6"
      />

      <Nomenclature
        points={points}
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
      />
    </div>
  );
}
