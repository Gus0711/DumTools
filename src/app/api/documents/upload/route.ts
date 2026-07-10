import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { estCategorie, TAILLE_MAX } from "@/tools/documents/model";
import { ecrireSpool } from "@/tools/documents/spool";
import { trouverDoublon } from "@/tools/documents/queries";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 300;

// TODO (lot 6 / spike) : pour les très gros fichiers (~>100 Mo), remplacer
// request.formData() (qui bufferise le fichier en mémoire) par un parsing
// multipart en flux directement vers le spool.

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const chantierId = String(form.get("chantierId") || "");
  const categorie = String(form.get("categorie") || "");
  // mode de résolution de doublon : "" | "ecraser" | "renommer"
  const mode = String(form.get("mode") || "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (!estCategorie(categorie)) {
    return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
  }
  if (file.size > TAILLE_MAX) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (max 500 Mo)" },
      { status: 413 },
    );
  }

  const chantier = await prisma.chantier.findUnique({
    where: { id: chantierId },
    select: { id: true, clientId: true, numeroWhy: true },
  });
  if (!chantier) {
    return NextResponse.json({ error: "Affaire introuvable" }, { status: 404 });
  }

  const nom = file.name;

  // Détection de doublon AU DÉPÔT contre la DB locale (pas kDrive → async préservé).
  const doublon = await trouverDoublon(chantierId, categorie, nom);
  if (doublon && !mode) {
    return NextResponse.json({ duplicate: true, nom }, { status: 409 });
  }

  const politiqueConflit = mode === "renommer" ? "RENAME" : "VERSION";

  // « Écraser » : on réutilise la ligne existante (nouvelle version kDrive au push).
  // « Renommer » / nouveau : on crée une ligne.
  const cible =
    doublon && mode === "ecraser"
      ? doublon
      : await prisma.document.create({
          data: {
            nom,
            categorie,
            mimeType: file.type || "application/octet-stream",
            taille: file.size,
            chantierId,
            clientId: chantier.clientId,
            numeroWhy: chantier.numeroWhy,
            politiqueConflit,
            statutSync: "EN_ATTENTE",
            createdById: userId,
          },
          select: { id: true },
        });

  const spoolPath = await ecrireSpool(cible.id, nom, file.stream());

  await prisma.document.update({
    where: { id: cible.id },
    data: {
      spoolPath,
      taille: file.size,
      mimeType: file.type || "application/octet-stream",
      politiqueConflit,
      statutSync: "EN_ATTENTE",
      tentatives: 0,
      syncError: null,
    },
  });

  return NextResponse.json({ ok: true, id: cible.id });
}
