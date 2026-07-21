"use client";

/**
 * Éditeur d'une visite — pensé pour le pouce :
 *  - en-tête compact collé en haut : d'où je viens, où j'en suis, tout est sauvé ?
 *  - dock de navigation collé en bas (zone du pouce) : Checklist / Réserves /
 *    Médias / Infos, avec badges ;
 *  - checklist filtrable « À faire », et le mode « Dérouler » (guide.tsx) pour
 *    enchaîner les points un par un ;
 *  - un point KO crée sa réserve en un tap (libellé + section repris).
 */

import { useMemo, useState } from "react";
import {
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Images,
  Info,
  ListChecks,
  Minus,
  Play,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AffaireTerrain, VisiteLocale } from "@/lib/offline/visites";
import {
  GRAVITE_LABEL,
  GRAVITES,
  statsVisite,
  TYPE_LABEL,
  TYPE_TON,
  uuid,
  type Gravite,
  type ItemChecklist,
  type MediaMeta,
  type Reserve,
  type StatutItem,
  type Visite,
} from "./model";
import { AudioChip, AudioRecorderButton, PhotoButton, PhotoThumb } from "./capture";
import { ModeGuide } from "./guide";
import {
  BarreProgression,
  formatDateFr,
  SyncPill,
  TYPE_META,
  vibrer,
  type AddMediaInput,
  type SyncProps,
} from "./terrain-ui";

type Onglet = "checklist" | "reserves" | "medias" | "infos";

