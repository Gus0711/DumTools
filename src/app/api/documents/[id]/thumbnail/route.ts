import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { downloadThumbnail } from "@/lib/kdrive/client";

export const runtime = "nodejs";

/** Relaie la vignette kDrive d'un document poussé. 404 si non synchronisé ou si
 *  le type n'a pas d'aperçu (l'UI retombe alors sur une icône). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await params;
  const w = Number(new URL(req.url).searchParams.get("w")) || 96;

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { kdriveFileId: true },
  });
  if (!doc?.kdriveFileId) {
    return NextResponse.json({ error: "Aucune vignette" }, { status: 404 });
  }

  const amont = await downloadThumbnail(doc.kdriveFileId, Math.min(Math.max(w, 32), 512));
  if (!amont.ok || !amont.body) {
    return NextResponse.json({ error: "Aucune vignette" }, { status: 404 });
  }
  return new Response(amont.body, {
    headers: {
      "Content-Type": amont.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
