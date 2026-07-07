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
npm run dev                   # http://localhost:3000
```

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
