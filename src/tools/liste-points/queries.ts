import "server-only";
import { prisma } from "@/lib/db";
import type { PointRow } from "./model";
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
export async function getCatalogue(): Promise<{ nom: string; type: string }[]> {
  return prisma.pointCatalog.findMany({
    orderBy: { nom: "asc" },
    select: { nom: true, type: true },
  });
}
