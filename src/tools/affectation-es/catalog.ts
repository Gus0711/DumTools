// Catalogue matériel Distech (données + définitions), porté de l'ancien outil.
// Les images vivent dans src/tools/affectation-es/images.ts (fichiers public/materiel).
import { CONTROLLER_IMAGES, MODULE_IMAGES } from "./images";

export interface ControllerInfo {
  reference: string;
  img: string;
  integratedPower: boolean;
  powerLabel: string;
}

export const CONTROLLER_CATALOG: Record<string, ControllerInfo> = {
  "ECY-400": { reference: "ECY-400", img: CONTROLLER_IMAGES["ECY-400"], integratedPower: true, powerLabel: "24 VAC/DC intégrée" },
  "ECY-450": { reference: "ECY-450", img: CONTROLLER_IMAGES["ECY-400"], integratedPower: true, powerLabel: "24 VAC/DC intégrée" },
  "ECY-600": { reference: "ECY-600", img: CONTROLLER_IMAGES["ECY-600"], integratedPower: true, powerLabel: "24 VAC/DC intégrée" },
  "ECY-650": { reference: "ECY-650", img: CONTROLLER_IMAGES["ECY-600"], integratedPower: true, powerLabel: "24 VAC/DC intégrée" },
  "ECY-PTU-207": { reference: "ECY-PTU-207", img: CONTROLLER_IMAGES["ECY-PTU-207"], integratedPower: true, powerLabel: "100–240 VAC intégrée" },
  "ECY-300": { reference: "ECY-300", img: CONTROLLER_IMAGES["ECY-300"], integratedPower: true, powerLabel: "24 VAC/DC intégrée" },
  "ECY-303": { reference: "ECY-303", img: CONTROLLER_IMAGES["ECY-303"], integratedPower: true, powerLabel: "24 VAC/DC intégrée" },
  "ECY-S1000E-28": { reference: "ECY-S1000E-28", img: CONTROLLER_IMAGES["ECY-S1000E"], integratedPower: false, powerLabel: "" },
  "ECY-S1000E-48": { reference: "ECY-S1000E-48", img: CONTROLLER_IMAGES["ECY-S1000E"], integratedPower: false, powerLabel: "" },
  "ECY-S1000E-320": { reference: "ECY-S1000E-320", img: CONTROLLER_IMAGES["ECY-S1000E"], integratedPower: false, powerLabel: "" },
};

export interface ModuleTypeDef {
  inputKind: string;
  inputCount: number;
  outputKind: string;
  outputCount: number;
  integratedController?: boolean;
  nonIoAccessory?: boolean;
  inputCodes?: string[];
  outputCodes?: string[];
}

/** Définitions par type de module / automate intégré (nombre et nature d'E/S). */
export const MODULE_TYPE_DEFS: Record<string, ModuleTypeDef> = {
  "8UI6UO": { inputKind: "UI", inputCount: 8, outputKind: "UO", outputCount: 6 },
  "8UI": { inputKind: "UI", inputCount: 8, outputKind: "UO", outputCount: 0 },
  "16DI": { inputKind: "DI", inputCount: 16, outputKind: "DO", outputCount: 0 },
  "8DOR": { inputKind: "DI", inputCount: 0, outputKind: "DO", outputCount: 8 },
  "4UI4UO": { inputKind: "UI", inputCount: 4, outputKind: "UO", outputCount: 4 },
  MBUS: { inputKind: "", inputCount: 0, outputKind: "", outputCount: 0 },
  RS485: { inputKind: "", inputCount: 0, outputKind: "", outputCount: 0 },
  SCREEN: { inputKind: "", inputCount: 0, outputKind: "", outputCount: 0, nonIoAccessory: true },
  "ECY-PTU-207": { inputKind: "UI", inputCount: 6, outputKind: "OUT", outputCount: 10, integratedController: true, inputCodes: ["UI1", "UI2", "UI3", "SI4", "DI5", "DI6"], outputCodes: ["DO1", "DO2", "DO3", "DO4", "DO5", "DO6", "AO7", "AO8", "AO9", "AO10"] },
  "ECY-300": { inputKind: "UI", inputCount: 10, outputKind: "UO", outputCount: 8, integratedController: true },
  "ECY-303": { inputKind: "UI", inputCount: 8, outputKind: "OUT", outputCount: 8, integratedController: true, inputCodes: ["UI1", "UI2", "UI3", "UI4", "UI5", "UI6", "UI7", "UI8"], outputCodes: ["DO1", "DO2", "DO3", "DO4", "DUO5", "DUO6", "UO7", "UO8"] },
  "ECY-400": { inputKind: "UI", inputCount: 12, outputKind: "UO", outputCount: 12, integratedController: true },
  "ECY-450": { inputKind: "UI", inputCount: 12, outputKind: "UO", outputCount: 12, integratedController: true },
  "ECY-600": { inputKind: "UI", inputCount: 16, outputKind: "UO", outputCount: 14, integratedController: true },
  "ECY-650": { inputKind: "UI", inputCount: 16, outputKind: "UO", outputCount: 14, integratedController: true },
};

export const CONTROLLER_OPTIONS = Object.keys(CONTROLLER_CATALOG);
export const MODULE_TYPE_OPTIONS = ["8UI6UO", "8UI", "16DI", "8DOR", "4UI4UO", "MBUS", "RS485"];
// Listes de signaux : source unique dans liste-points/model.ts (partagée avec
// l'écran catalogue de points et la dérivation). Réexport pour compat.
export { INPUT_SIGNALS, OUTPUT_SIGNALS, signalsForType } from "@/tools/liste-points/model";

/** Alimentations disponibles. */
export function powerSupplyInfo(value: string) {
  if (value === "230V")
    return { value, label: "100–240 VAC", title: "ECY-PS100-240", img: MODULE_IMAGES.ps230, integrated: false };
  if (value === "integrated")
    return { value: "24V", label: "24 VAC/DC", title: "ECY-PS24", img: MODULE_IMAGES.ps24, integrated: true };
  return { value: "24V", label: "24 VAC/DC", title: "ECY-PS24", img: MODULE_IMAGES.ps24, integrated: false };
}
