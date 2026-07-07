"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Printer } from "lucide-react";
import { Button } from "@/ui";
import { cn } from "@/lib/cn";
import { moduleDisplayTitle, type Module, type Point, type Project } from "./model";
import { RapportTests } from "./tests-report";

const STATUSES = [
  { value: "non-teste", label: "Non testé", sel: "bg-surface-2 text-fg border-border" },
  { value: "ok", label: "OK", sel: "bg-success/20 text-success border-success/40" },
  { value: "defaut", label: "Défaut", sel: "bg-danger/20 text-danger border-danger/45" },
];

export function TestsTab({
  project,
  patch,
  modules,
}: {
  project: Project;
  patch: (fn: (p: Project) => Project) => void;
  modules: Module[];
}) {
  const points = useMemo(
    () =>
      (project.points ?? [])
        .filter((p) => p.active && p.module != null && p.channel != null)
        .sort((a, b) => {
          const am = Number(a.module) - Number(b.module);
          if (am !== 0) return am;
          if (a.direction !== b.direction) return a.direction === "input" ? -1 : 1;
          return Number(a.channel) - Number(b.channel);
        }),
    [project.points],
  );

  const groups = useMemo(() => {
    const map = new Map<number, Point[]>();
    for (const p of points) {
      const n = Number(p.module);
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(p);
    }
    return [...map.entries()];
  }, [points]);

  const stats = useMemo(() => {
    let ok = 0, defaut = 0;
    for (const p of points) {
      if (p.testStatus === "ok") ok++;
      else if (p.testStatus === "defaut") defaut++;
    }
    return { total: points.length, ok, defaut, reste: points.length - ok - defaut };
  }, [points]);

  // Ensemble des modules repliés (par défaut : tous dépliés).
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const isOpen = (n: number) => !collapsed.has(n);
  const toggle = (n: number) =>
    setCollapsed((prev) => {
      const s = new Set(prev);
      if (s.has(n)) s.delete(n);
      else s.add(n);
      return s;
    });
  const toutReplier = () => setCollapsed(new Set(groups.map(([n]) => n)));
  const toutDeplier = () => setCollapsed(new Set());

  const update = (uid: string, patchPoint: Partial<Point>) =>
    patch((p) => ({
      ...p,
      points: (p.points ?? []).map((pt) => (pt.uid === uid ? { ...pt, ...patchPoint } : pt)),
    }));

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-muted">
        Aucun point affecté à tester. Choisis un automate (onglet <b>Automate &amp; modules</b>) : les
        points de la <b>Liste de points</b> sont alors affectés aux bornes.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <Stat label="À tester" value={stats.total} />
        <Stat label="OK" value={stats.ok} tone="text-success" />
        <Stat label="Défaut" value={stats.defaut} tone="text-danger" />
        <Stat label="Restant" value={stats.reste} tone="text-subtle" />
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={toutDeplier}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" /> Tout déplier
          </button>
          <button
            type="button"
            onClick={toutReplier}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
          >
            <ChevronsDownUp className="h-3.5 w-3.5" /> Tout replier
          </button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer le rapport
          </Button>
        </div>
      </div>

      <div className="space-y-2.5">
        {groups.map(([num, pts]) => {
          const mod = modules.find((m) => Number(m.number) === num);
          const label = mod ? moduleDisplayTitle(mod, modules) : `Module ${num}`;
          const gOk = pts.filter((p) => p.testStatus === "ok").length;
          const gDefaut = pts.filter((p) => p.testStatus === "defaut").length;
          const gReste = pts.length - gOk - gDefaut;
          const open = isOpen(num);
          return (
            <div key={num} className="overflow-hidden rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => toggle(num)}
                aria-expanded={open}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <ChevronRight
                  className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-90")}
                />
                <span className="font-semibold text-brand">{label}</span>
                <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums">
                  <Pastille tone="text-success" bg="bg-success/12" label={`${gOk} OK`} on={gOk > 0} />
                  <Pastille tone="text-danger" bg="bg-danger/12" label={`${gDefaut} défaut`} on={gDefaut > 0} />
                  <Pastille tone="text-subtle" bg="bg-surface-2" label={`${gReste} restant`} on={gReste > 0} />
                </span>
              </button>

              {open && (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                        <th className="w-16 px-3 py-2 font-medium">Borne</th>
                        <th className="px-3 py-2 font-medium">Désignation</th>
                        <th className="w-32 px-3 py-2 font-medium">Statut</th>
                        <th className="px-3 py-2 font-medium">Commentaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pts.map((p) => {
                        const status = p.testStatus ?? "non-teste";
                        return (
                          <tr key={p.uid} className="border-b border-border-soft last:border-0 align-top">
                            <td className="px-3 py-2 font-mono text-xs text-muted">{p.repere}</td>
                            <td className="px-3 py-2 text-fg">{p.designation}</td>
                            <td className="px-3 py-2">
                              <select
                                value={status}
                                onChange={(e) => update(p.uid, { testStatus: e.target.value })}
                                className={cn(
                                  "h-8 rounded border px-1.5 text-sm font-semibold",
                                  STATUSES.find((s) => s.value === status)?.sel,
                                )}
                              >
                                {STATUSES.map((s) => (
                                  <option key={s.value} value={s.value} className="bg-surface text-fg">
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <textarea
                                value={p.testComment ?? ""}
                                onChange={(e) => update(p.uid, { testComment: e.target.value })}
                                rows={2}
                                placeholder="—"
                                className="min-h-16 w-full resize-y rounded border border-border bg-surface px-2 py-1.5 text-sm leading-snug text-fg placeholder:text-subtle"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rapport imprimable (masqué à l'écran, révélé à l'impression). */}
      <RapportTests project={project} modules={modules} />
    </div>
  );
}

function Stat({ label, value, tone = "text-fg" }: { label: string; value: number; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5">
      <span className="text-muted">{label}</span>
      <span className={cn("font-semibold tabular-nums", tone)}>{value}</span>
    </span>
  );
}

function Pastille({ tone, bg, label, on }: { tone: string; bg: string; label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-medium",
        on ? cn(bg, tone) : "text-subtle",
      )}
    >
      {label}
    </span>
  );
}
