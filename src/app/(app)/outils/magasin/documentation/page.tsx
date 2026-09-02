import type { Metadata } from "next";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
import { BibliothequeDocumentation } from "@/tools/magasin/bibliotheque-documentation";
import { peutGererReferentiel } from "@/tools/magasin/model";
import { listerDocumentationsAvecProduits } from "@/tools/magasin/documentation";

export const metadata: Metadata = { title: "Documentation — Magasin" };

/* LA BIBLIOTHÈQUE — toutes les fiches techniques de la maison, d'un coup d'œil.
 *
 * Elle REMPLACE l'ancien écran « Documentation » (une liste de PDF Distech lue
 * dans `public/`), avec deux différences qui portent tout : les fiches sont
 * rattachées aux PRODUITS (donc on les retrouve depuis la base matériel et les
 * devis les annexent tout seuls), et on en ajoute une sans reconstruire
 * l'application.
 *
 * En LECTURE pour tout le monde — un technicien a besoin des notices, et une
 * fiche constructeur ne porte aucun prix. Seule la gestion est réservée aux
 * profils Achats/Administrateur. */
export default async function Page() {
  const session = await auth();
  const docs = await listerDocumentationsAvecProduits();

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Magasin"
        titre="Documentation technique"
        retour={{ href: "/outils/magasin", label: "Le rayon" }}
        description="Fiches, notices et certificats des matériels. Chaque document est rattaché aux produits qu'il concerne : c'est ce qui le fait apparaître sur la fiche article, dans la base matériel, et en annexe des devis qui le chiffrent."
        champs={[
          { label: "Documents", valeur: docs.length, fort: true },
          {
            label: "Sans produit",
            valeur: docs.filter((d) => d.produits.length === 0).length,
          },
        ]}
        className="mb-6"
      />

      <BibliothequeDocumentation
        docs={docs}
        peutGerer={peutGererReferentiel(session?.user?.role)}
      />
    </div>
  );
}
