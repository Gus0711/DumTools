import "server-only";
import { prisma } from "@/lib/db";
import type { Project } from "./model";
import { pointsToRows } from "./derivation";
import type { ClientArtefact } from "@/lib/clients/types";

/** Rétro-compat : dérive `rows` (liste) depuis `points` pour les anciens projets. */
function normaliserProjet(project: Project): Project {
  if ((!project.rows || project.rows.length === 0) && (project.points?.length ?? 0) > 0) {
    return { ...project, rows: pointsToRows(project.points) };
  }
  if (!project.rows) return { ...project, rows: [] };
  return project;
}

const nbPoints = (data: Project | null) =>
  Array.isArray(data?.points) ? data.points.filter((pt) => pt.active).length : 0;
const nbModules = (data: Project | null) =>
  Array.isArray(data?.modules) ? data.modules.length : 0;

export interface ProjetResume {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string | null;
  updatedAt: Date;
  auteur: string | null;
  nbPoints: number;
  nbModules: number;
  /** Non rattaché à une affaire (chantierId null) — invisible de toute fiche
   *  Affaire/Client : cet index est le seul endroit d'où le récupérer. */
  orphelin: boolean;
}

export async function listerProjets(): Promise<ProjetResume[]> {
  const projets = await prisma.affectationProjet.findMany({
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: { nom: true } } },
  });
  return projets.map((p) => {
    const data = (p.data as unknown as Project) ?? null;
    return {
      id: p.id,
      nom: p.nom,
      clientNom: p.clientNom,
      numeroWhy: p.numeroWhy,
      updatedAt: p.updatedAt,
      auteur: p.createdBy?.nom ?? null,
      nbPoints: nbPoints(data),
      nbModules: nbModules(data),
      orphelin: p.chantierId == null,
    };
  });
}

/** Nombre de projets non rattachés à une affaire (0 = rien à rattraper). */
export async function compterProjetsOrphelins(): Promise<number> {
  return prisma.affectationProjet.count({ where: { chantierId: null } });
}

/** Transforme des projets d'affectation en artefacts (fiche client / affaire). */
function projetsToArtefacts(
  projets: { id: string; nom: string; numeroWhy: string | null; updatedAt: Date; data: unknown }[],
): ClientArtefact[] {
  return projets.map((p) => {
    const data = (p.data as unknown as Project) ?? null;
    const m = nbModules(data);
    return {
      id: p.id,
      titre: p.nom,
      href: `/outils/affectation-es/${p.id}`,
      numeroWhy: p.numeroWhy,
      updatedAt: p.updatedAt,
      resume: `${m} module${m > 1 ? "s" : ""} · ${nbPoints(data)} E/S`,
    };
  });
}

/** Provider de fiche client : projets d'affectation rattachés à ce client. */
export async function listerPourClient(clientId: string): Promise<ClientArtefact[]> {
  const projets = await prisma.affectationProjet.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
  });
  return projetsToArtefacts(projets);
}

/** Provider de fiche affaire : projets d'affectation rattachés à ce chantier. */
export async function listerPourChantier(chantierId: string): Promise<ClientArtefact[]> {
  const projets = await prisma.affectationProjet.findMany({
    where: { chantierId },
    orderBy: { updatedAt: "desc" },
  });
  return projetsToArtefacts(projets);
}

/** Avancement de mise en service d'un projet (comptage des statuts de test). */
export interface AvancementTests {
  ok: number;
  defaut: number;
  nonTeste: number;
  total: number;
}

/** Résumé riche d'un projet GTB pour le tableau dédié de la fiche affaire. */
export interface ProjetAffaireResume {
  id: string;
  nom: string;
  controller: string;
  nbPoints: number;
  nbModules: number;
  tests: AvancementTests;
  updatedAt: Date;
  href: string;
}

/** Projets GTB (automates) d'une affaire, vue détaillée (E/S + mise en service). */
export async function listerProjetsAffaire(chantierId: string): Promise<ProjetAffaireResume[]> {
  const projets = await prisma.affectationProjet.findMany({
    where: { chantierId },
    orderBy: { updatedAt: "desc" },
  });
  return projets.map((p) => {
    const data = (p.data as unknown as Project) ?? null;
    const pts = Array.isArray(data?.points) ? data.points.filter((x) => x.active) : [];
    const tests: AvancementTests = { ok: 0, defaut: 0, nonTeste: 0, total: pts.length };
    for (const pt of pts) {
      if (pt.testStatus === "ok") tests.ok += 1;
      else if (pt.testStatus === "defaut") tests.defaut += 1;
      else tests.nonTeste += 1;
    }
    return {
      id: p.id,
      nom: p.nom,
      controller: data?.controller ?? "",
      nbPoints: pts.length,
      nbModules: nbModules(data),
      tests,
      updatedAt: p.updatedAt,
      href: `/outils/affectation-es/${p.id}`,
    };
  });
}

export interface ProjetComplet {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string;
  /** Affaire de rattachement (identification) — null si automate non rattaché. */
  chantierId: string | null;
  affaireNom: string | null;
  project: Project;
}

export async function getProjet(id: string): Promise<ProjetComplet | null> {
  const p = await prisma.affectationProjet.findUnique({
    where: { id },
    include: { chantier: { select: { nom: true } } },
  });
  if (!p) return null;
  return {
    id: p.id,
    nom: p.nom,
    clientNom: p.clientNom,
    numeroWhy: p.numeroWhy ?? "",
    chantierId: p.chantierId,
    affaireNom: p.chantier?.nom ?? null,
    project: normaliserProjet(p.data as unknown as Project),
  };
}

/** Référentiel client partagé (réutilise la table Client). */
export async function getClients(): Promise<string[]> {
  const clients = await prisma.client.findMany({
    orderBy: { nom: "asc" },
    select: { nom: true },
  });
  return clients.map((c) => c.nom);
}
