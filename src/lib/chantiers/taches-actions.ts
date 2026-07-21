"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { EtatTache } from "@/generated/prisma/enums";

async function requireUser(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
}

/** Valide un état arrivé du client (les actions sont appelables au réseau). */
function valideEtat(etat: string): EtatTache {
  if (!Object.values(EtatTache).includes(etat as EtatTache))
    throw new Error("État de tâche inconnu");
  return etat as EtatTache;
}

/** Crée une tâche dans une colonne du kanban. Le client (qui connaît sa colonne)
 *  fournit l'ordre de fin de colonne ; l'id retourné réconcilie l'ajout optimiste. */
export async function creerTache(p: {
  chantierId: string;
  titre: string;
  etat: EtatTache;
  ordre: number;
}): Promise<{ id: string }> {
  await requireUser();
  const titre = p.titre.trim();
  if (!titre) throw new Error("Titre requis");
  const tache = await prisma.tacheAffaire.create({
    data: { chantierId: p.chantierId, titre, etat: valideEtat(p.etat), ordre: p.ordre },
    select: { id: true },
  });
  revalidatePath(`/affaires/${p.chantierId}`);
  return tache;
}

/** Déplace une tâche : changement de colonne (état) et/ou de position (ordre). */
export async function deplacerTache(
  id: string,
  p: { etat: EtatTache; ordre: number },
): Promise<void> {
  await requireUser();
  const t = await prisma.tacheAffaire.update({
    where: { id },
    data: { etat: valideEtat(p.etat), ordre: p.ordre },
    select: { chantierId: true },
  });
  revalidatePath(`/affaires/${t.chantierId}`);
}

/** Change l'état d'une tâche en la plaçant en fin de colonne cible. Utilisé par
 *  la vue « Mes tâches », qui ne connaît pas les colonnes du kanban : l'ordre
 *  est calculé ici, côté serveur. */
export async function changerEtatTacheEnFin(id: string, etat: EtatTache): Promise<void> {
  await requireUser();
  const e = valideEtat(etat);
  const tache = await prisma.tacheAffaire.findUnique({
    where: { id },
    select: { chantierId: true },
  });
  if (!tache) throw new Error("Tâche introuvable");
  const max = await prisma.tacheAffaire.aggregate({
    where: { chantierId: tache.chantierId, etat: e },
    _max: { ordre: true },
  });
  await prisma.tacheAffaire.update({
    where: { id },
    data: { etat: e, ordre: (max._max.ordre ?? 0) + 1 },
  });
  revalidatePath("/affaires");
  revalidatePath(`/affaires/${tache.chantierId}`);
}

export async function renommerTache(id: string, titre: string): Promise<void> {
  await requireUser();
  const t = titre.trim();
  if (!t) throw new Error("Titre requis");
  const tache = await prisma.tacheAffaire.update({
    where: { id },
    data: { titre: t },
    select: { chantierId: true },
  });
  revalidatePath(`/affaires/${tache.chantierId}`);
}

/** Assigne la tâche à un utilisateur (null = retirer l'assignation). */
export async function assignerTache(id: string, assigneId: string | null): Promise<void> {
  await requireUser();
  const tache = await prisma.tacheAffaire.update({
    where: { id },
    data: { assigneId },
    select: { chantierId: true },
  });
  revalidatePath(`/affaires/${tache.chantierId}`);
}

export async function supprimerTache(id: string): Promise<void> {
  await requireUser();
  const tache = await prisma.tacheAffaire.delete({
    where: { id },
    select: { chantierId: true },
  });
  revalidatePath(`/affaires/${tache.chantierId}`);
}
