import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { downloadFile, kdriveConfigured } from "@/lib/kdrive/client";

export const runtime = "nodejs";

/* Téléchargement d'un fichier kDrive « à la main » (miroir lecture seule) : il n'a
 * pas de ligne `Document`, on relaie donc directement le flux kDrive par son id.
 * Le nom d'affichage vient du query param `?nom=` (fourni par le miroir). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!kdriveConfigured()) {
    return NextResponse.json({ error: "kDrive non configuré" }, { status: 404 });
  }

  const { fileId } = await params;
  const nom = new URL(req.url).searchParams.get("nom") || "fichier";

  const amont = await downloadFile(fileId);
  if (!amont.ok || !amont.body) {
    return NextResponse.json({ error: "kDrive indisponible" }, { status: 502 });
  }
  return new Response(amont.body, {
    headers: {
      "Content-Type": amont.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nom)}`,
    },
  });
}
