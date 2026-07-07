"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const BASE = "/clients";

async function requireUser(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
}

/** Crée un client dans le référentiel et redirige vers sa fiche. */
export async function creerClient(formData: FormData): Promise<void> {
  await requireUser();
  const nom = String(formData.get("nom") || "").trim();
  if (!nom) throw new Error("Nom requis");

  const existant = await prisma.client.findUnique({
    where: { nom },
    select: { id: true },
  });
  const id =
    existant?.id ??
    (await prisma.client.create({ data: { nom }, select: { id: true } })).id;

  revalidatePath(BASE);
  redirect(`${BASE}/${id}`);
}

export async function renommerClient(
  id: string,
  nom: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const n = nom.trim();
  if (!n) return { ok: false, error: "Nom requis" };

  const collision = await prisma.client.findUnique({
    where: { nom: n },
    select: { id: true },
  });
  if (collision && collision.id !== id) {
    return { ok: false, error: "Un client porte déjà ce nom" };
  }

  await prisma.client.update({ where: { id }, data: { nom: n } });
  // Resynchronise le libellé dénormalisé des documents rattachés.
  await Promise.all([
    prisma.pointsList.updateMany({
      where: { clientId: id },
      data: { clientNom: n },
    }),
    prisma.affectationProjet.updateMany({
      where: { clientId: id },
      data: { clientNom: n },
    }),
  ]);
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  return { ok: true };
}

/**
 * Supprime un client du référentiel. Les documents rattachés ne sont PAS
 * supprimés : leur clientId passe à null (onDelete: SetNull), le libellé
 * clientNom est conservé.
 */
export async function supprimerClient(id: string): Promise<void> {
  await requireUser();
  await prisma.client.delete({ where: { id } });
  revalidatePath(BASE);
  redirect(BASE);
}
