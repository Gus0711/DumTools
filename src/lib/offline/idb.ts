"use client";

/**
 * Wrapper IndexedDB minimal, sans dépendance (pas de Dexie/idb pour l'instant :
 * on maîtrise le peu qu'on utilise). Base unique `dumtools-offline` partagée par
 * tous les îlots local-first (mise en service aujourd'hui, visites demain).
 *
 * IndexedDB fonctionne en HTTP simple (pas besoin de contexte sécurisé), donc
 * tout le cœur local-first est testable en dev sur le LAN via le toggle
 * « offline » des DevTools — contrairement au service worker (HTTPS requis).
 */

const DB_NAME = "dumtools-offline";
const DB_VERSION = 3;

/** Stores de la base. Ajouter un store = incrémenter DB_VERSION + le créer dans onupgradeneeded. */
export const STORES = {
  /** Snapshot local d'un projet de mise en service (clé = projetId). */
  mesProjects: "mes-projects",
  /** File de mutations de mise en service à rejouer (clé auto-incrémentée). */
  mesQueue: "mes-queue",
  /** Visites de chantier locales (clé = id UUID client). Voir visites.ts. */
  visites: "visites",
  /** Blobs médias des visites — photos/audio (clé = mediaId UUID client). */
  visiteBlobs: "visite-blobs",
  /** Caches divers de l'outil visites (clé = nom du cache, ex. « affaires »). */
  visitesCache: "visites-cache",
  /** Réponses de formulaire locales (clé = id UUID client). Voir formulaires.ts. */
  formReponses: "form-reponses",
  /** Blobs médias des réponses — photos/signatures (clé = mediaId UUID client). */
  formBlobs: "form-blobs",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible dans cet environnement"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.mesProjects)) {
        db.createObjectStore(STORES.mesProjects, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.mesQueue)) {
        db.createObjectStore(STORES.mesQueue, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.visites)) {
        db.createObjectStore(STORES.visites, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.visiteBlobs)) {
        db.createObjectStore(STORES.visiteBlobs, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.visitesCache)) {
        db.createObjectStore(STORES.visitesCache, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.formReponses)) {
        db.createObjectStore(STORES.formReponses, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.formBlobs)) {
        db.createObjectStore(STORES.formBlobs, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return run<T | undefined>(store, "readonly", (s) => s.get(key));
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.getAll());
}

/** put (clé dans l'objet via keyPath). Retourne la clé. */
export function idbPut<T>(store: string, value: T): Promise<IDBValidKey> {
  return run<IDBValidKey>(store, "readwrite", (s) => s.put(value as unknown as Record<string, unknown>));
}

/** add (insertion, échoue si clé existe). Utile pour les stores auto-incrémentés. */
export function idbAdd<T>(store: string, value: T): Promise<IDBValidKey> {
  return run<IDBValidKey>(store, "readwrite", (s) => s.add(value as unknown as Record<string, unknown>));
}

export function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  return run<undefined>(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
}
