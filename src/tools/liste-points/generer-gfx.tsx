"use client";

import { useMemo, useState } from "react";
import { CircuitBoard, Download, Loader2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/ui";
import type { PointRow } from "./model";
import { CONTROLLERS, planAssignment, buildGfx } from "./gfx-export";

/** Bouton + dialogue de génération d'un squelette GFX depuis la liste. */
export function GenererGfx({
  rows,
  projectName,
  chantier,
  client,
  date,
}: {
  rows: PointRow[];
  projectName: string;
  chantier?: string;
  client?: string;
  date?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState(CONTROLLERS[0].ref);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const controller = CONTROLLERS.find((c) => c.ref === ref)!;
  const plan = useMemo(() => planAssignment(rows, controller), [rows, controller]);

  // Récapitulatif de l'occupation par module.
  const perModule = useMemo(() => {
    const map = new Map<number, { in: number; out: number }>();
    for (let m = 0; m < plan.modules; m++) map.set(m, { in: 0, out: 0 });
    for (const a of plan.inputs) map.get(a.module)!.in++;
    for (const a of plan.outputs) map.get(a.module)!.out++;
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [plan]);

  async function download() {
    setBusy(true);
    setErr("");
    try {
      const name = projectName.trim() || "Projet";
      const { blob, filename } = await buildGfx(plan, name, { chantier, client, date });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Échec de la génération.");
    } finally {
      setBusy(false);
    }
  }

  const nothing = plan.inputs.length + plan.outputs.length === 0;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CircuitBoard className="h-4 w-4" /> Générer GFX
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-fg">
                Générer un squelette GFX
              </h2>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-3 block space-y-1">
              <span className="text-xs font-medium text-muted">Automate cible</span>
              <select
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
              >
                {CONTROLLERS.map((c) => (
                  <option key={c.ref} value={c.ref}>
                    {c.label}
                  </option>
                ))}
              </select>
              {controller.note && (
                <span className="block text-xs text-subtle">{controller.note}</span>
              )}
            </label>

            {/* Récapitulatif */}
            <div className="mb-3 rounded-md border border-border bg-surface-2 p-3 text-sm">
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-fg">
                <span>
                  Entrées : <b>{plan.inputs.length}</b>{" "}
                  <span className="text-subtle">
                    ({plan.counts.ai} AI + {plan.counts.di} DI)
                  </span>
                </span>
                <span>
                  Sorties : <b>{plan.outputs.length}</b>{" "}
                  <span className="text-subtle">
                    ({plan.counts.ao} AO + {plan.counts.do} DO)
                  </span>
                </span>
                <span>
                  Modules : <b>{plan.modules}</b>
                </span>
              </div>
              <div className="space-y-0.5 text-xs text-muted">
                {perModule.map(([m, u]) => (
                  <div key={m}>
                    Module {m + 1} — {u.in}/{controller.inPerModule} entrées ·{" "}
                    {u.out}/{controller.outPerModule} sorties
                  </div>
                ))}
              </div>
              {plan.counts.com > 0 && (
                <div className="mt-2 text-xs text-subtle">
                  {plan.counts.com} point(s) COM ignoré(s) (bus/communication, hors E/S
                  physiques).
                </div>
              )}
            </div>

            {plan.overflow.length > 0 && (
              <div className="mb-3 flex gap-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                <span>
                  {plan.overflow.length} point(s) au-delà de la capacité de l’automate
                  ne seront pas générés. Choisissez un automate plus grand (ou le S1000E,
                  extensible) : {plan.overflow.slice(0, 6).map((o) => o.name).join(", ")}
                  {plan.overflow.length > 6 ? "…" : ""}
                </span>
              </div>
            )}

            {err && (
              <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
                {err}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Annuler
              </Button>
              <Button size="sm" onClick={download} disabled={busy || nothing}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Télécharger le .gfx
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
