// Recommandation d'automate en fonction de la liste de points.
// « Solution complète » : automate (E/S intégrées éventuelles) + modules
// d'extension nécessaires. Piloté par le catalogue matériel éditable
// (voir catalogue.ts / catalogue-queries.ts) : extensibilité et modules
// compatibles sont respectés — un automate non extensible n'est proposé que
// si ses E/S intégrées couvrent seules le besoin.
import type { AutomateDef, Catalogue, ModuleDef } from "./catalogue";
import type { Point, Project } from "./model";

export interface Besoin {
  entrees: number;
  sorties: number;
  entreesAna: number;
  entreesTor: number;
  sortiesAna: number;
  sortiesTor: number;
}

export interface Proposition {
  reference: string;
  /** E/S intégrées à l'automate (0 pour les bases modulaires type S1000E). */
  uiIntegre: number;
  uoIntegre: number;
  /** Nombre de modules d'extension à ajouter. */
  modules: number;
  /** Type de module d'extension retenu (null si couvert sans module). */
  moduleType: string | null;
  /** Nombre total d'appareils (automate + modules). */
  appareils: number;
  entreesDispo: number;
  sortiesDispo: number;
  resteEntrees: number;
  resteSorties: number;
  /** Total d'E/S disponibles non utilisées (plus c'est bas, plus c'est efficace). */
  gaspillage: number;
  couvreSansModule: boolean;
}

const estTor = (p: Point) => String(p.signal || "").toUpperCase() === "D";

export function calculerBesoin(project: Project): Besoin {
  const actifs = (project.points ?? []).filter((p) => p.active);
  const ins = actifs.filter((p) => p.direction === "input");
  const outs = actifs.filter((p) => p.direction === "output");
  return {
    entrees: ins.length,
    sorties: outs.length,
    entreesTor: ins.filter(estTor).length,
    entreesAna: ins.filter((p) => !estTor(p)).length,
    sortiesTor: outs.filter(estTor).length,
    sortiesAna: outs.filter((p) => !estTor(p)).length,
  };
}

/** Choisit le module d'extension « universel » (E + S) le plus adapté parmi les
 *  modules compatibles de l'automate. Préférence : 8UI6UO. */
function choisirModuleExtension(catalogue: Catalogue, automate: AutomateDef): ModuleDef | undefined {
  const compat = automate.modulesCompat;
  const candidats = catalogue.modules.filter(
    (m) =>
      m.categorie === "extension" &&
      m.entreeCount > 0 &&
      m.sortieCount > 0 &&
      (compat.length === 0 || compat.includes(m.type)),
  );
  if (candidats.length === 0) return undefined;
  return (
    candidats.find((m) => m.type === "8UI6UO") ??
    candidats
      .slice()
      .sort((a, b) => b.entreeCount + b.sortieCount - (a.entreeCount + a.sortieCount))[0]
  );
}

export function proposerAutomates(besoin: Besoin, catalogue: Catalogue): Proposition[] {
  const { entrees, sorties } = besoin;
  const propositions: Proposition[] = [];

  for (const a of catalogue.automates) {
    const ui = a.entreeCount;
    const uo = a.sortieCount;
    const resteIn = Math.max(0, entrees - ui);
    const resteOut = Math.max(0, sorties - uo);

    // Couvert par les E/S intégrées seules.
    if (resteIn === 0 && resteOut === 0) {
      propositions.push({
        reference: a.reference,
        uiIntegre: ui,
        uoIntegre: uo,
        modules: 0,
        moduleType: null,
        appareils: 1,
        entreesDispo: ui,
        sortiesDispo: uo,
        resteEntrees: ui - entrees,
        resteSorties: uo - sorties,
        gaspillage: ui - entrees + (uo - sorties),
        couvreSansModule: true,
      });
      continue;
    }

    // Ne couvre pas seul : nécessite des modules → uniquement si extensible.
    if (!a.extensible) continue;
    const mod = choisirModuleExtension(catalogue, a);
    if (!mod) continue;

    const count = Math.max(
      resteIn > 0 ? Math.ceil(resteIn / mod.entreeCount) : 0,
      resteOut > 0 ? Math.ceil(resteOut / mod.sortieCount) : 0,
      1,
    );
    const entreesDispo = ui + count * mod.entreeCount;
    const sortiesDispo = uo + count * mod.sortieCount;
    propositions.push({
      reference: a.reference,
      uiIntegre: ui,
      uoIntegre: uo,
      modules: count,
      moduleType: mod.type,
      appareils: 1 + count,
      entreesDispo,
      sortiesDispo,
      resteEntrees: entreesDispo - entrees,
      resteSorties: sortiesDispo - sorties,
      gaspillage: entreesDispo - entrees + (sortiesDispo - sorties),
      couvreSansModule: false,
    });
  }

  // « Le plus efficace » = le moins d'appareils, puis le moins d'E/S gaspillées.
  propositions.sort(
    (a, b) =>
      a.appareils - b.appareils ||
      a.gaspillage - b.gaspillage ||
      Number(b.couvreSansModule) - Number(a.couvreSansModule) ||
      a.reference.localeCompare(b.reference),
  );
  return propositions;
}
