"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, MoreHorizontal, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/ui";
import { LargeurToggle } from "@/components/largeur-toggle";
import type { EtatSauvegarde } from "./use-sauvegarde-document";

/* Coquille d'un éditeur de document riche — la mise en page commune aux Notes
 * et au Wiki.
 *
 * Elle existe pour une raison précise : les deux écrans avaient DIVERGÉ. Le
 * wiki avait perdu la gouttière (22 px de décalage entre son titre et son
 * texte sur desktop, 38 px sur téléphone), la feuille, et le filet de signal.
 * Rien de tout cela n'était une décision — juste deux copies qui ont vécu leur
 * vie. Ici, il n'y a plus qu'un seul jeu de valeurs.
 *
 * Le vocabulaire est celui de la charte :
 *   - la BARRE DE CHROME, collée en haut, annonce où l'on est et ce qu'on peut
 *     faire ;
 *   - le document est une FEUILLE (`.bloc`) posée sur le plan de travail, coiffée
 *     du filet de signal de l'outil ;
 *   - la GOUTTIÈRE (`.note-gouttiere`) reprend au pixel le retrait que BlockNote
 *     réserve à ses poignées de bloc, pour que le titre se cale sur le texte.
 *     Tout ce qui vit hors de l'éditeur doit la traverser — c'est le rôle de
 *     `entete`. */

export interface CoquilleEditeurProps {
  /** Classe de signal de l'outil (`signal-ao` pour les Notes, `signal-com`
   *  pour le Wiki) : elle réécrit `--signal` pour tout le sous-arbre. */
  classeSignal: string;
  /** Gauche de la barre de chrome : retour, fil d'Ariane, repères. */
  fil: ReactNode;
  /** Droite de la barre de chrome : état, partage, aperçu, menu. */
  actions: ReactNode;
  /** Titre et métadonnées — rendus DANS la gouttière, donc alignés au texte. */
  entete: ReactNode;
  /** L'éditeur BlockNote (déjà enveloppé de ses providers par l'outil). */
  children: ReactNode;
  /** Sommaire flottant, hors feuille. */
  sommaire?: ReactNode;
}

export function CoquilleEditeur({
  classeSignal,
  fil,
  actions,
  entete,
  children,
  sommaire,
}: CoquilleEditeurProps) {
  return (
    <div className="relative">
      {/* ---- Barre de chrome (collée) ----------------------------------------
              Elle suit la largeur de la feuille (--doc-max) : ses repères
              restent à l'aplomb du document, quel que soit le réglage. */}
      <div className="sticky top-0 z-30 border-b border-border-soft bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[var(--doc-max)] items-center gap-2 px-4 py-2 md:px-8">
          {fil}
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            {/* Le réglage de largeur vit ICI et pas dans la barre de chrome
                globale : il n'agit que sur une feuille de document, et on veut
                en voir l'effet à l'instant où on clique. La préférence, elle,
                est bien globale (localStorage) — elle vaut pour toutes les
                notes et toutes les pages, comme la densité. */}
            <LargeurToggle />
          </span>
        </div>
      </div>

      {/* ---- Document --------------------------------------------------------- */}
      <div className="mx-auto max-w-[var(--doc-max)] px-3 pb-16 pt-5 md:px-6 md:pt-6">
        <article className={`bloc ${classeSignal} relative overflow-hidden pb-4 pt-7`}>
          <span aria-hidden className="bg-signal absolute inset-x-0 top-0 h-[3px]" />
          <div className="note-gouttiere">{entete}</div>
          <div className="note-doc">{children}</div>
        </article>
      </div>

      {sommaire}
    </div>
  );
}

/* --- Bandeaux ---------------------------------------------------------------- */

/** Bandeau d'alerte dans la gouttière (conflit, échec de suppression…). */
export function BandeauAlerte({ children }: { children: ReactNode }) {
  return (
    <div className="anim-note-pop mb-4 flex items-center gap-2 rounded-lg border border-danger/45 bg-danger/10 px-4 py-2.5 text-sm text-danger">
      <TriangleAlert className="h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}

/**
 * Bandeau de conflit d'édition — le seul état dont on ne se remet pas sans
 * recharger : dès qu'un save est refusé, l'éditeur cesse d'écrire pour ne pas
 * écraser le travail du collègue qui est passé avant.
 */
export function BandeauConflit({ phrase }: { phrase: string }) {
  return (
    <BandeauAlerte>
      <span className="flex-1">
        {phrase} Vos dernières modifications ne sont <strong>pas enregistrées</strong> — rechargez
        pour repartir de la version à jour.
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => window.location.reload()}
      >
        Recharger
      </Button>
    </BandeauAlerte>
  );
}

/* --- État de sauvegarde -------------------------------------------------------
 * Discret quand tout va bien (texte gris + coche), voyant quand ça casse :
 * l'erreur réseau devient un bouton « Réessayer », le conflit reste en rouge. */

function fmtHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateHeure(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} à ${fmtHeure(iso)}`;
}

export function IndicateurSauvegarde({
  etat,
  dateModif,
  onReessayer,
}: {
  etat: EtatSauvegarde;
  dateModif: string;
  onReessayer: () => void;
}) {
  if (etat === "conflit") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger">
        <TriangleAlert className="h-3.5 w-3.5" /> Conflit
      </span>
    );
  }
  if (etat === "erreur") {
    return (
      <button
        type="button"
        onClick={onReessayer}
        className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/25"
        title="La sauvegarde a échoué — cliquer pour réessayer"
      >
        <TriangleAlert className="h-3.5 w-3.5" /> Non enregistré
        <span className="inline-flex items-center gap-1 border-l border-danger/30 pl-1.5">
          <RefreshCw className="h-3 w-3" /> Réessayer
        </span>
      </button>
    );
  }
  if (etat === "encours") {
    return (
      <span className="inline-flex items-center gap-1 px-1 text-xs font-medium text-subtle">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-1 text-xs font-medium text-subtle"
      title={`Dernier enregistrement le ${fmtDateHeure(dateModif)}`}
    >
      <Check className="h-3.5 w-3.5 text-success" /> Enregistré
      <span className="hidden tabular-nums lg:inline">· {fmtHeure(dateModif)}</span>
    </span>
  );
}

/* --- Menu « ⋯ » ---------------------------------------------------------------
 * Les actions destructrices vivent ici, en deux temps (pas de confirm() natif) :
 * « Supprimer » → volet de confirmation explicite dans le même menu. */

export function MenuDocument({
  deleting,
  onSupprimer,
  libelleSupprimer,
  avertissement,
}: {
  deleting: boolean;
  onSupprimer: () => void;
  /** « Supprimer la note », « Supprimer la page ». */
  libelleSupprimer: string;
  /** Ce qui disparaît vraiment, dit en clair avant de confirmer. */
  avertissement: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fermer = () => {
      setOpen(false);
      setConfirme(false);
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

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen((o) => !o);
          setConfirme(false);
        }}
        aria-label="Plus d'actions"
        aria-expanded={open}
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </Button>

      {open && (
        <div className="anim-note-pop absolute right-0 z-40 mt-2 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
          {!confirme ? (
            <button
              type="button"
              onClick={() => setConfirme(true)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4 shrink-0" /> {libelleSupprimer}
            </button>
          ) : (
            <div className="p-1.5">
              <p className="mb-2 text-xs text-muted">{avertissement}</p>
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirme(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={deleting}
                  onClick={() => {
                    setOpen(false);
                    setConfirme(false);
                    onSupprimer();
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Supprimer
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
