import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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
 * ⚠️ RESTE (non bloquant) :
 *   1. Upload par SESSION CHUNKÉE pour les très gros fichiers (500 Mo) — le POST
 *      /upload direct est validé sur petit fichier ; à durcir pour le streaming.
 *   2. Thumbnail natif (has_thumbnail existe) — exposer l'URL de vignette.
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

/** Téléverse un fichier depuis un chemin local (spool) vers un dossier kDrive.
 *  Renvoie l'entrée créée (dont l'id = kdriveFileId).
 *  SPIKE : pour >1 Mo, basculer sur l'upload par session chunkée. */
export async function uploadFile(opts: {
  dirId: string;
  fileName: string;
  filePath: string;
  conflict: Conflict;
  mimeType?: string;
}): Promise<KdriveEntry> {
  const c = config();
  const { size } = await stat(opts.filePath);
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
