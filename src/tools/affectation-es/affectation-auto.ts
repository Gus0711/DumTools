// Affectation automatique des E/S aux bornes des modules, dans l'ordre de la
// liste. Entrées → bornes UI/DI ; sorties → bornes UO/DO. Remplit les canaux
// module par module selon les capacités. Le repère est posé via modulePointCode.
import {
  allowedModules,
  capaciteBorne,
  channelCount,
  isIntegratedControllerType,
  modulePointCode,
  moduleSort,
  pointEstTor,
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

interface Borne {
  number: number;
  channel: number;
  code: string;
  cap: ReturnType<typeof capaciteBorne>;
}

function assignerSens(points: Point[], modules: Project["modules"], direction: "input" | "output") {
  const mods = allowedModules(direction, modules).sort(moduleSort);

  // Toutes les bornes de ce sens, dans l'ordre module puis canal, avec leur
  // capacité électrique (triac/analogique/universelle) déduite du code.
  const bornes: Borne[] = [];
  for (const m of mods) {
    const n = channelCount(direction, m);
    for (let ch = 1; ch <= n; ch += 1) {
      const code = modulePointCode(direction, m, ch);
      bornes.push({ number: m.number, channel: ch, code, cap: capaciteBorne(code) });
    }
  }

  const pts = points.filter((p) => p.active && p.direction === direction);
  for (const p of pts) {
    p.module = null;
    p.channel = null;
    p.repere = "";
  }

  const libre = (p: Point) => p.module == null;
  const poser = (b: Borne, accepte: (p: Point) => boolean) => {
    const p = pts.find((x) => libre(x) && accepte(x));
    if (!p) return;
    p.module = b.number;
    p.channel = b.channel;
    p.repere = b.code;
  };

  // Passe 1 : bornes dédiées d'abord (triac ← TOR, analogique ← analogique), pour
  // réserver les bornes universelles à ce qui en a besoin et ne jamais poser un
  // point analogique sur un triac (ni un TOR sur une borne analogique seule).
  for (const b of bornes) {
    if (b.cap === "tor") poser(b, (p) => pointEstTor(p.signal));
    else if (b.cap === "ana") poser(b, (p) => !pointEstTor(p.signal));
  }
  // Passe 2 : bornes universelles pour les points restants, dans l'ordre de la liste.
  for (const b of bornes) {
    if (b.cap === "both") poser(b, () => true);
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
