"use client";

import { useSyncExternalStore } from "react";
import { FoldHorizontal, RectangleHorizontal, UnfoldHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/* =============================================================================
 * LARGEUR DES DOCUMENTS — « Lecture » / « Confort » / « Pleine »
 *
 * Même patron que le réglage de densité (localStorage + attribut sur <html> +
 * script anti-flash du layout racine), pour la même raison : deux besoins
 * s'opposent et on ne veut pas arbitrer à la place des gens. Une ligne de prose
 * se lit mal au-delà de ~75 caractères ; une table de données typée, elle,
 * étouffe dans une colonne étroite. Le curseur tranche selon ce qu'on écrit.
 *
 * L'attribut data-largeur pilote --doc-max (étage sémantique) ; seule la feuille
 * d'un document le lit — les écrans de liste gardent leur largeur propre.
 * ========================================================================== */

export type Largeur = "lecture" | "confort" | "pleine";

const KEY = "dumtools-largeur";
const EVT = "dumtools-largeur-change";

const OPTIONS: { valeur: Largeur; titre: string; Icone: typeof FoldHorizontal }[] = [
  {
    valeur: "lecture",
    titre: "Largeur lecture — colonne étroite, confortable pour du texte suivi",
    Icone: FoldHorizontal,
  },
  {
    valeur: "confort",
    titre: "Largeur confort — de l'air sans avoir à balayer l'écran",
    Icone: RectangleHorizontal,
  },
  {
    valeur: "pleine",
    titre: "Pleine largeur — pour les tableaux et les listes de points",
    Icone: UnfoldHorizontal,
  },
];

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVT, onChange);
  };
}

function getSnapshot(): Largeur {
  const v = document.documentElement.getAttribute("data-largeur");
  return v === "lecture" || v === "pleine" ? v : "confort";
}

export function LargeurToggle({ className }: { className?: string }) {
  // Rendu serveur : on annonce « confort », le défaut de l'étage sémantique.
  const largeur = useSyncExternalStore(subscribe, getSnapshot, () => "confort" as Largeur);

  function choisir(valeur: Largeur) {
    document.documentElement.setAttribute("data-largeur", valeur);
    localStorage.setItem(KEY, valeur);
    window.dispatchEvent(new Event(EVT));
  }

  return (
    <div
      role="group"
      aria-label="Largeur du document"
      className={cn(
        "hidden items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5 lg:inline-flex",
        className,
      )}
    >
      {OPTIONS.map(({ valeur, titre, Icone }) => (
        <button
          key={valeur}
          type="button"
          onClick={() => choisir(valeur)}
          title={titre}
          aria-label={titre}
          aria-pressed={largeur === valeur}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-150",
            largeur === valeur ? "bg-surface text-fg shadow-sm" : "text-subtle hover:text-fg",
          )}
        >
          <Icone className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
