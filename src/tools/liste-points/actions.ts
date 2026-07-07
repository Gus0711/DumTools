"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { resoudreClientId } from "@/lib/clients/queries";
import { IO_TYPES, type IoType, type PointRow } from "./model";

const BASE = "/outils/liste-points";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return id;
}

function rowId(): string {
  return crypto.randomUUID();
}

/** Crée un document vide (avec une première section) et redirige vers l'éditeur. */
export async function creerDocument(): Promise<void> {
  const userId = await requireUserId();
  const doc = await prisma.pointsList.create({
    data: {
      createdById: userId,
      date: new Date(),
      rows: [
        { id: rowId(), kind: "section", nom: "Généralité" },
      ] as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  revalidatePath(BASE);
  redirect(`${BASE}/${doc.id}`);
}

export interface SauverPayload {
  titre?: string;
  clientNom: string;
  chantierNom: string;
  numeroWhy: string;
  date: string | null;
  rows: PointRow[];
}

export async function sauverDocument(
  id: string,
  data: SauverPayload,
): Promise<{ ok: true; updatedAt: string }> {
  await requireUserId();
  if (!Array.isArray(data.rows)) throw new Error("Lignes invalides");

  const clientId = await resoudreClientId(data.clientNom);
  const doc = await prisma.pointsList.update({
    where: { id },
    data: {
      titre: data.titre?.trim() || null,
      clientNom: data.clientNom ?? "",
      clientId,
      numeroWhy: data.numeroWhy?.trim() || null,
      chantierNom: data.chantierNom ?? "",
      date: data.date ? new Date(data.date) : null,
      rows: data.rows as unknown as Prisma.InputJsonValue,
    },
    select: { updatedAt: true },
  });
  revalidatePath(BASE);
  revalidatePath("/clients");
  return { ok: true, updatedAt: doc.updatedAt.toISOString() };
}

export async function supprimerDocument(id: string): Promise<void> {
  await requireUserId();
  await prisma.pointsList.delete({ where: { id } });
  revalidatePath(BASE);
}

/** Ajoute un point au catalogue partagé. */
export async function ajouterPointCatalogue(
  nom: string,
  type: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUserId();
  const nomClean = nom.trim();
  if (!nomClean) return { ok: false, error: "Nom requis" };
  if (!IO_TYPES.includes(type as IoType))
    return { ok: false, error: "Type invalide" };

  const existe = await prisma.pointCatalog.findUnique({
    where: { nom: nomClean },
  });
  if (existe) return { ok: false, error: "Ce point existe déjà" };

  await prisma.pointCatalog.create({ data: { nom: nomClean, type } });
  revalidatePath(BASE);
  return { ok: true };
}
