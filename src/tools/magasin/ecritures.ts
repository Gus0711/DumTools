import "server-only";

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { cleReferentiel, peutGererReferentiel } from "./model";

/* =============================================================================
 * LE NOYAU DES ÉCRITURES DU RÉFÉRENTIEL PRODUIT
 *
 * Deux portes y mènent : les server actions du Magasin (`./actions`) et le
 * serveur MCP (`mcp/data.mts`). Une seule porte d'écriture pour les produits,
 * donc — la règle était déjà écrite dans `produitDuBrouillon`, le MCP ne devait
 * pas l'enjamber.
 *
 * ⚠️ La garde de DROIT est ici, pas seulement dans l'action : créer un produit
 * engage le référentiel de tout le monde, et un chemin qui l'oublierait
 * (script, MCP) le ferait sans que rien ne le signale.
 * ========================================================================== */

function texte(v: unknown): string {
  return String(v ?? "").trim();
}

function texteOuNull(v: unknown): string | null {
  const t = texte(v);
  return t === "" ? null : t;
}

/**
 * Retrouve une entrée de référentiel par son NOM, à la casse, aux accents et aux
 * espaces près (`cleReferentiel`). C'est le garde-fou anti-doublon : « SIEMENS »
 * saisi à l'import et « Siemens » saisi à la main désignent le même fabricant.
 * Ce qu'il ne peut pas rattraper — « Siemnes » — se fusionne à la main depuis
 * l'écran des référentiels.
 */
export async function trouverParNom<T extends { id: string; nom: string }>(
  lignes: T[],
  nom: string,
): Promise<T | undefined> {
  const cle = cleReferentiel(nom);
  return lignes.find((l) => cleReferentiel(l.nom) === cle);
}

/** id explicite > nom à rapprocher > rien. Créer par le nom reste possible :
 *  sans ça, un import ou une saisie rapide se retrouverait bloqué. */
async function resoudreFabricantId(
  id: string | null | undefined,
  nom: string | null | undefined,
): Promise<string | null> {
  const choisi = texteOuNull(id);
  if (choisi) return choisi;
  const libelle = texte(nom);
  if (!libelle) return null;
  const existants = await prisma.fabricant.findMany({ select: { id: true, nom: true } });
  const trouve = await trouverParNom(existants, libelle);
  if (trouve) return trouve.id;
  const cree = await prisma.fabricant.create({
    data: { nom: libelle },
    select: { id: true },
  });
  return cree.id;
}

async function resoudreCategorieId(
  id: string | null | undefined,
  nom: string | null | undefined,
): Promise<string | null> {
  const choisie = texteOuNull(id);
  if (choisie) return choisie;
  const libelle = texte(nom);
  if (!libelle) return null;
  const existantes = await prisma.categorieProduit.findMany({ select: { id: true, nom: true } });
  const trouvee = await trouverParNom(existantes, libelle);
  if (trouvee) return trouvee.id;
  const derniere = await prisma.categorieProduit.findFirst({
    orderBy: { ordre: "desc" },
    select: { ordre: true },
  });
  const creee = await prisma.categorieProduit.create({
    data: { nom: libelle, ordre: (derniere?.ordre ?? 0) + 1 },
    select: { id: true },
  });
  return creee.id;
}

export interface SaisieProduit {
  id?: string;
  refInterne: string;
  refFabricant?: string | null;
  designation: string;
  /** Le fabricant est CHOISI dans le référentiel. */
  fabricantId?: string | null;
  /** …ou nommé, si l'utilisateur a explicitement demandé à en créer un. Le nom
   *  est rapproché de l'existant à la casse et aux accents près : on ne crée
   *  jamais un doublon de « Siemens » sans le vouloir. */
  fabricantNom?: string | null;
  categorieId?: string | null;
  /** Idem pour la catégorie (chemin d'import, surtout). */
  categorieNom?: string | null;
  unite?: string;
  serialisable?: boolean;
  seuilMini?: number;
  emplacement?: string | null;
  docUrl?: string;
  note?: string;
  remplaceParId?: string | null;
  /** Un produit = un fournisseur (docs/MAGASIN.md §3). */
  fournisseurId?: string | null;
  /** Nom d'un fournisseur à créer à la volée, si `fournisseurId` est vide :
   *  saisir un prix ne doit pas obliger à quitter l'écran. */
  fournisseurNom?: string | null;
  refFournisseur?: string | null;
  prixAchatCents?: number | null;
  delaiJours?: number | null;
}

export async function enregistrerProduit(
  acteur: { id: string; role: string | null | undefined },
  p: SaisieProduit,
): Promise<{ id: string }> {
  if (!peutGererReferentiel(acteur.role)) {
    throw new Error("Réservé aux profils Achats et Administrateur");
  }

  const refInterne = texte(p.refInterne);
  const designation = texte(p.designation);
  if (!refInterne) throw new Error("Référence interne requise");
  if (!designation) throw new Error("Désignation requise");

  const [fabricantId, categorieId] = await Promise.all([
    resoudreFabricantId(p.fabricantId, p.fabricantNom),
    resoudreCategorieId(p.categorieId, p.categorieNom),
  ]);

  const seuil = Math.max(0, Math.round(Number(p.seuilMini ?? 0)) || 0);

  // Fournisseur : choisi, ou créé au vol depuis son seul nom.
  let fournisseurId = texteOuNull(p.fournisseurId);
  const nomFournisseur = texteOuNull(p.fournisseurNom);
  if (!fournisseurId && nomFournisseur) {
    const existant = await prisma.fournisseur.findUnique({
      where: { nom: nomFournisseur },
      select: { id: true },
    });
    fournisseurId =
      existant?.id ??
      (await prisma.fournisseur.create({ data: { nom: nomFournisseur }, select: { id: true } })).id;
  }

  const prixAchatCents =
    p.prixAchatCents === null || p.prixAchatCents === undefined
      ? null
      : Math.max(0, Math.round(Number(p.prixAchatCents)));
  const delai =
    p.delaiJours === null || p.delaiJours === undefined ? null : Math.round(Number(p.delaiJours));

  const data = {
    refInterne,
    refFabricant: texteOuNull(p.refFabricant),
    designation,
    fabricantId,
    categorieId,
    unite: texte(p.unite) || "U",
    serialisable: Boolean(p.serialisable),
    seuilMini: seuil,
    emplacement: texteOuNull(p.emplacement),
    docUrl: texte(p.docUrl),
    note: texte(p.note),
    remplaceParId: texteOuNull(p.remplaceParId),
    fournisseurId,
    refFournisseur: texteOuNull(p.refFournisseur),
    // Le prix n'est visible et modifiable que par les profils Achats/Admin ;
    // la garde en tête de fonction garantit qu'on en est un ici.
    prixAchatCents: Number.isFinite(prixAchatCents as number) ? prixAchatCents : null,
    delaiJours: Number.isFinite(delai as number) ? delai : null,
    updatedById: acteur.id,
  };

  try {
    const produit = p.id
      ? await prisma.produit.update({ where: { id: p.id }, data })
      : await prisma.produit.create({ data: { ...data, createdById: acteur.id } });
    return { id: produit.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error(`La référence interne « ${refInterne} » existe déjà`);
    }
    throw e;
  }
}
