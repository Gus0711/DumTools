import "server-only";
import { prisma } from "@/lib/db";
import { EtatAffaire, BesoinArmoire, EtatTache } from "@/generated/prisma/enums";
import type { MaTacheRow, TacheRow } from "./taches";

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

/** Tâches (todo) d'une affaire, triées par position dans leur colonne. */
export async function listerTaches(chantierId: string): Promise<TacheRow[]> {
  const taches = await prisma.tacheAffaire.findMany({
    where: { chantierId },
    orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      titre: true,
      etat: true,
      ordre: true,
      assigneId: true,
      assigne: { select: { nom: true } },
    },
  });
  return taches.map((t) => ({
    id: t.id,
    titre: t.titre,
    etat: t.etat,
    ordre: t.ordre,
    assigneId: t.assigneId,
    assigneNom: t.assigne?.nom ?? null,
  }));
}

/** Tâches ouvertes assignées à un utilisateur, toutes affaires confondues
 *  (vue « Mes tâches »). Affaires les plus actives d'abord, puis l'ordre des
 *  colonnes du kanban (À faire, En cours) et la position dans la colonne.
 *  Les affaires en Corbeille sont exclues (une affaire clôturée, elle, garde
 *  ses tâches visibles : un reste à faire se fait même après clôture). */
export async function listerMesTaches(userId: string): Promise<MaTacheRow[]> {
  const taches = await prisma.tacheAffaire.findMany({
    where: {
      assigneId: userId,
      etat: { not: EtatTache.TERMINEE },
      chantier: { etat: { not: EtatAffaire.CORBEILLE } },
    },
    orderBy: [{ chantier: { updatedAt: "desc" } }, { etat: "asc" }, { ordre: "asc" }],
    select: {
      id: true,
      titre: true,
      etat: true,
      chantier: { select: { id: true, nom: true, client: { select: { nom: true } } } },
    },
  });
  return taches.map((t) => ({
    id: t.id,
    titre: t.titre,
    etat: t.etat,
    affaireId: t.chantier.id,
    affaireNom: t.chantier.nom,
    clientNom: t.chantier.client.nom,
  }));
}

/** Combien de tâches me sont assignées et pas terminées (pastille de la nav) —
 *  mêmes filtres que listerMesTaches, mais un simple COUNT. */
export async function compterMesTaches(userId: string): Promise<number> {
  return prisma.tacheAffaire.count({
    where: {
      assigneId: userId,
      etat: { not: EtatTache.TERMINEE },
      chantier: { etat: { not: EtatAffaire.CORBEILLE } },
    },
  });
}

export interface AffaireDetail {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  besoinArmoire: BesoinArmoire | null;
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
      besoinArmoire: true,
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
    besoinArmoire: a.besoinArmoire,
    clientId: a.clientId,
    clientNom: a.client.nom,
  };
}
