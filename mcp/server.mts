#!/usr/bin/env -S npx tsx
// Serveur MCP DumTools (transport stdio, usage local).
//
// Charge d'abord dotenv (DATABASE_URL) AVANT tout import qui touche la BDD :
// data.mts → ../src/lib/db instancie le pool Prisma à l'évaluation du module.
import "dotenv/config";
import "./sans-server-only.mts";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
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
  listVisites,
  getVisite,
  listReservesOuvertes,
  createVisite,
  updateVisite,
  deleteVisite,
  listDevis,
  getDevisMcp,
  searchArticlesDevis,
  createDevis,
  updateDevis,
  deleteDevis,
  reviseDevis,
  duplicateDevis,
  refreshDevisPrix,
  addDevisLot,
  updateDevisLot,
  addDevisLignes,
  updateDevisLigne,
  deleteDevisLigne,
  reprendreBomDevis,
  createProduit,
  type AuthUser,
  type RowInput,
  brancherActeur,
} from "./data.mts";
import { nomLocalise } from "../src/tools/liste-points/model";

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

// --- Convention de nommage des points ---------------------------------------
// Le catalogue est un VOCABULAIRE partagé, pas un journal de points. Le nom d'un
// point dit CE QUE C'EST (« Cde contacteur dalle chauffante ») ; ce qui distingue
// deux points identiques — le local, la zone, le repère — vit dans le texte
// libre (« Salle Communale 1 »). Sans cette règle le catalogue enfle d'un point
// par local, la BOM (qui apparie par nom exact) ne retrouve plus rien, et la
// recherche rend un libellé unique par affaire.

const CONVENTION_NOMMAGE = `⚠️ CONVENTION DE NOMMAGE (impérative) : le nom d'un point dit CE QUE C'EST, jamais OÙ IL EST.
  · nom  = le générique, repris TEL QUEL du catalogue (dumtools_list_catalog) — « Cde contacteur dalle chauffante », « Sonde ambiance », « Commande ».
  · note = ce qui distingue ce point d'un autre identique : le local, la zone, le repère, le n° de trame — « Salle Communale 1 », « CR Mairie », « Aérothermes ».
Donc « Cde contacteur dalle chauffante Salle Communale 1 » et « … 2 » sont DEUX FOIS le même point : nom « Cde contacteur dalle chauffante », notes « Salle Communale 1 » et « Salle Communale 2 ».
Avant d'inventer un nom, chercher le générique correspondant dans le catalogue et le réutiliser. Un nom absent du catalogue n'est justifié que s'il désigne un ÉQUIPEMENT nouveau, réutilisable sur une autre affaire.`;

// `nomLocalise` est partagé avec l'interface (src/tools/liste-points/model).
const ETAT_AFFAIRE = z.enum(["DEVIS", "COMMANDE", "EN_COURS", "LIVRE", "CLOTURE"]);
const BESOIN_ARMOIRE = z.enum(["INTEGRATION", "NOUVELLE"]);
const TYPE_VISITE = z.enum(["RELEVE", "SUIVI", "RECEPTION", "MAINTENANCE"]);
const ETAT_DEVIS = z.enum(["BROUILLON", "EMIS", "ACCEPTE", "REFUSE"]);
const RENDU_LOT = z.enum(["DETAILLE", "CONDENSE"]);

// --- Devis : la règle de l'IA, et les unités ---------------------------------
// Répétée dans chaque outil qui ajoute ou cherche un article : une IA lit la
// description de l'outil qu'elle appelle, pas celle du voisin.

const REGLE_DIVERS = `⚠️ RÈGLE ABSOLUE — UN ARTICLE ABSENT DU MAGASIN NE SE CRÉE PAS. La ligne passe en « Divers » (genre LIBRE : libellé + prix saisis) et la réponse la signale (passeesEnDivers) : L'ANNONCER à l'utilisateur. dumtools_create_produit ne sert QUE si l'utilisateur demande EXPLICITEMENT de créer le produit au magasin — jamais par commodité, jamais pour éviter un Divers.
Un article se retrouve par son id (produitId) ou par sa RÉFÉRENCE exacte (interne, fabricant ou fournisseur, sans ambiguïté) — JAMAIS par sa désignation. Chercher d'abord avec dumtools_search_articles_devis.`;

const UNITES_DEVIS = `Unités : montants en EUROS HT décimaux (412.5), quantités décimales (2.5), coefficient multiplicateur (1.35 = ×1,35), remises et TVA en POURCENT (5 = 5 %).`;
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

Les 'rows' sont la source de saisie ; les 'points' en sont dérivés (affectés aux bornes). Pour modifier la liste, utiliser dumtools_update_project_rows.

Une ligne se lit en deux parties : 'nom' = ce que c'est (générique, vocabulaire du catalogue), 'note' = où c'est / quel repère. Des rows anciennes peuvent porter le local dans le nom — ne pas s'en inspirer, c'est le défaut qu'on corrige.`,
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
    description: `Fiche d'un client : agrège tout ce qui a été produit pour lui à travers les outils (projets GTB, documents GED, devis).

Args : id (string) — l'id du client (voir dumtools_list_clients).

Retourne : id, nom, realisations[] (id, titre, numeroWhy, resume — « N modules · M E/S » pour un projet, « En chiffrage · 12 400,00 € HT » pour un devis —, date de modif).`,
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

Retourne : affaire { id, nom, numeroWhy, etat, besoinArmoire, clientId, clientNom, automates[] (projets GTB : id, nom, controller, nbPoints, nbModules, date), documents[] (GED : id, nom, categorie, taille, statutSync, date), notes[] (id, titre, resume, partagee, date — contenu via dumtools_get_note), visites[], devis[] (id, libelle « DT260052 v2 », titre, etat, netHt en €, nbSansPrix, date — détail via dumtools_get_devis) }.`,
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

Le catalogue est le VOCABULAIRE de l'entreprise : une entrée = un type de point réutilisable d'une affaire à l'autre, jamais un point d'un chantier précis. C'est lui qui porte la nomenclature matériel (BOM), donc l'appariement se fait sur le nom EXACT.

Retourne : points[] (id, nom, type AI|DI|AO|DO|COM, signal) et modeles[] (id, nom, ordre, points[]).

À APPELER AVANT toute édition de liste de points (dumtools_update_project_rows) : les noms doivent être repris tels quels d'ici.

${CONVENTION_NOMMAGE}`,
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
        note? (le local / la zone / le repère), type? (AI|DI|AO|DO|COM — requis pour un point),
        signal? (ex. PT1000, 0-10V, D) }.
    Règle métier : 1 ligne = 1 type d'E/S exclusif. Les sections n'ont qu'un nom. Les COM ne produisent pas de borne physique.

