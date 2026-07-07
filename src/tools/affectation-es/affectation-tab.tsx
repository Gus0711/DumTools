"use client";

import { useMemo } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Wand2 } from "lucide-react";
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
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <StatPill label="E/S" value={points.length} />
        <StatPill
          label="Non affectées"
          value={nonAffectes}
          tone={nonAffectes > 0 ? "danger" : "success"}
        />
        <div className="ml-auto">
          <Button size="sm" onClick={reaffecter}>
            <Wand2 className="h-4 w-4" /> Ré-affecter automatiquement
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <BorneTable
          titre="Entrées"
          direction="input"
          pts={inputs}
          modules={modules}
          signals={INPUT_SIGNALS}
          update={update}
        />
        <BorneTable
          titre="Sorties"
          direction="output"
          pts={outputs}
          modules={modules}
          signals={OUTPUT_SIGNALS}
          update={update}
        />
      </div>
    </div>
  );
}

/** Pastille de statistique — chiffre en évidence, libellé discret. */
function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border bg-surface px-3 py-1.5 shadow-sm",
        tone === "danger" ? "border-danger/40" : "border-border",
      )}
    >
      <span className="text-xs text-muted">{label}</span>
      <span
        className={cn(
          "font-display text-base font-semibold tabular-nums leading-none",
          tone === "danger"
            ? "text-danger"
            : tone === "success"
              ? "text-success"
              : "text-fg",
        )}
      >
        {value}
      </span>
    </span>
  );
}

/* Contrôle compact réutilisé dans les cellules de la table d'affectation. */
const cellControl =
  "h-8 w-full rounded-md border border-border bg-surface px-1.5 text-sm text-fg shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50";

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
  // Couleur métier de la direction : entrées en bleu « signal », sorties en vert.
  // Classes littérales (Tailwind ne génère rien depuis une interpolation).
  const toneChip = isOut ? "bg-io-do/12 text-io-do" : "bg-io-ai/12 text-io-ai";
  const DirIcon = isOut ? ArrowUpFromLine : ArrowDownToLine;
  const nonAffectes = pts.filter((p) => p.module == null || p.channel == null).length;

  return (
    <div className="data-card overflow-hidden">
      {/* Entête de section — icône + titre colorés par direction. */}
      <div className="flex items-center gap-2.5 border-b border-border bg-surface-2 px-4 py-2.5">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            toneChip,
          )}
        >
          <DirIcon className="h-3.5 w-3.5" />
        </span>
        <h3 className="font-display text-sm font-semibold tracking-tight text-fg">
          {titre}
        </h3>
        <span className="text-xs text-muted">· {pts.length}</span>
        {nonAffectes > 0 && (
          <span className="ml-auto rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger">
            {nonAffectes} non affectée{nonAffectes > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table data-table--form">
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="w-20">Borne</th>
              <th className="w-28">Signal</th>
              {isOut && <th className="w-28">Relais</th>}
              <th className="w-52">Module</th>
              <th className="w-24">Canal</th>
            </tr>
          </thead>
          <tbody>
            {pts.map((p) => {
              const mod = modules.find((m) => Number(m.number) === Number(p.module));
              const canaux = mod ? channelCount(direction, mod) : 0;
              const affecte = p.module != null && p.channel != null;
              return (
                <tr key={p.uid}>
                  <td className="cell-wrap cell-title !font-normal">
                    {p.designation || <span className="text-subtle">—</span>}
                  </td>
                  <td>
                    {p.repere ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 font-mono text-xs font-medium",
                          affecte ? toneChip : "bg-surface-2 text-subtle",
                        )}
                      >
                        {p.repere}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={p.signal ?? ""}
                      onChange={(e) => update(p.uid, { signal: e.target.value })}
                      className={cellControl}
                    >
                      {signals.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  {isOut && (
                    <td>
                      <input
                        value={p.relay ?? ""}
                        onChange={(e) => update(p.uid, { relay: e.target.value })}
                        placeholder="—"
                        className={cn(cellControl, "px-2 placeholder:text-subtle")}
                      />
                    </td>
                  )}
                  <td>
                    <select
                      value={p.module == null ? "" : p.module}
                      onChange={(e) => {
                        const v = e.target.value;
                        update(p.uid, { module: v ? Number(v) : null, channel: null, repere: "" });
                      }}
                      className={cellControl}
                    >
                      <option value="">— non affecté —</option>
                      {mods.map((m) => (
                        <option key={m.number} value={m.number}>
                          {moduleDisplayTitle(m, modules)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={p.channel ?? ""}
                      disabled={p.module == null}
                      onChange={(e) => update(p.uid, { channel: e.target.value ? Number(e.target.value) : null })}
                      className={cellControl}
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
    </div>
  );
}
