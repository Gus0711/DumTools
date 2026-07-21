# dumtools-mcp-server

Serveur **MCP** (Model Context Protocol) exposant les données DumTools à un client
Claude (Claude Code / Claude Desktop). Transport **stdio**, usage **local**.

Il réutilise directement la couche métier de l'application (Prisma + dérivation
liste↔points, affectation auto, réconciliation modules, recommandation d'automate),
sans passer par une API HTTP. Les écritures agissent donc sur **la vraie base
partagée** — voir l'avertissement plus bas.

## Prérequis

- La base PostgreSQL de l'app accessible (variable `DATABASE_URL` dans le `.env`
  à la racine du projet). En dev : `docker compose -f docker-compose.dev.yml up -d`.
- Client Prisma généré (`npm run db:generate`) — déjà le cas si l'app tourne.
- Dépendances du serveur installées :

  ```bash
  cd mcp && npm install
  ```

  (`@modelcontextprotocol/sdk` + `zod` sont isolés dans `mcp/node_modules` pour ne
  pas toucher l'arbre de dépendances de l'app ; `tsx` et Prisma viennent de la racine.)

## Lancement / test

> ⚠️ **Toujours lancer depuis la racine du repo** (`cd` DumTools) : c'est le
> répertoire courant qui permet de résoudre l'alias `@/` via le `tsconfig.json`
> racine. Le serveur charge `.env` tout seul.

```bash
# Test de la couche data (hors protocole)
npx tsx mcp/smoke.mts

# Test du serveur via le protocole MCP réel (spawn + handshake + appels)
npx tsx mcp/test-client.mts

# Inspecteur interactif (ouvre un navigateur)
cd mcp && npm run inspect
```

## Brancher Claude Code

Un fichier `.mcp.json` (portée projet) est déjà présent à la racine :

```json
{
  "mcpServers": {
    "dumtools": {
      "command": "npx",
      "args": ["tsx", "mcp/server.mts"],
      "env": { "MCP_USER_EMAIL": "augustin.duhant@dumortier02.fr" }
    }
  }
}
```

Ouvrir Claude Code dans le dossier du projet ; il proposera d'approuver le serveur
`dumtools`. Vérifier avec `/mcp`. `MCP_USER_EMAIL` (optionnel) crédite les créations
à cet utilisateur ; s'il ne correspond à aucun compte, les écritures restent
non attribuées (`createdById = null`, comportement déjà géré par le schéma).

## Brancher Claude Desktop (même machine, stdio)

Ajouter dans `claude_desktop_config.json` (adapter le chemin absolu) :

```json
{
  "mcpServers": {
    "dumtools": {
      "command": "npx",
      "args": ["tsx", "mcp/server.mts"],
      "cwd": "/home/gus/Projets/DumTools",
      "env": { "MCP_USER_EMAIL": "augustin.duhant@dumortier02.fr" }
    }
  }
}
```

## Brancher un client distant (transport HTTP)

Le transport **stdio** impose que le client tourne sur **la même machine** que le
serveur. Pour un **Claude Desktop sur un autre poste**, on lance le serveur en
**HTTP streamable** (`./mcp/serve-http.sh`). Deux façons de s'authentifier :

1. **« Ajouter un connecteur personnalisé » (OAuth)** — la voie recommandée,
   voir ci-dessous : connexion avec son compte DumTools dans le navigateur.
2. **Jeton personnel + pont `mcp-remote`** — l'ancienne voie, toujours acceptée.

### « Ajouter un connecteur personnalisé » (Claude Desktop / claude.ai, OAuth)

Le serveur implémente le flux OAuth du spec MCP (`mcp/oauth.mts`) : découverte
(`/.well-known/*`), enregistrement dynamique des clients, `/authorize` (page de
connexion DumTools), `/token` (code + PKCE S256, usage unique), `/revoke`.
**Identité = le compte DumTools** (email + mot de passe, comptes actifs) ;
chaque appareil reçoit **son** jeton (table `McpToken`, hash SHA-256, révocation
= suppression de la ligne). Les écritures sont créditées à l'utilisateur connecté.

