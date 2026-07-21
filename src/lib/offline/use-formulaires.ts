"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnline } from "./use-online";
import {
  countReponsesEnAttente,
  deleteFormBlob,
  deleteReponseLocale,
  getFormBlob,
  listReponsesLocales,
  putFormBlob,
  saveReponseLocale,
  syncPendingReponses,
} from "./formulaires";
import type { RendererMedia } from "@/tools/formulaires/media-widgets";
import type {
  MediaMeta,
  ReponseData,
  SchemaFormulaire,
  ValeurChamp,
} from "@/tools/formulaires/model";
import {
  estMedia,
  estPresentation,
  recalculer,
  valeurVide,
} from "@/tools/formulaires/model";

export type SyncEtat = "idle" | "syncing" | "synced" | "error";

function initiales(schema: SchemaFormulaire): Record<string, ValeurChamp> {
  const o: Record<string, ValeurChamp> = {};
  for (const c of schema) o[c.id] = valeurVide(c);
  return o;
}

export interface UseRemplissage {
  ready: boolean;
  online: boolean;
  /** Réponses SOUMISES en attente de synchro (pour CE formulaire). */
  pending: number;
  syncEtat: SyncEtat;
  syncError?: string;
  syncNow: () => void;
  valeurs: Record<string, ValeurChamp>;
  setValeur: (champId: string, v: ValeurChamp) => void;
  media: RendererMedia;
  /** Au moins un champ renseigné (garde beforeunload / bouton). */
  aDesSaisies: boolean;
  /** Un brouillon a été repris automatiquement au chargement. */
  repris: boolean;
  /** Le brouillon en cours a été enregistré localement (reprise possible). */
  brouillonEnregistre: boolean;
  /** Valide la réponse : la fige (soumise) et repart sur un brouillon vierge. */
  soumettre: () => Promise<void>;
  /** Abandonne le brouillon en cours (efface valeurs + médias locaux). */
  viderBrouillon: () => void;
}

/**
 * Cœur de l'îlot de remplissage : saisie local-first + BROUILLON REPRIS.
 * Le brouillon en cours est auto-enregistré en IndexedDB (`soumise:false`, jamais
 * poussé) → on peut fermer et revenir : au chargement, le dernier brouillon de ce
 * formulaire est repris (valeurs + aperçus médias reconstruits depuis les blobs).
 * La validation fige le brouillon (`soumise:true`) et le synchronise, puis un
 * nouveau brouillon vierge démarre.
 */
