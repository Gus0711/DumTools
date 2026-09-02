import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ecrireMedia, supprimerMedia } from "@/lib/medias-document/stockage";
import {
  MIMES_DOCUMENTATION,
  TAILLE_MAX_DOCUMENTATION,
  estCategorieDoc,
} from "@/tools/magasin/model";
import { DEPOT_DOCUMENTATIONS } from "@/tools/magasin/stockage";
import { peutGererReferentiel } from "@/tools/magasin/model";

// Multipart + écriture disque → runtime Node obligatoire.
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * TÉLÉVERSEMENT d'une documentation produit.
 *
 * Réservé aux profils Achats/Administrateur, comme tout le référentiel : c'est
 * une écriture de catalogue, pas un mouvement de stock. La lecture, elle, est
 * ouverte à tout collègue connecté (route [id]) — un technicien sur site a
 * besoin de la notice, et une fiche constructeur ne porte aucun prix.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!peutGererReferentiel(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const produitId = String(form.get("produitId") || "");
  const categorie = String(form.get("categorie") || "fiche");
  const titreSaisi = String(form.get("titre") || "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > TAILLE_MAX_DOCUMENTATION) {
    const mo = Math.round(TAILLE_MAX_DOCUMENTATION / (1024 * 1024));
    return NextResponse.json({ error: `Fichier trop volumineux (max ${mo} Mo)` }, { status: 413 });
  }
  const mimeType = file.type || "application/octet-stream";
  if (!MIMES_DOCUMENTATION.has(mimeType)) {
    return NextResponse.json(
      { error: "Format non accepté — déposez un PDF, une image ou un document bureautique" },
      { status: 415 },
    );
  }
  if (produitId) {
    const existe = await prisma.produit.findUnique({
      where: { id: produitId },
      select: { id: true },
    });
    if (!existe) return NextResponse.json({ error: "Produit inconnu" }, { status: 404 });
  }

  // Le titre par défaut est le nom du fichier sans son extension : « ECY-303_SP »
  // se lit, « d3f1…-bin » non.
  const titre = titreSaisi || file.name.replace(/\.[a-z0-9]+$/i, "") || "Document";

  const contenu = Buffer.from(await file.arrayBuffer());
  const chemin = await ecrireMedia(DEPOT_DOCUMENTATIONS, randomUUID(), contenu);

  try {
    const doc = await prisma.documentation.create({
      data: {
        titre,
        categorie: estCategorieDoc(categorie) ? categorie : "fiche",
        fichier: chemin,
        nom: file.name || "",
        mimeType,
        taille: contenu.byteLength,
        createdById: session.user.id,
        updatedById: session.user.id,
        ...(produitId ? { produits: { create: { produitId, ordre: 0 } } } : {}),
      },
      select: { id: true, titre: true },
    });
    return NextResponse.json({ ok: true, ...doc });
  } catch (e) {
    // La ligne en base fait foi : si elle n'a pas pu s'écrire, le binaire ne
    // doit pas rester à traîner sur le disque de la VM.
    await supprimerMedia(chemin);
    throw e;
  }
}
