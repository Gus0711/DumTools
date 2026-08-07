import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import { Cartouche } from "@/ui";
import { listerCategories } from "@/tools/magasin/queries";
import { grilleCoefs, listerCoefs, listerPrestations } from "@/tools/devis/queries";
import { ReferentielsDevis } from "@/tools/devis/referentiels-devis";
import { garde } from "../garde";

export const metadata: Metadata = { title: "Prestations & coefficients · ToolGus" };

export default async function Page({ params }: { params: Promise<{ qui: string }> }) {
  const { qui } = await params;
  await garde(qui);

  const [prestations, coefs, grille, categories] = await Promise.all([
    listerPrestations(),
    listerCoefs(),
    grilleCoefs(),
    listerCategories(),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="ToolGus · Devis"
        retour={{ href: `/perso/${qui}/devis`, label: "Les devis" }}
        titre={
          <span className="flex items-center gap-2.5">
            <Settings2 className="h-6 w-6 text-accent" />
            Prestations & coefficients
          </span>
        }
        titreTexte="Prestations & coefficients"
        description="La politique commerciale de la maison : ce qu'on sait vendre en main d'œuvre, et de combien on multiplie le déboursé pour en faire un prix de vente."
        className="mb-6"
      />

      <ReferentielsDevis
        prestations={prestations}
        coefs={coefs}
        coefGlobal={grille.globalMillieme}
        categories={categories.filter((c) => c.actif).map((c) => ({ id: c.id, nom: c.nom }))}
      />
    </div>
  );
}
