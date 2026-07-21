"use client";

import { useEffect, useState } from "react";

/* Sommaire flottant de l'éditeur de note — le repère des documents longs.
 *
 * Replié : une pile de petites barres à droite de l'écran (une par titre,
 * largeur selon le niveau), façon minimap. Au survol ou au focus clavier, la
 * pile se déploie en table des matières cliquable ; la section visible est
 * suivie au défilement. Rien n'est rendu sous 2 titres ou sous 1280px de large
 * (le rail chevaucherait le document). */

export interface TitreSommaire {
  id: string;
  niveau: 1 | 2 | 3;
  texte: string;
}

function texteDe(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((i) => {
      const it = i as { text?: string; content?: unknown };
      if (typeof it.text === "string") return it.text;
      if (it.content) return texteDe(it.content);
      return "";
    })
    .join("");
}

/** Titres (blocs heading) d'un document BlockNote, dans l'ordre de lecture. */
export function extraireTitres(blocs: unknown[]): TitreSommaire[] {
  const out: TitreSommaire[] = [];
  const walk = (bs: unknown[]) => {
    for (const b of bs) {
      const bloc = b as {
        id?: string;
        type?: string;
        props?: { level?: number };
        content?: unknown;
        children?: unknown[];
      };
      if (bloc.type === "heading" && bloc.id) {
        const texte = texteDe(bloc.content).trim();
        if (texte) {
          const niveau = Math.min(3, Math.max(1, bloc.props?.level ?? 1)) as 1 | 2 | 3;
          out.push({ id: bloc.id, niveau, texte });
        }
      }
      if (Array.isArray(bloc.children) && bloc.children.length > 0) walk(bloc.children);
    }
  };
  walk(blocs);
  return out;
}

/** Empreinte stable — l'éditeur ne re-rend le sommaire que si elle change. */
export function signatureTitres(titres: TitreSommaire[]): string {
  return titres.map((t) => `${t.id}${t.niveau}${t.texte}`).join("");
}

/* Hauteur (px) sous laquelle un titre est considéré « atteint » : barre de
 * chrome sticky + un peu d'air. Doit suivre scroll-margin-top (notes.css). */
const SEUIL_ACTIF = 96;

const RETRAIT: Record<1 | 2 | 3, string> = { 1: "pl-2", 2: "pl-5", 3: "pl-8" };
const LARGEUR_BARRE: Record<1 | 2 | 3, string> = { 1: "w-5", 2: "w-3.5", 3: "w-2" };

export function SommaireNote({
  titres,
  onNaviguer,
}: {
  titres: TitreSommaire[];
  onNaviguer: (id: string) => void;
}) {
  const [actif, setActif] = useState<string | null>(null);

  // Section courante : le dernier titre passé au-dessus du seuil. Écouté en
  // capture (c'est <main> qui défile, pas la fenêtre), cadencé par rAF.
  useEffect(() => {
    if (titres.length === 0) return;
    let raf = 0;
    const calculer = () => {
      raf = 0;
      let courant: string | null = null;
      for (const t of titres) {
        const el = document.querySelector(`.bn-block-outer[data-id="${t.id}"]`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= SEUIL_ACTIF + 40) courant = t.id;
        else break;
      }
      setActif(courant ?? titres[0].id);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(calculer);
    };
    calculer();
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [titres]);

  if (titres.length < 2) return null;

  return (
    <nav
      aria-label="Sommaire de la note"
      className="group fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 xl:block"
    >
      {/* Rail replié : une barre par titre. */}
      <div
        aria-hidden
        className="flex flex-col items-end gap-1.5 rounded-lg p-2 transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0"
      >
        {titres.map((t) => (
          <span
            key={t.id}
            className={`h-[3px] rounded-full transition-colors ${LARGEUR_BARRE[t.niveau]} ${
              actif === t.id ? "bg-brand" : "bg-border"
            }`}
          />
        ))}
      </div>

      {/* Panneau déployé (survol ou focus clavier). */}
      <div
        className="pointer-events-none absolute right-0 top-1/2 max-h-[60vh] w-64 -translate-y-1/2
          overflow-y-auto rounded-lg border border-border bg-surface p-1.5 opacity-0 shadow-lg
          transition-opacity duration-150 group-focus-within:pointer-events-auto
          group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
      >
        <p className="px-2 pb-1 pt-0.5 font-display text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-subtle">
          Sommaire
        </p>
        {titres.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActif(t.id);
              onNaviguer(t.id);
            }}
            className={`block w-full truncate rounded-md py-1 pr-2 text-left text-sm transition-colors ${RETRAIT[t.niveau]} ${
              actif === t.id
                ? "bg-brand-soft font-medium text-brand"
                : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
            title={t.texte}
          >
            {t.texte}
          </button>
        ))}
      </div>
    </nav>
  );
}
