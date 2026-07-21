// Couche données du serveur MCP DumTools.
//
// Réutilise la logique métier de l'application (dérivation liste↔points,
// affectation auto, réconciliation modules, recommandation d'automate) et le
// singleton Prisma, mais SANS passer par queries.ts / actions.ts / providers.ts
// (ceux-ci importent "server-only" / next-auth / next-cache → inutilisables hors
// runtime Next). Les fonctions BDD triviales sont donc réimplémentées ici, en
// rappelant les mêmes helpers purs pour garantir une cohérence stricte avec
// l'éditeur.
import { createHash, randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";
import type { EtatAffaire, BesoinArmoire } from "../src/generated/prisma/enums";
import {
  defaultProject,
  isCommunicationType,
  isIntegratedControllerType,
  type Module,
  type Point,
  type Project,
} from "../src/tools/affectation-es/model";
import { pointsToRows, syncPoints } from "../src/tools/affectation-es/derivation";

/* --- Auteur des écritures MCP ------------------------------------------------
 * Le serveur MCP connaît l'utilisateur (jeton OAuth → AsyncLocalStorage) mais
 * data.mts ne peut pas l'importer sans cycle : server.mts branche ici sa
 * fonction de résolution au démarrage. Sert à tracer `updatedById` (fil
 * d'activité de l'accueil) — comme le font les server actions côté web.
 */
let resoudreActeur: (() => string | null) | null = null;

export function brancherActeur(fn: () => string | null): void {
  resoudreActeur = fn;
}

/** Champ d'auteur à fusionner dans un `data` d'écriture. Vide si l'acteur est
 *  inconnu : on n'écrase JAMAIS un auteur déjà enregistré par un null. */
function parActeur(): { updatedById?: string } {
  const id = resoudreActeur?.() ?? null;
  return id ? { updatedById: id } : {};
}

import { affecterAuto, reconcilierModules } from "../src/tools/affectation-es/affectation-auto";
import { calculerBesoin, proposerAutomates, type Besoin, type Proposition } from "../src/tools/affectation-es/reco-automate";
import { getCatalogue } from "../src/tools/affectation-es/catalogue-queries";
import { moduleDef, moduleFieldsFromDef, type Catalogue } from "../src/tools/affectation-es/catalogue";
import { emptyIo, type IoType, type PointRow } from "../src/tools/liste-points/model";
import { formatTaille } from "../src/tools/documents/model";
import { extraireTexte, resumeNote, type NoteContenu } from "../src/tools/notes/model";
import { slugsTags, slugTag } from "../src/tools/wiki/model";
import { blocsVersMarkdown, markdownVersBlocs } from "./notes-markdown.mts";

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

/**
 * Résout un numéro Why vers l'id de l'Affaire (Chantier), en créant l'affaire au
 * besoin (upsert par numeroWhy). Miroir de resoudreChantierId (lib/chantiers/queries
 * est "server-only") : garantit que les projets créés/modifiés via MCP sont
 * rattachés à leur affaire (visibles sur le tableau de bord multi-automate).
 * Retourne null sans numéro Why ou sans client. N'écrase jamais une affaire existante.
 */
export async function resolveChantierId(
  numeroWhy: string | null | undefined,
  clientId: string | null | undefined,
  nomFallback: string,
): Promise<string | null> {
  const why = (numeroWhy ?? "").trim();
  if (!why || !clientId) return null;
  const c = await prisma.chantier.upsert({
    where: { numeroWhy: why },
    update: {},
    create: { numeroWhy: why, nom: nomFallback.trim() || why, clientId, ...parActeur() },
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
      // Artefacts vivants (projets GTB + documents) : robuste au retrait de la
      // table legacy PointsList prévu en Phase 5.2.
      _count: { select: { affectations: true, documents: true } },
    },
  });
  return clients.map((c) => ({
    id: c.id,
    nom: c.nom,
    updatedAt: c.updatedAt.toISOString(),
    nbRealisations: c._count.affectations + c._count.documents,
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
 * l'agrégation multi-outils de providers.ts (aujourd'hui : projets GTB +
 * documents GED). Ajouter un futur outil = ajouter sa requête ici.
 */
export async function getClient(id: string): Promise<ClientDetail | null> {
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, nom: true } });
  if (!client) return null;
  const [projets, docs] = await Promise.all([
    prisma.affectationProjet.findMany({ where: { clientId: id }, orderBy: { updatedAt: "desc" } }),
    prisma.document.findMany({ where: { clientId: id }, orderBy: { updatedAt: "desc" } }),
  ]);
  const realisations: ClientRealisation[] = [
    ...projets.map((p) => {
      const data = (p.data as unknown as Project) ?? null;
      const m = nbModules(data);
      return {
        id: p.id,
        titre: p.nom,
        numeroWhy: p.numeroWhy,
        updatedAt: p.updatedAt.toISOString(),
        resume: `${m} module${m > 1 ? "s" : ""} · ${nbPoints(data)} E/S`,
      };
    }),
    ...docs.map((d) => ({
      id: d.id,
      titre: d.nom,
      numeroWhy: d.numeroWhy,
      updatedAt: d.updatedAt.toISOString(),
      resume: `${d.categorie} · ${formatTaille(d.taille)}`,
    })),
    // Tri par date décroissante (ISO → tri lexicographique correct).
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  const clientId = await resolveClientId(clientNom);
  const numeroWhy = input.numeroWhy?.trim() || null;
  // Affaire-first : un projet GTB doit être rattaché à une affaire (pas d'orphelin,
  // même via MCP). L'affaire est retrouvée/créée par (client + n° Why).
  const chantierId = await resolveChantierId(numeroWhy, clientId, project.name);
  if (!chantierId) {
    throw new Error(
      "Un projet GTB doit être rattaché à une affaire : fournis clientNom ET numeroWhy " +
        "(l'affaire est créée/retrouvée automatiquement), ou crée l'affaire d'abord " +
        "avec dumtools_create_affaire.",
    );
  }
  const doc = await prisma.affectationProjet.create({
    data: {
      nom: project.name,
      clientNom,
      clientId,
      numeroWhy,
      chantierId,
      createdById,
      updatedById: createdById,
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
  const row = await prisma.affectationProjet.findUnique({
    where: { id },
    select: { data: true, nom: true, clientId: true, numeroWhy: true },
  });
  if (!row) return null;
  const project = normaliserProjet(row.data as unknown as Project);
  if (input.nom !== undefined) project.name = input.nom.trim() || "Sans titre";
  if (input.header !== undefined) project.header = input.header;
  if (input.document_title !== undefined) project.document_title = input.document_title;
  if (input.version !== undefined) project.version = input.version;

  const dbUpdate: Prisma.AffectationProjetUncheckedUpdateInput = { data: asJson(project) };
  // Valeurs effectives (existantes sauf si modifiées) pour re-résoudre l'affaire.
  let clientId = row.clientId;
  let numeroWhy = row.numeroWhy;
  const nom = input.nom !== undefined ? project.name : row.nom;
  if (input.nom !== undefined) dbUpdate.nom = project.name;
  if (input.clientNom !== undefined) {
    clientId = await resolveClientId(input.clientNom);
    dbUpdate.clientNom = input.clientNom;
    dbUpdate.clientId = clientId;
  }
  if (input.numeroWhy !== undefined) {
    numeroWhy = input.numeroWhy.trim() || null;
    dbUpdate.numeroWhy = numeroWhy;
  }
  // Re-rattache à l'affaire si l'identité (client / n° Why) a changé.
  if (input.clientNom !== undefined || input.numeroWhy !== undefined) {
    dbUpdate.chantierId = await resolveChantierId(numeroWhy, clientId, nom);
  }

  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: { ...dbUpdate, ...parActeur() },
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
    data: { data: asJson(project), ...parActeur() },
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
    data: { data: asJson(project), ...parActeur() },
    select: { updatedAt: true },
  });
  return { updatedAt: doc.updatedAt.toISOString(), modules: project.modules.length };
}

/** Prochain numéro de module d'extension (miroir de nextIoModuleNumber de l'éditeur). */
function nextIoModuleNumber(modules: Module[]): number {
  const nums = (modules ?? [])
    .filter((m) => !isCommunicationType(m) && !isIntegratedControllerType(m))
    .map((m) => Number(m.number) || 0)
    .filter((n) => n > 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Ajoute un module d'extension / de communication au projet puis ré-affecte
 * automatiquement les points aux bornes — exactement le geste « Ajouter un module »
 * de l'éditeur (buildModule via catalogue + nextIoModuleNumber), suivi d'affecterAuto
 * (comme setProjectController). Le module intégré de l'automate n'est pas concerné
 * (il vient de l'automate, cf. dumtools_set_project_controller).
 */
export async function addProjectModule(
  id: string,
  type: string,
): Promise<{ updatedAt: string; modules: number; module: { number: number; type: string } } | null> {
  const project = await loadProject(id);
  if (!project) return null;
  const catalogue = await getCatalogue();
  const def = moduleDef(catalogue, type);
  // Types ajoutables = ceux proposés par l'onglet Modules de l'éditeur (hors
  // accessoires type écran, et hors automates intégrés).
  if (!def || def.categorie === "accessoire") {
    const dispo = catalogue.modules
      .filter((m) => m.categorie !== "accessoire")
      .map((m) => m.type);
    throw new Error(
      `Type de module « ${type} » inconnu. Types ajoutables : ${dispo.join(", ")} ` +
        "(voir dumtools_list_materiel). Pour l'automate lui-même, utiliser dumtools_set_project_controller.",
    );
  }
  const num = nextIoModuleNumber(project.modules ?? []);
  const module: Module = { number: num, type: def.type, ...moduleFieldsFromDef(def) };
  project.modules = [...(project.modules ?? []), module];
  project.points = affecterAuto(project);
  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: { data: asJson(project), ...parActeur() },
    select: { updatedAt: true },
  });
  return {
    updatedAt: doc.updatedAt.toISOString(),
    modules: project.modules.length,
    module: { number: module.number, type: module.type },
  };
}

/**
 * Retire un module d'un projet (par son numéro) puis ré-affecte automatiquement
 * les points aux bornes restantes — geste « supprimer un module » de l'éditeur,
 * suivi d'affecterAuto. Refuse de retirer le module intégré de l'automate (n°0) :
 * celui-ci vient de l'automate → passer par dumtools_set_project_controller.
 */
export async function removeProjectModule(
  id: string,
  number: number,
): Promise<{ updatedAt: string; modules: number; removed: { number: number; type: string } } | null> {
  const project = await loadProject(id);
  if (!project) return null;
  const modules = project.modules ?? [];
  const cible = modules.find((m) => Number(m.number) === Number(number));
  if (!cible) {
    const dispo = modules.map((m) => m.number).join(", ") || "aucun";
    throw new Error(
      `Aucun module n°${number} dans ce projet. Modules présents : ${dispo} ` +
        "(voir dumtools_get_project).",
    );
  }
  if (isIntegratedControllerType(cible)) {
    throw new Error(
      `Le module n°${number} correspond aux E/S intégrées de l'automate (${cible.type}) : ` +
        "il ne se retire pas directement — changer d'automate avec dumtools_set_project_controller.",
    );
  }
  project.modules = modules.filter((m) => Number(m.number) !== Number(number));
  project.points = affecterAuto(project);
  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: { data: asJson(project), ...parActeur() },
    select: { updatedAt: true },
  });
  return {
    updatedAt: doc.updatedAt.toISOString(),
    modules: project.modules.length,
    removed: { number: Number(cible.number), type: cible.type },
  };
}

/** Valeurs d'alimentation acceptées (miroir du Select de l'éditeur). */
export type PowerSupply = "none" | "integrated" | "230V";

/**
 * Définit l'alimentation du projet (bloc alim. accolé à l'automate dans le
 * document) : « none » (aucune), « integrated » (24 VAC/DC, ECY-PS24) ou
 * « 230V » (100–240 VAC, ECY-PS100-240). N'impacte pas l'affectation des E/S.
 */
export async function setProjectPower(
  id: string,
  power: PowerSupply,
): Promise<{ updatedAt: string; power_supply: PowerSupply } | null> {
  const project = await loadProject(id);
  if (!project) return null;
  project.power_supply = power;
  const doc = await prisma.affectationProjet.update({
    where: { id },
    data: { data: asJson(project), ...parActeur() },
    select: { updatedAt: true },
  });
  return { updatedAt: doc.updatedAt.toISOString(), power_supply: power };
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

// --- Affaires (Chantier) : 2e pivot, regroupe N automates -------------------

export interface AffaireResume {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  besoinArmoire: BesoinArmoire | null;
  clientNom: string;
  updatedAt: string;
  nbAutomates: number;
}

/** Tableau de bord des affaires (de la plus récemment modifiée à la plus ancienne). */
export async function listAffaires(): Promise<AffaireResume[]> {
  const affaires = await prisma.chantier.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      nom: true,
      numeroWhy: true,
      etat: true,
      besoinArmoire: true,
      updatedAt: true,
      client: { select: { nom: true } },
      _count: { select: { affectations: true } },
    },
  });
  return affaires.map((a) => ({
    id: a.id,
    nom: a.nom,
    numeroWhy: a.numeroWhy,
    etat: a.etat,
    besoinArmoire: a.besoinArmoire,
    clientNom: a.client.nom,
    updatedAt: a.updatedAt.toISOString(),
    nbAutomates: a._count.affectations,
  }));
}

