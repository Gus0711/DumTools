import "server-only";
import { prisma } from "@/lib/db";
import type { ClientArtefact } from "@/lib/clients/types";
import {
  aujourdhui,
  calculerContrat,
  echeanceContrat,
  formatDuree,
  isoJour,
  jour,
  periodeCourante,
  repartirForfait,
  type ConsommationNature,
  type ContratDetail,
  type ContratResume,
  type EtatContrat,
  type InterventionVue,
  type LignePourForfait,
  type NatureIntervention,
  type PeriodeVue,
  type RepartitionLigne,
  type SiteVue,
} from "./model";

/* Lectures de l'outil « Maintenance ».
 *
 * Le forfait n'est JAMAIS lu en base : il se recalcule à chaque fois, à partir
 * des interventions et des dates du contrat (`calculerContrat`). C'est plus de
 * travail au CPU et c'est exactement le but — une consommation stockée finirait
 * par contredire la liste des interventions qui la produit, et c'est toujours
 * le chiffre stocké qu'on croit. */

/* ------------------------------------------------------------------ helpers */

const SELECT_INTERVENTION = {
  id: true,
  date: true,
  nature: true,
  dureeMin: true,
  motif: true,
  compteRendu: true,
  demandeur: true,
  siteId: true,
  site: { select: { nom: true } },
  intervenantId: true,
  intervenant: { select: { nom: true } },
  horsForfait: true,
  factureeLe: true,
  createdAt: true,
} as const;

type LigneBrute = {
  id: string;
  date: Date;
  nature: string;
  dureeMin: number;
  motif: string;
  compteRendu: string;
  demandeur: string;
  siteId: string | null;
  site: { nom: string } | null;
  intervenantId: string | null;
  intervenant: { nom: string } | null;
  horsForfait: boolean;
  factureeLe: Date | null;
  createdAt: Date;
};

function pourForfait(l: LigneBrute): LignePourForfait {
  return {
    id: l.id,
    date: l.date,
    nature: l.nature as NatureIntervention,
    dureeMin: l.dureeMin,
    horsForfait: l.horsForfait,
    createdAt: l.createdAt,
  };
}

function versVue(l: LigneBrute, r: RepartitionLigne | undefined): InterventionVue {
  return {
    id: l.id,
    date: isoJour(l.date),
    nature: l.nature as NatureIntervention,
    dureeMin: l.dureeMin,
    motif: l.motif,
    compteRendu: l.compteRendu,
    demandeur: l.demandeur,
    siteId: l.siteId,
    siteNom: l.site?.nom ?? null,
    intervenantId: l.intervenantId,
    intervenantNom: l.intervenant?.nom ?? null,
    horsForfait: l.horsForfait,
    factureeLe: l.factureeLe ? isoJour(l.factureeLe) : null,
    inclusMin: r?.inclusMin ?? 0,
    horsMin: r?.horsMin ?? 0,
    cause: r?.cause ?? null,
  };
}

/** Ce qui reste à facturer : le hors forfait des interventions jamais facturées.
 *  Toutes périodes confondues — une heure de 2024 oubliée est perdue pareil. */
function resteAFacturer(
  lignes: LigneBrute[],
  parLigne: Map<string, RepartitionLigne>,
): number {
  return lignes
    .filter((l) => l.factureeLe == null)
    .reduce((s, l) => s + (parLigne.get(l.id)?.horsMin ?? 0), 0);
}

/* ------------------------------------------------------------------ contrats */

