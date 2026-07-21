"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "./use-online";
import type { SyncState } from "./use-mise-en-service";
import {
  countPending,
  deleteVisiteLocale,
  deleteMediaBlob,
  getAffairesCache,
  hydrateAffaires,
  importVisiteLocale,
  listVisitesLocales,
  putMediaBlob,
  saveVisiteLocale,
  syncPendingVisites,
  type AffaireTerrain,
  type VisiteLocale,
} from "./visites";
import { uuid, type MediaMeta, type TypeMedia, type TypeVisite, type Visite } from "@/tools/visites/model";
import { nouvelleVisite } from "@/tools/visites/modeles-defaut";

export type UseTerrainVisites = {
  ready: boolean;
  online: boolean;
  pending: number;
  syncState: SyncState;
  syncError?: string;
  syncNow: () => void;
  visites: VisiteLocale[];
  affaires: AffaireTerrain[];
  creer: (type: TypeVisite, affaire: AffaireTerrain | null) => Promise<string>;
  supprimer: (id: string) => Promise<void>;
  patch: (id: string, fn: (v: Visite) => Visite) => void;
  addMedia: (
    visiteId: string,
    input: {
      type: TypeMedia;
      mimeType: string;
      blob: Blob;
      itemId?: string;
      reserveId?: string;
      dureeSec?: number;
    },
  ) => Promise<MediaMeta>;
  removeMedia: (visiteId: string, mediaId: string) => Promise<void>;
};

/**
 * Cœur de l'îlot terrain des visites : liste locale, création 100 % hors-ligne
 * (depuis le cache d'affaires hydraté quand la page a chargé en ligne), écriture
 * local-first et synchro automatique au retour réseau. 100 % client — aucune
 * dépendance serveur au runtime en dehors du rejeu de la synchro.
 */
