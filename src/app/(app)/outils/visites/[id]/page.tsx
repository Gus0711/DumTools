import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";
import {
  GRAVITE_LABEL,
  statsVisite,
  TYPE_LABEL,
  TYPE_TON,
  type MediaMeta,
  type StatutItem,
} from "@/tools/visites/model";
import { getVisiteDetail } from "@/tools/visites/queries";
import { FicheActionsVisite } from "@/tools/visites/fiche-actions";
import { listerAffaires } from "@/lib/chantiers/queries";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Visite" };

/* La fiche visite est la vue « bureau » en lecture seule d'une visite
 * synchronisée : la saisie et la correction se font dans le mode terrain
 * (même id → la visite locale reste modifiable puis re-synchronisée). */

const STATUT_AFFICHE: Record<StatutItem, { label: string; classe: string }> = {
  "": { label: "—", classe: "bg-surface-2 text-subtle" },
  ok: { label: "OK", classe: "bg-success/12 text-success" },
  ko: { label: "KO", classe: "bg-danger/12 text-danger" },
  na: { label: "N/A", classe: "bg-surface-2 text-muted" },
};

const GRAVITE_TON: Record<string, string> = {
  faible: "bg-surface-2 text-muted",
  moyenne: "bg-io-di/10 text-io-di",
  haute: "bg-danger/12 text-danger",
};

