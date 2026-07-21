import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, Smartphone } from "lucide-react";
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
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Visites de chantier</h1>
          <p className="mt-1 text-muted">
            Relevés avant chiffrage, suivis, réceptions et interventions SAV — avec
            checklist guide, photos et notes vocales prises sur place, même sans réseau.
          </p>
        </div>
        <Link
          href="/outils/visites/terrain"
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg shadow-sm transition-colors hover:bg-brand-strong sm:self-auto"
        >
          <Smartphone className="h-4 w-4" />
          Mode terrain
        </Link>
      </header>

      {visites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
          Aucune visite synchronisée pour l&apos;instant. Ouvrez le{" "}
          <Link href="/outils/visites/terrain" className="font-medium text-brand hover:underline">
            mode terrain
          </Link>{" "}
          sur votre téléphone pour créer la première.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="table-cards w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Visite</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Affaire</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">N° Why</th>
                <th className="px-4 py-2.5 font-medium">Avancement</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {visites.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                >
                  <td className="cell-card-title px-4 py-2.5">
                    <Link
                      href={`/outils/visites/${v.id}`}
                      className="inline-flex items-center gap-2 font-medium text-fg hover:text-brand"
                    >
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-subtle" />
                      {v.titre}
                    </Link>
                  </td>
                  <td data-label="Type" className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                        TYPE_TON[v.type],
                      )}
                    >
                      {TYPE_LABEL[v.type]}
                    </span>
                  </td>
                  <td data-label="Affaire" className="px-4 py-2.5 text-muted">
                    {v.chantierNom || "—"}
                  </td>
                  <td data-label="Client" className="px-4 py-2.5 text-muted">
                    {v.clientNom || "—"}
                  </td>
                  <td data-label="N° Why" className="px-4 py-2.5 text-muted">
                    {v.numeroWhy ?? "—"}
                  </td>
                  <td data-label="Avancement" className="px-4 py-2.5 text-muted">{v.resume}</td>
                  <td data-label="Date" className="px-4 py-2.5 tabular-nums text-muted">
                    {formatDateFr(v.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