export interface AffaireAutomate {
  id: string;
  nom: string;
  controller: string;
  numeroWhy: string | null;
  nbPoints: number;
  nbModules: number;
  updatedAt: string;
}

export interface AffaireDocument {
  id: string;
  nom: string;
  categorie: string;
  taille: string;
  statutSync: string;
  createdAt: string;
}

export interface AffaireNote {
  id: string;
  titre: string;
  resume: string;
  partagee: boolean;
  updatedAt: string;
}

export interface AffaireComplete {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  besoinArmoire: BesoinArmoire | null;
  clientId: string;
  clientNom: string;
  automates: AffaireAutomate[];
  documents: AffaireDocument[];
  notes: AffaireNote[];
}

/** Fiche affaire : automates (projets GTB) + documents (GED) + notes rattachés. */
export async function getAffaire(id: string): Promise<AffaireComplete | null> {
  const a = await prisma.chantier.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      numeroWhy: true,
      etat: true,
      besoinArmoire: true,
      clientId: true,
      client: { select: { nom: true } },
    },
  });
  if (!a) return null;
  const [projets, docs, notesBrutes] = await Promise.all([
    prisma.affectationProjet.findMany({ where: { chantierId: id }, orderBy: { updatedAt: "desc" } }),
    prisma.document.findMany({ where: { chantierId: id }, orderBy: { createdAt: "desc" } }),
    prisma.note.findMany({ where: { chantierId: id }, orderBy: { updatedAt: "desc" } }),
  ]);
  const automates: AffaireAutomate[] = projets.map((p) => {
    const data = (p.data as unknown as Project) ?? null;
    return {
      id: p.id,
      nom: p.nom,
      controller: data?.controller ?? "",
      numeroWhy: p.numeroWhy,
      nbPoints: nbPoints(data),
      nbModules: nbModules(data),
      updatedAt: p.updatedAt.toISOString(),
    };
  });
  const documents: AffaireDocument[] = docs.map((d) => ({
    id: d.id,
    nom: d.nom,
    categorie: d.categorie,
    taille: formatTaille(d.taille),
    statutSync: String(d.statutSync),
    createdAt: d.createdAt.toISOString(),
  }));
  const notes: AffaireNote[] = notesBrutes.map((n) => ({
    id: n.id,
    titre: n.titre,
    resume: resumeNote(n.contenu as NoteContenu),
    partagee: n.jetonPartage != null,
    updatedAt: n.updatedAt.toISOString(),
  }));
  return {
    id: a.id,
    nom: a.nom,
    numeroWhy: a.numeroWhy,
    etat: a.etat,
    besoinArmoire: a.besoinArmoire,
    clientId: a.clientId,
    clientNom: a.client.nom,
    automates,
    documents,
    notes,
  };
}

