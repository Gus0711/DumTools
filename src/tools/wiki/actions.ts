"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { extraireTexte, mediasReferences, slugsTags, type FiltresWiki, type WikiContenu } from "./model";
import { candidatsParent, rechercherPages, type CandidatParent, type WikiResultatRecherche } from "./queries";
import { supprimerMediaWiki } from "./stockage";

const BASE = "/outils/wiki";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return id;
}

/** Suppression de page + gestion des tags = réservées aux administrateurs. */
async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
  if (session.user.role !== Role.ADMIN) throw new Error("Réservé aux administrateurs");
  return session.user.id;
}

function revalidateWiki(rubriqueSlug?: string): void {
  revalidatePath(BASE);
  if (rubriqueSlug) revalidatePath(`${BASE}/${rubriqueSlug}`);
}

/* --- Pages ------------------------------------------------------------------- */

/** Prochain `ordre` disponible dans une fratrie (dernier + 1). */
async function prochainOrdre(rubriqueId: string, parentId: string | null): Promise<number> {
  const dernier = await prisma.wikiPage.aggregate({
    where: { rubriqueId, parentId },
    _max: { ordre: true },
  });
  return (dernier._max.ordre ?? -1) + 1;
}

/** Ids d'un sous-arbre (page + tous ses descendants) — pour l'anti-cycle et la
 *  cascade de rubrique. Remontée récursive de `parentId` (CTE Postgres). */
