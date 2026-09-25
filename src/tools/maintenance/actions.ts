"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { EtatContrat, NatureIntervention } from "@/generated/prisma/enums";
import { resoudreClientId } from "@/lib/clients/queries";
import { estJourValide, jour } from "./model";

/* Écritures de l'outil « Maintenance ».
 *
 * Les server actions sont appelables au réseau : tout ce qui arrive du client
 * est revalidé ici, y compris ce que le formulaire contraint déjà.
 *
 * ⚠️ AUCUNE ACTION N'ÉCRIT DE CONSOMMATION. Le forfait se recalcule à la
 * lecture (queries.ts → calculerContrat). Poser un « consommé » en base serait
 * un second chiffre à tenir, et le jour où il contredirait la liste des
 * interventions, c'est lui qu'on croirait. */

const RACINE = "/perso/gus/maintenance";

async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
  return session.user.id;
}

export type Resultat<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { id?: string } : { id: string }))
  | { ok: false; error: string };

function rafraichir(contratId?: string) {
  revalidatePath(RACINE);
  if (contratId) revalidatePath(`${RACINE}/${contratId}`);
}

function valideEtat(v: string): EtatContrat {
  if (!Object.values(EtatContrat).includes(v as EtatContrat)) {
    throw new Error("État de contrat inconnu");
  }
  return v as EtatContrat;
}

function valideNature(v: string): NatureIntervention {
  if (!Object.values(NatureIntervention).includes(v as NatureIntervention)) {
    throw new Error("Nature d'intervention inconnue");
  }
  return v as NatureIntervention;
}

/** Entier positif borné — un quota ou une durée arrivés du réseau. */
function entierPositif(v: unknown, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > max) return 0;
  return n;
}

/* ================================================================= contrats */

export interface ContratPayload {
  /** Vide = création. */
  id?: string;
  intitule: string;
  /** Le nom du client, résolu (et CRÉÉ au besoin) par `resoudreClientId` —
   *  convention de la maison, valable pour tous les outils. */
  clientNom: string;
  reference: string;
  numeroWhy: string;
  etat: string;
  /** « AAAA-MM-JJ ». */
  debut: string;
  /** « AAAA-MM-JJ » ou vide = sans terme convenu. */
  fin: string;
  tacite: boolean;
  preavisJours: number;
  quotaTeleMin: number;
  quotaPresentielMin: number;
  tarifHoraireCents: number;
  notes: string;
  /** Les sites couverts, par id. Le rattachement est remplacé en bloc. */
  siteIds: string[];
}

export async function enregistrerContrat(
  p: ContratPayload,
): Promise<Resultat<string>> {
  const userId = await requireUser();

  const intitule = p.intitule.trim();
  if (!intitule) return { ok: false, error: "Un intitulé est nécessaire" };
  if (!p.clientNom.trim()) return { ok: false, error: "Un client est nécessaire" };
  if (!estJourValide(p.debut)) {
    return { ok: false, error: "La date d'effet est nécessaire" };
  }
  if (p.fin && !estJourValide(p.fin)) {
    return { ok: false, error: "Date de fin invalide" };
  }

  const debut = jour(p.debut);
  const fin = p.fin ? jour(p.fin) : null;
  // Un terme AVANT l'effet ne produirait aucune période : la fiche serait vide
  // et personne ne saurait pourquoi.
  if (fin && fin.getTime() < debut.getTime()) {
    return { ok: false, error: "La fin ne peut pas précéder la date d'effet" };
  }

  const clientId = await resoudreClientId(p.clientNom);
  if (!clientId) return { ok: false, error: "Client inconnu" };

  // Un site ne se rattache qu'à un contrat de SON client : sans ce filtre, on
  // couvrirait le bâtiment d'une autre société en postant son id.
  const sites = await prisma.siteClient.findMany({
    where: { id: { in: p.siteIds }, clientId },
    select: { id: true },
  });

  const data = {
    intitule,
    clientId,
    reference: p.reference.trim() || null,
    numeroWhy: p.numeroWhy.trim() || null,
    etat: valideEtat(p.etat),
    debut,
    fin,
    tacite: !!p.tacite,
    preavisJours: entierPositif(p.preavisJours, 3650),
    quotaTeleMin: entierPositif(p.quotaTeleMin, 60 * 24 * 365),
    quotaPresentielMin: entierPositif(p.quotaPresentielMin, 60 * 24 * 365),
    tarifHoraireCents: entierPositif(p.tarifHoraireCents, 100_000_00),
    notes: p.notes,
    updatedById: userId,
  };

  const id = await prisma.$transaction(async (tx) => {
    let contratId: string;
    if (p.id) {
      const maj = await tx.contratMaintenance.update({
        where: { id: p.id },
        data,
        select: { id: true },
      });
      contratId = maj.id;
      await tx.contratSite.deleteMany({ where: { contratId } });
    } else {
      const cree = await tx.contratMaintenance.create({
        data: { ...data, createdById: userId },
        select: { id: true },
      });
      contratId = cree.id;
    }
    if (sites.length > 0) {
      await tx.contratSite.createMany({
        data: sites.map((s) => ({ contratId, siteId: s.id })),
        skipDuplicates: true,
      });
    }
    return contratId;
  });

  rafraichir(id);
  return { ok: true, id };
}

