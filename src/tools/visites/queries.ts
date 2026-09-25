import "server-only";
import { prisma } from "@/lib/db";
import type { ClientArtefact } from "@/lib/clients/types";
import type { AffaireTerrain } from "@/lib/offline/visites";
import {
  dateISOLocale,
  normaliserData,
  reservesOuvertes,
  resumeVisite,
  titreAffiche,
  type TypeVisite,
  type Visite,
  type VisiteData,
} from "./model";

// Helpers PURS de lecture : ils vivent dans ./model (client-safe) pour que le
// serveur MCP puisse les partager — ce fichier est « server-only ». Ré-exportés
// ici : les appelants historiques (jalons, accueil) ne changent pas d'adresse.
export { normaliserData, titreAffiche };

export interface VisiteResume {
  id: string;
  titre: string;
  type: TypeVisite;
  date: Date;
  chantierId: string | null;
  chantierNom: string;
  clientNom: string;
  numeroWhy: string | null;
  resume: string;
  updatedAt: Date;
}

/** Toutes les visites synchronisées (index de l'outil), la plus récente d'abord. */
export async function listerVisites(): Promise<VisiteResume[]> {
  const visites = await prisma.visite.findMany({
    orderBy: { date: "desc" },
    include: { chantier: { select: { nom: true } } },
  });
  return visites.map((v) => {
    const type = v.type as TypeVisite;
    return {
      id: v.id,
      titre: titreAffiche({ titre: v.titre, type, date: v.date }),
      type,
      date: v.date,
      chantierId: v.chantierId,
      chantierNom: v.chantier?.nom ?? "",
      clientNom: v.clientNom,
      numeroWhy: v.numeroWhy,
      resume: resumeVisite(normaliserData(v.data)),
      updatedAt: v.updatedAt,
    };
  });
}

export interface VisiteDetail {
  id: string;
  titre: string;
  type: TypeVisite;
  date: Date;
  chantierId: string | null;
  chantierNom: string;
  clientNom: string;
  numeroWhy: string | null;
  data: VisiteData;
  auteur: string | null;
  updatedAt: Date;
  /** Médias dont le binaire est bien arrivé sur le serveur. */
  mediasRecus: Set<string>;
}

/** Une visite complète pour la fiche en ligne. */
export async function getVisiteDetail(id: string): Promise<VisiteDetail | null> {
  const v = await prisma.visite.findUnique({
    where: { id },
    include: {
      chantier: { select: { nom: true } },
      createdBy: { select: { nom: true } },
      medias: { select: { id: true } },
    },
  });
  if (!v) return null;
  const type = v.type as TypeVisite;
  return {
    id: v.id,
    titre: titreAffiche({ titre: v.titre, type, date: v.date }),
    type,
    date: v.date,
    chantierId: v.chantierId,
    chantierNom: v.chantier?.nom ?? "",
    clientNom: v.clientNom,
    numeroWhy: v.numeroWhy,
    data: normaliserData(v.data),
    auteur: v.createdBy?.nom ?? null,
    updatedAt: v.updatedAt,
    mediasRecus: new Set(v.medias.map((m) => m.id)),
  };
}

/** Une visite synchronisée au format de l'îlot terrain — pour « Modifier » depuis
 *  la fiche bureau : l'îlot l'importe dans son stockage local puis l'ouvre.
 *  Les drapeaux `uploaded` sont recalculés d'après les binaires réellement reçus
 *  (le terrain les pose en local sans re-pousser le data). */
export async function getVisitePourTerrain(id: string): Promise<Visite | null> {
  const v = await prisma.visite.findUnique({
    where: { id },
    include: {
      chantier: { select: { nom: true } },
      medias: { select: { id: true } },
    },
  });
  if (!v) return null;
  const recus = new Set(v.medias.map((m) => m.id));
  const data = normaliserData(v.data);
  data.medias = data.medias.map((m) => ({ ...m, uploaded: recus.has(m.id) }));
  return {
    id: v.id,
    type: v.type as TypeVisite,
    titre: v.titre,
    date: dateISOLocale(v.date),
    chantierId: v.chantierId,
    chantierNom: v.chantier?.nom ?? "",
    clientNom: v.clientNom,
    numeroWhy: v.numeroWhy,
    data,
    createdTs: v.createdAt.getTime(),
  };
}

/* --- Snapshot terrain ----------------------------------------------------------
 * Ce que l'îlot met en cache (IndexedDB) pour créer une visite hors-ligne :
 * les affaires + leurs réserves encore ouvertes (report inter-visites — le
 * « ne rien oublier » au niveau de l'affaire).
 * ------------------------------------------------------------------------------ */

export async function snapshotAffairesPourTerrain(): Promise<AffaireTerrain[]> {
  const affaires = await prisma.chantier.findMany({
    where: { etat: { not: "CORBEILLE" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      nom: true,
      numeroWhy: true,
      client: { select: { nom: true } },
      visites: { select: { id: true, data: true } },
    },
  });
  return affaires.map((a) => ({
    id: a.id,
    nom: a.nom,
    clientNom: a.client.nom,
    numeroWhy: a.numeroWhy,
    reservesOuvertes: reservesOuvertes(a.visites),
  }));
}

/* --- Providers fiches client / affaire ------------------------------------------- */

function versArtefacts(
  visites: {
    id: string;
    titre: string;
    type: string;
    date: Date;
    numeroWhy: string | null;
    data: unknown;
    updatedAt: Date;
  }[],
): ClientArtefact[] {
  return visites.map((v) => ({
    id: v.id,
    titre: titreAffiche({ titre: v.titre, type: v.type as TypeVisite, date: v.date }),
    href: `/outils/visites/${v.id}`,
    numeroWhy: v.numeroWhy,
    updatedAt: v.updatedAt,
    resume: resumeVisite(normaliserData(v.data)),
  }));
}

/** Provider fiche affaire : visites rattachées à ce chantier. */
export async function listerPourChantier(chantierId: string): Promise<ClientArtefact[]> {
  const visites = await prisma.visite.findMany({
    where: { chantierId },
    orderBy: { date: "desc" },
  });
  return versArtefacts(visites);
}

/** Provider fiche client : visites rattachées à ce client. */
export async function listerPourClient(clientId: string): Promise<ClientArtefact[]> {
  const visites = await prisma.visite.findMany({
    where: { clientId },
    orderBy: { date: "desc" },
  });
  return versArtefacts(visites);
}
