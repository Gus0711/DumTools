"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge, Button } from "@/ui";
import { cn } from "@/lib/cn";
import { compresserPhoto } from "@/tools/visites/capture";
import {
  formatEuros,
  LIBELLE_CATEGORIE,
  titrePeriode,
  type DepenseVue,
  type Periode,
} from "./model";
import { supprimerDepense } from "./actions";
import type { LigneHistorique } from "./queries";

/**
 * Accueil personnel de l'outil. Trois blocs, dans l'ordre de ce qu'on vient y
 * faire : ajouter une dépense (le geste quotidien), vider la zone « en attente »
 * (le seul travail en retard qui existe), consulter ses mois.
 *
 * Cloisonnement : tout ce qui arrive ici a déjà été filtré sur l'utilisateur
 * côté serveur. Il n'existe aucune vue d'ensemble dans l'outil.
 */
export function AccueilNdf({
  qui,
  periodeCourante,
  totalMoisCents,
  nbMoisEnCours,
  enAttente,
  historique,
}: {
  qui: string;
  periodeCourante: Periode;
  totalMoisCents: number;
  nbMoisEnCours: number;
  enAttente: DepenseVue[];
  historique: LigneHistorique[];
}) {
  const racine = `/perso/${qui}/notes-de-frais`;

  return (
    <div className="pb-24">
      {/* ------------------------------------------------- le mois en cours */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <div className="text-sm text-muted">
              {titrePeriode(periodeCourante)}
            </div>
            <div className="mt-1 font-display text-4xl font-bold tabular-nums text-fg">
              {formatEuros(totalMoisCents)}
            </div>
            <div className="mt-1 text-sm text-muted">
              {nbMoisEnCours === 0
                ? "Aucune dépense justifiée pour l'instant"
                : `${nbMoisEnCours} dépense${nbMoisEnCours > 1 ? "s" : ""} prête${nbMoisEnCours > 1 ? "s" : ""} à partir`}
            </div>
          </div>
          <Link
            href={`${racine}/${periodeCourante}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg transition hover:border-brand hover:text-brand"
          >
            Voir la note du mois <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ------------------------------------------ en attente de justificatif */}
      {enAttente.length > 0 && (
        <section className="mb-6 rounded-2xl border border-accent/40 bg-accent-soft/40 p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
            En attente de justificatif
            <Badge tone="accent">{enAttente.length}</Badge>
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Ces dépenses n&apos;entreront dans aucune note tant qu&apos;il
            manque la photo. Rien n&apos;est perdu : ajoute-la et elle rejoint
            le mois automatiquement.
          </p>
          <ul className="space-y-2">
            {enAttente.map((d) => (
              <LigneEnAttente key={d.id} depense={d} racine={racine} />
            ))}
          </ul>
        </section>
      )}

      {/* --------------------------------------------------------- historique */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-fg">
          Mes mois
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="table-cards w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
                <th className="px-4 py-2.5 font-semibold">Mois</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                <th className="px-4 py-2.5 text-right font-semibold">Pièces</th>
                <th className="px-4 py-2.5 font-semibold">État</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {historique.map((l) => (
                <tr
                  key={l.periode}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                >
                  <td data-label="Mois" className="cell-card-title px-4 py-2.5">
                    <Link
                      href={`${racine}/${l.periode}`}
                      className="font-medium text-fg hover:text-brand"
                    >
                      {titrePeriode(l.periode)}
                    </Link>
                  </td>
                  <td
                    data-label="Total"
                    className="px-4 py-2.5 text-right tabular-nums"
                  >
                    {l.totalCents > 0 ? formatEuros(l.totalCents) : "—"}
                  </td>
                  <td
                    data-label="Pièces"
                    className="px-4 py-2.5 text-right tabular-nums text-muted"
                  >
                    {l.nbDepenses || "—"}
                  </td>
                  <td data-label="État" className="px-4 py-2.5">
                    {l.transmiseLe ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <Check className="h-3.5 w-3.5" />
                        Transmise
                      </span>
                    ) : l.nbDepenses > 0 ? (
                      <span className="text-muted">À transmettre</span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`${racine}/${l.periode}`}
                      className="text-muted hover:text-brand"
                      aria-label={`Ouvrir ${titrePeriode(l.periode)}`}
                    >
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------- action principale, toujours sous le pouce */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <Link href={`${racine}/nouvelle`} className="block">
            <Button className="w-full" size="lg">
              <Plus className="h-5 w-5" />
              Ajouter une dépense
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Ligne « en attente » : l'appareil photo est à un tap, sans changer d'écran —
 *  c'est tout l'intérêt du bloc. */
function LigneEnAttente({
  depense,
  racine,
}: {
  depense: DepenseVue;
  racine: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  const [suppression, demarrerSuppression] = useTransition();

  async function envoyer(liste: FileList | null) {
    if (!liste?.length) return;
    setEnvoi(true);
    setErreur(null);
    try {
      for (const f of Array.from(liste)) {
        const pdf = f.type === "application/pdf";
        const { blob, mimeType } = pdf
          ? { blob: f as Blob, mimeType: "application/pdf" }
          : await compresserPhoto(f);
        const fd = new FormData();
        fd.set("id", crypto.randomUUID());
        fd.set("depenseId", depense.id);
        fd.set("mimeType", mimeType);
        fd.set("nomOrigine", f.name);
        fd.set("file", blob);
        const r = await fetch("/api/ndf/media", { method: "POST", body: fd });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setErreur(j.error ?? `Échec de l'envoi (${r.status})`);
          return;
        }
      }
      router.refresh();
    } finally {
      setEnvoi(false);
    }
  }

  const [, m, j] = depense.date.split("-");

  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold tabular-nums text-fg">
              {formatEuros(depense.montantCents)}
            </span>
            <span className="text-sm text-muted">
              {j}/{m} · {LIBELLE_CATEGORIE[depense.categorie]}
            </span>
          </div>
          {depense.descriptif && (
            <div className="truncate text-sm text-muted">
              {depense.descriptif}
            </div>
          )}
        </div>

        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void envoyer(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="accent"
          onClick={() => input.current?.click()}
          disabled={envoi}
        >
          {envoi ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          Photo
        </Button>
        <Link
          href={`${racine}/modifier/${depense.id}`}
          className="text-sm text-muted underline-offset-2 hover:text-brand hover:underline"
        >
          Modifier
        </Link>
        {confirme ? (
          <span className="flex items-center gap-1.5 text-sm">
            <button
              type="button"
              className="font-medium text-danger"
              disabled={suppression}
              onClick={() =>
                demarrerSuppression(async () => {
                  await supprimerDepense(depense.id);
                  router.refresh();
                })
              }
            >
              Supprimer
            </button>
            <button
              type="button"
              className="text-muted"
              onClick={() => setConfirme(false)}
            >
              Annuler
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label="Supprimer cette dépense"
            className="text-muted transition hover:text-danger"
            onClick={() => setConfirme(true)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {erreur && (
        <p className={cn("mt-2 text-sm text-danger")}>{erreur}</p>
      )}
    </li>
  );
}
