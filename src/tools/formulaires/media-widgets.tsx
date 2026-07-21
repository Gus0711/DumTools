"use client";

// Widgets de capture terrain — photo (avec compression) & signature (canvas PNG).
// Utilisés par le <Renderer/> UNIQUEMENT quand une couche média est fournie
// (remplissage terrain) ; en aperçu builder, le renderer montre un placeholder.
// Le binaire n'est jamais tenu ici : le widget délègue à `media.ajouter` (qui le
// stocke localement en blob IndexedDB, cf. phase 4) et n'échange que des ids.

import { useRef, useState } from "react";
import {
  Camera,
  Loader2,
  Trash2,
  PenLine,
  RotateCcw,
  Check,
  Paperclip,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { TypeMediaChamp } from "./model";

/** Contrat que le remplissage fournit au renderer pour gérer les médias. */
export interface RendererMedia {
  /** Stocke un binaire capturé → id du média. */
  ajouter: (
    champId: string,
    type: TypeMediaChamp,
    blob: Blob,
    mimeType: string,
    nom?: string,
  ) => Promise<string>;
  /** Retire un média (blob local + référence). */
  retirer: (mediaId: string) => void;
  /** URL d'aperçu d'un média (objet URL local, ou route serveur si déjà synchro). */
  url: (mediaId: string) => string | undefined;
}

/** Downscale + JPEG : une photo terrain passe de plusieurs Mo à ~200-400 Ko. */
async function compresserImage(
  file: File,
  maxDim = 1600,
  quality = 0.8,
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality),
    );
  } catch {
    return file; // navigateur sans createImageBitmap : on envoie l'original
  }
}

export function PhotoWidget({
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
  const [occupe, setOccupe] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function choisir(files: FileList | null) {
    if (!files || files.length === 0) return;
    setOccupe(true);
    try {
      const nouveaux: string[] = [];
      for (const file of Array.from(files)) {
        const blob = await compresserImage(file);
        const id = await media.ajouter(champId, "photo", blob, "image/jpeg");
        nouveaux.push(id);
      }
      onChange([...ids, ...nouveaux]);
    } finally {
      setOccupe(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      {ids.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {ids.map((id) => (
            <div
              key={id}
              className="relative h-24 w-24 overflow-hidden rounded-md border border-border bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media.url(id)}
                alt="Photo"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  media.retirer(id);
                  onChange(ids.filter((x) => x !== id));
                }}
                className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white hover:bg-danger"
                title="Retirer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label
        className={cn(
          "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3.5 text-sm font-medium text-fg shadow-sm transition-colors hover:border-brand/40",
          occupe && "pointer-events-none opacity-60",
        )}
      >
        {occupe ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4 text-brand" />
        )}
        {ids.length > 0 ? "Ajouter une photo" : "Prendre une photo"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => choisir(e.target.files)}
        />
      </label>
    </div>
  );
}

export function SignatureWidget({
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dessine = useRef(false);
  const [vide, setVide] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const existante = ids[0];

  function ctx() {
    const c = canvasRef.current;
    return c ? c.getContext("2d") : null;
  }
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function debut(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = ctx();
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
    const g = ctx();
    if (!g) return;
    const { x, y } = pos(e);
    g.lineTo(x, y);
    g.strokeStyle = "#0f172a";
    g.lineWidth = 2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.stroke();
  }
  function fin() {
    dessine.current = false;
  }
  function effacer() {
    const c = canvasRef.current;
    const g = ctx();
    if (c && g) g.clearRect(0, 0, c.width, c.height);
    setVide(true);
  }
  async function valider() {
    const c = canvasRef.current;
    if (!c || vide) return;
    setOccupe(true);
    try {
      const blob = await new Promise<Blob | null>((r) =>
        c.toBlob((b) => r(b), "image/png"),
      );
      if (blob) {
        const id = await media.ajouter(champId, "signature", blob, "image/png");
        onChange([id]);
      }
    } finally {
      setOccupe(false);
    }
  }

  if (existante) {
    return (
      <div className="space-y-2">
        <div className="inline-block rounded-md border border-border bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.url(existante)}
            alt="Signature"
            className="h-24 w-auto"
          />
        </div>
        <div>
          <button
            type="button"
            onClick={() => {
              media.retirer(existante);
              onChange([]);
              setVide(true);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Refaire la signature
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        onPointerDown={debut}
        onPointerMove={trace}
        onPointerUp={fin}
        onPointerLeave={fin}
        className="w-full max-w-md touch-none rounded-md border border-border bg-white"
        style={{ aspectRatio: "3 / 1" }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={valider}
          disabled={vide || occupe}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-brand-fg shadow-sm transition-colors hover:bg-brand-strong disabled:opacity-50"
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
          disabled={vide}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm text-muted hover:text-fg disabled:opacity-40"
        >
          <PenLine className="h-4 w-4" /> Effacer
        </button>
      </div>
    </div>
  );
}

export function PieceJointeWidget({
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
  const [occupe, setOccupe] = useState(false);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function choisir(files: FileList | null) {
    if (!files || files.length === 0) return;
    setOccupe(true);
    try {
      const nouveaux: string[] = [];
      const nmap = { ...noms };
      for (const f of Array.from(files)) {
        const id = await media.ajouter(
          champId,
          "fichier",
          f,
          f.type || "application/octet-stream",
          f.name,
        );
        nouveaux.push(id);
        nmap[id] = f.name;
      }
      setNoms(nmap);
      onChange([...ids, ...nouveaux]);
    } finally {
      setOccupe(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      {ids.length > 0 && (
        <ul className="mb-2 space-y-1">
          {ids.map((id) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-subtle" />
              <a
                href={media.url(id)}
                download={noms[id]}
                className="min-w-0 flex-1 truncate text-fg hover:underline"
              >
                {noms[id] ?? "Fichier joint"}
              </a>
              <button
                type="button"
                onClick={() => {
                  media.retirer(id);
                  onChange(ids.filter((x) => x !== id));
                }}
                className="shrink-0 rounded p-1 text-subtle hover:text-danger"
                title="Retirer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        className={cn(
          "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3.5 text-sm font-medium text-fg shadow-sm transition-colors hover:border-brand/40",
          occupe && "pointer-events-none opacity-60",
        )}
      >
        {occupe ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4 text-brand" />
        )}
        Joindre un fichier
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => choisir(e.target.files)}
        />
      </label>
    </div>
  );
}
