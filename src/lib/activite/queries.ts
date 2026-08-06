import "server-only";
import { prisma } from "@/lib/db";

/* =============================================================================
 * ACTIVITÉ RÉCENTE (accueil)
 * « Qu'est-ce qui a bougé sur la plateforme ? » — l'app est partagée par toute
 * l'équipe mais rien ne le montrait. On agrège les dernières modifications de
 * chaque entité par `updatedAt`.
 *
 * L'auteur affiché est `updatedBy` (dernière modification HUMAINE, posé par les
 * server actions et le serveur MCP), avec repli sur `createdBy` pour les lignes
 * antérieures à ce champ. Les écritures techniques (synchro kDrive, propagation
 * de dénormalisation, réordonnancement de fratrie wiki) n'y touchent pas : le
 * fil ne crédite donc jamais quelqu'un pour une modif qu'il n'a pas faite.
 *
 * >>> AJOUTER UNE SOURCE <<< une entrée dans le Promise.all, puis un bloc de
 * mapping. Le tri et la coupe finale sont communs.
 * ========================================================================== */

export type TypeActivite = "affaire" | "projet" | "note" | "document" | "visite" | "wiki";

export interface EvenementActivite {
  type: TypeActivite;
  id: string;
  titre: string;
  /** Contexte : affaire et/ou client. */
  contexte: string;
  href: string;
  date: Date;
  /** Dernière personne à avoir modifié (repli : le créateur). Null si inconnue. */
  auteur: string | null;
}

export const LIBELLE_ACTIVITE: Record<TypeActivite, string> = {
  affaire: "Affaire",
  projet: "Projet GTB",
  note: "Note",
  document: "Fichier",
  visite: "Visite",
  wiki: "Wiki",
};

function contexte(...morceaux: (string | null | undefined)[]): string {
  return morceaux.map((m) => m?.trim()).filter(Boolean).join(" · ");
}

/**
 * « C'est moi qui ai touché ça en dernier » — filtre d'auteur d'une source.
 * `updatedById` d'abord (dernière main humaine), avec repli sur `createdById`
 * pour les lignes antérieures à ce champ : sans le repli, « Reprendre » serait
 * vide sur tout l'historique.
 */
function parAuteur(id: string) {
  return {
    OR: [{ updatedById: id }, { updatedById: null, createdById: id }],
  };
}

/**
 * Les `limite` dernières modifications, tous outils confondus.
 *
 * `auteurId` restreint le fil à ce qu'une personne a touché — c'est ce qui
 * alimente « Reprendre » sur l'accueil, là où le fil complet répond à « qu'est-ce
 * qui a bougé dans la maison ». Les deux emploient la même agrégation.
 */
export async function activiteRecente(
  limite = 10,
  auteurId?: string,
): Promise<EvenementActivite[]> {
  // Le Chantier ne porte pas de createdById : le filtre s'y réduit à updatedById.
  const moi = auteurId ? parAuteur(auteurId) : {};
  const moiChantier = auteurId ? { updatedById: auteurId } : {};
  // Un fichier n'est jamais « modifié » : son déposant est son seul auteur.
  const moiDocument = auteurId ? { createdById: auteurId } : {};

  // Chaque source ramène `limite` lignes : après fusion et tri, on est certain
  // d'avoir les `limite` plus récentes globales quelle que soit la répartition.
  const [affaires, projets, notes, documents, visites, pages] = await Promise.all([
    prisma.chantier.findMany({
      where: moiChantier,
      orderBy: { updatedAt: "desc" },
      take: limite,
      select: {
        id: true,
        nom: true,
        updatedAt: true,
        client: { select: { nom: true } },
        updatedBy: { select: { nom: true } },
      },
    }),
    prisma.affectationProjet.findMany({
      where: moi,
      orderBy: { updatedAt: "desc" },
      take: limite,
      select: {
        id: true,
        nom: true,
        clientNom: true,
        updatedAt: true,
        updatedBy: { select: { nom: true } },
        createdBy: { select: { nom: true } },
      },
    }),
    prisma.note.findMany({
      where: moi,
      orderBy: { updatedAt: "desc" },
      take: limite,
      select: {
        id: true,
        titre: true,
        updatedAt: true,
        chantier: { select: { nom: true } },
        updatedBy: { select: { nom: true } },
        createdBy: { select: { nom: true } },
      },
    }),
    prisma.document.findMany({
      where: moiDocument,
      orderBy: { createdAt: "desc" },
      take: limite,
      select: {
        id: true,
        nom: true,
        categorie: true,
        createdAt: true,
        chantierId: true,
        chantier: { select: { nom: true } },
        createdBy: { select: { nom: true } },
      },
    }),
    prisma.visite.findMany({
      where: moi,
      orderBy: { updatedAt: "desc" },
      take: limite,
      select: {
        id: true,
        titre: true,
        clientNom: true,
        updatedAt: true,
        updatedBy: { select: { nom: true } },
        createdBy: { select: { nom: true } },
      },
    }),
    prisma.wikiPage.findMany({
      where: moi,
      orderBy: { updatedAt: "desc" },
      take: limite,
      select: {
        id: true,
        titre: true,
        updatedAt: true,
        rubrique: { select: { nom: true, slug: true } },
        updatedBy: { select: { nom: true } },
        createdBy: { select: { nom: true } },
      },
    }),
  ]);

  const evenements: EvenementActivite[] = [
    ...affaires.map((a) => ({
      type: "affaire" as const,
      id: a.id,
      titre: a.nom,
      contexte: a.client?.nom ?? "",
      href: `/affaires/${a.id}`,
      date: a.updatedAt,
      auteur: a.updatedBy?.nom ?? null,
    })),
    ...projets.map((p) => ({
      type: "projet" as const,
      id: p.id,
      titre: p.nom,
      contexte: p.clientNom,
      href: `/outils/affectation-es/${p.id}`,
      date: p.updatedAt,
      auteur: p.updatedBy?.nom ?? p.createdBy?.nom ?? null,
    })),
    ...notes.map((n) => ({
      type: "note" as const,
      id: n.id,
      titre: n.titre,
      contexte: n.chantier?.nom ?? "",
      href: `/outils/notes/${n.id}`,
      date: n.updatedAt,
      auteur: n.updatedBy?.nom ?? n.createdBy?.nom ?? null,
    })),
    ...documents.map((d) => ({
      type: "document" as const,
      id: d.id,
      titre: d.nom,
      contexte: contexte(d.chantier?.nom, d.categorie),
      href: `/outils/documents/${d.chantierId}`,
      // Un fichier n'est pas modifié : le déposant EST l'auteur.
      date: d.createdAt,
      auteur: d.createdBy?.nom ?? null,
    })),
    ...visites.map((v) => ({
      type: "visite" as const,
      id: v.id,
      titre: v.titre || "Visite sans titre",
      contexte: v.clientNom,
      href: `/outils/visites/${v.id}`,
      date: v.updatedAt,
      auteur: v.updatedBy?.nom ?? v.createdBy?.nom ?? null,
    })),
    ...pages.map((p) => ({
      type: "wiki" as const,
      id: p.id,
      titre: p.titre,
      contexte: p.rubrique.nom,
      href: `/outils/wiki/${p.rubrique.slug}/${p.id}`,
      date: p.updatedAt,
      auteur: p.updatedBy?.nom ?? p.createdBy?.nom ?? null,
    })),
  ];

  return evenements.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limite);
}
