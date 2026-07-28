import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, Smartphone } from "lucide-react";
import { Cartouche, EtatVide } from "@/ui";
import { TYPE_LABEL, TYPE_TON } from "@/tools/visites/model";
import { listerVisites } from "@/tools/visites/queries";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Visites de chantier" };

function formatDateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Index des visites SYNCHRONISÉES (consultation au bureau). La saisie se fait
 *  dans le mode terrain (îlot offline, /outils/visites/terrain). */
export default async function Page() {
  const visites = await listerVisites();

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Terrain"
        titre="Visites de chantier"
        description="Relevés avant chiffrage, suivis, réceptions et interventions SAV — checklist guide, photos et notes vocales prises sur place, même sans réseau."
        actions={
          <Link
            href="/outils/visites/terrain"
            className="press inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg shadow-sm transition-colors hover:bg-brand-strong"
          >
            <Smartphone className="h-4 w-4" />
            Mode terrain
          </Link>
        }
        champs={[{ label: "Visites synchronisées", valeur: visites.length, fort: true }]}
        className="mb-6"
      />

      {visites.length === 0 ? (
        <div className="data-card">
          <EtatVide
            dessin="armoire"
            titre="Aucune visite synchronisée"
            texte="Les visites se saisissent sur le téléphone, en mode terrain — elles remontent ici dès qu'il y a du réseau."
            action={
              <Link
                href="/outils/visites/terrain"
                className="text-sm font-semibold text-brand hover:underline"
              >
                Ouvrir le mode terrain →
              </Link>
            }
          />
        </div>
      ) : (
        <div className="data-card overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Visite</th>
                <th>Type</th>
                <th>Affaire</th>
                <th>Client</th>
                <th>N° Why</th>
                <th>Avancement</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {visites.map((v) => (
                <tr key={v.id}>
                  <td className="cell-title cell-card-title cell-wrap">
                    <Link
                      href={`/outils/visites/${v.id}`}
                      className="group inline-flex items-center gap-2 transition-colors hover:text-brand"
                    >
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-brand" />
                      {v.titre}
                    </Link>
                  </td>
                  <td data-label="Type">
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                        TYPE_TON[v.type],
                      )}
                    >
                      {TYPE_LABEL[v.type]}
                    </span>
                  </td>
                  <td data-label="Affaire">{v.chantierNom || "—"}</td>
                  <td data-label="Client">{v.clientNom || "—"}</td>
                  <td data-label="N° Why">
                    {v.numeroWhy ? (
                      <span className="ref">{v.numeroWhy}</span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td data-label="Avancement">{v.resume}</td>
                  <td data-label="Date">{formatDateFr(v.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
