import "server-only";
import { prisma } from "@/lib/db";
import type { DepenseFrais, JustificatifFrais } from "@/generated/prisma/client";
import {
  dernieresPeriodes,
  periodeDe,
  periodeSuivante,
  type DepenseVue,
  type Periode,
  type ProfilNdf,
} from "./model";

/* Lectures de l'outil « Notes de frais ».
 *
 * ⚠️ CLOISONNEMENT — invariant du module : TOUTE fonction exposée ici prend un
 * `userId` et filtre dessus. Il n'existe volontairement aucune requête capable
 * de renvoyer les dépenses d'autrui, y compris pour un ADMIN : il n'y a donc
 * pas de « vue globale » à sécuriser, elle n'est pas écrivable sans modifier ce
 * fichier. Voir docs/NDF.md §6. */

type LigneAvecJustificatifs = DepenseFrais & {
  justificatifs: Pick<JustificatifFrais, "id" | "mimeType" | "nomOrigine">[];
};

const SELECT_JUSTIFS = {
  select: { id: true, mimeType: true, nomOrigine: true },
  orderBy: { createdAt: "asc" },
} as const;

function versVue(d: LigneAvecJustificatifs): DepenseVue {
  return {
    id: d.id,
    // `date` est un DATE Postgres : on prend les composantes UTC, sinon un
    // fuseau à l'ouest décalerait l'affichage d'un jour.
    date: d.date.toISOString().slice(0, 10),
    categorie: d.categorie as DepenseVue["categorie"],
    montantCents: d.montantCents,
    tvaCents: d.tvaCents,
    descriptif: d.descriptif,
    numeroAffaire: d.numeroAffaire,
    nbInvites: d.nbInvites,
    invites: d.invites,
    periode: d.periode,
    periodeOrigine: d.periodeOrigine,
    justificatifs: d.justificatifs,
  };
}

/** Profil NDF de la personne. Null = elle n'établit pas de note de frais :
 *  l'outil le lui dit clairement plutôt que d'afficher un écran vide. */
export async function profilNdfDe(userId: string): Promise<ProfilNdf | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilNdf: true },
  });
  return (u?.profilNdf as ProfilNdf | null) ?? null;
}

