import type { Metadata } from "next";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { listerAffaires } from "@/lib/chantiers/queries";

export const metadata: Metadata = { title: "Documents" };

export default async function Page() {
  const affaires = await listerAffaires();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Documents</h1>
        <p className="mt-1 text-muted">
          Téléversez les pièces d&apos;une affaire : elles sont miroitées sur kDrive
          (dans <span className="font-medium">chantier/année/client/affaire/catégorie</span>)
          et restent accessibles ici. Choisissez d&apos;abord l&apos;affaire.
        </p>
      </header>

      {affaires.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
          Aucune affaire. Créez-en une depuis « Affaires » pour y déposer des documents.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="table-cards w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Affaire</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">N° Why</th>
              </tr>
            </thead>
            <tbody>
              {affaires.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                >
                  <td className="cell-card-title px-4 py-2.5">
                    <Link
                      href={`/outils/documents/${a.id}`}
                      className="inline-flex items-center gap-2 font-medium text-fg hover:text-brand"
                    >
                      <FolderOpen className="h-4 w-4 text-subtle" />
                      {a.nom}
                    </Link>
                  </td>
                  <td data-label="Client" className="px-4 py-2.5 text-muted">{a.clientNom}</td>
                  <td data-label="N° Why" className="px-4 py-2.5 text-muted">{a.numeroWhy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