async function sousArbreIds(id: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE sub AS (
      SELECT id, "parentId" FROM "WikiPage" WHERE id = ${id}
      UNION ALL
      SELECT p.id, p."parentId" FROM "WikiPage" p JOIN sub ON p."parentId" = sub.id
    )
    SELECT id FROM sub`;
  return new Set(rows.map((r) => r.id));
}

/** Crée une page vierge (à la racine d'une rubrique, ou en sous-page d'un
 *  parent DANS la même rubrique) et ouvre l'éditeur. */
export async function creerPage(rubriqueId: string, parentId?: string | null): Promise<void> {
  const userId = await requireUserId();
  const rubrique = await prisma.wikiRubrique.findUnique({
    where: { id: rubriqueId },
    select: { slug: true },
  });
  if (!rubrique) throw new Error("Rubrique introuvable");

  // Le parent (sous-page) doit exister et appartenir à la MÊME rubrique.
  let parent: string | null = null;
  if (parentId) {
    const p = await prisma.wikiPage.findUnique({
      where: { id: parentId },
      select: { rubriqueId: true },
    });
    if (p && p.rubriqueId === rubriqueId) parent = parentId;
  }

  const page = await prisma.wikiPage.create({
    data: {
      rubriqueId,
      parentId: parent,
      ordre: await prochainOrdre(rubriqueId, parent),
      createdById: userId,
      updatedById: userId,
    },
    select: { id: true },
  });
  revalidateWiki(rubrique.slug);
  redirect(`${BASE}/${rubrique.slug}/${page.id}`);
}

/** Déplace une page : nouveau parent (`null` = racine) DANS SA rubrique, et
 *  réordonne la fratrie cible selon `ordreIds` (indices contigus fournis par le
 *  client). Refus si le parent est la page elle-même ou un de ses descendants
 *  (anti-cycle), ou s'il est dans une autre rubrique. */
export async function deplacerPage(
  id: string,
  parentId: string | null,
  ordreIds: string[],
): Promise<void> {
  const userId = await requireUserId();
  const page = await prisma.wikiPage.findUnique({
    where: { id },
    select: { rubriqueId: true, rubrique: { select: { slug: true } } },
  });
  if (!page) throw new Error("Page introuvable");

  if (parentId) {
    if (parentId === id) throw new Error("Une page ne peut pas être son propre parent");
    const cible = await prisma.wikiPage.findUnique({
      where: { id: parentId },
      select: { rubriqueId: true },
    });
    if (!cible || cible.rubriqueId !== page.rubriqueId) {
      throw new Error("Parent invalide (rubrique différente)");
    }
    const sousArbre = await sousArbreIds(id);
    if (sousArbre.has(parentId)) throw new Error("Déplacement invalide (cycle)");
  }

  await prisma.$transaction(async (tx) => {
    // Seule la page DÉPLACÉE porte l'auteur : le réordonnancement de la
    // fratrie et la cascade de rubrique sont des effets dérivés.
    await tx.wikiPage.update({ where: { id }, data: { parentId, updatedById: userId } });
    if (ordreIds.length > 0) {
      // Réordonne la fratrie cible. On ne touche qu'aux ids réellement rattachés
      // à ce parent dans cette rubrique (garde-fou contre un ordreIds bricolé).
      for (let i = 0; i < ordreIds.length; i++) {
        await tx.wikiPage.updateMany({
          where: { id: ordreIds[i], rubriqueId: page.rubriqueId, parentId },
          data: { ordre: i },
        });
      }
    } else {
      // Déplacement sans ordre explicite (menu de l'éditeur) → placer en fin.
      const max = await tx.wikiPage.aggregate({
        where: { rubriqueId: page.rubriqueId, parentId, id: { not: id } },
        _max: { ordre: true },
      });
      await tx.wikiPage.update({ where: { id }, data: { ordre: (max._max.ordre ?? -1) + 1 } });
    }
  });
  revalidateWiki(page.rubrique.slug);
}

/** Candidats parents pour déplacer une page (menu de l'éditeur). */
export async function chargerCandidatsParent(pageId: string): Promise<CandidatParent[]> {
  await requireUserId();
  return candidatsParent(pageId);
}

export type SauverPageResultat =
  | { ok: true; version: number; updatedAt: string }
  /** Conflit : quelqu'un a sauvé entre-temps — l'éditeur affiche la bannière et
   *  cesse d'écraser tant que l'utilisateur n'a pas rechargé. */
  | { ok: false; conflit: true; version: number; updatedAt: string };

/**
 * Sauvegarde anti-collision : n'écrit QUE si la page est encore à la version sur
 * laquelle l'éditeur travaille (`versionBase`). Sinon aucun octet n'est écrit et
 * l'appelant reçoit la version courante (même patron que sauverNote). Recalcule
 * `texte` (contenu brut + noms de tags) qui alimente la recherche plein-texte,
 * puis synchronise les tags et purge les médias orphelins.
 */
export async function sauverPage(
  id: string,
  data: {
    titre: string;
    resume: string;
    contenu: WikiContenu;
    rubriqueId: string;
    tags: string[];
    versionBase: number;
  },
): Promise<SauverPageResultat> {
  const userId = await requireUserId();

  // BlockNote porte des `undefined` dans des tableaux (columnWidths…) que Prisma
  // refuse en JSON → normalisation en null (forme native de BlockNote).
  const contenu = JSON.parse(JSON.stringify(data.contenu ?? [])) as Prisma.InputJsonValue;

  // Noms de tags nettoyés (dédupliqués, insensibles à la casse pour les doublons).
  const tags = normaliserTags(data.tags);
  const resume = data.resume.trim();

  // Le texte de recherche = résumé + texte brut du document (large) + noms de tags.
  // On garde les noms dans `texte` (confort du plein-texte) ; la facette
  // autoritaire est `tagSlugs` (slugs normalisés, filtres d'ensemble ET/OU/SANS).
  const texteContenu = extraireTexte(data.contenu ?? [], 20_000);
  const texte = [resume, texteContenu, tags.join(" ")].filter(Boolean).join(" ");
  const tagSlugs = slugsTags(tags);

  // Invariant d'arborescence : un sous-arbre partage une rubrique. Changer une
  // page de rubrique la remet à la RACINE (parentId nullé) et emmène tout son
  // sous-arbre dans la nouvelle rubrique (cascade plus bas).
  const avant = await prisma.wikiPage.findUnique({ where: { id }, select: { rubriqueId: true } });
  const changementRubrique = !!avant && avant.rubriqueId !== data.rubriqueId;

  const res = await prisma.wikiPage.updateMany({
    where: { id, version: data.versionBase },
    data: {
      titre: data.titre.trim() || "Sans titre",
      resume,
      contenu,
      texte,
      tagSlugs,
      rubriqueId: data.rubriqueId,
      ...(changementRubrique ? { parentId: null } : {}),
      version: data.versionBase + 1,
      // Dans le même data que la garde de version (pas d'auteur écrit si conflit).
      updatedById: userId,
    },
  });

  const page = await prisma.wikiPage.findUnique({
    where: { id },
    select: { version: true, updatedAt: true, rubrique: { select: { slug: true } } },
  });
  if (!page) throw new Error("Page introuvable");

  if (res.count === 0) {
    return {
      ok: false,
      conflit: true,
      version: page.version,
      updatedAt: page.updatedAt.toISOString(),
    };
  }

  if (changementRubrique) {
    // Descendants → nouvelle rubrique (la page elle-même est déjà migrée + mise
    // à la racine ci-dessus ; ses descendants gardent leurs liens internes).
    await prisma.$executeRaw`
      WITH RECURSIVE sub AS (
        SELECT id FROM "WikiPage" WHERE id = ${id}
        UNION ALL
        SELECT p.id FROM "WikiPage" p JOIN sub ON p."parentId" = sub.id
      )
      UPDATE "WikiPage" SET "rubriqueId" = ${data.rubriqueId} WHERE id IN (SELECT id FROM sub)`;
  }

  await synchroniserTags(id, tags);
  await purgerMediasOrphelins(id, data.contenu);
  revalidateWiki(page.rubrique.slug);
  return { ok: true, version: page.version, updatedAt: page.updatedAt.toISOString() };
}

/** Supprime du disque et de la base les médias que le document ne référence
 *  plus (grâce de 5 min : un upload en cours n'est dans le document qu'après
 *  insertion du bloc — course upload/autosave). */
async function purgerMediasOrphelins(pageId: string, contenu: WikiContenu): Promise<void> {
  const references = mediasReferences(contenu);
  const seuil = new Date(Date.now() - 5 * 60 * 1000);
  const orphelins = await prisma.wikiMedia.findMany({
    where: { pageId, createdAt: { lt: seuil }, id: { notIn: [...references] } },
    select: { id: true, fichier: true },
  });
  if (orphelins.length === 0) return;
  await Promise.all(orphelins.map((m) => supprimerMediaWiki(m.fichier)));
  await prisma.wikiMedia.deleteMany({ where: { id: { in: orphelins.map((m) => m.id) } } });
}

/** Suppression d'une page — réservée aux administrateurs (le wiki est un bien
 *  commun ; on évite les suppressions accidentelles par n'importe qui). */
export async function supprimerPage(id: string): Promise<void> {
  await requireAdmin();
  const page = await prisma.wikiPage.findUnique({
    where: { id },
    select: {
      parentId: true,
      rubrique: { select: { slug: true } },
      medias: { select: { fichier: true } },
    },
  });
  if (!page) return;
  // Remonter les enfants d'un cran (vers le parent du supprimé) : sinon la FK
  // `Restrict` bloque le delete et le sous-arbre serait perdu.
  await prisma.wikiPage.updateMany({ where: { parentId: id }, data: { parentId: page.parentId } });
  await Promise.all(page.medias.map((m) => supprimerMediaWiki(m.fichier)));
  await prisma.wikiPage.delete({ where: { id } }); // cascade : tags + médias (lignes)
  revalidateWiki(page.rubrique.slug);
}

/* --- Tags -------------------------------------------------------------------- */

const PALETTE_TAGS = [
  "#a855f7", "#2563eb", "#0d9488", "#ea580c", "#dc2626",
  "#65a30d", "#c026d3", "#0891b2", "#d97706", "#4f46e5",
];

/** Couleur déterministe pour un nouveau tag (stable par nom). */
function couleurPourTag(nom: string): string {
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  return PALETTE_TAGS[h % PALETTE_TAGS.length];
}

/** Nettoie une liste de noms de tags : trim, non vides, sans doublon (le 1er
 *  libellé rencontré gagne la casse). */
function normaliserTags(noms: string[]): string[] {
  const vus = new Map<string, string>();
  for (const brut of noms) {
    const nom = brut.trim();
    if (!nom) continue;
    const cle = nom.toLowerCase();
    if (!vus.has(cle)) vus.set(cle, nom);
  }
  return [...vus.values()];
}

/** Aligne les WikiPageTag d'une page sur la liste de noms fournie : crée les
 *  tags manquants (upsert par nom), ajoute/retire les associations. */
async function synchroniserTags(pageId: string, noms: string[]): Promise<void> {
  const tags = await Promise.all(
    noms.map((nom) =>
      prisma.wikiTag.upsert({
        where: { nom },
        update: {},
        create: { nom, couleur: couleurPourTag(nom) },
        select: { id: true },
      }),
    ),
  );
  const voulus = new Set(tags.map((t) => t.id));

  const existants = await prisma.wikiPageTag.findMany({
    where: { pageId },
    select: { tagId: true },
  });
  const actuels = new Set(existants.map((e) => e.tagId));

  const aAjouter = [...voulus].filter((id) => !actuels.has(id));
  const aRetirer = [...actuels].filter((id) => !voulus.has(id));

  if (aAjouter.length > 0) {
    await prisma.wikiPageTag.createMany({
      data: aAjouter.map((tagId) => ({ pageId, tagId })),
      skipDuplicates: true,
    });
  }
  if (aRetirer.length > 0) {
    await prisma.wikiPageTag.deleteMany({ where: { pageId, tagId: { in: aRetirer } } });
  }
}

/** Renomme un tag (global) — ADMIN. */
export async function renommerTag(id: string, nom: string): Promise<void> {
  await requireAdmin();
  const propre = nom.trim();
  if (!propre) throw new Error("Nom de tag vide");
  await prisma.wikiTag.update({ where: { id }, data: { nom: propre } });
  revalidateWiki();
}

/** Change la couleur d'un tag — ADMIN. */
export async function definirCouleurTag(id: string, couleur: string): Promise<void> {
  await requireAdmin();
  await prisma.wikiTag.update({ where: { id }, data: { couleur } });
  revalidateWiki();
}

/** Supprime un tag (et toutes ses associations) — ADMIN. */
export async function supprimerTag(id: string): Promise<void> {
  await requireAdmin();
  await prisma.wikiTag.delete({ where: { id } });
  revalidateWiki();
}

/* --- Recherche (action appelable depuis la barre de recherche client) -------- */

/** Recherche à facettes (délègue à la query). Exposée en action pour la barre de
 *  recherche instantanée de l'accueil ET la page de recherche avancée (facettes
 *  tags ET/OU/SANS, rubrique, auteur). `filtres` omis = recherche plein-texte seule. */
export async function rechercherWiki(
  q: string,
  filtres: FiltresWiki = {},
): Promise<WikiResultatRecherche[]> {
  await requireUserId();
  return rechercherPages(q, filtres);
}
