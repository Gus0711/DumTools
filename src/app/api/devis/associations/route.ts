import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listerAssociations } from "@/tools/magasin/queries";

// Prisma + auth Node → runtime Node.
export const runtime = "nodejs";

/**
 * Les associations d'un produit (« ce produit en appelle d'autres »), lues au
 * moment où l'on ajoute une ligne de devis.
 *
 * ⚠️ La réponse porte le DÉBOURSÉ des associés : le contrôle de droit est ici,
 * en clair, et pas seulement sur l'écran qui l'appelle.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  /* ⚠️ Plus de garde de rôle : l'outil Devis est ouvert à toute l'équipe depuis
     le 2026-08-12 (note « DROITS » de src/tools/devis/model.ts). Une session
     suffit — mais elle reste EXIGÉE : cette route sert du chiffrage interne. */

  const produitId = new URL(req.url).searchParams.get("produitId") ?? "";
  if (!produitId.trim()) return NextResponse.json([]);

  try {
    return NextResponse.json(await listerAssociations(produitId));
  } catch {
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}
