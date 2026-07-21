import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rechercheGlobale } from "@/lib/recherche/queries";

// Prisma + auth Node → runtime Node.
export const runtime = "nodejs";

/**
 * Recherche globale de la palette ⌘K. GET pour pouvoir annuler proprement une
 * requête en cours (AbortController) pendant la frappe.
 * L'accès est déjà filtré par proxy.ts ; on revérifie la session ici (l'app est
 * exposée sur internet — aucune route ne fait confiance au proxy seul).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ resultats: await rechercheGlobale(q) });
  } catch {
    return NextResponse.json({ error: "Recherche impossible" }, { status: 500 });
  }
}
