import "server-only";
import { prisma } from "@/lib/db";
import type { EtatAffaire } from "@/generated/prisma/enums";
import type { IoType } from "@/ui";
import { ETATS_ACTIFS } from "@/lib/chantiers/etats";
import { calculerJalons, type Jalon } from "@/lib/chantiers/jalons";
import { projetsParAffaires } from "@/tools/affectation-es/queries";
import { normaliserData } from "@/tools/visites/queries";
import { statsVisite } from "@/tools/visites/model";
import { alerteRayon } from "@/tools/magasin/queries";

/* =============================================================================
 * LE POSTE DE TRAVAIL (écran d'accueil)
 * Tout ce que l'accueil affiche, chargé en une passe. L'écran répond à deux
 * questions, dans cet ordre : « où en est la maison » (les 4 cadrans, le parc
 * d'affaires) et « qu'est-ce que je reprends » (mes tâches, ce que j'ai touché).
 *
 * ⚠️ COÛT — les jalons du parc sont dérivés des artefacts réels (projets,
 * documents, visites). Ils sont donc calculés à partir de trois requêtes
 * groupées sur les affaires ACTIVES seulement, jamais une requête par affaire :
 * l'écran d'accueil est le plus visité de l'appli, il n'a pas le droit d'être
 * le plus lourd. Si le parc actif dépassait un jour la trentaine d'affaires,
 * c'est ici qu'il faudrait borner (ou matérialiser les jalons).
 * ========================================================================== */

/** Une affaire du parc, avec son avancement technique dérivé. */
export interface LigneParc {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  updatedAt: Date;
  jalons: Jalon[];
}

/** Le compteur vital d'une destination (les 4 cadrans en tête d'écran). */
export interface Cadran {
  /** Le chiffre principal, déjà formaté. */
  valeur: number;
  /** Ce que compte le chiffre (« affaires », « références »…). */
  unite: string;
  /** Ligne de contexte quand tout va bien. */
  detail: string;
  /** Ce qui réclame une action — affiché en rouge, absent si rien n'appelle. */
  alerte: string | null;
}

export interface DonneesAccueil {
  /** Le pivot — ce n'est pas un outil du registre, il a sa place à part. */
  affaires: Cadran;
  /**
   * Les compteurs des outils, INDEXÉS PAR ID DE REGISTRE. L'accueil parcourt
   * `TOOLS_NAV` et prend ici le compteur de chaque outil : un outil ajouté au
   * registre garde donc sa case sur l'accueil (sans compteur tant que personne
   * n'en a écrit un), au lieu de disparaître de l'écran.
   */
  cadrans: Record<string, Cadran>;
  /** Les affaires actives les plus récemment bougées (bornées, voir PARC_MAX). */
  parc: LigneParc[];
  /** Combien il y a d'actives EN TOUT — pour dire ce que la coupe laisse dehors. */
  nbActives: number;
  /** Répartition AI·DI·AO·DO·COM de tout le parc actif (pas seulement l'extrait). */
  esParc: Partial<Record<IoType, number>>;
}

/**
 * Combien d'affaires le parc montre sur l'accueil. L'écran répond à « où en
 * est la maison » d'un coup d'œil : au-delà d'une dizaine de lignes ce n'est
 * plus un coup d'œil, c'est une liste — et la liste, c'est `/affaires`. Ce qui
 * dépasse est annoncé en clair sous le tableau, jamais coupé en silence.
 */
const PARC_MAX = 10;

function pluriel(n: number, mot: string, suffixe = "s") {
  return `${mot}${n > 1 ? suffixe : ""}`;
}

