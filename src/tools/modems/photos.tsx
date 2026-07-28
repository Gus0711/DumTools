"use client";

/**
 * Photos de scan — capture et affichage.
 *
 * Deux sources, choisies automatiquement :
 *  - **caméra du scanner déjà ouverte** → on capture la frame courante du flux.
 *    Instantané, aucun changement d'écran : on enchaîne scan → photo → scan sans
 *    jamais quitter la page. C'est le cas nominal en local technique.
 *  - **caméra arrêtée** → `<input capture>` ouvre l'appareil photo du téléphone
 *    (cadrage, mise au point, zoom), au prix de deux écrans de plus.
 *
 * Dans les deux cas la photo est compressée (~1600 px JPEG) avant l'envoi :
 * économie de data mobile, et une photo de plaque n'a pas besoin de 12 Mpx.
 */

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { compresserPhoto } from "@/tools/visites/capture";

export const PHOTO_MAX_PX = 1600;
export const PHOTO_QUALITE = 0.82;

/** Photo telle que suivie côté client : `url` est l'aperçu local immédiat
 *  (objectURL) tant que l'envoi n'est pas confirmé. */
export interface PhotoLigne {
  id: string;
  /** Aperçu local avant/pendant l'envoi. Absent → on lit la route serveur. */
  url?: string;
  /** Envoi en cours ou en attente de l'id réel du scan. */
  enAttente?: boolean;
  /** L'envoi a échoué : la vignette le signale, un clic réessaie. */
  echec?: boolean;
}

/** URL d'affichage : aperçu local si présent (instantané), sinon route servie. */
export function urlPhoto(p: PhotoLigne): string {
  return p.url ?? `/api/scans/media/${p.id}`;
}

/**
 * Capture la frame courante du flux caméra. Retourne `null` si la vidéo n'a pas
 * encore de dimensions (flux pas prêt) — l'appelant retombe alors sur l'appareil
 * photo natif plutôt que d'enregistrer une image vide.
 */
export async function capturerDepuisVideo(
  video: HTMLVideoElement,
): Promise<{ blob: Blob; mimeType: string } | null> {
  const l0 = video.videoWidth;
  const h0 = video.videoHeight;
  if (!l0 || !h0) return null;

  const echelle = Math.min(1, PHOTO_MAX_PX / Math.max(l0, h0));
  const l = Math.max(1, Math.round(l0 * echelle));
  const h = Math.max(1, Math.round(h0 * echelle));

  const canvas = document.createElement("canvas");
  canvas.width = l;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, l, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITE),
  );
  return blob ? { blob, mimeType: "image/jpeg" } : null;
}

/** Champ fichier caché + déclencheur : l'appareil photo natif du téléphone. */
export function useAppareilPhotoNatif(
  onPhoto: (p: { blob: Blob; mimeType: string }) => void,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [occupe, setOccupe] = useState(false);

  const champ = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = ""; // permet de reprendre une photo identique
        if (!f) return;
        setOccupe(true);
        void compresserPhoto(f)
          .then(onPhoto)
          .finally(() => setOccupe(false));
      }}
    />
  );

  return { champ, ouvrir: () => inputRef.current?.click(), occupe };
}

/** Visionneuse plein écran. */
export function Visionneuse({
  url,
  onFermer,
  onSupprimer,
}: {
  url: string;
  onFermer: () => void;
  onSupprimer?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={onFermer}
      role="presentation"
    >
      <button
        type="button"
        onClick={onFermer}
        aria-label="Fermer"
        className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white"
      >
        <X className="h-5 w-5" />
      </button>
      {onSupprimer && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSupprimer();
          }}
          aria-label="Supprimer la photo"
          className="absolute left-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-danger"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- objectURL local ou route authentifiée, next/image inutilisable */}
      <img
        src={url}
        alt="Photo de scan"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-md object-contain"
      />
    </div>
  );
}

/**
 * Vignettes d'une ligne + bouton d'ajout. Compact : cette cellule vit dans un
 * tableau déjà large, elle ne doit pas le faire déborder.
 */
export function VignettesPhotos({
  photos,
  onAjouter,
  onOuvrir,
  onReessayer,
  occupe,
}: {
  photos: PhotoLigne[];
  /** Absent = lecture seule (fiche affaire). */
  onAjouter?: () => void;
  onOuvrir: (p: PhotoLigne) => void;
  onReessayer?: (p: PhotoLigne) => void;
  occupe?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {photos.map((p) => (
        <span key={p.id} className="relative inline-block">
          <button
            type="button"
            onClick={() => (p.echec ? onReessayer?.(p) : onOuvrir(p))}
            title={p.echec ? "Envoi échoué — cliquer pour réessayer" : "Agrandir"}
            className={`block h-9 w-9 overflow-hidden rounded border ${
              p.echec ? "border-danger" : "border-border"
            } bg-surface-2`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- objectURL local ou route authentifiée */}
            <img
              src={urlPhoto(p)}
              alt="Photo"
              className={`h-full w-full object-cover ${p.enAttente ? "opacity-50" : ""}`}
            />
          </button>
          {p.enAttente && (
            <Loader2 className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-fg" />
          )}
          {p.echec && (
            <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-white">
              !
            </span>
          )}
        </span>
      ))}

      {onAjouter && (
        <button
          type="button"
          onClick={onAjouter}
          disabled={occupe}
          title="Ajouter une photo"
          className="flex h-9 w-9 items-center justify-center rounded border border-dashed border-border text-subtle hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {occupe ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : photos.length ? (
            <ImagePlus className="h-3.5 w-3.5" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </span>
  );
}
