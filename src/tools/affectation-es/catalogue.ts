// Base matériel « éditable » : types partagés + valeurs par défaut dérivées des
// constantes historiques (catalog.ts). Ces défauts servent de seed BDD et de
// fallback si la table est vide. La source de vérité runtime est la BDD
// (voir catalogue-queries.ts) ; catalog.ts reste utilisé par l'import GFX/PDF.
import {
  CONTROLLER_CATALOG,
  CONTROLLER_OPTIONS,
  MODULE_TYPE_DEFS,
} from "./catalog";
import { MODULE_IMAGES } from "./images";

export interface AutomateDef {
  reference: string;
  image: string;
  alimIntegree: boolean;
  alimLabel: string;
  entreeKind: string;
  entreeCount: number;
  sortieKind: string;
  sortieCount: number;
  entreeCodes: string[];
  sortieCodes: string[];
  extensible: boolean;
  modulesCompat: string[];
}

export type ModuleCategorie = "extension" | "communication" | "accessoire";

export interface ModuleDef {
  type: string;
  image: string;
  categorie: ModuleCategorie;
  entreeKind: string;
  entreeCount: number;
  sortieKind: string;
  sortieCount: number;
}

export interface Catalogue {
  automates: AutomateDef[];
  modules: ModuleDef[];
}

/** Modules d'extension (E/S) proposés par défaut aux automates extensibles. */
export const MODULES_EXTENSION = ["8UI6UO", "8UI", "16DI", "8DOR", "4UI4UO"];

/** Modules de communication raccordables sur le bus des automates extensibles. */
export const MODULES_COMMUNICATION = ["MBUS", "RS485"];

/** Compatibilité par défaut d'un automate extensible : E/S + communication. */
export const MODULES_COMPAT_DEFAUT = [...MODULES_EXTENSION, ...MODULES_COMMUNICATION];

/** Extensibilité par défaut. Prudent : `false` sauf certitude — un automate non
 *  extensible n'est jamais proposé avec des modules par le moteur de reco. */
const EXTENSIBLE_DEFAUT: Record<string, boolean> = {
  "ECY-600": true,
  "ECY-650": true,
  "ECY-S1000E-28": true,
  "ECY-S1000E-48": true,
  "ECY-S1000E-320": true,
};

const MODULES_DEFAUT: { type: string; categorie: ModuleCategorie }[] = [
  { type: "8UI6UO", categorie: "extension" },
  { type: "8UI", categorie: "extension" },
  { type: "16DI", categorie: "extension" },
  { type: "8DOR", categorie: "extension" },
  { type: "4UI4UO", categorie: "extension" },
  { type: "MBUS", categorie: "communication" },
  { type: "RS485", categorie: "communication" },
  { type: "SCREEN", categorie: "accessoire" },
];

/** Catalogue par défaut, construit à partir des constantes historiques. */
export function catalogueParDefaut(): Catalogue {
  const automates: AutomateDef[] = CONTROLLER_OPTIONS.map((reference) => {
    const info = CONTROLLER_CATALOG[reference];
    const def = MODULE_TYPE_DEFS[reference];
    const extensible = EXTENSIBLE_DEFAUT[reference] ?? false;
    return {
      reference,
      image: info?.img ?? "",
      alimIntegree: info?.integratedPower ?? false,
      alimLabel: info?.powerLabel ?? "",
      entreeKind: def?.inputKind || "UI",
      entreeCount: def?.inputCount ?? 0,
      sortieKind: def?.outputKind || "UO",
      sortieCount: def?.outputCount ?? 0,
      entreeCodes: def?.inputCodes ?? [],
      sortieCodes: def?.outputCodes ?? [],
      extensible,
      modulesCompat: extensible ? [...MODULES_COMPAT_DEFAUT] : [],
    };
  });

  const modules: ModuleDef[] = MODULES_DEFAUT.map(({ type, categorie }) => {
    const def = MODULE_TYPE_DEFS[type];
    return {
      type,
      image: MODULE_IMAGES[type] ?? "",
      categorie,
      entreeKind: def?.inputKind || "",
      entreeCount: def?.inputCount ?? 0,
      sortieKind: def?.outputKind || "",
      sortieCount: def?.outputCount ?? 0,
    };
  });

  return { automates, modules };
}

// --- Helpers de lecture (utilisés par l'éditeur, la reco et l'aperçu) -------

export function automateDef(catalogue: Catalogue, reference: string): AutomateDef | undefined {
  const norm = (v: string) => v.trim().toUpperCase();
  return catalogue.automates.find((a) => norm(a.reference) === norm(reference));
}

export function moduleDef(catalogue: Catalogue, type: string): ModuleDef | undefined {
  const norm = (v: string) => v.trim().toUpperCase();
  return catalogue.modules.find((m) => norm(m.type) === norm(type));
}

/** Convertit un ModuleDef/AutomateDef en champs d'un objet `Module` de projet. */
export function moduleFieldsFromDef(def: ModuleDef) {
  return {
    inputKind: def.entreeKind,
    inputCount: def.entreeCount,
    outputKind: def.sortieKind,
    outputCount: def.sortieCount,
  };
}