export function useTerrainVisites(
  initialAffaires: AffaireTerrain[],
  /** Visite synchronisée à importer dans le store local (« Modifier » depuis la
   *  fiche bureau). Ignorée si une copie locale existe déjà. */
  importer?: Visite | null,
): UseTerrainVisites {
  const online = useOnline();
  const [visites, setVisites] = useState<VisiteLocale[]>([]);
  const [affaires, setAffaires] = useState<AffaireTerrain[]>(initialAffaires);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncError, setSyncError] = useState<string | undefined>();

  // Miroir synchrone de l'état (évite les fermetures périmées dans patch()).
  const visitesRef = useRef<VisiteLocale[]>([]);
  useEffect(() => {
    visitesRef.current = visites;
  }, [visites]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPending = useCallback(async () => {
    setPending(await countPending());
  }, []);

  const reload = useCallback(async () => {
    setVisites(await listVisitesLocales());
    await refreshPending();
  }, [refreshPending]);

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncState("syncing");
    const res = await syncPendingVisites();
    // La synchro a pu retoucher les drapeaux (dirty / uploaded) → relire.
    await reload();
    if (res.error) {
      setSyncState("error");
      setSyncError(res.error);
    } else {
      setSyncState("synced");
      setSyncError(undefined);
    }
  }, [reload]);

  const scheduleSync = useCallback(() => {
    if (!navigator.onLine) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void doSync(), 1200);
  }, [doSync]);

  // Montage : hydrate le cache d'affaires (props serveur si en ligne, sinon le
  // cache IndexedDB précédent) puis charge les visites locales.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await hydrateAffaires(initialAffaires);
        if (initialAffaires.length === 0) {
          const cached = await getAffairesCache();
          if (alive && cached.length) setAffaires(cached);
        }
        if (importer) await importVisiteLocale(importer);
        if (!alive) return;
        await reload();
        setReady(true);
        if (navigator.onLine) void doSync();
      } catch {
        // IndexedDB indisponible : l'îlot reste utilisable en mémoire seule.
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
    // Hydratation unique au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rejeu automatique au retour du réseau (déféré, hors du rendu en cours).
  useEffect(() => {
    if (!online || !ready) return;
    const t = setTimeout(() => void doSync(), 0);
    return () => clearTimeout(t);
  }, [online, ready, doSync]);

  const creer = useCallback(
    async (type: TypeVisite, affaire: AffaireTerrain | null): Promise<string> => {
      const v = nouvelleVisite(type, {
        chantierId: affaire?.id ?? null,
        chantierNom: affaire?.nom ?? "",
        clientNom: affaire?.clientNom ?? "",
        numeroWhy: affaire?.numeroWhy ?? null,
        reservesOuvertes: affaire?.reservesOuvertes,
      });
      const stored = await saveVisiteLocale(v);
      setVisites((prev) => [stored, ...prev]);
      await refreshPending();
      scheduleSync();
      return v.id;
    },
    [refreshPending, scheduleSync],
  );

  const supprimer = useCallback(
    async (id: string) => {
      await deleteVisiteLocale(id);
      setVisites((prev) => prev.filter((v) => v.id !== id));
      await refreshPending();
    },
    [refreshPending],
  );

  const patch = useCallback(
    (id: string, fn: (v: Visite) => Visite) => {
      const courant = visitesRef.current.find((v) => v.id === id);
      if (!courant) return;
      const next: VisiteLocale = { ...fn(courant), dirty: true };
      // Miroir à jour immédiatement : deux patch() dans le même tick se voient.
      visitesRef.current = visitesRef.current.map((v) => (v.id === id ? next : v));
      // 1) rendu optimiste immédiat (updatedTs posé par saveVisiteLocale ensuite)
      setVisites((prev) => prev.map((v) => (v.id === id ? next : v)));
      // 2) persistance locale + synchro différée
      void (async () => {
        const stored = await saveVisiteLocale(next);
        setVisites((prev) => prev.map((v) => (v.id === id ? stored : v)));
        await refreshPending();
        scheduleSync();
      })();
    },
    [refreshPending, scheduleSync],
  );

  const addMedia = useCallback(
    async (
      visiteId: string,
      input: {
        type: TypeMedia;
        mimeType: string;
        blob: Blob;
        itemId?: string;
        reserveId?: string;
        dureeSec?: number;
      },
    ): Promise<MediaMeta> => {
      const meta: MediaMeta = {
        id: uuid(),
        type: input.type,
        mimeType: input.mimeType,
        taille: input.blob.size,
        itemId: input.itemId,
        reserveId: input.reserveId,
        note: "",
        dureeSec: input.dureeSec,
        createdTs: Date.now(),
        uploaded: false,
      };
      // Le blob D'ABORD : si l'écriture échoue (quota), on ne référence rien.
      await putMediaBlob(meta.id, input.blob);
      patch(visiteId, (v) => ({
        ...v,
        data: {
          ...v.data,
          medias: [...v.data.medias, meta],
          sections: input.itemId
            ? v.data.sections.map((s) => ({
                ...s,
                items: s.items.map((it) =>
                  it.id === input.itemId
                    ? {
                        ...it,
                        photoIds: input.type === "photo" ? [...it.photoIds, meta.id] : it.photoIds,
                        audioIds: input.type === "audio" ? [...it.audioIds, meta.id] : it.audioIds,
                      }
                    : it,
                ),
              }))
            : v.data.sections,
          reserves: input.reserveId
            ? v.data.reserves.map((r) =>
                r.id === input.reserveId ? { ...r, photoIds: [...r.photoIds, meta.id] } : r,
              )
            : v.data.reserves,
        },
      }));
      return meta;
    },
    [patch],
  );

  const removeMedia = useCallback(
    async (visiteId: string, mediaId: string) => {
      await deleteMediaBlob(mediaId).catch(() => {});
      patch(visiteId, (v) => ({
        ...v,
        data: {
          ...v.data,
          medias: v.data.medias.filter((m) => m.id !== mediaId),
          sections: v.data.sections.map((s) => ({
            ...s,
            items: s.items.map((it) => ({
              ...it,
              photoIds: it.photoIds.filter((x) => x !== mediaId),
              audioIds: it.audioIds.filter((x) => x !== mediaId),
            })),
          })),
          reserves: v.data.reserves.map((r) => ({
            ...r,
            photoIds: r.photoIds.filter((x) => x !== mediaId),
          })),
        },
      }));
    },
    [patch],
  );

  const syncNow = useCallback(() => void doSync(), [doSync]);

  return {
    ready,
    online,
    pending,
    syncState,
    syncError,
    syncNow,
    visites,
    affaires,
    creer,
    supprimer,
    patch,
    addMedia,
    removeMedia,
  };
}
