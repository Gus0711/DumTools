import "server-only";
import { prisma } from "@/lib/db";
import { etatArret, plusRecente, type EtatArret } from "./arret";

/* =============================================================================
 * CÔTÉ SERVEUR : LE REPÈRE DE FRAÎCHEUR, ET LE TAMPON QUI L'AVANCE
 *
 * Un automate a un témoin de fraîcheur tout trouvé : son `updatedAt`. Le BESOIN
 * EN MATÉRIEL, lui, est DÉRIVÉ (docs/MAGASIN.md) — il n'a pas de ligne à lui
 * dont on pourrait lire la date. Il se recompose à chaque affichage à partir de
 * trois sources : les projets GTB de l'affaire, les lignes manuelles, et les
 * décisions posées dessus (hors fourniture, variantes).
 *
 * ⚠️ Et surtout : deux de ces sources changent le besoin EN DISPARAISSANT —
 * retirer une ligne manuelle, décocher « hors fourniture ». Une suppression ne
 * laisse aucune date derrière elle. Prendre le `max(updatedAt)` des tables
 * suffirait donc pour les ajouts et raterait exactement les retraits : le besoin
 * resterait « arrêté » vert alors qu'il vient de maigrir. D'où `bomToucheeLe`,
 * tamponné par CHAQUE action qui touche au besoin, ajout comme retrait.
 * ========================================================================== */

export interface ArretBom {
  etat: EtatArret;
  arreteeLe: Date | null;
  arreteeParNom: string | null;
  /** Dernier mouvement du contenu — ce qui périme l'arrêt. */
  referenceLe: Date | null;
}

/** L'état d'arrêt du besoin en matériel d'une affaire. */
export async function arretBom(chantierId: string): Promise<ArretBom> {
  const [affaire, projets] = await Promise.all([
    prisma.chantier.findUnique({
      where: { id: chantierId },
      select: {
        bomArreteeLe: true,
        bomToucheeLe: true,
        bomArreteePar: { select: { nom: true } },
      },
    }),
    prisma.affectationProjet.aggregate({
      where: { chantierId },
      _max: { updatedAt: true },
    }),
  ]);

  const referenceLe = plusRecente(affaire?.bomToucheeLe, projets._max.updatedAt);
  return {
    etat: etatArret(affaire?.bomArreteeLe ?? null, referenceLe),
    arreteeLe: affaire?.bomArreteeLe ?? null,
    arreteeParNom: affaire?.bomArreteePar?.nom ?? null,
    referenceLe,
  };
}

/**
 * « Le besoin vient de bouger. » À appeler depuis TOUTE action qui modifie la
 * BOM d'une affaire — y compris celles qui suppriment.
 *
 * ⚠️ UPDATE brut, et pour deux raisons : `Chantier.updatedAt` est marqué
 * `@updatedAt`, donc un `prisma.chantier.update()` ferait remonter l'affaire en
 * tête du tableau de bord (« Modifié ») pour une coche de matériel ; et
 * l'horloge doit être celle de la BASE, la même que celle qui posera `now()`
 * sur l'arrêt — comparer deux dates issues d'horloges différentes est le genre
 * de détail qui fait clignoter un badge sans raison.
 */
export async function marquerBomTouchee(chantierId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "Chantier" SET "bomToucheeLe" = now() WHERE "id" = ${chantierId}`;
}