/** Les dépenses COMPLÈTES d'une période — celles qui entreront dans l'Excel. */
export async function depensesDuMois(
  userId: string,
  periode: Periode,
): Promise<DepenseVue[]> {
  const rows = await prisma.depenseFrais.findMany({
    where: { createdById: userId, periode, justificatifs: { some: {} } },
    include: { justificatifs: SELECT_JUSTIFS },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(versVue);
}

/**
 * Les dépenses SANS justificatif, toutes périodes confondues — la zone qu'on
 * veut vider. Elles n'entrent dans aucun récap tant qu'une photo n'est pas
 * ajoutée (règle centrale, docs/NDF.md §2).
 */
export async function depensesEnAttente(
  userId: string,
): Promise<DepenseVue[]> {
  const rows = await prisma.depenseFrais.findMany({
    where: { createdById: userId, justificatifs: { none: {} } },
    include: { justificatifs: SELECT_JUSTIFS },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(versVue);
}

export async function depense(
  userId: string,
  id: string,
): Promise<DepenseVue | null> {
  const row = await prisma.depenseFrais.findFirst({
    where: { id, createdById: userId },
    include: { justificatifs: SELECT_JUSTIFS },
  });
  return row ? versVue(row) : null;
}

export interface LigneHistorique {
  periode: Periode;
  totalCents: number;
  nbDepenses: number;
  transmiseLe: Date | null;
}

/**
 * Historique personnel : une ligne par mois, la plus récente d'abord. Ne compte
 * que les dépenses complètes — c'est ce qui part à la compta, donc c'est ce que
 * la personne doit voir.
 */
export async function historique(
  userId: string,
  nbMois = 12,
): Promise<LigneHistorique[]> {
  const periodes = dernieresPeriodes(periodeDe(new Date()), nbMois);
  const [aggs, mois] = await Promise.all([
    prisma.depenseFrais.groupBy({
      by: ["periode"],
      where: {
        createdById: userId,
        periode: { in: periodes },
        justificatifs: { some: {} },
      },
      _sum: { montantCents: true },
      _count: { _all: true },
    }),
    prisma.noteFraisMois.findMany({
      where: { userId, periode: { in: periodes } },
      select: { periode: true, transmiseLe: true },
    }),
  ]);

  const parPeriode = new Map(aggs.map((a) => [a.periode, a]));
  const transmises = new Map(mois.map((m) => [m.periode, m.transmiseLe]));

  return periodes.map((p) => ({
    periode: p,
    totalCents: parPeriode.get(p)?._sum.montantCents ?? 0,
    nbDepenses: parPeriode.get(p)?._count._all ?? 0,
    transmiseLe: transmises.get(p) ?? null,
  }));
}

export async function etatDuMois(
  userId: string,
  periode: Periode,
): Promise<{ transmiseLe: Date | null }> {
  const m = await prisma.noteFraisMois.findUnique({
    where: { userId_periode: { userId, periode } },
    select: { transmiseLe: true },
  });
  return { transmiseLe: m?.transmiseLe ?? null };
}

/**
 * Période d'imputation d'une dépense — c'est ici que vit la règle de rattrapage.
 *
 * Par défaut : le mois de la date du ticket. Mais si ce mois a DÉJÀ été transmis
 * à la compta, la dépense est reportée sur le premier mois encore ouvert (au
 * plus tôt le mois courant) : un fichier déjà remis n'est jamais invalidé, et la
 * dépense n'est pas perdue pour autant. `periodeOrigine` garde la trace du mois
 * réel, affiché à l'écran et rappelé dans le descriptif de l'Excel.
 */
export async function resoudrePeriode(
  userId: string,
  dateDepense: Date,
): Promise<{ periode: Periode; periodeOrigine: Periode | null }> {
  const origine = periodeDe(dateDepense);

  const transmises = new Set(
    (
      await prisma.noteFraisMois.findMany({
        where: { userId, transmiseLe: { not: null } },
        select: { periode: true },
      })
    ).map((m) => m.periode),
  );

  if (!transmises.has(origine)) return { periode: origine, periodeOrigine: null };

  // Report : au plus tôt le mois courant, puis on avance tant que c'est fermé.
  const courant = periodeDe(new Date());
  let cible = courant > origine ? courant : periodeSuivante(origine);
  // Borne de sécurité : 24 mois, pour ne jamais boucler sur des données absurdes.
  for (let i = 0; i < 24 && transmises.has(cible); i++) {
    cible = periodeSuivante(cible);
  }
  return { periode: cible, periodeOrigine: origine };
}

/**
 * Descriptifs déjà employés par la personne, les plus récents d'abord. Alimente
 * l'autocomplétion : on retape rarement autre chose que « péage A26 » ou
 * « plein gazole », autant ne pas le ressaisir en entier à chaque fois.
 */
export async function descriptifsRecents(
  userId: string,
  max = 25,
): Promise<string[]> {
  const rows = await prisma.depenseFrais.findMany({
    where: { createdById: userId, descriptif: { not: "" } },
    select: { descriptif: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const vus = new Set<string>();
  for (const r of rows) {
    vus.add(r.descriptif);
    if (vus.size >= max) break;
  }
  return [...vus];
}

/** Affaires proposées à la saisie (liste courte, saisie libre toujours possible). */
export async function affairesPourSaisie(): Promise<
  { numeroWhy: string; nom: string; clientNom: string }[]
> {
  const rows = await prisma.chantier.findMany({
    where: { numeroWhy: { not: null }, etat: { not: "CORBEILLE" } },
    select: { numeroWhy: true, nom: true, client: { select: { nom: true } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  return rows.map((r) => ({
    numeroWhy: r.numeroWhy ?? "",
    nom: r.nom,
    clientNom: r.client.nom,
  }));
}

/**
 * Chemins disque des justificatifs d'un mois, pour l'assemblage du PDF. Filtré
 * sur le propriétaire comme tout le reste — la génération ne peut pas servir de
 * porte dérobée vers les fichiers d'autrui.
 */
export async function fichiersJustificatifs(
  userId: string,
  periode: Periode,
): Promise<Map<string, { chemin: string; mimeType: string }>> {
  const rows = await prisma.justificatifFrais.findMany({
    where: { depense: { createdById: userId, periode } },
    select: { id: true, fichier: true, mimeType: true },
  });
  return new Map(
    rows.map((r) => [r.id, { chemin: r.fichier, mimeType: r.mimeType }]),
  );
}

/** Identité imprimée en en-tête du gabarit Excel. */
export async function identitePourExport(
  userId: string,
): Promise<{ nom: string; profil: ProfilNdf | null }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { nom: true, profilNdf: true },
  });
  return {
    nom: u?.nom ?? "",
    profil: (u?.profilNdf as ProfilNdf | null) ?? null,
  };
}
