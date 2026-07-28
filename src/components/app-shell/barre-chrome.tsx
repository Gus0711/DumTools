"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { classeSignal } from "@/tools/registry";
import { teinteDeRoute } from "./nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { DensityToggle } from "@/components/density-toggle";
import { BoutonRecherche } from "@/components/recherche/bouton-recherche";
import { useEcran } from "./contexte-ecran";

/* =============================================================================
 * LA BARRE DE CHROME
 * Bandeau sombre en haut du plan de travail : il dit en permanence où on est
 * (« AFFAIRE ▸ UEHC BETHUNE ▮ En cours »), et porte ce qui n'appartient à
 * aucune page — recherche, réglages d'affichage, session.
 * ========================================================================== */

const TON_PASTILLE = {
  neutre: "bg-white/10 text-chrome-fg",
  brand: "bg-white/12 text-white",
  accent: "bg-chrome-accent/20 text-chrome-accent",
  success: "bg-success/20 text-success",
  danger: "bg-danger/25 text-danger",
} as const;

export function BarreChrome({
  nom,
  role,
  onDeconnexion,
}: {
  nom: string;
  role: string;
  onDeconnexion: () => void;
}) {
  const { ecran } = useEcran();
  const pathname = usePathname();
  const ton = ecran?.etat?.ton ?? "neutre";

  return (
    <header
      className={cn(
        "bg-chrome relative flex h-13 shrink-0 items-center gap-2 border-b border-chrome-border pl-3 pr-2 md:h-12 md:pl-4",
        classeSignal(teinteDeRoute(pathname)),
      )}
    >
      {/* Le filet de l'outil courant, sous la barre. Il se remet sous tension à
          chaque changement de route (la clé force le rejeu) : on sait dans quel
          outil on vient d'entrer avant même d'avoir lu le titre. */}
      <span
        key={pathname}
        aria-hidden
        className="anim-sweep absolute inset-x-0 bottom-0 h-[2px] bg-signal-lift"
      />

      {/* Où suis-je. Le titre reste lisible même quand la page défile. */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        {ecran?.estampille && (
          <>
            <span className="stamp hidden shrink-0 text-signal-lift/85 sm:block">
              {ecran.estampille}
            </span>
            <span aria-hidden className="hidden shrink-0 text-chrome-muted/50 sm:block">
              ▸
            </span>
          </>
        )}
        <span className="min-w-0 truncate font-display text-sm font-semibold text-chrome-fg">
          {ecran?.titre ?? "DumTools"}
        </span>
        {ecran?.etat && (
          <span
            className={cn(
              "hidden shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold sm:inline-flex",
              TON_PASTILLE[ton],
            )}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {ecran.etat.label}
          </span>
        )}
      </div>

      <BoutonRecherche className="w-56 border-chrome-border bg-white/5 text-chrome-muted hover:border-chrome-accent/50 hover:bg-white/10 hover:text-chrome-fg lg:w-72" />

      <span aria-hidden className="mx-1 hidden h-5 w-px bg-chrome-border md:block" />

      <DensityToggle className="hidden border-chrome-border bg-white/5 md:inline-flex" />
      <ThemeToggle className="hidden text-chrome-muted hover:bg-chrome-hover hover:text-chrome-fg md:inline-flex" />

      <span
        title={`${nom} · ${role}`}
        className="bg-chrome-accent text-chrome ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold"
      >
        {initiales(nom)}
      </span>

      {/* Au téléphone, la déconnexion est dans la feuille « Plus » : la barre
          du haut n'a pas la place, et un bouton de sortie sous le pouce est un
          piège. */}
      <form action={onDeconnexion} className="hidden md:block">
        <button
          type="submit"
          aria-label="Se déconnecter"
          title="Se déconnecter"
          className="inline-flex h-9 w-9 items-center justify-center rounded text-chrome-muted transition-colors hover:bg-chrome-hover hover:text-danger"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </header>
  );
}

/** « Augustin Duhant » → « AD ». */
function initiales(nom: string) {
  return nom
    .split(/[\s.@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");
}
