import type { Metadata } from "next";
import Link from "next/link";
import { Unlink } from "lucide-react";
import { Cartouche, Chiffre, RangeeChiffres } from "@/ui";
import { auth } from "@/auth";
import { compterProjetsOrphelins } from "@/tools/affectation-es/queries";
import { listerAffaires, listerMesTaches } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { ETATS_ACTIFS } from "@/lib/chantiers/etats";
import { NouvelleAffaire } from "@/lib/chantiers/nouvelle-affaire";
import { AffairesListe } from "@/lib/chantiers/affaires-liste";
import { MesTaches } from "@/lib/chantiers/mes-taches";

export const metadata: Metadata = { title: "Affaires" };

/* =============================================================================
 * LE TABLEAU DE BORD DES AFFAIRES
 * Même rythme que l'accueil : un en-tête estampillé sous le filet des cinq
 * signaux, la rangée de chiffres collée dessous, puis des blocs qui portent
 * chacun leur titre. Le titre de la liste et ses filtres sont DANS le cadre du
 * tableau — c'est ce qui manquait pour que l'écran se lise comme l'accueil.
 * ========================================================================== */

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
      <section className="mb-4">
        <Cartouche
          estampille="Référentiel"
          titre="Affaires"
          description="Une affaire par numéro Why. Elle regroupe tout ce qui est produit pour un client, à travers tous les outils — le suivi commercial, lui, reste dans WhySoft."
          actions={<NouvelleAffaire clients={clients.map((c) => c.nom)} />}
        />

        <RangeeChiffres className="-mt-px">
          <Chiffre label="Total" valeur={affaires.length} />
          <Chiffre label="Actives" valeur={actives} detail="devis, commande, en cours" />
          <Chiffre label="Livrées" valeur={livrees} ton={livrees > 0 ? "success" : "neutre"} />
          <Chiffre label="Réalisations" valeur={realisations} detail="tous outils confondus" />
        </RangeeChiffres>
      </section>

      {mesTaches.length > 0 && (
        <section className="mb-4">
          <MesTaches taches={mesTaches} limite={8} />
        </section>
      )}

      {/* Filet de rattrapage : un projet GTB sans affaire (ancien projet, ou
          affaire supprimée → chantierId remis à null) n'apparaît sur aucune
          fiche. C'est le seul endroit qui le signale. */}
      {nbOrphelins > 0 && (
        <Link
          href="/outils/affectation-es?sans-affaire=1"
          className="mb-4 flex items-center gap-2.5 border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-fg transition-colors hover:bg-accent/15"
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

      <AffairesListe affaires={affaires} moiId={session?.user?.id ?? null} />
    </div>
  );
}
