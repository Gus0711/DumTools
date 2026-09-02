// Dérivation entre la saisie « liste de points » (Project.rows) et les E/S
// physiques affectées aux bornes (Project.points), consommées par l'aperçu,
// les tests et la reco. Règle métier : 1 ligne = 1 type d'E/S exclusif.
import { emptyIo, IO_TYPES, type Io, type IoType, type PointRow } from "@/tools/liste-points/model";
import {
  FUSION,
  normaliserPourImport,
  type EntreeVocabulaire,
} from "@/tools/liste-points/vocabulaire";
import type { Point } from "./model";

const IO_TO_DIR: Record<IoType, "input" | "output" | null> = {
  AI: "input",
  DI: "input",
  AO: "output",
  DO: "output",
  COM: null,
};

/** Le type d'E/S unique d'une ligne (ou null : section, vide, non typé). */
export function ioTypeOf(io: Io | undefined): IoType | null {
  if (!io) return null;
  for (const k of IO_TYPES) if (io[k]) return k;
  return null;
}

/** Signal électrique par défaut selon le type (TOR → "D", sinon 0-10V). */
export function signalParDefaut(t: IoType): string {
  return t === "DI" || t === "DO" ? "D" : "0-10V";
}

/** Un signal est-il cohérent avec la FAMILLE du type ? (TOR = "D" ; analogique ≠ "D"). */
function signalCoherent(signal: string | undefined, t: IoType): boolean {
  if (!signal) return false;
  const tor = t === "DI" || t === "DO";
  return tor ? signal === "D" : signal !== "D";
}

/**
 * Régénère les points (E/S physiques) depuis les lignes de la liste.
 * 1 ligne point non-COM → 1 point. Préserve l'affectation borne (module/canal/
 * repère), le signal affiné, le relais et le suivi de test en réappariant par id
 * (row.id === point.uid). Les COM et sections ne produisent pas de point.
 */
export function syncPoints(rows: PointRow[], existants: Point[]): Point[] {
  const parId = new Map(existants.map((p) => [p.uid, p]));
  const out: Point[] = [];
  for (const r of rows) {
    if (r.kind !== "point") continue;
    const t = ioTypeOf(r.io);
    if (!t || t === "COM") continue;
    const dir = IO_TO_DIR[t] as "input" | "output";
    const prev = parId.get(r.id);
    const memeSens = prev?.direction === dir;
    // Priorité du signal, chacun retenu s'il est cohérent avec la FAMILLE du type
    // (TOR = "D" ; analogique ≠ "D") :
    //   1. signal du point existant (affinage manuel en onglet Affectation) ;
    //   2. signal issu du catalogue, porté par la ligne (row.signal) ;
    //   3. défaut selon le type.
    // Ainsi DI→AI repasse bien de "D" à 0-10V, et une sonde catalogue en PT1000
    // arrive directement affectée sans repasser par le défaut.
    const signal =
      memeSens && signalCoherent(prev?.signal, t)
        ? prev!.signal
        : signalCoherent(r.signal, t)
          ? r.signal
          : signalParDefaut(t);
    out.push({
      uid: r.id,
      direction: dir,
      active: prev?.active ?? true,
      designation: r.nom,
      repere: memeSens ? prev?.repere ?? "" : "",
      signal,
      source: r.note ?? prev?.source ?? "",
      relay: memeSens ? prev?.relay ?? "" : "",
      module: memeSens ? prev?.module ?? null : null,
      channel: memeSens ? prev?.channel ?? null : null,
      testStatus: prev?.testStatus,
      testComment: prev?.testComment,
    });
  }
  return out;
}

/** Le type d'E/S d'un point physique, déduit de son sens et de son signal. */
export function ioTypeDePoint(direction: "input" | "output", signal: string | undefined): IoType {
  return direction === "input" ? (signal === "D" ? "DI" : "AI") : signal === "D" ? "DO" : "AO";
}

/** Reconstruit des lignes de liste depuis des points (import GFX/PDF). */
export function pointsToRows(points: Point[]): PointRow[] {
  return points.map((p) => {
    const io = emptyIo();
    const t = ioTypeDePoint(p.direction, p.signal);
    io[t] = 1;
    return {
      id: p.uid,
      kind: "point" as const,
      nom: p.designation,
      note: p.source ?? "",
      io,
      signal: p.signal,
    };
  });
}

// --- Nommage des points importés --------------------------------------------

/**
 * Ramène les désignations d'un programme client sur le vocabulaire de
 * l'entreprise, au moment même de l'import.
 *
 * L'automate nomme ses points comme le programmeur les a tapés
 * (« ODM_Dalles_Secretariat ») : le local est DANS le nom. Recopié tel quel, il
 * faisait de chaque import une nouvelle source de pollution — la BOM apparie
 * sur le nom EXACT, donc un nom localisé = du matériel absent de la liste (voir
 * docs/ARCHITECTURE.md §5).
 *
 * Ce qui n'était qu'un repère de lieu rejoint le texte libre, DEVANT le repère
 * de câblage que l'import y écrit déjà (« Import GFX - Module 2 / UI3 ») : le
 * distinctif se lit en premier, la traçabilité reste derrière. Et quand le
 * vocabulaire ne reconnaît rien, on ne touche à rien : l'écran de saisie
 * avertit déjà sur les noms localisés, un humain tranchera.
 */
export function nommeurImport(vocabulaire: EntreeVocabulaire[]) {
  let normalises = 0;
  return {
    /** Le couple (désignation, texte libre) d'un point qu'on vient de lire. */
    nommer(brut: string, direction: "input" | "output", signal: string | undefined, cablage: string) {
      const n = normaliserPourImport(brut, ioTypeDePoint(direction, signal), vocabulaire);
      if (!n) return { designation: brut, source: cablage };
      if (n.nom !== brut || n.complement) normalises++;
      return {
        designation: n.nom,
        source: n.complement ? `${n.complement}${FUSION}${cablage}` : cablage,
      };
    },
    /** Combien de libellés ont été ramenés au vocabulaire — dit à l'écran. */
    get normalises() {
      return normalises;
    },
  };
}
