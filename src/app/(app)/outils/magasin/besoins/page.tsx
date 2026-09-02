import type { Metadata } from "next";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
import { BesoinsConsolides } from "@/tools/magasin/besoins";
import { besoinConsolide } from "@/tools/magasin/besoin-consolide";
import { peutVoirPrix } from "@/tools/magasin/model";

export const metadata: Metadata = { title: "Besoin consolidé — Magasin" };

export default async function Page() {
  const session = await auth();
  const peutPrix = peutVoirPrix(session?.user?.role);
  const besoin = await besoinConsolide();

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Magasin"
        titre="Besoin consolidé"
        description="Ce qu'il faut acheter pour PLUSIEURS affaires à la fois. Le besoin de chacune est celui de sa fiche matériel — on ne recalcule rien, on additionne. Le stock, lui, ne s'additionne pas : une sonde en rayon est une sonde, pas dix-sept."
        retour={{ href: "/outils/magasin", label: "Retour au magasin" }}
        champs={[
          { label: "Affaires", valeur: besoin.affaires.length },
          { label: "Références", valeur: besoin.lignes.length, fort: true },
        ]}
        className="mb-6"
      />

      <BesoinsConsolides
        affaires={besoin.affaires}
        lignes={besoin.lignes}
        trous={besoin.trous}
        peutPrix={peutPrix}
      />
    </div>
  );
}
