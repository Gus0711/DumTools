"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { resoudreClientId } from "@/lib/clients/queries";
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

export async function creerProjet(): Promise<void> {
  const userId = await requireUserId();
  const project = defaultProject(dateLabel());
  const doc = await prisma.affectationProjet.create({
    data: {
      nom: project.name,
      createdById: userId,
      data: project as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  revalidatePath(BASE);
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

  const doc = await prisma.affectationProjet.create({
    data: {
      nom: project.name,
      clientNom: liste.clientNom,
      clientId: liste.clientId ?? (await resoudreClientId(liste.clientNom)),
      numeroWhy: liste.numeroWhy,
      createdById: userId,
      data: project as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  revalidatePath(BASE);
  redirect(`${BASE}/${doc.id}`);
}

export interface SauverPayload {
  nom: string;
  clientNom: string;
  numeroWhy: string;
  project: Project;
}

export async function sauverProjet(
  id: string,
  data: SauverPayload,
): Promise<{ ok: true; updatedAt: string }> {
  await requireUserId();
  const clientId = await resoudreClientId(data.clientNom);
  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: {
      nom: data.nom?.trim() || "Sans titre",
      clientNom: data.clientNom ?? "",
      clientId,
      numeroWhy: data.numeroWhy?.trim() || null,
      data: data.project as unknown as Prisma.InputJsonValue,
    },
    select: { updatedAt: true },
  });
  revalidatePath(BASE);
  revalidatePath("/clients");
  return { ok: true, updatedAt: doc.updatedAt.toISOString() };
}

export async function supprimerProjet(id: string): Promise<void> {
  await requireUserId();
  await prisma.affectationProjet.delete({ where: { id } });
  revalidatePath(BASE);
}