export interface CreateAffaireInput {
  nom: string;
  clientNom: string;
  numeroWhy?: string;
}

/** Crée une affaire rattachée à un client (miroir de creerAffaire). Le n° Why est
 *  unique : c'est la clé qui rattachera automatiquement les projets de même n° Why. */
export async function createAffaire(input: CreateAffaireInput): Promise<{ id: string }> {
  const nom = input.nom.trim();
  if (!nom) throw new Error("Nom de l'affaire requis.");
  const clientId = await resolveClientId(input.clientNom);
  if (!clientId) throw new Error("Client requis (clientNom) pour créer une affaire.");
  const numeroWhy = input.numeroWhy?.trim() || null;
  try {
    const a = await prisma.chantier.create({
      data: { nom, numeroWhy, clientId, ...parActeur() },
      select: { id: true },
    });
    return { id: a.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new Error("Une affaire existe déjà avec ce numéro Why.");
    throw e;
  }
}

export interface UpdateAffaireInput {
  nom?: string;
  clientNom?: string;
  numeroWhy?: string;
  etat?: EtatAffaire;
  besoinArmoire?: BesoinArmoire | null;
}

/**
 * Met à jour une affaire (identité + état + besoin armoire). Seuls les champs
 * fournis changent. Si l'identité (nom/client/n° Why) change, resynchronise la
 * dénormalisation portée par les automates rattachés (miroir de modifierAffaire).
 */
export async function updateAffaire(
  id: string,
  input: UpdateAffaireInput,
): Promise<{ updatedAt: string } | null> {
  const existing = await prisma.chantier.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;

  const data: Prisma.ChantierUncheckedUpdateInput = {};
  let identiteChange = false;
  if (input.nom !== undefined) {
    const n = input.nom.trim();
    if (!n) throw new Error("Nom de l'affaire requis.");
    data.nom = n;
    identiteChange = true;
  }
  if (input.clientNom !== undefined) {
    const cid = await resolveClientId(input.clientNom);
    if (!cid) throw new Error("Client requis.");
    data.clientId = cid;
    identiteChange = true;
  }
  if (input.numeroWhy !== undefined) {
    data.numeroWhy = input.numeroWhy.trim() || null;
    identiteChange = true;
  }
  if (input.etat !== undefined) data.etat = input.etat;
  if (input.besoinArmoire !== undefined) data.besoinArmoire = input.besoinArmoire;

  let updated: { updatedAt: Date; clientId: string; numeroWhy: string | null; client: { nom: string } };
  try {
    updated = await prisma.chantier.update({
      where: { id },
      data: { ...data, ...parActeur() },
      select: {
        updatedAt: true,
        clientId: true,
        numeroWhy: true,
        client: { select: { nom: true } },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new Error("Une affaire existe déjà avec ce numéro Why.");
    throw e;
  }

  // L'identité est dénormalisée sur les automates rattachés : resynchronisation.
  if (identiteChange) {
    await prisma.affectationProjet.updateMany({
      where: { chantierId: id },
      data: { clientId: updated.clientId, clientNom: updated.client.nom, numeroWhy: updated.numeroWhy },
    });
  }
  return { updatedAt: updated.updatedAt.toISOString() };
}

// --- Outil « Notes » ---------------------------------------------------------
// Les IA échangent du MARKDOWN ; la conversion vers/depuis les blocs BlockNote
// est dans ./notes-markdown.mts. Voir docs/NOTES.md pour le modèle.

/** URL publique d'une note partagée (l'app est exposée via le tunnel Cloudflare). */
function urlPubliqueNote(jeton: string): string {
  const base = (process.env.APP_URL ?? "https://dumtools.datagtb.com").replace(/\/$/, "");
  return `${base}/n/${jeton}`;
}

export interface NoteResumeMcp {
  id: string;
  titre: string;
  chantierId: string;
  affaireNom: string;
  clientNom: string;
  numeroWhy: string | null;
  partagee: boolean;
  auteur: string | null;
  resume: string;
  updatedAt: string;
}

/** Liste les notes (toutes, ou celles d'une affaire), la plus récente d'abord. */
export async function listNotes(chantierId?: string): Promise<NoteResumeMcp[]> {
  const notes = await prisma.note.findMany({
    where: chantierId ? { chantierId } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      chantier: { select: { nom: true, client: { select: { nom: true } } } },
      createdBy: { select: { nom: true } },
    },
  });
  return notes.map((n) => ({
    id: n.id,
    titre: n.titre,
    chantierId: n.chantierId,
    affaireNom: n.chantier.nom,
    clientNom: n.chantier.client.nom,
    numeroWhy: n.numeroWhy,
    partagee: n.jetonPartage != null,
    auteur: n.createdBy?.nom ?? null,
    resume: resumeNote(n.contenu as NoteContenu),
    updatedAt: n.updatedAt.toISOString(),
  }));
}

export interface NoteComplete {
  id: string;
  titre: string;
  /** Contenu de la note converti en markdown (blocs métier compris). */
  markdown: string;
  version: number;
  chantierId: string;
  affaireNom: string;
  clientNom: string;
  numeroWhy: string | null;
  urlPublique: string | null;
  auteur: string | null;
  updatedAt: string;
}

/** Une note complète, contenu rendu en markdown. */
export async function getNote(id: string): Promise<NoteComplete | null> {
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
    markdown: await blocsVersMarkdown((n.contenu as NoteContenu) ?? []),
    version: n.version,
    chantierId: n.chantierId,
    affaireNom: n.chantier.nom,
    clientNom: n.chantier.client.nom,
    numeroWhy: n.numeroWhy,
    urlPublique: n.jetonPartage ? urlPubliqueNote(n.jetonPartage) : null,
    auteur: n.createdBy?.nom ?? null,
    updatedAt: n.updatedAt.toISOString(),
  };
}

export interface CreateNoteInput {
  chantierId?: string;
  numeroWhy?: string;
  titre?: string;
  markdown?: string;
}

/** Crée une note rattachée à une affaire EXISTANTE (« affaire d'abord », même
 *  via MCP) : par chantierId ou par numeroWhy. */
export async function createNote(
  input: CreateNoteInput,
  createdById: string | null,
): Promise<{ id: string }> {
  const numeroWhy = input.numeroWhy?.trim();
  const affaire = input.chantierId
    ? await prisma.chantier.findUnique({
        where: { id: input.chantierId },
        select: { id: true, clientId: true, numeroWhy: true },
      })
    : numeroWhy
      ? await prisma.chantier.findUnique({
          where: { numeroWhy },
          select: { id: true, clientId: true, numeroWhy: true },
        })
      : null;
  if (!affaire) {
    throw new Error(
      "Une note doit être rattachée à une affaire existante : fournis chantierId ou numeroWhy " +
        "(voir dumtools_list_affaires ; créer l'affaire au besoin avec dumtools_create_affaire).",
    );
  }
  const contenu = input.markdown ? await markdownVersBlocs(input.markdown) : [];
  const note = await prisma.note.create({
    data: {
      titre: input.titre?.trim() || "Nouvelle note",
      contenu: asJson(contenu),
      chantierId: affaire.id,
      clientId: affaire.clientId,
      numeroWhy: affaire.numeroWhy,
      createdById,
      updatedById: createdById,
    },
    select: { id: true },
  });
  return { id: note.id };
}

export interface UpdateNoteInput {
  titre?: string;
  /** Remplace TOUT le contenu de la note (pas un patch). */
  markdown?: string;
}

/**
 * Met à jour une note avec la même anti-collision que l'éditeur web : l'écriture
 * est conditionnée à la version lue — si un collègue a sauvé entre-temps, rien
 * n'est écrit et l'appelant doit relire (dumtools_get_note) puis réappliquer.
 */
export async function updateNote(
  id: string,
  input: UpdateNoteInput,
): Promise<{ updatedAt: string; version: number } | null> {
  const courante = await prisma.note.findUnique({ where: { id }, select: { version: true } });
  if (!courante) return null;

  const data: Prisma.NoteUncheckedUpdateInput = { version: courante.version + 1 };
  if (input.titre !== undefined) data.titre = input.titre.trim() || "Sans titre";
  if (input.markdown !== undefined) data.contenu = asJson(await markdownVersBlocs(input.markdown));

  const res = await prisma.note.updateMany({
    where: { id, version: courante.version },
    data: { ...data, ...parActeur() },
  });
  if (res.count === 0) {
    throw new Error(
      "Conflit d'édition : la note a été modifiée entre-temps (collègue dans l'éditeur ?). " +
        "Relire avec dumtools_get_note puis réappliquer la modification.",
    );
  }
  const maj = await prisma.note.findUnique({ where: { id }, select: { updatedAt: true, version: true } });
  return { updatedAt: maj!.updatedAt.toISOString(), version: maj!.version };
}

/** Active/révoque le partage public d'une note (lien lecture seule, sans session). */
export async function setNotePartage(
  id: string,
  actif: boolean,
): Promise<{ urlPublique: string | null } | null> {
  const note = await prisma.note.findUnique({ where: { id }, select: { jetonPartage: true } });
  if (!note) return null;
  if (!actif) {
    await prisma.note.update({ where: { id }, data: { jetonPartage: null, ...parActeur() } });
    return { urlPublique: null };
  }
  // Idempotent : un lien déjà actif est conservé (ne pas invalider un lien envoyé).
  const jeton = note.jetonPartage ?? randomBytes(24).toString("base64url");
  if (!note.jetonPartage) {
    await prisma.note.update({ where: { id }, data: { jetonPartage: jeton, ...parActeur() } });
  }
  return { urlPublique: urlPubliqueNote(jeton) };
}

/** Supprime une note et purge ses médias du disque de la VM. */
export async function deleteNote(id: string): Promise<boolean> {
  const note = await prisma.note.findUnique({
    where: { id },
    select: { medias: { select: { fichier: true } } },
  });
  if (!note) return false;
  await Promise.all(note.medias.map((m) => rm(m.fichier, { force: true }).catch(() => {})));
  await prisma.note.delete({ where: { id } });
  return true;
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
 * Résout un jeton d'accès MCP en utilisateur (mode HTTP), comparé par hash
 * SHA-256, comptes actifs seulement. Deux familles de jetons :
 *  1. jetons OAuth par appareil (table McpToken — flux « connecteur perso ») ;
 *  2. jeton « legacy » unique du compte (User.mcpTokenHash, scripts/mcp-token.mts).
 * Retourne null si le jeton est absent, inconnu ou lié à un compte inactif.
 */
export async function resolveUserByToken(token: string | undefined): Promise<AuthUser | null> {
  const t = (token ?? "").trim();
  if (!t) return null;
  const hash = createHash("sha256").update(t).digest("hex");

  const viaOauth = await prisma.mcpToken.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      user: { select: { id: true, email: true, nom: true, role: true, actif: true } },
    },
  });
  if (viaOauth?.user.actif) {
    // Trace d'usage (asynchrone, sans bloquer la requête).
    prisma.mcpToken
      .update({ where: { id: viaOauth.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    const u = viaOauth.user;
    return { id: u.id, email: u.email, nom: u.nom, role: u.role };
  }

  const u = await prisma.user.findUnique({
    where: { mcpTokenHash: hash },
    select: { id: true, email: true, nom: true, role: true, actif: true },
  });
  if (!u || !u.actif) return null;
  return { id: u.id, email: u.email, nom: u.nom, role: u.role };
}

// --- Outil « Wiki » (base de connaissances interne) -------------------------
// NON rattaché à une affaire. Contenu = mêmes blocs BlockNote que les Notes →
// on réutilise la conversion markdown (notes-markdown.mts). Recherche = tsvector
// plein-texte Postgres (cf. migration outil_wiki). Tags gérés (couleur + sync),
// réimplémentés ici comme dans src/tools/wiki/actions.ts (server-only).

/** Extrait court pour les listes / résultats (résumé absent → début du texte). */
function apercuTexte(texte: string, max = 160): string {
  const t = (texte ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const PALETTE_TAGS_WIKI = [
  "#a855f7", "#2563eb", "#0d9488", "#ea580c", "#dc2626",
  "#65a30d", "#c026d3", "#0891b2", "#d97706", "#4f46e5",
];
function couleurTagWiki(nom: string): string {
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  return PALETTE_TAGS_WIKI[h % PALETTE_TAGS_WIKI.length];
}
/** Trim + non vides + dédup insensible à la casse (1er libellé rencontré gagne). */
function normaliserTagsWiki(noms: string[]): string[] {
  const vus = new Map<string, string>();
  for (const brut of noms ?? []) {
    const nom = brut.trim();
    if (!nom) continue;
    const cle = nom.toLowerCase();
    if (!vus.has(cle)) vus.set(cle, nom);
  }
  return [...vus.values()];
}
/** Aligne les WikiPageTag d'une page sur la liste de noms (upsert des tags manquants). */
async function synchroniserTagsWiki(pageId: string, noms: string[]): Promise<void> {
  const tags = await Promise.all(
    noms.map((nom) =>
      prisma.wikiTag.upsert({
        where: { nom },
        update: {},
        create: { nom, couleur: couleurTagWiki(nom) },
        select: { id: true },
      }),
    ),
  );
  const voulus = new Set(tags.map((t) => t.id));
  const existants = await prisma.wikiPageTag.findMany({ where: { pageId }, select: { tagId: true } });
  const actuels = new Set(existants.map((e) => e.tagId));
  const aAjouter = [...voulus].filter((id) => !actuels.has(id));
  const aRetirer = [...actuels].filter((id) => !voulus.has(id));
  if (aAjouter.length)
    await prisma.wikiPageTag.createMany({
      data: aAjouter.map((tagId) => ({ pageId, tagId })),
      skipDuplicates: true,
    });
  if (aRetirer.length)
    await prisma.wikiPageTag.deleteMany({ where: { pageId, tagId: { in: aRetirer } } });
}

/** Résout une rubrique par son slug OU son id. */
async function resolveRubrique(slugOuId: string): Promise<{ id: string } | null> {
  return prisma.wikiRubrique.findFirst({
    where: { OR: [{ id: slugOuId }, { slug: slugOuId }] },
    select: { id: true },
  });
}

const texteWiki = (resume: string, contenu: NoteContenu, tags: string[]) =>
  [resume, extraireTexte(contenu ?? [], 20_000), tags.join(" ")].filter(Boolean).join(" ");

export interface WikiRubriqueMcp {
  id: string;
  slug: string;
  nom: string;
  description: string;
  nbPages: number;
}

/** Liste les rubriques du wiki (ordre défini) avec le nombre de pages. */
export async function listWikiRubriques(): Promise<WikiRubriqueMcp[]> {
  const r = await prisma.wikiRubrique.findMany({
    orderBy: { ordre: "asc" },
    select: { id: true, slug: true, nom: true, description: true, _count: { select: { pages: true } } },
  });
  return r.map((x) => ({
    id: x.id,
    slug: x.slug,
    nom: x.nom,
    description: x.description,
    nbPages: x._count.pages,
  }));
}

export interface WikiPageResumeMcp {
  id: string;
  titre: string;
  rubriqueSlug: string;
  rubriqueNom: string;
  /** Page parente dans l'arborescence (null = à la racine de la rubrique). */
  parentId: string | null;
  resume: string;
  tags: string[];
  auteur: string | null;
  updatedAt: string;
}

/** Liste les pages (toutes, ou d'une rubrique par slug/id), la plus récente d'abord. */
export async function listWikiPages(rubrique?: string): Promise<WikiPageResumeMcp[]> {
  let where: { rubriqueId: string } | undefined;
  if (rubrique) {
    const rub = await resolveRubrique(rubrique);
    if (!rub)
      throw new Error(`Rubrique « ${rubrique} » introuvable (voir dumtools_list_wiki_rubriques).`);
    where = { rubriqueId: rub.id };
  }
  const pages = await prisma.wikiPage.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titre: true,
      resume: true,
      texte: true,
      parentId: true,
      updatedAt: true,
      rubrique: { select: { slug: true, nom: true } },
      createdBy: { select: { nom: true } },
      tags: { select: { tag: { select: { nom: true } } } },
    },
  });
  return pages.map((p) => ({
    id: p.id,
    titre: p.titre,
    rubriqueSlug: p.rubrique.slug,
    rubriqueNom: p.rubrique.nom,
    parentId: p.parentId,
    resume: p.resume.trim() || apercuTexte(p.texte),
    tags: p.tags.map((t) => t.tag.nom),
    auteur: p.createdBy?.nom ?? null,
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export interface WikiPageCompleteMcp {
  id: string;
  titre: string;
  resume: string;
  rubriqueSlug: string;
  rubriqueNom: string;
  /** Page parente dans l'arborescence (null = à la racine de la rubrique). */
  parentId: string | null;
  tags: string[];
  version: number;
  auteur: string | null;
  /** Contenu de la page converti en markdown (blocs métier compris). */
  markdown: string;
  updatedAt: string;
}

/** Une page complète, contenu rendu en markdown. */
export async function getWikiPage(id: string): Promise<WikiPageCompleteMcp | null> {
  const p = await prisma.wikiPage.findUnique({
    where: { id },
    include: {
      rubrique: { select: { slug: true, nom: true } },
      createdBy: { select: { nom: true } },
      tags: { select: { tag: { select: { nom: true } } } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    titre: p.titre,
    resume: p.resume,
    rubriqueSlug: p.rubrique.slug,
    rubriqueNom: p.rubrique.nom,
    parentId: p.parentId,
    tags: p.tags.map((t) => t.tag.nom),
    version: p.version,
    auteur: p.createdBy?.nom ?? null,
    markdown: await blocsVersMarkdown((p.contenu as NoteContenu) ?? []),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export interface WikiResultatMcp {
  id: string;
  titre: string;
  rubriqueSlug: string;
  rubriqueNom: string;
  resume: string;
  updatedAt: string;
}

export interface SearchWikiFiltres {
  /** La page doit porter TOUS ces tags (noms OU slugs — normalisés côté serveur). */
  tagsEt?: string[];
  /** La page doit porter AU MOINS UN de ces tags. */
  tagsOu?: string[];
  /** La page ne doit porter AUCUN de ces tags. */
  tagsSauf?: string[];
  /** Restreindre à une rubrique (slug ou id). */
  rubrique?: string;
}

/** Slugs de tags normalisés et dédupliqués (accepte libellés OU slugs). */
function slugsFiltreWiki(v?: string[]): string[] {
  return [...new Set((v ?? []).map(slugTag).filter(Boolean))];
}

/**
 * Recherche à facettes classée par pertinence (tsvector « french »).
 * Les tags sont une facette STRUCTURÉE (ET/OU/SANS sur WikiPage.tagSlugs, index
 * GIN), combinée au match plein-texte. Sans texte ni facette → []. Cf.
 * src/tools/wiki/queries.ts (même moteur côté application).
 */
export async function searchWiki(
  q: string,
  filtres: SearchWikiFiltres = {},
): Promise<WikiResultatMcp[]> {
  const requete = (q ?? "").trim();
  const avecTexte = requete.length >= 2;

  const tagsEt = slugsFiltreWiki(filtres.tagsEt);
  const tagsOu = slugsFiltreWiki(filtres.tagsOu);
  const tagsSauf = slugsFiltreWiki(filtres.tagsSauf);

  let rubriqueId: string | undefined;
  if (filtres.rubrique) {
    const rub = await resolveRubrique(filtres.rubrique);
    if (!rub)
      throw new Error(`Rubrique « ${filtres.rubrique} » introuvable (voir dumtools_list_wiki_rubriques).`);
    rubriqueId = rub.id;
  }

  const clauses: Prisma.Sql[] = [];
  if (avecTexte)
    clauses.push(Prisma.sql`p."recherche" @@ websearch_to_tsquery('french', ${requete})`);
  if (tagsEt.length) clauses.push(Prisma.sql`p."tagSlugs" @> ${tagsEt}::text[]`);
  if (tagsOu.length) clauses.push(Prisma.sql`p."tagSlugs" && ${tagsOu}::text[]`);
  if (tagsSauf.length) clauses.push(Prisma.sql`NOT (p."tagSlugs" && ${tagsSauf}::text[])`);
  if (rubriqueId) clauses.push(Prisma.sql`p."rubriqueId" = ${rubriqueId}`);
  if (clauses.length === 0) return [];

  const where = Prisma.join(clauses, " AND ");
  const ordre = avecTexte
    ? Prisma.sql`ts_rank(p."recherche", websearch_to_tsquery('french', ${requete})) DESC, p."updatedAt" DESC`
    : Prisma.sql`p."updatedAt" DESC`;

  const rows = await prisma.$queryRaw<
    { id: string; titre: string; rubriqueSlug: string; rubriqueNom: string; resume: string; texte: string; updatedAt: Date }[]
  >`
    SELECT p.id, p.titre, p.resume, p."texte",
           r.slug AS "rubriqueSlug", r.nom AS "rubriqueNom", p."updatedAt"
    FROM "WikiPage" p JOIN "WikiRubrique" r ON r.id = p."rubriqueId"
    WHERE ${where}
    ORDER BY ${ordre}
    LIMIT 30`;
  return rows.map((r) => ({
    id: r.id,
    titre: r.titre,
    rubriqueSlug: r.rubriqueSlug,
    rubriqueNom: r.rubriqueNom,
    resume: (r.resume ?? "").trim() || apercuTexte(r.texte),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export interface CreateWikiPageInput {
  rubrique: string;
  titre?: string;
  resume?: string;
  markdown?: string;
  tags?: string[];
  /** Ranger la nouvelle page SOUS une page existante (sous-page). Doit être dans
   *  la même rubrique. Omis / null = à la racine de la rubrique. */
  parentId?: string | null;
}

/** Crée une page dans une rubrique (par slug ou id). Contenu initial en markdown. */
export async function createWikiPage(
  input: CreateWikiPageInput,
  createdById: string | null,
): Promise<{ id: string }> {
  const rub = await resolveRubrique(input.rubrique);
  if (!rub)
    throw new Error(
      `Rubrique « ${input.rubrique} » introuvable : fournis un slug ou un id valide ` +
        "(voir dumtools_list_wiki_rubriques).",
    );

  // Sous-page : le parent doit exister ET être dans la même rubrique.
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.wikiPage.findUnique({
      where: { id: input.parentId },
      select: { rubriqueId: true },
    });
    if (!parent)
      throw new Error(`Page parente « ${input.parentId} » introuvable (voir dumtools_list_wiki_pages).`);
    if (parent.rubriqueId !== rub.id)
      throw new Error("La page parente doit appartenir à la même rubrique que la nouvelle page.");
    parentId = input.parentId;
  }
  const ordreAgg = await prisma.wikiPage.aggregate({
    where: { rubriqueId: rub.id, parentId },
    _max: { ordre: true },
  });

  const contenu = input.markdown ? await markdownVersBlocs(input.markdown) : [];
  const resume = input.resume?.trim() ?? "";
  const tags = normaliserTagsWiki(input.tags ?? []);
  const page = await prisma.wikiPage.create({
    data: {
      rubriqueId: rub.id,
      parentId,
      ordre: (ordreAgg._max.ordre ?? -1) + 1,
      titre: input.titre?.trim() || "Nouvelle page",
      resume,
      contenu: asJson(contenu),
      texte: texteWiki(resume, contenu, tags),
      tagSlugs: slugsTags(tags),
      createdById,
      updatedById: createdById,
    },
    select: { id: true },
  });
  await synchroniserTagsWiki(page.id, tags);
  return { id: page.id };
}

export interface UpdateWikiPageInput {
  titre?: string;
  resume?: string;
  /** Remplace TOUT le contenu (pas un patch). */
  markdown?: string;
  /** Déplacer la page vers une autre rubrique (slug ou id). */
  rubrique?: string;
  /** Remplace la liste des tags. */
  tags?: string[];
}

/**
 * Met à jour une page avec la même anti-collision que l'éditeur web : écriture
 * conditionnée à la version lue — si un collègue a sauvé entre-temps, rien n'est
 * écrit et l'appelant doit relire (dumtools_get_wiki_page) puis réappliquer.
 * Recompose toujours le texte de recherche (résumé + contenu + tags).
 */
export async function updateWikiPage(
  id: string,
  input: UpdateWikiPageInput,
): Promise<{ updatedAt: string; version: number } | null> {
  const courante = await prisma.wikiPage.findUnique({
    where: { id },
    select: { version: true, contenu: true, resume: true },
  });
  if (!courante) return null;

  const contenu: NoteContenu =
    input.markdown !== undefined
      ? await markdownVersBlocs(input.markdown)
      : ((courante.contenu as NoteContenu) ?? []);
  const resume = input.resume !== undefined ? input.resume.trim() : courante.resume;
  const tags =
    input.tags !== undefined
      ? normaliserTagsWiki(input.tags)
      : (await prisma.wikiPageTag.findMany({ where: { pageId: id }, select: { tag: { select: { nom: true } } } }))
          .map((e) => e.tag.nom);

  const data: Prisma.WikiPageUncheckedUpdateInput = {
    version: courante.version + 1,
    resume,
    texte: texteWiki(resume, contenu, tags),
    // Facette structurée : resynchronisée à chaque save (idem éditeur web).
    tagSlugs: slugsTags(tags),
  };
  if (input.titre !== undefined) data.titre = input.titre.trim() || "Sans titre";
  if (input.markdown !== undefined) data.contenu = asJson(contenu);
  if (input.rubrique !== undefined) {
    const rub = await resolveRubrique(input.rubrique);
    if (!rub)
      throw new Error(`Rubrique « ${input.rubrique} » introuvable (voir dumtools_list_wiki_rubriques).`);
    data.rubriqueId = rub.id;
  }

  const res = await prisma.wikiPage.updateMany({
    where: { id, version: courante.version },
    data: { ...data, ...parActeur() },
  });
  if (res.count === 0) {
    throw new Error(
      "Conflit d'édition : la page a été modifiée entre-temps (collègue dans l'éditeur ?). " +
        "Relire avec dumtools_get_wiki_page puis réappliquer.",
    );
  }
  if (input.tags !== undefined) await synchroniserTagsWiki(id, tags);
  const maj = await prisma.wikiPage.findUnique({ where: { id }, select: { updatedAt: true, version: true } });
  return { updatedAt: maj!.updatedAt.toISOString(), version: maj!.version };
}

/** Supprime une page et purge ses médias du disque de la VM. */
export async function deleteWikiPage(id: string): Promise<boolean> {
  const page = await prisma.wikiPage.findUnique({
    where: { id },
    select: { medias: { select: { fichier: true } } },
  });
  if (!page) return false;
  await Promise.all(page.medias.map((m) => rm(m.fichier, { force: true }).catch(() => {})));
  await prisma.wikiPage.delete({ where: { id } });
  return true;
}
