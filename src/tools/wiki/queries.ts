import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  MARQUEUR_DEBUT,
  MARQUEUR_FIN,
  slugTag,
  type FiltresWiki,
  type WikiContenu,
} from "./model";

/* Lecture de l'outil Wiki : rubriques, pages d'une rubrique, page détaillée,
 * tags, et la RECHERCHE plein-texte (Postgres tsvector, cf. migration
 * outil_wiki). Le wiki n'est rattaché à aucune affaire → pas de provider. */

/* --- Rubriques --------------------------------------------------------------- */

export interface WikiRubriqueResume {
  id: string;
  slug: string;
  nom: string;
  description: string;
  icon: string;
  couleur: string;
  nbPages: number;
}

/** Toutes les rubriques (ordre défini), avec le nombre de pages. */
export async function listerRubriques(): Promise<WikiRubriqueResume[]> {
  const rubriques = await prisma.wikiRubrique.findMany({
    orderBy: { ordre: "asc" },
    select: {
      id: true,
      slug: true,
      nom: true,
      description: true,
      icon: true,
      couleur: true,
      _count: { select: { pages: true } },
    },
  });
  return rubriques.map((r) => ({
    id: r.id,
    slug: r.slug,
    nom: r.nom,
    description: r.description,
    icon: r.icon,
    couleur: r.couleur,
    nbPages: r._count.pages,
  }));
}

export interface RubriqueMenu {
  id: string;
  slug: string;
  nom: string;
}

/** Rubriques allégées, pour le sélecteur de l'éditeur (déplacer une page). */
export async function listerRubriquesMenu(): Promise<RubriqueMenu[]> {
  return prisma.wikiRubrique.findMany({
    orderBy: { ordre: "asc" },
    select: { id: true, slug: true, nom: true },
  });
}

export async function getRubriqueParSlug(slug: string): Promise<{
  id: string;
  slug: string;
  nom: string;
  description: string;
  icon: string;
  couleur: string;
} | null> {
  return prisma.wikiRubrique.findUnique({
    where: { slug },
    select: { id: true, slug: true, nom: true, description: true, icon: true, couleur: true },
  });
}

/* --- Pages ------------------------------------------------------------------- */

export interface WikiTagLite {
  id: string;
  nom: string;
  couleur: string;
}

export interface WikiPageResume {
  id: string;
  titre: string;
  rubriqueSlug: string;
  resume: string;
  auteur: string | null;
  tags: WikiTagLite[];
  updatedAt: Date;
}

