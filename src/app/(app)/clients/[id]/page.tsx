import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {FileStack, Hash} from "lucide-react";
import { getClient } from "@/lib/clients/queries";
import { listerRealisationsClient } from "@/lib/clients/providers";
import { ClientFicheHeader } from "@/lib/clients/client-fiche-header";
import { ClientIdentite } from "@/lib/clients/client-identite";
import { ClientContacts } from "@/lib/clients/client-contacts";
import { lienRetour } from "@/lib/retour";
import { EnteteSection } from "@/ui";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retour?: string }>;
}) {
  const { id } = await params;
  const { retour } = await searchParams;
  const client = await getClient(id);
  if (!client) notFound();

  const realisations = await listerRealisationsClient(id);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <ClientFicheHeader
        id={client.id}
        nom={client.nom}
        retour={lienRetour(retour, { href: "/clients", label: "Clients" })}
      />

      {/* Qui est ce client, et à qui on lui écrit. Avant les réalisations :
          c'est ce qu'on vient chercher pour préparer un devis, et ce qui
          pré-remplit son destinataire (docs/DEVIS.md §24). */}
      <div className="mb-6 space-y-4">
        <ClientIdentite client={client} />
        <ClientContacts clientId={client.id} contacts={client.contacts} />
      </div>

      <section>
        <EnteteSection icone={FileStack} titre="Réalisations" compteur={realisations.length} />

        {realisations.length === 0 ? (
          <div className="border border-dashed border-border bg-surface p-12 text-center text-muted">
            Rien n’a encore été produit pour ce client. Créez un document dans un
            outil en le rattachant à ce client.
          </div>
        ) : (
          <div className="overflow-x-auto border border-hairline bg-surface">
            <table className="table-cards w-full border-collapse text-sm">
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
                    <td className="cell-card-title px-4 py-2.5">
                      <Link
                        href={r.href}
                        className="font-medium text-fg hover:text-brand"
                      >
                        {r.titre}
                      </Link>
                    </td>
                    <td data-label="Outil" className="px-4 py-2.5 text-muted">{r.toolNom}</td>
                    <td data-label="N° Why" className="px-4 py-2.5 text-muted">
                      {r.numeroWhy ? (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
                          <Hash className="h-3 w-3 text-subtle" />
                          {r.numeroWhy}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Détail" className="px-4 py-2.5 text-muted">{r.resume}</td>
                    <td data-label="Modifié" className="px-4 py-2.5 text-muted">{fmtDate(r.updatedAt)}</td>
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
