"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* =============================================================================
 * LE LECTEUR DE CODES — moteur partagé
 *
 * Extrait de l'outil « Scanner » (src/tools/modems) pour être réutilisé par le
 * Magasin : deux écrans, une seule caméra, une seule façon de décoder.
 *
 * Deux moteurs, dans cet ordre :
 *   1. `BarcodeDetector` NATIF quand le navigateur l'expose (Android/Chrome) —
 *      décodage matériel, rapide, économe en batterie ;
 *   2. repli **ZXing** (chargé à la demande, jamais dans le bundle initial)
 *      partout ailleurs, iOS compris.
 *
 * ⚠️ La caméra exige un contexte sécurisé : en HTTP hors localhost, aucun
 * navigateur ne la donnera — c'est une contrainte du web, pas un réglage.
 * ========================================================================== */

/** Contrôles minimaux exposés par @zxing/browser (évite d'importer le type). */
type ScannerControls = { stop: () => void };

/* BarcodeDetector natif (non typé dans lib.dom) — typage minimal local. */
type CodeDetecte = { rawValue: string; format?: string };
interface DetecteurCodeBarres {
  detect(source: CanvasImageSource): Promise<CodeDetecte[]>;
}
type CtorDetecteur = (new (opts?: { formats?: string[] }) => DetecteurCodeBarres) & {
  getSupportedFormats?: () => Promise<string[]>;
};

function getDetecteurNatif(): CtorDetecteur | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: CtorDetecteur }).BarcodeDetector ?? null;
}

export const MESSAGE_CAMERA_REFUSEE =
  "Caméra indisponible ou refusée. Autorise l'accès caméra dans le navigateur (site en HTTPS requis), puis réessaie. Sinon, colle le contenu du code ci-dessous.";

export interface LecteurCode {
  /** À poser sur la balise <video> de l'écran. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scanning: boolean;
  erreur: string;
  /** Nom du moteur retenu, affiché en pied de viseur (diagnostic terrain). */
  moteur: string;
  resolution: string;
  torche: boolean;
  torcheDispo: boolean;
  demarrer: () => Promise<void>;
  arreter: () => void;
  basculerTorche: () => Promise<void>;
  /** Miroir non réactif de `scanning` — pour lire l'état hors rendu (capture
   *  d'une image du flux, par exemple). */
  actifRef: React.RefObject<boolean>;
}

/**
 * @param onCode appelé à chaque code décodé. La déduplication (même code lu 30
 * fois par seconde) est la responsabilité de l'appelant : elle dépend de ce
 * qu'il en fait.
 */
export function useLecteurCode(
  onCode: (valeur: string, format: string | null) => void,
): LecteurCode {
  const [scanning, setScanning] = useState(false);
  const [erreur, setErreur] = useState("");
  const [moteur, setMoteur] = useState("");
  const [resolution, setResolution] = useState("");
  const [torche, setTorche] = useState(false);
  const [torcheDispo, setTorcheDispo] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const boucleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actifRef = useRef(false);

  // Le callback est gardé dans une ref : la boucle de détection ne doit pas se
  // reconstruire (et donc redémarrer la caméra) à chaque rendu de l'écran.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  /** Boucle de détection via BarcodeDetector natif (throttlée). */
  const boucleNative = useCallback((detecteur: DetecteurCodeBarres) => {
    const tick = async () => {
      if (!actifRef.current) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2) {
        try {
          const codes = await detecteur.detect(v);
          if (codes.length && codes[0].rawValue) {
            onCodeRef.current(codes[0].rawValue, codes[0].format ?? null);
          }
        } catch {
          /* frame non décodable : on continue */
        }
      }
      if (actifRef.current) boucleRef.current = setTimeout(tick, 120);
    };
    tick();
  }, []);

  const demarrer = useCallback(async () => {
    setErreur("");
    try {
      // Haute résolution + caméra arrière : indispensable pour un code dense.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      try {
        const caps = track.getCapabilities?.() as
          | (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean })
          | undefined;
        if (caps?.focusMode?.includes("continuous")) {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" }],
          } as unknown as MediaTrackConstraints);
        }
        setTorcheDispo(Boolean(caps?.torch));
      } catch {
        /* capacités non exposées : on ignore */
      }

      actifRef.current = true;
      const Detecteur = getDetecteurNatif();
      let natifOk = false;
      if (Detecteur) {
        try {
          const supportes = (await Detecteur.getSupportedFormats?.()) ?? [];
          const formats = supportes.filter((f) => f && f !== "unknown");
          if (formats.length) {
            const detecteur = new Detecteur({ formats });
            video.srcObject = stream;
            video.setAttribute("playsinline", "true");
            video.muted = true;
            await video.play().catch(() => {});
            setMoteur("BarcodeDetector (natif)");
            boucleNative(detecteur);
            natifOk = true;
          }
        } catch {
          natifOk = false;
        }
      }
      if (!natifOk) {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 100,
        });
        setMoteur("ZXing");
        controlsRef.current = await reader.decodeFromStream(stream, video, (result) => {
          if (result) {
            const fmt = BarcodeFormat[result.getBarcodeFormat()];
            onCodeRef.current(result.getText(), fmt ? fmt.toLowerCase() : null);
          }
        });
      }

      const s = track.getSettings();
      if (s.width && s.height) setResolution(`${s.width}×${s.height}`);
      setScanning(true);
    } catch {
      setErreur(MESSAGE_CAMERA_REFUSEE);
    }
  }, [boucleNative]);

  const arreter = useCallback(() => {
    actifRef.current = false;
    if (boucleRef.current) clearTimeout(boucleRef.current);
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
    setTorche(false);
    setTorcheDispo(false);
  }, []);

  const basculerTorche = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torche }],
      } as unknown as MediaTrackConstraints);
      setTorche((v) => !v);
    } catch {
      /* torche non applicable */
    }
  }, [torche]);

  // Quitter l'écran caméra allumée viderait la batterie en poche.
  useEffect(() => {
    return () => {
      actifRef.current = false;
      if (boucleRef.current) clearTimeout(boucleRef.current);
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    videoRef,
    scanning,
    erreur,
    moteur,
    resolution,
    torche,
    torcheDispo,
    demarrer,
    arreter,
    basculerTorche,
    actifRef,
  };
}
