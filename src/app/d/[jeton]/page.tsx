import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDevisPublic } from "@/tools/devis/queries";
import { DocumentDevis } from "@/tools/devis/document-devis";
import { BarreLecteur } from "@/tools/devis/barre-lecteur";
import { libelleDevis } from "@/tools/devis/model";

/* Page PUBLIQUE d'un devis — servie SANS session (route exclue du matcher de
 * src/proxy.ts, et l'app est exposée sur internet via le tunnel Cloudflare).
 * Règles de sûreté, les mêmes que `/n/[jeton]` :
 *   - chargement par JETON uniquement, jamais par id ;
 *   - `partageActif()` juge le jeton ET son échéance (dans `getDevisPublic`) ;
 *   - lecture seule, aucune action ;
 *   - médias servis par la route publique scopée au jeton ;
 *   - pas d'indexation par les moteurs de recherche.
 *
 * Le DOCUMENT est rendu côté serveur, sans JavaScript : seule la barre du
 * lecteur (imprimer, télécharger) est un îlot client. Un navigateur qui
 * n'exécuterait rien afficherait quand même le devis entier — c'est la
 * différence entre un document et une application.
 */

// Le journal de consultation et l'état courant du devis : rien de tout cela ne
// se met en cache. Le lien montre le devis à sa source.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jeton: string }>;
}): Promise<Metadata> {
  const { jeton } = await params;
  const pub = await getDevisPublic(jeton);
  return {
    title: pub
      ? `Devis ${libelleDevis(pub.devis.entete.numero, pub.devis.entete.revision)}`
      : "Devis introuvable",
    robots: { index: false, follow: false },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  const [{ jeton }, { pdf }] = await Promise.all([params, searchParams]);
  const pub = await getDevisPublic(jeton);
  // Un jeton inconnu, révoqué ou ÉCHU donne la même page introuvable : on ne dit
  // pas à un lien périmé qu'il a existé.
  if (!pub) notFound();

  const { devis, societe } = pub;
  const numero = libelleDevis(devis.entete.numero, devis.entete.revision);

  // `?pdf=1` : c'est notre propre Chromium qui lit la page pour l'imprimer. Ni
  // barre du lecteur (elle compterait une consultation à chaque téléchargement),
  // ni pied de document (Chromium pose le sien sur chaque page).
  if (pdf) {
    return (
      <div className="devis-page">
        <div className="devis-cadre">
          <DocumentDevis devis={devis} societe={societe} pourPdf />
        </div>
      </div>
    );
  }

  return (
    <div className="devis-page">
      <BarreLecteur jeton={jeton} numero={numero} />
      <div className="devis-cadre">
        <DocumentDevis devis={devis} societe={societe} />
      </div>
    </div>
  );
}