export function useRemplissage({
  formulaireId,
  formulaireVersion,
  schema,
}: {
  formulaireId: string;
  formulaireVersion: number;
  schema: SchemaFormulaire;
}): UseRemplissage {
  const online = useOnline();
  const [ready, setReady] = useState(false);
  const [valeurs, setValeurs] = useState(() =>
    recalculer(initiales(schema), schema),
  );
  const [pending, setPending] = useState(0);
  const [syncEtat, setSyncEtat] = useState<SyncEtat>("idle");
  const [syncError, setSyncError] = useState<string>();
  const [repris, setRepris] = useState(false);
  const [brouillonEnregistre, setBrouillonEnregistre] = useState(false);

  // Médias du brouillon courant : méta + object URLs (aperçu synchrone).
  const metaRef = useRef<Map<string, MediaMeta>>(new Map());
  const urlRef = useRef<Map<string, string>>(new Map());
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Id stable du brouillon courant (= id de la future réponse soumise).
  const draftIdRef = useRef<string>(crypto.randomUUID());

  const refreshPending = useCallback(async () => {
    setPending(await countReponsesEnAttente(formulaireId));
  }, [formulaireId]);

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncEtat("syncing");
    const res = await syncPendingReponses();
    setPending(await countReponsesEnAttente(formulaireId));
    if (res.error) {
      setSyncEtat("error");
      setSyncError(res.error);
    } else {
      setSyncEtat("synced");
      setSyncError(undefined);
    }
  }, [formulaireId]);

  const scheduleSync = useCallback(() => {
    if (!navigator.onLine) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void doSync(), 1200);
  }, [doSync]);

  // Médias effectivement référencés par les valeurs (TOUS les types média).
  const collecterMedias = useCallback(
    (vals: Record<string, ValeurChamp>): MediaMeta[] => {
      const ids = new Set<string>();
      for (const c of schema) {
        if (estMedia(c.type)) {
          const v = vals[c.id];
          if (Array.isArray(v)) v.forEach((x) => ids.add(x as string));
        }
      }
      const out: MediaMeta[] = [];
      for (const id of ids) {
        const m = metaRef.current.get(id);
        if (m) out.push(m);
      }
      return out;
    },
    [schema],
  );

  // Montage : reprend le dernier brouillon (s'il existe), compte les soumises en
  // attente, puis tente une synchro si en ligne.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const locales = await listReponsesLocales();
        const brouillons = locales
          .filter((r) => !r.soumise && r.formulaireId === formulaireId)
          .sort((a, b) => (b.data.updatedTs ?? 0) - (a.data.updatedTs ?? 0));
        const draft = brouillons[0];
        if (alive && draft) {
          draftIdRef.current = draft.id;
          // Reconstruire les aperçus médias depuis les blobs locaux.
          for (const m of draft.data.medias ?? []) {
            const blob = await getFormBlob(m.id).catch(() => undefined);
            if (!blob) continue;
            metaRef.current.set(m.id, { ...m, uploaded: false });
            urlRef.current.set(m.id, URL.createObjectURL(blob));
          }
          if (alive) {
            setValeurs(
              recalculer(
                { ...initiales(schema), ...(draft.data.valeurs ?? {}) },
                schema,
              ),
            );
            setRepris(true);
            setBrouillonEnregistre(true);
          }
        }
        await refreshPending();
      } catch {
        /* IndexedDB indisponible : l'îlot reste utilisable en mémoire. */
      }
      if (!alive) return;
      setReady(true);
      if (navigator.onLine) void doSync();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rejeu automatique au retour du réseau.
  useEffect(() => {
    if (!online || !ready) return;
    const t = setTimeout(() => void doSync(), 0);
    return () => clearTimeout(t);
  }, [online, ready, doSync]);

  // Révocation des object URLs restants au démontage.
  useEffect(() => {
    const urls = urlRef.current;
    return () => {
      for (const u of urls.values()) URL.revokeObjectURL(u);
    };
  }, []);

  const setValeur = useCallback(
    (champId: string, v: ValeurChamp) => {
      setValeurs((s) => recalculer({ ...s, [champId]: v }, schema));
      setBrouillonEnregistre(false);
    },
    [schema],
  );

  const media = useMemo<RendererMedia>(
    () => ({
      ajouter: async (champId, type, blob, mimeType, nom) => {
        const id = crypto.randomUUID();
        await putFormBlob(id, blob);
        metaRef.current.set(id, {
          id,
          type,
          mimeType,
          taille: blob.size,
          nom,
          champId,
          uploaded: false,
        });
        urlRef.current.set(id, URL.createObjectURL(blob));
        return id;
      },
      retirer: (id) => {
        const u = urlRef.current.get(id);
        if (u) {
          URL.revokeObjectURL(u);
          urlRef.current.delete(id);
        }
        metaRef.current.delete(id);
        void deleteFormBlob(id).catch(() => {});
      },
      url: (id) => urlRef.current.get(id) ?? `/api/formulaires/media/${id}`,
    }),
    [],
  );

  const aDesSaisies = schema.some((c) => {
    if (c.type === "calcul" || estPresentation(c.type)) return false;
    const v = valeurs[c.id];
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return true;
    if (Array.isArray(v)) return v.length > 0;
    return true; // position GPS
  });

  // Auto-enregistrement du brouillon (débounce) tant qu'il y a des saisies.
  const sauverBrouillon = useCallback(async () => {
    const data: ReponseData = {
      schemaSnapshot: schema,
      valeurs,
      medias: collecterMedias(valeurs),
      updatedTs: Date.now(),
    };
    await saveReponseLocale({
      id: draftIdRef.current,
      formulaireId,
      formulaireVersion,
      data,
      soumise: false,
      dirty: false,
    });
    setBrouillonEnregistre(true);
  }, [valeurs, schema, formulaireId, formulaireVersion, collecterMedias]);

  useEffect(() => {
    if (!ready || !aDesSaisies) return;
    const t = setTimeout(() => void sauverBrouillon(), 900);
    return () => clearTimeout(t);
  }, [ready, aDesSaisies, sauverBrouillon]);

  const soumettre = useCallback(async () => {
    const data: ReponseData = {
      schemaSnapshot: schema,
      valeurs,
      medias: collecterMedias(valeurs),
      updatedTs: Date.now(),
    };
    // Fige le brouillon courant en réponse SOUMISE (même id → il sera synchronisé).
    await saveReponseLocale({
      id: draftIdRef.current,
      formulaireId,
      formulaireVersion,
      data,
      soumise: true,
      dirty: true,
    });
    // Repartir sur un brouillon vierge. Les blobs référencés sont désormais
    // possédés par la réponse soumise ; on ne nettoie que les object URLs.
    for (const u of urlRef.current.values()) URL.revokeObjectURL(u);
    urlRef.current.clear();
    metaRef.current.clear();
    draftIdRef.current = crypto.randomUUID();
    setRepris(false);
    setBrouillonEnregistre(false);
    setValeurs(recalculer(initiales(schema), schema));
    await refreshPending();
    scheduleSync();
  }, [
    valeurs,
    schema,
    formulaireId,
    formulaireVersion,
    collecterMedias,
    refreshPending,
    scheduleSync,
  ]);

  const viderBrouillon = useCallback(() => {
    const id = draftIdRef.current;
    for (const u of urlRef.current.values()) URL.revokeObjectURL(u);
    for (const mid of metaRef.current.keys())
      void deleteFormBlob(mid).catch(() => {});
    urlRef.current.clear();
    metaRef.current.clear();
    void deleteReponseLocale(id).catch(() => {});
    draftIdRef.current = crypto.randomUUID();
    setRepris(false);
    setBrouillonEnregistre(false);
    setValeurs(recalculer(initiales(schema), schema));
  }, [schema]);

  const syncNow = useCallback(() => void doSync(), [doSync]);

  return {
    ready,
    online,
    pending,
    syncEtat,
    syncError,
    syncNow,
    valeurs,
    setValeur,
    media,
    aDesSaisies,
    repris,
    brouillonEnregistre,
    soumettre,
    viderBrouillon,
  };
}
