import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rechercherArticles } from "@/tools/devis/queries";

// Prisma + auth Node → runtime Node.
export const runtime = "nodejs";

/**
 * Recherche d'articles pour la barre d'ajout de l'éditeur. GET, pour pouvoir
 * abandonner proprement une requête pendant la frappe.
 *
 * ⚠️ La réponse porte le DÉBOURSÉ : le contrôle de droit est ici, en clair, et
 * pas seulement sur l'écran qui l'appelle. L'app est exposée sur internet — la
 * route ne fait confiance ni au proxy, ni à l'interface.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  /* ⚠️ Plus de garde de rôle : l'outil Devis est ouvert à toute l'équipe depuis
     le 2026-08-12 (note « DROITS » de src/tools/devis/model.ts). Une session
     suffit — mais elle reste EXIGÉE : cette route sert du chiffrage interne. */

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json([]);

  try {
    return NextResponse.json(await rechercherArticles(q));
  } catch {
    return NextResponse.json({ error: "Recherche impossible" }, { status: 500 });
  }
}
