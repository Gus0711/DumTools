"use client";

// Widgets terrain « lourds » de la vague 2 : audio (MediaRecorder), dessin &
// schéma (canvas → PNG), scan code-barres/QR (BarcodeDetector natif + repli
// ZXing, calqué sur l'outil Scanner), référence affaire (Combobox). Utilisés par
// le <Renderer/> quand la couche média / la liste d'affaires sont fournies
// (remplissage terrain) ; en aperçu builder, le renderer montre un placeholder.

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, RotateCcw, Check, Camera, X } from "lucide-react";
import { Combobox } from "@/ui";
import type { RendererMedia } from "./media-widgets";
import type { RefOption, RefValue, ValeurChamp } from "./model";

/* ============================ audio ================================= */

export function AudioWidget({
  champId,
  ids,
  onChange,
  media,
}: {
  champId: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  media: RendererMedia;
}) {
  const [rec, setRec] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const existante = ids[0];

  useEffect(() => {
    return () => {
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function demarrer() {
    setErreur("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        setOccupe(true);
        try {
          const id = await media.ajouter(champId, "audio", blob, blob.type);
          onChange([id]);
        } finally {
          setOccupe(false);
        }
      };
      recRef.current = mr;
      mr.start();
      setRec(true);
    } catch {
      setErreur("Micro indisponible ou refusé (site en HTTPS requis).");
    }
  }

  function arreter() {
    recRef.current?.stop();
    recRef.current = null;
    setRec(false);
  }

  if (existante) {
    return (
      <div className="space-y-2">
        <audio controls src={media.url(existante)} className="w-full max-w-md" />
        <button
          type="button"
          onClick={() => {
            media.retirer(existante);
            onChange([]);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Réenregistrer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rec ? (
        <button
          type="button"
          onClick={arreter}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-danger bg-danger/10 px-3.5 text-sm font-medium text-danger"
        >
          <Square className="h-4 w-4 fill-current" /> Arrêter
          <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-danger" />
        </button>
      ) : (
        <button
          type="button"
          onClick={demarrer}
          disabled={occupe}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3.5 text-sm font-medium text-fg shadow-sm hover:border-brand/40 disabled:opacity-60"
        >
          {occupe ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4 text-brand" />
          )}
          Enregistrer une note vocale
        </button>
      )}
      {erreur && <p className="text-xs text-danger">{erreur}</p>}
    </div>
  );
}

/* ======================== dessin & schéma =========================== */

function CanvasDessin({
  fond,
  exigeTrace,
  occupe,
  onValider,
}: {
  fond?: string;
  exigeTrace: boolean;
  occupe: boolean;
  onValider: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dessine = useRef(false);
  const fondRef = useRef<HTMLImageElement | null>(null);
  const [vide, setVide] = useState(true);

  const dessinerFond = useCallback(() => {
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
    const img = fondRef.current;
    if (img) {
      const scale = Math.min(c.width / img.width, c.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    }
  }, []);

  useEffect(() => {
    dessinerFond();
    if (!fond) return;
    const img = new Image();
    img.onload = () => {
      fondRef.current = img;
      dessinerFond();
    };
    img.src = fond;
  }, [fond, dessinerFond]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }
  function debut(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = canvasRef.current?.getContext("2d");
    if (!g) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dessine.current = true;
    const { x, y } = pos(e);
    g.beginPath();
    g.moveTo(x, y);
    setVide(false);
  }
  function trace(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dessine.current) return;
    const g = canvasRef.current?.getContext("2d");
    if (!g) return;
    const { x, y } = pos(e);
    g.lineTo(x, y);
    g.strokeStyle = "#dc2626";
    g.lineWidth = 3;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.stroke();
  }
  function fin() {
    dessine.current = false;
  }
  function effacer() {
    dessinerFond();
    setVide(true);
  }
  function valider() {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((b) => {
      if (b) onValider(b);
    }, "image/png");
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={640}
        height={fond ? 480 : 360}
        onPointerDown={debut}
        onPointerMove={trace}
        onPointerUp={fin}
        onPointerLeave={fin}
        className="w-full max-w-xl touch-none rounded-md border border-border bg-white"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={valider}
          disabled={occupe || (exigeTrace && vide)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-brand-fg shadow-sm hover:bg-brand-strong disabled:opacity-50"
        >
          {occupe ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Valider
        </button>
        <button
          type="button"
          onClick={effacer}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm text-muted hover:text-fg"
        >
          <RotateCcw className="h-4 w-4" /> Effacer
        </button>
      </div>
    </div>
  );
}

function DessinExistant({
  id,
  onRetirer,
  media,
}: {
  id: string;
  onRetirer: () => void;
  media: RendererMedia;
}) {
  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.url(id)}
        alt="Dessin"
        className="max-h-72 rounded-md border border-border bg-white"
      />
      <button
        type="button"
        onClick={onRetirer}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Refaire
      </button>
    </div>
  );
}

export function DessinWidget({
  champId,
  ids,
  onChange,
  media,
  fond,
}: {
  champId: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  media: RendererMedia;
  /** Plan de fond (schéma) — data URL. Absent = dessin libre. */
  fond?: string;
}) {
  const [occupe, setOccupe] = useState(false);
  const existante = ids[0];
  if (existante)
    return (
      <DessinExistant
        id={existante}
        media={media}
        onRetirer={() => {
          media.retirer(existante);
          onChange([]);
        }}
      />
    );
  return (
    <CanvasDessin
      fond={fond}
      exigeTrace={!fond}
      occupe={occupe}
      onValider={async (blob) => {
        setOccupe(true);
        try {
          const id = await media.ajouter(champId, "dessin", blob, "image/png");
          onChange([id]);
        } finally {
          setOccupe(false);
        }
      }}
    />
  );
}

/* ========================= scan code-barres ========================= */

type CodeDetecte = { rawValue: string; format?: string };
interface DetecteurCodeBarres {
  detect(source: CanvasImageSource): Promise<CodeDetecte[]>;
}
type CtorDetecteur = (new (opts?: {
  formats?: string[];
}) => DetecteurCodeBarres) & {
  getSupportedFormats?: () => Promise<string[]>;
};
type ScannerControls = { stop: () => void };
function getDetecteurNatif(): CtorDetecteur | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { BarcodeDetector?: CtorDetecteur }).BarcodeDetector ??
    null
  );
}

export function ScanCodeWidget({
  valeur,
  onChange,
}: {
  valeur: string;
  onChange: (v: string) => void;
}) {
  const [scan, setScan] = useState(false);
  const [erreur, setErreur] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const scanningRef = useRef(false);
  const boucleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arreter = useCallback(() => {
    scanningRef.current = false;
    if (boucleRef.current) clearTimeout(boucleRef.current);
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScan(false);
  }, []);

  useEffect(() => () => arreter(), [arreter]);

  const trouve = useCallback(
    (code: string) => {
      onChange(code.trim());
      arreter();
    },
    [onChange, arreter],
  );

  const boucleNative = useCallback(
    (detecteur: DetecteurCodeBarres) => {
      const tick = async () => {
        if (!scanningRef.current) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2) {
          try {
            const codes = await detecteur.detect(v);
            if (codes.length && codes[0].rawValue) {
              trouve(codes[0].rawValue);
              return;
            }
          } catch {
            /* frame non décodable */
          }
        }
        if (scanningRef.current) boucleRef.current = setTimeout(tick, 120);
      };
      tick();
    },
    [trouve],
  );

  const demarrer = useCallback(async () => {
    setErreur("");
    try {
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
      scanningRef.current = true;
      setScan(true);

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
            boucleNative(detecteur);
            natifOk = true;
          }
        } catch {
          natifOk = false;
        }
      }
      if (!natifOk) {
        const [{ BrowserMultiFormatReader }] = await Promise.all([
          import("@zxing/browser"),
        ]);
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 100,
        });
        controlsRef.current = await reader.decodeFromStream(
          stream,
          video,
          (result) => {
            if (result) trouve(result.getText());
          },
        );
      }
    } catch {
      setErreur(
        "Caméra indisponible ou refusée (HTTPS requis). Saisis le code à la main ci-dessous.",
      );
      scanningRef.current = false;
      setScan(false);
    }
  }, [boucleNative, trouve]);

  return (
    <div className="space-y-2">
      {scan && (
        <div className="relative max-w-md overflow-hidden rounded-md border border-border bg-black">
          <video ref={videoRef} className="w-full" />
          <button
            type="button"
            onClick={arreter}
            className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white hover:bg-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!scan && (
          <button
            type="button"
            onClick={demarrer}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3.5 text-sm font-medium text-fg shadow-sm hover:border-brand/40"
          >
            <Camera className="h-4 w-4 text-brand" /> Scanner un code
          </button>
        )}
        <input
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder="…ou saisir/coller le code"
          className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>
      {erreur && <p className="text-xs text-danger">{erreur}</p>}
    </div>
  );
}

/* =========================== référence ============================== */

export function ReferenceWidget({
  valeur,
  onChange,
  affaires,
}: {
  valeur: RefValue | null;
  onChange: (v: ValeurChamp) => void;
  affaires: RefOption[];
}) {
  const [texte, setTexte] = useState(valeur?.label ?? "");
  const idParLabel = useRef(new Map(affaires.map((a) => [a.label, a.id])));

  return (
    <Combobox
      value={texte}
      onInput={(v) => {
        setTexte(v);
        if (v.trim() === "") onChange(null);
      }}
      onPick={(o) => {
        setTexte(o.value);
        onChange({ id: idParLabel.current.get(o.value) ?? "", label: o.value });
      }}
      options={affaires.map((a) => ({
        value: a.label,
        tag: a.numeroWhy ?? undefined,
      }))}
      placeholder="Rechercher une affaire…"
      className="max-w-md"
    />
  );
}
