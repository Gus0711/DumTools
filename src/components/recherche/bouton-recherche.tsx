"use client";

import { Search } from "lucide-react";
import { useShell } from "@/components/app-shell/shell-context";

/**
 * Point d'entrée VISIBLE de la palette ⌘K : tout le monde ne connaît pas le
 * raccourci. Faux champ sur desktop (il annonce le raccourci), simple loupe
 * sur mobile.
 */
export function BoutonRecherche() {
  const { setRechercheOuverte } = useShell();
  return (
    <>
      <button
        type="button"
        onClick={() => setRechercheOuverte(true)}
        className="hidden items-center gap-2 rounded-full border border-border bg-surface-2 py-1.5 pl-3 pr-2 text-sm text-subtle transition-colors hover:border-brand/40 hover:text-fg sm:inline-flex"
      >
        <Search className="h-4 w-4" />
        <span className="pr-6">Rechercher…</span>
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={() => setRechercheOuverte(true)}
        aria-label="Rechercher"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:hidden"
      >
        <Search className="h-4.5 w-4.5" />
      </button>
    </>
  );
}
