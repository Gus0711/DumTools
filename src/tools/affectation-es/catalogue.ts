// Base matériel « éditable » : types partagés + valeurs par défaut (spec Distech).
// Ces défauts servent de seed BDD et de fallback. La source de vérité runtime est
// la BDD (catalogue-queries.ts) ; catalog.ts reste utilisé par l'import GFX/PDF.
import { CONTROLLER_CATALOG, MODULE_TYPE_DEFS } from "./catalog";
import { CONTROLLER_IMAGES, MODULE_IMAGES } from "./images";

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
  /** Nombre max de modules d'extension (0 = non extensible). */
  maxModules: number;
  /** Capacité max en points d'E/S (0 = non spécifiée). */
  maxPoints: number;
  /** Lien fiche technique (PDF public). */
  docUrl: string;
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
  docUrl: string;
}

export interface Catalogue {
  automates: AutomateDef[];
  modules: ModuleDef[];
}

/** Modules d'extension (E/S) proposés par défaut aux automates extensibles. */
export const MODULES_EXTENSION = ["8UI6UO", "8UI", "16DI", "8DOR", "4UI4UO", "6UO", "8UI6DOT"];

/** Modules de communication raccordables sur le bus des automates extensibles. */
export const MODULES_COMMUNICATION = ["MBUS", "RS485"];

/** Compatibilité par défaut d'un automate extensible : E/S + communication. */
export const MODULES_COMPAT_DEFAUT = [...MODULES_EXTENSION, ...MODULES_COMMUNICATION];

const DOC = "/materiel/Documentations_Distech/";

