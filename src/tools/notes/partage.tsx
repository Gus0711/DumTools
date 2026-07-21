"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ban, Check, Copy, ExternalLink, Globe, Loader2, Share2 } from "lucide-react";
import { Button } from "@/ui";
import { genererJetonPartage, revoquerJetonPartage } from "./actions";

/**
 * Partage public d'une note : pose/révoque le jeton et présente le lien
 * /n/[jeton] (lecture seule, sans connexion — l'app est exposée sur internet
 * via le tunnel Cloudflare, le lien fonctionne donc aussi pour un client).
 * La révocation se confirme en deux temps, dans le même volet.
 */
export function PartageNote({
  noteId,
  jetonInitial,
}: {
  noteId: string;
  jetonInitial: string | null;
}) {
  const [jeton, setJeton] = useState(jetonInitial);
  const [open, setOpen] = useState(false);
  const [copie, setCopie] = useState(false);
  const [confirmeRevocation, setConfirmeRevocation] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fermer = () => {
      setOpen(false);
      setConfirmeRevocation(false);
    };
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const url = jeton ? `${window.location.origin}/n/${jeton}` : "";

  async function copier() {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      /* presse-papier indisponible : l'input reste sélectionnable à la main */
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen((o) => !o);
          setConfirmeRevocation(false);
        }}
        aria-expanded={open}
      >
        {jeton ? <Globe className="h-4 w-4 text-success" /> : <Share2 className="h-4 w-4" />}
        <span className="hidden sm:inline">{jeton ? "Partagée" : "Partager"}</span>
      </Button>

      {open && (
        <div className="anim-note-pop absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center gap-2">
            <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Partage public
            </p>
            <span
              className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium ${
                jeton ? "text-success" : "text-subtle"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${jeton ? "bg-success" : "bg-border"}`}
              />
              {jeton ? "Lien actif" : "Privée"}
            </span>
          </div>

          {jeton ? (
            <>
              <p className="mb-2 text-xs text-muted">
                Toute personne disposant de ce lien peut <strong>lire</strong> la note, sans se
                connecter — y compris depuis l&apos;extérieur de l&apos;entreprise.
              </p>
              <div className="mb-2 flex items-center gap-1.5">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  aria-label="Lien public de la note"
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs text-fg outline-none"
                />
                <Button type="button" variant="outline" size="sm" onClick={copier}>
                  {copie ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  {copie ? "Copié !" : "Copier"}
                </Button>
              </div>

              {confirmeRevocation ? (
                <div className="rounded-md border border-danger/40 bg-danger/10 p-2">
                  <p className="mb-2 text-xs text-danger">
                    Le lien cessera de fonctionner immédiatement, pour tous ceux qui l&apos;ont
                    reçu.
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmeRevocation(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await revoquerJetonPartage(noteId);
                          setJeton(null);
                          setConfirmeRevocation(false);
                        })
                      }
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                      Révoquer
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ouvrir la vue publique
                  </a>
                  <button
                    type="button"
                    onClick={() => setConfirmeRevocation(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    <Ban className="h-3.5 w-3.5" /> Révoquer le lien
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mb-2.5 text-xs text-muted">
                Crée un lien <strong>public en lecture seule</strong> vers cette note — pratique
                pour un client ou un intervenant extérieur. Le lien est non devinable et révocable
                à tout moment.
              </p>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const j = await genererJetonPartage(noteId);
                    setJeton(j);
                  })
                }
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Créer un lien public
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