Prérequis : le serveur doit être joignable **en HTTPS** par le poste client —
en pratique via le tunnel Cloudflare : hostname public `dumtoolsmcp.datagtb.com`
→ `http://localhost:8787`, et `MCP_PUBLIC_URL=https://dumtoolsmcp.datagtb.com`
(défaut de `serve-http.sh`).

Côté Claude Desktop : **Paramètres → Connecteurs → Ajouter un connecteur
personnalisé** → URL `https://dumtoolsmcp.datagtb.com/mcp` → le navigateur s'ouvre sur
la page de connexion DumTools → autoriser. C'est tout.

Révoquer un appareil : supprimer sa ligne `McpToken` (table visible dans
Adminer/Prisma Studio, colonnes `client` + `lastUsedAt` pour s'y retrouver) ;
désactiver le compte coupe tous ses jetons d'un coup.

### Authentification — jeton par compte `User` (voie `mcp-remote`)

Chaque requête HTTP doit porter un en-tête `Authorization: Bearer <jeton>`. Le
jeton est rattaché à un compte `User` (colonne `mcpTokenHash` = SHA-256 du jeton,
jamais le jeton en clair). Le serveur résout le jeton en utilisateur : requête
sans jeton / jeton inconnu / compte inactif → **401**. Les **écritures sont
attribuées à cet utilisateur** (`createdById`).

Générer / gérer les jetons (depuis la racine du repo) :

```bash
npx tsx scripts/mcp-token.mts <email>            # génère un jeton (affiché 1 fois)
npx tsx scripts/mcp-token.mts <email> --revoke   # coupe l'accès de ce compte
npx tsx scripts/mcp-token.mts --list             # comptes ayant un jeton actif
```

Régénérer un jeton invalide l'ancien. **Avantages** : révocation individuelle,
identité réelle, audit — pas de secret unique partagé.

### 1. Lancer le serveur en HTTP (sur la machine où sont le code et la BDD)

```bash
# depuis la racine du repo
TRANSPORT=http MCP_HTTP_PORT=8787 npx tsx mcp/server.mts
```

Écoute sur `0.0.0.0:8787` → endpoint `http://<IP>:8787/mcp`, sonde de vie
`http://<IP>:8787/health` (la sonde ne demande pas de jeton). Variables :
`MCP_HTTP_PORT` (défaut 8787), `MCP_HTTP_HOST` (défaut `0.0.0.0`). En mode HTTP,
`MCP_USER_EMAIL` est ignoré (c'est le jeton qui identifie l'utilisateur).

Script prêt : `./mcp/serve-http.sh`. **Démarrage automatique** : `npm run dev`
et `scripts/serve-prod.sh` le lancent tous les deux (et l'arrêtent avec eux) ;
s'il tourne déjà sur le port, le script s'efface sans erreur.

Vérifier depuis le poste distant (navigateur) : `http://<IP>:8787/health` doit
renvoyer `{"ok":true,...}`. Sinon, pare-feu : `sudo ufw allow 8787/tcp`.

### 2. Côté Windows — `claude_desktop_config.json`

Claude Desktop ne parle nativement que le stdio : on passe par le pont
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) (**Node.js requis sur le
Windows**). Éditer via **Réglages → Développeur → Modifier la config** (⚠️ *pas*
l'écran « Connecteurs », qui exige https + OAuth). Fichier :
`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dumtools": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "http://<IP>:8787/mcp",
        "--allow-http",
        "--transport", "http-only",
        "--header", "Authorization: Bearer dtk_LE_JETON_DE_CE_POSTE"
      ]
    }
  }
}
```

Remplacer `<IP>` par l'IP du serveur et le jeton par celui **du compte de la
personne** qui utilise ce poste. Redémarrer Claude Desktop complètement.
(`--allow-http` = HTTP non-TLS sur le LAN ; en HTTPS via tunnel, le retirer.)

> ⚠️ **Exposition publique (Cloudflare Tunnel)** : le jeton par utilisateur reste
> le minimum requis. Pour une cible équipe, ajouter **Cloudflare Access** (service
> tokens) devant le tunnel pour ne pas exposer l'origine et gérer les accès de
> façon centralisée.

## Outils exposés

**Lecture** (`readOnlyHint`)

| Outil | Rôle |
|---|---|
| `dumtools_list_projects` | liste des projets GTB (résumés) |
| `dumtools_get_project` | projet complet (rows, points affectés, modules, réseaux) |
| `dumtools_list_affaires` | tableau de bord des affaires (Chantier, 1 par n° Why) |
| `dumtools_get_affaire` | fiche affaire : automates + documents + notes rattachés, état, besoin armoire |
| `dumtools_list_clients` | référentiel client + nb de réalisations |
| `dumtools_get_client` | fiche client agrégée (projets GTB + documents rattachés) |
| `dumtools_list_catalog` | catalogue de points + modèles de saisie |
| `dumtools_list_materiel` | base matériel (automates + modules Distech) |
| `dumtools_recommend_controller` | recommandation d'automate (depuis un projet ou un besoin saisi) |
| `dumtools_list_notes` | notes d'affaire (résumés, filtrables par affaire) |
| `dumtools_get_note` | note complète, contenu rendu en **markdown** |

**Écriture**

| Outil | Rôle | Annotation |
|---|---|---|
| `dumtools_create_affaire` | crée une affaire (Chantier) rattachée à un client | — |
| `dumtools_update_affaire` | modifie une affaire (identité, état, besoin armoire) + resync automates | idempotent |
| `dumtools_create_project` | crée un projet (éventuellement pré-rempli, rattaché à l'affaire du n° Why) | — |
| `dumtools_update_project_meta` | modifie l'identification (nom, client, N° Why → re-rattache l'affaire) | idempotent |
| `dumtools_update_project_rows` | remplace la liste de points → re-dérive + ré-affecte | destructif |
| `dumtools_set_project_controller` | choisit l'automate → réconcilie modules + ré-affecte | idempotent |
| `dumtools_add_module` | ajoute un module d'extension/communication → ré-affecte | — |
| `dumtools_remove_module` | retire un module (par numéro) → ré-affecte | destructif |
| `dumtools_set_project_power` | définit l'alimentation (none / integrated / 230V) | idempotent |
| `dumtools_upsert_catalog_point` | ajoute/édite un point du catalogue | idempotent |
| `dumtools_delete_project` | supprime un projet | destructif |
| `dumtools_create_note` | crée une note rattachée à une affaire existante (markdown initial) | — |
| `dumtools_update_note` | remplace titre/contenu (markdown), anti-collision par version | — |
| `dumtools_share_note` | active/révoque le lien public `/n/[jeton]` d'une note | idempotent |
| `dumtools_delete_note` | supprime une note (+ médias sur disque) | destructif |

`update_project_rows` attend la liste **complète** des lignes : appeler d'abord
`get_project`, conserver l'`id` des lignes existantes (préserve leur affectation et
leur suivi de mise en service), modifier, puis renvoyer le tout.

**Notes & markdown** — le contenu des notes s'échange en markdown
(`mcp/notes-markdown.mts`) : à la lecture, les blocs métier sont rendus en
équivalents (table de données → table markdown, HTML embarqué → bloc de code
` ```html `, carte lien → lien) ; à l'écriture, le markdown redevient des blocs
standard (une table markdown → tableau riche). `update_note` remplace TOUT le
contenu et échoue proprement en cas d'édition concurrente (relire puis
réappliquer). Le partage public s'appuie sur `APP_URL` (défaut
`https://dumtools.datagtb.com`) pour construire l'URL.

## ⚠️ Base partagée / prod

Les outils d'écriture modifient la base réelle, **visible immédiatement par tous
les collègues**. Le serveur est prévu pour un usage local et supervisé. Ne pas
exposer ce transport sans authentification.

## Architecture (rappel)

- `server.mts` — serveur MCP + enregistrement des outils (schémas Zod, annotations).
- `data.mts` — couche données : réutilise le singleton Prisma (`../src/lib/db`) et
  les modules de domaine purs (`derivation`, `affectation-auto`, `reco-automate`,
  `catalogue-queries`). Ne réutilise **pas** `queries.ts`/`actions.ts`/`providers.ts`
  (marqués `server-only` / dépendants de Next/Auth.js) — les requêtes triviales y
  sont réimplémentées en rappelant les mêmes helpers purs.
- `smoke.mts`, `test-client.mts` — tests de fumée (dev).
- `evals/dumtools.xml` — jeu d'évaluations.
