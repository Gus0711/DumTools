"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ExternalLink,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import {
  TYPE_COLONNE_LABEL,
  tableVide,
  uidCourt,
  type ColonneTable,
  type TableDonnees,
  type TypeColonne,
  type ValeurCellule,
} from "../model";

/* Bloc « table de données » — l'esprit Coda dans une note : colonnes TYPÉES
 * (texte, nombre, date, case à cocher, choix, URL), tri par en-tête et filtre
 * texte. Les données vivent dans les props du bloc (JSON sérialisé — BlockNote
 * n'accepte que des props scalaires) : pas de modèle Prisma dédié, la table
 * voyage avec la note (partage, impression, export). Tri et filtre sont des
 * états LOCAUX d'affichage : ils ne modifient pas les données.
 *
 * ⚠️ Rendu en GRILLE CSS (divs), PAS en <table> : l'extension « poignées de
 * tableau » de BlockNote s'accroche aux TD/TH du DOM et suppose ensuite que le
 * bloc est un tableau BlockNote (lecture de content.rows → TypeError sur un
 * bloc custom). Ne pas réintroduire de balises table/td/th ici. */

const config = {
  type: "tableDonnees" as const,
  propSchema: {
    data: { default: "" },
  },
  content: "none" as const,
};

function parseTable(raw: string): TableDonnees {
  try {
    const t = JSON.parse(raw) as TableDonnees;
    if (Array.isArray(t?.colonnes) && Array.isArray(t?.lignes)) return t;
  } catch {
    /* prop vide ou corrompue → table par défaut */
  }
  return tableVide();
}

/** Comparateur type-aware pour le tri par colonne. */
function comparer(type: TypeColonne, a: ValeurCellule, b: ValeurCellule): number {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  if (type === "nombre") return Number(a) - Number(b);
  if (type === "case") return Number(Boolean(b)) - Number(Boolean(a));
  // date au format ISO (yyyy-mm-dd) : l'ordre lexical est l'ordre chronologique.
  return String(a).localeCompare(String(b), "fr", { numeric: true, sensitivity: "base" });
}

