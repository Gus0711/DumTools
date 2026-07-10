import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Hash } from "lucide-react";
import { listerAffaires } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { EtatBadge } from "@/lib/chantiers/etat-badge";
import { NouvelleAffaire } from "@/lib/chantiers/nouvelle-affaire";

export const metadata: Metadata = { title: "Affaires" };

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

export default async function Page() {
  const [affaires, clients] = await Promise.all([listerAffaires(), listerClients()]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Affaires</h1>
          <p className="mt-1 text-muted">
            Toutes les affaires (une par numéro Why). Chaque affaire regroupe les
            réalisations produites pour elle à travers tous les outils. Le suivi
            commercial (prix, coûts) reste dans WhySoft.
          </p>
        </div>
        <NouvelleAffaire clients={clients.map((c) => c.nom)} />
      </header>

      {affaires.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
          Aucune affaire pour l&apos;instant. Renseignez un numéro Why dans un
          outil (ex. Projet GTB) : l&apos;affaire est créée automatiquement.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Affaire</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">N° Why</th>
                <th className="px-4 py-2.5 font-medium">État</th>
                <th className="px-4 py-2.5 font-medium">Réalisations</th>
                <th className="px-4 py-2.5 font-medium">Modifié</th>
              </tr>
            </thead>
            <tbody>
              {affaires.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/affaires/${a.id}`}
                      className="inline-flex items-center gap-2 font-medium text-fg hover:text-brand"
                    >
                      <Briefcase className="h-4 w-4 text-subtle" />
                      {a.nom}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{a.clientNom}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {a.numeroWhy ? (
                      <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
                        <Hash className="h-3 w-3 text-subtle" />
                        {a.numeroWhy}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <EtatBadge etat={a.etat} />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted">{a.nbRealisations}</td>
                  <td className="px-4 py-2.5 text-muted">{fmtDate(a.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
