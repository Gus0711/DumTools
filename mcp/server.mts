#!/usr/bin/env -S npx tsx
// Serveur MCP DumTools (transport stdio, usage local).
//
// Charge d'abord dotenv (DATABASE_URL) AVANT tout import qui touche la BDD :
// data.mts → ../src/lib/db instancie le pool Prisma à l'évaluation du module.
import "dotenv/config";

import { AsyncLocalStorage } from "node:async_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import {
  addProjectModule,
  buildRows,
  createAffaire,
  createNote,
  createProject,
  deleteNote,
  deleteProject,
  getAffaire,
  getClient,
  getMateriel,
  getNote,
  getProject,
  listAffaires,
  listNotes,
  setNotePartage,
  updateNote,
  listCatalogPoints,
  listClients,
  listModeles,
  listProjects,
  recommendForBesoin,
  recommendForProject,
  removeProjectModule,
  resolveMcpUserId,
  resolveUserByToken,
  setProjectController,
  setProjectPower,
  updateAffaire,
  updateProjectMeta,
  updateProjectRows,
  upsertCatalogPoint,
  listWikiRubriques,
  listWikiPages,
  getWikiPage,
  searchWiki,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  type AuthUser,
  type RowInput,
  brancherActeur,
} from "./data.mts";

const CHARACTER_LIMIT = 25000;

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Réponse succès : JSON lisible en texte + structuredContent (tronqué si énorme). */
function ok(data: Record<string, unknown>): ToolResult {
  let text = JSON.stringify(data, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    text =
      text.slice(0, CHARACTER_LIMIT) +
      `\n\n… [réponse tronquée à ${CHARACTER_LIMIT} caractères. Affinez la requête ou récupérez un élément précis par id.]`;
  }
  return { content: [{ type: "text", text }], structuredContent: data };
}

/** Réponse erreur actionnable. */
function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: `Erreur : ${message}` }], isError: true };
}

async function run<T extends Record<string, unknown>>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

const IO_TYPE = z.enum(["AI", "DI", "AO", "DO", "COM"]);
const ETAT_AFFAIRE = z.enum(["DEVIS", "COMMANDE", "EN_COURS", "LIVRE", "CLOTURE"]);
const BESOIN_ARMOIRE = z.enum(["INTEGRATION", "NOUVELLE"]);
const POWER_SUPPLY = z.enum(["none", "integrated", "230V"]);

// Utilisateur courant, porté par requête en mode HTTP (résolu depuis le jeton).
const userContext = new AsyncLocalStorage<AuthUser>();
// Fallback stdio (local) : id résolu au démarrage depuis MCP_USER_EMAIL.
let mcpUserId: string | null = null;

/** Id de l'utilisateur à créditer pour une écriture (jeton HTTP, sinon stdio). */
function currentUserId(): string | null {
  return userContext.getStore()?.id ?? mcpUserId;
}

// data.mts trace l'auteur des modifications (`updatedById`, fil d'activité) mais
// ne peut pas importer ce module sans cycle : on lui branche le résolveur.
brancherActeur(currentUserId);

// ============================================================================
// CONSTRUCTION DU SERVEUR
// Une instance par requête HTTP (isolation) ; une seule en stdio.
// ============================================================================

