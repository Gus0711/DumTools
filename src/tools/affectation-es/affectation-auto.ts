// Affectation automatique des E/S aux bornes des modules, dans l'ordre de la
// liste. Entrées → bornes UI/DI ; sorties → bornes UO/DO. Remplit les canaux
// module par module selon les capacités. Le repère est posé via modulePointCode.
import {
  allowedModules,
  channelCount,
  isIntegratedControllerType,
  modulePointCode,
  moduleSort,
  type Module,
  type Point,
  type Project,
} from "./model";
import { automateDef, type Catalogue } from "./catalogue";

/** Numéro réservé au module « E/S intégrées de l'automate » (extensions ≥ 1). */
export const NUM_MODULE_INTEGRE = 0;

/** Module représentant les E/S intégrées de l'automate (null si aucune : S1000E). */
export function moduleIntegre(catalogue: Catalogue, reference: string): Module | null {
  const a = automateDef(catalogue, reference);
  if (!a) return null;
  if ((a.entreeCount ?? 0) <= 0 && (a.sortieCount ?? 0) <= 0) return null;
  return {
    number: NUM_MODULE_INTEGRE,
    type: a.reference,
    inputKind: a.entreeKind || "UI",
    inputCount: a.entreeCount || 0,
    outputKind: a.sortieKind || "UO",
    outputCount: a.sortieCount || 0,
    integratedController: true,
    inputCodes: a.entreeCodes?.length ? a.entreeCodes : undefined,
    outputCodes: a.sortieCodes?.length ? a.sortieCodes : undefined,
  };
}

/**
 * Réconcilie la liste des modules pour l'automate choisi : garde les modules
 * d'extension / communication existants, remplace le module intégré par celui
 * du nouvel automate (ou l'enlève si l'automate n'a pas d'E/S intégrée).
 */
export function reconcilierModules(
  catalogue: Catalogue,
  reference: string,
  existants: Module[],
): Module[] {
  const sansIntegre = (existants ?? []).filter((m) => !isIntegratedControllerType(m));
  const integ = moduleIntegre(catalogue, reference);
  return integ ? [integ, ...sansIntegre] : sansIntegre;
}

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
