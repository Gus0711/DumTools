"use client";

import { useMemo } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/ui";
import { cn } from "@/lib/cn";
import { INPUT_SIGNALS, OUTPUT_SIGNALS } from "./catalog";
import { affecterAuto } from "./affectation-auto";
import {
  allowedModules,
  channelCount,
  moduleDisplayTitle,
  type Module,
  type Point,
  type Project,
} from "./model";

export function AffectationTab({
  project,
  patch,
  modules,
}: {
  project: Project;
  patch: (fn: (p: Project) => Project) => void;
  modules: Module[];
}) {
  const points = useMemo(
    () => (project.points ?? []).filter((p) => p.active),
    [project.points],
  );
  const inputs = points.filter((p) => p.direction === "input");
  const outputs = points.filter((p) => p.direction === "output");
  const nonAffectes = points.filter((p) => p.module == null || p.channel == null).length;

  const update = (uid: string, patchPoint: Partial<Point>) =>
    patch((p) => ({
      ...p,
      points: (p.points ?? []).map((pt) => (pt.uid === uid ? { ...pt, ...patchPoint } : pt)),
    }));
  const reaffecter = () => patch((p) => ({ ...p, points: affecterAuto(p) }));

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-muted">
        Aucune E/S. Saisis les points dans l&apos;onglet <b>Liste de points</b> ; ils apparaîtront ici
        pour affectation aux bornes.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5">
          <span className="text-muted">E/S</span>
          <span className="font-semibold tabular-nums text-fg">{points.length}</span>
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5",
            nonAffectes > 0 && "border-danger/40",
          )}
        >
          <span className="text-muted">Non affectées</span>
          <span className={cn("font-semibold tabular-nums", nonAffectes > 0 ? "text-danger" : "text-success")}>
            {nonAffectes}
          </span>
        </span>
        <div className="ml-auto">
          <Button size="sm" onClick={reaffecter}>
            <Wand2 className="h-4 w-4" /> Ré-affecter automatiquement
          </Button>
        </div>
      </div>

      <BorneTable
        titre="Entrées"
        direction="input"
        pts={inputs}
        modules={modules}
        signals={INPUT_SIGNALS}
        update={update}
      />
      <div className="h-4" />
      <BorneTable
        titre="Sorties"
        direction="output"
        pts={outputs}
        modules={modules}
        signals={OUTPUT_SIGNALS}
        update={update}
      />
    </div>
  );
}

function BorneTable({
  titre,
  direction,
  pts,
  modules,
  signals,
  update,
}: {
  titre: string;
  direction: "input" | "output";
  pts: Point[];
  modules: Module[];
  signals: string[];
  update: (uid: string, patch: Partial<Point>) => void;
}) {
  const mods = allowedModules(direction, modules);
  if (pts.length === 0) return null;
  const isOut = direction === "output";
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
            <th className="px-3 py-2 font-medium">{titre}</th>
            <th className="w-20 px-3 py-2 font-medium">Borne</th>
            <th className="w-28 px-3 py-2 font-medium">Signal</th>
            {isOut && <th className="w-28 px-3 py-2 font-medium">Relais</th>}
            <th className="w-52 px-3 py-2 font-medium">Module</th>
            <th className="w-24 px-3 py-2 font-medium">Canal</th>
          </tr>
        </thead>
        <tbody>
          {pts.map((p) => {
            const mod = modules.find((m) => Number(m.number) === Number(p.module));
            const canaux = mod ? channelCount(direction, mod) : 0;
            return (
              <tr key={p.uid} className="border-b border-border-soft last:border-0">
                <td className="px-3 py-1.5 text-fg">{p.designation || <span className="text-subtle">—</span>}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted">{p.repere || "—"}</td>
                <td className="px-3 py-1.5">
                  <select
                    value={p.signal ?? ""}
                    onChange={(e) => update(p.uid, { signal: e.target.value })}
                    className="h-8 w-full rounded border border-border bg-surface px-1.5 text-sm text-fg"
                  >
                    {signals.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                {isOut && (
                  <td className="px-3 py-1.5">
                    <input
                      value={p.relay ?? ""}
                      onChange={(e) => update(p.uid, { relay: e.target.value })}
                      placeholder="—"
                      className="h-8 w-full rounded border border-border bg-surface px-2 text-sm text-fg placeholder:text-subtle"
                    />
                  </td>
                )}
                <td className="px-3 py-1.5">
                  <select
                    value={p.module == null ? "" : p.module}
                    onChange={(e) => {
                      const v = e.target.value;
                      update(p.uid, { module: v ? Number(v) : null, channel: null, repere: "" });
                    }}
                    className="h-8 w-full rounded border border-border bg-surface px-1.5 text-sm text-fg"
                  >
                    <option value="">— non affecté —</option>
                    {mods.map((m) => (
                      <option key={m.number} value={m.number}>
                        {moduleDisplayTitle(m, modules)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={p.channel ?? ""}
                    disabled={p.module == null}
                    onChange={(e) => update(p.uid, { channel: e.target.value ? Number(e.target.value) : null })}
                    className="h-8 w-full rounded border border-border bg-surface px-1.5 text-sm text-fg disabled:opacity-50"
                  >
                    <option value="">—</option>
                    {Array.from({ length: canaux }, (_, i) => i + 1).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
