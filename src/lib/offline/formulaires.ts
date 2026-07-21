"use client";

/**
 * Store local-first des RÉPONSES de formulaire (offline-first, patron visites.ts).
 * Une réponse est CRÉÉE entièrement hors-ligne (UUID client) à la validation puis
 * poussée — la synchro porte des upserts idempotents de réponses complètes
 * (« dernier gagne » par `data.updatedTs`). Les binaires (photos/signatures)
 * vivent en blobs IndexedDB, envoyés APRÈS la réponse (la ligne serveur doit
 * exister), via /api/formulaires/media (idempotent, UUID média client). Une
 * réponse totalement confirmée (ligne + médias) est purgée du local — le serveur
 * fait foi, la liste des réponses se lit côté serveur.
 */

import { idbGet, idbGetAll, idbPut, idbDelete, STORES } from "./idb";
import { syncReponse } from "@/tools/formulaires/actions";
import type { MediaMeta, ReponseData } from "@/tools/formulaires/model";

/** Réponse telle que stockée localement. */
export interface ReponseLocale {
  id: string;
  formulaireId: string;
  formulaireVersion: number;
  data: ReponseData;
  /** true = validée par l'utilisateur → à synchroniser (un brouillon non soumis
   *  n'est jamais poussé). */
  soumise: boolean;
  /** true = pas encore confirmée côté serveur. */
  dirty: boolean;
}

type BlobRecord = { id: string; blob: Blob };

export function listReponsesLocales(): Promise<ReponseLocale[]> {
  return idbGetAll<ReponseLocale>(STORES.formReponses);
}

export function getReponseLocale(id: string): Promise<ReponseLocale | undefined> {
  return idbGet<ReponseLocale>(STORES.formReponses, id);
}

export async function saveReponseLocale(r: ReponseLocale): Promise<void> {
  await idbPut(STORES.formReponses, r);
}

export async function deleteReponseLocale(id: string): Promise<void> {
  const r = await getReponseLocale(id);
  if (r) {
    for (const m of r.data.medias) {
      await idbDelete(STORES.formBlobs, m.id).catch(() => {});
    }
  }
  await idbDelete(STORES.formReponses, id);
}

// --- Blobs médias ----------------------------------------------------------------

export async function putFormBlob(id: string, blob: Blob): Promise<void> {
  await idbPut(STORES.formBlobs, { id, blob } as BlobRecord);
}
export async function getFormBlob(id: string): Promise<Blob | undefined> {
  const rec = await idbGet<BlobRecord>(STORES.formBlobs, id);
  return rec?.blob;
}
export function deleteFormBlob(id: string): Promise<void> {
  return idbDelete(STORES.formBlobs, id);
}

// --- Compteurs -------------------------------------------------------------------

/** Réponses soumises encore en attente de synchro complète (ligne + médias). */
export async function reponsesEnAttente(
  formulaireId?: string,
): Promise<ReponseLocale[]> {
  const all = await listReponsesLocales();
  return all.filter(
    (r) => r.soumise && (!formulaireId || r.formulaireId === formulaireId),
  );
}

export async function countReponsesEnAttente(
  formulaireId?: string,
): Promise<number> {
  return (await reponsesEnAttente(formulaireId)).length;
}

// --- Synchro ---------------------------------------------------------------------

let syncing = false;

export interface SyncReponsesResult {
  pushed: number;
  mediasUploaded: number;
  remaining: number;
  error?: string;
}

/**
 * Pousse les réponses soumises : d'abord l'upsert de la réponse (la ligne doit
 * exister avant ses médias), puis les blobs médias non confirmés. Une réponse
 * entièrement confirmée est purgée du local. Sûr à rappeler (verrou).
 */
export async function syncPendingReponses(): Promise<SyncReponsesResult> {
  if (syncing) {
    return { pushed: 0, mediasUploaded: 0, remaining: await countReponsesEnAttente() };
  }
  syncing = true;
  try {
    let pushed = 0;
    let mediasUploaded = 0;
    let firstError: string | undefined;

    for (const r of await reponsesEnAttente()) {
      // 1) la réponse (upsert idempotent)
      if (r.dirty) {
        try {
          const res = await syncReponse({
            id: r.id,
            formulaireId: r.formulaireId,
            formulaireVersion: r.formulaireVersion,
            data: r.data,
          });
          if ("error" in res) throw new Error(res.error);
          pushed++;
          r.dirty = false;
        } catch (e) {
          firstError = firstError ?? (e instanceof Error ? e.message : String(e));
          continue; // la ligne n'est pas passée → ne pas tenter ses médias
        }
      }
      // 2) les médias (la ligne existe côté serveur)
      let restants = 0;
      for (const m of r.data.medias) {
        if (m.uploaded) continue;
        const blob = await getFormBlob(m.id);
        if (!blob) continue; // blob perdu (purge navigateur) : rien à envoyer
        try {
          await uploadFormMedia(r.id, m, blob);
          m.uploaded = true;
          mediasUploaded++;
        } catch (e) {
          restants++;
          firstError = firstError ?? (e instanceof Error ? e.message : String(e));
        }
      }
      // 3) persister l'état, purger si tout est confirmé
      const complet = !r.dirty && restants === 0 && r.data.medias.every((m) => m.uploaded);
      if (complet) await deleteReponseLocale(r.id);
      else await saveReponseLocale(r);
    }

    return {
      pushed,
      mediasUploaded,
      remaining: await countReponsesEnAttente(),
      error: firstError,
    };
  } finally {
    syncing = false;
  }
}

async function uploadFormMedia(
  reponseId: string,
  meta: MediaMeta,
  blob: Blob,
): Promise<void> {
  const fd = new FormData();
  fd.set("mediaId", meta.id);
  fd.set("reponseId", reponseId);
  fd.set("type", meta.type);
  fd.set("mimeType", meta.mimeType);
  fd.set("file", blob, meta.id);
  const res = await fetch("/api/formulaires/media", { method: "POST", body: fd });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Envoi du média refusé (${res.status})`);
  }
}
