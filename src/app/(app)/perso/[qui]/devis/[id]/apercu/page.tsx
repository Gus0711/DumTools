import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
import { getDevis, getSociete } from "@/tools/devis/queries";
import { DocumentDevis } from "@/tools/devis/document-devis";
import { BoutonImprimer } from "@/tools/devis/bouton-imprimer";
import { libelleDevis } from "@/tools/devis/model";
import { garde } from "../../garde";

export const metadata: Metadata = { title: "Aperçu client · Devis" };

/* L'aperçu du document tel que le client le verra — le MÊME composant que la
 * page publique, pas une seconde mise en page qui divergerait.
 *
 * C'est ce qui permet de relire un devis avant de l'envoyer et d'en sortir un
 * PDF au navigateur (Ctrl+P) sans avoir encore publié de lien. Écran interne,
 * donc gardé comme les autres : le document ne montre aucun déboursé, mais y
 * accéder par l'id d'un devis reste une lecture du chiffrage.
 */
export default async function Page({ params }: { params: Promise<{ qui: string; id: string }> }) {
  const { qui, id } = await params;
  await garde(qui);

  const [devis, societe] = await Promise.all([getDevis(id), getSociete()]);
  if (!devis) notFound();

  const numero = libelleDevis(devis.entete.numero, devis.entete.revision);

  return (
    <>
      <TitreEcran estampille="ToolGus · Devis" titre={`Aperçu client — ${numero}`} />

      {/* La seule chose que cet écran ajoute au document : le chemin du retour,
          et dire si ce qu'on lit est déjà parti chez le client. */}
      <div className="devis-lecteur">
        <Link href={`/perso/${qui}/devis/${id}`} className="titre">
          <ChevronLeft className="inline h-4 w-4" /> Retour au chiffrage
        </Link>
        <span>
          {devis.entete.jetonPartage
            ? "Publié — le client voit cette page."
            : "Aperçu — ce devis n'est pas encore publié."}
        </span>
        <BoutonImprimer />
      </div>

      <div className="devis-cadre">
        <DocumentDevis devis={devis} societe={societe} />
      </div>
    </>
  );
}
