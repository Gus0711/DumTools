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
import {
  dateISOLocale,
  normaliserData,
  reservesOuvertes,
  resumeVisite,
  statsVisite,
  titreAffiche,
  TYPE_LABEL,
  type Gravite,
  type StatutItem,
  type TypeMedia,
  type TypeVisite,
} from "../src/tools/visites/model";
import { nouvelleVisite } from "../src/tools/visites/modeles-defaut";
import { blocsVersMarkdown, markdownVersBlocs } from "./notes-markdown.mts";
import {
  getDevis as lireDevisApp,
  grilleCoefs,
  listerDevis,
  listerPourClient as devisPourClient,
  listerPrestations,
  rechercherArticles,
} from "../src/tools/devis/queries";
import * as noyauDevis from "../src/tools/devis/ecritures";
import {
  BASE_DEVIS,
  ETAT_DEVIS_LABEL,
  GENRE_LIGNE_LABEL,
  calculerDevis,
  coefApplicable,
  contenuTexteSimple,
  libelleDevis,
  pvDepuisDebourse,
  texteNu,
  type DevisComplet,
  type EtatDevis,
  type LigneCalculee,
  type LigneDevisVue,
  type TotauxDevis,
} from "../src/tools/devis/model";
import { partageActif } from "../src/lib/partage/model";
import { listerAssociations } from "../src/tools/magasin/queries";
import { bomAffaire } from "../src/tools/magasin/bom";
import {
  GENRE_TROU_LABEL,
  cleReferentiel,
  peutGererReferentiel,
  quantiteProposee,
} from "../src/tools/magasin/model";
import { enregistrerProduit as enregistrerProduitNoyau } from "../src/tools/magasin/ecritures";

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
  const [projets, docs, devis] = await Promise.all([
    prisma.affectationProjet.findMany({ where: { clientId: id }, orderBy: { updatedAt: "desc" } }),
    prisma.document.findMany({ where: { clientId: id }, orderBy: { updatedAt: "desc" } }),
    // Le provider de l'app (fiche client) : même titre et même résumé que l'écran.
    devisPourClient(id),
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
    ...devis.map((d) => ({
      id: d.id,
      titre: d.titre,
      numeroWhy: d.numeroWhy,
      updatedAt: new Date(d.updatedAt).toISOString(),
      resume: d.resume,
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

export interface AffaireVisite {
  id: string;
  titre: string;
  type: string;
  /** Date terrain, ISO AAAA-MM-JJ. */
  date: string;
  resume: string;
  reservesOuvertes: number;
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
  visites: AffaireVisite[];
  devis: AffaireDevis[];
}

export interface AffaireDevis {
  id: string;
  libelle: string;
  titre: string;
  etat: string;
  netHt: number | null;
  nbSansPrix: number;
  updatedAt: string;
}

/** Fiche affaire : automates (projets GTB) + documents (GED) + notes + visites + devis. */
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
  const [projets, docs, notesBrutes, visitesBrutes, devisBruts] = await Promise.all([
    prisma.affectationProjet.findMany({ where: { chantierId: id }, orderBy: { updatedAt: "desc" } }),
    prisma.document.findMany({ where: { chantierId: id }, orderBy: { createdAt: "desc" } }),
    prisma.note.findMany({ where: { chantierId: id }, orderBy: { updatedAt: "desc" } }),
    prisma.visite.findMany({ where: { chantierId: id }, orderBy: { date: "desc" } }),
    // Totaux calculés par le moteur (listerDevis) : la fiche ne peut pas
    // annoncer un montant que le devis dément.
    listerDevis({ chantierId: id }),
  ]);
  const devis: AffaireDevis[] = devisBruts.map((d) => ({
    id: d.id,
    libelle: libelleDevis(d.numero, d.revision),
    titre: d.titre,
    etat: d.etat,
    netHt: enEuros(d.netHtCents),
    nbSansPrix: d.nbSansPrix,
    updatedAt: d.updatedAt.toISOString(),
  }));
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
  const visites: AffaireVisite[] = visitesBrutes.map((v) => {
    const type = v.type as TypeVisite;
    const data = normaliserData(v.data);
    return {
      id: v.id,
      titre: titreAffiche({ titre: v.titre, type, date: v.date }),
      type,
      date: dateISOLocale(v.date),
      resume: resumeVisite(data),
      reservesOuvertes: statsVisite(data).reservesOuvertes,
    };
  });
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
    visites,
    devis,
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

// --- Outil « Visites de chantier » -------------------------------------------
// Une visite = un passage sur site (relevé avant chiffrage, suivi, réception,
// maintenance) avec sa checklist « pour ne rien oublier », ses RÉSERVES (punch
// list) et ses médias (photos, notes vocales).
//
// ⚠️ La saisie vit LOCALEMENT sur le téléphone (îlot offline, IndexedDB) jusqu'à
// la synchro : le MCP ne voit que l'état SYNCHRONISÉ — jamais une visite encore
// dans la poche de quelqu'un. Les helpers de lecture (normaliserData,
// titreAffiche, reservesOuvertes) sont ceux de l'app (src/tools/visites/model) :
// la règle de report d'une réserve d'une visite à la suivante n'a qu'une seule
// implémentation, partagée avec le snapshot terrain.

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

function jourValide(v: string, champ: string): string {
  if (!JOUR_RE.test(v.trim())) {
    throw new Error(`Date « ${v} » invalide pour ${champ} : format attendu AAAA-MM-JJ.`);
  }
  return v.trim();
}

const SELECT_AFFAIRE_REF = {
  id: true,
  nom: true,
  clientId: true,
  numeroWhy: true,
  client: { select: { nom: true } },
} as const;

/** Affaire visée par un chantierId OU un n° Why. Lecture seule : ne crée RIEN
 *  (contrairement à resolveChantierId) — une visite se rattache à une affaire
 *  qui existe, sinon on la laisse orpheline. */
async function affairePourRef(ref: { chantierId?: string; numeroWhy?: string }) {
  const numeroWhy = ref.numeroWhy?.trim();
  if (ref.chantierId) {
    return prisma.chantier.findUnique({ where: { id: ref.chantierId }, select: SELECT_AFFAIRE_REF });
  }
  if (numeroWhy) {
    return prisma.chantier.findUnique({ where: { numeroWhy }, select: SELECT_AFFAIRE_REF });
  }
  return null;
}

function affaireIntrouvable(ref: { chantierId?: string; numeroWhy?: string }): Error {
  const quoi = ref.chantierId ? `l'id « ${ref.chantierId} »` : `le n° Why « ${ref.numeroWhy} »`;
  return new Error(`Affaire introuvable pour ${quoi}. Vérifiez avec dumtools_list_affaires.`);
}

export interface VisiteResumeMcp {
  id: string;
  titre: string;
  type: TypeVisite;
  typeLibelle: string;
  /** Date terrain, ISO AAAA-MM-JJ. */
  date: string;
  chantierId: string | null;
  affaireNom: string | null;
  clientNom: string;
  numeroWhy: string | null;
  /** « 12/34 pts · 2 KO · 1 réserve · 5 photos ». */
  resume: string;
  reservesOuvertes: number;
  auteur: string | null;
  updatedAt: string;
}

export interface VisitesFiltre {
  chantierId?: string;
  numeroWhy?: string;
  type?: TypeVisite;
  /** Visites non rattachées à une affaire (relevés faits avant qu'elle existe). */
  sansAffaire?: boolean;
  depuis?: string;
  jusqua?: string;
  limit?: number;
}

/** Visites synchronisées, la plus récente d'abord. */
export async function listVisites(f: VisitesFiltre = {}): Promise<VisiteResumeMcp[]> {
  const where: Prisma.VisiteWhereInput = {};
  if (f.sansAffaire) {
    where.chantierId = null;
  } else if (f.chantierId || f.numeroWhy) {
    const affaire = await affairePourRef(f);
    if (!affaire) throw affaireIntrouvable(f);
    where.chantierId = affaire.id;
  }
  if (f.type) where.type = f.type;
  if (f.depuis || f.jusqua) {
    const date: Prisma.DateTimeFilter = {};
    if (f.depuis) date.gte = new Date(`${jourValide(f.depuis, "depuis")}T00:00:00`);
    if (f.jusqua) date.lte = new Date(`${jourValide(f.jusqua, "jusqua")}T23:59:59.999`);
    where.date = date;
  }

  const visites = await prisma.visite.findMany({
    where,
    orderBy: { date: "desc" },
    take: Math.min(Math.max(f.limit ?? 100, 1), 500),
    include: {
      chantier: { select: { nom: true } },
      createdBy: { select: { nom: true } },
    },
  });
  return visites.map((v) => {
    const type = v.type as TypeVisite;
    const data = normaliserData(v.data);
    return {
      id: v.id,
      titre: titreAffiche({ titre: v.titre, type, date: v.date }),
      type,
      typeLibelle: TYPE_LABEL[type],
      date: dateISOLocale(v.date),
      chantierId: v.chantierId,
      affaireNom: v.chantier?.nom ?? null,
      clientNom: v.clientNom,
      numeroWhy: v.numeroWhy,
      resume: resumeVisite(data),
      reservesOuvertes: statsVisite(data).reservesOuvertes,
      auteur: v.createdBy?.nom ?? null,
      updatedAt: v.updatedAt.toISOString(),
    };
  });
}

export interface VisiteItemMcp {
  libelle: string;
  /** Pense-bête du modèle de checklist (« qui détient les clés ? »). */
  aide?: string;
  /** "" = pas encore renseigné, sinon ok | ko | na. */
  statut: StatutItem;
  note?: string;
  photos?: number;
  audios?: number;
}

export interface VisiteSectionMcp {
  titre: string;
  items: VisiteItemMcp[];
}

export interface VisiteReserveMcp {
  id: string;
  libelle: string;
  localisation?: string;
  gravite: Gravite;
  statut: "ouverte" | "levee";
  note?: string;
  photos?: number;
  /** Id de la visite où la réserve a été déclarée, si ce n'est pas celle-ci. */
  reporteeDe?: string;
}

export interface VisiteMediaMcp {
  id: string;
  type: TypeMedia;
  /** Route authentifiée de l'app (session requise). */
  url: string;
  mimeType: string;
  taille: number;
  note?: string;
  dureeSec?: number;
  /** Point de checklist ou réserve auquel le média est rattaché. */
  rattachement?: string;
  /** false = le téléphone a synchronisé le texte mais pas encore le binaire. */
  recu: boolean;
}

export interface VisiteCompleteMcp {
  id: string;
  titre: string;
  type: TypeVisite;
  typeLibelle: string;
  date: string;
  chantierId: string | null;
  affaireNom: string | null;
  clientNom: string;
  numeroWhy: string | null;
  participants?: string;
  notes?: string;
  stats: ReturnType<typeof statsVisite>;
  sections: VisiteSectionMcp[];
  reserves: VisiteReserveMcp[];
  medias: VisiteMediaMcp[];
  auteur: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/** Une visite complète : checklist renseignée, réserves, médias. Les champs
 *  vides sont OMIS — une checklist de relevé fait 60 points, la réponse doit
 *  rester lisible. */
export async function getVisite(id: string): Promise<VisiteCompleteMcp | null> {
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
  const data = normaliserData(v.data);
  const recus = new Set(v.medias.map((m) => m.id));

  const libelleParItem = new Map<string, string>();
  for (const s of data.sections) for (const it of s.items) libelleParItem.set(it.id, it.libelle);
  const libelleParReserve = new Map(data.reserves.map((r) => [r.id, r.libelle] as const));

  return {
    id: v.id,
    titre: titreAffiche({ titre: v.titre, type, date: v.date }),
    type,
    typeLibelle: TYPE_LABEL[type],
    date: dateISOLocale(v.date),
    chantierId: v.chantierId,
    affaireNom: v.chantier?.nom ?? null,
    clientNom: v.clientNom,
    numeroWhy: v.numeroWhy,
    ...(data.participants ? { participants: data.participants } : {}),
    ...(data.notes ? { notes: data.notes } : {}),
    stats: statsVisite(data),
    sections: data.sections.map((s) => ({
      titre: s.titre,
      items: s.items.map((it) => ({
        libelle: it.libelle,
        ...(it.aide ? { aide: it.aide } : {}),
        statut: it.statut,
        ...(it.note ? { note: it.note } : {}),
        ...(it.photoIds.length ? { photos: it.photoIds.length } : {}),
        ...(it.audioIds.length ? { audios: it.audioIds.length } : {}),
      })),
    })),
    reserves: data.reserves.map((r) => ({
      id: r.id,
      libelle: r.libelle,
      ...(r.localisation ? { localisation: r.localisation } : {}),
      gravite: r.gravite,
      statut: r.statut,
      ...(r.note ? { note: r.note } : {}),
      ...(r.photoIds.length ? { photos: r.photoIds.length } : {}),
      ...(r.origineVisiteId && r.origineVisiteId !== v.id ? { reporteeDe: r.origineVisiteId } : {}),
    })),
    medias: data.medias.map((m) => {
      const rattachement = m.itemId
        ? libelleParItem.get(m.itemId)
        : m.reserveId
          ? `Réserve : ${libelleParReserve.get(m.reserveId) ?? m.reserveId}`
          : undefined;
      return {
        id: m.id,
        type: m.type,
        url: `/api/visites/media/${m.id}`,
        mimeType: m.mimeType,
        taille: m.taille,
        ...(m.note ? { note: m.note } : {}),
        ...(m.dureeSec ? { dureeSec: m.dureeSec } : {}),
        ...(rattachement ? { rattachement } : {}),
        recu: recus.has(m.id),
      };
    }),
    auteur: v.createdBy?.nom ?? null,
    url: `/outils/visites/${v.id}`,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

export interface ReserveOuverteMcp extends VisiteReserveMcp {
  /** Visite où la réserve a été déclarée (et son titre lisible). */
  visiteId: string;
  visiteTitre: string;
}

export interface AffaireReservesMcp {
  chantierId: string | null;
  affaireNom: string | null;
  clientNom: string;
  numeroWhy: string | null;
  reserves: ReserveOuverteMcp[];
}

const RANG_GRAVITE: Record<Gravite, number> = { haute: 0, moyenne: 1, faible: 2 };

/**
 * Réserves encore OUVERTES, groupées par affaire — le « reste à faire » du
 * terrain. Une réserve garde son id d'une visite à l'autre (report) : l'état le
 * plus récent gagne, une réserve levée disparaît d'elle-même. Les visites
 * orphelines (sans affaire) forment un groupe à part, elles aussi.
 */
export async function listReservesOuvertes(
  ref: { chantierId?: string; numeroWhy?: string } = {},
): Promise<AffaireReservesMcp[]> {
  const where: Prisma.VisiteWhereInput = {};
  if (ref.chantierId || ref.numeroWhy) {
    const affaire = await affairePourRef(ref);
    if (!affaire) throw affaireIntrouvable(ref);
    where.chantierId = affaire.id;
  }
  const visites = await prisma.visite.findMany({
    where,
    select: {
      id: true,
      titre: true,
      type: true,
      date: true,
      data: true,
      chantierId: true,
      clientNom: true,
      numeroWhy: true,
      chantier: { select: { nom: true } },
    },
  });

  const titreParVisite = new Map(
    visites.map((v) => [
      v.id,
      titreAffiche({ titre: v.titre, type: v.type as TypeVisite, date: v.date }),
    ]),
  );

  // Une visite sans affaire forme SON PROPRE groupe : rien ne reporte ses
  // réserves vers une autre (le report se fait au niveau de l'affaire), et son
  // client est celui que le terrain a saisi — le mutualiser mentirait.
  const groupes = new Map<string, { entete: AffaireReservesMcp; visites: typeof visites }>();
  for (const v of visites) {
    const cle = v.chantierId ?? `orpheline:${v.id}`;
    const g = groupes.get(cle);
    if (g) {
      g.visites.push(v);
    } else {
      groupes.set(cle, {
        entete: {
          chantierId: v.chantierId,
          affaireNom: v.chantier?.nom ?? null,
          clientNom: v.clientNom,
          numeroWhy: v.numeroWhy,
          reserves: [],
        },
        visites: [v],
      });
    }
  }

  const sortie: AffaireReservesMcp[] = [];
  for (const { entete, visites: lot } of groupes.values()) {
    const ouvertes = reservesOuvertes(lot);
    if (ouvertes.length === 0) continue;
    entete.reserves = ouvertes
      .map((r) => ({
        id: r.id,
        libelle: r.libelle,
        ...(r.localisation ? { localisation: r.localisation } : {}),
        gravite: r.gravite,
        statut: r.statut,
        ...(r.note ? { note: r.note } : {}),
        ...(r.photoIds.length ? { photos: r.photoIds.length } : {}),
        visiteId: r.origineVisiteId ?? "",
        visiteTitre: titreParVisite.get(r.origineVisiteId ?? "") ?? "",
      }))
      .sort((a, b) => RANG_GRAVITE[a.gravite] - RANG_GRAVITE[b.gravite]);
    sortie.push(entete);
  }
  // Le plus chargé d'abord — c'est là qu'il y a du travail.
  return sortie.sort((a, b) => b.reserves.length - a.reserves.length);
}

export interface CreateVisiteInput {
  chantierId?: string;
  numeroWhy?: string;
  type: TypeVisite;
  titre?: string;
  /** Date terrain AAAA-MM-JJ (défaut : aujourd'hui). */
  date?: string;
  participants?: string;
  notes?: string;
}

/**
 * Prépare une visite depuis le bureau : checklist du modèle du type demandé
 * (le « guide pour ne rien oublier », le même que celui du terrain) + report
 * des réserves encore ouvertes de l'affaire. Elle s'ouvre ensuite sur le
 * téléphone par /outils/visites/terrain?ouvrir={id}.
 *
 * Affaire OBLIGATOIRE ici : le terrain, lui, sait créer une visite sans affaire
 * (le relevé précède souvent le n° Why) et la rattacher au retour — mais depuis
 * le bureau, rien ne justifie de créer une orpheline.
 */
export async function createVisite(
  input: CreateVisiteInput,
  createdById: string | null,
): Promise<{ id: string; nbItems: number; nbReservesReportees: number }> {
  const affaire = await affairePourRef(input);
  if (!affaire) {
    throw new Error(
      "Une visite créée depuis le MCP doit être rattachée à une affaire existante : " +
        "fournis chantierId ou numeroWhy (voir dumtools_list_affaires ; créer l'affaire " +
        "au besoin avec dumtools_create_affaire).",
    );
  }

  // Report des réserves encore ouvertes de l'affaire — c'est la colonne
  // vertébrale du « ne rien oublier » : on part avec ce qui reste à lever.
  const precedentes = await prisma.visite.findMany({
    where: { chantierId: affaire.id },
    select: { id: true, data: true },
  });
  const visite = nouvelleVisite(input.type, {
    chantierId: affaire.id,
    chantierNom: affaire.nom,
    clientNom: affaire.client.nom,
    numeroWhy: affaire.numeroWhy,
    reservesOuvertes: reservesOuvertes(precedentes),
  });
  if (input.titre) visite.titre = input.titre.trim().slice(0, 200);
  if (input.date) visite.date = jourValide(input.date, "date");
  if (input.participants) visite.data.participants = input.participants;
  if (input.notes) visite.data.notes = input.notes;

  await prisma.visite.create({
    data: {
      id: visite.id,
      type: visite.type,
      titre: visite.titre,
      // Midi local, comme syncVisite : à minuit un fuseau à l'ouest ramènerait
      // la visite à la veille.
      date: new Date(`${visite.date}T12:00:00`),
      chantierId: affaire.id,
      clientId: affaire.clientId,
      clientNom: affaire.client.nom,
      numeroWhy: affaire.numeroWhy,
      data: asJson(visite.data),
      createdById,
      updatedById: createdById,
    },
  });

  return {
    id: visite.id,
    nbItems: visite.data.sections.reduce((n, s) => n + s.items.length, 0),
    nbReservesReportees: visite.data.reserves.length,
  };
}

export interface UpdateVisiteInput {
  titre?: string;
  type?: TypeVisite;
  date?: string;
  /** Rattachement (ou re-rattachement) à une affaire. */
  chantierId?: string;
  numeroWhy?: string;
}

/**
 * Métadonnées d'une visite synchronisée : titre, type, date, rattachement.
 * Le CONTENU (checklist, réserves, médias) n'est pas modifiable ici — il se
 * saisit sur le terrain, et l'écraser depuis le bureau perdrait la copie encore
 * ouverte sur le téléphone (fusion « dernier gagne » de syncVisite).
 *
 * Au rattachement, l'identification (client, n° Why) est REPRISE DE L'AFFAIRE,
 * comme le fait rattacherVisiteAffaire côté web : l'affaire fait foi.
 */
export async function updateVisite(
  id: string,
  input: UpdateVisiteInput,
): Promise<{ id: string; chantierId: string | null; updatedAt: string } | null> {
  const visite = await prisma.visite.findUnique({ where: { id }, select: { id: true } });
  if (!visite) return null;

  const data: Prisma.VisiteUncheckedUpdateInput = {};
  if (input.titre !== undefined) data.titre = input.titre.trim().slice(0, 200);
  if (input.type !== undefined) data.type = input.type;
  if (input.date !== undefined) data.date = new Date(`${jourValide(input.date, "date")}T12:00:00`);
  if (input.chantierId || input.numeroWhy) {
    const affaire = await affairePourRef(input);
    if (!affaire) throw affaireIntrouvable(input);
    data.chantierId = affaire.id;
    data.clientId = affaire.clientId;
    data.clientNom = affaire.client.nom;
    data.numeroWhy = affaire.numeroWhy;
  }

  // Rien à changer : ne pas écrire. Un `update` à vide bousculerait `updatedAt`
  // et ferait remonter l'affaire au fil d'activité pour un appel sans effet.
  const maj =
    Object.keys(data).length === 0
      ? await prisma.visite.findUniqueOrThrow({
          where: { id },
          select: { id: true, chantierId: true, updatedAt: true },
        })
      : await prisma.visite.update({
          where: { id },
          data: { ...data, ...parActeur() },
          select: { id: true, chantierId: true, updatedAt: true },
        });
  return { id: maj.id, chantierId: maj.chantierId, updatedAt: maj.updatedAt.toISOString() };
}

/** Supprime une visite et purge ses médias du disque de la VM. */
export async function deleteVisite(id: string): Promise<boolean> {
  const visite = await prisma.visite.findUnique({
    where: { id },
    select: { medias: { select: { fichier: true } } },
  });
  if (!visite) return false;
  await Promise.all(visite.medias.map((m) => rm(m.fichier, { force: true }).catch(() => {})));
  await prisma.visite.delete({ where: { id } });
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

// --- Outil « Devis » (moteur de chiffrage) ----------------------------------
// Déboursé du Magasin × coefficient = prix de vente (docs/DEVIS.md).
//
// RIEN n'est réimplémenté ici : les lectures sont celles de l'app
// (src/tools/devis/queries) et les écritures passent par le NOYAU partagé avec
// l'éditeur (src/tools/devis/ecritures). Ce bloc ne fait que deux choses :
//
//  1. TRADUIRE LES UNITÉS. L'app compte en centimes et en millièmes (aucun
//     flottant dans un prix) ; une IA qui manipule « 1350 » pour ×1,35 finit
//     par chiffrer un devis mille fois trop cher. Le MCP parle en euros, en
//     décimales et en pourcent, et convertit à la frontière.
//
//  2. APPLIQUER LA RÈGLE DE L'IA — un article absent du Magasin NE SE CRÉE PAS :
//     la ligne passe en « Divers » (genre LIBRE) et la réponse le DIT. On ne
//     rapproche jamais sur la désignation : choisir le mauvais article en
//     silence est pire qu'un Divers annoncé. Seul `createProduit` crée un
//     produit, sur demande explicite ET profil Achats/Admin.

const enEuros = (cents: number | null | undefined): number | null =>
  cents === null || cents === undefined ? null : cents / 100;

const isoOuNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Saisie décimale → entier d'unités internes, sans laisser la virgule
 *  flottante décider de l'arrondi (0.1 × 3 × 100 ne tombe pas sur 30). */
function enUnites(v: number, facteur: number): number {
  return Math.round(Number((v * facteur).toFixed(6)));
}

function versCentimes(euros: number, champ: string): number {
  if (!Number.isFinite(euros) || euros < 0) {
    throw new Error(`${champ} : montant en euros HT, positif ou nul, attendu (reçu ${euros}).`);
  }
  return enUnites(euros, 100);
}

function versMilliemes(q: number, champ: string): number {
  const m = Number.isFinite(q) ? enUnites(q, 1000) : Number.NaN;
  if (!(m > 0)) throw new Error(`${champ} : quantité strictement positive attendue (reçu ${q}).`);
  return m;
}

/** 1.35 → 1350. Un « 135 » est presque sûrement un pourcentage mal compris :
 *  on refuse plutôt que de vendre à 135 fois le prix d'achat. */
function versCoef(c: number, champ: string): number {
  if (!Number.isFinite(c) || c <= 0 || c > 20) {
    throw new Error(
      `${champ} : coefficient MULTIPLICATEUR attendu, entre 0 et 20 (1.35 pour ×1,35) — reçu ${c}.`,
    );
  }
  return enUnites(c, 1000);
}

function versPourMille(pct: number, champ: string): number {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error(`${champ} : pourcentage entre 0 et 100 attendu (reçu ${pct}).`);
  }
  return enUnites(pct, 10);
}

/** Retire d'une réponse ce qui ne dit rien (undefined, null, "", false) : une
 *  ligne sans remise ni note n'a pas à le répéter. Les 0 restent — un prix à
 *  zéro est une information. */
function sansVides<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false),
  ) as Partial<T>;
}

/** Un devis est SIGNÉ de son auteur (le document client imprime son nom et sa
 *  fonction) : une écriture anonyme ferait un devis que personne ne signe. */
function exigerAuteur(acteurId: string | null): string {
  if (!acteurId) {
    throw new Error(
      "Écriture refusée : aucun utilisateur identifié, or un devis est signé de son auteur. En stdio, renseigner MCP_USER_EMAIL avec un compte DumTools actif ; en HTTP, c'est le jeton qui identifie.",
    );
  }
  return acteurId;
}

/** Une ligne « Divers » à 0 € : le moteur ne la signale nulle part (`nbSansPrix`
 *  ne compte que les articles), c'est donc au MCP de la dire. */
const estDiversAChiffrer = (l: Pick<LigneDevisVue, "genre" | "pvUnitaireCents">): boolean =>
  l.genre === "LIBRE" && l.pvUnitaireCents === 0;

async function vueDevis(id: string): Promise<{ c: DevisComplet; t: TotauxDevis } | null> {
  const c = await lireDevisApp(id);
  return c ? { c, t: calculerDevis(c.entete, c.lots, c.lignes) } : null;
}

function totauxDevisMcp(t: TotauxDevis, lignes: LigneDevisVue[]) {
  return sansVides({
    totalHt: enEuros(t.totalHtCents),
    remiseGlobale: t.remiseGlobaleCents ? enEuros(t.remiseGlobaleCents) : null,
    netHt: enEuros(t.netHtCents),
    tva: enEuros(t.tvaCents),
    totalTtc: enEuros(t.totalTtcCents),
    optionsHorsTotal: t.optionsCents ? enEuros(t.optionsCents) : null,
    // « Marge sur la FOURNITURE », jamais « marge du devis » : la main d'œuvre
    // est au taux de vente, sans coût interne (docs/DEVIS.md §2). La nette
    // encaisse la remise globale au prorata de la fourniture.
    margeSurFourniture:
      t.debourseCents > 0
        ? sansVides({
            debourse: enEuros(t.debourseCents),
            vendu: enEuros(t.venduFournitureCents),
            marge: enEuros(t.margeFournitureCents),
            tauxPourcent:
              t.tauxMargeFournitureCentieme === null ? null : t.tauxMargeFournitureCentieme / 100,
            margeNette: enEuros(t.margeFournitureNetteCents),
            tauxNetPourcent:
              t.tauxMargeFournitureNetteCentieme === null
                ? null
                : t.tauxMargeFournitureNetteCentieme / 100,
          })
        : null,
    nbLignes: t.nbLignes,
    nbOptions: t.nbOptions,
    nbSansPrix: t.nbSansPrix,
    nbPerimees: t.nbPerimees,
    nbDiversAChiffrer: lignes.filter(estDiversAChiffrer).length,
  });
}

function alertesDevis(t: TotauxDevis, lignes: LigneDevisVue[]): string[] {
  const alertes: string[] = [];
  const aChiffrer = lignes.filter(estDiversAChiffrer).length;
  if (t.nbSansPrix > 0) {
    alertes.push(
      `${t.nbSansPrix} article(s) du magasin sans prix connu : vendus 0 €, exclus de la marge.`,
    );
  }
  if (aChiffrer > 0) {
    alertes.push(`${aChiffrer} ligne(s) Divers à 0 € — à chiffrer (dumtools_update_devis_ligne).`);
  }
  if (t.nbPerimees > 0) {
    alertes.push(
      `${t.nbPerimees} déboursé(s) figé(s) différent(s) du prix du magasin aujourd'hui — PROPOSER dumtools_refresh_devis_prix, ne jamais l'appliquer sans accord.`,
    );
  }
  return alertes;
}

function ligneDevisMcp(lc: LigneCalculee): Record<string, unknown> {
  const l = lc.ligne;
  if (l.genre === "TEXTE") {
    return sansVides({
      id: l.id,
      genre: l.genre,
      texte: l.designation,
      // Un commentaire mis en forme (titres, listes, images) : lisible ici en
      // résumé seulement, et non réécrivable depuis le MCP.
      documentRiche: l.contenu !== null && texteNu(l.contenu) === null,
    });
  }
  return sansVides({
    id: l.id,
    genre: l.genre,
    genreLibelle: GENRE_LIGNE_LABEL[l.genre],
    designation: l.designation,
    ref: l.refInterne,
    produitId: l.produitId,
    prestationId: l.prestationId,
    quantite: l.quantiteMillieme / 1000,
    unite: l.unite,
    debourse: enEuros(l.debourseCents),
    coef: l.coefMillieme === null ? null : l.coefMillieme / 1000,
    origineCoef: l.coefMillieme === null ? null : l.origineCoef,
    prixVenteUnitaire: enEuros(l.pvUnitaireCents),
    remisePourcent: l.remisePourMille ? l.remisePourMille / 10 : null,
    totalHt: enEuros(lc.totalCents),
    option: l.option,
    note: l.note,
    sansPrix: l.genre === "PRODUIT" && l.debourseCents === null,
    aChiffrer: estDiversAChiffrer(l),
    prixPerime: lc.perimee
      ? { debourseFige: enEuros(l.debourseCents), debourseDuJour: enEuros(l.debourseActuelCents) }
      : null,
  });
}

/* ---- Lecture ---- */

export interface DevisFiltreMcp {
  etat?: EtatDevis;
  chantierId?: string;
  numeroWhy?: string;
  clientId?: string;
  limit?: number;
}

export async function listDevis(f: DevisFiltreMcp = {}) {
  let chantierId = f.chantierId;
  if (!chantierId && f.numeroWhy) {
    const affaire = await affairePourRef({ numeroWhy: f.numeroWhy });
    if (!affaire) throw affaireIntrouvable({ numeroWhy: f.numeroWhy });
    chantierId = affaire.id;
  }
  // `listerDevis` calcule les totaux avec le moteur : la liste ne peut pas
  // annoncer un montant que la fiche dément.
  const tous = await listerDevis({ etat: f.etat, chantierId, clientId: f.clientId });
  const limite = Math.max(1, f.limit ?? 50);
  return {
    total: tous.length,
    devis: tous.slice(0, limite).map((d) =>
      sansVides({
        id: d.id,
        libelle: libelleDevis(d.numero, d.revision),
        titre: d.titre,
        etat: d.etat,
        etatLibelle: ETAT_DEVIS_LABEL[d.etat],
        clientNom: d.clientNom,
        numeroWhy: d.numeroWhy,
        chantierId: d.chantierId,
        affaireNom: d.chantierNom,
        totalHt: enEuros(d.totalHtCents),
        netHt: enEuros(d.netHtCents),
        margeSurFourniture: d.tauxMargeFournitureCentieme === null ? null : enEuros(d.margeFournitureCents),
        tauxMargeFourniturePourcent:
          d.tauxMargeFournitureCentieme === null ? null : d.tauxMargeFournitureCentieme / 100,
        nbLignes: d.nbLignes,
        nbSansPrix: d.nbSansPrix,
        publie: d.publie,
        nbConsultations: d.nbConsultations,
        // Une v1 dépassée doit se lire comme telle.
        nbRevisionsUlterieures: d.nbRevisions,
        auteur: d.auteur,
        updatedAt: d.updatedAt.toISOString(),
        url: `${BASE_DEVIS}/${d.id}`,
      }),
    ),
  };
}

export async function getDevisMcp(id: string) {
  const v = await vueDevis(id);
  if (!v) return null;
  const { c, t } = v;
  const e = c.entete;
  const publie = partageActif(e);
  return {
    ...sansVides({
      id: e.id,
      numero: e.numero,
      revision: e.revision,
      libelle: libelleDevis(e.numero, e.revision),
      titre: e.titre,
      etat: e.etat,
      etatLibelle: ETAT_DEVIS_LABEL[e.etat],
      clientId: e.clientId,
      clientNom: e.clientNom,
      numeroWhy: e.numeroWhy,
      chantierId: e.chantierId,
      affaireNom: e.chantierNom,
      coefDefaut: e.coefDefautMillieme / 1000,
      tauxTvaPourcent: e.tauxTvaCentieme / 100,
      remiseGlobale:
        e.remiseGlobaleCents !== null
          ? { montant: enEuros(e.remiseGlobaleCents) }
          : e.remiseGlobalePourMille
            ? { pourcent: e.remiseGlobalePourMille / 10 }
            : null,
      validiteJours: e.validiteJours,
      destinataire: e.destinataire,
      contact: e.contactNom
        ? sansVides({
            nom: e.contactNom,
            fonction: e.contactFonction,
            email: e.contactEmail,
            telephone: e.contactTel,
          })
        : null,
      emisLe: isoOuNull(e.emisLe),
      auteur: e.auteur,
      auteurFonction: e.auteurFonction,
      modifiePar: e.modifiePar,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      url: `${BASE_DEVIS}/${e.id}`,
    }),
    // Ce que le client VOIT du chiffrage (réglé dans l'éditeur).
    affichageClient: {
      prixUnitaires: e.montrerPrixUnitaires,
      sousTotauxLots: e.montrerSousTotauxLots,
      options: e.montrerOptions,
      documentations: e.montrerDocumentations,
    },
    // Lecture seule : publier le lien client se fait dans l'éditeur, pas ici.
    publication: sansVides({
      publie,
      urlPublique:
        publie && e.jetonPartage
          ? `${(process.env.APP_URL ?? "https://dumtools.datagtb.com").replace(/\/$/, "")}/d/${e.jetonPartage}`
          : null,
      publieLe: isoOuNull(e.publieLe),
      expireLe: isoOuNull(e.partageExpireLe),
      consultations: e.nbConsultations,
      derniereConsultation: isoOuNull(e.derniereConsultation),
    }),
    lots: t.lots.map((g) =>
      sansVides({
        id: g.lot?.id,
        titre: g.lot?.titre ?? "(hors lot)",
        // CONDENSE = forfait : le client ne lit qu'une ligne au sous-total.
        rendu: g.lot?.rendu,
        libelleClient: g.lot?.libelleClient,
        description: g.lot?.note,
        sousTotalHt: enEuros(g.sousTotalCents),
        optionsHt: g.optionsCents ? enEuros(g.optionsCents) : null,
        lignes: g.lignes.map(ligneDevisMcp),
      }),
    ),
    totaux: totauxDevisMcp(t, c.lignes),
    alertes: alertesDevis(t, c.lignes),
  };
}

export interface RechercheArticlesMcp {
  devisId?: string;
  limit?: number;
}

/** Ce que la barre d'ajout de l'éditeur propose : articles du Magasin
 *  (même requête, `rechercherArticles`) et prestations (libellé ou n° BPU). */
export async function searchArticlesDevis(q: string, o: RechercheArticlesMcp = {}) {
  const requete = q.trim();
  if (requete.length < 2) throw new Error("Recherche : au moins 2 caractères.");
  const limite = Math.min(Math.max(o.limit ?? 15, 1), 50);
  const [articles, prestations, grille, devis] = await Promise.all([
    rechercherArticles(requete, limite),
    listerPrestations(),
    grilleCoefs(),
    o.devisId
      ? prisma.devis.findUnique({ where: { id: o.devisId }, select: { coefDefautMillieme: true } })
      : Promise.resolve(null),
  ]);
  if (o.devisId && !devis) throw new Error(`Devis introuvable pour l'id « ${o.devisId} ».`);
  const coefDevis = devis?.coefDefautMillieme ?? grille.globalMillieme;
  const f = requete.toLowerCase();
  return {
    articles: articles.map((a) => {
      const { coefMillieme, origine } = coefApplicable(grille, coefDevis, {
        produitId: a.produitId,
        categorieId: a.categorieId,
      });
      return sansVides({
        produitId: a.produitId,
        ref: a.refInterne,
        refFabricant: a.refFabricant,
        designation: a.designation,
        unite: a.unite,
        categorie: a.categorieNom,
        debourse: enEuros(a.debourseCents),
        sourcePrix:
          a.sourcePrix === "pmp" ? "prix moyen payé" : a.sourcePrix === "achat" ? "prix d'achat annoncé" : null,
        sansPrix: a.debourseCents === null,
        coef: coefMillieme / 1000,
        origineCoef: origine,
        prixVenteEstime:
          a.debourseCents === null ? null : enEuros(pvDepuisDebourse(a.debourseCents, coefMillieme)),
      });
    }),
    prestations: prestations
      .filter(
        (p) => p.actif && (p.libelle.toLowerCase().includes(f) || p.note.toLowerCase().includes(f)),
      )
      .slice(0, limite)
      .map((p) =>
        sansVides({
          prestationId: p.id,
          libelle: p.libelle,
          unite: p.unite,
          prixVente: enEuros(p.prixVenteCents),
          famille: p.famille,
          articleBpu: p.note.startsWith("BPU ") ? p.note.slice(4) : null,
        }),
      ),
  };
}

/* ---- Résolution : article, prestation, lot ---- */

interface Candidat {
  id: string;
  ref: string;
  designation: string;
}

type Resolution<T> =
  | { trouve: true; cible: T }
  | { trouve: false; raison: string; candidats?: Candidat[] };

const SELECT_PRODUIT_RESOLU = {
  id: true,
  refInterne: true,
  designation: true,
  actif: true,
  remplacePar: { select: { id: true, refInterne: true, designation: true, actif: true } },
} as const;

type ProduitResolu = {
  id: string;
  refInterne: string;
  designation: string;
  actif: boolean;
  remplacePar: { id: string; refInterne: string; designation: string; actif: boolean } | null;
};

function produitRetenu(p: ProduitResolu): Resolution<ProduitResolu> {
  if (p.actif) return { trouve: true, cible: p };
  const r = p.remplacePar;
  return {
    trouve: false,
    raison: `l'article ${p.refInterne} est ARCHIVÉ au magasin${r ? ` (remplacé par ${r.refInterne} — ${r.designation})` : ""}`,
    candidats: r?.actif ? [{ id: r.id, ref: r.refInterne, designation: r.designation }] : undefined,
  };
}

/**
 * Un article se retrouve par son id, ou par une référence EXACTE (à la casse
 * près) : interne d'abord (unique), puis fabricant, puis fournisseur — et
 * seulement si elle ne désigne qu'UN article actif. Jamais par la désignation.
 */
async function resoudreArticle(
  produitId: string | undefined,
  ref: string | undefined,
): Promise<Resolution<ProduitResolu>> {
  if (produitId) {
    const p = await prisma.produit.findUnique({ where: { id: produitId }, select: SELECT_PRODUIT_RESOLU });
    if (!p) return { trouve: false, raison: `aucun article du magasin n'a l'id « ${produitId} »` };
    return produitRetenu(p);
  }
  const r = ref?.trim();
  if (!r) {
    return {
      trouve: false,
      raison:
        "aucune référence fournie — un article ne se retrouve jamais par sa désignation (risque de mauvais article)",
    };
  }
  const exacte = { equals: r, mode: "insensitive" as const };
  const interne = await prisma.produit.findFirst({
    where: { refInterne: exacte },
    select: SELECT_PRODUIT_RESOLU,
  });
  if (interne) return produitRetenu(interne);

  const passes: [string, Prisma.ProduitWhereInput][] = [
    ["réf. fabricant", { refFabricant: exacte, actif: true }],
    ["réf. fournisseur", { refFournisseur: exacte, actif: true }],
  ];
  for (const [quoi, where] of passes) {
    const lignes = await prisma.produit.findMany({ where, select: SELECT_PRODUIT_RESOLU, take: 6 });
    if (lignes.length === 1) return { trouve: true, cible: lignes[0]! };
    if (lignes.length > 1) {
      return {
        trouve: false,
        raison: `la ${quoi} « ${r} » désigne ${lignes.length} articles — ambigu, rien n'est choisi à la place de l'utilisateur`,
        candidats: lignes.map((p) => ({ id: p.id, ref: p.refInterne, designation: p.designation })),
      };
    }
  }
  return { trouve: false, raison: `la référence « ${r} » est absente du magasin` };
}

/** Une prestation se retrouve par son id, son n° d'article BPU (« 5.4.9 ») ou
 *  son libellé EXACT (à la casse et aux accents près). */
async function resoudrePrestation(
  prestationId: string | undefined,
  ref: string | undefined,
  libelle: string | undefined,
): Promise<Resolution<{ id: string; libelle: string }>> {
  if (prestationId) {
    const p = await prisma.prestation.findUnique({
      where: { id: prestationId },
      select: { id: true, libelle: true, actif: true },
    });
    if (!p) return { trouve: false, raison: `aucune prestation n'a l'id « ${prestationId} »` };
    if (!p.actif) return { trouve: false, raison: `la prestation « ${p.libelle} » est archivée` };
    return { trouve: true, cible: p };
  }
  const actives = await prisma.prestation.findMany({
    where: { actif: true },
    select: { id: true, libelle: true, note: true },
  });
  const r = ref?.trim().replace(/^bpu\s+/i, "");
  if (r) {
    const cle = `bpu ${r}`.toLowerCase();
    const m = actives.filter((p) => p.note.trim().toLowerCase() === cle);
    if (m.length === 1) return { trouve: true, cible: m[0]! };
  }
  const l = libelle?.trim();
  if (l) {
    const cle = cleReferentiel(l);
    const m = actives.filter((p) => cleReferentiel(p.libelle) === cle);
    if (m.length === 1) return { trouve: true, cible: m[0]! };
  }
  return {
    trouve: false,
    raison: r
      ? `aucune prestation du référentiel pour l'article BPU « ${r} »${l ? ` ni le libellé « ${l} »` : ""}`
      : `aucune prestation du référentiel ne s'intitule exactement « ${l ?? ""} »`,
  };
}

/** Lot d'un devis par titre (à la casse et aux accents près), créé s'il manque.
 *  Créer un LOT n'est pas créer dans le référentiel : c'est ranger le devis. */
async function lotParTitre(
  devisId: string,
  titre: string,
  lots: { id: string; titre: string }[],
  crees: { id: string; titre: string }[],
): Promise<string> {
  const cle = cleReferentiel(titre);
  const existant = lots.find((l) => cleReferentiel(l.titre) === cle);
  if (existant) return existant.id;
  const { id } = await noyauDevis.ajouterLot(devisId, titre);
  const lot = { id, titre: titre.trim() };
  lots.push(lot);
  crees.push(lot);
  return id;
}

/* ---- Écriture : le devis ---- */

export interface CreerDevisMcp {
  titre?: string;
  chantierId?: string;
  numeroWhy?: string;
  clientNom?: string;
}

export async function createDevis(
  input: CreerDevisMcp,
  acteurId: string | null,
  options: noyauDevis.OptionsNumerotation = {},
) {
  const auteur = exigerAuteur(acteurId);
  let saisie: { titre?: string; clientNom?: string; numeroWhy?: string; chantierId?: string };
  if (input.chantierId || input.numeroWhy) {
    // Une affaire qui EXISTE : le MCP n'en crée pas en douce (l'éditeur, lui,
    // crée l'affaire d'un n° Why inconnu — une IA qui se trompe de numéro
    // fabriquerait une affaire fantôme).
    const affaire = await affairePourRef(input);
    if (!affaire) throw affaireIntrouvable(input);
    saisie = {
      titre: input.titre,
      chantierId: affaire.id,
      clientNom: affaire.client.nom,
      numeroWhy: affaire.numeroWhy ?? undefined,
    };
  } else if (input.clientNom?.trim()) {
    saisie = { titre: input.titre, clientNom: input.clientNom };
  } else {
    throw new Error(
      "Rattacher le devis : fournir chantierId OU numeroWhy (affaire existante), ou à défaut clientNom.",
    );
  }
  const { id, numero } = await noyauDevis.creerDevis(auteur, saisie, options);
  const d = await prisma.devis.findUnique({
    where: { id },
    select: {
      clientNom: true,
      numeroWhy: true,
      destinataire: true,
      contactNom: true,
      chantier: { select: { nom: true } },
    },
  });
  return {
    id,
    numero,
    url: `${BASE_DEVIS}/${id}`,
    ...sansVides({
      clientNom: d?.clientNom,
      numeroWhy: d?.numeroWhy,
      affaireNom: d?.chantier?.nom,
      destinatairePreRempli: d?.destinataire,
      contact: d?.contactNom,
    }),
  };
}

export interface MajDevisMcp {
  titre?: string;
  clientNom?: string;
  chantierId?: string;
  numeroWhy?: string;
  coefDefaut?: number;
  tauxTva?: number;
  remiseGlobalePourcent?: number | null;
  remiseGlobaleMontant?: number | null;
  validiteJours?: number;
  etat?: EtatDevis;
  destinataire?: string;
  montrerPrixUnitaires?: boolean;
  montrerSousTotauxLots?: boolean;
  montrerOptions?: boolean;
  montrerDocumentations?: boolean;
}

export async function updateDevis(id: string, input: MajDevisMcp, acteurId: string | null) {
  const auteur = exigerAuteur(acteurId);
  const existe = await prisma.devis.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return null;

  if (
    input.remiseGlobalePourcent !== undefined &&
    input.remiseGlobalePourcent !== null &&
    input.remiseGlobaleMontant !== undefined &&
    input.remiseGlobaleMontant !== null
  ) {
    throw new Error(
      "La remise globale est EXCLUSIVE : en pourcent OU en montant, jamais les deux (poser l'une efface l'autre).",
    );
  }

  const patch: noyauDevis.PatchEnteteDevis = {};
  if (input.titre !== undefined) patch.titre = input.titre;
  if (input.destinataire !== undefined) patch.destinataire = input.destinataire;
  if (input.clientNom !== undefined) patch.clientNom = input.clientNom;
  if (input.chantierId || input.numeroWhy) {
    const affaire = await affairePourRef(input);
    if (!affaire) throw affaireIntrouvable(input);
    patch.chantierId = affaire.id;
  }
  if (input.coefDefaut !== undefined) patch.coefDefautMillieme = versCoef(input.coefDefaut, "coefDefaut");
  if (input.tauxTva !== undefined) {
    if (!Number.isFinite(input.tauxTva) || input.tauxTva < 0 || input.tauxTva > 100) {
      throw new Error(`tauxTva : pourcentage entre 0 et 100 attendu (reçu ${input.tauxTva}).`);
    }
    patch.tauxTvaCentieme = enUnites(input.tauxTva, 100);
  }
  if (input.remiseGlobalePourcent !== undefined) {
    patch.remiseGlobalePourMille =
      input.remiseGlobalePourcent === null
        ? null
        : versPourMille(input.remiseGlobalePourcent, "remiseGlobalePourcent");
  }
  if (input.remiseGlobaleMontant !== undefined) {
    patch.remiseGlobaleCents =
      input.remiseGlobaleMontant === null
        ? null
        : versCentimes(input.remiseGlobaleMontant, "remiseGlobaleMontant");
  }
  if (input.validiteJours !== undefined) patch.validiteJours = input.validiteJours;
  if (input.etat !== undefined) patch.etat = input.etat;
  if (input.montrerPrixUnitaires !== undefined) patch.montrerPrixUnitaires = input.montrerPrixUnitaires;
  if (input.montrerSousTotauxLots !== undefined) patch.montrerSousTotauxLots = input.montrerSousTotauxLots;
  if (input.montrerOptions !== undefined) patch.montrerOptions = input.montrerOptions;
  if (input.montrerDocumentations !== undefined) {
    patch.montrerDocumentations = input.montrerDocumentations;
  }

  await noyauDevis.majEnteteDevis(auteur, id, patch);
  const v = (await vueDevis(id))!;
  return sansVides({
    id,
    libelle: libelleDevis(v.c.entete.numero, v.c.entete.revision),
    etat: v.c.entete.etat,
    emisLe: isoOuNull(v.c.entete.emisLe),
    clientNom: v.c.entete.clientNom,
    affaireNom: v.c.entete.chantierNom,
    destinataire: v.c.entete.destinataire,
    updatedAt: v.c.entete.updatedAt.toISOString(),
    totaux: totauxDevisMcp(v.t, v.c.lignes),
  });
}

export async function deleteDevis(id: string, acteurId: string | null): Promise<boolean> {
  exigerAuteur(acteurId);
  return noyauDevis.supprimerDevis(id);
}

export async function reviseDevis(id: string, acteurId: string | null) {
  const auteur = exigerAuteur(acteurId);
  const existe = await prisma.devis.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return null;
  const { id: nouveau } = await noyauDevis.nouvelleRevision(auteur, id);
  const d = (await prisma.devis.findUnique({
    where: { id: nouveau },
    select: { numero: true, revision: true },
  }))!;
  return {
    id: nouveau,
    numero: d.numero,
    revision: d.revision,
    libelle: libelleDevis(d.numero, d.revision),
    url: `${BASE_DEVIS}/${nouveau}`,
  };
}

export async function duplicateDevis(
  id: string,
  acteurId: string | null,
  options: noyauDevis.OptionsNumerotation = {},
) {
  const auteur = exigerAuteur(acteurId);
  const existe = await prisma.devis.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return null;
  const copie = await noyauDevis.dupliquerDevis(auteur, id, options);
  return { ...copie, url: `${BASE_DEVIS}/${copie.id}` };
}

export async function refreshDevisPrix(devisId: string, ligneIds: string[] | undefined, acteurId: string | null) {
  const auteur = exigerAuteur(acteurId);
  const existe = await prisma.devis.findUnique({ where: { id: devisId }, select: { id: true } });
  if (!existe) return null;
  const { misesAJour } = await noyauDevis.rafraichirLignes(devisId, ligneIds);
  if (misesAJour > 0) {
    await prisma.devis.update({ where: { id: devisId }, data: { updatedById: auteur } });
  }
  const v = (await vueDevis(devisId))!;
  return { devisId, misesAJour, totaux: totauxDevisMcp(v.t, v.c.lignes) };
}

/* ---- Écriture : les lots ---- */

export interface LotDevisMcp {
  titre?: string;
  rendu?: "DETAILLE" | "CONDENSE";
  libelleClient?: string;
  description?: string;
}

export async function addDevisLot(devisId: string, input: LotDevisMcp & { titre: string }, acteurId: string | null) {
  const auteur = exigerAuteur(acteurId);
  const existe = await prisma.devis.findUnique({ where: { id: devisId }, select: { id: true } });
  if (!existe) return null;
  const { id } = await noyauDevis.ajouterLot(devisId, input.titre, { rendu: input.rendu });
  if (input.libelleClient !== undefined || input.description !== undefined) {
    await noyauDevis.majLot(id, { libelleClient: input.libelleClient, note: input.description });
  }
  await prisma.devis.update({ where: { id: devisId }, data: { updatedById: auteur } });
  return { id, devisId };
}

export async function updateDevisLot(lotId: string, input: LotDevisMcp, acteurId: string | null) {
  const auteur = exigerAuteur(acteurId);
  const existe = await prisma.lotDevis.findUnique({ where: { id: lotId }, select: { id: true } });
  if (!existe) return null;
  const { devisId } = await noyauDevis.majLot(lotId, {
    titre: input.titre,
    rendu: input.rendu,
    libelleClient: input.libelleClient,
    note: input.description,
  });
  await prisma.devis.update({ where: { id: devisId }, data: { updatedById: auteur } });
  const lot = (await prisma.lotDevis.findUnique({ where: { id: lotId } }))!;
  return sansVides({
    id: lot.id,
    devisId,
    titre: lot.titre,
    rendu: lot.rendu,
    libelleClient: lot.libelleClient,
    description: lot.note,
  });
}

/* ---- Écriture : les lignes ---- */

export interface LigneDevisAjoutMcp {
  type: "article" | "prestation" | "divers" | "texte";
  produitId?: string;
  prestationId?: string;
  ref?: string;
  designation?: string;
  texte?: string;
  quantite?: number;
  unite?: string;
  prixVente?: number;
  debourse?: number;
  coef?: number;
  remise?: number;
  option?: boolean;
  note?: string;
  lotId?: string;
  lotTitre?: string;
}

export interface AjoutLignesDevisMcp {
  lotId?: string;
  lotTitre?: string;
  lignes: LigneDevisAjoutMcp[];
}

type LignePlanifiee = {
  index: number;
  source: LigneDevisAjoutMcp;
  quantiteMillieme: number;
  remisePourMille?: number;
} & (
  | { genre: "PRODUIT"; produitId: string; prixIgnore: boolean }
  | { genre: "PRESTATION"; prestationId: string; prixIgnore: boolean }
  | {
      genre: "LIBRE";
      designation: string;
      pvUnitaireCents?: number;
      debourseCents?: number;
      coefMillieme?: number;
      /** Pourquoi un article ou une prestation n'a pas été trouvé — absent pour
       *  un Divers DEMANDÉ. */
      raison?: string;
      candidats?: Candidat[];
      indice?: string;
    }
  | { genre: "TEXTE"; texte: string }
);

/**
 * Ajoute des lignes à un devis, d'un seul appel.
 *
 * Deux temps, et c'est volontaire : on RÉSOUT et on VALIDE tout (lecture seule),
 * puis on écrit. Une saisie fautive à la ligne 8 ne laisse donc pas sept lignes
 * orphelines derrière un message d'erreur.
 */
export async function addDevisLignes(
  devisId: string,
  input: AjoutLignesDevisMcp,
  acteurId: string | null,
) {
  const auteur = exigerAuteur(acteurId);
  const devis = await prisma.devis.findUnique({ where: { id: devisId }, select: { id: true } });
  if (!devis) return null;
  if (input.lignes.length === 0) throw new Error("Aucune ligne à ajouter.");
  if (input.lignes.length > 200) throw new Error("200 lignes au plus par appel.");

  const lots = await prisma.lotDevis.findMany({ where: { devisId }, select: { id: true, titre: true } });
  const verifierLot = (id: string | undefined, ou: string) => {
    if (id && !lots.some((l) => l.id === id)) {
      throw new Error(`${ou} : lot « ${id} » introuvable dans ce devis (voir dumtools_get_devis → lots[].id).`);
    }
  };
  verifierLot(input.lotId, "lotId");

  // --- 1. Résoudre et valider — rien n'est écrit ---------------------------
  const plan: LignePlanifiee[] = [];
  for (const [index, l] of input.lignes.entries()) {
    const ou = `lignes[${index}]`;
    verifierLot(l.lotId, ou);

    if (l.type === "texte") {
      const t = (l.texte ?? l.designation ?? "").trim();
      if (!t) throw new Error(`${ou} : une ligne texte demande "texte".`);
      plan.push({ index, source: l, quantiteMillieme: 0, genre: "TEXTE", texte: t });
      continue;
    }

    const quantiteMillieme = versMilliemes(l.quantite ?? 1, `${ou}.quantite`);
    const remisePourMille = l.remise === undefined ? undefined : versPourMille(l.remise, `${ou}.remise`);
    if (l.prixVente !== undefined && l.coef !== undefined) {
      throw new Error(`${ou} : prixVente et coef s'excluent (un prix saisi efface le coefficient).`);
    }
    const pvUnitaireCents = l.prixVente === undefined ? undefined : versCentimes(l.prixVente, `${ou}.prixVente`);
    const debourseCents = l.debourse === undefined ? undefined : versCentimes(l.debourse, `${ou}.debourse`);
    const coefMillieme = l.coef === undefined ? undefined : versCoef(l.coef, `${ou}.coef`);
    if (coefMillieme !== undefined && debourseCents === undefined) {
      throw new Error(`${ou} : un coef ne s'applique qu'à un debourse (sinon donner prixVente).`);
    }
    const aDesPrix = pvUnitaireCents !== undefined || debourseCents !== undefined;
    const commun = { index, source: l, quantiteMillieme, remisePourMille };
    const designation = l.designation?.trim();

    let raison: string | undefined;
    let candidats: Candidat[] | undefined;
    let indice: string | undefined;

    if (l.type === "article") {
      const r = await resoudreArticle(l.produitId, l.ref);
      if (r.trouve) {
        plan.push({ ...commun, genre: "PRODUIT", produitId: r.cible.id, prixIgnore: aDesPrix });
        continue;
      }
      raison = r.raison;
      candidats = r.candidats;
    } else if (l.type === "prestation") {
      const r = await resoudrePrestation(l.prestationId, l.ref, designation);
      if (r.trouve) {
        plan.push({ ...commun, genre: "PRESTATION", prestationId: r.cible.id, prixIgnore: aDesPrix });
        continue;
      }
      raison = r.raison;
    } else if (l.ref) {
      // Un Divers DEMANDÉ reste un Divers — mais s'il existe un article pour
      // cette référence, on le dit : la ligne perdrait sinon le suivi du prix.
      const r = await resoudreArticle(undefined, l.ref);
      if (r.trouve) {
        indice = `l'article ${r.cible.refInterne} — ${r.cible.designation} existe au magasin : préférer type "article" (prix et coefficient suivis)`;
      }
    }

    if (!designation) {
      throw new Error(
        raison
          ? `${ou} : ${raison}, et aucune "designation" pour la ligne Divers de repli — la fournir (c'est le libellé que lira le client).`
          : `${ou} : une ligne Divers demande une "designation".`,
      );
    }
    plan.push({
      ...commun,
      genre: "LIBRE",
      designation,
      pvUnitaireCents,
      debourseCents,
      coefMillieme,
      raison,
      candidats,
      indice,
    });
  }

  // --- 2. Écrire, dans l'ordre -----------------------------------------------
  const lotsCrees: { id: string; titre: string }[] = [];
  const lotDefaut =
    input.lotId ?? (input.lotTitre?.trim() ? await lotParTitre(devisId, input.lotTitre, lots, lotsCrees) : null);

  const ecrites: { p: LignePlanifiee; id: string }[] = [];
  for (const p of plan) {
    const s = p.source;
    const lotId =
      s.lotId ?? (s.lotTitre?.trim() ? await lotParTitre(devisId, s.lotTitre, lots, lotsCrees) : lotDefaut);
    const complements = { remisePourMille: p.remisePourMille, option: s.option, note: s.note };
    let id: string;
    switch (p.genre) {
      case "TEXTE":
        ({ id } = await noyauDevis.ajouterLigneTexte(devisId, { lotId, texte: p.texte }));
        break;
      case "PRODUIT":
        ({ id } = await noyauDevis.ajouterLigneProduit(devisId, p.produitId, {
          lotId,
          quantiteMillieme: p.quantiteMillieme,
          ...complements,
        }));
        break;
      case "PRESTATION":
        ({ id } = await noyauDevis.ajouterLignePrestation(devisId, p.prestationId, {
          lotId,
          quantiteMillieme: p.quantiteMillieme,
          ...complements,
        }));
        break;
      case "LIBRE":
        ({ id } = await noyauDevis.ajouterLigneLibre(devisId, {
          genre: "LIBRE",
          designation: p.designation,
          unite: s.unite,
          quantiteMillieme: p.quantiteMillieme,
          lotId,
          pvUnitaireCents: p.pvUnitaireCents,
          debourseCents: p.debourseCents,
          coefMillieme: p.coefMillieme,
          refInterne: s.ref,
          ...complements,
          // La raison du repli reste sur la ligne : relue par dumtools_get_devis.
          note: [s.note?.trim(), p.raison ? `Passée en Divers : ${p.raison}` : ""]
            .filter(Boolean)
            .join(" — "),
        }));
        break;
    }
    ecrites.push({ p, id });
  }
  await prisma.devis.update({ where: { id: devisId }, data: { updatedById: auteur } });

  // --- 3. Relire et rendre compte --------------------------------------------
  const v = (await vueDevis(devisId))!;
  const calculees = new Map(v.t.lots.flatMap((g) => g.lignes).map((lc) => [lc.ligne.id, lc]));
  const lignes = ecrites.map(({ p, id }) => {
    const lc = calculees.get(id)!;
    const l = lc.ligne;
    return sansVides({
      index: p.index,
      id,
      genre: l.genre,
      designation: l.designation,
      quantite: l.genre === "TEXTE" ? null : l.quantiteMillieme / 1000,
      prixVenteUnitaire: l.genre === "TEXTE" ? null : enEuros(l.pvUnitaireCents),
      totalHt: l.genre === "TEXTE" ? null : enEuros(lc.totalCents),
      passeeEnDivers: p.genre === "LIBRE" ? p.raison : null,
      candidats: p.genre === "LIBRE" ? p.candidats : null,
      indice: p.genre === "LIBRE" ? p.indice : null,
      sansPrix: l.genre === "PRODUIT" && l.debourseCents === null,
      aChiffrer: estDiversAChiffrer(l),
      prixIgnore: (p.genre === "PRODUIT" || p.genre === "PRESTATION") && p.prixIgnore,
    });
  });

  const passeesEnDivers = ecrites
    .filter(({ p }) => p.genre === "LIBRE" && p.raison)
    .map(({ p, id }) =>
      sansVides({
        index: p.index,
        id,
        designation: p.source.designation,
        ref: p.source.ref ?? p.source.produitId ?? p.source.prestationId,
        raison: p.genre === "LIBRE" ? p.raison : undefined,
        candidats: p.genre === "LIBRE" ? p.candidats : undefined,
      }),
    );
  const aChiffrer = lignes.filter((l) => l.aChiffrer).map((l) => ({ index: l.index, id: l.id, designation: l.designation }));
  const sansPrix = lignes.filter((l) => l.sansPrix).map((l) => ({ index: l.index, id: l.id, designation: l.designation }));
  const prixIgnores = lignes.filter((l) => l.prixIgnore).length;

  // Les accessoires et variantes que ces articles appellent — PROPOSÉS, jamais
  // posés d'office (même règle que l'éditeur : « Aucun » est une option).
  const presents = new Set(v.c.lignes.map((l) => l.produitId).filter(Boolean));
  const associationsProposees = [];
  const dejaVus = new Set<string>();
  for (const { p } of ecrites) {
    if (p.genre !== "PRODUIT" || dejaVus.has(p.produitId)) continue;
    dejaVus.add(p.produitId);
    const assoc = (await listerAssociations(p.produitId)).filter((a) => a.actif && !presents.has(a.associeId));
    if (assoc.length === 0) continue;
    const declencheur = v.c.lignes.find((l) => l.produitId === p.produitId)!;
    associationsProposees.push({
      pour: { produitId: p.produitId, ref: declencheur.refInterne, designation: declencheur.designation },
      associes: assoc.map((a) =>
        sansVides({
          produitId: a.associeId,
          ref: a.refInterne,
          designation: a.designation,
          type: a.type,
          groupe: a.groupe,
          quantiteProposee: quantiteProposee(a, p.quantiteMillieme / 1000),
          parDefaut: a.parDefaut,
          note: a.note,
        }),
      ),
    });
  }

  const consignes: string[] = [];
  if (passeesEnDivers.length > 0) {
    consignes.push(
      `${passeesEnDivers.length} ligne(s) passée(s) en Divers faute d'article/prestation au référentiel : L'ANNONCER à l'utilisateur, avec la raison. Aucun produit n'a été créé — dumtools_create_produit seulement s'il le demande explicitement.`,
    );
  }
  if (aChiffrer.length > 0) {
    consignes.push(`${aChiffrer.length} ligne(s) Divers à 0 € : demander le prix de vente ou le déboursé.`);
  }
  if (sansPrix.length > 0) {
    consignes.push(`${sansPrix.length} article(s) sans prix connu au magasin : vendus 0 €, à signaler.`);
  }
  if (prixIgnores > 0) {
    consignes.push(
      `Prix fourni ignoré pour ${prixIgnores} article(s)/prestation(s) trouvé(s) : le prix vient du référentiel. Pour le forcer : dumtools_update_devis_ligne.`,
    );
  }
  if (associationsProposees.length > 0) {
    consignes.push("Accessoires/variantes proposés : les SOUMETTRE à l'utilisateur, ne rien ajouter d'office.");
  }

  return {
    devisId,
    ajoutees: ecrites.length,
    lignes,
    ...sansVides({
      lotsCrees: lotsCrees.length ? lotsCrees : null,
      passeesEnDivers: passeesEnDivers.length ? passeesEnDivers : null,
      aChiffrer: aChiffrer.length ? aChiffrer : null,
      sansPrix: sansPrix.length ? sansPrix : null,
      associationsProposees: associationsProposees.length ? associationsProposees : null,
    }),
    totaux: totauxDevisMcp(v.t, v.c.lignes),
    consignes,
  };
}

export interface MajLigneDevisMcp {
  designation?: string;
  unite?: string;
  quantite?: number;
  prixVente?: number;
  coef?: number | null;
  debourse?: number | null;
  remise?: number;
  option?: boolean;
  note?: string;
  texte?: string;
  lotId?: string | null;
  lotTitre?: string;
}

export async function updateDevisLigne(
  ligneId: string,
  input: MajLigneDevisMcp,
  acteurId: string | null,
) {
  const auteur = exigerAuteur(acteurId);
  const ligne = await prisma.ligneDevis.findUnique({
    where: { id: ligneId },
    select: { id: true, devisId: true, genre: true, contenu: true, version: true },
  });
  if (!ligne) return null;

  const patch: noyauDevis.PatchLigne = {};

  if (ligne.genre === "TEXTE") {
    const chiffres = ["designation", "unite", "quantite", "prixVente", "coef", "debourse", "remise", "option"] as const;
    const refuses = chiffres.filter((k) => input[k] !== undefined);
    if (refuses.length > 0) {
      throw new Error(
        `Ligne TEXTE (commentaire) : ${refuses.join(", ")} sans objet — seuls "texte" et le lot se modifient.`,
      );
    }
    if (input.texte !== undefined) {
      const t = input.texte.trim();
      if (!t) throw new Error("texte : vide. Pour retirer le commentaire, dumtools_delete_devis_ligne.");
      const actuel = Array.isArray(ligne.contenu) ? (ligne.contenu as NoteContenu) : null;
      if (actuel !== null && texteNu(actuel) === null) {
        throw new Error(
          "Ce commentaire est un document mis en forme (titres, listes, images…) : le réécrire en texte simple le détruirait. À modifier dans l'éditeur.",
        );
      }
      const r = await noyauDevis.sauverTexteLigne(ligneId, {
        contenu: contenuTexteSimple(t),
        versionBase: ligne.version,
      });
      if (!r.ok) {
        throw new Error("Conflit : ce commentaire vient d'être modifié dans l'éditeur. Relire puis réessayer.");
      }
    }
  } else {
    if (input.texte !== undefined) {
      throw new Error('"texte" ne vaut que pour une ligne TEXTE — le libellé d\'une ligne chiffrée est "designation".');
    }
    if (input.prixVente !== undefined && input.coef !== undefined) {
      throw new Error("prixVente et coef s'excluent : un prix saisi efface le coefficient, un coefficient recalcule le prix.");
    }
    if (input.designation !== undefined) patch.designation = input.designation;
    if (input.unite !== undefined) patch.unite = input.unite;
    if (input.note !== undefined) patch.note = input.note;
    if (input.option !== undefined) patch.option = input.option;
    if (input.quantite !== undefined) patch.quantiteMillieme = versMilliemes(input.quantite, "quantite");
    if (input.remise !== undefined) patch.remisePourMille = versPourMille(input.remise, "remise");
    if (input.debourse !== undefined) {
      patch.debourseCents = input.debourse === null ? null : versCentimes(input.debourse, "debourse");
    }
    if (input.prixVente !== undefined) patch.pvUnitaireCents = versCentimes(input.prixVente, "prixVente");
    if (input.coef !== undefined) patch.coefMillieme = input.coef === null ? null : versCoef(input.coef, "coef");
  }

  if (input.lotId !== undefined) {
    if (input.lotId !== null) {
      const lot = await prisma.lotDevis.findFirst({
        where: { id: input.lotId, devisId: ligne.devisId },
        select: { id: true },
      });
      if (!lot) throw new Error(`Lot « ${input.lotId} » introuvable dans ce devis.`);
    }
    patch.lotId = input.lotId;
  } else if (input.lotTitre?.trim()) {
    const lots = await prisma.lotDevis.findMany({
      where: { devisId: ligne.devisId },
      select: { id: true, titre: true },
    });
    patch.lotId = await lotParTitre(ligne.devisId, input.lotTitre, lots, []);
  }

  if (Object.keys(patch).length > 0) await noyauDevis.majLigne(ligneId, patch);
  await prisma.devis.update({ where: { id: ligne.devisId }, data: { updatedById: auteur } });

  const v = (await vueDevis(ligne.devisId))!;
  const lc = v.t.lots.flatMap((g) => g.lignes).find((x) => x.ligne.id === ligneId)!;
  return { devisId: ligne.devisId, ligne: ligneDevisMcp(lc), totaux: totauxDevisMcp(v.t, v.c.lignes) };
}

export async function deleteDevisLigne(ligneId: string, acteurId: string | null) {
  const auteur = exigerAuteur(acteurId);
  const ligne = await prisma.ligneDevis.findUnique({ where: { id: ligneId }, select: { devisId: true } });
  if (!ligne) return null;
  await noyauDevis.supprimerLigne(ligneId);
  await prisma.devis.update({ where: { id: ligne.devisId }, data: { updatedById: auteur } });
  const v = (await vueDevis(ligne.devisId))!;
  return { devisId: ligne.devisId, deleted: true, totaux: totauxDevisMcp(v.t, v.c.lignes) };
}

/* ---- La reprise du besoin matériel d'une affaire ---- */

export interface RepriseBomMcp {
  chantierId?: string;
  numeroWhy?: string;
  titreLot?: string;
  produitIds?: string[];
  trousEnDivers?: boolean;
}

/**
 * Verse le besoin matériel (BOM) d'une affaire dans un lot du devis.
 *
 * Même règle que l'ajout de lignes : ce que la BOM ne sait pas relier à un
 * produit (automate, module ou point sans nomenclature) ne crée RIEN au
 * Magasin — il passe en Divers à chiffrer, et c'est dit. Les « choix à faire »
 * (variantes non tranchées) ne sont pas versés : ce n'est pas un article
 * manquant, c'est une décision qui revient à l'utilisateur.
 */
export async function reprendreBomDevis(devisId: string, input: RepriseBomMcp, acteurId: string | null) {
  const auteur = exigerAuteur(acteurId);
  const devis = await prisma.devis.findUnique({
    where: { id: devisId },
    select: { id: true, chantierId: true },
  });
  if (!devis) return null;

  let chantierId = devis.chantierId;
  if (input.chantierId || input.numeroWhy) {
    const affaire = await affairePourRef(input);
    if (!affaire) throw affaireIntrouvable(input);
    chantierId = affaire.id;
  }
  if (!chantierId) {
    throw new Error(
      "Ce devis n'est rattaché à aucune affaire : préciser chantierId ou numeroWhy (l'affaire dont on reprend le besoin matériel).",
    );
  }

  const bom = await bomAffaire(chantierId);
  const selection = input.produitIds ? new Set(input.produitIds) : null;
  const retenues = bom.lignes.filter(
    (l) => !l.horsFourniture && l.besoin > 0 && (!selection || selection.has(l.produitId)),
  );
  const ignores = selection
    ? [...selection].filter((id) => !retenues.some((l) => l.produitId === id))
    : [];
  // Une SÉLECTION d'articles ne verse pas les trous, sauf demande : on a choisi
  // ce qu'on voulait reprendre.
  const trousEnDivers = input.trousEnDivers ?? !selection;
  const trous = trousEnDivers ? bom.trous.filter((t) => t.genre !== "variante") : [];

  const titreLot = input.titreLot?.trim() || "Fourniture";
  const { ajoutees, lotId: lotArticles } = await noyauDevis.reprendreBom(
    devisId,
    chantierId,
    retenues.map((l) => l.produitId),
    { titreLot },
  );
  let lotId = lotArticles;

  const passeesEnDivers: { id: string; designation: string; quantite: number; genre: string }[] = [];
  if (trous.length > 0) {
    lotId ??= (await noyauDevis.ajouterLot(devisId, titreLot)).id;
    for (const t of trous) {
      const { id } = await noyauDevis.ajouterLigneLibre(devisId, {
        genre: "LIBRE",
        designation: t.nom,
        quantiteMillieme: Math.max(1, t.occurrences) * 1000,
        lotId,
        refInterne: t.genre === "automate" || t.genre === "module" ? t.cle : null,
        note: `Passée en Divers : ${GENRE_TROU_LABEL[t.genre].toLowerCase()} du besoin matériel non relié(e) à un produit du magasin — à chiffrer`,
      });
      passeesEnDivers.push({ id, designation: t.nom, quantite: t.occurrences, genre: GENRE_TROU_LABEL[t.genre] });
    }
  }
  if (ajoutees + passeesEnDivers.length > 0) {
    await prisma.devis.update({ where: { id: devisId }, data: { updatedById: auteur } });
  }

  const v = (await vueDevis(devisId))!;
  const sansPrix = retenues.filter((l) => l.pmpCents === null).map((l) => `${l.refInterne} — ${l.designation}`);
  const choixAFaire = bom.trous.filter((t) => t.genre === "variante").map((t) => t.nom);
  const consignes: string[] = [];
  if (passeesEnDivers.length > 0) {
    consignes.push(
      `${passeesEnDivers.length} élément(s) du besoin sans produit relié, versé(s) en Divers à 0 € : l'annoncer, et demander les prix. Aucun produit n'a été créé.`,
    );
  }
  if (choixAFaire.length > 0) {
    consignes.push(`Variantes non tranchées sur l'affaire (non versées) : ${choixAFaire.join(", ")}.`);
  }
  if (sansPrix.length > 0) consignes.push(`${sansPrix.length} article(s) sans prix connu au magasin.`);
  if (ajoutees + passeesEnDivers.length > 0) {
    consignes.push("⚠️ Rejouer la reprise AJOUTE à nouveau les lignes : elle ne synchronise pas.");
  }

  return {
    devisId,
    chantierId,
    lotId,
    articlesAjoutes: ajoutees,
    ...sansVides({
      passeesEnDivers: passeesEnDivers.length ? passeesEnDivers : null,
      choixAFaire: choixAFaire.length ? choixAFaire : null,
      horsFourniture: bom.lignes.some((l) => l.horsFourniture)
        ? bom.lignes.filter((l) => l.horsFourniture).map((l) => `${l.refInterne} — ${l.designation}`)
        : null,
      sansPrix: sansPrix.length ? sansPrix : null,
      produitIdsIgnores: ignores.length ? ignores : null,
    }),
    totaux: totauxDevisMcp(v.t, v.c.lignes),
    consignes,
  };
}

/* ---- Le Magasin : créer un produit, SUR DEMANDE EXPLICITE seulement ---- */

export interface CreerProduitMcp {
  demandeExplicite: boolean;
  refInterne: string;
  designation: string;
  unite?: string;
  refFabricant?: string;
  refFournisseur?: string;
  prixAchat?: number;
  categorie?: string;
  fabricant?: string;
  fournisseur?: string;
  note?: string;
}

/** Un nom de référentiel EXISTANT → son id. Le MCP n'en crée aucun (catégorie,
 *  fabricant, fournisseur) : c'est l'écran du Magasin qui fusionne et range. */
function idReferentiel(lignes: { id: string; nom: string }[], nom: string | undefined, quoi: string): string | null {
  const n = nom?.trim();
  if (!n) return null;
  const cle = cleReferentiel(n);
  const t = lignes.find((l) => cleReferentiel(l.nom) === cle);
  if (!t) {
    const noms = lignes.map((l) => l.nom);
    throw new Error(
      `${quoi} « ${n} » inconnu(e) du référentiel — le MCP n'en crée pas. Existant(e)s : ${noms.slice(0, 40).join(", ")}${noms.length > 40 ? "…" : ""}.`,
    );
  }
  return t.id;
}

export async function createProduit(input: CreerProduitMcp, acteurId: string | null) {
  if (input.demandeExplicite !== true) {
    throw new Error(
      "Création refusée : un produit ne se crée que sur DEMANDE EXPLICITE de l'utilisateur (demandeExplicite: true). Par défaut, un article absent du magasin se chiffre en Divers.",
    );
  }
  const auteur = exigerAuteur(acteurId);
  const user = await prisma.user.findUnique({ where: { id: auteur }, select: { role: true, actif: true } });
  if (!user?.actif) throw new Error("Création refusée : compte inconnu ou inactif.");
  if (!peutGererReferentiel(user.role)) {
    throw new Error("Création refusée : le référentiel produit est réservé aux profils Achats et Administrateur.");
  }

  const refInterne = input.refInterne.trim();
  const existant = await prisma.produit.findFirst({
    where: { refInterne: { equals: refInterne, mode: "insensitive" } },
    select: { id: true, refInterne: true, designation: true, actif: true },
  });
  if (existant) {
    throw new Error(
      `La référence interne « ${existant.refInterne} » existe déjà (${existant.designation}${existant.actif ? "" : ", ARCHIVÉ"}) — produitId ${existant.id}. L'utiliser plutôt que d'en créer un second.`,
    );
  }

  const [categories, fabricants, fournisseurs] = await Promise.all([
    prisma.categorieProduit.findMany({ select: { id: true, nom: true }, orderBy: { ordre: "asc" } }),
    prisma.fabricant.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } }),
    prisma.fournisseur.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } }),
  ]);

  const { id } = await enregistrerProduitNoyau(
    { id: auteur, role: user.role },
    {
      refInterne,
      designation: input.designation,
      unite: input.unite,
      refFabricant: input.refFabricant,
      refFournisseur: input.refFournisseur,
      prixAchatCents: input.prixAchat === undefined ? null : versCentimes(input.prixAchat, "prixAchat"),
      categorieId: idReferentiel(categories, input.categorie, "Catégorie"),
      fabricantId: idReferentiel(fabricants, input.fabricant, "Fabricant"),
      fournisseurId: idReferentiel(fournisseurs, input.fournisseur, "Fournisseur"),
      note: input.note,
    },
  );
  return {
    produitId: id,
    refInterne,
    designation: input.designation.trim(),
    url: `/outils/magasin/produits/${id}`,
    consigne:
      "Produit créé au Magasin. Pour remplacer une ligne Divers par cet article : dumtools_delete_devis_ligne, puis dumtools_add_devis_lignes (type article, produitId).",
  };
}