export async function changerEtatContrat(
  id: string,
  etat: string,
): Promise<Resultat> {
  const userId = await requireUser();
  await prisma.contratMaintenance.update({
    where: { id },
    data: { etat: valideEtat(etat), updatedById: userId },
  });
  rafraichir(id);
  return { ok: true };
}

/**
 * Supprime un contrat ET ses interventions (cascade au schéma).
 *
 * ⚠️ On ne supprime pas un contrat qu'on arrête : on le passe en TERMINÉ. La
 * suppression est là pour la saisie ratée, et c'est pour cela que l'écran la
 * fait confirmer en nommant ce qui part avec.
 */
export async function supprimerContrat(id: string): Promise<Resultat> {
  await requireUser();
  await prisma.contratMaintenance.delete({ where: { id } });
  revalidatePath(RACINE);
  return { ok: true };
}

/* ============================================================ interventions */

export interface InterventionPayload {
  id?: string;
  contratId: string;
  /** « AAAA-MM-JJ ». */
  date: string;
  nature: string;
  dureeMin: number;
  motif: string;
  compteRendu: string;
  demandeur: string;
  /** Vide = le contrat dans son ensemble. */
  siteId: string;
  /** Vide = non renseigné. */
  intervenantId: string;
  horsForfait: boolean;
}

export async function enregistrerIntervention(
  p: InterventionPayload,
): Promise<Resultat<string>> {
  const userId = await requireUser();

  const motif = p.motif.trim();
  if (!motif) return { ok: false, error: "Le motif est nécessaire" };
  if (!estJourValide(p.date)) return { ok: false, error: "Date invalide" };

  const dureeMin = entierPositif(p.dureeMin, 60 * 24);
  if (dureeMin <= 0) return { ok: false, error: "Durée invalide" };

  const contrat = await prisma.contratMaintenance.findUnique({
    where: { id: p.contratId },
    select: { id: true, clientId: true },
  });
  if (!contrat) return { ok: false, error: "Contrat inconnu" };

  // Même garde que pour le rattachement : le site doit appartenir au client du
  // contrat.
  let siteId: string | null = null;
  if (p.siteId) {
    const s = await prisma.siteClient.findFirst({
      where: { id: p.siteId, clientId: contrat.clientId },
      select: { id: true },
    });
    if (!s) return { ok: false, error: "Site inconnu pour ce client" };
    siteId = s.id;
  }

  let intervenantId: string | null = null;
  if (p.intervenantId) {
    const u = await prisma.user.findUnique({
      where: { id: p.intervenantId },
      select: { id: true },
    });
    intervenantId = u?.id ?? null;
  }

  const data = {
    contratId: contrat.id,
    date: jour(p.date),
    nature: valideNature(p.nature),
    dureeMin,
    motif,
    compteRendu: p.compteRendu,
    demandeur: p.demandeur.trim(),
    siteId,
    intervenantId,
    horsForfait: !!p.horsForfait,
    updatedById: userId,
  };

  const ligne = p.id
    ? await prisma.intervention.update({
        where: { id: p.id },
        data,
        select: { id: true },
      })
    : await prisma.intervention.create({
        data: { ...data, createdById: userId },
        select: { id: true },
      });

  rafraichir(contrat.id);
  return { ok: true, id: ligne.id };
}

