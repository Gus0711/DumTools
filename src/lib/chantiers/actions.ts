"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { EtatAffaire } from "@/generated/prisma/enums";
import { resoudreClientId } from "@/lib/clients/queries";

async function requireUser(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
}

/** Crée une affaire (Chantier) rattachée à un client. Le numéro Why est optionnel
 *  mais unique : c'est la clé qui rattachera automatiquement les projets saisis
 *  avec ce même numéro. Redirige vers la fiche de la nouvelle affaire. */
export async function creerAffaire(p: {
  nom: string;
  clientNom: string;
  numeroWhy: string;
}): Promise<void> {
  await requireUser();
  const nom = p.nom.trim();
  const numeroWhy = p.numeroWhy.trim() || null;
  if (!nom) throw new Error("Nom de l'affaire requis");
  const clientId = await resoudreClientId(p.clientNom);
  if (!clientId) throw new Error("Client requis");

  let affaire: { id: string };
  try {
    affaire = await prisma.chantier.create({
      data: { nom, numeroWhy, clientId },
      select: { id: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new Error("Une affaire existe déjà avec ce numéro Why");
    throw e;
  }
  revalidatePath("/affaires");
  redirect(`/affaires/${affaire.id}`);
}

function revalidate(id: string) {
  revalidatePath("/affaires");
  revalidatePath(`/affaires/${id}`);
}

/** Modifie l'identité de l'affaire (nom, client, n° Why) — l'identification vit
 *  ici, plus dans chaque automate. Synchronise les automates rattachés. */
export async function modifierAffaire(
  id: string,
  p: { nom: string; clientNom: string; numeroWhy: string },
): Promise<void> {
  await requireUser();
  const nom = p.nom.trim();
  if (!nom) throw new Error("Nom requis");
  const clientNom = p.clientNom.trim();
  const clientId = await resoudreClientId(clientNom);
  if (!clientId) throw new Error("Client requis");
  const numeroWhy = p.numeroWhy.trim() || null;

  try {
    await prisma.chantier.update({ where: { id }, data: { nom, clientId, numeroWhy } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new Error("Une affaire existe déjà avec ce numéro Why");
    throw e;
  }

  // L'identité est dénormalisée sur les automates rattachés : on les resynchronise.
  await prisma.affectationProjet.updateMany({
    where: { chantierId: id },
    data: { clientId, clientNom, numeroWhy },
  });

  revalidate(id);
  revalidatePath("/outils/affectation-es", "layout");
  revalidatePath("/clients");
}

export async function changerEtatAffaire(id: string, etat: EtatAffaire): Promise<void> {
  await requireUser();
  await prisma.chantier.update({ where: { id }, data: { etat } });
  revalidate(id);
}
