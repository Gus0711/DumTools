"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Briefcase, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/ui";

export interface AffaireOption {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string | null;
}

/**
 * Bouton + menu de recherche d'affaire (mode « affaire d'abord »). Sur choix,
 * appelle `onChoisir(id)`. Partagé par la création d'un projet (index) et le
 * rattachement d'un orphelin (éditeur).
 */
export function SelecteurAffaire({
  affaires,
  onChoisir,
  pending = false,
  triggerLabel,
  triggerIcon,
  triggerVariant = "primary",
  triggerSize = "md",
  align = "right",
}: {
  affaires: AffaireOption[];
  onChoisir: (id: string) => void;
  pending?: boolean;
  triggerLabel: string;
  triggerIcon?: ReactNode;
  triggerVariant?: "primary" | "outline";
  triggerSize?: "sm" | "md";
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s
      ? affaires.filter((a) =>
          `${a.nom} ${a.clientNom} ${a.numeroWhy ?? ""}`.toLowerCase().includes(s),
        )
      : affaires;
    return base.slice(0, 50);
  }, [q, affaires]);

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : triggerIcon}
        {triggerLabel}
      </Button>

      {open && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-2 w-80 rounded-lg border border-border bg-surface shadow-lg`}
        >
          <div className="border-b border-border-soft p-2">
            <div className="flex items-center gap-2 rounded-md border border-border px-2">
              <Search className="h-4 w-4 shrink-0 text-subtle" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher une affaire…"
                className="w-full bg-transparent py-1.5 text-sm text-fg outline-none placeholder:text-subtle"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">Aucune affaire trouvée.</p>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    onChoisir(a.id);
                  }}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-50"
                >
                  <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{a.nom}</span>
                    <span className="block truncate text-xs text-muted">
                      {a.clientNom}
                      {a.numeroWhy ? ` · ${a.numeroWhy}` : ""}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-border-soft p-1">
            <Link
              href="/affaires"
              className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-brand hover:bg-surface-2"
            >
              <Plus className="h-4 w-4" /> Créer une nouvelle affaire
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
