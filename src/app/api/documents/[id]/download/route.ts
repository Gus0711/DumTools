import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { downloadFile } from "@/lib/kdrive/client";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { nom: true, mimeType: true, spoolPath: true, kdriveFileId: true },
  });
  if (!doc) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const disposition = `inline; filename*=UTF-8''${encodeURIComponent(doc.nom)}`;

  // Fichier encore sur le spool (pas encore poussé) → on sert la copie locale.
  if (doc.spoolPath) {
    const stream = Readable.toWeb(createReadStream(doc.spoolPath)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": disposition,
      },
    });
  }

  // Sinon (kDrive maître seul), on relaie le flux depuis kDrive.
  if (doc.kdriveFileId) {
    const amont = await downloadFile(doc.kdriveFileId);
    if (!amont.ok || !amont.body) {
      return NextResponse.json({ error: "kDrive indisponible" }, { status: 502 });
    }
    return new Response(amont.body, {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": disposition,
      },
    });
  }

  return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
}
