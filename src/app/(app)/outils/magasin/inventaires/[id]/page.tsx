import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Badge, Cartouche } from "@/ui";
import { ComptageInventaire } from "@/tools/magasin/inventaire";
import {
  ETAT_INVENTAIRE_LABEL,
  peutGererReferentiel,
  type EtatInventaire,
} from "@/tools/magasin/model";
import { inventaireDetail } from "@/tools/magasin/queries";

export const metadata: Metadata = { title: "Comptage — Magasin" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const inventaire = await inventaireDetail(id);
  if (!inventaire) notFound();

  const etat = inventaire.etat as EtatInventaire;

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Inventaire"
        titre={inventaire.libelle}
        titreTexte={inventaire.libelle}
        sousTitre={inventaire.depot}
        retour={{ href: "/outils/magasin/inventaires", label: "Les campagnes" }}
        statut={
          <Badge tone={etat === "OUVERT" ? "warning" : etat === "VALIDE" ? "success" : "neutral"} point>
            {ETAT_INVENTAIRE_LABEL[etat]}
          </Badge>
        }
        description="On compte ce qu'on voit, on saisit au fur et à mesure. Le théorique a été figé à l'ouverture : le stock peut avoir bougé depuis sans fausser l'écart."
        className="mb-6"
      />

      <ComptageInventaire
        inventaire={inventaire}
        peutValider={peutGererReferentiel(session?.user?.role)}
      />
    </div>
  );
}
