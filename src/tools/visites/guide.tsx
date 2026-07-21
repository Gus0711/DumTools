"use client";

/**
 * Mode « Dérouler » — la signature de l'îlot terrain.
 *
 * La checklist devient un enchaînement plein écran, UN point à la fois, comme
 * une checklist pré-vol : le libellé en grand, le pense-bête dessous, et trois
 * gros boutons dans la zone du pouce. OK / N.A → on avance tout seul (retour
 * haptique). KO → on reste sur place : photo, note, réserve en un geste, puis
 * « Point suivant ». À la fin : « Rien d'oublié. » et le bilan de la visite.
 */

import { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Minus,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { VisiteLocale } from "@/lib/offline/visites";
import type { ItemChecklist, MediaMeta, StatutItem } from "./model";
import { AudioChip, AudioRecorderButton, PhotoButton, PhotoThumb } from "./capture";
import { vibrer, type AddMediaInput } from "./terrain-ui";

type PointGuide = { sectionTitre: string; item: ItemChecklist };

export function ModeGuide({
  visite,
  mediaById,
  patchItem,
  creerReserveDepuisItem,
  addMedia,
  removeMedia,
  openLightbox,
  onClose,
  onVoirReserves,
}: {
  visite: VisiteLocale;
  mediaById: Map<string, MediaMeta>;
  patchItem: (itemId: string, p: Partial<ItemChecklist>) => void;
  creerReserveDepuisItem: (item: ItemChecklist, sectionTitre: string) => void;
  addMedia: (input: AddMediaInput) => void;
  removeMedia: (mediaId: string) => void;
  openLightbox: (url: string) => void;
  onClose: () => void;
  onVoirReserves: () => void;
}) {
  // Liste à plat (l'ordre du modèle est l'ordre du déroulé).
  const points: PointGuide[] = useMemo(
    () =>
      visite.data.sections.flatMap((sec) =>
        sec.items.map((item) => ({ sectionTitre: sec.titre, item })),
      ),
    [visite.data.sections],
  );

  const premierAFaire = Math.max(
    0,
    points.findIndex((p) => p.item.statut === ""),
  );
  const [idx, setIdx] = useState(premierAFaire);
  const [termine, setTermine] = useState(false);
  const [noteVisible, setNoteVisible] = useState(false);

  const total = points.length;
  const renseignes = points.filter((p) => p.item.statut !== "").length;
  const courant = points[Math.min(idx, total - 1)];

  /** Prochain point à faire après `from` (en excluant celui qu'on vient de
   *  répondre — l'état React n'est pas encore re-rendu au moment du calcul). */
  function prochainAFaire(from: number, exclureId?: string): number | null {
    const restant = (p: PointGuide) => p.item.statut === "" && p.item.id !== exclureId;
    for (let i = from + 1; i < total; i++) if (restant(points[i])) return i;
    for (let i = 0; i <= from; i++) if (restant(points[i])) return i;
    return null;
  }

  function avancer(from: number, exclureId?: string) {
    const next = prochainAFaire(from, exclureId);
    if (next === null) {
      vibrer([15, 60, 15]);
      setTermine(true);
    } else {
      setIdx(next);
      setNoteVisible(false);
    }
  }

  function repondre(statut: StatutItem) {
    if (!courant) return;
    const toggleOff = courant.item.statut === statut;
    patchItem(courant.item.id, { statut: toggleOff ? "" : statut });
    vibrer(8);
    if (toggleOff || statut === "ko") return; // KO : on documente avant d'avancer.
    // Petit temps de pause pour VOIR le bouton s'allumer, puis on enchaîne.
    window.setTimeout(() => avancer(idx, courant.item.id), 220);
  }

  if (termine) {
    return (
      <Bilan
        visite={visite}
        points={points}
        onRevoirKo={(i) => {
          setIdx(i);
          setTermine(false);
        }}
        onVoirReserves={onVoirReserves}
        onClose={onClose}
      />
    );
  }
  if (!courant) return null;

  const it = courant.item;
  const estKo = it.statut === "ko";
  const koSansPreuve = estKo && it.photoIds.length === 0 && !it.note.trim();
  const reserveCreee = visite.data.reserves.some((r) => r.libelle === it.libelle);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-page">
      {/* --- En-tête : sortie, section, progression --------------------------- */}
      <header className="border-b border-border bg-surface px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Quitter le déroulé"
            className="-ml-1 rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="min-w-0 flex-1 truncate font-display text-xs font-semibold uppercase tracking-widest text-subtle">
            {courant.sectionTitre}
          </p>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-muted">
            {renseignes}/{total}
          </p>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
            style={{ width: `${total ? Math.round((renseignes / total) * 100) : 0}%` }}
          />
        </div>
      </header>

      {/* --- Le point courant -------------------------------------------------- */}
      <div key={it.id} className="anim-item-in flex-1 overflow-y-auto px-5 py-6">
        <h2 className="font-display text-xl font-semibold leading-snug tracking-tight text-fg sm:text-2xl">
          {it.libelle}
        </h2>
        {it.aide && <p className="mt-2 text-sm leading-relaxed text-muted">{it.aide}</p>}

        {estKo && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
              <CircleAlert className="h-4 w-4" />
              KO — documentez avant de passer au suivant
            </p>
            {koSansPreuve && (
              <p className="mt-1 text-xs text-danger/90">
                Une photo ou une note, et le compte-rendu se fera tout seul.
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={reserveCreee}
                onClick={() => {
                  creerReserveDepuisItem(it, courant.sectionTitre);
                  vibrer(8);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  reserveCreee
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-io-di/45 bg-io-di/10 text-io-di hover:bg-io-di/15",
                )}
              >
                <TriangleAlert className="h-4 w-4" />
                {reserveCreee ? "Réserve créée ✓" : "Créer une réserve"}
              </button>
            </div>
          </div>
        )}

        {/* Note : discrète tant qu'on n'en a pas besoin. */}
        {it.note || noteVisible || estKo ? (
          <textarea
            value={it.note}
            onChange={(e) => patchItem(it.id, { note: e.target.value })}
            rows={2}
            placeholder="Note…"
            className="mt-4 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-sm leading-snug text-fg placeholder:text-subtle focus:border-brand focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setNoteVisible(true)}
            className="mt-4 text-sm text-subtle underline-offset-2 hover:text-brand hover:underline"
          >
            + ajouter une note
          </button>
        )}

        {(it.photoIds.length > 0 || it.audioIds.length > 0) && (
          <div className="mt-3 space-y-2">
            {it.photoIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {it.photoIds.map((id) => {
                  const m = mediaById.get(id);
                  return m ? (
                    <PhotoThumb
                      key={id}
                      media={m}
                      onOpen={openLightbox}
                      onDelete={() => removeMedia(id)}
                    />
                  ) : null;
                })}
              </div>
            )}
            {it.audioIds.map((id) => {
              const m = mediaById.get(id);
              return m ? <AudioChip key={id} media={m} onDelete={() => removeMedia(id)} /> : null;
            })}
          </div>
        )}
      </div>

      {/* --- Zone du pouce ------------------------------------------------------- */}
      <footer className="border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setIdx(Math.max(0, idx - 1));
              setNoteVisible(false);
            }}
            disabled={idx === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Précédent
          </button>
          <span className="flex items-center gap-2">
            <PhotoButton compact onPhoto={(p) => addMedia({ type: "photo", ...p, itemId: it.id })} />
            <AudioRecorderButton
              compact
              onAudio={(a) => addMedia({ type: "audio", ...a, itemId: it.id })}
            />
          </span>
          <button
            type="button"
            onClick={() => avancer(idx)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2"
          >
            {estKo ? "Point suivant" : "Passer"} <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <BoutonStatut
            actif={it.statut === "na"}
            onClick={() => repondre("na")}
            icone={<Minus className="h-5 w-5" />}
            label="N/A"
            classesActif="border-border bg-surface-3 text-fg"
          />
          <BoutonStatut
            actif={it.statut === "ko"}
            onClick={() => repondre("ko")}
            icone={<X className="h-5 w-5" />}
            label="KO"
            classesActif="border-danger/50 bg-danger/15 text-danger"
          />
          <BoutonStatut
            actif={it.statut === "ok"}
            onClick={() => repondre("ok")}
            icone={<Check className="h-5 w-5" />}
            label="OK"
            classesActif="border-success/50 bg-success/15 text-success"
          />
        </div>
      </footer>
    </div>
  );
}