function buildServer(): McpServer {
const server = new McpServer({ name: "dumtools-mcp-server", version: "1.0.0" });

// ---- LECTURE ----

server.registerTool(
  "dumtools_list_projects",
  {
    title: "Lister les projets GTB",
    description: `Liste tous les projets « Projet GTB » (affaires chantier), du plus récemment modifié au plus ancien.

Retourne pour chaque projet : id, nom, clientNom, numeroWhy (réf. WhySoft), automate (controller), nb de points d'E/S actifs, nb de modules, auteur, date de modif (ISO).

Utiliser pour : retrouver un projet par nom/client, avoir une vue d'ensemble. Pour le détail complet d'un projet (points, modules, réseaux), enchaîner avec dumtools_get_project.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => run(async () => {
    const projets = await listProjects();
    return { count: projets.length, projets };
  }),
);

server.registerTool(
  "dumtools_get_project",
  {
    title: "Détail d'un projet GTB",
    description: `Récupère le projet complet : identification (nom, client, numeroWhy, en-tête, version, date), automate & réseaux, la liste de points (rows : saisie, 1 ligne = 1 type d'E/S), les E/S physiques affectées aux bornes (points : module/canal/repère/signal + suivi de mise en service), et les modules.

Args : id (string) — l'id du projet (voir dumtools_list_projects).

Les 'rows' sont la source de saisie ; les 'points' en sont dérivés (affectés aux bornes). Pour modifier la liste, utiliser dumtools_update_project_rows.`,
    inputSchema: { id: z.string().min(1).describe("Id du projet") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const p = await getProject(id);
    if (!p) throw new Error(`Projet introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_projects.`);
    return { projet: p };
  }),
);

server.registerTool(
  "dumtools_list_clients",
  {
    title: "Lister les clients",
    description: `Liste le référentiel client partagé (ordre alphabétique) avec, pour chacun, le nombre total de réalisations tous outils confondus.

Retourne : id, nom, nbRealisations, date de modif (ISO). Pour la fiche détaillée d'un client (ses projets), utiliser dumtools_get_client.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => run(async () => {
    const clients = await listClients();
    return { count: clients.length, clients };
  }),
);

server.registerTool(
  "dumtools_get_client",
  {
    title: "Fiche client (agrégation)",
    description: `Fiche d'un client : agrège tout ce qui a été produit pour lui à travers les outils (aujourd'hui : les projets GTB rattachés).

Args : id (string) — l'id du client (voir dumtools_list_clients).

Retourne : id, nom, realisations[] (id, titre, numeroWhy, resume « N modules · M E/S », date de modif).`,
    inputSchema: { id: z.string().min(1).describe("Id du client") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const c = await getClient(id);
    if (!c) throw new Error(`Client introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_clients.`);
    return { client: c };
  }),
);

server.registerTool(
  "dumtools_list_affaires",
  {
    title: "Lister les affaires",
    description: `Liste toutes les affaires (Chantier), de la plus récemment modifiée à la plus ancienne. Une affaire = 1 numéro Why, porte l'identification (client, n° Why) et regroupe N automates (projets GTB).

Retourne pour chacune : id, nom, numeroWhy, etat (DEVIS|COMMANDE|EN_COURS|LIVRE|CLOTURE), besoinArmoire (INTEGRATION|NOUVELLE|null), clientNom, nbAutomates, date de modif (ISO).

Pour le détail (automates + documents rattachés), enchaîner avec dumtools_get_affaire.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => run(async () => {
    const affaires = await listAffaires();
    return { count: affaires.length, affaires };
  }),
);

server.registerTool(
  "dumtools_get_affaire",
  {
    title: "Détail d'une affaire",
    description: `Fiche d'une affaire : identification (nom, client, numeroWhy, etat, besoinArmoire) + tout ce qui lui est rattaché.

Args : id (string) — l'id de l'affaire (voir dumtools_list_affaires).

Retourne : affaire { id, nom, numeroWhy, etat, besoinArmoire, clientId, clientNom, automates[] (projets GTB : id, nom, controller, nbPoints, nbModules, date), documents[] (GED : id, nom, categorie, taille, statutSync, date), notes[] (id, titre, resume, partagee, date — contenu via dumtools_get_note) }.`,
    inputSchema: { id: z.string().min(1).describe("Id de l'affaire") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const a = await getAffaire(id);
    if (!a) throw new Error(`Affaire introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_affaires.`);
    return { affaire: a };
  }),
);

server.registerTool(
  "dumtools_list_catalog",
  {
    title: "Catalogue de points & modèles",
    description: `Liste le catalogue de points partagé (nom → type d'E/S + signal par défaut) et les modèles de saisie (sections pré-remplies : Chaudière, CTA…).

Retourne : points[] (id, nom, type AI|DI|AO|DO|COM, signal) et modeles[] (id, nom, ordre, points[]).

Utile avant d'éditer une liste de points (dumtools_update_project_rows) pour reprendre des noms/types cohérents.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => run(async () => {
    const [points, modeles] = await Promise.all([listCatalogPoints(), listModeles()]);
    return { points, modeles };
  }),
);

server.registerTool(
  "dumtools_list_materiel",
  {
    title: "Base matériel (automates & modules)",
    description: `Liste la base matériel Distech : automates (référence, E/S intégrées, extensibilité, maxModules, maxPoints, modules compatibles, docUrl fiche technique) et modules d'extension/communication (type, catégorie, capacités E/S, docUrl).

Retourne : automates[] et modules[]. Sert de référence pour choisir un automate (dumtools_set_project_controller) ou comprendre une recommandation.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => run(async () => {
    const cat = await getMateriel();
    return { automates: cat.automates, modules: cat.modules };
  }),
);

server.registerTool(
  "dumtools_recommend_controller",
  {
    title: "Recommander un automate",
    description: `Propose les automates Distech adaptés à un besoin d'E/S, du plus efficace au moins efficace (le moins d'appareils, puis le moins d'E/S gaspillées). Respecte extensibilité, modules compatibles, maxModules et maxPoints.

Deux modes :
  - depuis un projet existant : fournir projectId (le besoin est calculé sur ses points actifs) ;
  - depuis un besoin saisi : fournir entreesAna, entreesTor, sortiesAna, sortiesTor (nombres).

Retourne : besoin (récapitulatif) et propositions[] (reference, modules à ajouter, appareils, gaspillage, couvreSansModule…).`,
    inputSchema: {
      projectId: z.string().optional().describe("Id d'un projet — calcule le besoin sur ses points actifs"),
      entreesAna: z.number().int().min(0).optional().describe("Entrées analogiques (mode besoin saisi)"),
      entreesTor: z.number().int().min(0).optional().describe("Entrées logiques/TOR (mode besoin saisi)"),
      sortiesAna: z.number().int().min(0).optional().describe("Sorties analogiques (mode besoin saisi)"),
      sortiesTor: z.number().int().min(0).optional().describe("Sorties logiques/TOR (mode besoin saisi)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ projectId, entreesAna, entreesTor, sortiesAna, sortiesTor }) => run(async () => {
    if (projectId) {
      const r = await recommendForProject(projectId);
      if (!r) throw new Error(`Projet introuvable pour l'id « ${projectId} ».`);
      return { ...r };
    }
    const ea = entreesAna ?? 0, et = entreesTor ?? 0, sa = sortiesAna ?? 0, st = sortiesTor ?? 0;
    if (ea + et + sa + st === 0) {
      throw new Error("Fournir soit projectId, soit un besoin non nul (entreesAna/entreesTor/sortiesAna/sortiesTor).");
    }
    const besoin = {
      entrees: ea + et,
      sorties: sa + st,
      entreesAna: ea,
      entreesTor: et,
      sortiesAna: sa,
      sortiesTor: st,
    };
    return { ...(await recommendForBesoin(besoin)) };
  }),
);