export function EditeurVisite({
  visite,
  affaires,
  onBack,
  patch,
  addMedia,
  removeMedia,
  openLightbox,
  sync,
}: {
  visite: VisiteLocale;
  affaires: AffaireTerrain[];
  onBack: () => void;
  patch: (fn: (v: Visite) => Visite) => void;
  addMedia: (input: AddMediaInput) => void;
  removeMedia: (mediaId: string) => void;
  openLightbox: (url: string) => void;
  sync: SyncProps;
}) {
  const [tab, setTab] = useState<Onglet>("checklist");
  const [guide, setGuide] = useState(false);
  const s = statsVisite(visite.data);
  const meta = TYPE_META[visite.type];
  const mediaById = useMemo(
    () => new Map(visite.data.medias.map((m) => [m.id, m] as const)),
    [visite.data.medias],
  );

  const setData = (fn: (d: Visite["data"]) => Visite["data"]) =>
    patch((v) => ({ ...v, data: fn(v.data) }));

  const patchItem = (itemId: string, p: Partial<ItemChecklist>) =>
    setData((d) => ({
      ...d,
      sections: d.sections.map((sec) =>
        sec.items.some((it) => it.id === itemId)
          ? { ...sec, items: sec.items.map((it) => (it.id === itemId ? { ...it, ...p } : it)) }
          : sec,
      ),
    }));

  /** Une réserve pré-remplie depuis un point KO (libellé + section comme lieu). */
  const creerReserveDepuisItem = (item: ItemChecklist, sectionTitre: string) =>
    setData((d) => {
      if (d.reserves.some((r) => r.libelle === item.libelle)) return d;
      const reserve: Reserve = {
        id: uuid(),
        libelle: item.libelle,
        localisation: sectionTitre,
        gravite: "moyenne",
        statut: "ouverte",
        note: item.note,
        photoIds: [],
      };
      return { ...d, reserves: [reserve, ...d.reserves] };
    });

  const titreAffiche =
    visite.titre.trim() || visite.chantierNom || TYPE_LABEL[visite.type];

  return (
    <>
      {/* --- En-tête compact, collé en haut ----------------------------------- */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-page/95 px-4 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour aux visites"
            className="-ml-1.5 shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold",
              TYPE_TON[visite.type],
            )}
          >
            <meta.icon className="h-3.5 w-3.5" />
            {meta.court}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-fg">{titreAffiche}</p>
            <p className="truncate text-[11px] leading-tight text-subtle">
              {formatDateFr(visite.date)}
              {visite.chantierNom
                ? ` · ${visite.clientNom || visite.chantierNom}${visite.numeroWhy ? ` · ${visite.numeroWhy}` : ""}`
                : ""}
            </p>
          </div>
          <SyncPill {...sync} />
        </div>
        <BarreProgression fait={s.renseignes} total={s.total} className="mb-2" />
      </div>

      {sync.syncState === "error" && sync.syncError && (
        <p className="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          Synchro en échec : {sync.syncError} — vos saisies restent sur le téléphone.
        </p>
      )}

      {!visite.chantierId && tab !== "infos" && (
        <button
          type="button"
          onClick={() => setTab("infos")}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-io-di/40 bg-io-di/10 px-3 py-2 text-left text-xs font-medium text-io-di"
        >
          <Briefcase className="h-3.5 w-3.5 shrink-0" />
          Pas encore rattachée à une affaire — appuyez pour la rattacher (ou faites-le au
          bureau, plus tard).
        </button>
      )}

      {/* --- Contenu de l'onglet ------------------------------------------------ */}
      <div className="mt-3">
        {tab === "checklist" && (
          <OngletChecklist
            visite={visite}
            mediaById={mediaById}
            patchItem={patchItem}
            creerReserveDepuisItem={creerReserveDepuisItem}
            addMedia={addMedia}
            removeMedia={removeMedia}
            openLightbox={openLightbox}
            restants={s.total - s.renseignes}
            onDerouler={() => setGuide(true)}
          />
        )}
        {tab === "reserves" && (
          <OngletReserves
            visite={visite}
            mediaById={mediaById}
            setData={setData}
            addMedia={addMedia}
            removeMedia={removeMedia}
            openLightbox={openLightbox}
          />
        )}
        {tab === "medias" && (
          <OngletMedias
            visite={visite}
            addMedia={addMedia}
            removeMedia={removeMedia}
            openLightbox={openLightbox}
          />
        )}
        {tab === "infos" && (
          <OngletInfos
            visite={visite}
            affaires={affaires}
            patch={patch}
            addMedia={addMedia}
            removeMedia={removeMedia}
          />
        )}
      </div>

      {/* --- Dock de navigation (zone du pouce) --------------------------------- */}
      <nav className="sticky bottom-2 z-20 mt-5">
        <div className="flex gap-1 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-lg backdrop-blur">
          <BoutonDock
            actif={tab === "checklist"}
            onClick={() => setTab("checklist")}
            icone={ListChecks}
            label="Checklist"
            sousLabel={`${s.renseignes}/${s.total}`}
          />
          <BoutonDock
            actif={tab === "reserves"}
            onClick={() => setTab("reserves")}
            icone={TriangleAlert}
            label="Réserves"
            badge={s.reservesOuvertes > 0 ? s.reservesOuvertes : undefined}
          />
          <BoutonDock
            actif={tab === "medias"}
            onClick={() => setTab("medias")}
            icone={Images}
            label="Médias"
            sousLabel={s.photos + s.audios > 0 ? String(s.photos + s.audios) : undefined}
          />
          <BoutonDock
            actif={tab === "infos"}
            onClick={() => setTab("infos")}
            icone={Info}
            label="Infos"
            alerte={!visite.chantierId}
          />
        </div>
      </nav>

      {guide && (
        <ModeGuide
          visite={visite}
          mediaById={mediaById}
          patchItem={patchItem}
          creerReserveDepuisItem={creerReserveDepuisItem}
          addMedia={addMedia}
          removeMedia={removeMedia}
          openLightbox={openLightbox}
          onClose={() => setGuide(false)}
          onVoirReserves={() => {
            setGuide(false);
            setTab("reserves");
          }}
        />
      )}
    </>
  );
}

