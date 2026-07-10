import "server-only";
import { prisma } from "@/lib/db";
import { EtatAffaire } from "@/generated/prisma/enums";

export { ETATS_AFFAIRE, etatLabel } from "./etats";

/**
 * Résout un numéro Why vers l'id de l'Affaire (Chantier), en créant l'affaire au
 * besoin (upsert par numeroWhy — clé naturelle). Nécessite un client (une affaire
 * appartient à un client). Retourne null si pas de numéro Why ou pas de client.
 * On n'écrase JAMAIS le nom / l'état d'une affaire existante (édités côté fiche).
 */
export async function resoudreChantierId(
  numeroWhy: string | null | undefined,
  clientId: string | null | undefined,
  nomFallback: string,
): Promise<string | null> {
  const why = (numeroWhy ?? "").trim();
  if (!why || !clientId) return null;
  const c = await prisma.chantier.upsert({
    where: { numeroWhy: why },
    update: {},
    create: { numeroWhy: why, nom: nomFallback.trim() || why, clientId },
    select: { id: true },
  });
  return c.id;
}

export interface AffaireResume {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  clientNom: string;
  updatedAt: Date;
  /** Nombre d'artefacts rattachés, tous outils confondus. */
  nbRealisations: number;
}

/** Liste de toutes les affaires (tableau de bord). */
export async function listerAffaires(): Promise<AffaireResume[]> {
  const affaires = await prisma.chantier.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      nom: true,
      numeroWhy: true,
      etat: true,
      updatedAt: true,
      client: { select: { nom: true } },
      _count: { select: { affectations: true } },
    },
  });
  return affaires.map((a) => ({
    id: a.id,
    nom: a.nom,
    numeroWhy: a.numeroWhy,
    etat: a.etat,
    clientNom: a.client.nom,
    updatedAt: a.updatedAt,
    nbRealisations: a._count.affectations,
  }));
}

export interface AffaireDetail {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  clientId: string;
  clientNom: string;
}

export async function getAffaire(id: string): Promise<AffaireDetail | null> {
  const a = await prisma.chantier.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      numeroWhy: true,
      etat: true,
      clientId: true,
      client: { select: { nom: true } },
    },
  });
  if (!a) return null;
  return {
    id: a.id,
    nom: a.nom,
    numeroWhy: a.numeroWhy,
    etat: a.etat,
    clientId: a.clientId,
    clientNom: a.client.nom,
  };
}
