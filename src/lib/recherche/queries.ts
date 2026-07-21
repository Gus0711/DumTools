import "server-only";
import { prisma } from "@/lib/db";
import { rechercherPages } from "@/tools/wiki/queries";
import { MIN_CARACTERES, type ResultatRecherche } from "./types";

/* =============================================================================
 * RECHERCHE GLOBALE (palette ⌘K)
 * Le pendant du rangement « affaire d'abord » : la navigation passe par
 * l'affaire, donc il faut un moyen de retrouver quelque chose quand on ne sait
 * PLUS de quelle affaire il s'agit. Un champ, toutes les entités.
 *
 * >>> AJOUTER UNE SOURCE <<< une entrée dans le Promise.all ci-dessous qui
 * renvoie des ResultatRecherche. L'ordre des sources = l'ordre des groupes.
 * ========================================================================== */

/** Nombre max de résultats par source (la palette reste lisible d'un coup d'œil). */
const PAR_SOURCE = 5;

/** Assemble « Client · N° Why » en ignorant les morceaux vides. */
function contexte(...morceaux: (string | null | undefined)[]): string {
  return morceaux.map((m) => m?.trim()).filter(Boolean).join(" · ");
}

/**
 * Cherche la même chaîne dans toutes les entités, en parallèle.
 * Le Wiki passe par sa recherche plein-texte Postgres (tsvector + stemming
 * français) ; les autres sources font un `contains` insensible à la casse sur
 * les champs identifiants — le contenu des notes est du JSON BlockNote, donc
 * seul leur titre est cherché.
 */
export async function rechercheGlobale(q: string): Promise<ResultatRecherche[]> {
  const requete = q.trim();
  if (requete.length < MIN_CARACTERES) return [];
  const contient = { contains: requete, mode: "insensitive" as const };

  const [affaires, clients, projets, notes, visites, pagesWiki] = await Promise.all([
    prisma.chantier.findMany({
      where: {
        OR: [{ nom: contient }, { numeroWhy: contient }, { client: { nom: contient } }],
      },
      select: { id: true, nom: true, numeroWhy: true, client: { select: { nom: true } } },
      orderBy: { updatedAt: "desc" },
      take: PAR_SOURCE,
    }),
    prisma.client.findMany({
      where: { nom: contient },
      select: { id: true, nom: true, _count: { select: { chantiers: true } } },
      orderBy: { nom: "asc" },
      take: PAR_SOURCE,
    }),
    prisma.affectationProjet.findMany({
      where: {
        OR: [{ nom: contient }, { clientNom: contient }, { numeroWhy: contient }],
      },
      select: { id: true, nom: true, clientNom: true, numeroWhy: true },
      orderBy: { updatedAt: "desc" },
      take: PAR_SOURCE,
    }),
    prisma.note.findMany({
      where: { OR: [{ titre: contient }, { numeroWhy: contient }] },
      select: {
        id: true,
        titre: true,
        numeroWhy: true,
        chantier: { select: { nom: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: PAR_SOURCE,
    }),
    prisma.visite.findMany({
      where: {
        OR: [{ titre: contient }, { clientNom: contient }, { numeroWhy: contient }],
      },
      select: { id: true, titre: true, clientNom: true, numeroWhy: true },
      orderBy: { date: "desc" },
      take: PAR_SOURCE,
    }),
    rechercherPages(requete),
  ]);

  return [
    ...affaires.map((a) => ({
      type: "affaire" as const,
      id: a.id,
      titre: a.nom,
      sousTitre: contexte(a.client?.nom, a.numeroWhy),
      href: `/affaires/${a.id}`,
    })),
    ...clients.map((c) => ({
      type: "client" as const,
      id: c.id,
      titre: c.nom,
      sousTitre: `${c._count.chantiers} affaire${c._count.chantiers > 1 ? "s" : ""}`,
      href: `/clients/${c.id}`,
    })),
    ...projets.map((p) => ({
      type: "projet" as const,
      id: p.id,
      titre: p.nom,
      sousTitre: contexte(p.clientNom, p.numeroWhy),
      href: `/outils/affectation-es/${p.id}`,
    })),
    ...notes.map((n) => ({
      type: "note" as const,
      id: n.id,
      titre: n.titre,
      sousTitre: contexte(n.chantier?.nom, n.numeroWhy),
      href: `/outils/notes/${n.id}`,
    })),
    ...visites.map((v) => ({
      type: "visite" as const,
      id: v.id,
      titre: v.titre || "Visite sans titre",
      sousTitre: contexte(v.clientNom, v.numeroWhy),
      href: `/outils/visites/${v.id}`,
    })),
    ...pagesWiki.slice(0, PAR_SOURCE).map((p) => ({
      type: "wiki" as const,
      id: p.id,
      titre: p.titre,
      sousTitre: p.rubriqueNom,
      href: `/outils/wiki/${p.rubriqueSlug}/${p.id}`,
    })),
  ];
}
