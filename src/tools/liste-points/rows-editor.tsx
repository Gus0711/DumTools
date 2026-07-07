"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, GripVertical, Plus, Rows3, TriangleAlert, X } from "lucide-react";
import { Button, Combobox, type ComboOption } from "@/ui";
import { cn } from "@/lib/cn";
import {
  computeTotals,
  emptyIo,
  IO_TYPES,
  type IoType,
  type ModeleDef,
  type PointRow,
} from "./model";
import { ajouterPointCatalogue } from "./actions";

export type CatalogItem = { nom: string; type: string };

const IO_ON: Record<IoType, string> = {
  AI: "bg-io-ai text-white",
  DI: "bg-io-di text-white",
  AO: "bg-io-ao text-white",
  DO: "bg-io-do text-white",
  COM: "bg-io-com text-white",
};

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r${Date.now()}${Math.round(Math.random() * 1e6)}`;

/**
 * Éditeur de lignes réutilisable (barre d'outils + table + totaux + modale
 * catalogue), piloté par un couple `rows`/`setRows`. Sans couplage au document :
 * utilisé tel quel par l'outil Liste de points ET par l'onglet Liste d'un projet
 * d'affectation. `toolbarExtra` permet d'injecter des actions (ex. Générer GFX).
 */
export function RowsEditor({
  rows,
  setRows,
  catalogue,
  modeles,
  toolbarExtra,
}: {
  rows: PointRow[];
  setRows: React.Dispatch<React.SetStateAction<PointRow[]>>;
  catalogue: CatalogItem[];
  modeles: ModeleDef[];
  toolbarExtra?: ReactNode;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>(catalogue);
  const [tplOpen, setTplOpen] = useState(false);
  const [np, setNp] = useState<{ nom: string; type: IoType } | null>(null);
  const [npErr, setNpErr] = useState("");

  const totals = useMemo(() => computeTotals(rows), [rows]);
  const pointOptions = useMemo<ComboOption[]>(
    () => [
      { value: "__divers__", label: "＋ Divers (texte libre)", special: true },
      ...catalog.map((p) => ({ value: p.nom, tag: p.type })),
    ],
    [catalog],
  );

  const patch = (rid: string, fn: (r: PointRow) => PointRow) =>
    setRows((r) => r.map((x) => (x.id === rid ? fn(x) : x)));
  const addPoint = () =>
    setRows((r) => [...r, { id: newId(), kind: "point", nom: "", note: "", io: emptyIo() }]);
  const addSection = () => setRows((r) => [...r, { id: newId(), kind: "section", nom: "" }]);
  const delRow = (rid: string) => setRows((r) => r.filter((x) => x.id !== rid));
  // Type d'E/S EXCLUSIF : une ligne = un seul type. Re-clic = désélection.
  const toggleIo = (rid: string, t: IoType) =>
    patch(rid, (x) => {
      const io = emptyIo();
      if (!x.io?.[t]) io[t] = 1;
      return { ...x, io };
    });

  function pickPoint(rid: string, opt: ComboOption) {
    if (opt.special) {
      patch(rid, (x) => ({ ...x, nom: "Divers", io: emptyIo() }));
      return;
    }
    const type = catalog.find((p) => p.nom === opt.value)?.type as IoType | undefined;
    patch(rid, (x) => {
      const io = emptyIo();
      if (type) io[type] = 1;
      return { ...x, nom: opt.value, io };
    });
  }

  function insertTemplate(name: string) {
    const modele = modeles.find((m) => m.nom === name);
    if (!modele) return;
    const add: PointRow[] = [{ id: newId(), kind: "section", nom: name }];
    for (const pt of modele.points) {
      const io = emptyIo();
      io[pt.type] = 1;
      add.push({ id: newId(), kind: "point", nom: pt.nom, note: "", io });
    }
    setRows((r) => [...r, ...add]);
    setTplOpen(false);
  }

  // Glisser-déposer
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  function onDrop(targetId: string) {
    const from = rows.findIndex((r) => r.id === dragId.current);
    const to = rows.findIndex((r) => r.id === targetId);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    setRows((r) => {
      const c = [...r];
      const [m] = c.splice(from, 1);
      c.splice(to, 0, m);
      return c;
    });
  }

  async function saveNewPoint() {
    if (!np) return;
    const res = await ajouterPointCatalogue(np.nom, np.type);
    if (!res.ok) {
      setNpErr(res.error ?? "Erreur");
      return;
    }
    setCatalog((c) =>
      [...c, { nom: np.nom.trim(), type: np.type }].sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    );
    setNp(null);
    setNpErr("");
  }

  return (
    <div>
      {/* Barre d'outils */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={addPoint}>
          <Plus className="h-4 w-4" /> Point
        </Button>
        <Button size="sm" variant="outline" onClick={addSection}>
          <Rows3 className="h-4 w-4" /> Section
        </Button>
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setTplOpen((o) => !o)}>
            Modèle <ChevronDown className="h-4 w-4" />
          </Button>
          {tplOpen && (
            <div className="absolute z-20 mt-1 w-48 rounded-md border border-border bg-surface py-1 shadow-lg">
              {modeles.length === 0 && (
                <span className="block px-3 py-1.5 text-sm text-subtle">Aucun modèle.</span>
              )}
              {modeles.map((m) => (
                <button
                  key={m.nom}
                  type="button"
                  onClick={() => insertTemplate(m.nom)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                >
                  {m.nom}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setNp({ nom: "", type: "AI" })}>
          <Plus className="h-4 w-4" /> Nouveau point au catalogue
        </Button>
        {toolbarExtra && <div className="ml-auto">{toolbarExtra}</div>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-subtle">
              <th className="w-8" />
              <th className="px-2 py-2 text-left font-medium">Nom du point</th>
              <th className="px-2 py-2 text-left font-medium">Texte libre</th>
              {IO_TYPES.map((t) => (
                <th key={t} className="w-14 px-1 py-2 text-center font-medium">
                  {t}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={IO_TYPES.length + 4} className="px-4 py-10 text-center text-sm text-subtle">
                  Aucun point. Ajoutez un point, une section ou insérez un modèle.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const dnd = {
                draggable: true,
                onDragStart: () => (dragId.current = r.id),
                onDragOver: (e: React.DragEvent) => {
                  e.preventDefault();
                  setOverId(r.id);
                },
                onDragLeave: () => setOverId((o) => (o === r.id ? null : o)),
                onDrop: () => onDrop(r.id),
                onDragEnd: () => {
                  dragId.current = null;
                  setOverId(null);
                },
              };
              const overCls = overId === r.id ? "bg-brand-soft/60" : "";
              if (r.kind === "section") {
                return (
                  <tr key={r.id} {...dnd} className={cn("border-b border-border bg-surface-2", overCls)}>
                    <td className="cursor-grab px-2 text-subtle">
                      <GripVertical className="h-4 w-4" />
                    </td>
                    <td colSpan={IO_TYPES.length + 2} className="px-2 py-1.5">
                      <input
                        value={r.nom}
                        onChange={(e) => patch(r.id, (x) => ({ ...x, nom: e.target.value }))}
                        placeholder="Titre de section"
                        className="w-full bg-transparent text-sm font-semibold text-brand placeholder:font-normal placeholder:text-subtle focus:outline-none"
                      />
                    </td>
                    <td className="px-2 text-right">
                      <DelBtn onClick={() => delRow(r.id)} />
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={r.id} {...dnd} className={cn("border-b border-border-soft", overCls)}>
                  <td className="cursor-grab px-2 text-subtle">
                    <GripVertical className="h-4 w-4" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Combobox
                      value={r.nom}
                      onInput={(v) => patch(r.id, (x) => ({ ...x, nom: v }))}
                      onPick={(o) => pickPoint(r.id, o)}
                      options={pointOptions}
                      placeholder="Choisir un point…"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={r.note ?? ""}
                      onChange={(e) => patch(r.id, (x) => ({ ...x, note: e.target.value }))}
                      placeholder="—"
                      className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
                    />
                  </td>
                  {IO_TYPES.map((t) => (
                    <td key={t} className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleIo(r.id, t)}
                        title={t}
                        aria-pressed={!!r.io?.[t]}
                        className={cn(
                          "h-6 w-9 rounded text-xs font-semibold transition-colors",
                          r.io?.[t] ? IO_ON[t] : "bg-surface-2 text-subtle hover:bg-border-soft",
                        )}
                      >
                        {t}
                      </button>
                    </td>
                  ))}
                  <td className="px-2 text-right">
                    <DelBtn onClick={() => delRow(r.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totaux */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {IO_TYPES.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs font-semibold",
                  IO_ON[t],
                )}
              >
                {t}
              </span>
              <span className="font-semibold tabular-nums text-fg">{totals[t]}</span>
            </span>
          ))}
        </div>
        <div className="font-semibold text-fg">
          {totals.es} E/S · {totals.points} point{totals.points > 1 ? "s" : ""} · {totals.COM} communicant
          {totals.COM > 1 ? "s" : ""}
        </div>
      </div>

      {/* Modale nouveau point catalogue */}
      {np && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-fg">Nouveau point au catalogue</h3>
            <div className="space-y-3">
              <input
                autoFocus
                value={np.nom}
                onChange={(e) => setNp({ ...np, nom: e.target.value })}
                placeholder="Nom du point"
                className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
              />
              <select
                value={np.type}
                onChange={(e) => setNp({ ...np, type: e.target.value as IoType })}
                className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
              >
                {IO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {npErr && (
                <p className="flex items-center gap-1.5 text-sm text-danger">
                  <TriangleAlert className="h-4 w-4" /> {npErr}
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNp(null);
                  setNpErr("");
                }}
              >
                Annuler
              </Button>
              <Button size="sm" onClick={saveNewPoint}>
                Ajouter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Supprimer la ligne"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-subtle transition-colors hover:bg-danger/12 hover:text-danger"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
