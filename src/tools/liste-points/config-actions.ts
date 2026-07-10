"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { ModelePoint } from "./model";

const CONFIG = "/configuration/points";
const EDITOR = "/outils/liste-points";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
}

function revalidate() {
  revalidatePath(CONFIG);
  revalidatePath(EDITOR, "layout");
  // L'éditeur unifié (Projet GTB) charge aussi catalogue de points + modèles.
  revalidatePath("/outils/affectation-es", "layout");
}

// --- Catalogue de points ----------------------------------------------------

export async function enregistrerPointCatalogue(p: {
  id?: string;
  nom: string;
  type: string;
  signal?: string | null;
}) {
  await requireUser();
  const nom = p.nom.trim();
  const type = p.type.trim().toUpperCase();
  // Signal = signal électrique (AI/DI/AO/DO) ou protocole de communication (COM).
  const signal = p.signal?.trim() || null;
  if (!nom) throw new Error("Nom requis");
  if (p.id) await prisma.pointCatalog.update({ where: { id: p.id }, data: { nom, type, signal } });
  else
    await prisma.pointCatalog.upsert({
      where: { nom },
      create: { nom, type, signal },
      update: { type, signal },
    });
  revalidate();
}

export async function supprimerPointCatalogue(id: string) {
  await requireUser();
  await prisma.pointCatalog.delete({ where: { id } });
  revalidate();
}

// --- Modèles ----------------------------------------------------------------

export async function enregistrerModele(p: {
  id?: string;
  nom: string;
  ordre: number;
  points: ModelePoint[];
}) {
  await requireUser();
  const nom = p.nom.trim();
  if (!nom) throw new Error("Nom du modèle requis");
  const data = {
    nom,
    ordre: Math.trunc(Number(p.ordre) || 0),
    points: (p.points ?? [])
      .filter((pt) => pt.nom.trim())
      .map((pt) => ({
        nom: pt.nom.trim(),
        type: pt.type,
        ...(pt.signal ? { signal: pt.signal } : {}),
      })) as unknown as Prisma.InputJsonValue,
  };
  if (p.id) await prisma.modele.update({ where: { id: p.id }, data });
  else await prisma.modele.create({ data });
  revalidate();
}

export async function supprimerModele(id: string) {
  await requireUser();
  await prisma.modele.delete({ where: { id } });
  revalidate();
}
