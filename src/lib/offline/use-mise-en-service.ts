"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "./use-online";
import {
  hydrate,
  writeLocal,
  syncPending,
  countPendingForProject,
  type MesPoint,
} from "./mise-en-service";

export type SyncState = "idle" | "syncing" | "synced" | "error";

export type UseMiseEnService = {
  points: MesPoint[];
  ready: boolean;
  online: boolean;
  pending: number;
  syncState: SyncState;
  syncError?: string;
  update: (uid: string, patch: { testStatus?: string; testComment?: string }) => void;
  syncNow: () => void;
};

/**
 * Cœur de l'écran mise en service hors-ligne. Hydrate depuis le snapshot serveur
 * (reçu en props quand la page a été ouverte en ligne), écrit local-first, et
 * synchronise automatiquement au retour réseau. Le composant reste 100 % client :
 * aucune dépendance serveur au runtime en dehors du rejeu de la file.
 */
export function useMiseEnService(initial: {
  id: string;
  nom: string;
  points: MesPoint[];
}): UseMiseEnService {
  const online = useOnline();
  const [points, setPoints] = useState<MesPoint[]>(initial.points);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncError, setSyncError] = useState<string | undefined>();

  const projetId = initial.id;
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPending = useCallback(async () => {
    setPending(await countPendingForProject(projetId));
  }, [projetId]);

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncState("syncing");
    const res = await syncPending();
    await refreshPending();
    if (res.error) {
      setSyncState("error");
      setSyncError(res.error);
    } else {
      setSyncState("synced");
      setSyncError(undefined);
    }
  }, [refreshPending]);

  // Hydratation au montage (le local gagne sur le snapshot serveur).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await hydrate({ id: initial.id, nom: initial.nom, points: initial.points });
        if (!alive) return;
        setPoints(snap.points);
        await refreshPending();
        setReady(true);
        if (navigator.onLine) void doSync();
      } catch {
        // IndexedDB indisponible (navigation privée stricte, etc.) : on reste en
        // mémoire, la synchro directe prendra le relais si en ligne.
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
    // On hydrate une seule fois par projet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetId]);

  // Rejeu automatique au retour du réseau (déféré : évite un setState synchrone
  // dans le corps de l'effet, et laisse React finir son rendu d'abord).
  useEffect(() => {
    if (!online || !ready) return;
    const t = setTimeout(() => void doSync(), 0);
    return () => clearTimeout(t);
  }, [online, ready, doSync]);

  const update = useCallback(
    (uid: string, patch: { testStatus?: string; testComment?: string }) => {
      // 1) rendu optimiste immédiat
      setPoints((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
      // 2) persistance locale + enfilement, puis synchro différée si en ligne
      void (async () => {
        await writeLocal(projetId, uid, patch);
        await refreshPending();
        if (navigator.onLine) {
          if (syncTimer.current) clearTimeout(syncTimer.current);
          syncTimer.current = setTimeout(() => void doSync(), 800);
        }
      })();
    },
    [projetId, refreshPending, doSync],
  );

  const syncNow = useCallback(() => void doSync(), [doSync]);

  return { points, ready, online, pending, syncState, syncError, update, syncNow };
}
