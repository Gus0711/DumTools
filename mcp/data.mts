// Couche données du serveur MCP DumTools.
//
// Réutilise la logique métier de l'application (dérivation liste↔points,
// affectation auto, réconciliation modules, recommandation d'automate) et le
// singleton Prisma, mais SANS passer par queries.ts / actions.ts / providers.ts
// (ceux-ci importent "server-only" / next-auth / next-cache → inutilisables hors
// runtime Next). Les fonctions BDD triviales sont donc réimplémentées ici, en
// rappelant les mêmes helpers purs pour garantir une cohérence stricte avec
// l'éditeur.
import { createHash } from "node:crypto";
import { prisma } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";
import {
  defaultProject,
  type Point,
  type Project,
} from "../src/tools/affectation-es/model";
import { pointsToRows, syncPoints } from "../src/tools/affectation-es/derivation";
import { affecterAuto, reconcilierModules } from "../src/tools/affectation-es/affectation-auto";
import { calculerBesoin, proposerAutomates, type Besoin, type Proposition } from "../src/tools/affectation-es/reco-automate";
import { getCatalogue } from "../src/tools/affectation-es/catalogue-queries";
import type { Catalogue } from "../src/tools/affectation-es/catalogue";
import { emptyIo, type IoType, type PointRow } from "../src/tools/liste-points/model";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

/** Ligne de saisie simplifiée exposée par le serveur MCP. */
export interface RowInput {
  /** id d'une ligne existante à conserver (issu de get_project) — sinon généré. */
  id?: string;
  kind?: "point" | "section";
  nom: string;
  /** Texte libre (points uniquement). */
  note?: string;
  /** Type d'E/S exclusif de la ligne (points uniquement). Requis pour un point. */
  type?: IoType;
  /** Signal électrique (facultatif ; défaut selon le type). */
  signal?: string;
}

/** Convertit la forme simplifiée en PointRow (1 ligne = 1 type d'E/S exclusif). */
export function buildRows(items: RowInput[]): PointRow[] {
  return items.map((it) => {
    const id = it.id?.trim() || uid();
    if (it.kind === "section") {
      return { id, kind: "section" as const, nom: it.nom };
    }
    const io = emptyIo();
    if (it.type) io[it.type] = 1;
    return {
      id,
      kind: "point" as const,
      nom: it.nom,
      note: it.note ?? "",
      io,
      signal: it.signal,
    };
  });
}

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;

/** Rétro-compat : dérive `rows` depuis `points` pour les anciens projets. */
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

const dateLabel = () =>
  new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

/**
 * Résout un nom de client vers un id du référentiel (upsert par nom).
 * Réimplémente resoudreClientId (lib/clients/queries.ts est "server-only").
 * Retourne null pour un nom vide (client libre non rattaché).
 */
export async function resolveClientId(nom: string): Promise<string | null> {
  const n = (nom ?? "").trim();
  if (!n) return null;
  const c = await prisma.client.upsert({
    where: { nom: n },
    update: {},
    create: { nom: n },
    select: { id: true },
  });
  return c.id;
}

// --- Lecture ----------------------------------------------------------------

export interface ProjetResume {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string | null;
  updatedAt: string;
  auteur: string | null;
  nbPoints: number;
  nbModules: number;
  controller: string;
}

export async function listProjects(): Promise<ProjetResume[]> {
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
      updatedAt: p.updatedAt.toISOString(),
      auteur: p.createdBy?.nom ?? null,
      nbPoints: nbPoints(data),
      nbModules: nbModules(data),
      controller: data?.controller ?? "",
    };
  });
}

export interface ProjetComplet {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string;
  updatedAt: string;
  auteur: string | null;
  project: Project;
}

export async function getProject(id: string): Promise<ProjetComplet | null> {
  const p = await prisma.affectationProjet.findUnique({
    where: { id },
    include: { createdBy: { select: { nom: true } } },
  });
  if (!p) return null;
  return {
    id: p.id,
    nom: p.nom,
    clientNom: p.clientNom,
    numeroWhy: p.numeroWhy ?? "",
    updatedAt: p.updatedAt.toISOString(),
    auteur: p.createdBy?.nom ?? null,
    project: normaliserProjet(p.data as unknown as Project),
  };
}

export interface ClientResume {
  id: string;
  nom: string;
  updatedAt: string;
  nbRealisations: number;
}

