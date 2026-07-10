// Modèle de données de l'outil « Affectation E/S depuis GFX » (partagé client/serveur).
// Porté de l'ancien outil : le projet complet est un objet JSON unique.
import { CONTROLLER_CATALOG, MODULE_TYPE_DEFS, type ControllerInfo } from "./catalog";
import type { PointRow } from "@/tools/liste-points/model";

export interface Point {
  uid: string;
  direction: "input" | "output";
  active: boolean;
  designation: string;
  repere?: string;
  signal?: string;
  source?: string;
  /** Sorties uniquement : relais associé. */
  relay?: string;
  /** Affectation à un module/canal (null = non affecté). */
  module?: number | null;
  channel?: number | null;
  /** Suivi de mise en service. */
  testStatus?: string;
  testComment?: string;
}

export interface Module {
  number: number;
  type: string;
  inputKind: string;
  inputCount: number;
  outputKind: string;
  outputCount: number;
  moduleId?: string;
  integratedController?: boolean;
  nonIoAccessory?: boolean;
  inputCodes?: string[];
  outputCodes?: string[];
  /** Numéro d'origine dans le fichier GFX (interne à l'import). */
  gfxNumber?: number;
}

export interface Project {
  name: string;
  header: string;
  document_title: string;
  version: string;
  date: string;
  controller: string;
  power_supply: string;
  network_1: string;
  network_2: string;
  wifi_ssid: string;
  wifi_password: string;
  /** IP du port 1 (réseau 1). Historiquement le seul champ IP. */
  controller_ip: string;
  /** IP du port 2 (réseau 2) — les ECLYPSE ont 2 ports pouvant être séparés. */
  controller_ip_2?: string;
  include_references: boolean;
  gfx_header_2: string;
  gfx_header_3: string;
  gfx_include_generalities: boolean;
  gfx_include_standard_blocks: boolean;
  /** Saisie « liste de points » (source) — 1 ligne = 1 type d'E/S exclusif. */
  rows: PointRow[];
  /** E/S physiques dérivées des `rows` (affectées aux bornes). Voir derivation.ts. */
  points: Point[];
  modules: Module[];
}

export const MODULE_TYPE_OPTIONS = ["8UI6UO", "8UI", "16DI", "8DOR", "4UI4UO", "MBUS", "RS485"];

export function defaultProject(dateLabel: string): Project {
  return {
    name: "Nouveau projet",
    header: "CLIENT - SITE",
    document_title: "Affectation entrées sorties automate Distech Controls",
    version: "1.0",
    date: dateLabel,
    controller: "",
    power_supply: "none",
    network_1: "RJ45 - BACnet/IP",
    network_2: "RJ45 - supervision",
    wifi_ssid: "ECLYPSE-XXXX",
    wifi_password: "????",
    controller_ip: "?.?.?.?",
    controller_ip_2: "?.?.?.?",
    include_references: false,
    gfx_header_2: "CLIENT - SITE",
    gfx_header_3: "Affectation des entrées / sorties",
    gfx_include_generalities: true,
    gfx_include_standard_blocks: false,
    rows: [],
    points: [],
    modules: [],
  };
}

// --- Normalisation / détection (porté à l'identique) ------------------------

export function normalizeControllerReference(value: string): string {
  const raw = String(value || "").trim().toUpperCase().replace(/[‐‑–—_]/g, "-").replace(/\s+/g, "");
  if (/^(?:ECY-?)?PTU-?(?:207|270)$/.test(raw)) return "ECY-PTU-207";
  if (/^(?:ECY-?)?400$/.test(raw)) return "ECY-400";
  if (/^(?:ECY-?)?450$/.test(raw)) return "ECY-450";
  if (/^(?:ECY-?)?600$/.test(raw)) return "ECY-600";
  if (/^(?:ECY-?)?650$/.test(raw)) return "ECY-650";
  if (/^(?:ECY-?)?300$/.test(raw)) return "ECY-300";
  if (/^(?:ECY-?)?303$/.test(raw)) return "ECY-303";
  if (/^(?:ECY-?)?S1000E?-?28$/.test(raw)) return "ECY-S1000E-28";
  if (/^(?:ECY-?)?S1000E?-?320$/.test(raw)) return "ECY-S1000E-320";
  if (/^(?:ECY-?)?S1000E?-?48$/.test(raw)) return "ECY-S1000E-48";
  if (/^(?:ECY-?)?S1000E?$/.test(raw)) return "ECY-S1000E-48";
  return String(value || "").trim();
}