function BoutonDock({
  actif,
  onClick,
  icone: Icone,
  label,
  sousLabel,
  badge,
  alerte,
}: {
  actif: boolean;
  onClick: () => void;
  icone: typeof ListChecks;
  label: string;
  sousLabel?: string;
  badge?: number;
  alerte?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors",
        actif ? "bg-brand text-brand-fg" : "text-muted hover:bg-surface-2",
      )}
    >
      <span className="relative">
        <Icone className="h-5 w-5" />
        {badge !== undefined && (
          <span
            className={cn(
              "absolute -right-2.5 -top-1 rounded-full px-1 text-[9px] font-bold leading-3.5",
              actif ? "bg-white/25 text-brand-fg" : "bg-io-di text-white",
            )}
          >
            {badge}
          </span>
        )}
        {alerte && !actif && (
          <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-io-di" />
        )}
      </span>
      <span className="text-[10px] font-semibold leading-none">
        {label}
        {sousLabel && (
          <span className={cn("ml-1 tabular-nums", actif ? "opacity-80" : "text-subtle")}>
            {sousLabel}
          </span>
        )}
      </span>
    </button>
  );
}

/* ================================================================================
 * ONGLET CHECKLIST
 * ============================================================================== */

const STATUTS: { value: StatutItem; label: string; icone: typeof Check; sel: string }[] = [
  { value: "na", label: "N/A", icone: Minus, sel: "border-border bg-surface-3 text-fg" },
  { value: "ko", label: "KO", icone: X, sel: "border-danger/50 bg-danger/15 text-danger" },
  { value: "ok", label: "OK", icone: Check, sel: "border-success/50 bg-success/15 text-success" },
];