export async function listClients(): Promise<ClientResume[]> {
  const clients = await prisma.client.findMany({
    orderBy: { nom: "asc" },
    select: {
      id: true,
      nom: true,
      updatedAt: true,
      _count: { select: { pointsLists: true, affectations: true } },
    },
  });
  return clients.map((c) => ({
    id: c.id,
    nom: c.nom,
    updatedAt: c.updatedAt.toISOString(),
    nbRealisations: c._count.pointsLists + c._count.affectations,
  }));
}

export interface ClientRealisation {
  id: string;
  titre: string;
  numeroWhy: string | null;
  updatedAt: string;
  resume: string;
}

export interface ClientDetail {
  id: string;
  nom: string;
  realisations: ClientRealisation[];
}

/**
 * Fiche client : agrège les réalisations rattachées au client. Réimplémente
 * l'agrégation multi-outils de providers.ts (aujourd'hui un seul provider :
 * les projets d'affectation). Ajouter un futur outil = ajouter sa requête ici.
 */
export async function getClient(id: string): Promise<ClientDetail | null> {
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, nom: true } });
  if (!client) return null;
  const projets = await prisma.affectationProjet.findMany({
    where: { clientId: id },
    orderBy: { updatedAt: "desc" },
  });
  const realisations: ClientRealisation[] = projets.map((p) => {
    const data = (p.data as unknown as Project) ?? null;
    const m = nbModules(data);
    return {
      id: p.id,
      titre: p.nom,
      numeroWhy: p.numeroWhy,
      updatedAt: p.updatedAt.toISOString(),
      resume: `${m} module${m > 1 ? "s" : ""} · ${nbPoints(data)} E/S`,
    };
  });
  return { id: client.id, nom: client.nom, realisations };
}

export interface CatalogPoint {
  id: string;
  nom: string;
  type: string;
  signal: string | null;
}

export async function listCatalogPoints(): Promise<CatalogPoint[]> {
  const points = await prisma.pointCatalog.findMany({ orderBy: { nom: "asc" } });
  return points.map((p) => ({ id: p.id, nom: p.nom, type: p.type, signal: p.signal }));
}

export interface ModeleResume {
  id: string;
  nom: string;
  ordre: number;
  points: { nom: string; type: string }[];
}

export async function listModeles(): Promise<ModeleResume[]> {
  const modeles = await prisma.modele.findMany({ orderBy: [{ ordre: "asc" }, { nom: "asc" }] });
  return modeles.map((m) => ({
    id: m.id,
    nom: m.nom,
    ordre: m.ordre,
    points: (m.points as unknown as { nom: string; type: string }[]) ?? [],
  }));
}

export async function getMateriel(): Promise<Catalogue> {
  return getCatalogue();
}

// --- Recommandation d'automate ----------------------------------------------

export interface Recommandation {
  besoin: Besoin;
  propositions: Proposition[];
}

/** Reco depuis un projet existant (calcule le besoin sur ses points actifs). */
export async function recommendForProject(projectId: string): Promise<Recommandation | null> {
  const p = await getProject(projectId);
  if (!p) return null;
  const catalogue = await getCatalogue();
  const besoin = calculerBesoin(p.project);
  return { besoin, propositions: proposerAutomates(besoin, catalogue) };
}

/** Reco depuis un besoin saisi manuellement (entrées / sorties analogiques et TOR). */
export async function recommendForBesoin(besoin: Besoin): Promise<Recommandation> {
  const catalogue = await getCatalogue();
  return { besoin, propositions: proposerAutomates(besoin, catalogue) };
}

// --- Écriture ---------------------------------------------------------------

async function loadProject(id: string): Promise<Project | null> {
  const p = await prisma.affectationProjet.findUnique({ where: { id }, select: { data: true } });
  if (!p) return null;
  return normaliserProjet(p.data as unknown as Project);
}

export interface CreateProjectInput {
  nom?: string;
  clientNom?: string;
  numeroWhy?: string;
  header?: string;
}

export async function createProject(
  input: CreateProjectInput,
  createdById: string | null,
): Promise<{ id: string }> {
  const project = defaultProject(dateLabel());
  if (input.nom?.trim()) project.name = input.nom.trim();
  if (input.header?.trim()) project.header = input.header.trim();
  const clientNom = input.clientNom?.trim() ?? "";
  const doc = await prisma.affectationProjet.create({
    data: {
      nom: project.name,
      clientNom,
      clientId: await resolveClientId(clientNom),
      numeroWhy: input.numeroWhy?.trim() || null,
      createdById,
      data: asJson(project),
    },
    select: { id: true },
  });
  return { id: doc.id };
}

