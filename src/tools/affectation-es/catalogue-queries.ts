import { prisma } from "@/lib/db";
import {
  catalogueParDefaut,
  type AutomateDef,
  type Catalogue,
  type ModuleCategorie,
  type ModuleDef,
} from "./catalogue";

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)) : [];

type AutomateRowDb = {
  id: string;
  reference: string;
  ordre: number;
  actif: boolean;
  image: string;
  alimIntegree: boolean;
  alimLabel: string;
  entreeKind: string;
  entreeCount: number;
  sortieKind: string;
  sortieCount: number;
  entreeCodes: unknown;
  sortieCodes: unknown;
  extensible: boolean;
  modulesCompat: unknown;
};

type ModuleRowDb = {
  id: string;
  type: string;
  ordre: number;
  actif: boolean;
  image: string;
  categorie: string;
  entreeKind: string;
  entreeCount: number;
  sortieKind: string;
  sortieCount: number;
};

function toAutomateDef(r: AutomateRowDb): AutomateDef {
  return {
    reference: r.reference,
    image: r.image,
    alimIntegree: r.alimIntegree,
    alimLabel: r.alimLabel,
    entreeKind: r.entreeKind,
    entreeCount: r.entreeCount,
    sortieKind: r.sortieKind,
    sortieCount: r.sortieCount,
    entreeCodes: asStringArray(r.entreeCodes),
    sortieCodes: asStringArray(r.sortieCodes),
    extensible: r.extensible,
    modulesCompat: asStringArray(r.modulesCompat),
  };
}

function toModuleDef(r: ModuleRowDb): ModuleDef {
  return {
    type: r.type,
    image: r.image,
    categorie: (r.categorie as ModuleCategorie) ?? "extension",
    entreeKind: r.entreeKind,
    entreeCount: r.entreeCount,
    sortieKind: r.sortieKind,
    sortieCount: r.sortieCount,
  };
}

/** Catalogue runtime (actifs uniquement). Fallback sur les défauts si BDD vide. */
export async function getCatalogue(): Promise<Catalogue> {
  const [automates, modules] = await Promise.all([
    prisma.automateModele.findMany({
      where: { actif: true },
      orderBy: [{ ordre: "asc" }, { reference: "asc" }],
    }),
    prisma.moduleModele.findMany({
      where: { actif: true },
      orderBy: [{ ordre: "asc" }, { type: "asc" }],
    }),
  ]);
  if (automates.length === 0 && modules.length === 0) return catalogueParDefaut();
  return {
    automates: automates.map(toAutomateDef),
    modules: modules.map(toModuleDef),
  };
}

// --- Lecture pour l'écran de configuration (tous, y compris inactifs) -------

export interface AutomateRow extends AutomateDef {
  id: string;
  ordre: number;
  actif: boolean;
}
export interface ModuleRow extends ModuleDef {
  id: string;
  ordre: number;
  actif: boolean;
}

export interface MaterielAdmin {
  automates: AutomateRow[];
  modules: ModuleRow[];
  /** true si la BDD est vide (aucune ligne) → proposer l'initialisation. */
  vide: boolean;
}

export async function getMaterielAdmin(): Promise<MaterielAdmin> {
  const [automates, modules] = await Promise.all([
    prisma.automateModele.findMany({ orderBy: [{ ordre: "asc" }, { reference: "asc" }] }),
    prisma.moduleModele.findMany({ orderBy: [{ ordre: "asc" }, { type: "asc" }] }),
  ]);
  return {
    automates: automates.map((r) => ({ id: r.id, ordre: r.ordre, actif: r.actif, ...toAutomateDef(r) })),
    modules: modules.map((r) => ({ id: r.id, ordre: r.ordre, actif: r.actif, ...toModuleDef(r) })),
    vide: automates.length === 0 && modules.length === 0,
  };
}