export async function supprimerIntervention(id: string): Promise<Resultat> {
  await requireUser();
  const l = await prisma.intervention.delete({
    where: { id },
    select: { contratId: true },
  });
  rafraichir(l.contratId);
  return { ok: true };
}

/**
 * Marque (ou démarque) des interventions comme refacturées.
 *
 * « Facturable » se DÉDUIT — c'est le hors forfait, et il se recalcule ;
 * « facturé » se DÉCLARE, parce qu'aucun calcul ne sait si la facture est
 * partie. D'où une date, et non un booléen : on veut savoir QUAND.
 */
export async function marquerFacturees(
  ids: string[],
  facturee: boolean,
): Promise<Resultat> {
  await requireUser();
  if (ids.length === 0) return { ok: true };

  const lignes = await prisma.intervention.findMany({
    where: { id: { in: ids } },
    select: { contratId: true },
  });

  await prisma.intervention.updateMany({
    where: { id: { in: ids } },
    data: { factureeLe: facturee ? new Date() : null },
  });

  for (const c of new Set(lignes.map((l) => l.contratId))) rafraichir(c);
  return { ok: true };
}

/* ==================================================================== sites */

export interface SitePayload {
  id?: string;
  clientId: string;
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  acces: string;
  accesDistant: string;
  note: string;
  actif: boolean;
}

export async function enregistrerSite(p: SitePayload): Promise<Resultat<string>> {
  const userId = await requireUser();

  const nom = p.nom.trim();
  if (!nom) return { ok: false, error: "Un nom de site est nécessaire" };
  if (!p.clientId) return { ok: false, error: "Un client est nécessaire" };

  // `@@unique([clientId, nom])` : deux sites d'un même client ne portent pas le
  // même nom — c'est ce qui rend la résolution par nom possible.
  const collision = await prisma.siteClient.findUnique({
    where: { clientId_nom: { clientId: p.clientId, nom } },
    select: { id: true },
  });
  if (collision && collision.id !== p.id) {
    return { ok: false, error: "Ce client a déjà un site portant ce nom" };
  }

  const data = {
    clientId: p.clientId,
    nom,
    adresse: p.adresse,
    codePostal: p.codePostal.trim(),
    ville: p.ville.trim(),
    acces: p.acces,
    accesDistant: p.accesDistant,
    note: p.note,
    actif: !!p.actif,
  };

  const site = p.id
    ? await prisma.siteClient.update({
        where: { id: p.id },
        data,
        select: { id: true },
      })
    : await prisma.siteClient.create({
        data: { ...data, createdById: userId },
        select: { id: true },
      });

  revalidatePath(RACINE);
  revalidatePath(`${RACINE}/sites`);
  return { ok: true, id: site.id };
}

/**
 * Résout un site par son NOM chez un client, en le CRÉANT au besoin — patron de
 * `resoudreClientId`. C'est ce qui permet d'ajouter « Salle des fêtes » depuis
 * l'éditeur de contrat sans aller ouvrir un référentiel d'abord : le référentiel
 * se remplit du travail, pas d'une corvée de préparation.
 */
export async function resoudreSiteId(
  clientId: string,
  nom: string,
): Promise<Resultat<string>> {
  const userId = await requireUser();
  const n = nom.trim();
  if (!n) return { ok: false, error: "Nom de site vide" };
  if (!clientId) return { ok: false, error: "Un client est nécessaire" };

  const site = await prisma.siteClient.upsert({
    where: { clientId_nom: { clientId, nom: n } },
    update: {},
    create: { clientId, nom: n, createdById: userId },
    select: { id: true },
  });
  revalidatePath(RACINE);
  return { ok: true, id: site.id };
}

/**
 * Retire un site du parc. On ne le SUPPRIME pas : des interventions le citent,
 * et l'historique d'un contrat doit rester lisible dix ans après. Même
 * grammaire que `ContactClient.actif`.
 */
export async function archiverSite(id: string, actif: boolean): Promise<Resultat> {
  await requireUser();
  await prisma.siteClient.update({ where: { id }, data: { actif } });
  revalidatePath(RACINE);
  revalidatePath(`${RACINE}/sites`);
  return { ok: true };
}
