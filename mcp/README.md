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

# Outil Devis : règle du Divers, témoins négatifs, compteur fictif 2099
npx tsx mcp/devis-smoke.mts

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

Vérifier depuis le poste distant (navigateur) : `http://<IP>:8787/health`
(ou `https://dumtoolsmcp.datagtb.com/health` à travers le tunnel) renvoie

```json
{"ok":true,"server":"dumtools-mcp-server","demarreLe":"…","outils":39,"manifeste":"2e1ba148"}
```

Sinon, pare-feu : `sudo ufw allow 8787/tcp`.

⚠️ **`outils` / `manifeste` disent ce que CE processus expose vraiment** — c'est
la première chose à regarder quand un client ne voit pas un outil qu'on vient
d'ajouter. Le piège vécu : un serveur resté en mémoire depuis un mois servait un
manifeste périmé, mais ses **données** étaient à jour (elles viennent de la
base) — donc tout semblait normal, et « la connexion est vivante » ne prouvait
rien. La liste des outils est négociée **une fois** par session cliente : après
un redémarrage il faut **déconnecter/reconnecter le connecteur** (ou ouvrir une
nouvelle conversation) pour la renégocier. Les noms complets sont tracés au
démarrage dans le journal du serveur (jamais sur `/health`, joignable depuis
internet).

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
| `dumtools_get_affaire` | fiche affaire : automates + documents + notes + visites rattachés, état, besoin armoire |
| `dumtools_list_clients` | référentiel client + nb de réalisations |
| `dumtools_get_client` | fiche client agrégée (projets GTB + documents rattachés) |
| `dumtools_list_catalog` | catalogue de points + modèles de saisie |
| `dumtools_list_materiel` | base matériel (automates + modules Distech) |
| `dumtools_recommend_controller` | recommandation d'automate (depuis un projet ou un besoin saisi) |
| `dumtools_list_notes` | notes d'affaire (résumés, filtrables par affaire) |
| `dumtools_get_note` | note complète, contenu rendu en **markdown** |
| `dumtools_list_visites` | visites de chantier (filtres : affaire, type, dates, `sansAffaire`) |
| `dumtools_get_visite` | visite complète : checklist point par point, réserves, médias |
| `dumtools_list_reserves` | **réserves encore ouvertes**, groupées par affaire (le reste à lever) |
| `dumtools_list_wiki_rubriques` | rubriques du wiki + nombre de pages |
| `dumtools_list_wiki_pages` | pages du wiki (toutes ou d'une rubrique) |
| `dumtools_get_wiki_page` | page complète, contenu rendu en **markdown** |
| `dumtools_search_wiki` | recherche plein-texte + facette de tags |
| `dumtools_list_devis` | devis avec totaux calculés (filtres : état, affaire, client) |
| `dumtools_get_devis` | devis complet : entête, lots, lignes, totaux, alertes (sans prix, Divers à chiffrer, prix périmés) |
| `dumtools_search_articles_devis` | articles du Magasin + prestations, avec le prix de vente qu'appliquerait un devis |

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
| `dumtools_create_visite` | prépare une visite (checklist du modèle + report des réserves ouvertes) | — |
| `dumtools_update_visite` | métadonnées d'une visite : titre, type, date, **rattachement à une affaire** | idempotent |
| `dumtools_delete_visite` | supprime une visite (+ photos/vocaux sur disque) | destructif |
| `dumtools_create_wiki_page` | crée une page de wiki dans une rubrique (markdown initial) | — |
| `dumtools_update_wiki_page` | remplace titre/contenu/tags, anti-collision par version | — |
| `dumtools_delete_wiki_page` | supprime une page de wiki (+ médias sur disque) | destructif |
| `dumtools_create_devis` | crée un devis (n° DT atomique) rattaché à une affaire **existante** ou à un client | — |
| `dumtools_update_devis` | entête : titre, client/affaire, coef, TVA, remise globale, validité, état, destinataire, affichage client | idempotent |
| `dumtools_add_devis_lot` / `dumtools_update_devis_lot` | lot détaillé ou forfait (`CONDENSE`), phrase client, description | — / idempotent |
| `dumtools_add_devis_lignes` | ajoute des lignes (article / prestation / divers / texte) — **règle du Divers** | — |
| `dumtools_update_devis_ligne` | quantité, prix de vente OU coef, déboursé, remise, option, note, lot | idempotent |
| `dumtools_delete_devis_ligne` | supprime une ligne | destructif |
| `dumtools_revise_devis` | nouvelle révision (même numéro, v2) | — |
| `dumtools_duplicate_devis` | copie vers un nouveau numéro | — |
| `dumtools_refresh_devis_prix` | relit les déboursés du magasin (geste explicite) | idempotent |
| `dumtools_reprendre_bom_devis` | verse le besoin matériel d'une affaire dans un lot | — |
| `dumtools_delete_devis` | supprime un devis | destructif |
| `dumtools_create_produit` | crée un produit au Magasin — **demande explicite + Achats/Admin seulement** | — |

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

**Visites de chantier** — le passage sur site : une checklist « pour ne rien
oublier » (un modèle par type : relevé / suivi / réception / maintenance), des
**réserves** reportées d'une visite à la suivante tant qu'elles ne sont pas
levées, des photos et des notes vocales. Deux choses à savoir :

- ⚠️ **le MCP ne voit que l'état SYNCHRONISÉ.** La saisie vit localement sur le
  téléphone (îlot offline, IndexedDB) : une visite faite ce matin peut n'être
  pas encore remontée.
- ⚠️ **le CONTENU d'une visite ne s'écrit pas depuis le MCP** — seulement ses
  métadonnées (`update_visite`). L'écraser depuis le bureau perdrait la copie
  encore ouverte sur le téléphone (fusion « dernier gagne » de `syncVisite`).
  Pour reprendre une visite : `/outils/visites/terrain?ouvrir={id}`.

`list_reserves` applique la fusion inter-visites (l'état le plus récent gagne) :
une réserve levée disparaît d'elle-même, il n'y a rien à cocher. `create_visite`
exige une affaire — au terrain une visite peut naître orpheline (le relevé
précède souvent le n° Why) et se rattacher au retour avec `update_visite`, mais
depuis le bureau rien ne justifie d'en créer une.

**Devis** — le moteur de chiffrage (déboursé du Magasin × coefficient = prix de
vente, [`docs/DEVIS.md`](../docs/DEVIS.md) §28). Quatre choses à savoir :

- ⚠️ **un article absent du Magasin ne se crée PAS.** `add_devis_lignes` le
  pose en ligne **Divers** (genre `LIBRE`) et le dit (`passeesEnDivers`,
  `aChiffrer`, `consignes`). Un article se retrouve par son id ou sa référence
  EXACTE (interne, fabricant ou fournisseur, sans ambiguïté) — jamais par sa
  désignation. `create_produit` n'existe que pour une demande explicite de
  l'utilisateur : `demandeExplicite: true` imposé par le schéma, profil
  Achats/Admin, catégorie/fabricant/fournisseur existants.
- **le MCP parle en euros** (décimaux), quantités décimales, coefficient
  multiplicateur (`1.35`), remises et TVA en pourcent ; l'app compte en
  centimes et millièmes, la conversion se fait dans `data.mts`.
- **les écritures passent par le noyau de l'app** (`src/tools/devis/ecritures.ts`,
  `src/tools/magasin/ecritures.ts`) — les mêmes fonctions que l'éditeur, sans
  session ni rafraîchissement d'écran. Elles exigent un utilisateur identifié
  (un devis est signé de son auteur).
- **hors MCP** : la publication du lien client `/d/…` (elle fait sortir le
  devis) ; et `create_devis` ne crée pas d'affaire.

## ⚠️ Base partagée / prod

Les outils d'écriture modifient la base réelle, **visible immédiatement par tous
les collègues**. Le serveur est prévu pour un usage local et supervisé. Ne pas
exposer ce transport sans authentification.

## Architecture (rappel)

- `server.mts` — serveur MCP + enregistrement des outils (schémas Zod, annotations).
- `data.mts` — couche données : réutilise le singleton Prisma (`../src/lib/db`) et
  les modules de domaine purs (`derivation`, `affectation-auto`, `reco-automate`,
  `catalogue-queries`). N'appelle **jamais** les `actions.ts` (Auth.js +
  `revalidatePath`, inutilisables hors Next). Historiquement les requêtes
  triviales y étaient réimplémentées ; **depuis le Devis, on réutilise le code
  de l'app** : ses `queries.ts` (lectures) et ses **noyaux d'écritures**
  (`src/tools/devis/ecritures.ts`, `src/tools/magasin/ecritures.ts`) que les
  actions enveloppent aussi — une numérotation, une cascade de coefficient ou
  une garde de rôle recopiée ici finirait par diverger de l'éditeur.
- `sans-server-only.mts` — neutralise le paquet **`server-only`** pour ce
  processus. ⚠️ Sans lui le serveur **ne démarre plus du tout** (« Connection
  closed » côté client, sans autre message) : la couche métier de l'app en
  traverse un — `getCatalogue` → `magasin/documentation` depuis que les fiches
  constructeur vivent sur les produits — et son entrée par défaut lève une
  exception à l'import hors rendu serveur Next. Et non, `--conditions=react-server`
  (la parade des scripts de `scripts/`) ne convient pas ici : elle donne le build
  react-server de React, sans `useLayoutEffect`, sur lequel
  `@blocknote/server-util` (markdown des notes) s'effondre. À importer **en
  premier** dans tout point d'entrée du MCP.
- `smoke.mts`, `test-client.mts` — tests de fumée (dev).
- `evals/dumtools.xml` — jeu d'évaluations.
