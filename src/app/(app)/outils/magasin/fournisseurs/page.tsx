import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
import { ConfigMagasin } from "@/tools/magasin/config-magasin";
import { peutGererReferentiel } from "@/tools/magasin/model";
import { listerDepots, listerFournisseurs } from "@/tools/magasin/queries";

export const metadata: Metadata = { title: "Fournisseurs & dépôts — Magasin" };

export default async function Page() {
  const session = await auth();
  if (!peutGererReferentiel(session?.user?.role)) redirect("/outils/magasin");

  const [depots, fournisseurs] = await Promise.all([listerDepots(), listerFournisseurs()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Magasin"
        titre="Fournisseurs & dépôts"
        retour={{ href: "/outils/magasin", label: "Le rayon" }}
        description="Chez qui on achète, et où le matériel se trouve. Les commandes, elles, restent dans WhySoft — on n'en garde ici que le numéro, porté par la réception."
        className="mb-6"
      />

      <ConfigMagasin depots={depots} fournisseurs={fournisseurs} />
    </div>
  );
}
