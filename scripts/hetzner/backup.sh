#!/usr/bin/env bash
# Nightly backup of the self-hosted stack (run as root by spotbot-backup.timer):
#   - Postgres: pg_dump -Fc of the postgres database plus the cluster roles
#   - Storage: the MinIO data folder (bucket "stub" holds every Supabase storage object)
#   - Config: the bot and Supabase .env files and the Supabase docker-compose.yml
# Backups land in $BACKUP_DIR/<UTC timestamp>/ (root-only). Keeps $KEEP_DAILY nightly sets plus the
# Sunday set of the last $KEEP_WEEKLY weeks. When RCLONE_REMOTE is set (e.g. "r2:gafferbot-backups"),
# each set is also copied there and the remote is pruned to the same sets.
set -euo pipefail

STACK_ID="${STACK_ID:-xue3q5tb1udz4bvq6oxbg1pv}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db-$STACK_ID}"
STACK_DIR="${STACK_DIR:-/data/coolify/services/$STACK_ID}"
REPO_DIR="${REPO_DIR:-/opt/spotbot}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/spotbot}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
exec 9>/run/spotbot-backup.lock
flock -n 9 || { echo "another backup is running"; exit 0; }

notify() {
  [ -n "$ALERT_WEBHOOK_URL" ] || return 0
  local body
  body=$(node -e 'console.log(JSON.stringify({content: process.argv[1].slice(0, 1900)}))' "$1")
  curl -fsS -m 10 -H 'Content-Type: application/json' -d "$body" "$ALERT_WEBHOOK_URL" >/dev/null || true
}
trap 'notify ":red_circle: GafferBot backup failed on $(hostname) (line $LINENO). Check: journalctl -u spotbot-backup.service"' ERR

umask 077
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

# Postgres: custom-format dump (compressed, restorable table by table) + roles.
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres -Fc -Z 6 > "$DEST/postgres.dump"
docker exec "$DB_CONTAINER" pg_dumpall -U postgres --roles-only > "$DEST/roles.sql"
# A dump that can't list its own contents is useless; fail loudly now rather than at restore time.
docker exec -i "$DB_CONTAINER" pg_restore --list < "$DEST/postgres.dump" > /dev/null

# Storage objects.
tar -C "$STACK_DIR/volumes" -czf "$DEST/storage.tar.gz" storage

# Config and secrets (never committed anywhere; this folder is root-only).
CONFIG_FILES=()
for f in "$REPO_DIR/.env" "$REPO_DIR/public/spotbot/.env" "$STACK_DIR/.env" "$STACK_DIR/docker-compose.yml" \
         /etc/spotbot-deploy.env /etc/spotbot-ops.env; do
  [ -f "$f" ] && CONFIG_FILES+=("${f#/}")
done
tar -C / -czf "$DEST/config.tar.gz" "${CONFIG_FILES[@]}"

(cd "$DEST" && sha256sum ./* > SHA256SUMS)
echo "backup $STAMP: $(du -sh "$DEST" | cut -f1)"

# Retention: newest KEEP_DAILY sets, plus the newest Sunday set of each of the last KEEP_WEEKLY weeks.
keep_list() {
  ls -1 "$1" | grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort -r > /tmp/spotbot-backup-sets.$$
  head -n "$KEEP_DAILY" /tmp/spotbot-backup-sets.$$
  while read -r s; do
    [ "$(date -u -d "${s:0:8}" +%u)" = 7 ] && echo "$s"
  done < /tmp/spotbot-backup-sets.$$ | awk '!seen[substr($0,1,8)]++' | head -n "$KEEP_WEEKLY"
  rm -f /tmp/spotbot-backup-sets.$$
}
KEEP=$(keep_list "$BACKUP_DIR" | sort -u)
for s in $(ls -1 "$BACKUP_DIR" | grep -E '^[0-9]{8}T[0-9]{6}Z$'); do
  grep -qx "$s" <<<"$KEEP" || rm -rf "${BACKUP_DIR:?}/$s"
done

if [ -n "$RCLONE_REMOTE" ]; then
  rclone copy "$DEST" "$RCLONE_REMOTE/$STAMP" --quiet
  for s in $(rclone lsf --dirs-only "$RCLONE_REMOTE" | tr -d / | grep -E '^[0-9]{8}T[0-9]{6}Z$'); do
    grep -qx "$s" <<<"$KEEP" || rclone purge "$RCLONE_REMOTE/$s" --quiet
  done
  echo "copied to $RCLONE_REMOTE/$STAMP"
fi
