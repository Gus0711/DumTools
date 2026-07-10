import "server-only";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

/* =============================================================================
 * CLIENT BAS NIVEAU kDrive (Infomaniak) — API REST, un seul compte de service.
 *
 * ✅ SPIKE VALIDÉ contre la prod (drive 1231831) — endpoints confirmés en v3 :
 *   - liste enfants : GET  /3/drive/{drive}/files/{dir}/files — pagination par
 *     CURSEUR (enveloppe { data, cursor, has_more }) ; AUCUN param page/per_page
 *     (tout param inconnu → HTTP 422).
 *   - créer dossier : POST /3/drive/{drive}/files/{parent}/directory  { name }
 *   - upload        : POST /3/drive/{drive}/upload?directory_id&file_name&conflict&total_size
 *   - métadonnées   : GET  /3/drive/{drive}/files/{id} → `size` (intégrité) +
 *     `has_thumbnail`, `mime_type`.
 *   - download      : GET  /3/drive/{drive}/files/{id}/download
 *   `account_id` NON requis. conflict = version | rename | error.
 *
 * Upload : direct (≤ SEUIL_CHUNK) ou par SESSION CHUNKÉE au-delà —
 *   start /3/…/upload/session/start → N × /chunk (sha256 par chunk) → /finish,
 *   annulation sur échec (DELETE /2/…/upload/session/{token}).
 *
 * ⚠️ RESTE (non bloquant) :
 *   - Thumbnail natif (has_thumbnail existe) — exposer l'URL de vignette.
 * ========================================================================== */

export interface KdriveEntry {
  id: string;
  name: string;
  type: "dir" | "file";
  size?: number;
}

interface KdriveConfig {
  base: string;
  version: string;
  driveId: string;
  rootDirId: string;
  token: string;
}

/** true si les variables d'environnement kDrive sont présentes. */
export function kdriveConfigured(): boolean {
  return Boolean(
    process.env.KDRIVE_TOKEN &&
      process.env.KDRIVE_DRIVE_ID &&
      process.env.KDRIVE_ROOT_DIR_ID,
  );
}

function config(): KdriveConfig {
  const token = process.env.KDRIVE_TOKEN;
  const driveId = process.env.KDRIVE_DRIVE_ID;
  const rootDirId = process.env.KDRIVE_ROOT_DIR_ID;
  if (!token || !driveId || !rootDirId) {
    throw new Error("kDrive non configuré (KDRIVE_TOKEN/DRIVE_ID/ROOT_DIR_ID manquants)");
  }
  return {
    base: process.env.KDRIVE_API_BASE ?? "https://api.infomaniak.com",
    version: process.env.KDRIVE_API_VERSION ?? "3",
    driveId,
    rootDirId,
    token,
  };
}