/** Tout l'écran d'accueil, en une passe. */
export async function chargerAccueil(): Promise<DonneesAccueil> {
  const [affaires, visites, pagesWiki, derniereWiki, rayon] = await Promise.all([
    prisma.chantier.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        nom: true,
        numeroWhy: true,
        etat: true,
        besoinArmoire: true,
        updatedAt: true,
        client: { select: { nom: true } },
      },
    }),
    prisma.visite.findMany({ select: { chantierId: true, type: true, data: true } }),
    prisma.wikiPage.count(),
    prisma.wikiPage.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    alerteRayon(),
  ]);

  const actives = affaires.filter((a) => ETATS_ACTIFS.includes(a.etat));
  const idsActives = actives.map((a) => a.id);

  // --- Les artefacts du parc actif, en DEUX requêtes (pas deux par affaire) -
  //     Les visites, elles, sont déjà chargées : elles servent aussi au cadran.
  const [projets, documents] = await Promise.all([
    projetsParAffaires(idsActives),
    prisma.document.findMany({
      where: { chantierId: { in: idsActives } },
      select: { chantierId: true, nom: true, categorie: true },
    }),
  ]);

  const grouper = <T,>(lignes: T[], cle: (l: T) => string | null) => {
    const parAffaire = new Map<string, T[]>();
    for (const l of lignes) {
      const id = cle(l);
      if (!id) continue;
      const liste = parAffaire.get(id);
      if (liste) liste.push(l);
      else parAffaire.set(id, [l]);
    }
    return parAffaire;
  };
  const documentsParAffaire = grouper(documents, (d) => d.chantierId);
  const visitesParAffaire = grouper(visites, (v) => v.chantierId);

  // `affaires` est déjà trié par updatedAt : l'extrait montre donc ce qui a
  // bougé en dernier, ce qui est exactement ce qu'on vient voir le matin.
  const parc: LigneParc[] = await Promise.all(
    actives.slice(0, PARC_MAX).map(async (a) => ({
      id: a.id,
      nom: a.nom,
      clientNom: a.client.nom,
      numeroWhy: a.numeroWhy,
      etat: a.etat,
      updatedAt: a.updatedAt,
      jalons: await calculerJalons({
        chantierId: a.id,
        besoinArmoire: a.besoinArmoire,
        projets: projets.get(a.id) ?? [],
        documents: documentsParAffaire.get(a.id) ?? [],
        visites: visitesParAffaire.get(a.id) ?? [],
      }),
    })),
  );

  // --- La répartition E/S du parc actif (la jauge du bloc « Les affaires ») -
  const esParc: Partial<Record<IoType, number>> = {};
  for (const liste of projets.values()) {
    for (const p of liste) {
      for (const [type, n] of Object.entries(p.es) as [IoType, number][]) {
        esParc[type] = (esParc[type] ?? 0) + n;
      }
    }
  }

  // --- Les réserves de visite encore ouvertes, tous chantiers confondus -----
  const reservesOuvertes = visites.reduce(
    (n, v) => n + statsVisite(normaliserData(v.data)).reservesOuvertes,
    0,
  );

  const nbAutres = affaires.length - actives.length;

  return {
    affaires: {
      valeur: actives.length,
      unite: pluriel(actives.length, "affaire") + " active" + (actives.length > 1 ? "s" : ""),
      detail:
        nbAutres > 0
          ? `${affaires.length} au total`
          : affaires.length > 0
            ? "tout le parc est actif"
            : "aucune affaire",
      alerte: null,
    },
    cadrans: {
      visites: {
        valeur: visites.length,
        unite: pluriel(visites.length, "visite"),
        detail: visites.length > 0 ? "relevés, suivis, réceptions" : "aucune visite",
        alerte:
          reservesOuvertes > 0
            ? `${reservesOuvertes} ${pluriel(reservesOuvertes, "réserve")} ${pluriel(reservesOuvertes, "ouverte")}`
            : null,
      },
      magasin: {
        valeur: rayon.nbProduits,
        unite: pluriel(rayon.nbProduits, "référence"),
        detail: rayon.nbProduits > 0 ? "au rayon" : "rayon vide",
        alerte: rayon.nbSousSeuil > 0 ? `${rayon.nbSousSeuil} sous le seuil` : null,
      },
      wiki: {
        valeur: pagesWiki,
        unite: pluriel(pagesWiki, "page"),
        detail: derniereWiki ? "procédures & savoir-faire" : "aucune page",
        alerte: null,
      },
    },
    parc,
    nbActives: actives.length,
    esParc,
  };
}
