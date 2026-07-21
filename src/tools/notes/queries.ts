import "server-only";
import { prisma } from "@/lib/db";
import type { ClientArtefact } from "@/lib/clients/types";
import { resumeNote, type NoteContenu } from "./model";

export interface NoteResume {
  id: string;
  titre: string;
  chantierId: string;
  affaireNom: string;
  clientNom: string;
  numeroWhy: string | null;
  partagee: boolean;
  auteur: string | null;
  resume: string;
  updatedAt: Date;
}

const INCLUDE_RESUME = {
  chantier: { select: { nom: true, client: { select: { nom: true } } } },
  createdBy: { select: { nom: true } },
} as const;

type NoteAvecResume = {
  id: string;
  titre: string;
  chantierId: string;
  numeroWhy: string | null;
  jetonPartage: string | null;
  contenu: unknown;
  updatedAt: Date;
  chantier: { nom: string; client: { nom: string } };
  createdBy: { nom: string } | null;
};

function versResume(n: NoteAvecResume): NoteResume {
  return {
    id: n.id,
    titre: n.titre,
    chantierId: n.chantierId,
    affaireNom: n.chantier.nom,
    clientNom: n.chantier.client.nom,
    numeroWhy: n.numeroWhy,
    partagee: n.jetonPartage != null,
    auteur: n.createdBy?.nom ?? null,
    resume: resumeNote(n.contenu as NoteContenu),
    updatedAt: n.updatedAt,
  };
}

/** Toutes les notes (index de l'outil), la plus récente d'abord. */
export async function listerNotes(): Promise<NoteResume[]> {
  const notes = await prisma.note.findMany({
    orderBy: { updatedAt: "desc" },
    include: INCLUDE_RESUME,
  });
  return notes.map(versResume);
}

/** Notes d'une affaire (section de la fiche affaire). */
export async function listerNotesAffaire(chantierId: string): Promise<NoteResume[]> {
  const notes = await prisma.note.findMany({
    where: { chantierId },
    orderBy: { updatedAt: "desc" },
    include: INCLUDE_RESUME,
  });
  return notes.map(versResume);
}

export interface NoteDetail {
  id: string;
  titre: string;
  contenu: NoteContenu;
  version: number;
  jetonPartage: string | null;
  chantierId: string;
  affaireNom: string;
  clientNom: string;
  numeroWhy: string | null;
  auteur: string | null;
  updatedAt: Date;
}

/** Une note complète pour l'éditeur / l'aperçu. */
export async function getNote(id: string): Promise<NoteDetail | null> {
  const n = await prisma.note.findUnique({
    where: { id },
    include: {
      chantier: { select: { nom: true, client: { select: { nom: true } } } },
      createdBy: { select: { nom: true } },
    },
  });
  if (!n) return null;
  return {
    id: n.id,
    titre: n.titre,
    contenu: (n.contenu as NoteContenu) ?? [],
    version: n.version,
    jetonPartage: n.jetonPartage,
    chantierId: n.chantierId,
    affaireNom: n.chantier.nom,
    clientNom: n.chantier.client.nom,
    numeroWhy: n.numeroWhy,
    auteur: n.createdBy?.nom ?? null,
    updatedAt: n.updatedAt,
  };
}

export interface NotePublique {
  id: string;
  titre: string;
  contenu: NoteContenu;
  jetonPartage: string;
  clientNom: string;
  updatedAt: Date;
}

/** Une note partagée, chargée UNIQUEMENT par jeton (route publique /n/[jeton]).
 *  Ne jamais exposer d'id interrogeable sans session. */
export async function getNotePublique(jeton: string): Promise<NotePublique | null> {
  if (!jeton || jeton.length < 16) return null;
  const n = await prisma.note.findUnique({
    where: { jetonPartage: jeton },
    include: { chantier: { select: { client: { select: { nom: true } } } } },
  });
  if (!n?.jetonPartage) return null;
  return {
    id: n.id,
    titre: n.titre,
    contenu: (n.contenu as NoteContenu) ?? [],
    jetonPartage: n.jetonPartage,
    clientNom: n.chantier.client.nom,
    updatedAt: n.updatedAt,
  };
}

/* --- Providers fiches client / affaire ---------------------------------------- */

function versArtefacts(
  notes: { id: string; titre: string; numeroWhy: string | null; contenu: unknown; updatedAt: Date }[],
): ClientArtefact[] {
  return notes.map((n) => ({
    id: n.id,
    titre: n.titre,
    href: `/outils/notes/${n.id}`,
    numeroWhy: n.numeroWhy,
    updatedAt: n.updatedAt,
    resume: resumeNote(n.contenu as NoteContenu),
  }));
}

/** Provider fiche affaire : notes rattachées à ce chantier. */
export async function listerPourChantier(chantierId: string): Promise<ClientArtefact[]> {
  const notes = await prisma.note.findMany({
    where: { chantierId },
    orderBy: { updatedAt: "desc" },
  });
  return versArtefacts(notes);
}

/** Provider fiche client : notes rattachées à ce client. */
export async function listerPourClient(clientId: string): Promise<ClientArtefact[]> {
  const notes = await prisma.note.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
  });
  return versArtefacts(notes);
}
