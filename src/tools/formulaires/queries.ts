import "server-only";
import { prisma } from "@/lib/db";
import type { ReponseData, SchemaFormulaire, ValeurChamp } from "./model";

/** Une ligne de l'index « mes formulaires » (définition + compteurs). */
export interface FormulaireRow {
  id: string;
  nom: string;
  description: string;
  publie: boolean;
  publieLe: Date | null;
  version: number;
  nbChamps: number;
  nbReponses: number;
  auteur: string | null;
  updatedAt: Date;
}

/**
 * Formulaires d'un espace perso, du plus récent au plus ancien.
 * Vue MEMBRE (`membreId` fourni) : seulement les formulaires **publiés**, et le
 * compteur de réponses ne compte QUE les siennes. Vue ADMIN (sans `membreId`) :
 * tout (brouillons inclus) + total des réponses.
 */
export async function listerFormulaires(
  proprietaire: string,
  options?: { membreId?: string },
): Promise<FormulaireRow[]> {
  const membreId = options?.membreId;
  const rows = await prisma.formulaire.findMany({
    where: { proprietaire, ...(membreId ? { publie: true } : {}) },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { nom: true } },
      _count: {
        select: {
          reponses: membreId ? { where: { createdById: membreId } } : true,
        },
      },
    },
  });
  return rows.map((f) => {
    const schema = (f.schema as unknown as SchemaFormulaire) ?? [];
    return {
      id: f.id,
      nom: f.nom,
      description: f.description,
      publie: f.publie,
      publieLe: f.publieLe,
      version: f.version,
      nbChamps: Array.isArray(schema) ? schema.length : 0,
      nbReponses: f._count.reponses,
      auteur: f.createdBy?.nom ?? null,
      updatedAt: f.updatedAt,
    };
  });
}

/** La définition complète d'un formulaire (pour le builder). */
export interface FormulaireDetail {
  id: string;
  nom: string;
  description: string;
  proprietaire: string;
  publie: boolean;
  publieLe: Date | null;
  version: number;
  schema: SchemaFormulaire;
  updatedAt: Date;
}

export async function getFormulaire(
  id: string,
): Promise<FormulaireDetail | null> {
  const f = await prisma.formulaire.findUnique({ where: { id } });
  if (!f) return null;
  return {
    id: f.id,
    nom: f.nom,
    description: f.description,
    proprietaire: f.proprietaire,
    publie: f.publie,
    publieLe: f.publieLe,
    version: f.version,
    schema: (f.schema as unknown as SchemaFormulaire) ?? [],
    updatedAt: f.updatedAt,
  };
}

/** Une ligne de la table « matricielle » des réponses (valeurs projetées pour
 *  l'affichage en colonnes + l'export CSV). */
export interface ReponseMatriceRow {
  id: string;
  titre: string;
  auteur: string | null;
  nbMedias: number;
  createdAt: Date;
  /** Valeurs saisies, indexées par ChampDef.id (lues telles quelles). */
  valeurs: Record<string, ValeurChamp>;
}

export async function listerReponsesMatrice(
  formulaireId: string,
  options?: { membreId?: string },
): Promise<ReponseMatriceRow[]> {
  const membreId = options?.membreId;
  const rows = await prisma.formulaireReponse.findMany({
    where: { formulaireId, ...(membreId ? { createdById: membreId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { nom: true } },
      _count: { select: { medias: true } },
    },
  });
  return rows.map((r) => {
    const data = r.data as unknown as ReponseData | null;
    return {
      id: r.id,
      titre: r.titre,
      auteur: r.createdBy?.nom ?? null,
      nbMedias: r._count.medias,
      createdAt: r.createdAt,
      valeurs: data?.valeurs ?? {},
    };
  });
}

/** Détail d'une réponse (rendu lecture seule + PDF). */
export interface ReponseDetail {
  id: string;
  formulaireId: string;
  formulaireNom: string;
  titre: string;
  auteur: string | null;
  /** Id de l'auteur — pour autoriser un membre à ne voir que les siennes. */
  createdById: string | null;
  createdAt: Date;
  data: ReponseData;
}

export async function getReponse(id: string): Promise<ReponseDetail | null> {
  const r = await prisma.formulaireReponse.findUnique({
    where: { id },
    include: {
      createdBy: { select: { nom: true } },
      formulaire: { select: { id: true, nom: true } },
    },
  });
  if (!r) return null;
  return {
    id: r.id,
    formulaireId: r.formulaireId,
    formulaireNom: r.formulaire.nom,
    titre: r.titre,
    auteur: r.createdBy?.nom ?? null,
    createdById: r.createdById,
    createdAt: r.createdAt,
    data:
      (r.data as unknown as ReponseData) ?? {
        schemaSnapshot: [],
        valeurs: {},
        medias: [],
        updatedTs: 0,
      },
  };
}
