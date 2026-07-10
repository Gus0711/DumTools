import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FileStack, Hash, Plus } from "lucide-react";
import { Button } from "@/ui";
import { getAffaire } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { listerRealisationsAffaire } from "@/lib/chantiers/providers";
import { AffaireFicheHeader } from "@/lib/chantiers/affaire-fiche-header";
import { creerProjetPourAffaire } from "@/tools/affectation-es/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const affaire = await getAffaire(id);
  return { title: affaire ? `Affaire · ${affaire.nom}` : "Affaire" };
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const affaire = await getAffaire(id);
  if (!affaire) notFound();

  const [realisations, clients] = await Promise.all([
    listerRealisationsAffaire(id),
    listerClients(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <AffaireFicheHeader
        id={affaire.id}
        nom={affaire.nom}
        etat={affaire.etat}
        clientNom={affaire.clientNom}
        numeroWhy={affaire.numeroWhy}
        clients={clients.map((c) => c.nom)}
      />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <FileStack className="h-4 w-4 text-muted" />
            Réalisations
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
              {realisations.length}
            </span>
          </h2>
          <form
            action={async () => {
              "use server";
              await creerProjetPourAffaire(id);
            }}
          >
            <Button type="submit" size="sm" variant="outline">
              <Plus className="h-4 w-4" /> Ajouter un automate
            </Button>
          </form>
        </div>

        {realisations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
            Rien n&apos;est encore rattaché à cette affaire. Renseignez le même
            numéro Why dans un outil pour l&apos;y rattacher automatiquement.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-2.5 font-medium">Réalisation</th>
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
                      <Link href={r.href} className="font-medium text-fg hover:text-brand">
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
