#!/usr/bin/env bash
# Sauvegarde de la base DumTools (à lancer sur la VM, depuis la racine du projet).
# Cron conseillé (tous les jours à 2h) :
#   0 2 * * * cd /opt/dumtools && ./scripts/backup-db.sh >> /var/log/dumtools-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

OUT="$BACKUP_DIR/dumtools-$STAMP.sql.gz"
echo "[backup] -> $OUT"
docker compose exec -T postgres pg_dump -U dumtools -d dumtools | gzip > "$OUT"

# Purge des sauvegardes plus vieilles que RETENTION_DAYS jours.
find "$BACKUP_DIR" -name 'dumtools-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "[backup] terminé. Restauration :"
echo "  gunzip -c $OUT | docker compose exec -T postgres psql -U dumtools -d dumtools"
