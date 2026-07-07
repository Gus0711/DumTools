"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/ui";
import { INPUT_SIGNALS, OUTPUT_SIGNALS } from "./catalog";
import {
  allowedModules,
  channelCount,
  moduleDisplayTitle,
  type Module,
  type Point,
  type Project,
} from "./model";

const newUid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : `p${Date.now()}${Math.round(Math.random() * 1e6)}`;

export function PointsTab({
  direction,
  project,
  patch,
  modules,
}: {
  direction: "input" | "output";
  project: Project;
  patch: (fn: (p: Project) => Project) => void;
  modules: Module[];
}) {
  const signals = direction === "input" ? INPUT_SIGNALS : OUTPUT_SIGNALS;
  const mods = useMemo(() => allowedModules(direction, modules), [direction, modules]);

  const points = useMemo(() => {
    return (project.points ?? [])
      .filter((p) => p.direction === direction)
      .sort((a, b) => {
        const am = a.module ? Number(a.module) : 9999;
        const bm = b.module ? Number(b.module) : 9999;
        if (am !== bm) return am - bm;
        const ac = a.channel ? Number(a.channel) : 9999;
        const bc = b.channel ? Number(b.channel) : 9999;
        if (ac !== bc) return ac - bc;
        return String(a.repere || "").localeCompare(String(b.repere || ""), "fr", { numeric: true });
      });
  }, [project.points, direction]);

  // Regroupement par module (+ non affectés)
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; points: Point[] }>();
    for (const p of points) {
      const key = p.module ? `m${p.module}` : "unassigned";
      if (!map.has(key)) {
        const mod = modules.find((m) => Number(m.number) === Number(p.module));
        map.set(key, {
          label: p.module ? (mod ? moduleDisplayTitle(mod, modules) : `Module ${p.module}`) : "Points non affectés",
          points: [],
        });
      }
      map.get(key)!.points.push(p);
    }
    return [...map.values()];
  }, [points, modules]);

  const update = (uid: string, patchPoint: Partial<Point>) =>
    patch((p) => ({
      ...p,
      points: (p.points ?? []).map((pt) => (pt.uid === uid ? { ...pt, ...patchPoint } : pt)),
    }));
  const remove = (uid: string) =>
    patch((p) => ({ ...p, points: (p.points ?? []).filter((pt) => pt.uid !== uid) }));
  const add = () =>
    patch((p) => ({
      ...p,
      points: [
        ...(p.points ?? []),
        {
          uid: newUid(),
          direction,
          active: true,
          designation: "",
          repere: "",
          signal: signals[0],
          source: "",
          module: null,
          channel: null,
        },
      ],
    }));

  const colCount = direction === "output" ? 8 : 7;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">
          {points.length} point{points.length > 1 ? "s" : ""}
          {direction === "input" ? " en entrée" : " en sortie"}
        </p>
        <Button size="sm" onClick={add}>
          <Plus className="h-4 w-4" /> Ajouter un point
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
              <th className="w-10 px-2 py-2 text-center font-medium">Actif</th>
              <th className="px-2 py-2 font-medium">Repère</th>
              <th className="px-2 py-2 font-medium">Désignation</th>
              <th className="px-2 py-2 font-medium">Signal</th>
              {direction === "output" && <th className="px-2 py-2 font-medium">Relais</th>}
              <th className="px-2 py-2 font-medium">Module</th>
              <th className="px-2 py-2 font-medium">Canal</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {points.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-subtle">
                  Aucun point. Ajoutez-en un, ou importez un fichier .gfx / PDF (bientôt).
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <FragmentGroup
                key={g.label}
                label={g.label}
                count={g.points.length}
                colCount={colCount}
              >
                {g.points.map((p) => {
                  const mod = modules.find((m) => Number(m.number) === Number(p.module));
                  const channels = Array.from({ length: channelCount(direction, mod) }, (_, i) => i + 1);
                  return (
                    <tr
                      key={p.uid}
                      className={p.active ? "border-b border-border-soft" : "border-b border-border-soft opacity-50"}
                    >
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={p.active}
                          onChange={(e) => update(p.uid, { active: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Cell value={p.repere ?? ""} onChange={(v) => update(p.uid, { repere: v })} w="w-20" />
                      </td>
                      <td className="px-2 py-1">
                        <Cell value={p.designation} onChange={(v) => update(p.uid, { designation: v })} />
                      </td>
                      <td className="px-2 py-1">
                        <SelectCell
                          value={p.signal ?? ""}
                          onChange={(v) => update(p.uid, { signal: v })}
                          options={signals}
                        />
                      </td>
                      {direction === "output" && (
                        <td className="px-2 py-1">
                          <Cell value={p.relay ?? ""} onChange={(v) => update(p.uid, { relay: v })} w="w-24" />
                        </td>
                      )}
                      <td className="px-2 py-1">
                        <SelectCell
                          value={p.module ? String(p.module) : ""}
                          onChange={(v) => update(p.uid, { module: v ? Number(v) : null, channel: null })}
                          options={["", ...mods.map((m) => String(m.number))]}
                          labels={{ "": "—", ...Object.fromEntries(mods.map((m) => [String(m.number), moduleDisplayTitle(m, modules)])) }}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <SelectCell
                          value={p.channel ? String(p.channel) : ""}
                          onChange={(v) => update(p.uid, { channel: v ? Number(v) : null })}
                          options={["", ...channels.map(String)]}
                          labels={{ "": "—" }}
                          disabled={!p.module}
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          aria-label="Supprimer le point"
                          onClick={() => remove(p.uid)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-subtle transition-colors hover:bg-danger/12 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </FragmentGroup>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentGroup({
  label,
  count,
  colCount,
  children,
}: {
  label: string;
  count: number;
  colCount: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="bg-surface-2">
        <td colSpan={colCount} className="px-3 py-1.5 text-xs font-semibold text-brand">
          {label} <span className="font-normal text-subtle">· {count} point(s)</span>
        </td>
      </tr>
      {children}
    </>
  );
}

function Cell({
  value,
  onChange,
  w = "w-full",
}: {
  value: string;
  onChange: (v: string) => void;
  w?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${w} h-8 rounded border border-border bg-surface px-2 text-sm text-fg`}
    />
  );
}

function SelectCell({
  value,
  onChange,
  options,
  labels,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded border border-border bg-surface px-1.5 text-sm text-fg disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}
