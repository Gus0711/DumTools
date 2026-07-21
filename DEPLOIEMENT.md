# Déploiement — DumTools

Plateforme auto-hébergée sur une VM (Proxmox). Stack : Next.js (standalone) +
PostgreSQL + Caddy, orchestrés par Docker Compose.

## Développement local

```bash
cp .env.example .env          # ajuster si besoin
npm install
docker compose -f docker-compose.dev.yml up -d   # Postgres (port 5433)
npm run db:migrate            # applique les migrations
npm run db:seed               # crée l'admin (admin@dumortier02.fr / changeme)
npm run dev                   # app (http://localhost:3000) + serveur MCP (:8787)
```

`npm run dev` lance **aussi le serveur MCP HTTP** (connecteur Claude Desktop,
port 8787) via `concurrently` — logs préfixés `[next]` / `[mcp]`, Ctrl+C arrête
les deux. Si le MCP tourne déjà (autre terminal, prod locale), il s'efface tout
seul. App seule : `npm run dev:app`.

Scripts utiles : `npm run db:studio` (explorateur DB), `npm run db:generate`.

Le stack dev démarre aussi **Adminer** (visualiseur web de la base, dev
uniquement) sur http://localhost:8081. Connexion pré-remplie :

| Champ            | Valeur       |
| ---------------- | ------------ |
| Système          | PostgreSQL   |
| Serveur          | `postgres`   |
| Utilisateur      | `dumtools`   |
| Mot de passe     | `dumtools`   |
| Base             | `dumtools`   |

Alternative à `npm run db:studio` (Prisma Studio) : Adminer donne un accès SQL
brut, Prisma Studio une vue orientée modèles.

## Prod locale (usage quotidien / tunnel Cloudflare)

`next dev` compile chaque route à la première visite (plusieurs secondes par
écran) : pénible pour l'usage quotidien, et le service worker offline y est
désactivé. Pour **utiliser** l'app (et la servir aux collègues via le tunnel
sur le port 3000), servir le **build de production** sur la même base Postgres
que le dev (port 5433) :

```bash
scripts/serve-prod.sh --build   # build + sert sur :3000 (LAN + tunnel)
scripts/serve-prod.sh           # re-sert le dernier build (démarrage instantané)
```

Le script démarre **aussi le serveur MCP HTTP** (port 8787, tunnel
`dumtoolsmcp.datagtb.com`) et l'arrête avec lui — un seul lanceur pour l'usage
quotidien : app + connecteur Claude Desktop.

- Réponses en ~10–150 ms (routes précompilées), « Ready in 0ms ».
- SW offline actif (indispensable pour les tests device Visites / mise en service).
- Les binaires restent dans le projet (`.visites-media/`, `.notes-media/`,
  `.wiki-media/`, `.spool/`) — le script ancre les variables d'env, rien ne vit
  dans `.next/standalone` (effacé à chaque build).
- ⚠️ Un build est une **photo du code** : après une modif, relancer avec
  `--build`. Pour développer pendant que la prod locale tourne :
  `PORT=3001 npm run dev`.

## Production (VM Proxmox)

Prérequis sur la VM : Docker + plugin Compose, un enregistrement DNS/hosts
faisant pointer le domaine interne vers la VM.

```bash
git clone <repo> /opt/dumtools && cd /opt/dumtools
cp .env.prod.example .env.prod
#  -> renseigner POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32),
#     DOMAIN et AUTH_URL
docker compose --env-file .env.prod up -d --build
```

Au démarrage : le service `migrate` applique les migrations, puis `app` démarre
et `caddy` publie l'app en HTTPS (certificat interne auto-signé).

Créer le premier administrateur (une fois) :

```bash
docker compose --env-file .env.prod run --rm \
  -e SEED_ADMIN_EMAIL=prenom.nom@dumortier02.fr \
  -e SEED_ADMIN_PASSWORD='motDePasseFort' \
  migrate npx tsx prisma/seed.ts
```

### Mise à jour

```bash
git pull
docker compose --env-file .env.prod up -d --build
```

### Sauvegardes

`scripts/backup-db.sh` fait un `pg_dump` compressé dans `./backups`
(rétention 14 jours). À planifier en cron — voir l'en-tête du script.

## Architecture des variables d'environnement

| Variable            | Rôle                                             |
| ------------------- | ------------------------------------------------ |
| `DATABASE_URL`      | Connexion Postgres (Prisma)                      |
| `AUTH_SECRET`       | Signature des sessions Auth.js                   |
| `AUTH_URL`          | URL publique de l'app                            |
| `POSTGRES_PASSWORD` | Mot de passe DB (prod, via compose)              |
| `DOMAIN`            | Domaine interne servi par Caddy                  |