/** Catalogue par défaut (spec constructeur Distech). */
export function catalogueParDefaut(): Catalogue {
  const C = CONTROLLER_CATALOG;
  const D = MODULE_TYPE_DEFS;

  const auto = (
    reference: string,
    image: string,
    alimIntegree: boolean,
    alimLabel: string,
    def: (typeof D)[string] | undefined,
    extensible: boolean,
    maxModules: number,
    maxPoints: number,
    docFile: string,
  ): AutomateDef => ({
    reference,
    image,
    alimIntegree,
    alimLabel,
    entreeKind: def?.inputKind || "UI",
    entreeCount: def?.inputCount ?? 0,
    sortieKind: def?.outputKind || "UO",
    sortieCount: def?.outputCount ?? 0,
    entreeCodes: def?.inputCodes ?? [],
    sortieCodes: def?.outputCodes ?? [],
    extensible,
    modulesCompat: extensible ? [...MODULES_COMPAT_DEFAUT] : [],
    maxModules,
    maxPoints,
    docUrl: docFile ? DOC + docFile : "",
  });

  const imgS1000 = C["ECY-S1000E-48"].img;
  const imgApex = CONTROLLER_IMAGES["ECY-APEX"];
  const automates: AutomateDef[] = [
    auto("ECY-300", C["ECY-300"].img, true, "24 VAC/DC", D["ECY-300"], false, 0, 18, "ECY-300-Series_SP.pdf"),
    auto("ECY-350", C["ECY-300"].img, true, "24 VAC/DC", D["ECY-300"], false, 0, 18, "ECY-300-Series_SP.pdf"),
    auto("ECY-303", C["ECY-303"].img, true, "24 VAC/DC (bloc 18 VDC)", D["ECY-303"], false, 0, 16, "ECY-303_SP.pdf"),
    auto("ECY-303-M3", C["ECY-303"].img, true, "24 VAC/DC (bloc 18 VDC)", D["ECY-303"], false, 0, 16, "ECY-303_SP.pdf"),
    auto("ECY-400", C["ECY-400"].img, true, "24 VAC/DC (alim. directe)", D["ECY-400"], false, 0, 24, "ECY-400-Series_SP.pdf"),
    auto("ECY-450", C["ECY-450"].img, true, "24 VAC/DC (alim. directe)", D["ECY-450"], false, 0, 24, "ECY-400-Series_SP.pdf"),
    auto("ECY-600", C["ECY-600"].img, true, "24 VAC/DC (alim. directe)", D["ECY-600"], true, 20, 62, "ECY-600-Series_SP.pdf"),
    auto("ECY-650", C["ECY-650"].img, true, "24 VAC/DC (alim. directe)", D["ECY-650"], true, 20, 62, "ECY-600-Series_SP.pdf"),
    auto(
      "ECY-PTU-107",
      C["ECY-PTU-207"].img,
      true,
      "100–240 VAC",
      {
        inputKind: "UI",
        inputCount: 6,
        outputKind: "OUT",
        outputCount: 6,
        inputCodes: ["UI1", "UI2", "UI3", "SI4", "DI5", "DI6"],
        outputCodes: ["DO1", "DO2", "DO3", "DO4", "DO5", "DO6"],
      },
      false,
      0,
      12,
      "ECY-PTU_SP.pdf",
    ),
    auto("ECY-PTU-207", C["ECY-PTU-207"].img, true, "100–240 VAC", D["ECY-PTU-207"], false, 0, 16, "ECY-PTU_SP.pdf"),
    auto("ECY-PTU-208", C["ECY-PTU-207"].img, true, "100–240 VAC (+ sortie 24 VAC)", D["ECY-PTU-207"], false, 0, 16, "ECY-PTU_SP.pdf"),
    auto("ECY-S1000E-28", imgS1000, false, "", undefined, true, 20, 28, "ECY-S1000_SP.pdf"),
    auto("ECY-S1000E-48", imgS1000, false, "", undefined, true, 20, 48, "ECY-S1000_SP.pdf"),
    auto("ECY-S1000E-320", imgS1000, false, "", undefined, true, 20, 320, "ECY-S1000_SP.pdf"),
    auto("ECY-APEX", imgApex, true, "24 VAC/DC (alim. directe)", undefined, true, 20, 320, "ECLYPSE APEX BI_SP.pdf"),
    auto("ECY-APEX-48", imgApex, true, "24 VAC/DC (alim. directe)", undefined, true, 20, 48, "ECLYPSE APEX BI_SP.pdf"),
  ];

  const IO_DOC = DOC + "ECY IO Modules_SP.pdf";
  const mod = (
    type: string,
    categorie: ModuleCategorie,
    entreeKind: string,
    entreeCount: number,
    sortieKind: string,
    sortieCount: number,
  ): ModuleDef => ({
    type,
    image: MODULE_IMAGES[type.replace("-HOA", "")] ?? "",
    categorie,
    entreeKind,
    entreeCount,
    sortieKind,
    sortieCount,
    docUrl: categorie === "extension" ? IO_DOC : "",
  });

  const modules: ModuleDef[] = [
    mod("8UI6UO", "extension", "UI", 8, "UO", 6),
    mod("8UI", "extension", "UI", 8, "UO", 0),
    mod("16DI", "extension", "DI", 16, "DO", 0),
    mod("8DOR", "extension", "DI", 0, "DO", 8),
    mod("4UI4UO", "extension", "UI", 4, "UO", 4),
    mod("6UO", "extension", "UI", 0, "UO", 6),
    mod("8UI6DOT", "extension", "UI", 8, "DO", 6),
    mod("8UI6UO-HOA", "extension", "UI", 8, "UO", 6),
    mod("4UI4UO-HOA", "extension", "UI", 4, "UO", 4),
    mod("6UO-HOA", "extension", "UI", 0, "UO", 6),
    mod("8UI6DOT-HOA", "extension", "UI", 8, "DO", 6),
    mod("8DOR-HOA", "extension", "DI", 0, "DO", 8),
    mod("MBUS", "communication", "", 0, "", 0),
    mod("RS485", "communication", "", 0, "", 0),
    mod("SCREEN", "accessoire", "", 0, "", 0),
  ];

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

/** Convertit un ModuleDef en champs d'un objet `Module` de projet. */
export function moduleFieldsFromDef(def: ModuleDef) {
  return {
    inputKind: def.entreeKind,
    inputCount: def.entreeCount,
    outputKind: def.sortieKind,
    outputCount: def.sortieCount,
  };
}
