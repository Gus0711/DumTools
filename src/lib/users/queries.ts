import "server-only";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

/** Ligne d'utilisateur pour l'écran d'administration (sans le hash). */
export interface UtilisateurRow {
  id: string;
  email: string;
  nom: string;
  role: Role;
  actif: boolean;
  /** L'utilisateur a-t-il un jeton d'accès MCP actif ? */
  aJetonMcp: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function listerUtilisateurs(): Promise<UtilisateurRow[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
    select: {
      id: true,
      email: true,
      nom: true,
      role: true,
      actif: true,
      mcpTokenHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return users.map(({ mcpTokenHash, ...u }) => ({ ...u, aJetonMcp: mcpTokenHash != null }));
}