// ============================================================================
// ÉCRITURE  (BDD partagée : les modifications sont visibles par tous)
// ============================================================================

server.registerTool(
  "dumtools_create_project",
  {
    title: "Créer un projet GTB",
    description: `Crée un projet GTB rattaché à une affaire (obligatoire — pas de projet orphelin).

Args : clientNom (requis), numeroWhy (réf. WhySoft, requis) — l'affaire est retrouvée par son n° Why, ou créée si elle n'existe pas ; nom? (string), header? (en-tête « CLIENT - SITE »).

Erreur si l'affaire ne peut être résolue (client + n° Why manquants). Retourne : { id }. Enchaîner avec dumtools_update_project_rows pour saisir les points.`,
    inputSchema: {
      clientNom: z.string().min(1).describe("Nom du client (rattaché au référentiel, créé si absent) — requis"),
      numeroWhy: z.string().min(1).describe("Numéro d'affaire WhySoft — requis (clé de rattachement à l'affaire)"),
      nom: z.string().optional().describe("Nom du projet (automate)"),
      header: z.string().optional().describe("En-tête du document (ex. « MAIRIE DE X - CHAUFFERIE »)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => run(async () => {
    const { id } = await createProject(input, currentUserId());
    return { id, created: true };
  }),
);

server.registerTool(
  "dumtools_create_affaire",
  {
    title: "Créer une affaire",
    description: `Crée une affaire (Chantier) rattachée à un client. Le numéro Why est unique : c'est la clé qui rattachera automatiquement les projets GTB saisis avec ce même n° Why (regroupement multi-automate).

Args : nom (string, requis), clientNom (string, requis — rattaché/créé dans le référentiel), numeroWhy? (réf. WhySoft).

Retourne : { id } de l'affaire créée. Erreur si le numeroWhy est déjà pris.`,
    inputSchema: {
      nom: z.string().min(1).describe("Nom de l'affaire"),
      clientNom: z.string().min(1).describe("Nom du client (créé si absent)"),
      numeroWhy: z.string().optional().describe("Numéro d'affaire WhySoft (unique)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => run(async () => {
    const { id } = await createAffaire(input);
    return { id, created: true };
  }),
);

server.registerTool(
  "dumtools_update_affaire",
  {
    title: "Modifier une affaire",
    description: `Met à jour une affaire : identité (nom, client, n° Why), état d'avancement et besoin en armoire. Seuls les champs fournis changent. Si l'identité change, l'info dénormalisée sur les automates rattachés est resynchronisée.

Args : id (string, requis) ; nom?, clientNom?, numeroWhy? ; etat? (DEVIS|COMMANDE|EN_COURS|LIVRE|CLOTURE) ; besoinArmoire? (INTEGRATION|NOUVELLE|null pour non défini).

Retourne : { updatedAt }. Erreur si le numeroWhy entre en collision avec une autre affaire.`,
    inputSchema: {
      id: z.string().min(1).describe("Id de l'affaire"),
      nom: z.string().optional(),
      clientNom: z.string().optional().describe("Re-rattache au référentiel client"),
      numeroWhy: z.string().optional(),
      etat: ETAT_AFFAIRE.optional().describe("État d'avancement"),
      besoinArmoire: BESOIN_ARMOIRE.nullable().optional().describe("Besoin en armoire (null = non défini)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, ...input }) => run(async () => {
    const r = await updateAffaire(id, input);
    if (!r) throw new Error(`Affaire introuvable pour l'id « ${id} ».`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_update_project_meta",
  {
    title: "Modifier l'identification d'un projet",
    description: `Met à jour les champs d'identification d'un projet (sans toucher aux points). Seuls les champs fournis sont modifiés.

Args : id (string, requis) ; nom?, clientNom? (re-rattache au référentiel), numeroWhy?, header?, document_title?, version?.

Retourne : { updatedAt }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id du projet"),
      nom: z.string().optional(),
      clientNom: z.string().optional(),
      numeroWhy: z.string().optional(),
      header: z.string().optional(),
      document_title: z.string().optional(),
      version: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, ...input }) => run(async () => {
    const r = await updateProjectMeta(id, input);
    if (!r) throw new Error(`Projet introuvable pour l'id « ${id} ».`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_update_project_rows",
  {
    title: "Éditer la liste de points d'un projet",
    description: `Remplace INTÉGRALEMENT la liste de points (rows) d'un projet, puis re-dérive les E/S physiques et les ré-affecte automatiquement aux bornes (comme l'éditeur : syncPoints → affecterAuto).

⚠️ Remplacement total : d'abord appeler dumtools_get_project pour récupérer les rows existantes, les modifier, puis renvoyer la liste COMPLÈTE. Conservez l'« id » de chaque ligne existante pour préserver son affectation et son suivi de mise en service (les lignes sans id sont créées).

Args :
  - id (string, requis) : id du projet.
  - rows (array, requis) : chaque élément =
      { id?, kind? ('point'|'section', défaut 'point'), nom (string),
        note? (texte libre, points), type? (AI|DI|AO|DO|COM — requis pour un point),
        signal? (ex. PT1000, 0-10V, D) }.
    Règle métier : 1 ligne = 1 type d'E/S exclusif. Les sections n'ont qu'un nom. Les COM ne produisent pas de borne physique.

Retourne : { updatedAt, nbPoints }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id du projet"),
      rows: z
        .array(
          z.object({
            id: z.string().optional().describe("Id d'une ligne existante à conserver (sinon générée)"),
            kind: z.enum(["point", "section"]).optional().describe("Type de ligne (défaut 'point')"),
            nom: z.string().min(1).describe("Libellé du point ou titre de section"),
            note: z.string().optional().describe("Texte libre (points)"),
            type: IO_TYPE.optional().describe("Type d'E/S exclusif (requis pour un point)"),
            signal: z.string().optional().describe("Signal électrique (défaut selon le type)"),
          }),
        )
        .describe("Liste COMPLÈTE des lignes (remplace l'existant)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async ({ id, rows }) => run(async () => {
    const r = await updateProjectRows(id, buildRows(rows as RowInput[]));
    if (!r) throw new Error(`Projet introuvable pour l'id « ${id} ».`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_set_project_controller",
  {
    title: "Choisir l'automate d'un projet",
    description: `Définit l'automate (contrôleur) d'un projet : réconcilie les modules (remplace le module intégré n°0 par celui de l'automate) puis ré-affecte automatiquement les points aux bornes.

Args : id (string, requis) ; reference (string, requis) — référence d'automate (ex. « ECY-600 », voir dumtools_list_materiel). Une référence inconnue laisse le projet sans E/S intégrées à affecter.

Retourne : { updatedAt, modules } (nb de modules après réconciliation).`,
    inputSchema: {
      id: z.string().min(1).describe("Id du projet"),
      reference: z.string().min(1).describe("Référence d'automate (ex. ECY-600)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, reference }) => run(async () => {
    const r = await setProjectController(id, reference);
    if (!r) throw new Error(`Projet introuvable pour l'id « ${id} ».`);
    return { id, reference, ...r };
  }),
);

server.registerTool(
  "dumtools_add_module",
  {
    title: "Ajouter un module au projet",
    description: `Ajoute un module d'extension ou de communication à un projet, puis ré-affecte automatiquement les points aux bornes (comme le bouton « Ajouter un module » de l'éditeur). Le module reçoit le prochain numéro d'extension libre.

Args : id (string, requis) — id du projet ; type (string, requis) — type de module (ex. « 8UI6UO », « 16DI », « MBUS » ; voir dumtools_list_materiel pour les types disponibles).

⚠️ Ne sert PAS à choisir l'automate lui-même (ses E/S intégrées) : utiliser dumtools_set_project_controller. Les accessoires (écran) ne sont pas ajoutables ici.

Retourne : { updatedAt, modules (nb total après ajout), module: { number, type } }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id du projet"),
      type: z.string().min(1).describe("Type de module (ex. 8UI6UO, 16DI, 8DOR, 4UI4UO, MBUS, RS485)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ id, type }) => run(async () => {
    const r = await addProjectModule(id, type);
    if (!r) throw new Error(`Projet introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_projects.`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_remove_module",
  {
    title: "Retirer un module du projet",
    description: `Retire un module d'extension/communication d'un projet (par son numéro), puis ré-affecte automatiquement les points aux bornes restantes.

Args : id (string, requis) — id du projet ; number (entier, requis) — numéro du module à retirer (voir dumtools_get_project → modules[].number).

⚠️ Ne retire PAS les E/S intégrées de l'automate (module n°0) : pour cela, changer d'automate avec dumtools_set_project_controller.

Retourne : { updatedAt, modules (nb restant), removed: { number, type } }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id du projet"),
      number: z.number().int().describe("Numéro du module à retirer (modules[].number)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async ({ id, number }) => run(async () => {
    const r = await removeProjectModule(id, number);
    if (!r) throw new Error(`Projet introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_projects.`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_set_project_power",
  {
    title: "Définir l'alimentation d'un projet",
    description: `Définit le bloc d'alimentation associé à l'automate (affiché dans le document, sans impact sur l'affectation des E/S).

Args : id (string, requis) ; power (string, requis) — « none » (aucune), « integrated » (24 VAC/DC, ECY-PS24) ou « 230V » (100–240 VAC, ECY-PS100-240).

Retourne : { updatedAt, power_supply }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id du projet"),
      power: POWER_SUPPLY.describe("none | integrated | 230V"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, power }) => run(async () => {
    const r = await setProjectPower(id, power);
    if (!r) throw new Error(`Projet introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_projects.`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_upsert_catalog_point",
  {
    title: "Ajouter/éditer un point du catalogue",
    description: `Ajoute ou met à jour un point du catalogue partagé (clé = nom). Alimente le combobox de saisie de l'éditeur.

Args : nom (string, requis) ; type (AI|DI|AO|DO|COM, requis) ; signal? (ex. PT1000, 0-10V, D ; null = défaut selon le type).

Retourne : le point { id, nom, type, signal }.`,
    inputSchema: {
      nom: z.string().min(1).describe("Nom du point (clé unique)"),
      type: IO_TYPE.describe("Type d'E/S"),
      signal: z.string().nullable().optional().describe("Signal électrique par défaut"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ nom, type, signal }) => run(async () => {
    const point = await upsertCatalogPoint(nom, type, signal ?? null);
    return { point };
  }),
);

server.registerTool(
  "dumtools_delete_project",
  {
    title: "Supprimer un projet GTB",
    description: `Supprime DÉFINITIVEMENT un projet GTB. Action irréversible sur une base partagée — à n'utiliser que sur confirmation explicite de l'utilisateur.

Args : id (string, requis).

Retourne : { deleted: true } si supprimé.`,
    inputSchema: { id: z.string().min(1).describe("Id du projet à supprimer") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const deleted = await deleteProject(id);
    if (!deleted) throw new Error(`Projet introuvable pour l'id « ${id} » (déjà supprimé ?).`);
    return { id, deleted: true };
  }),
);

// ---- NOTES (documents riches d'affaire) ----
// Le contenu s'échange en MARKDOWN : à la lecture les blocs métier sont rendus
// en équivalents (table de données → table markdown, HTML embarqué → bloc de
// code ```html, carte lien → lien) ; à l'écriture le markdown devient des blocs
// standard (une table markdown → tableau riche). Voir docs/NOTES.md.

server.registerTool(
  "dumtools_list_notes",
  {
    title: "Lister les notes",
    description: `Liste les notes d'affaire (documents riches type Notion : texte, tables de données, images, fichiers, HTML embarqué), de la plus récemment modifiée à la plus ancienne.

Args : chantierId? (string) — limiter aux notes d'une affaire (voir dumtools_list_affaires).

Retourne pour chacune : id, titre, chantierId, affaireNom, clientNom, numeroWhy, partagee (lien public actif), auteur, resume (extrait), updatedAt (ISO). Pour le contenu complet, enchaîner avec dumtools_get_note.`,
    inputSchema: {
      chantierId: z.string().min(1).optional().describe("Limiter aux notes de cette affaire"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ chantierId }) => run(async () => {
    const notes = await listNotes(chantierId);
    return { count: notes.length, notes };
  }),
);

server.registerTool(
  "dumtools_get_note",
  {
    title: "Lire une note",
    description: `Récupère une note complète, contenu rendu en MARKDOWN (les tables de données typées deviennent des tables markdown, les blocs HTML embarqués des blocs de code \`\`\`html, les cartes lien des liens).

Args : id (string) — l'id de la note (voir dumtools_list_notes).

Retourne : id, titre, markdown, version (sert à l'anti-collision), affaire (chantierId, affaireNom, clientNom, numeroWhy), urlPublique (null si non partagée), auteur, updatedAt. Les images/pièces jointes apparaissent comme des liens /api/notes/media/… (authentifiés).`,
    inputSchema: { id: z.string().min(1).describe("Id de la note") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const note = await getNote(id);
    if (!note) throw new Error(`Note introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_notes.`);
    return { note };
  }),
);

server.registerTool(
  "dumtools_create_note",
  {
    title: "Créer une note",
    description: `Crée une note rattachée à une affaire EXISTANTE (« affaire d'abord » : pas de note orpheline, même via MCP).

Args : chantierId? OU numeroWhy? (l'un des deux, requis) — l'affaire de rattachement ; titre? (défaut « Nouvelle note ») ; markdown? — contenu initial en markdown (titres, listes, todo, tables, code…).

Le markdown est converti en blocs riches : une table markdown devient un tableau riche éditable. Les blocs métier avancés (table de données typée, HTML embarqué) se créent ensuite dans l'éditeur web (/outils/notes).

Retourne : { id } — l'URL d'édition est /outils/notes/{id}.`,
    inputSchema: {
      chantierId: z.string().min(1).optional().describe("Id de l'affaire de rattachement"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire"),
      titre: z.string().optional().describe("Titre de la note"),
      markdown: z.string().optional().describe("Contenu initial (markdown)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => run(async () => {
    const { id } = await createNote(input, currentUserId());
    return { id, url: `/outils/notes/${id}` };
  }),
);

server.registerTool(
  "dumtools_update_note",
  {
    title: "Modifier une note",
    description: `Met à jour le titre et/ou le contenu d'une note. ⚠️ markdown REMPLACE TOUT le contenu (pas un patch) : pour modifier partiellement, lire d'abord avec dumtools_get_note, éditer le markdown, puis renvoyer l'ensemble.

Même anti-collision que l'éditeur web : si un collègue a sauvé entre-temps, l'appel échoue avec un message explicite — relire puis réappliquer.

Limite : les blocs métier (table de données typée, HTML embarqué, carte lien) sont rendus en markdown à la lecture mais REDEVIENNENT des blocs standard à l'écriture (une table de données ressort en tableau riche simple). Éviter de réécrire une note qui en contient si on veut les préserver.

Args : id (requis) ; titre? ; markdown?.

Retourne : { updatedAt, version }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id de la note"),
      titre: z.string().optional().describe("Nouveau titre"),
      markdown: z.string().optional().describe("Nouveau contenu complet (markdown)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ id, ...input }) => run(async () => {
    const r = await updateNote(id, input);
    if (!r) throw new Error(`Note introuvable pour l'id « ${id} ».`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_share_note",
  {
    title: "Partager / révoquer une note",
    description: `Active ou révoque le lien public d'une note : lecture seule, accessible SANS compte (y compris depuis l'extérieur — l'app est exposée sur internet). Idempotent : réactiver conserve le lien déjà envoyé ; révoquer le tue immédiatement.

Args : id (requis) ; actif (boolean, requis) — true = créer/garder le lien, false = révoquer.

Retourne : { urlPublique } (null après révocation).`,
    inputSchema: {
      id: z.string().min(1).describe("Id de la note"),
      actif: z.boolean().describe("true = partager, false = révoquer"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, actif }) => run(async () => {
    const r = await setNotePartage(id, actif);
    if (!r) throw new Error(`Note introuvable pour l'id « ${id} ».`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_delete_note",
  {
    title: "Supprimer une note",
    description: `Supprime DÉFINITIVEMENT une note (et ses images/pièces jointes sur le serveur). Action irréversible sur une base partagée — à n'utiliser que sur confirmation explicite de l'utilisateur.

Args : id (string, requis).

Retourne : { deleted: true } si supprimé.`,
    inputSchema: { id: z.string().min(1).describe("Id de la note à supprimer") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const deleted = await deleteNote(id);
    if (!deleted) throw new Error(`Note introuvable pour l'id « ${id} » (déjà supprimée ?).`);
    return { id, deleted: true };
  }),
);

// ---- WIKI (base de connaissances interne d'entreprise) ----
// Savoir DURABLE et transverse (procédures, savoir-faire GTB, méthodes), NON
// rattaché à une affaire. Organisation : rubrique (thème) → pages. Recherche
// plein-texte. Le contenu s'échange en MARKDOWN (comme les notes).

server.registerTool(
  "dumtools_list_wiki_rubriques",
  {
    title: "Lister les rubriques du wiki",
    description: `Liste les rubriques (thèmes) du wiki d'entreprise, dans l'ordre d'affichage, avec le nombre de pages de chacune.

Retourne : rubriques[] (id, slug, nom, description, nbPages). Le slug (ex. « chantier », « dev-automatisme ») sert à créer/lister des pages. Pour les pages d'une rubrique, enchaîner avec dumtools_list_wiki_pages.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => run(async () => {
    const rubriques = await listWikiRubriques();
    return { count: rubriques.length, rubriques };
  }),
);

server.registerTool(
  "dumtools_list_wiki_pages",
  {
    title: "Lister les pages du wiki",
    description: `Liste les pages du wiki, de la plus récemment modifiée à la plus ancienne.

Args : rubrique? (string) — slug ou id d'une rubrique pour ne lister que ses pages (voir dumtools_list_wiki_rubriques) ; sans argument, liste toutes les pages.

Retourne pour chacune : id, titre, rubriqueSlug, rubriqueNom, parentId (page parente dans l'arborescence, null = racine), resume (description ou extrait), tags[], auteur, updatedAt (ISO). Pour le contenu complet, enchaîner avec dumtools_get_wiki_page. Pour chercher par mot-clé, utiliser dumtools_search_wiki.`,
    inputSchema: {
      rubrique: z.string().min(1).optional().describe("Slug ou id d'une rubrique (sinon toutes les pages)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ rubrique }) => run(async () => {
    const pages = await listWikiPages(rubrique);
    return { count: pages.length, pages };
  }),
);

server.registerTool(
  "dumtools_get_wiki_page",
  {
    title: "Lire une page du wiki",
    description: `Récupère une page complète du wiki, contenu rendu en MARKDOWN (les tables de données typées deviennent des tables markdown, les blocs HTML embarqués des blocs de code \`\`\`html, les cartes lien des liens).

Args : id (string) — l'id de la page (voir dumtools_list_wiki_pages ou dumtools_search_wiki).

Retourne : id, titre, resume, rubriqueSlug, rubriqueNom, parentId (page parente, null = racine), tags[], version (sert à l'anti-collision), auteur, markdown, updatedAt.`,
    inputSchema: { id: z.string().min(1).describe("Id de la page wiki") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const page = await getWikiPage(id);
    if (!page) throw new Error(`Page wiki introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_wiki_pages.`);
    return { page };
  }),
);

server.registerTool(
  "dumtools_search_wiki",
  {
    title: "Rechercher dans le wiki",
    description: `Recherche à facettes dans tout le wiki, classée par pertinence. Deux mondes combinables : le PLEIN-TEXTE (titres, descriptions, contenu — moteur Postgres « french » : pluriel/singulier « armoire »↔« armoires », multi-mots = tous présents, guillemets pour une expression exacte) et les TAGS traités comme des filtres d'ensemble (et non plus comme des mots du texte).

Args (tous optionnels, mais fournir au moins query OU un filtre de tag) :
- query (string, ≥ 2 caractères) — termes plein-texte.
- tagsEt (string[]) — la page doit porter TOUS ces tags.
- tagsOu (string[]) — la page doit porter AU MOINS UN de ces tags.
- tagsSauf (string[]) — la page ne doit porter AUCUN de ces tags.
- rubrique (string) — slug ou id d'une rubrique pour s'y restreindre.
Les tags s'écrivent en clair (« N4 », « M-Bus »…) : ils sont normalisés côté serveur (casse/accents/espaces ignorés). Sans query ni filtre, ne renvoie rien.

Retourne : results[] (id, titre, rubriqueSlug, rubriqueNom, resume, updatedAt), les plus pertinents d'abord (max 30). Enchaîner avec dumtools_get_wiki_page pour le contenu.`,
    inputSchema: {
      query: z.string().min(2).optional().describe("Termes plein-texte (≥ 2 caractères)"),
      tagsEt: z.array(z.string()).optional().describe("Tags requis (ET) — la page doit tous les porter"),
      tagsOu: z.array(z.string()).optional().describe("Tags alternatifs (OU) — au moins un"),
      tagsSauf: z.array(z.string()).optional().describe("Tags exclus (SANS) — aucun"),
      rubrique: z.string().optional().describe("Slug ou id d'une rubrique pour s'y restreindre"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ query, tagsEt, tagsOu, tagsSauf, rubrique }) => run(async () => {
    const results = await searchWiki(query ?? "", { tagsEt, tagsOu, tagsSauf, rubrique });
    return { count: results.length, results };
  }),
);

server.registerTool(
  "dumtools_create_wiki_page",
  {
    title: "Créer une page de wiki",
    description: `Crée une page dans une rubrique du wiki. Le contenu initial est fourni en markdown (titres, listes, todo, tables, code…) et converti en blocs riches.

Args : rubrique (string, requis) — slug ou id de la rubrique (voir dumtools_list_wiki_rubriques) ; titre? (défaut « Nouvelle page ») ; resume? (description courte, affichée sur les listes et la recherche) ; markdown? (contenu) ; tags? (string[] — créés au besoin) ; parentId? (ranger la page SOUS une page existante de la MÊME rubrique = sous-page ; omis = à la racine).

Le wiki n'est PAS rattaché à une affaire (savoir transverse). Retourne : { id } — URL d'édition : /outils/wiki/{rubriqueSlug}/{id}.`,
    inputSchema: {
      rubrique: z.string().min(1).describe("Slug ou id de la rubrique de rattachement"),
      titre: z.string().optional().describe("Titre de la page"),
      resume: z.string().optional().describe("Description courte (résumé)"),
      markdown: z.string().optional().describe("Contenu initial (markdown)"),
      tags: z.array(z.string()).optional().describe("Tags (créés s'ils n'existent pas)"),
      parentId: z
        .string()
        .optional()
        .describe("Id d'une page parente de la même rubrique (sous-page). Omis = racine."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => run(async () => {
    const { id } = await createWikiPage(input, currentUserId());
    return { id, created: true };
  }),
);

server.registerTool(
  "dumtools_update_wiki_page",
  {
    title: "Modifier une page de wiki",
    description: `Met à jour une page du wiki. ⚠️ markdown REMPLACE TOUT le contenu (pas un patch) : pour une modif partielle, lire d'abord avec dumtools_get_wiki_page, éditer le markdown, puis renvoyer l'ensemble. De même, tags remplace la liste complète.

Même anti-collision que l'éditeur web : si un collègue a sauvé entre-temps, l'appel échoue avec un message explicite — relire puis réappliquer.

Limite : les blocs métier (table de données typée, HTML embarqué, carte lien) sont rendus en markdown à la lecture mais REDEVIENNENT des blocs standard à l'écriture. Éviter de réécrire une page qui en contient si on veut les préserver.

Args : id (requis) ; titre? ; resume? ; markdown? ; rubrique? (slug/id — déplace la page) ; tags? (string[]).

Retourne : { updatedAt, version }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id de la page wiki"),
      titre: z.string().optional().describe("Nouveau titre"),
      resume: z.string().optional().describe("Nouvelle description courte"),
      markdown: z.string().optional().describe("Nouveau contenu complet (markdown)"),
      rubrique: z.string().optional().describe("Déplacer vers une autre rubrique (slug ou id)"),
      tags: z.array(z.string()).optional().describe("Nouvelle liste complète de tags"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ id, ...input }) => run(async () => {
    const r = await updateWikiPage(id, input);
    if (!r) throw new Error(`Page wiki introuvable pour l'id « ${id} ».`);
    return { id, ...r };
  }),
);

server.registerTool(
  "dumtools_delete_wiki_page",
  {
    title: "Supprimer une page de wiki",
    description: `Supprime DÉFINITIVEMENT une page du wiki (et ses images/pièces jointes sur le serveur). Action irréversible sur une base partagée — à n'utiliser que sur confirmation explicite de l'utilisateur.

Args : id (string, requis).

Retourne : { deleted: true } si supprimée.`,
    inputSchema: { id: z.string().min(1).describe("Id de la page wiki à supprimer") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const deleted = await deleteWikiPage(id);
    if (!deleted) throw new Error(`Page wiki introuvable pour l'id « ${id} » (déjà supprimée ?).`);
    return { id, deleted: true };
  }),
);

  return server;
}

// ============================================================================

function attribution(): string {
  return mcpUserId
    ? ` — écritures créditées à ${process.env.MCP_USER_EMAIL}`
    : " — écritures non attribuées (MCP_USER_EMAIL absent)";
}

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await buildServer().connect(transport);
  console.error(`dumtools-mcp-server démarré (stdio)${attribution()}`);
}

/** Extrait le jeton d'un en-tête « Authorization: Bearer <jeton> ». */
function bearerFrom(header: unknown): string | undefined {
  const h = Array.isArray(header) ? header[0] : header;
  if (typeof h !== "string") return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : undefined;
}

/**
 * Transport Streamable HTTP (JSON, sans session) pour brancher un client distant
 * (ex. Claude Desktop via mcp-remote). Un transport neuf par requête.
 *
 * Authentification par jeton personnel : en-tête « Authorization: Bearer <jeton> »
 * résolu en utilisateur (mcpTokenHash). Chaque requête s'exécute dans le contexte
 * de cet utilisateur → les écritures lui sont attribuées. Jeton absent/invalide → 401.
 */
async function runHttp(): Promise<void> {
  const { default: express } = await import("express");
  const { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } = await import(
    "@modelcontextprotocol/sdk/server/auth/router.js"
  );
  const { creerFournisseurOAuth } = await import("./oauth.mts");

  const port = parseInt(process.env.MCP_HTTP_PORT || "8787", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  // URL PUBLIQUE du serveur (celle vue par le client OAuth) : derrière le
  // tunnel Cloudflare c'est l'hostname https, en test local le localhost.
  const publicUrl = new URL(process.env.MCP_PUBLIC_URL || `http://localhost:${port}`);
  const ressourceMcp = new URL("/mcp", publicUrl);

  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.get("/health", (_req, res) => res.json({ ok: true, server: "dumtools-mcp-server" }));

  // Flux OAuth pour « Ajouter un connecteur personnalisé » (Claude Desktop /
  // claude.ai) : découverte (.well-known), enregistrement dynamique, /authorize
  // (page de connexion DumTools), /token (code + PKCE), /revoke. Voir oauth.mts.
  const oauth = creerFournisseurOAuth();
  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: publicUrl,
      resourceServerUrl: ressourceMcp,
      resourceName: "DumTools MCP",
    }),
  );
  app.post("/connexion-mcp", (req, res) => {
    oauth.gererConnexion(req, res).catch((e) => {
      console.error("connexion-mcp:", e);
      if (!res.headersSent) res.status(500).send("Erreur interne.");
    });
  });

  app.post("/mcp", async (req, res) => {
    const user = await resolveUserByToken(bearerFrom(req.headers["authorization"]));
    if (!user) {
      res
        .status(401)
        // resource_metadata : point d'entrée de la découverte OAuth côté client.
        .set(
          "WWW-Authenticate",
          `Bearer realm="dumtools-mcp", resource_metadata="${getOAuthProtectedResourceMetadataUrl(ressourceMcp)}"`,
        )
        .json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Jeton d'accès manquant ou invalide." },
          id: null,
        });
      return;
    }
    const mcp = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      mcp.close();
    });
    // Exécute le traitement (et donc les handlers d'outils) dans le contexte user.
    await userContext.run(user, async () => {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
  });

  app.listen(port, host, () => {
    console.error(
      `dumtools-mcp-server démarré (http) sur http://${host}:${port}/mcp — OAuth (connecteur perso) + jeton personnel (Bearer) — URL publique : ${publicUrl}`,
    );
  });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("ERREUR : DATABASE_URL manquant (renseignez le .env à la racine du projet).");
    process.exit(1);
  }
  mcpUserId = await resolveMcpUserId(process.env.MCP_USER_EMAIL);
  if ((process.env.TRANSPORT || "stdio").toLowerCase() === "http") {
    await runHttp();
  } else {
    await runStdio();
  }
}

main().catch((e) => {
  console.error("Erreur fatale du serveur MCP :", e);
  process.exit(1);
});
