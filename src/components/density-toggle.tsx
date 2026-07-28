"use client";

import { useSyncExternalStore } from "react";
import { AArrowDown, AArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

/* =============================================================================
 * RÉGLAGE DE DENSITÉ — « Confort » / « Compact »
 * Deux publics, un seul écran : ceux qui veulent voir grand et ceux qui veulent
 * voir beaucoup. Plutôt que d'arbitrer à leur place, on donne le curseur.
 * L'attribut data-density pilote --root-size (étage sémantique) : toute
 * l'interface étant en rem, elle suit d'un bloc.
 * ========================================================================== */

type Densite = "confort" | "compact";
const KEY = "dumtools-density";
const EVT = "dumtools-density-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVT, onChange);
  };
}

function getSnapshot(): Densite {
  return document.documentElement.getAttribute("data-density") === "compact"
    ? "compact"
    : "confort";
}

export function DensityToggle({ className }: { className?: string }) {
  // Rendu serveur : on annonce « confort », le défaut de l'étage sémantique.
  const densite = useSyncExternalStore(subscribe, getSnapshot, () => "confort" as Densite);

  function choisir(valeur: Densite) {
    document.documentElement.setAttribute("data-density", valeur);
    localStorage.setItem(KEY, valeur);
    window.dispatchEvent(new Event(EVT));
  }

  return (
    <div
      role="group"
      aria-label="Densité d'affichage"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5",
        className,
      )}
    >
      <Bouton
        actif={densite === "confort"}
        onClick={() => choisir("confort")}
        titre="Affichage confort — texte plus grand, lignes aérées"
      >
        <AArrowUp className="h-4 w-4" />
      </Bouton>
      <Bouton
        actif={densite === "compact"}
        onClick={() => choisir("compact")}
        titre="Affichage compact — plus de lignes à l'écran"
      >
        <AArrowDown className="h-4 w-4" />
      </Bouton>
    </div>
  );
}

function Bouton({
  actif,
  onClick,
  titre,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      aria-pressed={actif}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-150",
        actif
          ? "bg-surface text-fg shadow-sm"
          : "text-subtle hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