export interface UpdateMetaInput {
  nom?: string;
  clientNom?: string;
  numeroWhy?: string;
  header?: string;
  document_title?: string;
  version?: string;
}

export async function updateProjectMeta(
  id: string,
  input: UpdateMetaInput,
): Promise<{ updatedAt: string } | null> {
  const project = await loadProject(id);
  if (!project) return null;
  if (input.nom !== undefined) project.name = input.nom.trim() || "Sans titre";
  if (input.header !== undefined) project.header = input.header;
  if (input.document_title !== undefined) project.document_title = input.document_title;
  if (input.version !== undefined) project.version = input.version;

  const dbUpdate: Prisma.AffectationProjetUncheckedUpdateInput = { data: asJson(project) };
  if (input.nom !== undefined) dbUpdate.nom = project.name;
  if (input.clientNom !== undefined) {
    dbUpdate.clientNom = input.clientNom;
    dbUpdate.clientId = await resolveClientId(input.clientNom);
  }
  if (input.numeroWhy !== undefined) dbUpdate.numeroWhy = input.numeroWhy.trim() || null;

  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: dbUpdate,
    select: { updatedAt: true },
  });
  return { updatedAt: doc.updatedAt.toISOString() };
}

/**
 * Remplace la liste de points (rows), re-dérive les E/S physiques puis les
 * ré-affecte aux bornes — exactement la chaîne de l'éditeur
 * (syncPoints → affecterAuto). Préserve l'affectation/le suivi de test des
 * lignes conservées (réappariement par id).
 */
export async function updateProjectRows(
  id: string,
  rows: PointRow[],
): Promise<{ updatedAt: string; nbPoints: number } | null> {
  const project = await loadProject(id);
  if (!project) return null;
  project.rows = rows;
  project.points = syncPoints(rows, project.points ?? []);
  project.points = affecterAuto(project);
  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: { data: asJson(project) },
    select: { updatedAt: true },
  });
  return { updatedAt: doc.updatedAt.toISOString(), nbPoints: nbPoints(project) };
}

/**
 * Choisit l'automate : réconcilie les modules (remplace le module intégré n°0),
 * puis ré-affecte automatiquement les points aux bornes.
 */
export async function setProjectController(
  id: string,
  reference: string,
): Promise<{ updatedAt: string; modules: number } | null> {
  const project = await loadProject(id);
  if (!project) return null;
  const catalogue = await getCatalogue();
  project.controller = reference;
  project.modules = reconcilierModules(catalogue, reference, project.modules ?? []);
  project.points = affecterAuto(project);
  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: { data: asJson(project) },
    select: { updatedAt: true },
  });
  return { updatedAt: doc.updatedAt.toISOString(), modules: project.modules.length };
}

export async function deleteProject(id: string): Promise<boolean> {
  const existing = await prisma.affectationProjet.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;
  await prisma.affectationProjet.delete({ where: { id } });
  return true;
}

export async function upsertCatalogPoint(
  nom: string,
  type: IoType,
  signal: string | null,
): Promise<CatalogPoint> {
  const p = await prisma.pointCatalog.upsert({
    where: { nom: nom.trim() },
    update: { type, signal },
    create: { nom: nom.trim(), type, signal },
  });
  return { id: p.id, nom: p.nom, type: p.type, signal: p.signal };
}

// --- Utilisateur (attribution des écritures) --------------------------------

/** Résout l'id utilisateur pour créditer les créations (MCP_USER_EMAIL, mode stdio). */
export async function resolveMcpUserId(email: string | undefined): Promise<string | null> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return null;
  const u = await prisma.user.findUnique({ where: { email: e }, select: { id: true } });
  return u?.id ?? null;
}

export interface AuthUser {
  id: string;
  email: string;
  nom: string;
  role: string;
}

/**
 * Résout un jeton d'accès MCP en utilisateur (mode HTTP). Le jeton est comparé
 * par son hash SHA-256 (mcpTokenHash) ; seuls les comptes actifs sont acceptés.
 * Retourne null si le jeton est absent, inconnu ou lié à un compte inactif.
 */
export async function resolveUserByToken(token: string | undefined): Promise<AuthUser | null> {
  const t = (token ?? "").trim();
  if (!t) return null;
  const hash = createHash("sha256").update(t).digest("hex");
  const u = await prisma.user.findUnique({
    where: { mcpTokenHash: hash },
    select: { id: true, email: true, nom: true, role: true, actif: true },
  });
  if (!u || !u.actif) return null;
  return { id: u.id, email: u.email, nom: u.nom, role: u.role };
}
