"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  GripVertical,
  Loader2,
  Plus,
  Printer,
  Rows3,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button, Combobox, type ComboOption } from "@/ui";
import { cn } from "@/lib/cn";
import {
  computeTotals,
  emptyIo,
  IO_TYPES,
  type IoType,
  type PointRow,
} from "./model";
import { TEMPLATES } from "./catalog";
import { ajouterPointCatalogue, sauverDocument } from "./actions";
import { Impression } from "./impression";
import { GenererGfx } from "./generer-gfx";

type CatalogItem = { nom: string; type: string };

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

export function Editeur({
  id,
  initial,
  clients,
  catalogue,
}: {
  id: string;
  initial: {
    clientNom: string;
    chantierNom: string;
    numeroWhy: string;
    date: string | null;
    rows: PointRow[];
  };
  clients: string[];
  catalogue: CatalogItem[];
}) {
  const [rows, setRows] = useState<PointRow[]>(initial.rows);
  const [clientNom, setClientNom] = useState(initial.clientNom);
  const [chantierNom, setChantierNom] = useState(initial.chantierNom);
  const [numeroWhy, setNumeroWhy] = useState(initial.numeroWhy);
  const [date, setDate] = useState(initial.date ?? "");
  const [catalog, setCatalog] = useState<CatalogItem[]>(catalogue);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");

  const totals = useMemo(() => computeTotals(rows), [rows]);
  const clientOptions = useMemo<ComboOption[]>(
    () => clients.map((c) => ({ value: c })),
    [clients],
  );
  const pointOptions = useMemo<ComboOption[]>(
    () => [
      { value: "__divers__", label: "＋ Divers (texte libre)", special: true },
      ...catalog.map((p) => ({ value: p.nom, tag: p.type })),
    ],
    [catalog],
  );

  // --- Autosave (débounce) ---------------------------------------------------
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        await sauverDocument(id, {
          clientNom,
          chantierNom,
          numeroWhy,
          date: date || null,
          rows,
        });
        setSave("saved");
      } catch {
        setSave("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [rows, clientNom, chantierNom, numeroWhy, date, id]);

  // --- Opérations sur les lignes --------------------------------------------
  const patch = (rid: string, fn: (r: PointRow) => PointRow) =>
    setRows((r) => r.map((x) => (x.id === rid ? fn(x) : x)));
  const addPoint = () =>
    setRows((r) => [
      ...r,
      { id: newId(), kind: "point", nom: "", note: "", io: emptyIo() },
    ]);
  const addSection = () =>
    setRows((r) => [...r, { id: newId(), kind: "section", nom: "" }]);
  const delRow = (rid: string) => setRows((r) => r.filter((x) => x.id !== rid));
  const toggleIo = (rid: string, t: IoType) =>
    patch(rid, (x) => ({
      ...x,
      io: { ...(x.io ?? emptyIo()), [t]: x.io?.[t] ? 0 : 1 },
    }));

  function pickPoint(rid: string, opt: ComboOption) {
    if (opt.special) {
      patch(rid, (x) => ({ ...x, nom: "Divers", io: emptyIo() }));
      return;
    }
    const type = catalog.find((p) => p.nom === opt.value)?.type as
      | IoType
      | undefined;
    patch(rid, (x) => {
      const io = emptyIo();
      if (type) io[type] = 1;
      return { ...x, nom: opt.value, io };
    });
  }

  function insertTemplate(name: string) {
    const pts = TEMPLATES[name] ?? [];
    const add: PointRow[] = [{ id: newId(), kind: "section", nom: name }];
    for (const pn of pts) {
      const type = catalog.find((p) => p.nom === pn)?.type as
        | IoType
        | undefined;
      const io = emptyIo();
      if (type) io[type] = 1;
      add.push({ id: newId(), kind: "point", nom: pn, note: "", io });
    }
    setRows((r) => [...r, ...add]);
    setTplOpen(false);
  }

  // --- Glisser-déposer -------------------------------------------------------
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

  // --- Menus / modale --------------------------------------------------------
  const [tplOpen, setTplOpen] = useState(false);
  const [np, setNp] = useState<{ nom: string; type: IoType } | null>(null);
  const [npErr, setNpErr] = useState("");

  async function saveNewPoint() {
    if (!np) return;
    const res = await ajouterPointCatalogue(np.nom, np.type);
    if (!res.ok) {
      setNpErr(res.error ?? "Erreur");
      return;
    }
    setCatalog((c) =>
      [...c, { nom: np.nom.trim(), type: np.type }].sort((a, b) =>
        a.nom.localeCompare(b.nom, "fr"),
      ),
    );
    setNp(null);
    setNpErr("");
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 md:px-10">
      {/* En-tête */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link
          href="/outils/liste-points"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" /> Listes
        </Link>
        <div className="flex items-center gap-3">
          <SaveState state={save} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer
          </Button>
        </div>
      </div>

      {/* Métadonnées du document */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Client</span>
          <Combobox
            value={clientNom}
            onInput={setClientNom}
            onPick={(o) => setClientNom(o.value)}
            options={clientOptions}
            placeholder="Rechercher un client…"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Chantier</span>
          <input
            value={chantierNom}
            onChange={(e) => setChantierNom(e.target.value)}
            placeholder="Nom du chantier"
            className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">N° Why</span>
          <input
            value={numeroWhy}
            onChange={(e) => setNumeroWhy(e.target.value)}
            placeholder="Réf. affaire WhySoft"
            className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
          />
        </label>
      </div>

      {/* Barre d'outils */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={addPoint}>
          <Plus className="h-4 w-4" /> Point
        </Button>
        <Button size="sm" variant="outline" onClick={addSection}>
          <Rows3 className="h-4 w-4" /> Section
        </Button>
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTplOpen((o) => !o)}
          >
            Modèle <ChevronDown className="h-4 w-4" />
          </Button>
          {tplOpen && (
            <div className="absolute z-20 mt-1 w-48 rounded-md border border-border bg-surface py-1 shadow-lg">
              {Object.keys(TEMPLATES).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => insertTemplate(name)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setNp({ nom: "", type: "AI" })}
        >
          <Plus className="h-4 w-4" /> Nouveau point au catalogue
        </Button>
        <div className="ml-auto">
          <GenererGfx
            rows={rows}
            projectName={chantierNom || clientNom || "Projet"}
            chantier={chantierNom}
            client={clientNom}
            date={date}
          />
        </div>
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
                <td
                  colSpan={IO_TYPES.length + 4}
                  className="px-4 py-10 text-center text-sm text-subtle"
                >
                  Aucun point. Ajoutez un point, une section ou insérez un
                  modèle.
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
                  <tr
                    key={r.id}
                    {...dnd}
                    className={cn(
                      "border-b border-border bg-surface-2",
                      overCls,
                    )}
                  >
                    <td className="cursor-grab px-2 text-subtle">
                      <GripVertical className="h-4 w-4" />
                    </td>
                    <td colSpan={IO_TYPES.length + 2} className="px-2 py-1.5">
                      <input
                        value={r.nom}
                        onChange={(e) =>
                          patch(r.id, (x) => ({ ...x, nom: e.target.value }))
                        }
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
                <tr
                  key={r.id}
                  {...dnd}
                  className={cn("border-b border-border-soft", overCls)}
                >
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
                      onChange={(e) =>
                        patch(r.id, (x) => ({ ...x, note: e.target.value }))
                      }
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
                        className={cn(
                          "h-6 w-9 rounded text-xs font-semibold transition-colors",
                          r.io?.[t]
                            ? IO_ON[t]
                            : "bg-surface-2 text-subtle hover:bg-border-soft",
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
              <span className="font-semibold tabular-nums text-fg">
                {totals[t]}
              </span>
            </span>
          ))}
        </div>
        <div className="font-semibold text-fg">
          {totals.es} E/S · {totals.points} point
          {totals.points > 1 ? "s" : ""} · {totals.COM} communicant
          {totals.COM > 1 ? "s" : ""}
        </div>
      </div>

      {/* Modale nouveau point catalogue */}
      {np && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-fg">
              Nouveau point au catalogue
            </h3>
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
                onChange={(e) =>
                  setNp({ ...np, type: e.target.value as IoType })
                }
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

      {/* Vue imprimable (masquée à l'écran, révélée à l'impression) */}
      <Impression
        clientNom={clientNom}
        chantierNom={chantierNom}
        date={date || null}
        rows={rows}
      />
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

function SaveState({ state }: { state: "saved" | "saving" | "error" }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…
      </span>
    );
  if (state === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-danger">
        <TriangleAlert className="h-4 w-4" /> Erreur d’enregistrement
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-success">
      <Check className="h-4 w-4" /> Enregistré
    </span>
  );
}
