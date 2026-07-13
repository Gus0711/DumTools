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
  buildRows,
  createAffaire,
  createProject,
  deleteProject,
  getAffaire,
  getClient,
  getMateriel,
  getProject,
  listAffaires,
  listCatalogPoints,
  listClients,
  listModeles,
  listProjects,
  recommendForBesoin,
  recommendForProject,
  resolveMcpUserId,
  resolveUserByToken,
  setProjectController,
  updateAffaire,
  updateProjectMeta,
  updateProjectRows,
  upsertCatalogPoint,
  type AuthUser,
  type RowInput,
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

// Utilisateur courant, porté par requête en mode HTTP (résolu depuis le jeton).
const userContext = new AsyncLocalStorage<AuthUser>();
// Fallback stdio (local) : id résolu au démarrage depuis MCP_USER_EMAIL.
let mcpUserId: string | null = null;

/** Id de l'utilisateur à créditer pour une écriture (jeton HTTP, sinon stdio). */
function currentUserId(): string | null {
  return userContext.getStore()?.id ?? mcpUserId;
}

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

Retourne : affaire { id, nom, numeroWhy, etat, besoinArmoire, clientId, clientNom, automates[] (projets GTB : id, nom, controller, nbPoints, nbModules, date), documents[] (GED : id, nom, categorie, taille, statutSync, date) }.`,
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
  const app = express();
  app.use(express.json({ limit: "8mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, server: "dumtools-mcp-server" }));

  app.post("/mcp", async (req, res) => {
    const user = await resolveUserByToken(bearerFrom(req.headers["authorization"]));
    if (!user) {
      res
        .status(401)
        .set("WWW-Authenticate", 'Bearer realm="dumtools-mcp"')
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

  const port = parseInt(process.env.MCP_HTTP_PORT || "8787", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  app.listen(port, host, () => {
    console.error(`dumtools-mcp-server démarré (http) sur http://${host}:${port}/mcp — auth par jeton personnel (Bearer)`);
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
