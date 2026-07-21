#!/usr/bin/env bash
# Sauvegarde DumTools : base Postgres + médias sur disque (à lancer sur la VM,
# depuis la racine du projet).
#
# Les deux sont indissociables : la base porte les fiches, le tar porte les
# binaires qu'elles référencent (photos de visite, pièces jointes de notes,
# images du wiki, médias de formulaires, spool kDrive en attente). Restaurer
# l'un sans l'autre donne des fiches en « fichier absent » (410).
#
# Cron conseillé (tous les jours à 2h) :
#   0 2 * * * cd /opt/dumtools && ./scripts/backup-db.sh >> /var/log/dumtools-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# --- Base de données ---------------------------------------------------------
OUT_DB="$BACKUP_DIR/dumtools-$STAMP.sql.gz"
echo "[backup] base -> $OUT_DB"
docker compose exec -T postgres pg_dump -U dumtools -d dumtools | gzip > "$OUT_DB"

# --- Médias sur disque -------------------------------------------------------
# Tout est sous /data dans le conteneur app (volumes déclarés dans
# docker-compose.yml) : un seul tar les couvre tous, y compris ceux des outils
# ajoutés plus tard. Le flux transite par stdout pour éviter tout problème de
# droits sur le dossier de sauvegarde de l'hôte.
OUT_MEDIA="$BACKUP_DIR/dumtools-media-$STAMP.tar.gz"
if docker compose ps --status running --services 2>/dev/null | grep -qx app; then
  echo "[backup] médias -> $OUT_MEDIA"
  docker compose exec -T app tar czf - -C /data . > "$OUT_MEDIA"
else
  echo "[backup] AVERTISSEMENT : conteneur 'app' arrêté, médias NON sauvegardés." >&2
fi

# --- Purge -------------------------------------------------------------------
find "$BACKUP_DIR" -name 'dumtools-*.sql.gz'    -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'dumtools-media-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete

echo "[backup] terminé. Restauration :"
echo "  gunzip -c $OUT_DB | docker compose exec -T postgres psql -U dumtools -d dumtools"
echo "  docker compose exec -T app tar xzf - -C /data < $OUT_MEDIA"
