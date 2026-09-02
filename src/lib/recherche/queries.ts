import "server-only";
import { prisma } from "@/lib/db";
import {
  BASE_DEVIS,
  ETAT_DEVIS_LABEL,
  estEtatDevis,
  libelleDevis,
} from "@/tools/devis/model";
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

  const [affaires, clients, projets, notes, visites, pagesWiki, produits, devis] = await Promise.all([
    prisma.chantier.findMany({
      where: {
        OR: [{ nom: contient }, { numeroWhy: contient }, { client: { nom: contient } }],
      },
      select: {
        id: true,
        nom: true,
        numeroWhy: true,
        etat: true,
        client: { select: { nom: true } },
      },
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
    // Magasin : la référence interne, celle du fabricant, la désignation — et
    // les codes-barres appris, pour retrouver un article depuis son carton.
    prisma.produit.findMany({
      where: {
        OR: [
          { refInterne: contient },
          { refFabricant: contient },
          { designation: contient },
          { fabricant: { nom: contient } },
          { codes: { some: { code: contient } } },
        ],
      },
      select: {
        id: true,
        refInterne: true,
        designation: true,
        fabricant: { select: { nom: true } },
        emplacement: true,
        actif: true,
      },
      orderBy: { refInterne: "asc" },
      take: PAR_SOURCE,
    }),
    // Devis : le NUMÉRO d'abord — c'est sous « DT260052 » qu'on en parle au
    // téléphone — puis l'objet, le client et le n° Why.
    prisma.devis.findMany({
      where: {
        OR: [
          { numero: contient },
          { titre: contient },
          { clientNom: contient },
          { numeroWhy: contient },
        ],
      },
      select: {
        id: true,
        numero: true,
        revision: true,
        titre: true,
        etat: true,
        clientNom: true,
      },
      orderBy: { updatedAt: "desc" },
      take: PAR_SOURCE,
    }),
  ]);

  return [
    ...affaires.map((a) => ({
      type: "affaire" as const,
      id: a.id,
      titre: a.nom,
      // La recherche, elle, ne filtre pas par état : elle ramène aussi ce que le
      // tableau de bord masque. Une affaire mise à la corbeille doit donc le
      // DIRE — sinon elle se fait passer pour une affaire vivante, et on ne
      // comprend pas pourquoi son n° Why reste pris ailleurs.
      sousTitre: contexte(
        a.etat === "CORBEILLE" ? "Corbeille" : null,
        a.client?.nom,
        a.numeroWhy,
      ),
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
    ...produits.map((p) => ({
      type: "produit" as const,
      id: p.id,
      titre: `${p.refInterne} — ${p.designation}`,
      sousTitre: contexte(p.fabricant?.nom ?? null, p.emplacement, p.actif ? null : "archivé"),
      href: `/outils/magasin/produits/${p.id}`,
    })),
    ...devis.map((d) => ({
      type: "devis" as const,
      id: d.id,
      titre: `${libelleDevis(d.numero, d.revision)}${d.titre.trim() ? ` — ${d.titre.trim()}` : ""}`,
      sousTitre: contexte(d.clientNom || null, ETAT_DEVIS_LABEL[estEtatDevis(d.etat) ? d.etat : "BROUILLON"]),
      href: `${BASE_DEVIS}/${d.id}`,
    })),
  ];
}
