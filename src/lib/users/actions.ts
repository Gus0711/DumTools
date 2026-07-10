"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";

const CONFIG = "/configuration/utilisateurs";

/** Toute action de gestion des comptes est réservée aux administrateurs. */
async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
  if (session.user.role !== Role.ADMIN)
    throw new Error("Réservé aux administrateurs");
  return session.user.id;
}

function normaliserRole(v: unknown): Role {
  return v === Role.ADMIN ? Role.ADMIN : Role.MEMBRE;
}

/** Nombre d'administrateurs encore actifs hormis `saufId`. Garde-fou anti-lockout. */
async function autresAdminsActifs(saufId: string): Promise<number> {
  return prisma.user.count({
    where: { role: Role.ADMIN, actif: true, id: { not: saufId } },
  });
}

export async function creerUtilisateur(p: {
  nom: string;
  email: string;
  motDePasse: string;
  role: string;
}) {
  await requireAdmin();
  const nom = p.nom.trim();
  const email = p.email.trim().toLowerCase();
  const motDePasse = p.motDePasse;
  if (!nom) throw new Error("Nom requis");
  if (!email) throw new Error("Email requis");
  if (motDePasse.length < 8)
    throw new Error("Mot de passe : 8 caractères minimum");

  const passwordHash = await bcrypt.hash(motDePasse, 10);
  try {
    await prisma.user.create({
      data: { nom, email, passwordHash, role: normaliserRole(p.role), actif: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new Error("Un compte existe déjà avec cet email");
    throw e;
  }
  revalidatePath(CONFIG);
}

export async function modifierUtilisateur(p: {
  id: string;
  nom: string;
  role: string;
  actif: boolean;
}) {
  await requireAdmin();
  const nom = p.nom.trim();
  if (!nom) throw new Error("Nom requis");
  const role = normaliserRole(p.role);

  // On ne peut pas retirer le dernier administrateur actif (soi-même compris).
  const cible = await prisma.user.findUnique({ where: { id: p.id } });
  if (!cible) throw new Error("Utilisateur introuvable");
  const perdAdmin =
    cible.role === Role.ADMIN &&
    cible.actif &&
    (role !== Role.ADMIN || !p.actif);
  if (perdAdmin && (await autresAdminsActifs(p.id)) === 0)
    throw new Error("Impossible : c'est le dernier administrateur actif");

  await prisma.user.update({
    where: { id: p.id },
    data: { nom, role, actif: p.actif },
  });
  revalidatePath(CONFIG);
}

export async function reinitialiserMotDePasse(p: {
  id: string;
  motDePasse: string;
}) {
  await requireAdmin();
  const motDePasse = p.motDePasse.trim();
  if (motDePasse.length < 8)
    throw new Error("Mot de passe : 8 caractères minimum");
  const passwordHash = await bcrypt.hash(motDePasse, 10);
  await prisma.user.update({ where: { id: p.id }, data: { passwordHash } });
  revalidatePath(CONFIG);
}

/**
 * Génère un jeton d'accès MCP pour un utilisateur (remplace l'éventuel jeton
 * existant). Seul le hash SHA-256 est stocké ; le jeton en clair n'est renvoyé
 * qu'ICI, une seule fois, pour être copié dans la config du poste (en-tête
 * « Authorization: Bearer … »). Voir mcp/README.md.
 */
export async function genererJetonMcp(p: { id: string }): Promise<{ token: string }> {
  await requireAdmin();
  const cible = await prisma.user.findUnique({ where: { id: p.id }, select: { id: true } });
  if (!cible) throw new Error("Utilisateur introuvable");
  const token = "dtk_" + randomBytes(32).toString("hex");
  const mcpTokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.user.update({ where: { id: p.id }, data: { mcpTokenHash } });
  revalidatePath(CONFIG);
  return { token };
}

/** Révoque le jeton d'accès MCP d'un utilisateur (coupe son accès au serveur MCP). */
export async function revoquerJetonMcp(p: { id: string }) {
  await requireAdmin();
  await prisma.user.update({ where: { id: p.id }, data: { mcpTokenHash: null } });
  revalidatePath(CONFIG);
}