function BoutonStatut({
  actif,
  onClick,
  icone,
  label,
  classesActif,
}: {
  actif: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  label: string;
  classesActif: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl border text-sm font-bold transition-colors",
        actif ? cn(classesActif, "anim-pop") : "border-border bg-surface text-muted active:bg-surface-2",
      )}
    >
      {icone}
      {label}
    </button>
  );
}

/* --- Écran de fin : « Rien d'oublié. » ------------------------------------------ */

function Bilan({
  visite,
  points,
  onRevoirKo,
  onVoirReserves,
  onClose,
}: {
  visite: VisiteLocale;
  points: PointGuide[];
  onRevoirKo: (idx: number) => void;
  onVoirReserves: () => void;
  onClose: () => void;
}) {
  const ko = points.filter((p) => p.item.statut === "ko");
  const koSansPreuve = points.findIndex(
    (p) => p.item.statut === "ko" && p.item.photoIds.length === 0 && !p.item.note.trim(),
  );
  const reservesOuvertes = visite.data.reserves.filter((r) => r.statut === "ouverte").length;
  const photos = visite.data.medias.filter((m) => m.type === "photo").length;
  const audios = visite.data.medias.filter((m) => m.type === "audio").length;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-page">
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-9 w-9" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-fg">
          Rien d&apos;oublié.
        </h2>
        <p className="mt-1 text-sm text-muted">
          Les {points.length} points de la checklist sont passés en revue.
        </p>

        <dl className="mt-6 w-full max-w-xs space-y-1.5 text-sm">
          <LigneBilan
            label="Points KO"
            valeur={ko.length}
            ton={ko.length > 0 ? "text-danger" : "text-success"}
          />
          <LigneBilan
            label="Réserves ouvertes"
            valeur={reservesOuvertes}
            ton={reservesOuvertes > 0 ? "text-io-di" : "text-success"}
          />
          <LigneBilan label="Photos" valeur={photos} ton="text-muted" />
          <LigneBilan label="Notes vocales" valeur={audios} ton="text-muted" />
        </dl>

        {koSansPreuve >= 0 && (
          <button
            type="button"
            onClick={() => onRevoirKo(koSansPreuve)}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
          >
            <CircleAlert className="h-4 w-4" />
            Un KO n&apos;a ni photo ni note — compléter
          </button>
        )}
      </div>

      <footer className="border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          {reservesOuvertes > 0 && (
            <button
              type="button"
              onClick={onVoirReserves}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-io-di/45 bg-io-di/10 px-3 py-3 text-sm font-semibold text-io-di"
            >
              <TriangleAlert className="h-4 w-4" />
              Réserves ({reservesOuvertes})
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-3 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-strong"
          >
            <Check className="h-4 w-4" />
            Terminer
          </button>
        </div>
      </footer>
    </div>
  );
}

function LigneBilan({ label, valeur, ton }: { label: string; valeur: number; ton: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", ton)}>{valeur}</dd>
    </div>
  );
}