${CONVENTION_NOMMAGE}
Le couple nom + note est composé pour nommer la variable du programme Distech généré, et la note s'imprime sous le libellé sur le document client : rien n'est perdu à sortir le local du nom.

Retourne : { updatedAt, nbPoints }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id du projet"),
      rows: z
        .array(
          z.object({
            id: z.string().optional().describe("Id d'une ligne existante à conserver (sinon générée)"),
            kind: z.enum(["point", "section"]).optional().describe("Type de ligne (défaut 'point')"),
            nom: z
              .string()
              .min(1)
              .describe(
                "Nom GÉNÉRIQUE du point, repris tel quel du catalogue (« Sonde ambiance », « Cde contacteur dalle chauffante ») — JAMAIS le local, la zone ni le n° de repère. Ou le titre, pour une section.",
              ),
            note: z
              .string()
              .optional()
              .describe(
                "Ce qui distingue ce point d'un autre identique : le local, la zone, le repère (« Salle Communale 1 », « CR Mairie »). C'est ICI que va tout ce qui ne doit pas entrer dans le nom.",
              ),
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
    description: `Ajoute ou met à jour un point du VOCABULAIRE partagé (clé = nom). Alimente le combobox de saisie de l'éditeur et porte la nomenclature matériel (BOM).

⚠️ À N'UTILISER QUE pour un type de point RÉUTILISABLE d'une affaire à l'autre, et seulement après avoir vérifié dans dumtools_list_catalog qu'il n'existe pas déjà. Ce n'est PAS l'endroit où enregistrer les points d'un chantier : ceux-là vivent dans les rows du projet (dumtools_update_project_rows).

${CONVENTION_NOMMAGE}

Un nom contenant un local (« … Salle Communale 1 », « Chauffage laverie », « Sonde ambiance Ss Fil — Bar ») est REFUSÉ : ajoutez le générique et mettez le local dans la note de la ligne.

Args : nom (string, requis) ; type (AI|DI|AO|DO|COM, requis) ; signal? (ex. PT1000, 0-10V, D ; null = défaut selon le type).

Retourne : le point { id, nom, type, signal }.`,
    inputSchema: {
      nom: z
        .string()
        .min(1)
        .describe("Nom générique et réutilisable du point (clé unique) — sans local, zone ni repère"),
      type: IO_TYPE.describe("Type d'E/S"),
      signal: z.string().nullable().optional().describe("Signal électrique par défaut"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ nom, type, signal }) => run(async () => {
    // Garde-fou : le catalogue est un vocabulaire. Un nom localisé y crée une
    // entrée par local — c'est ce qui l'a fait enfler de 63 points en une
    // semaine. On refuse avec la marche à suivre, pas juste un « non ».
    const raison = nomLocalise(nom);
    if (raison)
      throw new Error(
        `« ${nom} » ne peut pas entrer au catalogue : ${raison}. Le catalogue est un vocabulaire réutilisable, pas un journal de points. Ajoutez le générique (ex. « Cde contacteur dalle chauffante ») et mettez « ${nom} » — ou plutôt sa partie localisante — dans le champ « note » de la ligne, via dumtools_update_project_rows.`,
      );
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

// ---- VISITES DE CHANTIER (relevé, suivi, réception, maintenance) ----
// Le passage sur site : une checklist « pour ne rien oublier » (un modèle par
// type de visite), des RÉSERVES reportées d'une visite à la suivante tant
// qu'elles ne sont pas levées, des photos et des notes vocales.
// ⚠️ La saisie vit LOCALEMENT sur le téléphone (îlot offline) jusqu'à la
// synchro : le MCP ne voit que l'état SYNCHRONISÉ — une visite faite ce matin
// peut n'être pas encore remontée. Voir docs/VISITES.md.

server.registerTool(
  "dumtools_list_visites",
  {
    title: "Lister les visites de chantier",
    description: `Liste les visites de chantier SYNCHRONISÉES (celles encore ouvertes sur un téléphone n'y sont pas), de la plus récente à la plus ancienne.

Quatre types, un par étape du cycle : RELEVE (relevé avant chiffrage), SUIVI (suivi de chantier), RECEPTION (réception / levée de réserves), MAINTENANCE (maintenance / SAV).

Args (tous facultatifs) : chantierId OU numeroWhy — limiter à une affaire ; type ; sansAffaire (boolean) — les visites ORPHELINES, non rattachées à une affaire (cas courant du relevé fait avant que l'affaire existe : elles se rattachent avec dumtools_update_visite) ; depuis / jusqua (AAAA-MM-JJ) ; limit (défaut 100).

Retourne pour chacune : id, titre, type + typeLibelle, date, affaire (chantierId, affaireNom, numeroWhy), clientNom, resume (« 12/34 pts · 2 KO · 1 réserve · 5 photos »), reservesOuvertes, auteur, updatedAt. Pour le contenu, enchaîner avec dumtools_get_visite.`,
    inputSchema: {
      chantierId: z.string().min(1).optional().describe("Limiter aux visites de cette affaire"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire"),
      type: TYPE_VISITE.optional().describe("Limiter à un type de visite"),
      sansAffaire: z.boolean().optional().describe("Uniquement les visites non rattachées à une affaire"),
      depuis: z.string().optional().describe("Date min (AAAA-MM-JJ)"),
      jusqua: z.string().optional().describe("Date max (AAAA-MM-JJ)"),
      limit: z.number().int().positive().optional().describe("Nombre max de visites (défaut 100)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (filtre) => run(async () => {
    const visites = await listVisites(filtre);
    return { count: visites.length, visites };
  }),
);

server.registerTool(
  "dumtools_get_visite",
  {
    title: "Lire une visite de chantier",
    description: `Récupère une visite complète : la checklist point par point (statut ok / ko / na / "" non renseigné, note de terrain), les RÉSERVES et les médias.

Args : id (string) — voir dumtools_list_visites.

Retourne : identification (titre, type, date, affaire, client, n° Why), participants, notes générales, stats (total / renseignes / ko / reservesOuvertes / photos / audios), sections[] (titre + items : libelle, aide du guide, statut, note, nb photos/audios), reserves[] (libelle, localisation, gravite, statut, reporteeDe si héritée d'une visite précédente), medias[] (url authentifiée /api/visites/media/…, type, rattachement au point ou à la réserve, recu = binaire arrivé sur le serveur), auteur, url de la fiche.

Les champs vides sont OMIS pour rester lisible : un item sans note ni photo n'expose que son libellé et son statut. Un statut "" veut dire « pas encore renseigné » — sur une réception, c'est une information, pas un vide.`,
    inputSchema: { id: z.string().min(1).describe("Id de la visite") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const visite = await getVisite(id);
    if (!visite) throw new Error(`Visite introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_visites.`);
    return { visite };
  }),
);

server.registerTool(
  "dumtools_list_reserves",
  {
    title: "Réserves ouvertes (reste à lever)",
    description: `Les RÉSERVES encore OUVERTES, groupées par affaire — le « reste à faire » du terrain, la colonne vertébrale du « ne rien oublier ».

Une réserve garde son identité d'une visite à l'autre : déclarée en réception, elle est reportée dans la visite suivante tant qu'elle n'est pas levée. Cette liste applique cette fusion (l'état le plus récent gagne) — une réserve levée disparaît d'elle-même, il n'y a rien à cocher ici.

Args (facultatifs) : chantierId OU numeroWhy — une seule affaire. Sans argument : TOUTES les affaires qui ont des réserves ouvertes, la plus chargée d'abord (les visites orphelines forment leur propre groupe, chantierId null).

Retourne : groupes { chantierId, affaireNom, clientNom, numeroWhy, reserves[] } ; chaque réserve : libelle, localisation, gravite (haute → faible, dans cet ordre), note, nb photos, visiteId + visiteTitre (la visite où elle a été déclarée).`,
    inputSchema: {
      chantierId: z.string().min(1).optional().describe("Limiter à cette affaire"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (ref) => run(async () => {
    const affaires = await listReservesOuvertes(ref);
    const total = affaires.reduce((n, a) => n + a.reserves.length, 0);
    return { count: total, affaires };
  }),
);

server.registerTool(
  "dumtools_create_visite",
  {
    title: "Préparer une visite de chantier",
    description: `Prépare une visite depuis le bureau : elle est créée avec la CHECKLIST DU MODÈLE de son type (le guide « pour ne rien oublier », le même qu'au terrain) et le REPORT des réserves encore ouvertes de l'affaire.

Elle s'ouvre ensuite sur le téléphone via /outils/visites/terrain?ouvrir={id} (l'îlot l'importe dans son stockage local, la saisie continue hors-ligne).

Affaire OBLIGATOIRE ici : au terrain une visite peut naître sans affaire (le relevé précède souvent le n° Why) et se rattacher au retour, mais depuis le bureau rien ne justifie d'en créer une orpheline.

Args : chantierId? OU numeroWhy? (l'un des deux, requis) ; type (requis : RELEVE | SUIVI | RECEPTION | MAINTENANCE) ; titre? (défaut : « <type> — <date> » à l'affichage) ; date? (AAAA-MM-JJ, défaut aujourd'hui) ; participants? ; notes?.

Retourne : { id, nbItems, nbReservesReportees, url, urlTerrain }.`,
    inputSchema: {
      chantierId: z.string().min(1).optional().describe("Id de l'affaire de rattachement"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire"),
      type: TYPE_VISITE.describe("Type de visite (détermine la checklist)"),
      titre: z.string().optional().describe("Titre de la visite"),
      date: z.string().optional().describe("Date terrain (AAAA-MM-JJ)"),
      participants: z.string().optional().describe("Qui était présent"),
      notes: z.string().optional().describe("Notes générales de la visite"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => run(async () => {
    const r = await createVisite(input, currentUserId());
    return {
      ...r,
      url: `/outils/visites/${r.id}`,
      urlTerrain: `/outils/visites/terrain?ouvrir=${r.id}`,
    };
  }),
);

server.registerTool(
  "dumtools_update_visite",
  {
    title: "Modifier / rattacher une visite",
    description: `Corrige les métadonnées d'une visite synchronisée : titre, type, date, et surtout RATTACHEMENT à une affaire — le geste du retour de chantier, quand le relevé a été fait avant que l'affaire existe (créer l'affaire avec dumtools_create_affaire, puis rattacher ici). Au rattachement, client et n° Why sont REPRIS DE L'AFFAIRE : elle fait foi.

⚠️ Le CONTENU (checklist, réserves, médias) ne se modifie pas ici : il se saisit au terrain, et l'écraser depuis le bureau perdrait la copie encore ouverte sur le téléphone (fusion « dernier gagne » à la synchro). Pour reprendre une visite, ouvrir /outils/visites/terrain?ouvrir={id}.
⚠️ De même, si le téléphone détient encore cette visite, sa prochaine synchro peut restaurer SON titre / type / date (le rattachement, lui, est protégé : un envoi sans affaire ne détache jamais).

Args : id (requis) ; titre? ; type? ; date? (AAAA-MM-JJ) ; chantierId? OU numeroWhy?.

Retourne : { id, chantierId, updatedAt }.`,
    inputSchema: {
      id: z.string().min(1).describe("Id de la visite"),
      titre: z.string().optional().describe("Nouveau titre"),
      type: TYPE_VISITE.optional().describe("Nouveau type"),
      date: z.string().optional().describe("Nouvelle date terrain (AAAA-MM-JJ)"),
      chantierId: z.string().min(1).optional().describe("Affaire de rattachement"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, ...input }) => run(async () => {
    const r = await updateVisite(id, input);
    if (!r) throw new Error(`Visite introuvable pour l'id « ${id} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_delete_visite",
  {
    title: "Supprimer une visite",
    description: `Supprime DÉFINITIVEMENT une visite synchronisée, avec ses photos et ses notes vocales sur le serveur. Action irréversible sur une base partagée — à n'utiliser que sur confirmation explicite de l'utilisateur.

⚠️ Une copie peut subsister sur le téléphone qui l'a saisie : sa prochaine synchro la recréerait. Supprimer d'abord le brouillon local si la visite était encore ouverte au terrain.

Args : id (string, requis).

Retourne : { deleted: true } si supprimé.`,
    inputSchema: { id: z.string().min(1).describe("Id de la visite à supprimer") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const deleted = await deleteVisite(id);
    if (!deleted) throw new Error(`Visite introuvable pour l'id « ${id} » (déjà supprimée ?).`);
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

// ---- DEVIS (moteur de chiffrage : déboursé du Magasin × coefficient = PV) ----
// Lectures de l'app, écritures par le NOYAU partagé avec l'éditeur
// (src/tools/devis/ecritures) : aucun chemin de calcul n'est réécrit ici.
// Voir docs/DEVIS.md §28.

server.registerTool(
  "dumtools_list_devis",
  {
    title: "Lister les devis",
    description: `Liste les devis, du plus récemment modifié au plus ancien, avec leurs totaux calculés par le moteur de l'app.

Args (tous facultatifs) : etat (BROUILLON|EMIS|ACCEPTE|REFUSE) ; chantierId OU numeroWhy — une affaire ; clientId ; limit (défaut 50).

Retourne : total, devis[] (id, libelle « DT260052 v2 », titre, etat, clientNom, numeroWhy, affaireNom, totalHt, netHt, margeSurFourniture + taux, nbLignes, nbSansPrix, publie, nbConsultations, nbRevisionsUlterieures, auteur, updatedAt, url). Pour le détail : dumtools_get_devis.

${UNITES_DEVIS}`,
    inputSchema: {
      etat: ETAT_DEVIS.optional().describe("Limiter à un état"),
      chantierId: z.string().min(1).optional().describe("Limiter aux devis de cette affaire"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire"),
      clientId: z.string().min(1).optional().describe("Limiter aux devis de ce client"),
      limit: z.number().int().positive().optional().describe("Nombre max (défaut 50)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (filtre) => run(async () => listDevis(filtre)),
);

server.registerTool(
  "dumtools_get_devis",
  {
    title: "Détail d'un devis",
    description: `Récupère un devis complet : entête (client, affaire, coefficient par défaut, TVA, remise globale, validité, destinataire, contact), ce que le client voit (affichageClient), la publication (lecture seule), les LOTS avec leurs LIGNES, les totaux et les alertes.

Chaque ligne : id, genre (PRODUIT = article du magasin · PRESTATION = référentiel de main d'œuvre/BPU au taux de vente · LIBRE = « Divers » saisi à la main · TEXTE = commentaire), designation, ref, quantite, unite, debourse, coef + origineCoef (ligne|produit|categorie|devis), prixVenteUnitaire, remisePourcent, totalHt, option (hors total), note ; drapeaux sansPrix (article sans prix connu), aChiffrer (Divers à 0 €), prixPerime (le magasin a changé depuis).

Un lot rendu CONDENSE est un forfait : le client ne lit qu'une ligne au sous-total (libelleClient), jamais le détail.

La marge affichée est la « marge sur la FOURNITURE » (la main d'œuvre est au taux de vente, sans coût interne) — ne jamais l'appeler « marge du devis ».

Args : id (string).

${UNITES_DEVIS}`,
    inputSchema: { id: z.string().min(1).describe("Id du devis") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const devis = await getDevisMcp(id);
    if (!devis) throw new Error(`Devis introuvable pour l'id « ${id} ». Vérifiez l'id via dumtools_list_devis.`);
    return { devis };
  }),
);

server.registerTool(
  "dumtools_search_articles_devis",
  {
    title: "Chercher un article ou une prestation (devis)",
    description: `Cherche dans le MAGASIN (réf. interne, réf. fabricant, désignation, fabricant) et dans les PRESTATIONS (libellé ou n° d'article BPU) — la même recherche que la barre d'ajout de l'éditeur. À APPELER AVANT dumtools_add_devis_lignes.

Args : query (≥ 2 caractères) ; devisId? (calcule le coefficient et le prix de vente qu'appliquerait CE devis) ; limit? (défaut 15, max 50).

Retourne : articles[] (produitId, ref, refFabricant, designation, unite, categorie, debourse + sourcePrix, sansPrix, coef + origineCoef, prixVenteEstime) et prestations[] (prestationId, libelle, unite, prixVente, famille, articleBpu).

Rien trouvé ne veut PAS dire « à créer » : l'article se chiffrera en Divers.

${REGLE_DIVERS}`,
    inputSchema: {
      query: z.string().min(2).describe("Référence, désignation ou n° BPU (≥ 2 caractères)"),
      devisId: z.string().min(1).optional().describe("Devis pour lequel estimer coef et prix de vente"),
      limit: z.number().int().positive().max(50).optional().describe("Nombre max par famille (défaut 15)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ query, devisId, limit }) => run(async () => searchArticlesDevis(query, { devisId, limit })),
);

server.registerTool(
  "dumtools_create_devis",
  {
    title: "Créer un devis",
    description: `Crée un devis en BROUILLON, avec un numéro DT{AA}{NNNN} attribué de façon atomique (une révision n'en consomme pas ; une création, si). Le coefficient par défaut de la maison est COPIÉ, et le destinataire est pré-rempli depuis la fiche client (adresse + contact principal).

Rattachement : chantierId OU numeroWhy d'une affaire EXISTANTE (client et n° Why en sont repris) — le MCP ne crée pas d'affaire. À défaut, clientNom seul (client rattaché au référentiel, créé s'il n'existe pas, comme partout dans l'app).

Args : titre? ; chantierId? ; numeroWhy? ; clientNom?.

Retourne : { id, numero, url, clientNom, numeroWhy, affaireNom, destinatairePreRempli, contact }. Enchaîner avec dumtools_add_devis_lignes.`,
    inputSchema: {
      titre: z.string().optional().describe("Titre du devis (ex. « GTB chaufferie — mairie »)"),
      chantierId: z.string().min(1).optional().describe("Id de l'affaire (existante)"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire (existante)"),
      clientNom: z.string().min(1).optional().describe("À défaut d'affaire : nom du client"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => run(async () => createDevis(input, currentUserId())),
);

server.registerTool(
  "dumtools_update_devis",
  {
    title: "Modifier l'entête d'un devis",
    description: `Modifie l'entête d'un devis. Seuls les champs fournis changent.

Args : id (requis) ; titre? ; clientNom? (re-rattache au référentiel ; le destinataire suit s'il n'a pas été retapé à la main) ; chantierId? OU numeroWhy? (affaire existante — client et n° Why en sont repris) ; coefDefaut? (1.35) ; tauxTva? (%, 0 = autoliquidation) ; remiseGlobalePourcent? OU remiseGlobaleMontant? (€ HT) — EXCLUSIVES, null pour retirer ; validiteJours? ; destinataire? (pavé imprimé, une ligne par ligne) ; montrerPrixUnitaires? montrerSousTotauxLots? montrerOptions? montrerDocumentations? (ce que voit le client) ; etat? (BROUILLON|EMIS|ACCEPTE|REFUSE).

⚠️ coefDefaut ne rechiffre PAS les lignes existantes (le devis fige) : seules les lignes ajoutées ensuite, ou un dumtools_refresh_devis_prix, l'appliquent.
⚠️ etat ACCEPTE/REFUSE : seulement quand l'utilisateur rapporte la réponse du client (le fil du devis en garde la trace). EMIS pose la date d'émission une fois pour toutes.
Le lien public client (/d/…) se publie depuis l'éditeur, pas depuis le MCP.

Retourne : { id, libelle, etat, emisLe, clientNom, affaireNom, destinataire, updatedAt, totaux }.

${UNITES_DEVIS}`,
    inputSchema: {
      id: z.string().min(1).describe("Id du devis"),
      titre: z.string().optional(),
      clientNom: z.string().min(1).optional().describe("Nom du client"),
      chantierId: z.string().min(1).optional().describe("Rattacher à cette affaire (existante)"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire"),
      coefDefaut: z.number().positive().max(20).optional().describe("Coefficient par défaut (1.35 = ×1,35)"),
      tauxTva: z.number().min(0).max(100).optional().describe("TVA en pourcent (20)"),
      remiseGlobalePourcent: z.number().min(0).max(100).nullable().optional().describe("Remise globale en % (null = retirer)"),
      remiseGlobaleMontant: z.number().min(0).nullable().optional().describe("Remise globale en € HT (null = retirer)"),
      validiteJours: z.number().int().min(0).max(3650).optional().describe("Durée de validité de l'offre"),
      destinataire: z.string().optional().describe("Pavé destinataire imprimé (lignes séparées par \\n)"),
      etat: ETAT_DEVIS.optional().describe("État du devis"),
      montrerPrixUnitaires: z.boolean().optional(),
      montrerSousTotauxLots: z.boolean().optional(),
      montrerOptions: z.boolean().optional(),
      montrerDocumentations: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, ...input }) => run(async () => {
    const r = await updateDevis(id, input, currentUserId());
    if (!r) throw new Error(`Devis introuvable pour l'id « ${id} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_add_devis_lot",
  {
    title: "Ajouter un lot à un devis",
    description: `Ajoute un lot (bloc) en fin de devis. Un lot n'est pas un chapitre : c'est un BLOC DU CLIENT.
  · rendu DETAILLE (défaut) : le client lit chaque ligne ;
  · rendu CONDENSE (forfait) : le client ne lit qu'UNE ligne — libelleClient — au sous-total du lot ; le détail ne sort pas du serveur.

Args : devisId (requis) ; titre (requis — nom interne) ; rendu? ; libelleClient? (la phrase lue par le client sur un forfait, retours à la ligne permis) ; description? (description non exhaustive imprimée en puces, une ligne = une puce).

Astuce : dumtools_add_devis_lignes accepte aussi lotTitre, qui crée le lot au besoin.

Retourne : { id, devisId }.`,
    inputSchema: {
      devisId: z.string().min(1).describe("Id du devis"),
      titre: z.string().min(1).describe("Titre interne du lot (« Fourniture GTB », « Main d'œuvre »)"),
      rendu: RENDU_LOT.optional().describe("DETAILLE (défaut) ou CONDENSE (forfait)"),
      libelleClient: z.string().optional().describe("Désignation lue par le client sur un forfait"),
      description: z.string().optional().describe("Description en puces (une ligne = une puce)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ devisId, ...input }) => run(async () => {
    const r = await addDevisLot(devisId, input, currentUserId());
    if (!r) throw new Error(`Devis introuvable pour l'id « ${devisId} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_update_devis_lot",
  {
    title: "Modifier un lot de devis",
    description: `Modifie un lot : titre, rendu (DETAILLE | CONDENSE = forfait), libelleClient, description. Seuls les champs fournis changent.

⚠️ Passer un lot en CONDENSE CACHE son détail au client (une seule ligne au sous-total) ; le repasser en DETAILLE le DÉVOILE.

Args : lotId (requis — voir dumtools_get_devis → lots[].id) ; titre? ; rendu? ; libelleClient? ; description?.

Retourne : le lot.`,
    inputSchema: {
      lotId: z.string().min(1).describe("Id du lot"),
      titre: z.string().min(1).optional(),
      rendu: RENDU_LOT.optional(),
      libelleClient: z.string().optional(),
      description: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ lotId, ...input }) => run(async () => {
    const r = await updateDevisLot(lotId, input, currentUserId());
    if (!r) throw new Error(`Lot introuvable pour l'id « ${lotId} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_add_devis_lignes",
  {
    title: "Ajouter des lignes à un devis",
    description: `Ajoute une ou plusieurs lignes à un devis, d'un seul appel. Tout est résolu et validé AVANT d'écrire : une ligne fautive n'en laisse pas d'autres à moitié posées.

${REGLE_DIVERS}

Chaque ligne a un type :
  · "article"    — produitId OU ref (référence exacte : interne, fabricant ou fournisseur) + designation (TOUJOURS la fournir : c'est le libellé de la ligne Divers si l'article n'est pas au magasin). Trouvé → désignation, déboursé et coefficient viennent du magasin (prixVente/debourse éventuels IGNORÉS, et signalés). Absent, archivé ou ambigu → ligne Divers, avec la raison et les candidats.
  · "prestation" — prestationId, OU ref = n° d'article BPU (« 5.4.9 »), OU designation = libellé EXACT du référentiel. Absente → Divers (jamais créée).
  · "divers"     — designation (requis) + prixVente (€ HT unitaire) OU debourse (€, le prix de vente en découle au coef du devis, ou au coef donné). ref? est gardée sur la ligne.
  · "texte"      — texte : un commentaire intercalé, sans quantité ni prix.
Communs : quantite? (défaut 1), unite? (Divers), remise? (%), option? (hors total), note? (interne, jamais imprimée), lotId? OU lotTitre? (lot créé s'il n'existe pas).
Un Divers sans prix est posé à 0 € et signalé « aChiffrer » : demander le prix à l'utilisateur plutôt que d'en inventer un.

Args : devisId (requis) ; lotId? OU lotTitre? (lot par défaut de toutes les lignes) ; lignes (requis).

Retourne : ajoutees, lignes[] (index, id, genre, designation, quantite, prixVenteUnitaire, totalHt, passeeEnDivers?, candidats?, aChiffrer?, sansPrix?, prixIgnore?), passeesEnDivers[], aChiffrer[], sansPrix[], associationsProposees[] (accessoires/variantes que ces articles appellent : à PROPOSER, jamais ajoutés d'office), lotsCrees[], totaux, consignes[] — à suivre.

${UNITES_DEVIS}`,
    inputSchema: {
      devisId: z.string().min(1).describe("Id du devis"),
      lotId: z.string().min(1).optional().describe("Lot par défaut (id)"),
      lotTitre: z.string().min(1).optional().describe("Ou : lot par défaut, par titre (créé s'il manque)"),
      lignes: z
        .array(
          z.object({
            type: z.enum(["article", "prestation", "divers", "texte"]).describe("Nature de la ligne"),
            produitId: z.string().min(1).optional().describe("article : id du produit (dumtools_search_articles_devis)"),
            prestationId: z.string().min(1).optional().describe("prestation : id de la prestation"),
            ref: z.string().min(1).optional().describe("article : référence exacte · prestation : n° BPU · divers : réf. citée"),
            designation: z.string().optional().describe("Libellé — requis pour un Divers, et repli d'un article/prestation introuvable"),
            texte: z.string().optional().describe("texte : le commentaire"),
            quantite: z.number().positive().optional().describe("Quantité décimale (défaut 1)"),
            unite: z.string().optional().describe("Unité d'un Divers (U, h, j, forfait, m…)"),
            prixVente: z.number().min(0).optional().describe("Divers : prix de vente unitaire en € HT"),
            debourse: z.number().min(0).optional().describe("Divers : déboursé unitaire en € (prix d'achat)"),
            coef: z.number().positive().max(20).optional().describe("Divers : coefficient à appliquer au debourse (1.35)"),
            remise: z.number().min(0).max(100).optional().describe("Remise de ligne en %"),
            option: z.boolean().optional().describe("Option : chiffrée mais hors total"),
            note: z.string().optional().describe("Note interne (jamais imprimée)"),
            lotId: z.string().min(1).optional().describe("Lot de cette ligne (id)"),
            lotTitre: z.string().min(1).optional().describe("Ou : lot de cette ligne, par titre"),
          }),
        )
        .min(1)
        .max(200)
        .describe("Lignes à ajouter, dans l'ordre"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ devisId, ...input }) => run(async () => {
    const r = await addDevisLignes(devisId, input, currentUserId());
    if (!r) throw new Error(`Devis introuvable pour l'id « ${devisId} ». Vérifiez l'id via dumtools_list_devis.`);
    return r;
  }),
);

server.registerTool(
  "dumtools_update_devis_ligne",
  {
    title: "Modifier une ligne de devis",
    description: `Modifie une ligne. Seuls les champs fournis changent.

Prix — deux pilotages qui S'EXCLUENT : prixVente (€ HT unitaire, efface le coefficient) OU coef (recalcule le prix depuis le déboursé figé). debourse corrige le prix d'achat (le prix suit le coefficient en place) ; null le retire.
Autres : designation, unite, quantite (0 permis), remise (%), option (hors total), note (interne), lotId (null = hors lot) OU lotTitre (créé s'il manque).
Ligne TEXTE : seul "texte" (et le lot) se modifie — et un commentaire mis en forme (titres, listes, images) est refusé, pour ne pas le détruire.

Ne transforme pas une ligne Divers en article : supprimer (dumtools_delete_devis_ligne) puis ajouter (dumtools_add_devis_lignes).

Args : ligneId (requis — dumtools_get_devis → lots[].lignes[].id) + champs.

Retourne : { devisId, ligne, totaux }.

${UNITES_DEVIS}`,
    inputSchema: {
      ligneId: z.string().min(1).describe("Id de la ligne"),
      designation: z.string().min(1).optional(),
      unite: z.string().optional(),
      quantite: z.number().min(0).optional().describe("Quantité décimale"),
      prixVente: z.number().min(0).optional().describe("Prix de vente unitaire € HT (efface le coef)"),
      coef: z.number().positive().max(20).nullable().optional().describe("Coefficient (1.35) — recalcule le prix"),
      debourse: z.number().min(0).nullable().optional().describe("Déboursé unitaire € (null = inconnu)"),
      remise: z.number().min(0).max(100).optional().describe("Remise de ligne en %"),
      option: z.boolean().optional(),
      note: z.string().optional().describe("Note interne"),
      texte: z.string().optional().describe("Ligne TEXTE : nouveau commentaire"),
      lotId: z.string().min(1).nullable().optional().describe("Déplacer vers ce lot (null = hors lot)"),
      lotTitre: z.string().min(1).optional().describe("Ou : déplacer vers ce lot, par titre"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ ligneId, ...input }) => run(async () => {
    const r = await updateDevisLigne(ligneId, input, currentUserId());
    if (!r) throw new Error(`Ligne introuvable pour l'id « ${ligneId} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_delete_devis_ligne",
  {
    title: "Supprimer une ligne de devis",
    description: `Supprime une ligne d'un devis (et les images d'un commentaire qui ne sont plus citées). Pour une ligne qu'on négocie, préférer option: true (dumtools_update_devis_ligne) : une option se garde, on ne reperd pas son chiffrage.

Args : ligneId (requis).

Retourne : { devisId, deleted: true, totaux }.`,
    inputSchema: { ligneId: z.string().min(1).describe("Id de la ligne") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ ligneId }) => run(async () => {
    const r = await deleteDevisLigne(ligneId, currentUserId());
    if (!r) throw new Error(`Ligne introuvable pour l'id « ${ligneId} » (déjà supprimée ?).`);
    return r;
  }),
);

server.registerTool(
  "dumtools_delete_devis",
  {
    title: "Supprimer un devis",
    description: `Supprime DÉFINITIVEMENT un devis (lots, lignes, médias). Action irréversible sur une base partagée — à n'utiliser que sur confirmation explicite de l'utilisateur. Un devis émis ou publié chez le client ne se supprime pas à la légère : une révision (dumtools_revise_devis) garde la trace.

Les révisions ultérieures perdent leur parent mais restent ; le numéro n'est pas réattribué.

Args : id (requis).

Retourne : { deleted: true }.`,
    inputSchema: { id: z.string().min(1).describe("Id du devis à supprimer") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const deleted = await deleteDevis(id, currentUserId());
    if (!deleted) throw new Error(`Devis introuvable pour l'id « ${id} » (déjà supprimé ?).`);
    return { id, deleted: true };
  }),
);

server.registerTool(
  "dumtools_revise_devis",
  {
    title: "Nouvelle révision d'un devis",
    description: `Crée la révision suivante d'un devis : MÊME numéro (DT260052 v2), chaînée à la précédente, contenu recopié À L'IDENTIQUE (prix figés compris), en BROUILLON. C'est le geste de la négociation — la v1 reste lisible telle qu'envoyée.

≠ dumtools_duplicate_devis (nouveau numéro, sans lien : le devis d'à côté).

Args : id (requis) — le devis à réviser.

Retourne : { id, numero, revision, libelle, url }.`,
    inputSchema: { id: z.string().min(1).describe("Id du devis à réviser") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const r = await reviseDevis(id, currentUserId());
    if (!r) throw new Error(`Devis introuvable pour l'id « ${id} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_duplicate_devis",
  {
    title: "Dupliquer un devis",
    description: `Copie un devis vers un NOUVEAU numéro, révision 1, sans lien avec la source : la même chaufferie pour un autre client. Repart en BROUILLON, prix figés tels quels (un rechiffrage est un geste à part : dumtools_refresh_devis_prix). Le fil de discussion n'est pas copié.

≠ dumtools_revise_devis (même numéro, suite d'une négociation).

Args : id (requis) — le devis à copier.

Retourne : { id, numero, url }.`,
    inputSchema: { id: z.string().min(1).describe("Id du devis à copier") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ id }) => run(async () => {
    const r = await duplicateDevis(id, currentUserId());
    if (!r) throw new Error(`Devis introuvable pour l'id « ${id} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_refresh_devis_prix",
  {
    title: "Rafraîchir les prix d'un devis",
    description: `Relit le Magasin pour les lignes ARTICLE : déboursé du jour, cascade du coefficient rejouée (un coefficient forcé à la main sur une ligne est conservé), désignation et référence remises à jour. Les Divers, prestations et commentaires ne bougent pas ; un article sans prix au magasin non plus.

⚠️ Le devis FIGE ses prix : ce rafraîchissement est un geste explicite — à ne lancer que si l'utilisateur le demande (dumtools_get_devis signale les prixPerime). Sur un devis déjà émis, cela change ce que le client a reçu.

Args : devisId (requis) ; ligneIds? (sinon toutes les lignes article).

Retourne : { devisId, misesAJour, totaux }.`,
    inputSchema: {
      devisId: z.string().min(1).describe("Id du devis"),
      ligneIds: z.array(z.string().min(1)).optional().describe("Limiter à ces lignes"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ devisId, ligneIds }) => run(async () => {
    const r = await refreshDevisPrix(devisId, ligneIds, currentUserId());
    if (!r) throw new Error(`Devis introuvable pour l'id « ${devisId} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_reprendre_bom_devis",
  {
    title: "Reprendre le besoin matériel d'une affaire",
    description: `Verse le besoin matériel (BOM) d'une affaire dans un lot du devis : automates et modules des projets GTB, matériel appelé par les points (nomenclature), lignes manuelles. Les quantités sont celles du besoin ; le prix vient du magasin (déboursé × coefficient).

Ce que la BOM ne relie à AUCUN produit (automate, module ou point sans nomenclature) ne crée RIEN au magasin : c'est versé en Divers à 0 €, signalé « passeesEnDivers » — à annoncer, et à chiffrer. Les variantes non tranchées (« choixAFaire ») et le matériel « hors fourniture » ne sont pas versés.

⚠️ La reprise COPIE, elle ne synchronise pas : la rejouer AJOUTE les lignes une seconde fois.

Args : devisId (requis) ; chantierId? OU numeroWhy? (défaut : l'affaire du devis) ; titreLot? (défaut « Fourniture ») ; produitIds? (ne verser que ces articles — voir dumtools_get_affaire / l'écran Matériel) ; trousEnDivers? (défaut : vrai sans sélection, faux avec).

Retourne : { lotId, articlesAjoutes, passeesEnDivers[], choixAFaire[], horsFourniture[], sansPrix[], produitIdsIgnores[], totaux, consignes[] }.`,
    inputSchema: {
      devisId: z.string().min(1).describe("Id du devis"),
      chantierId: z.string().min(1).optional().describe("Affaire dont on reprend le besoin (défaut : celle du devis)"),
      numeroWhy: z.string().min(1).optional().describe("Ou : numéro Why de l'affaire"),
      titreLot: z.string().min(1).optional().describe("Titre du lot créé (défaut « Fourniture »)"),
      produitIds: z.array(z.string().min(1)).optional().describe("Ne verser que ces articles"),
      trousEnDivers: z.boolean().optional().describe("Verser en Divers ce qui n'a pas de produit relié"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ devisId, ...input }) => run(async () => {
    const r = await reprendreBomDevis(devisId, input, currentUserId());
    if (!r) throw new Error(`Devis introuvable pour l'id « ${devisId} ».`);
    return r;
  }),
);

server.registerTool(
  "dumtools_create_produit",
  {
    title: "Créer un produit au Magasin (demande explicite)",
    description: `Crée un produit dans le référentiel du Magasin.

⛔ À N'UTILISER QUE SUR DEMANDE EXPLICITE DE L'UTILISATEUR (« crée ce produit au magasin », « ajoute cette référence au magasin »). JAMAIS de sa propre initiative, jamais pour éviter un Divers, jamais pour « compléter » un devis. En l'absence d'une telle demande, un article absent du magasin se chiffre en Divers. demandeExplicite: true atteste que l'utilisateur l'a demandé.

Réservé aux profils Achats et Administrateur. Refusé si la référence interne existe déjà (même archivée) — l'id existant est rendu. Catégorie, fabricant et fournisseur doivent EXISTER (le MCP n'en crée pas ; la liste des existants est donnée en cas d'erreur).

Args : demandeExplicite (true, requis) ; refInterne (requis, unique) ; designation (requis) ; unite? (U|m|kg…) ; refFabricant? ; refFournisseur? ; prixAchat? (€ HT) ; categorie? ; fabricant? ; fournisseur? (noms existants) ; note?.

Retourne : { produitId, refInterne, designation, url, consigne }.`,
    inputSchema: {
      demandeExplicite: z.literal(true).describe("true : l'utilisateur a EXPLICITEMENT demandé la création"),
      refInterne: z.string().min(1).describe("Référence interne (unique)"),
      designation: z.string().min(1).describe("Désignation"),
      unite: z.string().optional().describe("Unité (défaut U)"),
      refFabricant: z.string().optional(),
      refFournisseur: z.string().optional(),
      prixAchat: z.number().min(0).optional().describe("Prix d'achat annoncé en € HT"),
      categorie: z.string().optional().describe("Nom d'une catégorie EXISTANTE"),
      fabricant: z.string().optional().describe("Nom d'un fabricant EXISTANT"),
      fournisseur: z.string().optional().describe("Nom d'un fournisseur EXISTANT"),
      note: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => run(async () => createProduit(input, currentUserId())),
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
  tracerManifeste(nomsOutils());
}

/** Extrait le jeton d'un en-tête « Authorization: Bearer <jeton> ». */
function bearerFrom(header: unknown): string | undefined {
  const h = Array.isArray(header) ? header[0] : header;
  if (typeof h !== "string") return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : undefined;
}

/* --- Manifeste observable -----------------------------------------------------
 * De quoi VOIR ce que ce processus expose vraiment, sans jeton et sans lire le
 * code. Ça manquait le jour où un serveur resté en mémoire depuis un mois
 * servait un manifeste périmé : les données, elles, étaient à jour (elles
 * viennent de la base), donc tout semblait normal — seule la liste d'outils
 * était figée, et rien ne le disait.
 * ------------------------------------------------------------------------------ */

/** Noms des outils réellement enregistrés. Le SDK ne les expose pas
 *  publiquement : on lit son registre, et on rend `null` plutôt qu'un 0
 *  trompeur si la propriété changeait de nom dans une version future. */
function nomsOutils(): string[] | null {
  const registre = (buildServer() as unknown as { _registeredTools?: Record<string, unknown> })
    ._registeredTools;
  return registre ? Object.keys(registre).sort() : null;
}

/** Empreinte courte du manifeste : deux processus qui l'affichent identique
 *  exposent les mêmes outils. */
function empreinteManifeste(noms: string[] | null): string | null {
  return noms ? createHash("sha256").update(noms.join(",")).digest("hex").slice(0, 8) : null;
}

/** Trace de démarrage : le manifeste en clair dans le journal du serveur.
 *  ⚠️ Toujours sur stderr — en stdio, stdout porte le protocole. */
function tracerManifeste(noms: string[] | null): void {
  console.error(
    `  manifeste ${empreinteManifeste(noms) ?? "?"} — ${noms?.length ?? "?"} outils : ${noms?.join(", ") ?? "(registre illisible)"}`,
  );
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

  const manifeste = nomsOutils();
  const demarreLe = new Date().toISOString();
  // Les NOMS des outils restent derrière l'authentification (cet endpoint est
  // joignable depuis internet) ; le compte et l'empreinte suffisent à dire si
  // un client parle bien à un serveur à jour.
  app.get("/health", (_req, res) =>
    res.json({
      ok: true,
      server: "dumtools-mcp-server",
      demarreLe,
      outils: manifeste?.length ?? null,
      manifeste: empreinteManifeste(manifeste),
    }),
  );

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
    tracerManifeste(manifeste);
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
