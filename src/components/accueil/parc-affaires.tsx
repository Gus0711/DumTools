import Link from "next/link";
import { Briefcase, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { JaugeES } from "@/ui";
import { EtatBadge, SynoptiqueMini } from "@/lib/chantiers/etat-badge";
import type { EtatJalon, Jalon } from "@/lib/chantiers/jalons";
import type { DonneesAccueil, LigneParc } from "@/lib/accueil/queries";
import { fmtRelatif } from "@/lib/dates";

/* =============================================================================
 * LES AFFAIRES — le parc actif lu comme une planche de bornier
 *
 * Une ligne par affaire, et deux lectures superposées :
 *   · le CYCLE COMMERCIAL (5 voyants + badge) — où en est la vente ;
 *   · les 7 JALONS TECHNIQUES, alignés en colonnes sous leurs sigles — où en
 *     est le travail. C'est l'alignement qui fait le sel : on lit une colonne
 *     verticalement (« qui attend son armoire ? ») aussi bien qu'une ligne.
 *
 * Les jalons sont dérivés des artefacts réellement produits (voir jalons.ts) :
 * rien n'est cochable, c'est un miroir. Chaque voyant porte son libellé et son
 * détail en infobulle, et la ligne entière est résumée pour les lecteurs
 * d'écran — la couleur ne dit rien toute seule.
 * ========================================================================== */

/** Sigle de colonne par jalon, dans l'ordre de jalons.ts. */
const SIGLE: Record<Jalon["cle"], string> = {
  releve: "REL",
  etude: "ÉTU",
  armoire: "ARM",
  prog: "PRG",
  mes: "MES",
  livraison: "LIV",
  sav: "SAV",
};

const LED_JALON: Record<EtatJalon, string> = {
  fait: "led-on",
  encours: "led-cur",
  attente: "",
  sansobjet: "led-na",
};

const ETAT_LU: Record<EtatJalon, string> = {
  fait: "terminé",
  encours: "en cours",
  attente: "en attente",
  sansobjet: "sans objet",
};

/** La rangée des 7 voyants — même gabarit que la ligne d'entête, d'où l'alignement. */
function Jalons({ jalons }: { jalons: Jalon[] }) {
  return (
    <span
      // Le synoptique parle des E/S : il porte le bleu du signal AI.
      className="signal-ai grid w-[11.5rem] grid-cols-7 justify-items-center"
      aria-label={jalons.map((j) => `${j.libelle} ${ETAT_LU[j.etat]}`).join(", ")}
    >
      {jalons.map((j) => (
        <span
          key={j.cle}
          aria-hidden
          title={`${j.libelle} — ${ETAT_LU[j.etat]} (${j.detail})`}
          className={cn("led", LED_JALON[j.etat])}
        />
      ))}
    </span>
  );
}

export function ParcAffaires({
  parc,
  nbActives,
  esParc,
}: {
  parc: LigneParc[];
  nbActives: number;
  esParc: DonneesAccueil["esParc"];
}) {
  const aDesES = Object.values(esParc).some((n) => n > 0);
  const horsCadre = nbActives - parc.length;

  return (
    <section aria-label="Les affaires actives" className="bloc">
      <div className="bloc-entete signal-accent">
        <Briefcase className="text-signal h-4 w-4" />
        <span className="font-display text-sm font-semibold text-fg">Les affaires</span>
        <span className="stamp">
          {nbActives} active{nbActives > 1 ? "s" : ""}
        </span>
        <Link
          href="/affaires"
          className="ml-auto inline-flex min-h-[2.25rem] items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-brand sm:min-h-0"
        >
          Toutes
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {parc.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">
          Aucune affaire active. Une affaire naît d&apos;un numéro Why —{" "}
          <Link href="/affaires" className="font-semibold text-brand hover:underline">
            créer la première
          </Link>
          .
        </p>
      ) : (
        <>
          {/* La répartition E/S de tout le parc : le seul endroit de l'appli où
              on la voit d'un bloc, plutôt qu'automate par automate. */}
          {aDesES && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5">
              <span className="stamp shrink-0">Total E/S</span>
              <JaugeES compte={esParc} className="min-w-[14rem] flex-1" />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="data-table min-w-[46rem]">
              <thead>
                <tr>
                  <th>Affaire</th>
                  <th>Cycle commercial</th>
                  <th>
                    <span className="grid w-[11.5rem] grid-cols-7 justify-items-center font-mono text-[0.6rem] tracking-normal">
                      {(Object.keys(SIGLE) as Jalon["cle"][]).map((cle) => (
                        <span key={cle}>{SIGLE[cle]}</span>
                      ))}
                    </span>
                  </th>
                  <th className="text-right">Mouvement</th>
                </tr>
              </thead>
              <tbody>
                {parc.map((a) => (
                  <tr key={a.id}>
                    <td className="cell-wrap">
                      <Link href={`/affaires/${a.id}`} className="cell-title hover:underline">
                        {a.nom}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                        {a.clientNom}
                        {a.numeroWhy && <span className="ref text-subtle">{a.numeroWhy}</span>}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <SynoptiqueMini etat={a.etat} />
                        <EtatBadge etat={a.etat} />
                      </span>
                    </td>
                    <td>
                      <Jalons jalons={a.jalons} />
                    </td>
                    <td
                      suppressHydrationWarning
                      className="cell-num text-right text-xs text-subtle"
                    >
                      {fmtRelatif(a.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ce que l'extrait laisse dehors se dit — une coupe silencieuse se
              lit comme « il n'y a que ça ». */}
          {horsCadre > 0 && (
            <Link
              href="/affaires"
              className="flex min-h-[2.75rem] items-center justify-center gap-1.5 border-t border-hairline text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-brand sm:min-h-[2.25rem]"
            >
              {horsCadre} autre{horsCadre > 1 ? "s" : ""} affaire{horsCadre > 1 ? "s" : ""} active
              {horsCadre > 1 ? "s" : ""}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </>
      )}
    </section>
  );
}
