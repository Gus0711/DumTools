import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { Badge, Cartouche } from "@/ui";
import { getContratDetail, listerIntervenants } from "@/tools/maintenance/queries";
import { LIBELLE_ETAT, TON_ETAT, formatDuree, formatJour, jour } from "@/tools/maintenance/model";
import { FicheContrat } from "@/tools/maintenance/fiche-contrat";
import { garde } from "../garde";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await getContratDetail(id);
  return { title: c ? `${c.intitule} · Maintenance` : "Contrat" };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ qui: string; id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { qui, id } = await params;
  const { p } = await searchParams;
  const { userId } = await garde(qui);

  // `?p=` = la période regardée. Une valeur fantaisiste ne casse rien :
  // getContratDetail retombe sur la période en cours.
  const voulu = p != null && /^\d+$/.test(p) ? Number(p) : null;

  const [contrat, intervenants] = await Promise.all([
    getContratDetail(id, voulu),
    listerIntervenants(),
  ]);
  if (!contrat) notFound();

  return (
    <div className="signal-com mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Contrat de maintenance"
        retour={{ href: `/perso/${qui}/maintenance`, label: "Maintenance" }}
        titre={
          <span className="flex items-center gap-2.5">
            <LifeBuoy className="text-signal h-6 w-6" />
            {contrat.intitule}
          </span>
        }
        titreTexte={contrat.intitule}
        sousTitre={contrat.clientNom}
        statut={
          <Badge tone={TON_ETAT[contrat.etat]} point>
            {LIBELLE_ETAT[contrat.etat]}
          </Badge>
        }
        champs={[
          { label: "Référence", valeur: contrat.reference, ref: true },
          { label: "N° Why", valeur: contrat.numeroWhy, ref: true },
          { label: "Effet", valeur: formatJour(jour(contrat.debut)) },
          {
            label: "Terme",
            valeur: contrat.fin ? formatJour(jour(contrat.fin)) : "sans terme",
          },
          /* DEUX champs, jamais leur somme : les deux forfaits ne se
             compensent pas (une heure de téléassistance épargnée ne paie pas un
             déplacement). Un « forfait annuel » unique laisserait croire à une
             enveloppe commune — c'est exactement ce que le contrat ne dit pas. */
          {
            label: "Télé / an",
            valeur:
              contrat.quotaTeleMin > 0 ? formatDuree(contrat.quotaTeleMin) : "aucune",
            fort: contrat.quotaTeleMin > 0,
          },
          {
            label: "Sur site / an",
            valeur:
              contrat.quotaPresentielMin > 0
                ? formatDuree(contrat.quotaPresentielMin)
                : "aucun",
            fort: contrat.quotaPresentielMin > 0,
          },
          { label: "Sites", valeur: contrat.sites.length, fort: true },
        ]}
        className="mb-6"
      />

      <FicheContrat
        qui={qui}
        contrat={contrat}
        intervenants={intervenants}
        moiId={userId}
      />
    </div>
  );
}