function TableDonneesBloc({ block, editor }: ReactCustomBlockRenderProps<typeof config>) {
  const table = useMemo(() => parseTable(block.props.data), [block.props.data]);
  const editable = editor.isEditable;
  const [tri, setTri] = useState<{ colId: string; sens: 1 | -1 } | null>(null);
  const [filtre, setFiltre] = useState("");
  // Menu d'options de colonne : rendu en PORTAL (position fixe) — le conteneur
  // de la table défile (overflow-x-auto) et rognerait un menu absolute.
  const [menuCol, setMenuCol] = useState<{ id: string; ancre: DOMRect } | null>(null);

  const commit = (next: TableDonnees) =>
    editor.updateBlock(block, { props: { data: JSON.stringify(next) } });

  /* --- opérations colonnes --------------------------------------------------- */

  const majColonne = (colId: string, patch: Partial<ColonneTable>) =>
    commit({
      ...table,
      colonnes: table.colonnes.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
    });

  const ajouterColonne = () =>
    commit({
      ...table,
      colonnes: [
        ...table.colonnes,
        { id: uidCourt(), nom: `Colonne ${table.colonnes.length + 1}`, type: "texte" },
      ],
    });

  const supprimerColonne = (colId: string) => {
    setMenuCol(null);
    commit({
      ...table,
      colonnes: table.colonnes.filter((c) => c.id !== colId),
      lignes: table.lignes.map((l) => {
        const valeurs = { ...l.valeurs };
        delete valeurs[colId];
        return { ...l, valeurs };
      }),
    });
  };

  const deplacerColonne = (colId: string, delta: -1 | 1) => {
    const i = table.colonnes.findIndex((c) => c.id === colId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= table.colonnes.length) return;
    const colonnes = [...table.colonnes];
    [colonnes[i], colonnes[j]] = [colonnes[j], colonnes[i]];
    commit({ ...table, colonnes });
  };

  /* --- opérations lignes ------------------------------------------------------ */

  const ajouterLigne = () =>
    commit({ ...table, lignes: [...table.lignes, { id: uidCourt(), valeurs: {} }] });

  const supprimerLigne = (ligneId: string) =>
    commit({ ...table, lignes: table.lignes.filter((l) => l.id !== ligneId) });

  const majCellule = (ligneId: string, colId: string, valeur: ValeurCellule) =>
    commit({
      ...table,
      lignes: table.lignes.map((l) =>
        l.id === ligneId ? { ...l, valeurs: { ...l.valeurs, [colId]: valeur } } : l,
      ),
    });

  /* --- vue (filtre + tri, sans toucher aux données) --------------------------- */

  const lignesVisibles = useMemo(() => {
    let lignes = table.lignes;
    const s = filtre.trim().toLowerCase();
    if (s) {
      lignes = lignes.filter((l) =>
        table.colonnes.some((c) => String(l.valeurs[c.id] ?? "").toLowerCase().includes(s)),
      );
    }
    if (tri) {
      const col = table.colonnes.find((c) => c.id === tri.colId);
      if (col) {
        lignes = [...lignes].sort(
          (a, b) => tri.sens * comparer(col.type, a.valeurs[col.id] ?? null, b.valeurs[col.id] ?? null),
        );
      }
    }
    return lignes;
  }, [table, filtre, tri]);

  const basculerTri = (colId: string) =>
    setTri((t) =>
      t?.colId !== colId ? { colId, sens: 1 } : t.sens === 1 ? { colId, sens: -1 } : null,
    );

  // Totaux des colonnes « nombre » (petit plus façon Coda).
  const totaux = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of table.colonnes) {
      if (c.type !== "nombre") continue;
      out.set(
        c.id,
        lignesVisibles.reduce((somme, l) => somme + (Number(l.valeurs[c.id]) || 0), 0),
      );
    }
    return out;
  }, [table.colonnes, lignesVisibles]);

  // Toutes les rangées partagent le même gabarit de colonnes (grille CSS).
  const gabarit = {
    gridTemplateColumns: `repeat(${table.colonnes.length}, minmax(8rem, 1fr))${
      editable ? " 2.25rem" : ""
    }`,
  };

  return (
    <div className="w-full" contentEditable={false}>
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1">
          <Search className="h-3.5 w-3.5 text-subtle" />
          <input
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Filtrer…"
            className="w-28 bg-transparent text-xs text-fg outline-none placeholder:text-subtle"
          />
          {filtre && (
            <button type="button" onClick={() => setFiltre("")} aria-label="Effacer le filtre">
              <X className="h-3 w-3 text-subtle hover:text-fg" />
            </button>
          )}
        </div>
        <span className="text-xs tabular-nums text-subtle">
          {lignesVisibles.length}/{table.lignes.length} ligne{table.lignes.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div role="table" className="min-w-fit text-sm">
          {/* --- en-têtes --- */}
          <div role="row" className="grid border-b border-border bg-surface-2" style={gabarit}>
            {table.colonnes.map((col, i) => (
              <div key={col.id} role="columnheader" className="relative min-w-0">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => basculerTri(col.id)}
                    className="flex min-w-0 flex-1 items-center gap-1 px-2.5 py-1.5 text-left text-xs font-semibold text-fg hover:text-brand"
                    title="Trier"
                  >
                    <span className="truncate">{col.nom}</span>
                    {tri?.colId === col.id &&
                      (tri.sens === 1 ? (
                        <ArrowUp className="h-3 w-3 shrink-0" />
                      ) : (
                        <ArrowDown className="h-3 w-3 shrink-0" />
                      ))}
                  </button>
                  {editable && (
                    <button
                      type="button"
                      data-menu-colonne
                      onClick={(e) =>
                        setMenuCol(
                          menuCol?.id === col.id
                            ? null
                            : { id: col.id, ancre: e.currentTarget.getBoundingClientRect() },
                        )
                      }
                      className="px-1 py-1.5 text-subtle hover:text-fg"
                      aria-label={`Options de la colonne ${col.nom}`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {editable && menuCol?.id === col.id && (
                  <MenuColonne ancre={menuCol.ancre} onFermer={() => setMenuCol(null)}>
                    <input
                      autoFocus
                      value={col.nom}
                      onChange={(e) => majColonne(col.id, { nom: e.target.value })}
                      className="mb-1.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg outline-none"
                    />
                    <select
                      value={col.type}
                      onChange={(e) => majColonne(col.id, { type: e.target.value as TypeColonne })}
                      className="mb-1.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg outline-none"
                    >
                      {Object.entries(TYPE_COLONNE_LABEL).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {col.type === "choix" && (
                      <input
                        value={(col.options ?? []).join(", ")}
                        onChange={(e) =>
                          majColonne(col.id, {
                            options: e.target.value
                              .split(",")
                              .map((o) => o.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Options séparées par des virgules"
                        className="mb-1.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg outline-none placeholder:text-subtle"
                      />
                    )}
                    <div className="flex items-center justify-between border-t border-border-soft pt-1.5">
                      <span className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => deplacerColonne(col.id, -1)}
                          disabled={i === 0}
                          className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30"
                          aria-label="Déplacer à gauche"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deplacerColonne(col.id, 1)}
                          disabled={i === table.colonnes.length - 1}
                          className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30"
                          aria-label="Déplacer à droite"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </span>
                      <button
                        type="button"
                        onClick={() => supprimerColonne(col.id)}
                        disabled={table.colonnes.length <= 1}
                        className="inline-flex items-center gap-1 rounded p-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </button>
                    </div>
                  </MenuColonne>
                )}
              </div>
            ))}
            {editable && (
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={ajouterColonne}
                  className="rounded p-0.5 text-subtle hover:bg-surface hover:text-brand"
                  aria-label="Ajouter une colonne"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* --- lignes --- */}
          {lignesVisibles.map((ligne) => (
            <div
              key={ligne.id}
              role="row"
              className="group/ligne grid items-center border-b border-border-soft last:border-0"
              style={gabarit}
            >
              {table.colonnes.map((col) => (
                <div key={col.id} role="cell" className="min-w-0 px-1 py-0.5">
                  <Cellule
                    colonne={col}
                    valeur={ligne.valeurs[col.id] ?? null}
                    editable={editable}
                    onChange={(v) => majCellule(ligne.id, col.id, v)}
                  />
                </div>
              ))}
              {editable && (
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => supprimerLigne(ligne.id)}
                    className="rounded p-0.5 text-subtle opacity-0 transition-opacity hover:text-danger group-hover/ligne:opacity-100"
                    aria-label="Supprimer la ligne"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {lignesVisibles.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted">
              {filtre ? "Aucune ligne ne correspond au filtre." : "Table vide."}
            </div>
          )}

          {/* --- totaux (colonnes nombre) --- */}
          {totaux.size > 0 && (
            <div role="row" className="grid border-t border-border bg-surface-2" style={gabarit}>
              {table.colonnes.map((col) => (
                <div
                  key={col.id}
                  className="px-2.5 py-1 text-xs font-medium tabular-nums text-muted"
                >
                  {totaux.has(col.id)
                    ? `Σ ${Number(totaux.get(col.id)!.toFixed(6)).toLocaleString("fr-FR")}`
                    : ""}
                </div>
              ))}
              {editable && <div />}
            </div>
          )}
        </div>
      </div>

      {editable && (
        <button
          type="button"
          onClick={ajouterLigne}
          className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg"
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle ligne
        </button>
      )}
    </div>
  );
}

/* --- Menu d'options de colonne (portal) ------------------------------------------
 * Position FIXE dans document.body : jamais rogné par le conteneur défilant de
 * la table, et bascule au-dessus de l'ancre quand le bas d'écran est proche. */

const LARGEUR_MENU = 224; // = w-56

function MenuColonne({
  ancre,
  onFermer,
  children,
}: {
  ancre: DOMRect;
  onFermer: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ouvertA = useRef(0);

  useEffect(() => {
    ouvertA.current = Date.now();
    const clicDehors = (e: MouseEvent) => {
      const cible = e.target as Node | null;
      if (ref.current?.contains(cible as Node)) return;
      // Le chevron d'ouverture gère lui-même le toggle : ne pas le doubler.
      if (cible instanceof Element && cible.closest("[data-menu-colonne]")) return;
      onFermer();
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    // Un défilement (page ou conteneur de table) désolidarise l'ancre → fermer.
    // Garde-fou : le focus d'ouverture peut émettre un scroll parasite.
    const defilement = (e: Event) => {
      if (Date.now() - ouvertA.current < 200) return;
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onFermer();
    };
    document.addEventListener("mousedown", clicDehors);
    document.addEventListener("keydown", touche);
    window.addEventListener("scroll", defilement, true);
    return () => {
      document.removeEventListener("mousedown", clicDehors);
      document.removeEventListener("keydown", touche);
      window.removeEventListener("scroll", defilement, true);
    };
  }, [onFermer]);

  const left = Math.max(8, Math.min(ancre.left, window.innerWidth - LARGEUR_MENU - 8));
  const versLeHaut = window.innerHeight - ancre.bottom < 290 && ancre.top > 290;
  const style: CSSProperties = {
    position: "fixed",
    left,
    width: LARGEUR_MENU,
    zIndex: 70,
    ...(versLeHaut
      ? { bottom: window.innerHeight - ancre.top + 4 }
      : { top: ancre.bottom + 4 }),
  };

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="rounded-lg border border-border bg-surface p-2 text-sm font-normal shadow-lg"
    >
      {children}
    </div>,
    document.body,
  );
}

/* --- Cellules par type --------------------------------------------------------- */

function Cellule({
  colonne,
  valeur,
  editable,
  onChange,
}: {
  colonne: ColonneTable;
  valeur: ValeurCellule;
  editable: boolean;
  onChange: (v: ValeurCellule) => void;
}) {
  switch (colonne.type) {
    case "case":
      return (
        <span className="flex justify-center">
          <input
            type="checkbox"
            checked={Boolean(valeur)}
            disabled={!editable}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
        </span>
      );
    case "choix":
      if (!editable) {
        return valeur ? (
          <span className="inline-flex rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">
            {String(valeur)}
          </span>
        ) : null;
      }
      return (
        <select
          value={String(valeur ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded bg-transparent px-1.5 py-1 text-sm text-fg outline-none hover:bg-surface-2"
        >
          <option value="">—</option>
          {(colonne.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "date":
      if (!editable) {
        return valeur ? (
          <span className="px-1.5 text-sm text-fg">
            {new Date(String(valeur)).toLocaleDateString("fr-FR")}
          </span>
        ) : null;
      }
      return (
        <input
          type="date"
          value={String(valeur ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded bg-transparent px-1.5 py-1 text-sm text-fg outline-none hover:bg-surface-2"
        />
      );
    case "url": {
      const lien = valeur ? (
        <a
          href={String(valeur)}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 p-1 text-brand hover:text-brand-strong"
          aria-label="Ouvrir le lien"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null;
      if (!editable) {
        return valeur ? (
          <span className="flex items-center">
            <span className="truncate px-1.5 text-sm text-fg">{String(valeur)}</span>
            {lien}
          </span>
        ) : null;
      }
      return (
        <span className="flex items-center">
          <CelluleTexte valeur={valeur} onChange={onChange} placeholder="https://…" />
          {lien}
        </span>
      );
    }
    case "nombre":
      if (!editable) {
        return valeur != null && valeur !== "" ? (
          <span className="block px-1.5 text-right text-sm tabular-nums text-fg">
            {Number(valeur).toLocaleString("fr-FR")}
          </span>
        ) : null;
      }
      return <CelluleTexte valeur={valeur} onChange={(v) => onChange(v === null ? null : Number(v))} nombre />;
    default:
      if (!editable) {
        return valeur ? <span className="px-1.5 text-sm text-fg">{String(valeur)}</span> : null;
      }
      return <CelluleTexte valeur={valeur} onChange={onChange} />;
  }
}

/** Saisie texte/nombre avec brouillon local : on ne réécrit le bloc (et donc le
 *  document) qu'au blur / Entrée, pas à chaque frappe. */
function CelluleTexte({
  valeur,
  onChange,
  nombre = false,
  placeholder,
}: {
  valeur: ValeurCellule;
  onChange: (v: string | null) => void;
  nombre?: boolean;
  placeholder?: string;
}) {
  const externe = valeur == null ? "" : String(valeur);
  const [brouillon, setBrouillon] = useState(externe);
  const [focus, setFocus] = useState(false);

  const commit = () => {
    setFocus(false);
    const v = brouillon.trim();
    if (v === externe) return;
    onChange(v === "" ? null : v);
  };

  return (
    <input
      type={nombre ? "number" : "text"}
      value={focus ? brouillon : externe}
      placeholder={placeholder}
      onFocus={() => {
        setBrouillon(externe);
        setFocus(true);
      }}
      onChange={(e) => setBrouillon(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setBrouillon(externe);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-full rounded bg-transparent px-1.5 py-1 text-sm text-fg outline-none placeholder:text-subtle hover:bg-surface-2 focus:bg-surface-2 ${
        nombre ? "text-right tabular-nums" : ""
      }`}
    />
  );
}

export const blocTableDonnees = createReactBlockSpec(config, {
  render: (props) => <TableDonneesBloc {...props} />,
});
