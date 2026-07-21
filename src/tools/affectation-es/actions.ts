"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { resoudreClientId } from "@/lib/clients/queries";
import { resoudreChantierId } from "@/lib/chantiers/queries";
import { defaultProject, type Point, type Project } from "./model";
import type { IoType, PointRow } from "@/tools/liste-points/model";

const BASE = "/outils/affectation-es";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return id;
}

function dateLabel(): string {
  return new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Rattache un automate existant (orphelin) à une affaire : il en hérite le
 *  client et le n° Why, et apparaît dès lors dans la fiche affaire / client.
 *  N'écrase pas le contenu technique (data). */
export async function rattacherProjetAffaire(
  projetId: string,
  chantierId: string,
): Promise<void> {
  const userId = await requireUserId();
  const affaire = await prisma.chantier.findUnique({
    where: { id: chantierId },
    select: { numeroWhy: true, clientId: true, client: { select: { nom: true } } },
  });
  if (!affaire) throw new Error("Affaire introuvable");
  await prisma.affectationProjet.update({
    where: { id: projetId },
    data: {
      clientNom: affaire.client.nom,
      clientId: affaire.clientId,
      numeroWhy: affaire.numeroWhy,
      chantierId,
      updatedById: userId,
    },
  });
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${projetId}`);
  revalidatePath(`/affaires/${chantierId}`);
}

/** Crée un nouvel automate (Projet GTB) déjà rattaché à une affaire : il hérite
 *  du client et du numéro Why de l'affaire, donc apparaît aussitôt dans sa fiche. */
export async function creerProjetPourAffaire(chantierId: string): Promise<void> {
  const userId = await requireUserId();
  const affaire = await prisma.chantier.findUnique({
    where: { id: chantierId },
    select: { nom: true, numeroWhy: true, clientId: true, client: { select: { nom: true } } },
  });
  if (!affaire) throw new Error("Affaire introuvable");
  const project = defaultProject(dateLabel());
  project.name = "Nouvel automate";
  project.header = [affaire.client.nom, affaire.nom].filter((v) => v && v.trim()).join(" - ");
  const doc = await prisma.affectationProjet.create({
    data: {
      nom: project.name,
      clientNom: affaire.client.nom,
      clientId: affaire.clientId,
      numeroWhy: affaire.numeroWhy,
      chantierId,
      createdById: userId,
      updatedById: userId,
      data: project as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  revalidatePath(BASE);
  revalidatePath(`/affaires/${chantierId}`);
  redirect(`${BASE}/${doc.id}`);
}

/** Convertit les points d'une Liste de Points en points d'affectation. */
function listeRowsToPoints(rows: PointRow[]): Point[] {
  const points: Point[] = [];
  const add = (nom: string, direction: "input" | "output", signal: string, note?: string) => {
    points.push({
      uid: uid(),
      direction,
      active: true,
      designation: nom,
      repere: "",
      signal,
      source: note?.trim() ? note.trim() : "Depuis liste de points",
      relay: "",
      module: null,
      channel: null,
    });
  };
  for (const r of rows) {
    if (r.kind !== "point") continue;
    const nom = (r.nom || "").trim();
    if (!nom) continue;
    const io = (r.io ?? {}) as Record<IoType, number>;
    if (io.AI) add(nom, "input", "0-10V", r.note);
    if (io.DI) add(nom, "input", "D", r.note);
    if (io.AO) add(nom, "output", "0-10V", r.note);
    if (io.DO) add(nom, "output", "D", r.note);
    // COM (communication) : pas de point d'E/S physique.
  }
  return points;
}

/** Crée un projet d'affectation à partir d'une Liste de Points existante. */
export async function creerProjetDepuisListe(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const listeId = String(formData.get("listeId") || "");
  if (!listeId) throw new Error("Aucune liste sélectionnée");

  const liste = await prisma.pointsList.findUnique({ where: { id: listeId } });
  if (!liste) throw new Error("Liste de points introuvable");

  const rows = (liste.rows as unknown as PointRow[]) ?? [];
  const project = defaultProject(dateLabel());
  project.name = liste.titre?.trim() || liste.clientNom || "Depuis liste de points";
  project.header =
    [liste.clientNom, liste.chantierNom].filter((v) => v && v.trim()).join(" - ") ||
    project.header;
  project.points = listeRowsToPoints(rows);

  const clientId = liste.clientId ?? (await resoudreClientId(liste.clientNom));
  const chantierId = await resoudreChantierId(liste.numeroWhy, clientId, project.name);
  const doc = await prisma.affectationProjet.create({
    data: {
      nom: project.name,
      clientNom: liste.clientNom,
      clientId,
      numeroWhy: liste.numeroWhy,
      chantierId,
      createdById: userId,
      updatedById: userId,
      data: project as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  revalidatePath(BASE);
  redirect(`${BASE}/${doc.id}`);
}

export interface SauverPayload {
  nom: string;
  project: Project;
}

export async function sauverProjet(
  id: string,
  data: SauverPayload,
): Promise<{ ok: true; updatedAt: string }> {
  const userId = await requireUserId();
  // L'identification (client, n° Why, affaire) vit sur l'Affaire, pas ici :
  // on ne persiste que le nom (rôle de l'automate) et le contenu technique.
  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: {
      nom: data.nom?.trim() || "Sans titre",
      data: data.project as unknown as Prisma.InputJsonValue,
      updatedById: userId,
    },
    select: { updatedAt: true },
  });
  revalidatePath(BASE);
  revalidatePath("/affaires");
  return { ok: true, updatedAt: doc.updatedAt.toISOString() };
}

/** Mise à jour d'un point pendant la mise en service (statut + commentaire). */
export type TestUpdate = { uid: string; testStatus?: string; testComment?: string };

/**
 * Action FINE de mise en service : applique seulement `testStatus`/`testComment`
 * par `uid` sur `data.points`, sans toucher au reste du projet.
 *
 * Contrairement à `sauverProjet` (qui écrase tout le JSON et écraserait les
 * modifs concurrentes), celle-ci est granulaire et **idempotente** : rejouer la
 * même liste d'updates donne le même résultat. C'est le socle de la synchro
 * offline (file de mutations rejouée au retour réseau), mais elle est aussi plus
 * sûre en ligne (fenêtre de clobber réduite au strict champ mise en service).
 */
export async function enregistrerTestsPoints(
  projetId: string,
  updates: TestUpdate[],
): Promise<{ ok: true; updatedAt: string; appliques: number }> {
  const userId = await requireUserId();
  if (updates.length === 0) {
    const doc = await prisma.affectationProjet.findUnique({
      where: { id: projetId },
      select: { updatedAt: true },
    });
    if (!doc) throw new Error("Projet introuvable");
    return { ok: true, updatedAt: doc.updatedAt.toISOString(), appliques: 0 };
  }

  // Lecture juste avant écriture (fenêtre de course minimale). On ne modifie que
  // les champs de mise en service, jamais l'affectation ni la liste de points.
  const current = await prisma.affectationProjet.findUnique({
    where: { id: projetId },
    select: { data: true },
  });
  if (!current) throw new Error("Projet introuvable");

  const project = current.data as unknown as Project;
  const byUid = new Map(updates.map((u) => [u.uid, u]));
  let appliques = 0;
  const points = (project.points ?? []).map((p) => {
    const u = byUid.get(p.uid);
    if (!u) return p;
    appliques += 1;
    return {
      ...p,
      ...(u.testStatus !== undefined ? { testStatus: u.testStatus } : {}),
      ...(u.testComment !== undefined ? { testComment: u.testComment } : {}),
    };
  });

  const doc = await prisma.affectationProjet.update({
    where: { id: projetId },
    // updatedById = celui qui SYNCHRONISE (la file offline ne transporte pas
    // l'auteur de la saisie terrain) — voir src/lib/offline/mise-en-service.ts.
    data: {
      data: { ...project, points } as unknown as Prisma.InputJsonValue,
      updatedById: userId,
    },
    select: { updatedAt: true },
  });
  revalidatePath(BASE);
  revalidatePath("/affaires");
  return { ok: true, updatedAt: doc.updatedAt.toISOString(), appliques };
}

export async function supprimerProjet(id: string): Promise<void> {
  await requireUserId();
  await prisma.affectationProjet.delete({ where: { id } });
  revalidatePath(BASE);
}
