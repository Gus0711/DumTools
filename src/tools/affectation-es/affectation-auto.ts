// Affectation automatique des E/S aux bornes des modules, dans l'ordre de la
// liste. Entrées → bornes UI/DI ; sorties → bornes UO/DO. Remplit les canaux
// module par module selon les capacités. Le repère est posé via modulePointCode.
import {
  allowedModules,
  channelCount,
  modulePointCode,
  moduleSort,
  type Point,
  type Project,
} from "./model";

function assignerSens(points: Point[], modules: Project["modules"], direction: "input" | "output") {
  const mods = allowedModules(direction, modules).sort(moduleSort);
  const pts = points.filter((p) => p.active && p.direction === direction);
  let mi = 0;
  let ch = 1;
  for (const p of pts) {
    while (mi < mods.length && ch > channelCount(direction, mods[mi])) {
      mi += 1;
      ch = 1;
    }
    if (mi >= mods.length) {
      p.module = null;
      p.channel = null;
      p.repere = "";
      continue;
    }
    p.module = mods[mi].number;
    p.channel = ch;
    p.repere = modulePointCode(direction, mods[mi], ch);
    ch += 1;
  }
}

/** Renvoie une nouvelle liste de points avec module/canal/repère (ré)affectés. */
export function affecterAuto(project: Project): Point[] {
  const points = (project.points ?? []).map((p) => ({ ...p }));
  const modules = project.modules ?? [];
  assignerSens(points, modules, "input");
  assignerSens(points, modules, "output");
  return points;
}