export function controllerInfo(value: string): ControllerInfo {
  const reference = normalizeControllerReference(value);
  return (
    CONTROLLER_CATALOG[reference] ?? {
      reference,
      img: CONTROLLER_CATALOG["ECY-S1000E-48"].img,
      integratedPower: false,
      powerLabel: "",
    }
  );
}

const norm = (v: unknown) =>
  String((typeof v === "object" && v ? (v as Module).type : v) || "")
    .toUpperCase()
    .replace(/[-_\s]/g, "");

export function isScreenType(value: unknown): boolean {
  const obj = typeof value === "object" && value ? (value as Module) : null;
  const type = norm(value);
  return type === "SCREEN" || type === "ECRAN" || String(obj?.moduleId || "") === "50";
}

export function isCommunicationType(value: unknown): boolean {
  const type = norm(value);
  return type === "RS485" || type === "MBUS";
}

export function isIntegratedControllerType(value: unknown): boolean {
  const obj = typeof value === "object" && value ? (value as Module) : null;
  if (obj?.integratedController) return true;
  return ["ECYPTU207", "PTU207", "ECY300", "ECY303", "ECY400", "ECY450", "ECY600", "ECY650"].includes(norm(value));
}

export function modulePointCode(direction: "input" | "output", module: Module | undefined, channel: number): string {
  const list = direction === "input" ? module?.inputCodes : module?.outputCodes;
  if (Array.isArray(list) && list[channel - 1]) return list[channel - 1];
  const kind = direction === "input" ? module?.inputKind || "UI" : module?.outputKind || "UO";
  return `${kind}${channel}`;
}

/** Détecte le type d'un module à partir de son libellé / id GFX. */
export function detectModuleDefinition(number: number, name: string, moduleId?: string | number): Module {
  const raw = String(name || "").toUpperCase().replace(/[–—]/g, "-");
  const label = raw.replace(/\s+/g, "");
  const compact = label.replace(/[-_]/g, "");
  const id = String(moduleId ?? "").trim();
  let type = "";
  if (compact.includes("ECYPTU207") || compact === "PTU207") type = "ECY-PTU-207";
  else if (compact.includes("ECY300")) type = "ECY-300";
  else if (compact.includes("ECY303")) type = "ECY-303";
  else if (compact.includes("ECY400")) type = "ECY-400";
  else if (compact.includes("ECY450")) type = "ECY-450";
  else if (compact.includes("ECY600")) type = "ECY-600";
  else if (compact.includes("ECY650")) type = "ECY-650";
  else if (label.includes("16DI")) type = "16DI";
  else if (label.includes("8DOR")) type = "8DOR";
  else if (label.includes("4UI4UO")) type = "4UI4UO";
  else if (label.includes("8UI6UO")) type = "8UI6UO";
  else if (label.includes("8UI")) type = "8UI";
  else if (label.includes("MBUS")) type = "MBUS";
  else if (label.includes("RS485")) type = "RS485";
  else if (id === "50" || compact.includes("ECRAN") || compact.includes("SCREEN") || compact.includes("LCD")) type = "SCREEN";
  else if (id === "1") type = "8UI6UO";
  else if (id === "2") type = "16DI";
  else if (id === "3") type = "8DOR";
  else if (id === "4") type = "4UI4UO";
  else if (id === "5") type = "8UI";
  else if (id === "6") type = "MBUS";
  else if (id === "7") type = "RS485";
  else type = "8UI6UO";
  return { number: Number(number), type, moduleId: id, ...MODULE_TYPE_DEFS[type] };
}

export function moduleDisplayTitle(module: Module | null, modules: Module[]): string {
  if (!module) return "Équipement E/S";
  if (isCommunicationType(module)) return `ECY-${module.type}`;
  if (isIntegratedControllerType(module)) {
    const sameType = modules.filter(
      (m) => isIntegratedControllerType(m) && String(m.type) === String(module.type),
    );
    return sameType.length > 1 ? `Automate ${module.number} - ${module.type}` : `Automate ${module.type}`;
  }
  return `Module ${module.number} - ${module.type}`;
}

