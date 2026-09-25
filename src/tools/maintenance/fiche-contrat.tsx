"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Gauge,
  MapPinned,
  Pencil,
  Receipt,
  Trash2,
  Undo2,
} from "lucide-react";
import { Badge, Button, EnteteBloc, EtatVide, Repere } from "@/ui";
import { cn } from "@/lib/cn";
import { marquerFacturees, supprimerIntervention } from "./actions";
import {
  LIBELLE_ETAT,
  NATURES,
  TON_ETAT,
  formatDuree,
  formatEuros,
  formatJour,
  formatJourCourt,
  jour,
  montantHorsForfaitCents,
  totalHorsForfaitMin,
  type ContratDetail,
  type InterventionVue,
} from "./model";
import { BadgeEcheance, BarreForfait, Imputation, PastilleNature } from "./forfait";
import {
  FormulaireIntervention,
  valeursDepuis,
  valeursNeuves,
  type ValeursIntervention,
} from "./saisie-intervention";

/* La fiche d'un contrat.
 *
 * Elle répond à trois questions, dans cet ordre : où en est le forfait de la
 * période EN COURS, qu'est-ce qui a été fait, et qu'est-ce qui reste à
 * refacturer. Le contrat lui-même (dates, clauses) vient en dernier : on
 * l'ouvre une fois, on lit les deux autres cent fois.
 * ========================================================================== */

