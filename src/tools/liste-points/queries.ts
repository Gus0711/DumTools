import "server-only";
import { prisma } from "@/lib/db";
import type { IoType, ModeleDef, ModelePoint, PointRow } from "./model";
import type { ClientArtefact } from "@/lib/clients/types";

const nbPoints = (rows: PointRow[]) => rows.filter((r) => r.kind === "point").length;

/** Résumé d'un document pour la page index. */
export interface ListeResume {
  id: string;
  titre: string;
  clientNom: string;
  chantierNom: string;
  numeroWhy: string | null;
  date: Date | null;
  updatedAt: Date;
  auteur: string | null;
  nbPoints: number;
}

export async function listerDocuments(): Promise<ListeResume[]> {
  const docs = await prisma.pointsList.findMany({
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: { nom: true } } },
  });
  return docs.map((d) => {
    const rows = (d.rows as unknown as PointRow[]) ?? [];
    return {
      id: d.id,
      titre: d.titre?.trim() || d.clientNom.trim() || "Sans titre",
      clientNom: d.clientNom,
      chantierNom: d.chantierNom,
      numeroWhy: d.numeroWhy,
      date: d.date,
      updatedAt: d.updatedAt,
      auteur: d.createdBy?.nom ?? null,
      nbPoints: nbPoints(rows),
    };
  });
}

/** Provider de fiche client : listes de points rattachées à ce client. */
export async function listerPourClient(clientId: string): Promise<ClientArtefact[]> {
  const docs = await prisma.pointsList.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
  });
  return docs.map((d) => {
    const n = nbPoints((d.rows as unknown as PointRow[]) ?? []);
    return {
      id: d.id,
      titre: d.titre?.trim() || d.chantierNom.trim() || "Sans titre",
      href: `/outils/liste-points/${d.id}`,
      numeroWhy: d.numeroWhy,
      updatedAt: d.updatedAt,
      resume: `${n} point${n > 1 ? "s" : ""}`,
    };
  });
}

export interface DocumentComplet {
  id: string;
  titre: string;
  clientNom: string;
  chantierNom: string;
  numeroWhy: string;
  date: string | null; // ISO yyyy-mm-dd
  rows: PointRow[];
}

export async function getDocument(id: string): Promise<DocumentComplet | null> {
  const d = await prisma.pointsList.findUnique({ where: { id } });
  if (!d) return null;
  return {
    id: d.id,
    titre: d.titre ?? "",
    clientNom: d.clientNom,
    chantierNom: d.chantierNom,
    numeroWhy: d.numeroWhy ?? "",
    date: d.date ? d.date.toISOString().slice(0, 10) : null,
    rows: (d.rows as unknown as PointRow[]) ?? [],
  };
}

/** Référentiel client (combobox). */
export async function getClients(): Promise<string[]> {
  const clients = await prisma.client.findMany({
    orderBy: { nom: "asc" },
    select: { nom: true },
  });
  return clients.map((c) => c.nom);
}

/** Catalogue de points (combobox de point). */
export async function getCatalogue(): Promise<{ nom: string; type: string; signal: string | null }[]> {
  return prisma.pointCatalog.findMany({
    orderBy: { nom: "asc" },
    select: { nom: true, type: true, signal: true },
  });
}

const asPoints = (v: unknown): ModelePoint[] =>
  Array.isArray(v)
    ? v
        .filter((p): p is { nom: string; type: string; signal?: string } => !!p && typeof p === "object")
        .map((p) => ({
          nom: String(p.nom ?? ""),
          type: (p.type as IoType) ?? "DI",
          signal: p.signal ? String(p.signal) : undefined,
        }))
    : [];

/** Modèles de saisie (sections pré-remplies) pour l'éditeur. */
export async function getModeles(): Promise<ModeleDef[]> {
  const rows = await prisma.modele.findMany({ orderBy: [{ ordre: "asc" }, { nom: "asc" }] });
  return rows.map((m) => ({ nom: m.nom, points: asPoints(m.points) }));
}

// --- Lecture pour l'écran de configuration ---------------------------------

export interface PointCatalogueRow {
  id: string;
  nom: string;
  type: string;
  signal: string | null;
}
export interface ModeleRow {
  id: string;
  nom: string;
  ordre: number;
  points: ModelePoint[];
}

export async function getCataloguePointsAdmin(): Promise<PointCatalogueRow[]> {
  const rows = await prisma.pointCatalog.findMany({ orderBy: { nom: "asc" } });
  return rows.map((r) => ({ id: r.id, nom: r.nom, type: r.type, signal: r.signal }));
}

export async function getModelesAdmin(): Promise<ModeleRow[]> {
  const rows = await prisma.modele.findMany({ orderBy: [{ ordre: "asc" }, { nom: "asc" }] });
  return rows.map((m) => ({ id: m.id, nom: m.nom, ordre: m.ordre, points: asPoints(m.points) }));
}
