import "server-only";
import { prisma } from "@/lib/db";
import type { ClientDetail, ContactClientVue } from "./types";

export type { ClientDetail, ContactClientVue };

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

export async function getClient(id: string): Promise<ClientDetail | null> {
  const c = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      adresse: true,
      codePostal: true,
      ville: true,
      telephone: true,
      email: true,
      contacts: {
        // Le principal en tête — c'est celui qu'on propose, il se lit d'abord.
        // Les partis en queue, sans quoi une liste de dix personnes dont huit
        // sont sorties de la boîte ne se lit plus.
        orderBy: [{ actif: "desc" }, { principal: "desc" }, { nom: "asc" }],
        select: {
          id: true,
          civilite: true,
          nom: true,
          fonction: true,
          email: true,
          telephone: true,
          mobile: true,
          note: true,
          principal: true,
          actif: true,
        },
      },
    },
  });
  return c;
}

/** Les contacts d'un client, pour les écrans qui n'ont pas besoin du reste
 *  (la pastille « Client » de l'éditeur de devis). Les partis n'y sont pas :
 *  on ne PROPOSE pas quelqu'un qui a quitté la maison. */
export async function listerContactsActifs(clientId: string): Promise<ContactClientVue[]> {
  return prisma.contactClient.findMany({
    where: { clientId, actif: true },
    orderBy: [{ principal: "desc" }, { nom: "asc" }],
    select: {
      id: true,
      civilite: true,
      nom: true,
      fonction: true,
      email: true,
      telephone: true,
      mobile: true,
      note: true,
      principal: true,
      actif: true,
    },
  });
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
