"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd } from "@/ui";
import { useShell } from "@/components/app-shell/shell-context";

/**
 * Point d'entrée VISIBLE de la palette ⌘K : tout le monde ne connaît pas le
 * raccourci. Faux champ sur desktop (il annonce le raccourci), simple loupe
 * sur mobile.
 */
export function BoutonRecherche({ className }: { className?: string }) {
  const { setRechercheOuverte } = useShell();
  return (
    <>
      <button
        type="button"
        onClick={() => setRechercheOuverte(true)}
        className={cn(
          "group hidden h-9 items-center gap-2.5 rounded-md border border-border bg-surface-2 pl-3 pr-2 text-sm text-subtle",
          "transition-[border-color,background-color,color] duration-150",
          "hover:border-brand/45 hover:bg-surface hover:text-fg sm:inline-flex",
          className,
        )}
      >
        <Search className="h-4 w-4 shrink-0 transition-colors group-hover:text-brand" />
        <span className="flex-1 text-left">Rechercher…</span>
        <Kbd className="shrink-0">⌘K</Kbd>
      </button>

      <button
        type="button"
        onClick={() => setRechercheOuverte(true)}
        aria-label="Rechercher"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-chrome-muted transition-colors hover:bg-chrome-hover hover:text-chrome-fg sm:hidden"
      >
        <Search className="h-4.5 w-4.5" />
      </button>
    </>
  );
}
