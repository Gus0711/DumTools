"use client";

/**
 * Store local-first des VISITES DE CHANTIER (offline-first).
 *
 * Différence clé avec la mise en service : une visite est CRÉÉE entièrement
 * hors-ligne (UUID client) puis poussée — la synchro porte des upserts
 * idempotents de visites complètes (« dernier gagne » par visite via
 * data.updatedTs), pas des mutations fines sur un snapshot pré-chargé.
 *
 * Les binaires (photos / notes vocales) vivent en blobs IndexedDB, envoyés
 * séparément APRÈS la visite (la ligne serveur doit exister) via la route
 * /api/visites/media, elle aussi idempotente (UUID média client). Rien n'est
 * marqué synchronisé avant confirmation serveur → aucune perte terrain.
 */

import { idbGet, idbPut, idbGetAll, idbDelete, STORES } from "./idb";
import type { MediaMeta, Reserve, TypeMedia, Visite } from "@/tools/visites/model";
import { syncVisite } from "@/tools/visites/actions";

/** Visite telle que stockée localement (drapeau de synchro en plus). */
export type VisiteLocale = Visite & {
  /** true = modifiée localement depuis le dernier push confirmé. */
  dirty: boolean;
};

/** Affaire mise en cache pour la création hors-ligne (+ report des réserves). */
export type AffaireTerrain = {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string | null;
  /** Réserves encore ouvertes sur l'affaire (toutes visites confondues). */
  reservesOuvertes: Reserve[];
};

type BlobRecord = { id: string; blob: Blob };

type AffairesCache = { id: "affaires"; affaires: AffaireTerrain[]; hydratedAt: number };

// --- Visites -------------------------------------------------------------------

export async function listVisitesLocales(): Promise<VisiteLocale[]> {
  const all = await idbGetAll<VisiteLocale>(STORES.visites);
  return all.sort((a, b) => b.createdTs - a.createdTs);
}

export function getVisiteLocale(id: string): Promise<VisiteLocale | undefined> {
  return idbGet<VisiteLocale>(STORES.visites, id);
}

/** Écrit une visite en local. `touch` (défaut) horodate la modification terrain
 *  et marque la visite à synchroniser. */
export async function saveVisiteLocale(
  v: Visite,
  opts: { touch?: boolean } = {},
): Promise<VisiteLocale> {
  const touch = opts.touch ?? true;
  const stored: VisiteLocale = {
    ...v,
    data: touch ? { ...v.data, updatedTs: Date.now() } : v.data,
    dirty: touch ? true : ((v as VisiteLocale).dirty ?? false),
  };
  await idbPut(STORES.visites, stored);
  return stored;
}

/** Importe une visite SYNCHRONISÉE (venant du serveur) dans le store local sans
 *  la marquer à pousser — pour « Modifier » une visite depuis la fiche bureau sur
 *  un appareil qui ne l'a pas créée. N'écrase jamais une copie locale existante
 *  (elle peut porter des modifications pas encore synchronisées). */
export async function importVisiteLocale(v: Visite): Promise<VisiteLocale | null> {
  const locale = await getVisiteLocale(v.id);
  if (locale) return null;
  const stored: VisiteLocale = { ...v, dirty: false };
  await idbPut(STORES.visites, stored);
  return stored;
}

/** Supprime une visite locale ET ses blobs médias. Ne touche pas au serveur. */
export async function deleteVisiteLocale(id: string): Promise<void> {
  const v = await getVisiteLocale(id);
  if (v) {
    for (const m of v.data.medias) {
      await idbDelete(STORES.visiteBlobs, m.id).catch(() => {});
    }
  }
  await idbDelete(STORES.visites, id);
}

// --- Blobs médias ----------------------------------------------------------------

export async function putMediaBlob(id: string, blob: Blob): Promise<void> {
  const record: BlobRecord = { id, blob };
  await idbPut(STORES.visiteBlobs, record);
}

export async function getMediaBlob(id: string): Promise<Blob | undefined> {
  const rec = await idbGet<BlobRecord>(STORES.visiteBlobs, id);
  return rec?.blob;
}

export function deleteMediaBlob(id: string): Promise<void> {
  return idbDelete(STORES.visiteBlobs, id);
}

// --- Cache des affaires (création hors-ligne) -------------------------------------

