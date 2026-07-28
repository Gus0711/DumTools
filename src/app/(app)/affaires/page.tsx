import type { Metadata } from "next";
import Link from "next/link";
import { Unlink } from "lucide-react";
import { Chiffre, RangeeChiffres } from "@/ui";
import { auth } from "@/auth";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
import { compterProjetsOrphelins } from "@/tools/affectation-es/queries";
import { listerAffaires, listerMesTaches } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { ETATS_ACTIFS } from "@/lib/chantiers/etats";
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

  const actives = affaires.filter((a) => ETATS_ACTIFS.includes(a.etat)).length;
  const livrees = affaires.filter((a) => a.etat === "LIVRE").length;
  const realisations = affaires.reduce((n, a) => n + a.nbRealisations, 0);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <TitreEcran estampille="Référentiel" titre="Affaires" />

      <section className="anim-rise mb-6">
        <div className="bloc flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-4 py-5 md:px-6">
          <div className="min-w-0">
            <p className="stamp">Une affaire par numéro Why</p>
            <h1 className="mt-2 font-display text-[clamp(1.8rem,1.1rem+2.2vw,2.9rem)] font-bold leading-none tracking-[-0.035em] text-fg">
              Affaires
            </h1>
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted">
              Elle regroupe tout ce qui est produit pour un client, à travers tous les outils.
              Le suivi commercial reste dans WhySoft.
            </p>
          </div>
          <NouvelleAffaire clients={clients.map((c) => c.nom)} />
        </div>

        <RangeeChiffres className="-mt-px">
          <Chiffre label="Total" valeur={affaires.length} />
          <Chiffre label="Actives" valeur={actives} detail="devis, commande, en cours" />
          <Chiffre label="Livrées" valeur={livrees} ton={livrees > 0 ? "success" : "neutre"} />
          <Chiffre label="Réalisations" valeur={realisations} detail="tous outils confondus" />
        </RangeeChiffres>
      </section>

      {mesTaches.length > 0 && (
        <section className="mb-6">
          <MesTaches taches={mesTaches} limite={8} />
        </section>
      )}

      {/* Filet de rattrapage : un projet GTB sans affaire (ancien projet, ou
          affaire supprimée → chantierId remis à null) n'apparaît sur aucune
          fiche. C'est le seul endroit qui le signale. */}
      {nbOrphelins > 0 && (
        <Link
          href="/outils/affectation-es?sans-affaire=1"
          className="mb-5 flex items-center gap-2.5 border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-fg transition-colors hover:bg-accent/15"
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

      <AffairesListe affaires={affaires} />
    </div>
  );
}
