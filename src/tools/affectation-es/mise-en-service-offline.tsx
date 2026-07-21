"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Cpu } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMiseEnService } from "@/lib/offline/use-mise-en-service";
import type { MesPoint } from "@/lib/offline/mise-en-service";
import { SyncIndicator } from "@/components/offline/sync-indicator";

const STATUSES = [
  { value: "non-teste", label: "Non testé", sel: "bg-surface-2 text-fg border-border" },
  { value: "ok", label: "OK", sel: "bg-success/20 text-success border-success/40" },
  { value: "defaut", label: "Défaut", sel: "bg-danger/20 text-danger border-danger/45" },
];

/**
 * Écran MISE EN SERVICE hors-ligne (îlot local-first). Client pur : hydrate un
 * snapshot serveur, écrit en IndexedDB, synchronise au retour réseau. Pensé
 * mobile/tablette pour l'armoire : gros boutons, une carte par module.
 */
export function MiseEnServiceOffline({
  snapshot,
  moduleLabels,
  retourHref,
}: {
  snapshot: { id: string; nom: string; points: MesPoint[] };
  moduleLabels: Record<number, string>;
  retourHref: string;
}) {
  const { points, ready, online, pending, syncState, syncError, update, syncNow } =
    useMiseEnService(snapshot);

  const groups = useMemo(() => {
    const map = new Map<number, MesPoint[]>();
    for (const p of points) {
      const n = Number(p.module);
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [points]);

  const stats = useMemo(() => {
    let ok = 0,
      defaut = 0;
    for (const p of points) {
      if (p.testStatus === "ok") ok++;
      else if (p.testStatus === "defaut") defaut++;
    }
    return { total: points.length, ok, defaut, reste: points.length - ok - defaut };
  }, [points]);

  return (
    <div className="mx-auto max-w-3xl p-4 pb-24 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          href={retourHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-fg transition-colors hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> Projet
        </Link>
        <h1 className="font-display text-lg font-semibold tracking-tight text-fg">
          Mise en service — {snapshot.nom}
        </h1>
      </div>

      <SyncIndicator
        online={online}
        pending={pending}
        syncState={syncState}
        syncError={syncError}
        onSync={syncNow}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Stat label="À tester" value={stats.total} />
        <Stat label="OK" value={stats.ok} tone="text-success" />
        <Stat label="Défaut" value={stats.defaut} tone="text-danger" />
        <Stat label="Restant" value={stats.reste} tone="text-subtle" />
      </div>

      {!ready ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-muted">
          Chargement…
        </div>
      ) : points.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-muted">
          Aucun point affecté à tester.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(([num, pts]) => (
            <div key={num} className="data-card overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
                <Cpu className="h-4 w-4 shrink-0 text-subtle" />
                <span className="font-display font-semibold tracking-tight text-fg">
                  {moduleLabels[num] ?? `Module ${num}`}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {pts.map((p) => {
                  const status = p.testStatus ?? "non-teste";
                  return (
                    <li key={p.uid} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-medium text-fg">
                          {p.repere}
                        </span>
                        <span className="flex-1 text-sm leading-snug text-fg">
                          {p.designation}
                          {/* Texte libre de la liste de points (snapshots anciens : absent). */}
                          {p.source && (
                            <span className="mt-0.5 block text-xs text-muted">{p.source}</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {STATUSES.map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => update(p.uid, { testStatus: s.value })}
                            className={cn(
                              "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors",
                              status === s.value
                                ? s.sel
                                : "border-border bg-surface text-muted hover:bg-surface-2",
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={p.testComment ?? ""}
                        onChange={(e) => update(p.uid, { testComment: e.target.value })}
                        rows={1}
                        placeholder="Commentaire…"
                        className="mt-2 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm leading-snug text-fg shadow-sm placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "text-fg" }: { label: string; value: number; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-sm">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("font-display text-base font-semibold leading-none tabular-nums", tone)}>
        {value}
      </span>
    </span>
  );
}
