import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
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
 *
 * ── LE BORDEREAU INTERNE (docs/DEVIS-DETAIL.md §7) ──────────────────────────
 * `?detail=1` révèle le détail des blocs forfaitaires, avec leur référence : le
 * bordereau, c'est cet aperçu avec l'interrupteur allumé, et « Imprimer / PDF »
 * tire ce qui est à l'écran. Trois raisons de le mettre ICI et pas dans le pavé
 * « Sur le document » :
 *
 *   1. les réglages du pavé sont PERSISTÉS sur le devis ; un quatrième réglage
 *      « montrer le détail » serait à un clic de tout dévoiler au client, et le
 *      lien public sert le devis vivant. Celui-ci ne vit que le temps d'une URL
 *      et ne peut rien laisser derrière lui ;
 *   2. le DÉFAUT reste l'aperçu client (interrupteur éteint) — cet écran sert à
 *      relire avant d'envoyer, et « non visible à l'impression » vaut aussi pour
 *      notre impression : un Ctrl+P distrait ne doit pas partir chez le client ;
 *   3. la page publique ne pourrait pas l'avoir de toute façon :
 *      `getDevisPublic` ne renvoie pas le détail, il n'y a rien à révéler.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ qui: string; id: string }>;
  searchParams: Promise<{ detail?: string }>;
}) {
  const { qui, id } = await params;
  const { detail } = await searchParams;
  await garde(qui);

  const [devis, societe] = await Promise.all([getDevis(id), getSociete()]);
  if (!devis) notFound();

  const numero = libelleDevis(devis.entete.numero, devis.entete.revision);
  const vueInterne = detail === "1";
  const nbForfaits = devis.lots.filter((l) => l.rendu === "CONDENSE").length;

  return (
    <>
      <TitreEcran
        estampille="ToolGus · Devis"
        titre={`${vueInterne ? "Vue interne" : "Aperçu client"} — ${numero}`}
      />

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
        {/* L'interrupteur ne s'affiche que s'il a quelque chose à révéler : sur
            un devis sans bloc forfaitaire, les deux vues sont identiques et le
            proposer ne ferait que poser une question sans objet. */}
        {nbForfaits > 0 && (
          <Link
            href={`/perso/${qui}/devis/${id}/apercu${vueInterne ? "" : "?detail=1"}`}
            className="bascule"
            prefetch={false}
          >
            {vueInterne ? (
              <>
                <EyeOff className="h-4 w-4" /> Revenir à la vue client
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" /> Voir le détail des {nbForfaits} bloc
                {nbForfaits > 1 ? "s" : ""} forfaitaire{nbForfaits > 1 ? "s" : ""}
              </>
            )}
          </Link>
        )}
        <BoutonImprimer />
      </div>

      <div className="devis-cadre">
        <DocumentDevis devis={devis} societe={societe} detailInterne={vueInterne} />
      </div>
    </>
  );
}
