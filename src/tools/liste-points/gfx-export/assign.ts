// Affectation des points d'une liste sur les voies d'un automate.
// La liste est abstraite (compteurs AI/DI/AO/DO par point, sans voie) : on
// répartit séquentiellement les entrées sur les UI et les sorties sur les
// voies de sortie, module par module.

import type { PointRow } from "../model";
import type { ControllerConfig } from "./controllers";

export interface AssignedPoint {
  name: string;
  direction: "input" | "output";
  /** true = analogique (AI/AO), false = tout ou rien (DI/DO). */
  analog: boolean;
  /** Index de module (0 = intégré / premier module). */
  module: number;
  /** Voie 1-basée sur le module. */
  channel: number;
  /** IDX de ressource GFX = (module+1)*100 + (channel-1). */
  idx: number;
}

export interface AssignmentPlan {
  controller: ControllerConfig;
  modules: number;
  inputs: AssignedPoint[];
  outputs: AssignedPoint[];
  /** Points non placés faute de capacité (automate non extensible). */
  overflow: { name: string; direction: "input" | "output"; type: string }[];
  counts: { ai: number; di: number; ao: number; do: number; com: number };
}

interface Unit {
  name: string;
  direction: "input" | "output";
  analog: boolean;
  type: string;
}

/** Éclate les lignes de points en unités E/S physiques (COM exclu). */
export function expandRows(rows: PointRow[]): Unit[] {
  const units: Unit[] = [];
  for (const r of rows) {
    if (r.kind !== "point" || !r.io) continue;
    const base = (r.nom || "Point").trim() || "Point";
    // Un point peut porter plusieurs E/S : on suffixe le type pour les distinguer.
    const flags: [keyof typeof r.io, "input" | "output", boolean, string][] = [
      ["AI", "input", true, "AI"],
      ["DI", "input", false, "DI"],
      ["AO", "output", true, "AO"],
      ["DO", "output", false, "DO"],
    ];
    const active = flags.filter(([k]) => r.io![k]);
    for (const [, direction, analog, type] of active) {
      const name = active.length > 1 ? `${base} (${type})` : base;
      units.push({ name, direction, analog, type });
    }
  }
  return units;
}

export function planAssignment(
  rows: PointRow[],
  controller: ControllerConfig,
): AssignmentPlan {
  const units = expandRows(rows);
  const inputs = units.filter((u) => u.direction === "input");
  const outputs = units.filter((u) => u.direction === "output");

  const inPer = controller.inPerModule;
  const outPer = controller.outPerModule;
  const needed = Math.max(
    Math.ceil(inputs.length / inPer),
    Math.ceil(outputs.length / outPer),
    1,
  );
  const modules = controller.expandable
    ? Math.min(needed, controller.maxModules)
    : 1;
  const inCap = modules * inPer;
  const outCap = modules * outPer;

  const place = (list: Unit[], per: number): AssignedPoint[] =>
    list.map((u, k) => {
      const mod = Math.floor(k / per);
      const channel = (k % per) + 1;
      return {
        name: u.name,
        direction: u.direction,
        analog: u.analog,
        module: mod,
        channel,
        idx: (mod + 1) * 100 + (channel - 1),
      };
    });

  const placedInputs = place(inputs.slice(0, inCap), inPer);
  const placedOutputs = place(outputs.slice(0, outCap), outPer);

  const overflow = [
    ...inputs.slice(inCap).map((u) => ({ name: u.name, direction: u.direction, type: u.type })),
    ...outputs.slice(outCap).map((u) => ({ name: u.name, direction: u.direction, type: u.type })),
  ];

  const counts = { ai: 0, di: 0, ao: 0, do: 0, com: 0 };
  for (const r of rows) {
    if (r.kind !== "point" || !r.io) continue;
    counts.ai += r.io.AI ? 1 : 0;
    counts.di += r.io.DI ? 1 : 0;
    counts.ao += r.io.AO ? 1 : 0;
    counts.do += r.io.DO ? 1 : 0;
    counts.com += r.io.COM ? 1 : 0;
  }

  return { controller, modules, inputs: placedInputs, outputs: placedOutputs, overflow, counts };
}
