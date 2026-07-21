"use client";

/**
 * Store local-first de la MISE EN SERVICE (offline-first).
 *
 * Principe : l'écran écrit TOUJOURS en local d'abord (IndexedDB, instantané) et
 * enfile une mutation. Au retour réseau, la file est rejouée vers l'action fine
 * `enregistrerTestsPoints` (idempotente). Rien n'est retiré de la file avant la
 * confirmation serveur → on ne perd jamais une saisie terrain.
 */

import { idbGet, idbPut, idbAdd, idbGetAll, idbDelete, STORES } from "./idb";
import { enregistrerTestsPoints } from "@/tools/affectation-es/actions";

/** Sous-ensemble d'un point suffisant pour tester hors-ligne (affichage + saisie). */
export type MesPoint = {
  uid: string;
  repere?: string;
  designation: string;
  /** Texte libre saisi dans la liste de points (précision pour le technicien). */
  source?: string;
  module: number | null;
  channel: number | null;
  direction: "input" | "output";
  testStatus?: string;
  testComment?: string;
};

/** Snapshot local d'un projet (source de rendu quand hors-ligne). */
export type MesSnapshot = {
  id: string;
  nom: string;
  points: MesPoint[];
  hydratedAt: number;
};

/** Mutation en attente de synchro. `ts` sert au « dernier gagne » par uid. */
export type MesMutation = {
  id?: number;
  projetId: string;
  uid: string;
  testStatus?: string;
  testComment?: string;
  ts: number;
};

// --- Lecture -----------------------------------------------------------------

export function getLocalSnapshot(projetId: string): Promise<MesSnapshot | undefined> {
  return idbGet<MesSnapshot>(STORES.mesProjects, projetId);
}

async function allPending(): Promise<MesMutation[]> {
  return idbGetAll<MesMutation>(STORES.mesQueue);
}

export async function countPending(): Promise<number> {
  return (await allPending()).length;
}

export async function countPendingForProject(projetId: string): Promise<number> {
  return (await allPending()).filter((m) => m.projetId === projetId).length;
}

// --- Hydratation (en ligne, à l'ouverture) -----------------------------------

/**
 * Écrit le snapshot serveur en local, mais **le local gagne** : on réapplique
 * par-dessus les mutations encore en attente (le terrain n'a pas encore été
 * confirmé côté serveur, il ne doit pas être écrasé par une valeur périmée).
 */
export async function hydrate(snapshot: {
  id: string;
  nom: string;
  points: MesPoint[];
}): Promise<MesSnapshot> {
  const pending = (await allPending())
    .filter((m) => m.projetId === snapshot.id)
    .sort((a, b) => a.ts - b.ts);
  const patchByUid = new Map<string, { testStatus?: string; testComment?: string }>();
  for (const m of pending) {
    const prev = patchByUid.get(m.uid) ?? {};
    if (m.testStatus !== undefined) prev.testStatus = m.testStatus;
    if (m.testComment !== undefined) prev.testComment = m.testComment;
    patchByUid.set(m.uid, prev);
  }
  const points = snapshot.points.map((p) => {
    const patch = patchByUid.get(p.uid);
    return patch ? { ...p, ...patch } : p;
  });
  const stored: MesSnapshot = { id: snapshot.id, nom: snapshot.nom, points, hydratedAt: nowTs() };
  await idbPut(STORES.mesProjects, stored);
  return stored;
}

// --- Écriture locale (optimiste) ---------------------------------------------

/** Applique une modif en local (snapshot) et l'enfile pour synchro. */
export async function writeLocal(
  projetId: string,
  uid: string,
  patch: { testStatus?: string; testComment?: string },
): Promise<MesSnapshot | undefined> {
  const snap = await getLocalSnapshot(projetId);
  if (snap) {
    snap.points = snap.points.map((p) => (p.uid === uid ? { ...p, ...patch } : p));
    await idbPut(STORES.mesProjects, snap);
  }
  const mutation: MesMutation = { projetId, uid, ...patch, ts: nowTs() };
  await idbAdd(STORES.mesQueue, mutation);
  return snap;
}

// --- Synchro (rejeu de la file) ----------------------------------------------

let syncing = false;

export type SyncResult = { synced: number; remaining: number; error?: string };

/**
 * Rejoue la file vers le serveur. Regroupe par projet, réduit à la dernière
 * valeur par uid, appelle l'action fine, et ne supprime les entrées qu'APRÈS
 * confirmation. Sûr à rappeler (verrou anti-réentrance).
 */
export async function syncPending(): Promise<SyncResult> {
  if (syncing) return { synced: 0, remaining: await countPending() };
  syncing = true;
  try {
    const pending = (await allPending()).filter((m) => m.id !== undefined);
    if (pending.length === 0) return { synced: 0, remaining: 0 };

    // Regroupe par projet.
    const byProject = new Map<string, MesMutation[]>();
    for (const m of pending) {
      const arr = byProject.get(m.projetId) ?? [];
      arr.push(m);
      byProject.set(m.projetId, arr);
    }

    let synced = 0;
    let firstError: string | undefined;

    for (const [projetId, muts] of byProject) {
      // Réduit à la dernière valeur par uid (dernier gagne).
      const sorted = [...muts].sort((a, b) => a.ts - b.ts);
      const latest = new Map<string, { testStatus?: string; testComment?: string }>();
      for (const m of sorted) {
        const prev = latest.get(m.uid) ?? {};
        if (m.testStatus !== undefined) prev.testStatus = m.testStatus;
        if (m.testComment !== undefined) prev.testComment = m.testComment;
        latest.set(m.uid, prev);
      }
      const updates = [...latest.entries()].map(([uid, patch]) => ({ uid, ...patch }));

      try {
        await enregistrerTestsPoints(projetId, updates);
        // Succès → on supprime uniquement les entrées de ce projet.
        for (const m of muts) {
          if (m.id !== undefined) await idbDelete(STORES.mesQueue, m.id);
        }
        synced += muts.length;
      } catch (e) {
        // Échec (offline, session expirée…) : on garde la file intacte.
        firstError = firstError ?? (e instanceof Error ? e.message : String(e));
      }
    }

    return { synced, remaining: await countPending(), error: firstError };
  } finally {
    syncing = false;
  }
}

// Horodatage monotone-ish sans dépendre d'un ordre d'appel fin.
function nowTs(): number {
  return Date.now();
}
