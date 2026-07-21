"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { estTypeVisite, type TypeVisite, type VisiteData } from "./model";
import { supprimerMediaVisite } from "./stockage";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return id;
}

/** Ce que l'îlot terrain pousse au serveur (la visite locale, telle quelle). */
export interface VisitePayload {
  id: string;
  type: TypeVisite;
  titre: string;
  /** ISO `yyyy-mm-dd` (date terrain). */
  date: string;
  chantierId: string | null;
  chantierNom: string;
  clientNom: string;
  numeroWhy: string | null;
  data: VisiteData;
  createdTs: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upsert idempotent d'une visite poussée par le terrain. « Dernier gagne » par
 * visite : un payload plus ancien que l'état en base (data.updatedTs) est ignoré
 * sans erreur — rejouer la file est donc toujours sûr. Si la visite est rattachée
 * à une affaire, l'identification (client / n° Why) est REPRISE DE L'AFFAIRE
 * (source de vérité), pas du payload.
 */
export async function syncVisite(payload: VisitePayload): Promise<{ ok: true }> {
  const userId = await requireUserId();

  if (!UUID_RE.test(payload.id)) throw new Error("Identifiant de visite invalide");
  if (!estTypeVisite(payload.type)) throw new Error("Type de visite invalide");
  if (!payload.data || typeof payload.data.updatedTs !== "number") {
    throw new Error("Contenu de visite invalide");
  }

  const existant = await prisma.visite.findUnique({
    where: { id: payload.id },
    select: { id: true, data: true, chantierId: true },
  });

  // L'affaire fait foi pour l'identification (si rattachée et existante).
  // Règle de fusion : un payload SANS affaire ne détache jamais une visite déjà
  // rattachée (cas : rattachement fait au bureau, copie du téléphone pas au courant).
  let chantierId: string | null = null;
  let clientId: string | null = null;
  let clientNom = payload.clientNom ?? "";
  let numeroWhy = payload.numeroWhy;
  const chantierVoulu = payload.chantierId ?? existant?.chantierId ?? null;
  if (chantierVoulu) {
    const chantier = await prisma.chantier.findUnique({
      where: { id: chantierVoulu },
      select: { id: true, clientId: true, numeroWhy: true, client: { select: { nom: true } } },
    });
    if (chantier) {
      chantierId = chantier.id;
      clientId = chantier.clientId;
      clientNom = chantier.client.nom;
      numeroWhy = chantier.numeroWhy;
    }
  }

  // Date terrain à midi local serveur (évite les glissements de fuseau).
  const dateVisite = /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
    ? new Date(`${payload.date}T12:00:00`)
    : new Date();

  const commun = {
    type: payload.type,
    titre: (payload.titre ?? "").slice(0, 200),
    date: dateVisite,
    chantierId,
    clientId,
    clientNom,
    numeroWhy,
    data: payload.data as unknown as Prisma.InputJsonValue,
    // Auteur de la dernière modif = celui qui SYNCHRONISE (la file offline ne
    // transporte pas l'auteur de la saisie terrain).
    updatedById: userId,
  };

  if (existant) {
    const ancienTs = (existant.data as { updatedTs?: number } | null)?.updatedTs ?? 0;
    if (payload.data.updatedTs < ancienTs) return { ok: true }; // écriture périmée → ignorée
    await prisma.visite.update({ where: { id: payload.id }, data: commun });
    // Médias retirés côté terrain → purger base + disque (le data fait foi).
    const idsGardes = new Set((payload.data.medias ?? []).map((m) => m.id));
    const enBase = await prisma.visiteMedia.findMany({
      where: { visiteId: payload.id },
      select: { id: true, fichier: true },
    });
    for (const m of enBase) {
      if (idsGardes.has(m.id)) continue;
      await supprimerMediaVisite(m.fichier);
      await prisma.visiteMedia.delete({ where: { id: m.id } });
    }
    if (existant.chantierId && existant.chantierId !== chantierId) {
      revalidatePath(`/affaires/${existant.chantierId}`);
    }
  } else {
    await prisma.visite.create({
      data: { id: payload.id, ...commun, createdById: userId },
    });
  }

  revalidatePath("/outils/visites");
  if (chantierId) revalidatePath(`/affaires/${chantierId}`);
  return { ok: true };
}

/** Rattache (ou re-rattache) une visite synchronisée à une affaire, depuis la
 *  fiche bureau — cas type du relevé : la visite est faite AVANT que l'affaire
 *  existe, on la raccroche après coup. L'identification (client / n° Why) est
 *  reprise de l'affaire. La copie terrain qui re-synchroniserait sans affaire ne
 *  détache pas (règle de fusion dans syncVisite). */
export async function rattacherVisiteAffaire(
  visiteId: string,
  chantierId: string,
): Promise<{ ok: true }> {
  const userId = await requireUserId();
  const visite = await prisma.visite.findUnique({
    where: { id: visiteId },
    select: { id: true, chantierId: true },
  });
  if (!visite) throw new Error("Visite introuvable");
  const chantier = await prisma.chantier.findUnique({
    where: { id: chantierId },
    select: { id: true, clientId: true, numeroWhy: true, client: { select: { nom: true } } },
  });
  if (!chantier) throw new Error("Affaire introuvable");

  await prisma.visite.update({
    where: { id: visiteId },
    data: {
      chantierId: chantier.id,
      clientId: chantier.clientId,
      clientNom: chantier.client.nom,
      numeroWhy: chantier.numeroWhy,
      updatedById: userId,
    },
  });

  revalidatePath("/outils/visites");
  revalidatePath(`/outils/visites/${visiteId}`);
  revalidatePath(`/affaires/${chantier.id}`);
  if (visite.chantierId && visite.chantierId !== chantier.id) {
    revalidatePath(`/affaires/${visite.chantierId}`);
  }
  return { ok: true };
}

/** Supprime une visite synchronisée (et ses médias, base + disque). Gestion en
 *  ligne uniquement — le terrain gère ses brouillons locaux lui-même. */
export async function supprimerVisite(id: string): Promise<void> {
  await requireUserId();
  const visite = await prisma.visite.findUnique({
    where: { id },
    select: { chantierId: true, medias: { select: { fichier: true } } },
  });
  if (!visite) return;
  for (const m of visite.medias) await supprimerMediaVisite(m.fichier);
  await prisma.visite.delete({ where: { id } });
  revalidatePath("/outils/visites");
  if (visite.chantierId) revalidatePath(`/affaires/${visite.chantierId}`);
}