export async function listerContrats(): Promise<ContratResume[]> {
  const contrats = await prisma.contratMaintenance.findMany({
    include: {
      client: { select: { id: true, nom: true } },
      sites: { select: { site: { select: { id: true, nom: true } } } },
      interventions: {
        select: {
          id: true,
          date: true,
          nature: true,
          dureeMin: true,
          horsForfait: true,
          factureeLe: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ etat: "asc" }, { debut: "desc" }],
  });

  const maintenant = aujourdhui();

  return contrats.map((c) => {
    const lignes: LignePourForfait[] = c.interventions.map((i) => ({
      id: i.id,
      date: i.date,
      nature: i.nature as NatureIntervention,
      dureeMin: i.dureeMin,
      horsForfait: i.horsForfait,
      createdAt: i.createdAt,
    }));

    const quotas = {
      quotaTeleMin: c.quotaTeleMin,
      quotaPresentielMin: c.quotaPresentielMin,
    };
    const calcul = calculerContrat(c.debut, c.fin, quotas, lignes, maintenant);
    const courante = periodeCourante(c.debut, c.fin, maintenant);
    const ici = calcul.periodes.find((p) => p.periode.index === courante.index);

    const aFacturerMin = c.interventions
      .filter((i) => i.factureeLe == null)
      .reduce((s, i) => s + (calcul.parLigne.get(i.id)?.horsMin ?? 0), 0);

    return {
      id: c.id,
      reference: c.reference,
      numeroWhy: c.numeroWhy,
      intitule: c.intitule,
      clientId: c.clientId,
      clientNom: c.client.nom,
      etat: c.etat as EtatContrat,
      debut: isoJour(c.debut),
      fin: c.fin ? isoJour(c.fin) : null,
      tacite: c.tacite,
      preavisJours: c.preavisJours,
      quotaTeleMin: c.quotaTeleMin,
      quotaPresentielMin: c.quotaPresentielMin,
      tarifHoraireCents: c.tarifHoraireCents,
      nbSites: c.sites.length,
      sites: c.sites.map((s) => s.site),
      periode: {
        index: courante.index,
        debut: isoJour(courante.debut),
        dernierJour: isoJour(courante.dernierJour),
      },
      // Une période sans aucune intervention n'apparaît pas dans `calcul` :
      // on rend alors des compteurs à zéro plutôt que rien du tout.
      consommation:
        ici?.consommation ?? repartirForfait([], quotas).consommation,
      aFacturerMin,
      echeance: echeanceContrat(c.fin, c.preavisJours, maintenant),
      updatedAt: c.updatedAt,
    } satisfies ContratResume;
  });
}

/**
 * La fiche d'un contrat. `periodeIndex` null = la période en cours — c'est
 * celle qu'on veut neuf fois sur dix, et la seule qu'on puisse deviner.
 */
export async function getContratDetail(
  id: string,
  periodeIndex: number | null = null,
): Promise<ContratDetail | null> {
  const c = await prisma.contratMaintenance.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, nom: true } },
      updatedBy: { select: { nom: true } },
      sites: {
        select: {
          site: {
            include: { _count: { select: { contrats: true } } },
          },
        },
      },
      interventions: { select: SELECT_INTERVENTION },
    },
  });
  if (!c) return null;

  const maintenant = aujourdhui();
  const quotas = {
    quotaTeleMin: c.quotaTeleMin,
    quotaPresentielMin: c.quotaPresentielMin,
  };
  const lignes = c.interventions as LigneBrute[];
  const calcul = calculerContrat(
    c.debut,
    c.fin,
    quotas,
    lignes.map(pourForfait),
    maintenant,
  );

  const courante = periodeCourante(c.debut, c.fin, maintenant);
  const voulu =
    periodeIndex != null &&
    calcul.periodes.some((p) => p.periode.index === periodeIndex)
      ? periodeIndex
      : courante.index;

  const periodes: PeriodeVue[] = calcul.periodes
    .map((p) => ({
      index: p.periode.index,
      debut: isoJour(p.periode.debut),
      dernierJour: isoJour(p.periode.dernierJour),
      tronquee: p.periode.tronquee,
      courante: p.periode.index === courante.index,
    }))
    .reverse();

  const ici = calcul.periodes.find((p) => p.periode.index === voulu);
  const bornes = ici?.periode ?? courante;

  const dansLaPeriode = lignes
    .filter(
      (l) =>
        l.date.getTime() >= bornes.debut.getTime() &&
        l.date.getTime() < bornes.fin.getTime(),
    )
    .sort(
      (a, b) =>
        b.date.getTime() - a.date.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

  const idsHors = new Set(calcul.horsPeriode.map((l) => l.id));

  return {
    id: c.id,
    reference: c.reference,
    numeroWhy: c.numeroWhy,
    intitule: c.intitule,
    clientId: c.clientId,
    clientNom: c.client.nom,
    etat: c.etat as EtatContrat,
    debut: isoJour(c.debut),
    fin: c.fin ? isoJour(c.fin) : null,
    tacite: c.tacite,
    preavisJours: c.preavisJours,
    quotaTeleMin: c.quotaTeleMin,
    quotaPresentielMin: c.quotaPresentielMin,
    tarifHoraireCents: c.tarifHoraireCents,
    notes: c.notes,
    sites: c.sites.map((s) => versSiteVue(s.site)),
    periodes,
    periodeIndex: voulu,
    interventions: dansLaPeriode.map((l) => versVue(l, calcul.parLigne.get(l.id))),
    consommation: ici?.consommation ?? repartirForfait([], quotas).consommation,
    horsPeriode: lignes
      .filter((l) => idsHors.has(l.id))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((l) => versVue(l, calcul.parLigne.get(l.id))),
    aFacturerMin: resteAFacturer(lignes, calcul.parLigne),
    echeance: echeanceContrat(c.fin, c.preavisJours, maintenant),
    updatedAt: c.updatedAt,
    majParNom: c.updatedBy?.nom ?? null,
  };
}

