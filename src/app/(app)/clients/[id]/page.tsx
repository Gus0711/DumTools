import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FileStack, Hash } from "lucide-react";
import { getClient } from "@/lib/clients/queries";
import { listerRealisationsClient } from "@/lib/clients/providers";
import { ClientFicheHeader } from "@/lib/clients/client-fiche-header";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client ? `Client · ${client.nom}` : "Client" };
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const realisations = await listerRealisationsClient(id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <ClientFicheHeader id={client.id} nom={client.nom} />

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
          <FileStack className="h-4 w-4 text-muted" />
          Réalisations
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
            {realisations.length}
          </span>
        </h2>

        {realisations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
            Rien n’a encore été produit pour ce client. Créez un document dans un
            outil en le rattachant à ce client.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-2.5 font-medium">Document</th>
                  <th className="px-4 py-2.5 font-medium">Outil</th>
                  <th className="px-4 py-2.5 font-medium">N° Why</th>
                  <th className="px-4 py-2.5 font-medium">Détail</th>
                  <th className="px-4 py-2.5 font-medium">Modifié</th>
                </tr>
              </thead>
              <tbody>
                {realisations.map((r) => (
                  <tr
                    key={`${r.toolId}:${r.id}`}
                    className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={r.href}
                        className="font-medium text-fg hover:text-brand"
                      >
                        {r.titre}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{r.toolNom}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {r.numeroWhy ? (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
                          <Hash className="h-3 w-3 text-subtle" />
                          {r.numeroWhy}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{r.resume}</td>
                    <td className="px-4 py-2.5 text-muted">{fmtDate(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
