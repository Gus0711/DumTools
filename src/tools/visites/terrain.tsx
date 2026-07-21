"use client";

/**
 * Îlot TERRAIN des visites de chantier — client pur, 100 % local-first.
 * Une seule route (/outils/visites/terrain) contient la liste ET l'éditeur :
 * aucune navigation serveur pendant la visite → tout fonctionne en mode avion.
 *
 * L'accueil est pensé « je sors de la voiture » : reprendre la visite en cours
 * en UN geste, ou en créer une en DEUX (le type, l'affaire). Le reste — la
 * checklist guidée, les réserves, les médias — vit dans l'éditeur (editeur.tsx)
 * et le mode « Dérouler » (guide.tsx).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTerrainVisites } from "@/lib/offline/use-visites";
import type { AffaireTerrain, VisiteLocale } from "@/lib/offline/visites";
import { statsVisite, TYPE_LABEL, TYPE_TON, TYPES_VISITE, type TypeVisite, type Visite } from "./model";
import { Lightbox } from "./capture";
import { EditeurVisite } from "./editeur";
import { BarreProgression, formatDateFr, SyncPill, TYPE_META, vibrer } from "./terrain-ui";

export function TerrainVisites({
  initialAffaires,
  importer = null,
}: {
  initialAffaires: AffaireTerrain[];
  /** Visite synchronisée à ouvrir directement (« Modifier » depuis la fiche bureau). */
  importer?: Visite | null;
}) {
  const t = useTerrainVisites(initialAffaires, importer);
  const [openId, setOpenId] = useState<string | null>(importer?.id ?? null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Rafraîchit la copie en cache SW de cette page (arrivée en navigation client
  // comprise) : c'est elle qui est servie si l'app est rouverte hors-ligne.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.active?.postMessage({ type: "CACHE_PAGES", urls: [window.location.pathname] }),
      )
      .catch(() => {});
  }, []);

  const visite = openId ? (t.visites.find((v) => v.id === openId) ?? null) : null;

  return (
    <div className="mx-auto max-w-3xl p-4 pb-6 sm:p-6">
      {visite ? (
        <EditeurVisite
          visite={visite}
          affaires={t.affaires}
          onBack={() => setOpenId(null)}
          patch={(fn) => t.patch(visite.id, fn)}
          addMedia={(input) => void t.addMedia(visite.id, input)}
          removeMedia={(mediaId) => void t.removeMedia(visite.id, mediaId)}
          openLightbox={setLightbox}
          sync={{
            online: t.online,
            pending: t.pending,
            syncState: t.syncState,
            syncError: t.syncError,
            onSync: t.syncNow,
          }}
        />
      ) : (
        <ListeTerrain t={t} onOpen={setOpenId} />
      )}
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/* ================================================================================
 * ACCUEIL TERRAIN : reprendre / créer / mes visites
 * ============================================================================== */

function ListeTerrain({
  t,
  onOpen,
}: {
  t: ReturnType<typeof useTerrainVisites>;
  onOpen: (id: string) => void;
}) {
  const [creation, setCreation] = useState(false);

  // La visite « en cours » : la plus récente dont la checklist n'est pas finie.
  const enCours = t.visites.find((v) => {
    const s = statsVisite(v.data);
    return s.total > 0 && s.renseignes < s.total;
  });

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Link
          href="/outils/visites"
          aria-label="Retour à l'outil Visites"
          className="-ml-1.5 shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight text-fg">
          Mode terrain
        </h1>
        <SyncPill online={t.online} pending={t.pending} syncState={t.syncState} onSync={t.syncNow} />
      </div>

      {t.syncState === "error" && t.syncError && (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          Synchro en échec : {t.syncError} — vos saisies restent sur le téléphone.
        </p>
      )}

      {/* Reprendre là où on s'est arrêté — LE geste le plus fréquent sur site. */}
      {enCours && !creation && <CarteReprendre v={enCours} onOpen={() => onOpen(enCours.id)} />}

      {creation ? (
        <PanneauCreation
          affaires={t.affaires}
          onAnnuler={() => setCreation(false)}
          onCreer={async (type, affaire) => {
            const id = await t.creer(type, affaire);
            vibrer(8);
            setCreation(false);
            onOpen(id);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreation(true)}
          className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-brand-fg shadow-sm transition-colors hover:bg-brand-strong"
        >
          <Plus className="h-5 w-5" /> Nouvelle visite
        </button>
      )}

      {/* Visites présentes sur CET appareil. */}
      {!t.ready ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-muted">
          Chargement…
        </div>
      ) : t.visites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
          Aucune visite sur cet appareil.
          <br />
          Créez-en une — ça marche même au fond d&apos;une chaufferie sans réseau.
        </div>
      ) : (
        <>
          <p className="mb-2 mt-5 font-display text-xs font-semibold uppercase tracking-widest text-subtle">
            Sur cet appareil ({t.visites.length})
          </p>
          <ul className="space-y-2">
            {t.visites.map((v) => (
              <CarteVisite
                key={v.id}
                v={v}
                onOpen={() => onOpen(v.id)}
                onDelete={() => void t.supprimer(v.id)}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/* --- Reprendre --------------------------------------------------------------------- */

function CarteReprendre({ v, onOpen }: { v: VisiteLocale; onOpen: () => void }) {
  const s = statsVisite(v.data);
  const meta = TYPE_META[v.type];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "data-card mb-3 flex w-full items-center gap-3 border-l-4 p-4 text-left transition-colors hover:bg-surface-2",
        meta.rail,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-display text-[11px] font-bold uppercase tracking-widest text-brand">
          Reprendre la visite
        </p>
        <p className="mt-1 truncate font-display text-base font-semibold tracking-tight text-fg">
          {v.titre.trim() || v.chantierNom || TYPE_LABEL[v.type]}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <BarreProgression fait={s.renseignes} total={s.total} className="max-w-40" />
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
            {s.renseignes}/{s.total}
          </span>
        </div>
      </div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg">
        <ChevronRight className="h-5 w-5" />
      </span>
    </button>
  );
}

/* --- Création : le type en un tap, l'affaire, c'est parti ---------------------------- */

function PanneauCreation({
  affaires,
  onAnnuler,
  onCreer,
}: {
  affaires: AffaireTerrain[];
  onAnnuler: () => void;
  onCreer: (type: TypeVisite, affaire: AffaireTerrain | null) => Promise<void>;
}) {
  const [type, setType] = useState<TypeVisite>("RELEVE");
  const [affaireId, setAffaireId] = useState<string>("");
  const affaire = affaires.find((a) => a.id === affaireId) ?? null;

  return (
    <div className="data-card mb-4 p-4">
      <p className="mb-2 font-display font-semibold text-fg">Nouvelle visite</p>
      <div className="grid grid-cols-2 gap-2">
        {TYPES_VISITE.map((ty) => {
          const meta = TYPE_META[ty];
          const actif = type === ty;
          return (
            <button
              key={ty}
              type="button"
              onClick={() => {
                setType(ty);
                vibrer(6);
              }}
              className={cn(
                "rounded-xl border-2 p-3 text-left transition-colors",
                actif ? meta.bordureActive : "border-border bg-surface hover:bg-surface-2",
              )}
            >
              <meta.icon className={cn("h-5 w-5", actif ? "" : "text-subtle")} />
              <span className={cn("mt-1.5 block text-sm font-bold", actif ? "" : "text-fg")}>
                {meta.court}
              </span>
              <span className={cn("mt-0.5 block text-[11px] leading-snug", actif ? "opacity-80" : "text-subtle")}>
                {meta.hint}
              </span>
            </button>
          );
        })}
      </div>

      <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-subtle">
        Affaire
      </label>
      <select
        value={affaireId}
        onChange={(e) => setAffaireId(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-brand"
      >
        <option value="">— sans affaire (rattacher plus tard) —</option>
        {affaires.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nom} · {a.clientNom}
            {a.numeroWhy ? ` · ${a.numeroWhy}` : ""}
          </option>
        ))}
      </select>
      {affaire && affaire.reservesOuvertes.length > 0 && (
        <p className="mt-1.5 text-xs text-io-di">
          ⚠ {affaire.reservesOuvertes.length} réserve
          {affaire.reservesOuvertes.length > 1 ? "s" : ""} ouverte
          {affaire.reservesOuvertes.length > 1 ? "s" : ""} sur cette affaire — elle
          {affaire.reservesOuvertes.length > 1 ? "s seront reportées" : " sera reportée"} dans la
          visite.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void onCreer(type, affaire)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-3 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-strong"
        >
          <Plus className="h-4 w-4" /> Créer la visite
        </button>
        <button
          type="button"
          onClick={onAnnuler}
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted hover:bg-surface-2"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

/* --- Carte d'une visite locale --------------------------------------------------------- */

function CarteVisite({
  v,
  onOpen,
  onDelete,
}: {
  v: VisiteLocale;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const s = statsVisite(v.data);
  const meta = TYPE_META[v.type];
  const mediasEnAttente = v.data.medias.filter((m) => !m.uploaded).length;
  const enAttente = v.dirty || mediasEnAttente > 0;
  return (
    <li className={cn("data-card border-l-4", meta.rail)}>
      <div className="flex items-start gap-2 p-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", TYPE_TON[v.type])}>
              {meta.court}
            </span>
            <span className="text-xs text-subtle">{formatDateFr(v.date)}</span>
            <span
              className={cn(
                "ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium",
                enAttente ? "bg-io-di/10 text-io-di" : "bg-success/10 text-success",
              )}
            >
              {enAttente ? "À envoyer ⏳" : "Synchronisée ✓"}
            </span>
          </div>
          <p className="mt-1 truncate font-medium text-fg">
            {v.titre.trim() || v.chantierNom || "Visite sans titre"}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {v.chantierNom ? (
              <>
                {v.chantierNom}
                {v.clientNom ? ` · ${v.clientNom}` : ""}
                {v.numeroWhy ? ` · ${v.numeroWhy}` : ""}
              </>
            ) : (
              <span className="text-io-di">Non rattachée à une affaire</span>
            )}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <BarreProgression fait={s.renseignes} total={s.total} hauteur="h-0.5" className="max-w-28" />
            <span className="text-[11px] tabular-nums text-subtle">
              {s.renseignes}/{s.total}
              {s.ko > 0 && <span className="text-danger"> · {s.ko} KO</span>}
              {s.reservesOuvertes > 0 && (
                <span className="text-io-di"> · {s.reservesOuvertes} rés.</span>
              )}
              {s.photos > 0 && ` · ${s.photos} 📷`}
              {s.audios > 0 && ` · ${s.audios} 🎤`}
            </span>
          </div>
        </button>
        <button
          type="button"
          aria-label="Supprimer de cet appareil"
          onClick={() => {
            if (
              window.confirm(
                enAttente
                  ? "Cette visite n'est PAS entièrement synchronisée : la supprimer de cet appareil PERDRA les saisies non envoyées. Continuer ?"
                  : "Retirer cette visite de cet appareil ? (Elle reste consultable en ligne.)",
              )
            )
              onDelete();
          }}
          className="rounded-md p-2 text-subtle transition-colors hover:bg-surface-2 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
