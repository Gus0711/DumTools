"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { mediasReferences, type NoteContenu } from "./model";
import { supprimerMediaNote } from "./stockage";

const BASE = "/outils/notes";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return id;
}

function revalidateNote(chantierId: string) {
  revalidatePath(BASE);
  revalidatePath("/affaires");
  revalidatePath(`/affaires/${chantierId}`);
}

/** Crée une note déjà rattachée à une affaire (« affaire d'abord ») : elle
 *  hérite du client et du numéro Why, donc apparaît aussitôt dans sa fiche. */
export async function creerNotePourAffaire(chantierId: string): Promise<void> {
  const userId = await requireUserId();
  const affaire = await prisma.chantier.findUnique({
    where: { id: chantierId },
    select: { numeroWhy: true, clientId: true },
  });
  if (!affaire) throw new Error("Affaire introuvable");
  const note = await prisma.note.create({
    data: {
      chantierId,
      clientId: affaire.clientId,
      numeroWhy: affaire.numeroWhy,
      createdById: userId,
      updatedById: userId,
    },
    select: { id: true },
  });
  revalidateNote(chantierId);
  redirect(`${BASE}/${note.id}`);
}

export type SauverNoteResultat =
  | { ok: true; version: number; updatedAt: string }
  /** Conflit : quelqu'un a sauvé entre-temps — l'éditeur affiche la bannière
   *  et cesse d'écraser tant que l'utilisateur n'a pas rechargé. */
  | { ok: false; conflit: true; version: number; updatedAt: string };

/**
 * Sauvegarde anti-collision : n'écrit QUE si la note en base est encore à la
 * version sur laquelle l'éditeur travaille (`versionBase`). Sinon, aucun octet
 * n'est écrit et l'appelant reçoit la version courante — pas d'écrasement
 * silencieux entre deux collègues (même patron d'intention que
 * enregistrerTestsPoints côté affectation, en plus strict).
 */
export async function sauverNote(
  id: string,
  data: { titre: string; contenu: NoteContenu; versionBase: number },
): Promise<SauverNoteResultat> {
  const userId = await requireUserId();

  // Les blocs BlockNote portent des `undefined` DANS des tableaux (ex.
  // columnWidths des tableaux intégrés) ; les server actions les préservent
  // et Prisma les refuse en JSON → la sérialisation les normalise en null
  // (qui est la forme native de BlockNote).
  const contenu = JSON.parse(JSON.stringify(data.contenu ?? [])) as Prisma.InputJsonValue;

  const res = await prisma.note.updateMany({
    where: { id, version: data.versionBase },
    data: {
      titre: data.titre.trim() || "Sans titre",
      contenu,
      version: data.versionBase + 1,
      // Dans le MÊME data que la garde de version : l'auteur ne peut pas être
      // écrit si la sauvegarde est refusée pour conflit.
      updatedById: userId,
    },
  });

  const note = await prisma.note.findUnique({
    where: { id },
    select: { version: true, updatedAt: true, chantierId: true },
  });
  if (!note) throw new Error("Note introuvable");

  if (res.count === 0) {
    return {
      ok: false,
      conflit: true,
      version: note.version,
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  await purgerMediasOrphelins(id, data.contenu);
  revalidateNote(note.chantierId);
  return { ok: true, version: note.version, updatedAt: note.updatedAt.toISOString() };
}

/** Supprime du disque et de la base les médias que le document ne référence
 *  plus. Les médias très récents sont épargnés : un upload en cours n'apparaît
 *  dans le document qu'après insertion du bloc (course upload/autosave). */
async function purgerMediasOrphelins(noteId: string, contenu: NoteContenu): Promise<void> {
  const references = mediasReferences(contenu);
  const seuil = new Date(Date.now() - 5 * 60 * 1000);
  const orphelins = await prisma.noteMedia.findMany({
    where: { noteId, createdAt: { lt: seuil }, id: { notIn: [...references] } },
    select: { id: true, fichier: true },
  });
  if (orphelins.length === 0) return;
  await Promise.all(orphelins.map((m) => supprimerMediaNote(m.fichier)));
  await prisma.noteMedia.deleteMany({ where: { id: { in: orphelins.map((m) => m.id) } } });
}

export async function supprimerNote(id: string): Promise<void> {
  await requireUserId();
  const note = await prisma.note.findUnique({
    where: { id },
    select: { chantierId: true, medias: { select: { fichier: true } } },
  });
  if (!note) return;
  await Promise.all(note.medias.map((m) => supprimerMediaNote(m.fichier)));
  await prisma.note.delete({ where: { id } });
  revalidateNote(note.chantierId);
}

/** Active le partage public : pose un jeton non devinable (lecture seule via
 *  /n/[jeton], accessible SANS session — l'app est exposée sur internet). */
export async function genererJetonPartage(id: string): Promise<string> {
  const userId = await requireUserId();
  const jeton = randomBytes(24).toString("base64url");
  await prisma.note.update({
    where: { id },
    data: { jetonPartage: jeton, updatedById: userId },
  });
  revalidatePath(`${BASE}/${id}`);
  return jeton;
}

/** Révoque le partage : le lien public meurt immédiatement. */
export async function revoquerJetonPartage(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.note.update({
    where: { id },
    data: { jetonPartage: null, updatedById: userId },
  });
  revalidatePath(`${BASE}/${id}`);
}
