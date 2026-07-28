import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { lirePhotoScan } from "@/tools/modems/stockage";

export const runtime = "nodejs";

/** Sert le binaire d'une photo de scan, authentifié. Les <img> du tableau et de
 *  la fiche affaire pointent ici (le cookie de session part avec la requête). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const photo = await prisma.scanPhoto.findUnique({
    where: { id },
    select: { fichier: true, mimeType: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  let contenu: Buffer;
  try {
    contenu = await lirePhotoScan(photo.fichier);
  } catch {
    return NextResponse.json({ error: "Fichier absent du stockage" }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(contenu.byteLength),
      // Une photo est immuable (UUID) : cache privé long.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
