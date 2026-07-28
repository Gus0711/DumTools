"use client";

// Navigateur temporel : Année ▸ Mois ▸ Semaine ▸ Jour, avec compteurs.
// Un clic sur un nœud FILTRE la liste sur les jours qu'il couvre ; le bouton ⬇
// exporte exactement ce nœud, sans passer par les filtres. Les compteurs sont
// exacts à tous les étages (cf. `construireArbrePeriodes`).

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, ChevronRight, Download, X } from "lucide-react";
import type { NoeudPeriode } from "./periodes";

/** Ouvre d'office la branche la plus récente (année + mois), pour tomber
 *  directement sur le travail du moment plutôt que sur un arbre tout replié. */
function brancheParDefaut(noeuds: NoeudPeriode[]): Set<string> {
  const ouverts = new Set<string>();
  const annee = noeuds[0];
  if (!annee) return ouverts;
  ouverts.add(annee.cle);
  const mois = annee.enfants[0];
  if (mois) ouverts.add(mois.cle);
  return ouverts;
}

function Ligne({
  noeud,
  profondeur,
  ouverts,
  basculer,
  selection,
  onSelect,
  onExport,
}: {
  noeud: NoeudPeriode;
  profondeur: number;
  ouverts: Set<string>;
  basculer: (cle: string) => void;
  selection: string | null;
  onSelect: (n: NoeudPeriode) => void;
  onExport: (n: NoeudPeriode) => void;
}) {
  const ouvert = ouverts.has(noeud.cle);
  const actif = selection === noeud.cle;
  const aEnfants = noeud.enfants.length > 0;

  return (
    <li>
      <div
        className={`group flex items-center gap-0.5 rounded-md pr-1 ${
          actif ? "bg-brand-soft" : "hover:bg-surface-2"
        }`}
        style={{ paddingLeft: `${profondeur * 0.7}rem` }}
      >
        {aEnfants ? (
          <button
            type="button"
            onClick={() => basculer(noeud.cle)}
            aria-expanded={ouvert}
            aria-label={ouvert ? "Replier" : "Déplier"}
            className="shrink-0 rounded p-1 text-subtle hover:text-fg"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${ouvert ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span aria-hidden className="w-[1.375rem] shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(noeud)}
          aria-current={actif ? "true" : undefined}
          className="flex min-w-0 flex-1 items-baseline gap-1.5 py-1 text-left"
        >
          <span
            className={`truncate text-sm ${
              actif
                ? "font-semibold text-brand"
                : noeud.granularite === "annee"
                  ? "font-semibold text-fg"
                  : noeud.granularite === "mois"
                    ? "font-medium text-fg"
                    : "text-muted"
            }`}
          >
            {noeud.libelle}
          </span>
          {noeud.detail && (
            <span className="truncate text-[11px] text-subtle">{noeud.detail}</span>
          )}
        </button>

        <span
          className={`shrink-0 tabular-nums text-xs ${actif ? "text-brand" : "text-subtle"}`}
        >
          {noeud.total}
        </span>
        <button
          type="button"
          onClick={() => onExport(noeud)}
          title={`Exporter « ${noeud.libelle} » en CSV`}
          className="shrink-0 rounded p-1 text-subtle opacity-60 hover:bg-surface hover:text-brand hover:opacity-100"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>

      {aEnfants && ouvert && (
        <ul>
          {noeud.enfants.map((e) => (
            <Ligne
              key={e.cle}
              noeud={e}
              profondeur={profondeur + 1}
              ouverts={ouverts}
              basculer={basculer}
              selection={selection}
              onSelect={onSelect}
              onExport={onExport}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ArbrePeriodes({
  noeuds,
  total,
  selection,
  onSelect,
  onExport,
  avecTitre = true,
}: {
  noeuds: NoeudPeriode[];
  /** Nombre total de scans, toutes périodes confondues. */
  total: number;
  /** Clé du nœud sélectionné, ou `null` pour « toutes les périodes ». */
  selection: string | null;
  /** `null` = lever le filtre de période. */
  onSelect: (noeud: NoeudPeriode | null) => void;
  onExport: (noeud: NoeudPeriode) => void;
  /** Masqué dans le popover : le bouton qui l'ouvre porte déjà le libellé. */
  avecTitre?: boolean;
}) {
  const [ouverts, setOuverts] = useState<Set<string>>(() =>
    brancheParDefaut(noeuds),
  );

  const basculer = useCallback((cle: string) => {
    setOuverts((prev) => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle);
      else next.add(cle);
      return next;
    });
  }, []);

  return (
    <nav aria-label="Périodes">
      {avecTitre && (
        <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
          <CalendarRange className="h-3.5 w-3.5" />
          Périodes
        </h2>
      )}

      <ul className="space-y-px">
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-current={selection === null ? "true" : undefined}
            className={`flex w-full items-center gap-1.5 rounded-md py-1 pl-[1.375rem] pr-2 text-left text-sm ${
              selection === null
                ? "bg-brand-soft font-semibold text-brand"
                : "text-muted hover:bg-surface-2"
            }`}
          >
            <span className="flex-1 truncate">Toutes les périodes</span>
            <span className="shrink-0 tabular-nums text-xs">{total}</span>
          </button>
        </li>
        {noeuds.map((n) => (
          <Ligne
            key={n.cle}
            noeud={n}
            profondeur={0}
            ouverts={ouverts}
            basculer={basculer}
            selection={selection}
            onSelect={onSelect}
            onExport={onExport}
          />
        ))}
      </ul>

      {noeuds.length === 0 && (
        <p className="px-2 py-3 text-xs text-subtle">Aucun scan pour l&apos;instant.</p>
      )}
    </nav>
  );
}

/**
 * Sélecteur de période : un bouton qui porte la période active, et un popover
 * contenant l'arbre. Choix d'implantation assumé — l'arbre en rail latéral
 * mangeait 15 rem de large à un tableau qui a déjà quatorze colonnes, alors
 * qu'on ne change de période que quelques fois par session.
 */
export function SelecteurPeriode({
  noeuds,
  total,
  periodeCle,
  periodeLibelle,
  onSelect,
  onExport,
}: {
  noeuds: NoeudPeriode[];
  total: number;
  periodeCle: string | null;
  /** Libellé complet de la période active, affiché sur le bouton. */
  periodeLibelle: string | null;
  onSelect: (noeud: NoeudPeriode | null) => void;
  onExport: (noeud: NoeudPeriode) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boiteRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et à Échap — un popover qui ne se ferme pas
  // au clic à côté est un piège à souris.
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (!boiteRef.current?.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClic);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  const actif = periodeCle !== null;

  return (
    <div ref={boiteRef} className="relative">
      <div
        className={`flex h-9 items-center rounded-md border ${
          actif ? "border-brand/45 bg-brand-soft" : "border-border bg-surface"
        }`}
      >
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          aria-haspopup="dialog"
          className={`flex h-full items-center gap-1.5 px-2.5 text-sm ${
            actif ? "font-medium text-brand" : "text-fg"
          }`}
        >
          <CalendarRange className="h-4 w-4 shrink-0 opacity-70" />
          <span className="max-w-[15rem] truncate">
            {periodeLibelle ?? "Toutes les périodes"}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${
              ouvert ? "rotate-180" : ""
            }`}
          />
        </button>
        {actif && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            title="Toutes les périodes"
            aria-label="Effacer le filtre de période"
            className="mr-1 rounded p-1 text-brand/70 hover:bg-surface hover:text-brand"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {ouvert && (
        <div
          role="dialog"
          aria-label="Choisir une période"
          className="absolute left-0 top-full z-30 mt-1 max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-lg"
        >
          <ArbrePeriodes
            noeuds={noeuds}
            total={total}
            selection={periodeCle}
            avecTitre={false}
            onSelect={(n) => {
              onSelect(n);
              setOuvert(false);
            }}
            // L'export ne ferme pas : on peut enchaîner plusieurs périodes.
            onExport={onExport}
          />
        </div>
      )}
    </div>
  );
}
