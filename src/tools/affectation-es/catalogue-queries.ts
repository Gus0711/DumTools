import { prisma } from "@/lib/db";
import { documentationsParProduit } from "@/tools/magasin/documentation";
import { lienDocumentation } from "@/tools/magasin/model";
import {
  catalogueParDefaut,
  type AutomateDef,
  type Catalogue,
  type LienDoc,
  type ModuleCategorie,
  type ModuleDef,
} from "./catalogue";

/* =============================================================================
 * LA DOCUMENTATION NE VIT PLUS ICI
 *
 * Une fiche technique appartient au PRODUIT du magasin ; la base matériel la
 * lit par `produitId`. Le `docUrl` historique (un PDF de `public/`) reste comme
 * REPLI : tant qu'un modèle n'est relié à aucun produit, c'est lui qui répond,
 * et rien ne casse le jour où on retire cet écran.
 * ========================================================================== */

/** Les fiches des produits reliés, prêtes à afficher, par id de produit. */
async function docsParProduit(
  produitIds: (string | null)[],
): Promise<Map<string, LienDoc[]>> {
  const parProduit = await documentationsParProduit(
    produitIds.filter((x): x is string => !!x),
  );
  const sortie = new Map<string, LienDoc[]>();
  for (const [produitId, docs] of parProduit) {
    sortie.set(
      produitId,
      docs.map((d) => ({ id: d.id, titre: d.titre, href: lienDocumentation(d) })),
    );
  }
  return sortie;
}

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
  maxModules: number;
  maxPoints: number;
  docUrl: string;
  produitId: string | null;
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
  docUrl: string;
  produitId: string | null;
};

function toAutomateDef(r: AutomateRowDb, docs: LienDoc[] = []): AutomateDef {
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
    maxModules: r.maxModules ?? 0,
    maxPoints: r.maxPoints ?? 0,
    docUrl: r.docUrl ?? "",
    docs,
  };
}

function toModuleDef(r: ModuleRowDb, docs: LienDoc[] = []): ModuleDef {
  return {
    type: r.type,
    image: r.image,
    categorie: (r.categorie as ModuleCategorie) ?? "extension",
    entreeKind: r.entreeKind,
    entreeCount: r.entreeCount,
    sortieKind: r.sortieKind,
    sortieCount: r.sortieCount,
    docUrl: r.docUrl ?? "",
    docs,
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
  const docs = await docsParProduit([
    ...automates.map((a) => a.produitId),
    ...modules.map((m) => m.produitId),
  ]);
  return {
    automates: automates.map((a) => toAutomateDef(a, docs.get(a.produitId ?? "") ?? [])),
    modules: modules.map((m) => toModuleDef(m, docs.get(m.produitId ?? "") ?? [])),
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
  const docs = await docsParProduit([
    ...automates.map((a) => a.produitId),
    ...modules.map((m) => m.produitId),
  ]);
  return {
    automates: automates.map((r) => ({
      id: r.id,
      ordre: r.ordre,
      actif: r.actif,
      ...toAutomateDef(r, docs.get(r.produitId ?? "") ?? []),
    })),
    modules: modules.map((r) => ({
      id: r.id,
      ordre: r.ordre,
      actif: r.actif,
      ...toModuleDef(r, docs.get(r.produitId ?? "") ?? []),
    })),
    vide: automates.length === 0 && modules.length === 0,
  };
}
