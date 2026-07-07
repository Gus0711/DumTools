import "server-only";
import { prisma } from "@/lib/db";

export interface ClientResume {
  id: string;
  nom: string;
  updatedAt: Date;
  /** Nombre total de réalisations tous outils confondus. */
  nbRealisations: number;
}

/** Liste du référentiel client avec le total de réalisations par outil. */
export async function listerClients(): Promise<ClientResume[]> {
  const clients = await prisma.client.findMany({
    orderBy: { nom: "asc" },
    select: {
      id: true,
      nom: true,
      updatedAt: true,
      _count: { select: { pointsLists: true, affectations: true } },
    },
  });
  return clients.map((c) => ({
    id: c.id,
    nom: c.nom,
    updatedAt: c.updatedAt,
    nbRealisations: c._count.pointsLists + c._count.affectations,
  }));
}

export interface ClientDetail {
  id: string;
  nom: string;
}

export async function getClient(id: string): Promise<ClientDetail | null> {
  const c = await prisma.client.findUnique({
    where: { id },
    select: { id: true, nom: true },
  });
  return c;
}

/**
 * Résout un nom de client saisi dans un outil vers un id du référentiel,
 * en créant l'entrée client si elle n'existe pas encore (upsert par nom).
 * Retourne null pour un nom vide (client libre non rattaché).
 */
export async function resoudreClientId(nom: string): Promise<string | null> {
  const n = (nom ?? "").trim();
  if (!n) return null;
  const c = await prisma.client.upsert({
    where: { nom: n },
    update: {},
    create: { nom: n },
    select: { id: true },
  });
  return c.id;
}
