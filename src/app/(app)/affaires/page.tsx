import type { Metadata } from "next";
import Link from "next/link";
import { Unlink } from "lucide-react";
import { auth } from "@/auth";
import { compterProjetsOrphelins } from "@/tools/affectation-es/queries";
import { listerAffaires, listerMesTaches } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { NouvelleAffaire } from "@/lib/chantiers/nouvelle-affaire";
import { AffairesListe } from "@/lib/chantiers/affaires-liste";
import { MesTaches } from "@/lib/chantiers/mes-taches";

export const metadata: Metadata = { title: "Affaires" };

export default async function Page() {
  const session = await auth();
  const [affaires, clients, mesTaches, nbOrphelins] = await Promise.all([
    listerAffaires(),
    listerClients(),
    session?.user?.id ? listerMesTaches(session.user.id) : Promise.resolve([]),
    compterProjetsOrphelins(),
  ]);

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

      {mesTaches.length > 0 && <MesTaches taches={mesTaches} />}

      {/* Filet de rattrapage : un projet GTB sans affaire (ancien projet, ou
          affaire supprimée → chantierId remis à null) n'apparaît sur aucune
          fiche. C'est le seul endroit qui le signale. */}
      {nbOrphelins > 0 && (
        <Link
          href="/outils/affectation-es?sans-affaire=1"
          className="mb-6 flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-fg transition-colors hover:bg-accent/15"
        >
          <Unlink className="h-4 w-4 shrink-0 text-accent" />
          <span>
            <strong className="font-semibold">
              {nbOrphelins} projet{nbOrphelins > 1 ? "s" : ""} GTB
            </strong>{" "}
            {nbOrphelins > 1 ? "ne sont rattachés" : "n’est rattaché"} à aucune affaire —
            {nbOrphelins > 1 ? " les rattacher" : " le rattacher"}.
          </span>
        </Link>
      )}

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
