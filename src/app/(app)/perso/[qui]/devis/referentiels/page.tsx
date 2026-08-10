import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import { Cartouche } from "@/ui";
import { listerCategories } from "@/tools/magasin/queries";
import { getSociete, grilleCoefs, listerCoefs, listerPrestations } from "@/tools/devis/queries";
import { ReferentielsDevis } from "@/tools/devis/referentiels-devis";
import { garde } from "../garde";

export const metadata: Metadata = { title: "Référentiels du devis · ToolGus" };

export default async function Page({ params }: { params: Promise<{ qui: string }> }) {
  const { qui } = await params;
  await garde(qui);

  const [prestations, coefs, grille, categories, societe] = await Promise.all([
    listerPrestations(),
    listerCoefs(),
    grilleCoefs(),
    listerCategories(),
    getSociete(),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="ToolGus · Devis"
        retour={{ href: `/perso/${qui}/devis`, label: "Les devis" }}
        titre={
          <span className="flex items-center gap-2.5">
            <Settings2 className="text-signal h-6 w-6" />
            Référentiels du devis
          </span>
        }
        titreTexte="Référentiels du devis"
        description="La politique commerciale de la maison : ce qu'on sait vendre en main d'œuvre, de combien on multiplie le déboursé pour en faire un prix de vente, et ce qui s'imprime au bas de chaque devis."
        className="signal-ao mb-5"
      />

      <ReferentielsDevis
        prestations={prestations}
        coefs={coefs}
        coefGlobal={grille.globalMillieme}
        categories={categories.filter((c) => c.actif).map((c) => ({ id: c.id, nom: c.nom }))}
        societe={societe}
      />
    </div>
  );
}