/* --------------------------------------------------------------------- sites */

type SiteBrut = {
  id: string;
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  acces: string;
  accesDistant: string;
  note: string;
  actif: boolean;
  _count: { contrats: number };
};

function versSiteVue(s: SiteBrut): SiteVue {
  return {
    id: s.id,
    nom: s.nom,
    adresse: s.adresse,
    codePostal: s.codePostal,
    ville: s.ville,
    acces: s.acces,
    accesDistant: s.accesDistant,
    note: s.note,
    actif: s.actif,
    nbContrats: s._count.contrats,
  };
}

/** Les sites d'un client — ceux qu'on propose de rattacher à un contrat.
 *  `tous` inclut les sites sortis du parc (pour l'écran de référentiel). */
export async function sitesDuClient(
  clientId: string,
  tous = false,
): Promise<SiteVue[]> {
  const sites = await prisma.siteClient.findMany({
    where: { clientId, ...(tous ? {} : { actif: true }) },
    include: { _count: { select: { contrats: true } } },
    orderBy: { nom: "asc" },
  });
  return sites.map(versSiteVue);
}

export interface SiteAvecClient extends SiteVue {
  clientId: string;
  clientNom: string;
  /** Interventions faites sur ce site, toutes périodes et contrats confondus. */
  nbInterventions: number;
}

export async function listerSites(): Promise<SiteAvecClient[]> {
  const sites = await prisma.siteClient.findMany({
    include: {
      client: { select: { id: true, nom: true } },
      _count: { select: { contrats: true, interventions: true } },
    },
    orderBy: [{ client: { nom: "asc" } }, { nom: "asc" }],
  });
  return sites.map((s) => ({
    ...versSiteVue(s),
    clientId: s.client.id,
    clientNom: s.client.nom,
    nbInterventions: s._count.interventions,
  }));
}

/* -------------------------------------------------------------- intervenants */

/** Qui peut être porté comme intervenant : les comptes actifs. */
export async function listerIntervenants(): Promise<{ id: string; nom: string }[]> {
  return prisma.user.findMany({
    where: { actif: true },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });
}

/* ------------------------------------------------------------ fiche client */

/**
 * Les contrats d'un client, pour la fiche client (`ClientArtefact`).
 *
 * ⚠️ VOLONTAIREMENT PAS ENCORE BRANCHÉ dans `src/lib/clients/providers.ts` :
 * l'outil vit dans un espace perso, et la règle de ToolGus est qu'un outil
 * perso n'entre pas dans l'agrégation (docs/TOOLGUS.md §2). La fonction existe
 * quand même — le jour où le contrat de maintenance devient un outil métier,
 * comme le Devis l'est devenu, il n'y a qu'UNE ligne à ajouter là-bas.
 */
export async function listerPourClient(clientId: string): Promise<ClientArtefact[]> {
  const contrats = await prisma.contratMaintenance.findMany({
    where: { clientId },
    include: {
      _count: { select: { sites: true, interventions: true } },
    },
    orderBy: { debut: "desc" },
  });

  return contrats.map((c) => {
    const total = c.quotaTeleMin + c.quotaPresentielMin;
    const bouts = [
      c._count.sites === 1 ? "1 site" : `${c._count.sites} sites`,
      total > 0 ? `${formatDuree(total)}/an` : "sans forfait",
      `${c._count.interventions} intervention${c._count.interventions > 1 ? "s" : ""}`,
    ];
    return {
      id: c.id,
      titre: c.intitule,
      href: `/perso/gus/maintenance/${c.id}`,
      numeroWhy: c.numeroWhy,
      updatedAt: c.updatedAt,
      resume: bouts.join(" · "),
    };
  });
}

/* ----------------------------------------------------------------- exports */

export type { ConsommationNature, ContratResume, ContratDetail };
export { jour };

/* ------------------------------------------------------------ éditeur */

export interface ClientAvecSites {
  id: string;
  nom: string;
  sites: { id: string; nom: string; actif: boolean }[];
}

/**
 * Les clients et LEURS SITES, d'un coup — de quoi alimenter l'éditeur de
 * contrat sans un aller-retour réseau à chaque changement de client.
 * Le volume est celui d'un référentiel (des dizaines de lignes), pas d'un
 * journal : le charger entier coûte moins qu'une requête de plus par clic.
 */
export async function listerClientsAvecSites(): Promise<ClientAvecSites[]> {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      nom: true,
      sites: {
        select: { id: true, nom: true, actif: true },
        orderBy: { nom: "asc" },
      },
    },
    orderBy: { nom: "asc" },
  });
  return clients;
}