/** Écrit le snapshot des affaires (reçu du serveur quand la page charge en ligne). */
export async function hydrateAffaires(affaires: AffaireTerrain[]): Promise<void> {
  if (!affaires.length) return; // ne pas écraser un cache utile par du vide
  const cache: AffairesCache = { id: "affaires", affaires, hydratedAt: Date.now() };
  await idbPut(STORES.visitesCache, cache);
}

export async function getAffairesCache(): Promise<AffaireTerrain[]> {
  const cache = await idbGet<AffairesCache>(STORES.visitesCache, "affaires");
  return cache?.affaires ?? [];
}

// --- Compteurs ---------------------------------------------------------------------

/** Nombre d'éléments en attente de synchro : visites modifiées + médias à envoyer. */
export async function countPending(): Promise<number> {
  const visites = await listVisitesLocales();
  let n = 0;
  for (const v of visites) {
    if (v.dirty) n++;
    n += v.data.medias.filter((m) => !m.uploaded).length;
  }
  return n;
}

// --- Synchro -------------------------------------------------------------------------

let syncing = false;

export type SyncResult = {
  visitesPushed: number;
  mediasUploaded: number;
  remaining: number;
  error?: string;
};

/**
 * Pousse tout ce qui est en attente : d'abord les visites (upsert idempotent —
 * la ligne serveur doit exister avant ses médias), puis les blobs médias non
 * confirmés. Une visite n'est marquée propre que si elle n'a pas été re-modifiée
 * pendant l'envoi (comparaison d'updatedTs). Sûr à rappeler (verrou).
 */
export async function syncPendingVisites(): Promise<SyncResult> {
  if (syncing) return { visitesPushed: 0, mediasUploaded: 0, remaining: await countPending() };
  syncing = true;
  try {
    let visitesPushed = 0;
    let mediasUploaded = 0;
    let firstError: string | undefined;

    // 1) Les visites modifiées.
    for (const v of await listVisitesLocales()) {
      if (!v.dirty) continue;
      const pushedTs = v.data.updatedTs;
      try {
        await syncVisite({
          id: v.id,
          type: v.type,
          titre: v.titre,
          date: v.date,
          chantierId: v.chantierId,
          chantierNom: v.chantierNom,
          clientNom: v.clientNom,
          numeroWhy: v.numeroWhy,
          data: v.data,
          createdTs: v.createdTs,
        });
        visitesPushed++;
        // Marque propre SEULEMENT si rien n'a bougé pendant l'await.
        const courant = await getVisiteLocale(v.id);
        if (courant && courant.data.updatedTs === pushedTs) {
          await idbPut(STORES.visites, { ...courant, dirty: false });
        }
      } catch (e) {
        firstError = firstError ?? (e instanceof Error ? e.message : String(e));
      }
    }

    // 2) Les médias des visites propres (la ligne Visite existe côté serveur).
    for (const v of await listVisitesLocales()) {
      if (v.dirty) continue; // le push de la visite a échoué → ses médias attendront
      let changed = false;
      const medias: MediaMeta[] = [...v.data.medias];
      for (let i = 0; i < medias.length; i++) {
        const m = medias[i];
        if (m.uploaded) continue;
        const blob = await getMediaBlob(m.id);
        if (!blob) continue; // blob perdu (purge navigateur) : rien à envoyer
        try {
          await uploadMedia(v.id, m, blob);
          medias[i] = { ...m, uploaded: true };
          mediasUploaded++;
          changed = true;
        } catch (e) {
          firstError = firstError ?? (e instanceof Error ? e.message : String(e));
        }
      }
      if (changed) {
        // Drapeau purement local : on ne marque PAS la visite dirty pour ça.
        const courant = await getVisiteLocale(v.id);
        if (courant) {
          const byId = new Map(medias.map((m) => [m.id, m] as const));
          await idbPut(STORES.visites, {
            ...courant,
            data: {
              ...courant.data,
              medias: courant.data.medias.map((m) => byId.get(m.id) ?? m),
            },
          });
        }
      }
    }

    return { visitesPushed, mediasUploaded, remaining: await countPending(), error: firstError };
  } finally {
    syncing = false;
  }
}

async function uploadMedia(visiteId: string, meta: MediaMeta, blob: Blob): Promise<void> {
  const fd = new FormData();
  fd.set("mediaId", meta.id);
  fd.set("visiteId", visiteId);
  fd.set("type", meta.type satisfies TypeMedia);
  fd.set("mimeType", meta.mimeType);
  fd.set("file", blob, meta.id);
  const res = await fetch("/api/visites/media", { method: "POST", body: fd });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Envoi du média refusé (${res.status})`);
  }
}
