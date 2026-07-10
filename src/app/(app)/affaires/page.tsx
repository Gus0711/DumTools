import type { Metadata } from "next";
import { listerAffaires } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { NouvelleAffaire } from "@/lib/chantiers/nouvelle-affaire";
import { AffairesListe } from "@/lib/chantiers/affaires-liste";

export const metadata: Metadata = { title: "Affaires" };

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
        <AffairesListe affaires={affaires} />
      )}
    </div>
  );
}