export function controllerHasIntegratedIo(value: string): boolean {
  return ["ECY-PTU-207", "ECY-300", "ECY-303", "ECY-400", "ECY-450", "ECY-600", "ECY-650"].includes(
    normalizeControllerReference(value),
  );
}

export function controllerHasIntegratedPower(value: string): boolean {
  return controllerInfo(value).integratedPower;
}

/** Renumérote les modules de communication en négatif (comme l'original). */
export function normalizeCommunicationModuleNumbers(modules: Module[]): Module[] {
  const result: Module[] = [];
  let comm = -1;
  (modules || []).forEach((m) => {
    if (isCommunicationType(m)) result.push({ ...m, number: comm-- });
    else result.push(m);
  });
  return result;
}

export function normalizePdfText(value: unknown): string {
  return String(value ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
}

export function channelCount(direction: "input" | "output", module: Module | undefined): number {
  if (!module) return 0;
  return direction === "input" ? module.inputCount : module.outputCount;
}

export function pointLabel(p: Point | undefined, includeReferences: boolean): string {
  if (!p) return "";
  return includeReferences && p.repere ? `${p.repere} - ${p.designation}` : p.designation;
}

/** Modules pouvant accueillir un point de cette direction. */
export function allowedModules(direction: "input" | "output", modules: Module[]): Module[] {
  return modules.filter(
    (m) =>
      !isCommunicationType(m) &&
      (direction === "input" ? m.inputCount > 0 : m.outputCount > 0),
  );
}

/** Point actif affecté à ce module/canal, s'il existe. */
export function getAssigned(
  points: Point[],
  direction: "input" | "output",
  moduleNumber: number,
  channel: number,
): Point | undefined {
  return points.find(
    (p) =>
      p.active &&
      p.direction === direction &&
      Number(p.module) === Number(moduleNumber) &&
      Number(p.channel) === Number(channel),
  );
}

export function moduleSort(a: Module, b: Module): number {
  const ac = isCommunicationType(a);
  const bc = isCommunicationType(b);
  if (ac !== bc) return ac ? -1 : 1;
  if (ac && bc) return Math.abs(Number(a.number) || 0) - Math.abs(Number(b.number) || 0);
  return (Number(a.number) || 0) - (Number(b.number) || 0);
}

// --- Capacité électrique des bornes (triac vs universelle) ------------------
// Une borne triac (DO/DOT sur ECY-303) est TOR seule : elle ne peut pas piloter
// une sortie analogique 0-10V. À l'inverse une borne AO (ex. ECY-PTU-207) est
// analogique seule. Ces règles pilotent l'affectation auto ET la validation.

export type BorneCapacite = "tor" | "ana" | "both";

/** Nature électrique qu'une borne peut piloter, déduite du préfixe de son code.
 *  DO/DI = TOR seul ; AO/AI = analogique seul ; UO/DUO/UI (et SI, inconnus) =
 *  universel (les deux). */
export function capaciteBorne(code: string | undefined): BorneCapacite {
  const c = String(code || "").trim().toUpperCase();
  if (c.startsWith("DUO") || c.startsWith("UO") || c.startsWith("UI")) return "both";
  if (c.startsWith("DO") || c.startsWith("DI")) return "tor";
  if (c.startsWith("AO") || c.startsWith("AI")) return "ana";
  return "both";
}

/** Un point est-il TOR (signal "D") ? Sinon il est analogique. */
export function pointEstTor(signal: string | undefined): boolean {
  return String(signal || "").toUpperCase() === "D";
}

/** Le signal d'un point est-il compatible avec la borne de son repère ?
 *  Ex. incohérent : une vanne 0-10V (analogique) affectée à une borne triac DO. */
export function signalCompatibleBorne(
  signal: string | undefined,
  repere: string | undefined,
): boolean {
  if (!repere) return true; // pas de borne affectée → rien à valider
  const cap = capaciteBorne(repere);
  if (cap === "both") return true;
  return cap === "tor" ? pointEstTor(signal) : !pointEstTor(signal);
}
