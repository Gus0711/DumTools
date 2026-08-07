import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listerAssociations } from "@/tools/magasin/queries";
import { peutVoirDevis } from "@/tools/devis/model";

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
  if (!peutVoirDevis(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const produitId = new URL(req.url).searchParams.get("produitId") ?? "";
  if (!produitId.trim()) return NextResponse.json([]);

  try {
    return NextResponse.json(await listerAssociations(produitId));
  } catch {
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}
