"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { purgerMediasOrphelins } from "@/lib/medias-document/purge";
import { supprimerMedia } from "@/lib/medias-document/stockage";
import { dureeParId, echeanceDepuis, DUREES_PARTAGE } from "@/lib/partage/model";
import { PREFIXE_MEDIA_NOTE, type NoteContenu } from "./model";

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

  // updateManyAndReturn : la garde de version et la lecture du résultat sont la
  // MÊME requête. Avec un updateMany suivi d'un findUnique, un save concurrent
  // pouvait se glisser entre les deux et nous faire renvoyer SA version — le
  // client repartait alors sur une version qui n'était pas la sienne, et se
  // prenait un faux conflit au save suivant.
  const [note] = await prisma.note.updateManyAndReturn({
    where: { id, version: data.versionBase },
    data: {
      titre: data.titre.trim() || "Sans titre",
      contenu,
      version: data.versionBase + 1,
      // Dans le MÊME data que la garde de version : l'auteur ne peut pas être
      // écrit si la sauvegarde est refusée pour conflit.
      updatedById: userId,
    },
    select: { version: true, updatedAt: true, chantierId: true },
  });

  if (!note) {
    // Rien écrit : soit conflit de version, soit note disparue.
    const courante = await prisma.note.findUnique({
      where: { id },
      select: { version: true, updatedAt: true },
    });
    if (!courante) throw new Error("Note introuvable");
    return {
      ok: false,
      conflit: true,
      version: courante.version,
      updatedAt: courante.updatedAt.toISOString(),
    };
  }

  await purgerMediasNote(id, data.contenu);
  revalidateNote(note.chantierId);
  return { ok: true, version: note.version, updatedAt: note.updatedAt.toISOString() };
}

/** Purge des médias que le document ne cite plus (mécanique dans lib/medias-document). */
function purgerMediasNote(noteId: string, contenu: NoteContenu): Promise<void> {
  return purgerMediasOrphelins({
    contenu,
    prefixeUrl: PREFIXE_MEDIA_NOTE,
    candidats: (gardes, avant) =>
      prisma.noteMedia.findMany({
        where: { noteId, createdAt: { lt: avant }, id: { notIn: gardes } },
        select: { id: true, fichier: true },
      }),
    oublier: async (ids) => {
      await prisma.noteMedia.deleteMany({ where: { id: { in: ids } } });
    },
  });
}

export async function supprimerNote(id: string): Promise<void> {
  await requireUserId();
  const note = await prisma.note.findUnique({
    where: { id },
    select: { chantierId: true, medias: { select: { fichier: true } } },
  });
  if (!note) return;
  await Promise.all(note.medias.map((m) => supprimerMedia(m.fichier)));
  await prisma.note.delete({ where: { id } });
  revalidateNote(note.chantierId);
}

/**
 * Active le partage public : pose un jeton non devinable (lecture seule via
 * /n/[jeton], accessible SANS session — l'app est exposée sur internet).
 *
 * `dureeId` choisit l'échéance parmi DUREES_PARTAGE ; « illimite » est permis
 * ici (une note d'affaire transmise à un client peut devoir rester lisible),
 * contrairement au wiki. Une durée inconnue n'est jamais interprétée comme
 * « sans limite » : on refuse.
 */
export async function genererJetonPartage(
  id: string,
  dureeId: string = "illimite",
): Promise<{ jeton: string; expireLe: string | null }> {
  const userId = await requireUserId();

  const duree = dureeParId(dureeId, DUREES_PARTAGE);
  if (!duree) throw new Error("Durée de partage inconnue");
  const expireLe = echeanceDepuis(duree.heures);

  const jeton = randomBytes(24).toString("base64url");
  await prisma.note.update({
    where: { id },
    data: { jetonPartage: jeton, partageExpireLe: expireLe, updatedById: userId },
  });
  revalidatePath(`${BASE}/${id}`);
  return { jeton, expireLe: expireLe?.toISOString() ?? null };
}

/** Repousse l'échéance d'un partage DÉJÀ posé — le lien distribué continue de
 *  fonctionner, personne n'a de nouvelle URL à recevoir. */
export async function prolongerPartage(
  id: string,
  dureeId: string,
): Promise<{ expireLe: string | null }> {
  const userId = await requireUserId();

  const duree = dureeParId(dureeId, DUREES_PARTAGE);
  if (!duree) throw new Error("Durée de partage inconnue");
  const expireLe = echeanceDepuis(duree.heures);

  const note = await prisma.note.findUnique({ where: { id }, select: { jetonPartage: true } });
  if (!note?.jetonPartage) throw new Error("Cette note n'est pas partagée");

  await prisma.note.update({
    where: { id },
    data: { partageExpireLe: expireLe, updatedById: userId },
  });
  revalidatePath(`${BASE}/${id}`);
  return { expireLe: expireLe?.toISOString() ?? null };
}

/** Révoque le partage : le lien public meurt immédiatement. */
export async function revoquerJetonPartage(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.note.update({
    where: { id },
    data: { jetonPartage: null, partageExpireLe: null, updatedById: userId },
  });
  revalidatePath(`${BASE}/${id}`);
}