export function FicheContrat({
  qui,
  contrat,
  intervenants,
  moiId,
}: {
  qui: string;
  contrat: ContratDetail;
  intervenants: { id: string; nom: string }[];
  moiId: string;
}) {
  const router = useRouter();
  const [neuve, setNeuve] = useState<ValeursIntervention>(() => valeursNeuves(moiId));
  const [edite, setEdite] = useState<ValeursIntervention | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState(false);

  const periode = contrat.periodes.find((p) => p.index === contrat.periodeIndex);

  const horsForfaitPeriode = useMemo(
    () => NATURES.reduce((s, n) => s + totalHorsForfaitMin(contrat.consommation[n]), 0),
    [contrat.consommation],
  );

  const aFacturer = useMemo(
    () => contrat.interventions.filter((i) => i.horsMin > 0 && !i.factureeLe),
    [contrat.interventions],
  );

  const montant = montantHorsForfaitCents(contrat.aFacturerMin, contrat.tarifHoraireCents);

  function basculer(id: string) {
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function facturer(facturee: boolean) {
    if (selection.size === 0 || enCours) return;
    setEnCours(true);
    await marquerFacturees([...selection], facturee);
    setSelection(new Set());
    setEnCours(false);
  }

  async function supprimer(v: InterventionVue) {
    const quoi = `${formatJourCourt(jour(v.date))} · ${formatDuree(v.dureeMin)} · ${v.motif}`;
    if (!confirm(`Supprimer cette intervention ?\n\n${quoi}`)) return;
    setEnCours(true);
    await supprimerIntervention(v.id);
    setEnCours(false);
  }

  return (
    <div className="grid gap-5">
      {/* ---------------------------------------------------------- le forfait */}
      <section className="bloc">
        <EnteteBloc
          icone={Gauge}
          titre="Forfait de la période"
          mention={
            periode
              ? `${formatJourCourt(jour(periode.debut))} → ${formatJourCourt(jour(periode.dernierJour))}${periode.tronquee ? " (écourtée par le terme)" : ""}`
              : undefined
          }
          actions={
            contrat.periodes.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-muted">
                Période
                <select
                  value={contrat.periodeIndex}
                  onChange={(e) =>
                    router.push(
                      `/perso/${qui}/maintenance/${contrat.id}?p=${e.target.value}`,
                    )
                  }
                  className="h-8 rounded-md border border-border bg-surface px-2 text-sm text-fg focus:border-brand focus:outline-none"
                >
                  {contrat.periodes.map((p) => (
                    <option key={p.index} value={p.index}>
                      {formatJourCourt(jour(p.debut))} → {formatJourCourt(jour(p.dernierJour))}
                      {p.courante ? " · en cours" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )
          }
        />

        <div className="grid gap-5 p-4 sm:grid-cols-2">
          {NATURES.map((n) => (
            <BarreForfait key={n} c={contrat.consommation[n]} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border-soft px-4 py-2.5">
          <Repere
            label="Interventions"
            valeur={contrat.interventions.length}
            detail="sur la période"
          />
          <Repere
            label="Hors forfait"
            valeur={horsForfaitPeriode > 0 ? formatDuree(horsForfaitPeriode) : "—"}
            ton={horsForfaitPeriode > 0 ? "danger" : "neutre"}
            detail="sur la période"
          />
          <Repere
            label="À refacturer"
            valeur={contrat.aFacturerMin > 0 ? formatDuree(contrat.aFacturerMin) : "—"}
            ton={contrat.aFacturerMin > 0 ? "accent" : "neutre"}
            /* TOUTES périodes : une heure de l'an dernier jamais facturée est
               perdue exactement pareil qu'une d'aujourd'hui. */
            detail={
              montant != null
                ? `${formatEuros(montant)} · toutes périodes`
                : contrat.aFacturerMin > 0
                  ? "tarif horaire non renseigné"
                  : "toutes périodes"
            }
          />
        </div>
      </section>

      {/* ------------------------------------------- ce qui tombe hors contrat */}
      {contrat.horsPeriode.length > 0 && (
        <section className="bloc border-danger/40">
          <div className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="font-medium text-fg">
                {contrat.horsPeriode.length} intervention
                {contrat.horsPeriode.length > 1 ? "s sont datées" : " est datée"} hors du
                contrat
              </p>
              <p className="mt-1 text-sm text-muted">
                Avant sa date d&apos;effet ({formatJour(jour(contrat.debut))})
                {contrat.fin && <> ou après son terme ({formatJour(jour(contrat.fin))})</>}.
                Ce temps n&apos;est imputé à aucune période : il est compté hors forfait,
                mais il faut corriger la date — ou les dates du contrat.
              </p>
              <ul className="mt-2 grid gap-1 text-sm">
                {contrat.horsPeriode.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="ref">{formatJourCourt(jour(i.date))}</span>
                    <span className="text-fg">{i.motif}</span>
                    <span className="text-muted">{formatDuree(i.dureeMin)}</span>
                    <button
                      type="button"
                      onClick={() => setEdite(valeursDepuis(i))}
                      className="text-xs text-brand underline decoration-dotted underline-offset-4"
                    >
                      corriger
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------- interventions */}
      <section className="bloc">
        <EnteteBloc
          icone={CalendarClock}
          titre="Interventions"
          compteur={contrat.interventions.length}
          mention="de la période affichée"
          actions={
            selection.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{selection.size} sélectionnée(s)</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => facturer(true)}
                  disabled={enCours}
                >
                  <Receipt className="h-4 w-4" /> Marquer facturées
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => facturer(false)}
                  disabled={enCours}
                >
                  <Undo2 className="h-4 w-4" /> Annuler
                </Button>
              </div>
            )
          }
        />

        {!edite && (
          <FormulaireIntervention
            contratId={contrat.id}
            sites={contrat.sites}
            intervenants={intervenants}
            valeurs={neuve}
            onChange={setNeuve}
            onFini={() => setNeuve(valeursNeuves(moiId))}
          />
        )}

        {contrat.interventions.length === 0 ? (
          <EtatVide
            dessin="carnet"
            compact
            titre="Aucune intervention sur cette période"
            texte="Le forfait est intact — ou personne n'a encore noté son temps."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th className="w-9">
                    <span className="sr-only">Sélection</span>
                  </th>
                  <th>Date</th>
                  <th>Nature</th>
                  <th>Site</th>
                  <th className="cell-wrap">Motif</th>
                  <th>Durée</th>
                  <th>Imputation</th>
                  <th>Intervenant</th>
                  <th>Facturée</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contrat.interventions.map((i) =>
                  edite?.id === i.id ? (
                    <tr key={i.id}>
                      <td colSpan={10} className="!p-0">
                        <FormulaireIntervention
                          contratId={contrat.id}
                          sites={contrat.sites}
                          intervenants={intervenants}
                          valeurs={edite}
                          onChange={setEdite}
                          onFini={() => setEdite(null)}
                          onAnnuler={() => setEdite(null)}
                          compact
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={i.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selection.has(i.id)}
                          onChange={() => basculer(i.id)}
                          className="h-4 w-4 accent-[var(--brand)]"
                          aria-label={`Sélectionner l'intervention du ${i.date}`}
                        />
                      </td>
                      <td data-label="Date" className="font-mono text-xs tabular-nums">
                        {formatJourCourt(jour(i.date))}
                      </td>
                      <td data-label="Nature">
                        <PastilleNature nature={i.nature} court />
                      </td>
                      <td data-label="Site" className="cell-tronque">
                        {i.siteNom ?? <span className="text-subtle">tout le contrat</span>}
                      </td>
                      {/* Cellule-titre : pas de `data-label` (elle EST le titre
                          de la carte) et UN SEUL enfant — en mode cartes la
                          cellule devient un flex, et trois enfants se
                          rangeraient en colonnes au lieu de s'empiler. */}
                      <td className="cell-wrap cell-card-title">
                        <div className="min-w-0">
                          <span className="text-fg">{i.motif}</span>
                          {i.compteRendu && (
                            <span className="mt-0.5 block text-xs font-normal text-muted">
                              {i.compteRendu}
                            </span>
                          )}
                          {i.demandeur && (
                            <span className="mt-0.5 block text-xs font-normal text-subtle">
                              demandé par {i.demandeur}
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Durée" className="cell-droite font-medium text-fg">
                        {formatDuree(i.dureeMin)}
                      </td>
                      <td data-label="Imputation">
                        <Imputation
                          inclusMin={i.inclusMin}
                          horsMin={i.horsMin}
                          cause={i.cause}
                        />
                      </td>
                      <td data-label="Intervenant" className="cell-tronque">
                        {i.intervenantNom ?? <span className="text-subtle">—</span>}
                      </td>
                      <td data-label="Facturée">
                        {i.factureeLe ? (
                          <span className="whitespace-nowrap text-xs text-success">
                            le {formatJourCourt(jour(i.factureeLe))}
                          </span>
                        ) : i.horsMin > 0 ? (
                          <span className="text-xs text-accent-strong">à facturer</span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td>
                        <div className="actions-rangee flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Modifier"
                            onClick={() => setEdite(valeursDepuis(i))}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Supprimer"
                            onClick={() => supprimer(i)}
                            disabled={enCours}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {aFacturer.length > 0 && (
          <p className="border-t border-border-soft px-4 py-2.5 text-xs text-muted">
            {aFacturer.length} intervention{aFacturer.length > 1 ? "s" : ""} de cette
            période {aFacturer.length > 1 ? "portent" : "porte"} du temps hors
            forfait qui n&apos;a pas encore été facturé.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------- sites */}
      <section className="bloc">
        <EnteteBloc
          icone={MapPinned}
          titre="Sites couverts"
          compteur={contrat.sites.length}
          actions={
            <Link
              href={`/perso/${qui}/maintenance/${contrat.id}/modifier`}
              className="text-xs text-brand underline decoration-dotted underline-offset-4"
            >
              Modifier le périmètre
            </Link>
          }
        />
        {contrat.sites.length === 0 ? (
          <EtatVide
            dessin="armoire"
            compact
            titre="Aucun site rattaché"
            texte="Un contrat sans site reste utilisable, mais les interventions ne diront pas où elles ont eu lieu."
          />
        ) : (
          <ul className="grid gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-3">
            {contrat.sites.map((s) => (
              <li key={s.id} className="bg-surface p-3">
                <p className="flex items-center gap-2 font-medium text-fg">
                  {s.nom}
                  {!s.actif && (
                    <Badge tone="neutral">hors parc</Badge>
                  )}
                </p>
                {(s.adresse || s.ville) && (
                  <p className="mt-0.5 whitespace-pre-line text-sm text-muted">
                    {s.adresse}
                    {s.adresse && (s.codePostal || s.ville) ? "\n" : ""}
                    {[s.codePostal, s.ville].filter(Boolean).join(" ")}
                  </p>
                )}
                {s.accesDistant && (
                  <p className="mt-1.5 text-xs text-muted">
                    <span className="stamp">Accès distant</span>{" "}
                    <span className="ref">{s.accesDistant}</span>
                  </p>
                )}
                {s.acces && (
                  <p className="mt-1 text-xs text-muted">
                    <span className="stamp">Accès</span> {s.acces}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------------- le contrat */}
      <section className="bloc">
        <EnteteBloc
          icone={FileText}
          titre="Le contrat"
          actions={
            <Link
              href={`/perso/${qui}/maintenance/${contrat.id}/modifier`}
              className="press inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg hover:border-brand/45 hover:bg-surface-2"
            >
              <Pencil className="h-3.5 w-3.5" /> Modifier
            </Link>
          }
        />
        <dl className="grid gap-x-8 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Champ label="État">
            <Badge tone={TON_ETAT[contrat.etat]} point>
              {LIBELLE_ETAT[contrat.etat]}
            </Badge>
          </Champ>
          <Champ label="Date d'effet">{formatJour(jour(contrat.debut))}</Champ>
          <Champ label="Terme">
            {contrat.fin ? (
              <span className="flex flex-wrap items-baseline gap-2">
                {formatJour(jour(contrat.fin))}
                <BadgeEcheance echeance={contrat.echeance} tacite={contrat.tacite} />
              </span>
            ) : (
              <span className="text-muted">sans terme convenu</span>
            )}
          </Champ>
          <Champ label="Reconduction">
            {contrat.tacite ? "tacite" : "expresse"}
            {contrat.preavisJours > 0 && (
              <span className="text-muted"> · préavis {contrat.preavisJours} j</span>
            )}
          </Champ>

          <Champ label="Téléassistance incluse">
            {contrat.quotaTeleMin > 0 ? (
              <>
                {formatDuree(contrat.quotaTeleMin)} <span className="text-muted">/ an</span>
              </>
            ) : (
              <span className="text-muted">aucune</span>
            )}
          </Champ>
          <Champ label="Présentiel inclus">
            {contrat.quotaPresentielMin > 0 ? (
              <>
                {formatDuree(contrat.quotaPresentielMin)}{" "}
                <span className="text-muted">/ an</span>
              </>
            ) : (
              <span className="text-muted">aucun</span>
            )}
          </Champ>
          <Champ label="Tarif hors forfait">
            {contrat.tarifHoraireCents > 0 ? (
              <>
                {formatEuros(contrat.tarifHoraireCents)}{" "}
                <span className="text-muted">/ h</span>
              </>
            ) : (
              <span className="text-danger">non renseigné</span>
            )}
          </Champ>
          <Champ label="Référence">
            {contrat.reference ? (
              <span className="ref">{contrat.reference}</span>
            ) : (
              <span className="text-subtle">—</span>
            )}
          </Champ>
        </dl>

        {contrat.notes && (
          <p className="whitespace-pre-line border-t border-border-soft px-4 py-3 text-sm text-muted">
            {contrat.notes}
          </p>
        )}
      </section>
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0")}>
      <dt className="stamp">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}