function formatDuree(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

function PhotoServeur({ media }: { media: MediaMeta }) {
  const url = `/api/visites/media/${media.id}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-block h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2"
      title={media.note || "Ouvrir la photo"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- binaire servi par notre route authentifiée */}
      <img src={url} alt="Photo de visite" className="h-full w-full object-cover" />
    </a>
  );
}

function AudioServeur({ media }: { media: MediaMeta }) {
  return (
    <span className="flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
      <Mic className="h-3.5 w-3.5 shrink-0 text-subtle" />
      <audio
        controls
        preload="metadata"
        src={`/api/visites/media/${media.id}`}
        className="h-8 min-w-0 flex-1"
      />
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {media.dureeSec != null ? formatDuree(media.dureeSec) : ""}
      </span>
    </span>
  );
}

/** Sépare les médias d'un item/réserve entre reçus (affichables) et en attente. */
function partitionner(ids: string[], recus: Set<string>): { ok: string[]; attente: number } {
  const ok = ids.filter((id) => recus.has(id));
  return { ok, attente: ids.length - ok.length };
}

function EnAttente({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="text-xs text-subtle">
      ⏳ {n} média{n > 1 ? "s" : ""} pas encore reçu{n > 1 ? "s" : ""} du terrain
    </span>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [visite, affaires] = await Promise.all([getVisiteDetail(id), listerAffaires()]);
  if (!visite) notFound();

  const { data, mediasRecus } = visite;
  const stats = statsVisite(data);
  const parId = new Map(data.medias.map((m) => [m.id, m]));
  const generaux = data.medias.filter((m) => !m.itemId && !m.reserveId && mediasRecus.has(m.id));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <Link
        href="/outils/visites"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Toutes les visites
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
              TYPE_TON[visite.type],
            )}
          >
            {TYPE_LABEL[visite.type]}
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{visite.titre}</h1>
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {visite.chantierId ? (
            <Link href={`/affaires/${visite.chantierId}`} className="font-medium text-brand hover:underline">
              {visite.chantierNom || "Affaire"}
            </Link>
          ) : (
            <span className="italic">Sans affaire</span>
          )}
          {visite.clientNom && <> · {visite.clientNom}</>}
          {visite.numeroWhy && <> · Why {visite.numeroWhy}</>}
          {" · "}
          {visite.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
          {visite.auteur && <> · par {visite.auteur}</>}
        </p>
        <p className="mt-1 text-sm text-subtle">
          {stats.renseignes}/{stats.total} points renseignés
          {stats.ko > 0 && <> · {stats.ko} KO</>}
          {stats.reservesOuvertes > 0 && <> · {stats.reservesOuvertes} réserve{stats.reservesOuvertes > 1 ? "s" : ""} ouverte{stats.reservesOuvertes > 1 ? "s" : ""}</>}
          {stats.photos > 0 && <> · {stats.photos} photo{stats.photos > 1 ? "s" : ""}</>}
          {stats.audios > 0 && <> · {stats.audios} note{stats.audios > 1 ? "s" : ""} vocale{stats.audios > 1 ? "s" : ""}</>}
        </p>
        <FicheActionsVisite
          visiteId={visite.id}
          chantierId={visite.chantierId}
          affaires={affaires
            .filter((a) => a.etat !== "CORBEILLE")
            .map((a) => ({
              id: a.id,
              nom: a.nom,
              clientNom: a.clientNom,
              numeroWhy: a.numeroWhy,
            }))}
        />
        {(data.participants || data.notes) && (
          <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            {data.participants && (
              <p>
                <span className="font-medium text-fg">Participants :</span>{" "}
                <span className="text-muted">{data.participants}</span>
              </p>
            )}
            {data.notes && (
              <p className={cn("whitespace-pre-wrap text-muted", data.participants && "mt-1.5")}>
                {data.notes}
              </p>
            )}
          </div>
        )}
      </header>

      {/* --- Checklist ---------------------------------------------------------- */}
      <section className="space-y-4">
        {data.sections.map((section) => (
          <div key={section.id} className="overflow-hidden rounded-lg border border-border bg-surface">
            <h2 className="border-b border-border bg-surface-2 px-4 py-2 text-sm font-semibold text-fg">
              {section.titre}
            </h2>
            <ul className="divide-y divide-border-soft">
              {section.items.map((item) => {
                const photos = partitionner(item.photoIds, mediasRecus);
                const audios = partitionner(item.audioIds, mediasRecus);
                const statut = STATUT_AFFICHE[item.statut];
                return (
                  <li key={item.id} className={cn("px-4 py-2.5", item.statut === "ko" && "bg-danger/5")}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm text-fg">{item.libelle}</span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold",
                          statut.classe,
                        )}
                      >
                        {statut.label}
                      </span>
                    </div>
                    {item.note && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{item.note}</p>
                    )}
                    {(photos.ok.length > 0 || photos.attente > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {photos.ok.map((mid) => {
                          const m = parId.get(mid);
                          return m ? <PhotoServeur key={mid} media={m} /> : null;
                        })}
                        <EnAttente n={photos.attente} />
                      </div>
                    )}
                    {(audios.ok.length > 0 || audios.attente > 0) && (
                      <div className="mt-2 space-y-1.5">
                        {audios.ok.map((mid) => {
                          const m = parId.get(mid);
                          return m ? <AudioServeur key={mid} media={m} /> : null;
                        })}
                        <EnAttente n={audios.attente} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {data.sections.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
            Cette visite n&apos;a pas de checklist.
          </p>
        )}
      </section>

      {/* --- Réserves ----------------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-fg">
          Réserves{" "}
          <span className="text-sm font-normal text-muted">
            ({data.reserves.filter((r) => r.statut === "ouverte").length} ouverte
            {data.reserves.filter((r) => r.statut === "ouverte").length > 1 ? "s" : ""} /{" "}
            {data.reserves.length})
          </span>
        </h2>
        {data.reserves.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            Aucune réserve sur cette visite.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.reserves.map((r) => {
              const photos = partitionner(r.photoIds, mediasRecus);
              return (
                <li key={r.id} className="rounded-lg border border-border bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                        GRAVITE_TON[r.gravite] ?? "bg-surface-2 text-muted",
                      )}
                    >
                      {GRAVITE_LABEL[r.gravite]}
                    </span>
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-xs font-semibold",
                        r.statut === "ouverte" ? "bg-danger/12 text-danger" : "bg-success/12 text-success",
                      )}
                    >
                      {r.statut === "ouverte" ? "Ouverte" : "Levée"}
                    </span>
                    {r.origineVisiteId && r.origineVisiteId !== visite.id && (
                      <span className="inline-flex rounded bg-io-com/10 px-1.5 py-0.5 text-xs font-medium text-io-com">
                        Reportée
                      </span>
                    )}
                    <span className="text-sm font-medium text-fg">{r.libelle}</span>
                    {r.localisation && <span className="text-sm text-subtle">— {r.localisation}</span>}
                  </div>
                  {r.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{r.note}</p>}
                  {(photos.ok.length > 0 || photos.attente > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {photos.ok.map((mid) => {
                        const m = parId.get(mid);
                        return m ? <PhotoServeur key={mid} media={m} /> : null;
                      })}
                      <EnAttente n={photos.attente} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Médias généraux ------------------------------------------------------ */}
      {generaux.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-fg">Médias généraux</h2>
          <div className="flex flex-wrap gap-2">
            {generaux
              .filter((m) => m.type === "photo")
              .map((m) => (
                <PhotoServeur key={m.id} media={m} />
              ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {generaux
              .filter((m) => m.type === "audio")
              .map((m) => (
                <AudioServeur key={m.id} media={m} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
