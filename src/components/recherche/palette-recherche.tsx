"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  CircuitBoard,
  ClipboardCheck,
  CornerDownLeft,
  Library,
  Loader2,
  NotebookPen,
  Search,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useShell } from "@/components/app-shell/shell-context";
import { LIBELLE_TYPE, MIN_CARACTERES, type ResultatRecherche, type TypeResultat } from "@/lib/recherche/types";

/* =============================================================================
 * PALETTE DE RECHERCHE GLOBALE (⌘K / Ctrl+K)
 * La navigation passe par l'affaire ; cette palette est le chemin de traverse
 * pour quand on ne sait plus DE QUELLE affaire il s'agit. Un champ, toutes les
 * entités (affaires, clients, projets GTB, notes, visites, wiki).
 * ========================================================================== */

const ICONE: Record<TypeResultat, LucideIcon> = {
  affaire: Briefcase,
  client: Building2,
  projet: CircuitBoard,
  note: NotebookPen,
  visite: ClipboardCheck,
  wiki: Library,
};

/** Ordre des groupes = ordre des clés de LIBELLE_TYPE. */
const ORDRE = Object.keys(LIBELLE_TYPE) as TypeResultat[];

export function PaletteRecherche() {
  const router = useRouter();
  const { rechercheOuverte, setRechercheOuverte } = useShell();
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [actif, setActif] = useState(0);
  const listeRef = useRef<HTMLDivElement>(null);

  const fermer = useCallback(() => {
    setRechercheOuverte(false);
    setQ("");
    setResultats([]);
    setErreur(false);
    setActif(0);
  }, [setRechercheOuverte]);

  // ⌘K / Ctrl+K depuis n'importe où — y compris quand le focus est dans un
  // champ (d'où le preventDefault : on court-circuite le raccourci navigateur).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setRechercheOuverte(!rechercheOuverte);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rechercheOuverte, setRechercheOuverte]);

  // Frappe → recherche différée (180 ms) et annulable : une requête devenue
  // obsolète est abandonnée, jamais affichée après une plus récente. Sous le
  // seuil de caractères on ne touche à rien : l'affichage montre l'invite (les
  // résultats précédents restent en mémoire mais ne sont pas rendus).
  useEffect(() => {
    if (!rechercheOuverte) return;
    const requete = q.trim();
    if (requete.length < MIN_CARACTERES) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setChargement(true);
      try {
        const r = await fetch(`/api/recherche?q=${encodeURIComponent(requete)}`, {
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error("recherche");
        const data = (await r.json()) as { resultats: ResultatRecherche[] };
        setResultats(data.resultats ?? []);
        setErreur(false);
        setActif(0);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setErreur(true);
        setResultats([]);
      } finally {
        setChargement(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, rechercheOuverte]);

  // Groupes dans l'ordre canonique ; `plat` sert à la navigation clavier.
  const groupes = useMemo(
    () =>
      ORDRE.map((type) => ({ type, items: resultats.filter((r) => r.type === type) })).filter(
        (g) => g.items.length > 0,
      ),
    [resultats],
  );
  const plat = useMemo(() => groupes.flatMap((g) => g.items), [groupes]);

  const ouvrir = useCallback(
    (r: ResultatRecherche) => {
      fermer();
      router.push(r.href);
    },
    [fermer, router],
  );

  // L'élément actif reste visible pendant la navigation au clavier.
  useEffect(() => {
    listeRef.current
      ?.querySelector<HTMLElement>(`[data-index="${actif}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  if (!rechercheOuverte) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      fermer();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActif((i) => (plat.length ? (i + 1) % plat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((i) => (plat.length ? (i - 1 + plat.length) % plat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cible = plat[actif];
      if (cible) ouvrir(cible);
    }
  }

  const requete = q.trim();
  let index = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recherche globale"
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fermer();
      }}
    >
      <div
        className="anim-pop mt-[10vh] w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onKeyDown={onKeyDown}
      >
        {/* Champ */}
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          {chargement ? (
            <Loader2 className="h-4.5 w-4.5 shrink-0 animate-spin text-brand" />
          ) : (
            <Search className="h-4.5 w-4.5 shrink-0 text-subtle" />
          )}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une affaire, un client, un automate, une note…"
            aria-label="Rechercher"
            className="h-14 w-full bg-transparent text-base text-fg outline-none placeholder:text-subtle"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-subtle sm:block">
            Esc
          </kbd>
        </div>

        {/* Résultats */}
        <div ref={listeRef} className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {requete.length < MIN_CARACTERES ? (
            <p className="px-3 py-8 text-center text-sm text-subtle">
              Tapez au moins {MIN_CARACTERES} caractères — nom d&apos;affaire, client, n° Why,
              titre de note ou de page wiki.
            </p>
          ) : erreur ? (
            <p className="px-3 py-8 text-center text-sm text-danger">
              La recherche a échoué — réessayez.
            </p>
          ) : plat.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-subtle">
              {chargement ? "Recherche…" : `Aucun résultat pour « ${requete} ».`}
            </p>
          ) : (
            groupes.map((g) => (
              <div key={g.type} className="mb-1 last:mb-0">
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">
                  {LIBELLE_TYPE[g.type]}
                </div>
                {g.items.map((r) => {
                  index += 1;
                  const i = index;
                  const Icone = ICONE[r.type];
                  return (
                    <button
                      key={`${r.type}:${r.id}`}
                      type="button"
                      data-index={i}
                      onMouseMove={() => setActif(i)}
                      onClick={() => ouvrir(r)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                        i === actif ? "bg-brand/10" : "hover:bg-surface-2",
                      )}
                    >
                      <Icone
                        className={cn(
                          "h-4 w-4 shrink-0",
                          i === actif ? "text-brand" : "text-subtle",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">
                          {r.titre}
                        </span>
                        {r.sousTitre && (
                          <span className="block truncate text-xs text-muted">{r.sousTitre}</span>
                        )}
                      </span>
                      {i === actif && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Aide clavier */}
        <div className="hidden items-center gap-4 border-t border-border bg-surface-2 px-4 py-2 text-[11px] text-subtle sm:flex">
          <span>
            <b className="font-semibold">↑ ↓</b> naviguer
          </span>
          <span>
            <b className="font-semibold">↵</b> ouvrir
          </span>
          <span>
            <b className="font-semibold">Esc</b> fermer
          </span>
        </div>
      </div>
    </div>
  );
}
