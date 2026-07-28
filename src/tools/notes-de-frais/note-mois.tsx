"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Info,
  Paperclip,
  RotateCcw,
  Send,
} from "lucide-react";
import { Badge, Button } from "@/ui";
import { cn } from "@/lib/cn";
import {
  alertesRecap,
  formatEuros,
  LIBELLE_CATEGORIE,
  periodePrecedente,
  periodeSuivante,
  titrePeriode,
  totalCents,
  totauxParCategorie,
  type DepenseVue,
  type Periode,
  type ProfilNdf,
} from "./model";
import { marquerTransmise, rouvrirMois } from "./actions";

/**
 * La note d'un mois : ce qui partira à la compta, tel quel. Le n° de pièce
 * affiché ici est CELUI de la colonne A de l'Excel et celui tamponné sur la
 * page du PDF — les trois documents se lisent ensemble.
 */
export function NoteMois({
  qui,
  periode,
  profil,
  depenses,
  transmiseLeInitial,
  nbEnAttente,
}: {
  qui: string;
  periode: Periode;
  profil: ProfilNdf;
  depenses: DepenseVue[];
  transmiseLeInitial: string | null;
  /** Dépenses sans justificatif, toutes périodes : le rappel de ce qui manque. */
  nbEnAttente: number;
}) {
  const router = useRouter();
  const racine = `/perso/${qui}/notes-de-frais`;
  const [transmiseLe, setTransmiseLe] = useState(transmiseLeInitial);
  const [enCours, demarrer] = useTransition();

  const total = totalCents(depenses);
  const sousTotaux = totauxParCategorie(depenses, profil);
  const alertes = alertesRecap(depenses);
  const vide = depenses.length === 0;

  return (
    <div className="pb-24">
      {/* ------------------------------------------------ navigation de mois */}
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`${racine}/${periodePrecedente(periode)}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"
        >
          <ChevronLeft className="h-4 w-4" />
          {titrePeriode(periodePrecedente(periode))}
        </Link>
        <Link
          href={`${racine}/${periodeSuivante(periode)}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"
        >
          {titrePeriode(periodeSuivante(periode))}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* ------------------------------------------------------------ total */}
      <section className="mb-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
                {titrePeriode(periode)}
              </h1>
              {transmiseLe ? (
                <Badge tone="success">Transmise</Badge>
              ) : !vide ? (
                <Badge tone="accent">À transmettre</Badge>
              ) : null}
            </div>
            <div className="mt-2 font-display text-4xl font-bold tabular-nums text-fg">
              {formatEuros(total)}
            </div>
            <div className="mt-1 text-sm text-muted">
              {vide
                ? "Aucune dépense justifiée sur ce mois"
                : `${depenses.length} pièce${depenses.length > 1 ? "s" : ""}`}
              {transmiseLe &&
                ` · remise le ${new Date(transmiseLe).toLocaleDateString("fr-FR")}`}
            </div>
          </div>

          {sousTotaux.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {sousTotaux.map((t) => (
                <li
                  key={t.categorie}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted"
                >
                  {LIBELLE_CATEGORIE[t.categorie]}{" "}
                  <span className="font-semibold tabular-nums text-fg">
                    {formatEuros(t.cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- alertes */}
      {(alertes.length > 0 || nbEnAttente > 0) && (
        <ul className="mb-6 space-y-2">
          {nbEnAttente > 0 && (
            <li className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-soft/40 p-3 text-sm">
              <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-accent-fg" />
              <span className="text-fg">
                {nbEnAttente} dépense{nbEnAttente > 1 ? "s" : ""} sans
                justificatif {nbEnAttente > 1 ? "n'entrent" : "n'entre"} dans
                aucune note.{" "}
                <Link href={racine} className="underline underline-offset-2">
                  Compléter
                </Link>
              </span>
            </li>
          )}
          {alertes.map((a, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-sm",
                a.niveau === "attention"
                  ? "border-danger/30 bg-danger/5 text-danger"
                  : "border-border bg-surface-2 text-muted",
              )}
            >
              {a.niveau === "attention" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ----------------------------------------------------------- lignes */}
      {vide ? (
        <div className="border border-dashed border-border bg-surface p-10 text-center text-muted">
          Rien sur ce mois. Les dépenses apparaissent ici dès qu&apos;elles ont
          un justificatif.
        </div>
      ) : (
        <div className="overflow-hidden border border-hairline bg-surface">
          <table className="table-cards w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
                <th className="px-3 py-2.5 font-semibold">N°</th>
                <th className="px-3 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">Rubrique</th>
                <th className="px-3 py-2.5 font-semibold">Descriptif</th>
                <th className="px-3 py-2.5 font-semibold">Affaire</th>
                <th className="px-3 py-2.5 text-right font-semibold">Montant</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {depenses.map((d, i) => {
                const [, m, j] = d.date.split("-");
                return (
                  <tr
                    key={d.id}
                    className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                  >
                    <td
                      data-label="Pièce"
                      className="cell-card-title px-3 py-2.5 font-semibold tabular-nums text-brand"
                    >
                      {i + 1}
                    </td>
                    <td data-label="Date" className="px-3 py-2.5 tabular-nums">
                      {j}/{m}
                      {d.periodeOrigine && (
                        <span
                          className="ml-1 text-xs text-accent-fg"
                          title={`Reportée depuis ${titrePeriode(d.periodeOrigine)}`}
                        >
                          ↩
                        </span>
                      )}
                    </td>
                    <td data-label="Rubrique" className="px-3 py-2.5">
                      {LIBELLE_CATEGORIE[d.categorie]}
                    </td>
                    <td
                      data-label="Descriptif"
                      className="cell-wrap px-3 py-2.5 text-muted"
                    >
                      {d.descriptif || "—"}
                    </td>
                    <td data-label="Affaire" className="px-3 py-2.5 text-muted">
                      {d.numeroAffaire || "—"}
                    </td>
                    <td
                      data-label="Montant"
                      className="px-3 py-2.5 text-right font-medium tabular-nums"
                    >
                      {formatEuros(d.montantCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`${racine}/modifier/${d.id}`}
                        className="text-xs text-muted underline-offset-2 hover:text-brand hover:underline"
                      >
                        Modifier
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------------- actions */}
      {!vide && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
            <a
              href={`/api/ndf/export/${periode}?format=excel`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-medium text-fg transition hover:border-brand hover:text-brand"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </a>
            <a
              href={`/api/ndf/export/${periode}?format=pdf`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-medium text-fg transition hover:border-brand hover:text-brand"
            >
              <FileText className="h-4 w-4" />
              Justificatifs
            </a>
            {transmiseLe ? (
              <Button
                variant="outline"
                disabled={enCours}
                onClick={() =>
                  demarrer(async () => {
                    const r = await rouvrirMois(periode);
                    if (r.ok) setTransmiseLe(null);
                    router.refresh();
                  })
                }
              >
                <RotateCcw className="h-4 w-4" />
                Rouvrir
              </Button>
            ) : (
              <Button
                disabled={enCours}
                onClick={() =>
                  demarrer(async () => {
                    const r = await marquerTransmise(periode);
                    if (r.ok) setTransmiseLe(r.transmiseLe.toISOString());
                    router.refresh();
                  })
                }
              >
                <Send className="h-4 w-4" />
                Marquer transmise
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