function OngletChecklist({
  visite,
  mediaById,
  patchItem,
  creerReserveDepuisItem,
  addMedia,
  removeMedia,
  openLightbox,
  restants,
  onDerouler,
}: {
  visite: VisiteLocale;
  mediaById: Map<string, MediaMeta>;
  patchItem: (itemId: string, p: Partial<ItemChecklist>) => void;
  creerReserveDepuisItem: (item: ItemChecklist, sectionTitre: string) => void;
  addMedia: (input: AddMediaInput) => void;
  removeMedia: (mediaId: string) => void;
  openLightbox: (url: string) => void;
  restants: number;
  onDerouler: () => void;
}) {
  const [replies, setReplies] = useState<Set<string>>(new Set());
  const [aFaire, setAFaire] = useState(false);

  const total = visite.data.sections.reduce((n, sec) => n + sec.items.length, 0);
  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
        Cette visite n&apos;a pas de checklist.
      </p>
    );
  }

  const sections = aFaire
    ? visite.data.sections
        .map((sec) => ({ ...sec, items: sec.items.filter((it) => it.statut === "") }))
        .filter((sec) => sec.items.length > 0)
    : visite.data.sections;

  return (
    <div className="space-y-3">
      {/* Le geste principal : dérouler la checklist point par point. */}
      <button
        type="button"
        onClick={onDerouler}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition-colors",
          restants > 0
            ? "bg-brand text-brand-fg hover:bg-brand-strong"
            : "border border-success/40 bg-success/10 text-success",
        )}
      >
        {restants > 0 ? (
          <>
            <Play className="h-4 w-4" />
            Dérouler la checklist
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">
              reste {restants}
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Checklist complète — revoir point par point
          </>
        )}
      </button>

      <div className="flex gap-1.5">
        <ChipFiltre actif={!aFaire} onClick={() => setAFaire(false)} label={`Tous (${total})`} />
        <ChipFiltre
          actif={aFaire}
          onClick={() => setAFaire(true)}
          label={`À faire (${restants})`}
        />
      </div>

      {aFaire && restants === 0 ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <p className="mt-2 text-sm font-semibold text-success">Tout est renseigné.</p>
          <p className="mt-0.5 text-xs text-muted">
            Pensez aux réserves et aux photos d&apos;ensemble avant de partir.
          </p>
        </div>
      ) : (
        sections.map((sec) => {
          const done = sec.items.filter((i) => i.statut !== "").length;
          const replie = replies.has(sec.id);
          return (
            <div key={sec.id} className="data-card overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setReplies((prev) => {
                    const next = new Set(prev);
                    if (next.has(sec.id)) next.delete(sec.id);
                    else next.add(sec.id);
                    return next;
                  })
                }
                className="flex w-full items-center gap-2.5 border-b border-border px-4 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-semibold tracking-tight text-fg">
                    {sec.titre}
                  </span>
                  {!aFaire && (
                    <BarreProgression
                      fait={done}
                      total={sec.items.length}
                      hauteur="h-0.5"
                      className="mt-1.5 max-w-24"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    !aFaire && done === sec.items.length ? "text-success" : "text-subtle",
                  )}
                >
                  {!aFaire && done === sec.items.length && (
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                  )}
                  {aFaire ? `${sec.items.length} à faire` : `${done}/${sec.items.length}`}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-subtle transition-transform",
                    replie && "-rotate-90",
                  )}
                />
              </button>
              {!replie && (
                <ul className="divide-y divide-border">
                  {sec.items.map((it) => (
                    <ItemRow
                      key={it.id}
                      item={it}
                      mediaById={mediaById}
                      reserveExiste={visite.data.reserves.some((r) => r.libelle === it.libelle)}
                      onPatch={(p) => patchItem(it.id, p)}
                      onCreerReserve={() => creerReserveDepuisItem(it, sec.titre)}
                      onPhoto={(photo) => addMedia({ type: "photo", ...photo, itemId: it.id })}
                      onAudio={(audio) => addMedia({ type: "audio", ...audio, itemId: it.id })}
                      onDeleteMedia={removeMedia}
                      openLightbox={openLightbox}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function ChipFiltre({
  actif,
  onClick,
  label,
}: {
  actif: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        actif
          ? "border-brand bg-brand/10 text-brand"
          : "border-border bg-surface text-muted hover:bg-surface-2",
      )}
    >
      {label}
    </button>
  );
}

function ItemRow({
  item,
  mediaById,
  reserveExiste,
  onPatch,
  onCreerReserve,
  onPhoto,
  onAudio,
  onDeleteMedia,
  openLightbox,
}: {
  item: ItemChecklist;
  mediaById: Map<string, MediaMeta>;
  reserveExiste: boolean;
  onPatch: (p: Partial<ItemChecklist>) => void;
  onCreerReserve: () => void;
  onPhoto: (photo: { blob: Blob; mimeType: string }) => void;
  onAudio: (audio: { blob: Blob; mimeType: string; dureeSec: number }) => void;
  onDeleteMedia: (mediaId: string) => void;
  openLightbox: (url: string) => void;
}) {
  const [noteVisible, setNoteVisible] = useState(false);
  const koSansPreuve = item.statut === "ko" && item.photoIds.length === 0 && !item.note.trim();
  return (
    <li className={cn("px-4 py-3", item.statut === "ko" && "bg-danger/5")}>
      <p className="text-sm font-medium leading-snug text-fg">{item.libelle}</p>
      {item.aide && <p className="mt-0.5 text-xs leading-snug text-subtle">{item.aide}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {STATUTS.map((st) => (
          <button
            key={st.value}
            type="button"
            onClick={() => {
              onPatch({ statut: item.statut === st.value ? "" : st.value });
              vibrer(8);
            }}
            className={cn(
              "inline-flex h-10 min-w-16 items-center justify-center gap-1 rounded-lg border px-3 text-sm font-bold transition-colors",
              item.statut === st.value
                ? st.sel
                : "border-border bg-surface text-muted active:bg-surface-2",
            )}
          >
            <st.icone className="h-4 w-4" />
            {st.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          <PhotoButton compact onPhoto={onPhoto} />
          <AudioRecorderButton compact onAudio={onAudio} />
        </span>
      </div>

      {item.statut === "ko" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {koSansPreuve && (
            <span className="text-xs font-medium text-danger">
              Photo ou note pour le compte-rendu →
            </span>
          )}
          <button
            type="button"
            disabled={reserveExiste}
            onClick={() => {
              onCreerReserve();
              vibrer(8);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
              reserveExiste
                ? "border-success/40 bg-success/10 text-success"
                : "border-io-di/45 bg-io-di/10 text-io-di hover:bg-io-di/15",
            )}
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            {reserveExiste ? "Réserve créée ✓" : "Créer une réserve"}
          </button>
        </div>
      )}

      {item.statut === "ko" || item.note || noteVisible ? (
        <textarea
          value={item.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          rows={1}
          placeholder="Note…"
          className="mt-2 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm leading-snug text-fg placeholder:text-subtle focus:border-brand focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setNoteVisible(true)}
          className="mt-1.5 text-xs text-subtle underline-offset-2 hover:text-brand hover:underline"
        >
          + note
        </button>
      )}

      {(item.photoIds.length > 0 || item.audioIds.length > 0) && (
        <div className="mt-2 space-y-1.5">
          {item.photoIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.photoIds.map((id) => {
                const m = mediaById.get(id);
                return m ? (
                  <PhotoThumb
                    key={id}
                    media={m}
                    size="sm"
                    onOpen={openLightbox}
                    onDelete={() => onDeleteMedia(id)}
                  />
                ) : null;
              })}
            </div>
          )}
          {item.audioIds.map((id) => {
            const m = mediaById.get(id);
            return m ? <AudioChip key={id} media={m} onDelete={() => onDeleteMedia(id)} /> : null;
          })}
        </div>
      )}
    </li>
  );
}

/* ================================================================================
 * ONGLET RÉSERVES
 * ============================================================================== */

const GRAVITE_TON: Record<Gravite, string> = {
  faible: "bg-surface-2 text-muted",
  moyenne: "bg-io-di/10 text-io-di",
  haute: "bg-danger/10 text-danger",
};

const GRAVITE_RAIL: Record<Gravite, string> = {
  faible: "border-l-border",
  moyenne: "border-l-io-di",
  haute: "border-l-danger",
};

function OngletReserves({
  visite,
  mediaById,
  setData,
  addMedia,
  removeMedia,
  openLightbox,
}: {
  visite: VisiteLocale;
  mediaById: Map<string, MediaMeta>;
  setData: (fn: (d: Visite["data"]) => Visite["data"]) => void;
  addMedia: (input: AddMediaInput) => void;
  removeMedia: (mediaId: string) => void;
  openLightbox: (url: string) => void;
}) {
  const [libelle, setLibelle] = useState("");
  const [localisation, setLocalisation] = useState("");
  const [gravite, setGravite] = useState<Gravite>("moyenne");

  const patchReserve = (id: string, p: Partial<Reserve>) =>
    setData((d) => ({
      ...d,
      reserves: d.reserves.map((r) => (r.id === id ? { ...r, ...p } : r)),
    }));

  function ajouter() {
    const lib = libelle.trim();
    if (!lib) return;
    const reserve: Reserve = {
      id: uuid(),
      libelle: lib,
      localisation: localisation.trim(),
      gravite,
      statut: "ouverte",
      note: "",
      photoIds: [],
    };
    setData((d) => ({ ...d, reserves: [reserve, ...d.reserves] }));
    setLibelle("");
    setLocalisation("");
    setGravite("moyenne");
    vibrer(8);
  }

  const ouvertes = visite.data.reserves.filter((r) => r.statut === "ouverte");
  const levees = visite.data.reserves.filter((r) => r.statut === "levee");

  return (
    <div className="space-y-3">
      <div className="data-card p-3">
        <p className="mb-2 font-display text-sm font-semibold text-fg">Nouvelle réserve</p>
        <input
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Quoi ? (ex. « Sonde départ non raccordée »)"
          className="w-full rounded-md border border-border bg-surface px-2.5 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-brand focus:outline-none"
        />
        <input
          value={localisation}
          onChange={(e) => setLocalisation(e.target.value)}
          placeholder="Où ? (local, armoire…)"
          className="mt-2 w-full rounded-md border border-border bg-surface px-2.5 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-brand focus:outline-none"
        />
        <div className="mt-2 flex gap-1.5">
          {GRAVITES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGravite(g)}
              className={cn(
                "flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                gravite === g
                  ? g === "haute"
                    ? "border-danger/50 bg-danger/10 text-danger"
                    : g === "moyenne"
                      ? "border-io-di/50 bg-io-di/10 text-io-di"
                      : "border-border bg-surface-3 text-fg"
                  : "border-border bg-surface text-muted",
              )}
            >
              {GRAVITE_LABEL[g]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={ajouter}
          disabled={!libelle.trim()}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-strong disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Ajouter la réserve
        </button>
      </div>

      {visite.data.reserves.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
          Aucune réserve. Tout ce qui bloque ou devra être repris se note ici — les réserves
          ouvertes seront reportées dans la prochaine visite de l&apos;affaire.
        </div>
      )}

      {[...ouvertes, ...levees].map((r) => (
        <div
          key={r.id}
          className={cn(
            "data-card border-l-4 p-3",
            GRAVITE_RAIL[r.gravite],
            r.statut === "levee" && "opacity-60",
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", GRAVITE_TON[r.gravite])}
            >
              {GRAVITE_LABEL[r.gravite]}
            </span>
            {r.origineVisiteId && r.origineVisiteId !== visite.id && (
              <span className="rounded bg-io-com/10 px-1.5 py-0.5 text-[11px] font-medium text-io-com">
                Reportée
              </span>
            )}
            <span className="ml-auto inline-flex overflow-hidden rounded-lg border border-border">
              {(["ouverte", "levee"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    patchReserve(r.id, { statut: st });
                    if (r.statut !== st) vibrer(8);
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold transition-colors",
                    r.statut === st
                      ? st === "ouverte"
                        ? "bg-io-di/15 text-io-di"
                        : "bg-success/15 text-success"
                      : "bg-surface text-subtle hover:bg-surface-2",
                  )}
                >
                  {st === "ouverte" ? "Ouverte" : "Levée"}
                </button>
              ))}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-medium leading-snug text-fg">{r.libelle}</p>
          {r.localisation && <p className="mt-0.5 text-xs text-muted">📍 {r.localisation}</p>}
          <textarea
            value={r.note}
            onChange={(e) => patchReserve(r.id, { note: e.target.value })}
            rows={1}
            placeholder="Détail, responsable, échéance…"
            className="mt-2 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm leading-snug text-fg placeholder:text-subtle focus:border-brand focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {r.photoIds.map((id) => {
              const m = mediaById.get(id);
              return m ? (
                <PhotoThumb
                  key={id}
                  media={m}
                  size="sm"
                  onOpen={openLightbox}
                  onDelete={() => removeMedia(id)}
                />
              ) : null;
            })}
            <PhotoButton
              compact
              onPhoto={(photo) => addMedia({ type: "photo", ...photo, reserveId: r.id })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================================
 * ONGLET MÉDIAS
 * ============================================================================== */

function OngletMedias({
  visite,
  addMedia,
  removeMedia,
  openLightbox,
}: {
  visite: VisiteLocale;
  addMedia: (input: AddMediaInput) => void;
  removeMedia: (mediaId: string) => void;
  openLightbox: (url: string) => void;
}) {
  const photos = visite.data.medias.filter((m) => m.type === "photo");
  const audios = visite.data.medias.filter((m) => m.type === "audio");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <PhotoButton onPhoto={(photo) => addMedia({ type: "photo", ...photo })} />
        <AudioRecorderButton onAudio={(audio) => addMedia({ type: "audio", ...audio })} />
      </div>

      <div>
        <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-wide text-subtle">
          Photos ({photos.length})
        </p>
        {photos.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune photo d&apos;ensemble pour l&apos;instant — l&apos;armoire ouverte, la plaque
            signalétique, le local : tout compte pour le bureau.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {photos.map((m) => (
              <PhotoThumb key={m.id} media={m} onOpen={openLightbox} onDelete={() => removeMedia(m.id)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-wide text-subtle">
          Notes vocales ({audios.length})
        </p>
        {audios.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune note vocale. Plus rapide que le clavier avec les gants — la transcription
            viendra plus tard.
          </p>
        ) : (
          <div className="space-y-1.5">
            {audios.map((m) => (
              <AudioChip key={m.id} media={m} onDelete={() => removeMedia(m.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================================
 * ONGLET INFOS
 * ============================================================================== */

function OngletInfos({
  visite,
  affaires,
  patch,
  addMedia,
  removeMedia,
}: {
  visite: VisiteLocale;
  affaires: AffaireTerrain[];
  patch: (fn: (v: Visite) => Visite) => void;
  addMedia: (input: AddMediaInput) => void;
  removeMedia: (mediaId: string) => void;
}) {
  const generaux = visite.data.medias.filter(
    (m) => m.type === "audio" && !m.itemId && !m.reserveId,
  );

  return (
    <div className="space-y-3">
      {!visite.chantierId && (
        <div className="data-card border-io-di/40 p-3">
          <p className="mb-1.5 text-sm font-semibold text-io-di">Rattacher à une affaire</p>
          <p className="mb-2 text-xs text-muted">
            La visite apparaîtra sur la fiche de l&apos;affaire et du client à la synchro.
          </p>
          <select
            value=""
            onChange={(e) => {
              const a = affaires.find((x) => x.id === e.target.value);
              if (!a) return;
              patch((v) => ({
                ...v,
                chantierId: a.id,
                chantierNom: a.nom,
                clientNom: a.clientNom,
                numeroWhy: a.numeroWhy,
              }));
              vibrer(8);
            }}
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-fg focus:border-brand focus:outline-none"
          >
            <option value="">— choisir une affaire —</option>
            {affaires.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom} · {a.clientNom}
                {a.numeroWhy ? ` · ${a.numeroWhy}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="data-card space-y-3 p-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-subtle">
            Nom de la visite
          </label>
          <input
            value={visite.titre}
            onChange={(e) => patch((v) => ({ ...v, titre: e.target.value }))}
            placeholder={`${TYPE_LABEL[visite.type]} — ${formatDateFr(visite.date)}`}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm font-medium text-fg placeholder:text-subtle focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-subtle">
            Date de la visite
          </label>
          <input
            type="date"
            value={visite.date}
            onChange={(e) => patch((v) => ({ ...v, date: e.target.value || v.date }))}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-fg focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-subtle">
            Participants
          </label>
          <textarea
            value={visite.data.participants}
            onChange={(e) =>
              patch((v) => ({ ...v, data: { ...v.data, participants: e.target.value } }))
            }
            rows={2}
            placeholder="Qui était là ? (nous, client, autres corps d'état…)"
            className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-sm leading-snug text-fg placeholder:text-subtle focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-subtle">
            Notes générales
          </label>
          <textarea
            value={visite.data.notes}
            onChange={(e) => patch((v) => ({ ...v, data: { ...v.data, notes: e.target.value } }))}
            rows={4}
            placeholder="Contexte, décisions prises, à retenir…"
            className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-sm leading-snug text-fg placeholder:text-subtle focus:border-brand focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <AudioRecorderButton compact onAudio={(audio) => addMedia({ type: "audio", ...audio })} />
            <span className="text-xs text-subtle">Note vocale générale</span>
          </div>
          {generaux.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {generaux.map((m) => (
                <AudioChip key={m.id} media={m} onDelete={() => removeMedia(m.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
