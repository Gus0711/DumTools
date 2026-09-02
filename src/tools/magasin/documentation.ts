import "server-only";
import { prisma } from "@/lib/db";
import {
  estCategorieDoc,
  type DocumentationAvecProduits,
  type DocumentationVue,
} from "./model";

/* =============================================================================
 * LECTURES DE LA DOCUMENTATION
 *
 * Le chemin disque ne sort JAMAIS d'ici : `DocumentationVue` n'a pas de champ
 * `fichier`. Ce qui a besoin du binaire (la route qui le sert) appelle
 * `fichierDocumentation`, et rien d'autre.
 * ========================================================================== */

const CHAMPS = {
  id: true,
  titre: true,
  categorie: true,
  url: true,
  nom: true,
  mimeType: true,
  taille: true,
  note: true,
  updatedAt: true,
  _count: { select: { produits: true } },
} as const;

type LigneDoc = {
  id: string;
  titre: string;
  categorie: string;
  url: string | null;
  nom: string;
  mimeType: string;
  taille: number;
  note: string;
  updatedAt: Date;
  _count: { produits: number };
};

function vue(d: LigneDoc): DocumentationVue {
  return {
    id: d.id,
    titre: d.titre,
    categorie: estCategorieDoc(d.categorie) ? d.categorie : "autre",
    url: d.url,
    nom: d.nom,
    mimeType: d.mimeType,
    taille: d.taille,
    note: d.note,
    nbProduits: d._count.produits,
    majLe: d.updatedAt,
  };
}

/** Le référentiel entier — la bibliothèque de fiches de la maison. */
export async function listerDocumentations(q = ""): Promise<DocumentationVue[]> {
  const terme = q.trim();
  const lignes = await prisma.documentation.findMany({
    where: terme
      ? {
          OR: [
            { titre: { contains: terme, mode: "insensitive" } },
            { nom: { contains: terme, mode: "insensitive" } },
            { note: { contains: terme, mode: "insensitive" } },
            { produits: { some: { produit: { designation: { contains: terme, mode: "insensitive" } } } } },
            { produits: { some: { produit: { refInterne: { contains: terme, mode: "insensitive" } } } } },
          ],
        }
      : undefined,
    orderBy: [{ categorie: "asc" }, { titre: "asc" }],
    select: CHAMPS,
  });
  return lignes.map(vue);
}

/** La bibliothèque entière, chaque fiche avec les produits qu'elle sert. */
export async function listerDocumentationsAvecProduits(): Promise<DocumentationAvecProduits[]> {
  const lignes = await prisma.documentation.findMany({
    orderBy: [{ categorie: "asc" }, { titre: "asc" }],
    select: {
      ...CHAMPS,
      produits: {
        orderBy: { produit: { refInterne: "asc" } },
        select: {
          produit: { select: { id: true, refInterne: true, designation: true } },
        },
      },
    },
  });
  return lignes.map((d) => ({ ...vue(d), produits: d.produits.map((p) => p.produit) }));
}

/** Les documentations d'UN produit, dans l'ordre réglé sur sa fiche. */
export async function documentationsDuProduit(produitId: string): Promise<DocumentationVue[]> {
  if (!produitId) return [];
  const liens = await prisma.produitDocumentation.findMany({
    where: { produitId },
    orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
    select: { documentation: { select: CHAMPS } },
  });
  return liens.map((l) => vue(l.documentation));
}

/**
 * Les documentations de PLUSIEURS produits, DÉDOUBLONNÉES.
 *
 * C'est la forme dont se servent la base matériel et les annexes d'un devis :
 * six modules d'extension citent la même notice « ECY IO Modules », qui ne doit
 * apparaître qu'une fois. L'ordre est celui de la lecture — catégorie, puis
 * titre — et non celui des produits, qui n'aurait aucun sens pour un lecteur.
 */
export async function documentationsPourProduits(
  produitIds: readonly string[],
): Promise<DocumentationVue[]> {
  const ids = [...new Set(produitIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const lignes = await prisma.documentation.findMany({
    where: { produits: { some: { produitId: { in: ids } } } },
    orderBy: [{ categorie: "asc" }, { titre: "asc" }],
    select: CHAMPS,
  });
  return lignes.map(vue);
}

/** Par produit — pour afficher chaque fiche matériel avec SES liens. */
export async function documentationsParProduit(
  produitIds: readonly string[],
): Promise<Map<string, DocumentationVue[]>> {
  const ids = [...new Set(produitIds.filter(Boolean))];
  const parProduit = new Map<string, DocumentationVue[]>();
  if (ids.length === 0) return parProduit;

  const liens = await prisma.produitDocumentation.findMany({
    where: { produitId: { in: ids } },
    orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
    select: { produitId: true, documentation: { select: CHAMPS } },
  });
  for (const l of liens) {
    const liste = parProduit.get(l.produitId);
    if (liste) liste.push(vue(l.documentation));
    else parProduit.set(l.produitId, [vue(l.documentation)]);
  }
  return parProduit;
}

/** Les produits qui citent cette documentation — affiché avant de supprimer. */
export async function produitsDeLaDocumentation(documentationId: string) {
  const liens = await prisma.produitDocumentation.findMany({
    where: { documentationId },
    orderBy: { produit: { designation: "asc" } },
    select: {
      produit: { select: { id: true, refInterne: true, designation: true, actif: true } },
    },
  });
  return liens.map((l) => l.produit);
}

/**
 * Le binaire d'une documentation — la SEULE lecture qui rend le chemin disque.
 * Aucun contrôle d'accès ici : c'est la route appelante qui décide, en clair,
 * qui a le droit de lire quoi (même règle que `reponseMedia`).
 */
export async function fichierDocumentation(id: string) {
  if (!id) return null;
  const d = await prisma.documentation.findUnique({
    where: { id },
    select: { fichier: true, mimeType: true, nom: true, titre: true },
  });
  if (!d?.fichier) return null;
  return { fichier: d.fichier, mimeType: d.mimeType, nom: d.nom || `${d.titre}.pdf` };
}