function apercu(texte: string, max = 160): string {
  const t = (texte ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const SELECT_RESUME = {
  id: true,
  titre: true,
  resume: true,
  texte: true,
  updatedAt: true,
  rubrique: { select: { slug: true, nom: true } },
  createdBy: { select: { nom: true } },
  tags: { select: { tag: { select: { id: true, nom: true, couleur: true } } } },
} as const;

type PageAvecResume = {
  id: string;
  titre: string;
  resume: string;
  texte: string;
  updatedAt: Date;
  rubrique: { slug: string; nom: string };
  createdBy: { nom: string } | null;
  tags: { tag: WikiTagLite }[];
};

function versResume(p: PageAvecResume): WikiPageResume {
  return {
    id: p.id,
    titre: p.titre,
    rubriqueSlug: p.rubrique.slug,
    // Résumé saisi par l'auteur en priorité ; sinon extrait du contenu.
    resume: p.resume.trim() || apercu(p.texte),
    auteur: p.createdBy?.nom ?? null,
    tags: p.tags.map((t) => t.tag),
    updatedAt: p.updatedAt,
  };
}

/** Pages d'une rubrique (la plus récente d'abord), filtrables par tag. */
export async function listerPagesRubrique(
  rubriqueId: string,
  tagId?: string,
): Promise<WikiPageResume[]> {
  const pages = await prisma.wikiPage.findMany({
    where: { rubriqueId, ...(tagId ? { tags: { some: { tagId } } } : {}) },
    orderBy: { updatedAt: "desc" },
    select: SELECT_RESUME,
  });
  return pages.map(versResume);
}

/* --- Arborescence (façon Notion) --------------------------------------------- */

/** Nœud léger de l'arbre d'une rubrique. L'arbre est monté côté client (peu de
 *  pages par rubrique) à partir de `parentId` ; `ordre` donne le tri des frères. */
export interface WikiNoeudArbre {
  id: string;
  titre: string;
  parentId: string | null;
  ordre: number;
  resume: string;
  auteur: string | null;
  tags: WikiTagLite[];
  updatedAt: Date;
}

/** Toutes les pages d'une rubrique, à plat, triées fratrie par fratrie (ordre
 *  manuel puis date). Le composant client en déduit l'arbre (parentId). */
export async function listerArbreRubrique(rubriqueId: string): Promise<WikiNoeudArbre[]> {
  const pages = await prisma.wikiPage.findMany({
    where: { rubriqueId },
    orderBy: [{ ordre: "asc" }, { updatedAt: "desc" }],
    select: { ...SELECT_RESUME, parentId: true, ordre: true },
  });
  return pages.map((p) => ({
    id: p.id,
    titre: p.titre,
    parentId: p.parentId,
    ordre: p.ordre,
    resume: p.resume.trim() || apercu(p.texte),
    auteur: p.createdBy?.nom ?? null,
    tags: p.tags.map((t) => t.tag),
    updatedAt: p.updatedAt,
  }));
}

/** Ancêtres d'une page (racine → parent direct), pour le fil d'Ariane.
 *  Remontée récursive de `parentId` (CTE), plafonnée par sécurité. */
export async function ancetresDe(id: string): Promise<{ id: string; titre: string }[]> {
  const rows = await prisma.$queryRaw<{ id: string; titre: string; depth: number }[]>`
    WITH RECURSIVE anc AS (
      SELECT id, titre, "parentId", 0 AS depth FROM "WikiPage" WHERE id = ${id}
      UNION ALL
      SELECT p.id, p.titre, p."parentId", anc.depth + 1
      FROM "WikiPage" p JOIN anc ON p.id = anc."parentId"
      WHERE anc.depth < 100
    )
    SELECT id, titre, depth FROM anc WHERE id <> ${id} ORDER BY depth DESC`;
  return rows.map((r) => ({ id: r.id, titre: r.titre }));
}

/** Un candidat parent pour déplacer une page, avec sa profondeur (indentation
 *  du menu). */
export interface CandidatParent {
  id: string;
  titre: string;
  profondeur: number;
}

/** Parents possibles pour `pageId` : toutes les pages de SA rubrique en ordre
 *  hiérarchique (pré-ordre, avec profondeur), SAUF la page elle-même et tout son
 *  sous-arbre (on ne peut pas se ranger sous soi → anti-cycle). */
export async function candidatsParent(pageId: string): Promise<CandidatParent[]> {
  const page = await prisma.wikiPage.findUnique({
    where: { id: pageId },
    select: { rubriqueId: true },
  });
  if (!page) return [];

  const noeuds = await prisma.wikiPage.findMany({
    where: { rubriqueId: page.rubriqueId },
    orderBy: [{ ordre: "asc" }, { updatedAt: "desc" }],
    select: { id: true, titre: true, parentId: true },
  });

  const enfantsDe = new Map<string | null, { id: string; titre: string }[]>();
  for (const n of noeuds) {
    const liste = enfantsDe.get(n.parentId) ?? [];
    liste.push({ id: n.id, titre: n.titre });
    enfantsDe.set(n.parentId, liste);
  }

  // Interdits = pageId + tous ses descendants.
  const interdits = new Set<string>([pageId]);
  const pile = [pageId];
  while (pile.length) {
    for (const e of enfantsDe.get(pile.pop()!) ?? []) {
      interdits.add(e.id);
      pile.push(e.id);
    }
  }

  const out: CandidatParent[] = [];
  const visiter = (parentId: string | null, prof: number) => {
    for (const e of enfantsDe.get(parentId) ?? []) {
      if (interdits.has(e.id)) continue;
      out.push({ id: e.id, titre: e.titre, profondeur: prof });
      visiter(e.id, prof + 1);
    }
  };
  visiter(null, 0);
  return out;
}

export interface WikiPageDetail {
  id: string;
  titre: string;
  resume: string;
  contenu: WikiContenu;
  version: number;
  rubriqueId: string;
  rubriqueSlug: string;
  rubriqueNom: string;
  parentId: string | null;
  /** Ancêtres (racine → parent direct) pour le fil d'Ariane. */
  ancetres: { id: string; titre: string }[];
  tags: string[];
  auteur: string | null;
  updatedAt: Date;
}

/** Une page complète pour l'éditeur. */
export async function getPage(id: string): Promise<WikiPageDetail | null> {
  const p = await prisma.wikiPage.findUnique({
    where: { id },
    select: {
      id: true,
      titre: true,
      resume: true,
      contenu: true,
      version: true,
      rubriqueId: true,
      parentId: true,
      updatedAt: true,
      rubrique: { select: { slug: true, nom: true } },
      createdBy: { select: { nom: true } },
      tags: { select: { tag: { select: { nom: true } } } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    titre: p.titre,
    resume: p.resume,
    contenu: (p.contenu as WikiContenu) ?? [],
    version: p.version,
    rubriqueId: p.rubriqueId,
    rubriqueSlug: p.rubrique.slug,
    rubriqueNom: p.rubrique.nom,
    parentId: p.parentId,
    ancetres: p.parentId ? await ancetresDe(id) : [],
    tags: p.tags.map((t) => t.tag.nom),
    auteur: p.createdBy?.nom ?? null,
    updatedAt: p.updatedAt,
  };
}

/* --- Tags -------------------------------------------------------------------- */

export interface WikiTagResume {
  id: string;
  nom: string;
  couleur: string;
  nbPages: number;
}

/** Tous les tags (ordre alphabétique) avec leur nombre de pages. */
export async function listerTags(): Promise<WikiTagResume[]> {
  const tags = await prisma.wikiTag.findMany({
    orderBy: { nom: "asc" },
    select: { id: true, nom: true, couleur: true, _count: { select: { pages: true } } },
  });
  return tags.map((t) => ({ id: t.id, nom: t.nom, couleur: t.couleur, nbPages: t._count.pages }));
}

/* --- Recherche plein-texte + facettes ----------------------------------------
 * Deux mondes séparés (docs/RECHERCHE-WIKI.md §3) : les tags sont une facette
 * STRUCTURÉE (ensembles ET/OU/SANS sur WikiPage.tagSlugs, index GIN) ; le
 * titre/résumé/contenu portent la PERTINENCE (colonne tsvector `recherche`). On
 * filtre d'abord (WHERE sur les facettes + éventuel match FTS), puis on classe
 * par pertinence textuelle — le tag ne pollue plus le score. */

export interface WikiResultatRecherche {
  id: string;
  titre: string;
  rubriqueSlug: string;
  rubriqueNom: string;
  resume: string;
  auteur: string | null;
  tags: WikiTagLite[];
  updatedAt: Date;
  /** Extrait surligné (MARQUEUR_DEBUT/FIN) — vide si recherche sans texte libre. */
  extrait: string;
}

// Marqueurs de surlignage passés à ts_headline (caractères de contrôle, jamais
// présents dans le texte → pas de collision, pas de HTML à échapper côté client).
const OPTS_HEADLINE =
  `StartSel=${MARQUEUR_DEBUT}, StopSel=${MARQUEUR_FIN}, ` +
  `MaxFragments=2, MinWords=6, MaxWords=22, FragmentDelimiter= … `;

const LIMITE_RESULTATS = 40;

/** Slugs de tags normalisés et dédupliqués (accepte libellés OU slugs). */
function slugsFiltre(valeurs?: string[]): string[] {
  return [...new Set((valeurs ?? []).map(slugTag).filter(Boolean))];
}

/**
 * Recherche à facettes classée par pertinence, avec extraits surlignés.
 *
 * - Texte libre `q` : `websearch_to_tsquery` (multi-mots, guillemets, OR anglais) ;
 *   `ts_rank` trie, `ts_headline` fabrique l'extrait ; config « french » → stemming
 *   (« armoire » trouve « armoires »). Optionnel : sans texte, on classe par date.
 * - Facettes (tags ET/OU/SANS, rubrique, auteur) : opérateurs d'ensemble sur le
 *   text[] `tagSlugs` (@> tout / && au moins un / NOT && aucun) + égalités.
 *
 * Sans aucun critère (ni texte ≥ 2 car., ni facette), renvoie [] : rien à chercher.
 * La sélection se fait en SQL (ordre + surlignage), puis on réhydrate les lignes
 * riches (tags, auteur…) via Prisma en préservant l'ordre.
 */
export async function rechercherPages(
  q: string,
  filtres: FiltresWiki = {},
): Promise<WikiResultatRecherche[]> {
  const requete = q.trim();
  const avecTexte = requete.length >= 2;

  const tagsEt = slugsFiltre(filtres.tagsEt);
  const tagsOu = slugsFiltre(filtres.tagsOu);
  const tagsSauf = slugsFiltre(filtres.tagsSauf);

  const clauses: Prisma.Sql[] = [];
  if (avecTexte)
    clauses.push(Prisma.sql`p."recherche" @@ websearch_to_tsquery('french', ${requete})`);
  if (tagsEt.length) clauses.push(Prisma.sql`p."tagSlugs" @> ${tagsEt}::text[]`);
  if (tagsOu.length) clauses.push(Prisma.sql`p."tagSlugs" && ${tagsOu}::text[]`);
  if (tagsSauf.length) clauses.push(Prisma.sql`NOT (p."tagSlugs" && ${tagsSauf}::text[])`);
  if (filtres.rubriqueSlug) clauses.push(Prisma.sql`r."slug" = ${filtres.rubriqueSlug}`);
  if (filtres.auteurId) clauses.push(Prisma.sql`p."createdById" = ${filtres.auteurId}`);

  // Aucun critère → on ne « liste pas tout » : la page invite à filtrer/chercher.
  if (clauses.length === 0) return [];

  const where = Prisma.join(clauses, " AND ");
  const extrait = avecTexte
    ? Prisma.sql`ts_headline('french', p."texte", websearch_to_tsquery('french', ${requete}), ${OPTS_HEADLINE})`
    : Prisma.sql`''`;
  const ordre = avecTexte
    ? Prisma.sql`ts_rank(p."recherche", websearch_to_tsquery('french', ${requete})) DESC, p."updatedAt" DESC`
    : Prisma.sql`p."updatedAt" DESC`;

  const rows = await prisma.$queryRaw<{ id: string; extrait: string }[]>`
    SELECT p.id, ${extrait} AS extrait
    FROM "WikiPage" p
    JOIN "WikiRubrique" r ON r.id = p."rubriqueId"
    WHERE ${where}
    ORDER BY ${ordre}
    LIMIT ${LIMITE_RESULTATS}`;
  if (rows.length === 0) return [];

  const pages = await prisma.wikiPage.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: SELECT_RESUME,
  });
  const parId = new Map(pages.map((p) => [p.id, p]));

  return rows.flatMap((row) => {
    const p = parId.get(row.id);
    if (!p) return [];
    const base = versResume(p);
    return [{
      id: base.id,
      titre: base.titre,
      rubriqueSlug: base.rubriqueSlug,
      rubriqueNom: p.rubrique.nom,
      resume: base.resume,
      auteur: base.auteur,
      tags: base.tags,
      updatedAt: base.updatedAt,
      extrait: row.extrait,
    }];
  });
}

/* --- Catalogue des facettes -------------------------------------------------- */

export interface FacetteTag {
  /** Slug canonique (valeur stockée dans tagSlugs / passée en filtre). */
  slug: string;
  nom: string;
  couleur: string;
  nbPages: number;
}
export interface FacetteRubrique {
  slug: string;
  nom: string;
  nbPages: number;
}
export interface FacetteAuteur {
  id: string;
  nom: string;
  nbPages: number;
}

export interface OptionsRecherche {
  tags: FacetteTag[];
  rubriques: FacetteRubrique[];
  auteurs: FacetteAuteur[];
}

/**
 * Catalogue des facettes disponibles (tags, rubriques, auteurs) avec le nombre
 * GLOBAL de pages de chacune — c'est la barre latérale de la recherche à
 * facettes. Chargé une fois côté serveur ; le client compose ensuite les filtres.
 * Les tags qui se réduisent au même slug (« N4 » / « n4 ») sont fusionnés (compte
 * cumulé, 1er libellé/couleur conservés) : un seul chip par facette réelle.
 */
export async function optionsRecherche(): Promise<OptionsRecherche> {
  const [tags, rubriques, auteurs] = await Promise.all([
    listerTags(),
    listerRubriques(),
    prisma.user.findMany({
      where: { wikiPages: { some: {} } },
      select: { id: true, nom: true, _count: { select: { wikiPages: true } } },
      orderBy: { nom: "asc" },
    }),
  ]);

  const parSlug = new Map<string, FacetteTag>();
  for (const t of tags) {
    const slug = slugTag(t.nom);
    if (!slug) continue;
    const existant = parSlug.get(slug);
    if (existant) existant.nbPages += t.nbPages;
    else parSlug.set(slug, { slug, nom: t.nom, couleur: t.couleur, nbPages: t.nbPages });
  }

  return {
    tags: [...parSlug.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    rubriques: rubriques.map((r) => ({ slug: r.slug, nom: r.nom, nbPages: r.nbPages })),
    auteurs: auteurs.map((u) => ({ id: u.id, nom: u.nom, nbPages: u._count.wikiPages })),
  };
}