/** id du dossier racine `chantier/` sous lequel vit `{année}/{Client}/…`. */
export function rootDirId(): string {
  return config().rootDirId;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const c = config();
  const url = path.startsWith("http") ? path : `${c.base}/${c.version}/drive/${c.driveId}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const corps = await res.text().catch(() => "");
    throw new Error(`kDrive ${res.status} ${res.statusText} — ${corps.slice(0, 300)}`);
  }
  const json = (await res.json()) as { result?: string; data?: T; error?: unknown };
  if (json.result && json.result !== "success") {
    throw new Error(`kDrive erreur API : ${JSON.stringify(json.error).slice(0, 300)}`);
  }
  return (json.data ?? (json as unknown)) as T;
}

interface RawEntry {
  id: number | string;
  name: string;
  type: string;
  size?: number;
}

function toEntry(r: RawEntry): KdriveEntry {
  return {
    id: String(r.id),
    name: r.name,
    type: r.type === "dir" || r.type === "directory" ? "dir" : "file",
    size: r.size,
  };
}

/** Liste les enfants directs d'un dossier. Pagination par CURSEUR (v3) : on
 *  suit `cursor` tant que `has_more`. Aucun param page/per_page (→ 422). */
export async function listChildren(dirId: string): Promise<KdriveEntry[]> {
  const c = config();
  const out: KdriveEntry[] = [];
  let cursor: string | null = null;
  for (;;) {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const url = `${c.base}/${c.version}/drive/${c.driveId}/files/${dirId}/files${qs}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${c.token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const corps = await res.text().catch(() => "");
      throw new Error(`kDrive ${res.status} ${res.statusText} — ${corps.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      data?: RawEntry[];
      cursor?: string | null;
      has_more?: boolean;
    };
    if (Array.isArray(json.data)) out.push(...json.data.map(toEntry));
    if (json.has_more && json.cursor) cursor = json.cursor;
    else break;
  }
  return out;
}

/** Crée un sous-dossier et renvoie son entrée. */
export async function createDir(parentId: string, name: string): Promise<KdriveEntry> {
  const data = await api<RawEntry>(`/files/${parentId}/directory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return toEntry(data);
}

export type Conflict = "version" | "rename" | "error";

export interface UploadOpts {
  dirId: string;
  fileName: string;
  filePath: string;
  conflict: Conflict;
  mimeType?: string;
}

/** Taille d'un chunk (50 Mo — borne haute kDrive). */
const CHUNK_SIZE = 50 * 1024 * 1024;
/** Au-delà de ce seuil, on passe par une session chunkée plutôt que l'upload
 *  direct (plus robuste sur les gros fichiers / connexions instables). */
export const SEUIL_CHUNK = 100 * 1024 * 1024;

/** Téléverse un fichier (spool) vers un dossier kDrive. Bascule automatiquement
 *  sur l'upload par SESSION CHUNKÉE au-delà de SEUIL_CHUNK. Renvoie l'entrée
 *  créée (dont l'id = kdriveFileId). */
export async function uploadFile(opts: UploadOpts): Promise<KdriveEntry> {
  const { size } = await stat(opts.filePath);
  if (size > SEUIL_CHUNK) return uploadFileChunked(opts);
  return uploadFileDirect(opts, size);
}

/** Upload direct (un seul POST /upload) — pour les fichiers ≤ SEUIL_CHUNK. */
async function uploadFileDirect(opts: UploadOpts, size: number): Promise<KdriveEntry> {
  const c = config();
  const params = new URLSearchParams({
    directory_id: opts.dirId,
    file_name: opts.fileName,
    conflict: opts.conflict,
    total_size: String(size),
  });
  const url = `${c.base}/${c.version}/drive/${c.driveId}/upload?${params}`;
  const nodeStream = createReadStream(opts.filePath);
  const res = await fetch(url, {
    method: "POST",
    // @ts-expect-error — duplex requis par Node pour un body en flux.
    duplex: "half",
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": opts.mimeType || "application/octet-stream",
      "Content-Length": String(size),
    },
    body: Readable.toWeb(nodeStream) as unknown as BodyInit,
  });
  if (!res.ok) {
    const corps = await res.text().catch(() => "");
    throw new Error(`kDrive upload ${res.status} — ${corps.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: RawEntry };
  if (!json.data) throw new Error("kDrive upload : réponse sans data");
  return toEntry(json.data);
}

const sha256hex = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Upload par SESSION CHUNKÉE (gros fichiers). Protocole kDrive :
 *  start (annonce taille + total_chunks + total_chunk_hash) → N chunks (chacun
 *  avec son sha256) → finish (re-vérifie le total_chunk_hash). En cas d'échec,
 *  la session est annulée (rien de partiel ne subsiste).
 *  total_chunk_hash = sha256(concat des hex-sha256 de chaque chunk).
 *  `chunkSize` overridable (tests). */
export async function uploadFileChunked(
  opts: UploadOpts & { chunkSize?: number },
): Promise<KdriveEntry> {
  const c = config();
  const taille = CHUNK_SIZE;
  const chunkSize = opts.chunkSize ?? taille;
  const { size: totalSize } = await stat(opts.filePath);

  // Passe 1 : calcul des hachages (par chunk + total) sans tout charger en mémoire.
  const hashes: string[] = [];
  const fh1 = await open(opts.filePath, "r");
  try {
    let pos = 0;
    while (pos < totalSize) {
      const len = Math.min(chunkSize, totalSize - pos);
      const buf = Buffer.allocUnsafe(len);
      const { bytesRead } = await fh1.read(buf, 0, len, pos);
      if (bytesRead <= 0) break;
      hashes.push(sha256hex(buf.subarray(0, bytesRead)));
      pos += bytesRead;
    }
  } finally {
    await fh1.close();
  }
  const totalChunks = hashes.length;
  const totalChunkHash =
    totalChunks > 1 ? sha256hex(Buffer.from(hashes.join(""), "utf8")) : hashes[0];

  // start
  const start = await fetch(`${c.base}/${c.version}/drive/${c.driveId}/upload/session/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      file_name: opts.fileName,
      total_size: totalSize,
      total_chunks: totalChunks,
      conflict: opts.conflict,
      directory_id: Number(opts.dirId),
      total_chunk_hash: `sha256:${totalChunkHash}`,
    }),
  });
  if (!start.ok) {
    throw new Error(`kDrive session/start ${start.status} — ${(await start.text()).slice(0, 300)}`);
  }
  const sj = (await start.json()) as { data?: { token?: string; upload_url?: string } };
  const token = sj.data?.token;
  const uploadUrl = sj.data?.upload_url;
  if (!token || !uploadUrl) throw new Error("kDrive session/start : token/upload_url manquant");

  try {
    // Passe 2 : envoi séquentiel des chunks (chunk_number est 1-based).
    const fh2 = await open(opts.filePath, "r");
    try {
      let pos = 0;
      for (let n = 0; n < totalChunks; n++) {
        const len = Math.min(chunkSize, totalSize - pos);
        const buf = Buffer.allocUnsafe(len);
        const { bytesRead } = await fh2.read(buf, 0, len, pos);
        const chunk = buf.subarray(0, bytesRead);
        const qs = new URLSearchParams({
          chunk_number: String(n + 1),
          chunk_size: String(bytesRead),
          chunk_hash: `sha256:${hashes[n]}`,
        });
        const res = await fetch(
          `${uploadUrl}/${c.version}/drive/${c.driveId}/upload/session/${token}/chunk?${qs}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${c.token}`,
              "Content-Type": "application/octet-stream",
            },
            body: chunk,
          },
        );
        if (!res.ok) {
          throw new Error(`kDrive chunk ${n + 1}/${totalChunks} → ${res.status} — ${(await res.text()).slice(0, 200)}`);
        }
        pos += bytesRead;
      }
    } finally {
      await fh2.close();
    }

    // finish
    const fin = await fetch(`${c.base}/${c.version}/drive/${c.driveId}/upload/session/${token}/finish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ total_chunk_hash: `sha256:${totalChunkHash}` }),
    });
    if (!fin.ok) {
      throw new Error(`kDrive session/finish ${fin.status} — ${(await fin.text()).slice(0, 300)}`);
    }
    const fj = (await fin.json()) as { data?: RawEntry | { file?: RawEntry } };
    const raw = (fj.data as { file?: RawEntry })?.file ?? (fj.data as RawEntry);
    if (!raw?.id) throw new Error("kDrive session/finish : réponse sans fichier");
    return toEntry(raw);
  } catch (e) {
    // Annule la session pour ne laisser aucun résidu partiel.
    await fetch(`${c.base}/2/drive/${c.driveId}/upload/session/${token}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${c.token}` },
    }).catch(() => {});
    throw e;
  }
}

/** Métadonnées d'un fichier (dont `size` — sert au contrôle d'intégrité). */
export async function getFile(fileId: string): Promise<KdriveEntry> {
  return toEntry(await api<RawEntry>(`/files/${fileId}`));
}

/** Flux de téléchargement d'un fichier (download « maître seul »).
 *  ⚠️ Le download n'existe QU'EN v2 (v3 → 404). Renvoie un 302 vers un hôte de
 *  téléchargement signé que `fetch` suit automatiquement. */
export async function downloadFile(fileId: string): Promise<Response> {
  const c = config();
  const url = `${c.base}/2/drive/${c.driveId}/files/${fileId}/download`;
  return fetch(url, { headers: { Authorization: `Bearer ${c.token}` } });
}
