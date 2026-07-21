"use client";

/**
 * Briques de capture média de l'îlot terrain (100 % hors-ligne) :
 *  - photo « live » : <input capture> ouvre directement l'appareil photo sur
 *    mobile, compression canvas (~1600 px JPEG) avant stockage en blob IndexedDB ;
 *  - note vocale : MediaRecorder, stockée en fichier audio (webm/opus sur
 *    Android, mp4 sur iOS) — la transcription viendra plus tard, côté serveur ;
 *  - affichage : vignettes / lecteurs branchés sur le blob local (offline),
 *    avec repli sur la route serveur /api/visites/media/[id].
 */

import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Square, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getMediaBlob } from "@/lib/offline/visites";
import type { MediaMeta } from "./model";

// --- Compression photo -----------------------------------------------------------

const PHOTO_MAX_PX = 1600;
const PHOTO_QUALITE = 0.82;

/** Compresse une photo côté client (économie de data mobile ET de quota
 *  IndexedDB). Repli sur l'original si le décodage échoue (format exotique). */
export async function compresserPhoto(file: File): Promise<{ blob: Blob; mimeType: string }> {
  try {
    // `from-image` : respecte l'orientation EXIF (photos téléphone en portrait).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d indisponible");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITE),
    );
    if (!blob) throw new Error("toBlob a échoué");
    return { blob, mimeType: "image/jpeg" };
  } catch {
    return { blob: file, mimeType: file.type || "image/jpeg" };
  }
}

/** Bouton photo : ouvre l'appareil photo (mobile) ou le sélecteur de fichier (PC). */
export function PhotoButton({
  onPhoto,
  compact = false,
}: {
  onPhoto: (photo: { blob: Blob; mimeType: string }) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50",
          compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
        )}
      >
        <Camera className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {busy ? "…" : "Photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // permet de reprendre la même photo deux fois
          if (!f) return;
          setBusy(true);
          void compresserPhoto(f)
            .then(onPhoto)
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}

// --- Enregistreur de note vocale ---------------------------------------------------

/** Meilleur conteneur audio supporté (webm/opus sur Chrome/Android, mp4 sur iOS). */
function meilleurMimeAudio(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const c of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "";
}

export function AudioRecorderButton({
  onAudio,
  compact = false,
}: {
  onAudio: (audio: { blob: Blob; mimeType: string; dureeSec: number }) => void;
  compact?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const [erreur, setErreur] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filet de sécurité : couper micro + timer si le composant disparaît.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function demarrer() {
    setErreur("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErreur("Micro refusé — autoriser le micro dans les réglages du navigateur.");
      return;
    }
    const mimeType = meilleurMimeAudio();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    let duree = 0;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size > 0) onAudio({ blob, mimeType: type, dureeSec: duree });
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setSecondes(0);
    timerRef.current = setInterval(() => {
      duree += 1;
      setSecondes(duree);
    }, 1000);
  }

  function arreter() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => (recording ? arreter() : void demarrer())}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors",
          compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
          recording
            ? "border-danger/45 bg-danger/15 text-danger"
            : "border-border bg-surface text-fg hover:bg-surface-2",
        )}
      >
        {recording ? (
          <>
            <Square className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {formatDuree(secondes)} — stop
          </>
        ) : (
          <>
            <Mic className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            Vocal
          </>
        )}
      </button>
      {erreur && <span className="text-xs text-danger">{erreur}</span>}
    </span>
  );
}

export function formatDuree(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- Affichage des médias (blob local d'abord, serveur en repli) --------------------

/** URL affichable d'un média : blob IndexedDB si présent (offline), sinon la
 *  route serveur. Révoque l'object URL au démontage. */
export function useMediaUrl(mediaId: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    void getMediaBlob(mediaId)
      .then((blob) => {
        if (!alive) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        } else {
          setUrl(`/api/visites/media/${mediaId}`);
        }
      })
      .catch(() => {
        if (alive) setUrl(`/api/visites/media/${mediaId}`);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  return url;
}

export function PhotoThumb({
  media,
  onOpen,
  onDelete,
  size = "md",
}: {
  media: MediaMeta;
  onOpen?: (url: string) => void;
  onDelete?: () => void;
  size?: "sm" | "md";
}) {
  const url = useMediaUrl(media.id);
  const px = size === "sm" ? "h-14 w-14" : "h-20 w-20";
  return (
    <span className={cn("group relative inline-block shrink-0 overflow-hidden rounded-md border border-border bg-surface-2", px)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob/objectURL local, next/image inutilisable ici
        <img
          src={url}
          alt="Photo de visite"
          onClick={() => onOpen?.(url)}
          className="h-full w-full cursor-zoom-in object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-subtle">
          <Camera className="h-4 w-4" />
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Supprimer la photo"
          className="absolute right-0.5 top-0.5 rounded bg-black/55 p-0.5 text-white opacity-80 hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      {!media.uploaded && (
        <span
          title="Pas encore synchronisée"
          className="absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[10px] leading-4 text-white"
        >
          ⏳
        </span>
      )}
    </span>
  );
}

export function AudioChip({
  media,
  onDelete,
}: {
  media: MediaMeta;
  onDelete?: () => void;
}) {
  const url = useMediaUrl(media.id);
  return (
    <span className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
      <Mic className="h-3.5 w-3.5 shrink-0 text-subtle" />
      {url ? (
        <audio controls preload="metadata" src={url} className="h-8 min-w-0 flex-1" />
      ) : (
        <span className="flex-1 text-xs text-subtle">Chargement…</span>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {media.dureeSec != null ? formatDuree(media.dureeSec) : ""}
        {!media.uploaded && " ⏳"}
      </span>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Supprimer la note vocale"
          className="shrink-0 rounded p-1 text-subtle hover:bg-surface-2 hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

/** Visionneuse plein écran très simple (fonctionne hors-ligne, aucun portail). */
export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- objectURL local */}
      <img src={url} alt="Photo de visite" className="max-h-full max-w-full rounded-md object-contain" />
    </div>
  );
}
