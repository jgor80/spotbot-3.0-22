#!/usr/bin/env bash
# Proves the newest backup restores: loads postgres.dump into a scratch database ("restore_check")
# in the same Postgres container, compares row counts of the key tables with the live database,
# checks the storage and config archives open, then drops the scratch database. Touches nothing live.
#   sudo bash /opt/spotbot/scripts/hetzner/restore-test.sh [backup-set-folder]
set -euo pipefail

STACK_ID="${STACK_ID:-xue3q5tb1udz4bvq6oxbg1pv}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db-$STACK_ID}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/spotbot}"
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

SET="${1:-$BACKUP_DIR/$(ls -1 "$BACKUP_DIR" | grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort | tail -n 1)}"
echo "testing $SET"
(cd "$SET" && sha256sum -c --quiet SHA256SUMS) && echo "checksums ok"

psql_c() { docker exec -i "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
psql_c -d postgres -c 'drop database if exists restore_check' -c 'create database restore_check'
trap 'psql_c -d postgres -c "drop database if exists restore_check" >/dev/null' EXIT

# Supabase-managed extensions and grants can log harmless errors in a scratch database; the row
# counts below are what decides pass or fail.
docker exec -i "$DB_CONTAINER" pg_restore -U postgres -d restore_check --no-owner \
  < "$SET/postgres.dump" 2> /tmp/restore-check.log || true
echo "pg_restore finished ($(grep -c 'error' /tmp/restore-check.log || true) error lines in /tmp/restore-check.log)"

FAIL=0
for t in auth.users public.profiles public.club_matches public.team_rosters public.lineups storage.objects; do
  live=$(psql_c -d postgres -c "select count(*) from $t" 2>/dev/null || echo "-")
  restored=$(psql_c -d restore_check -c "select count(*) from $t" 2>/dev/null || echo "-")
  [ "$live" = "-" ] && continue
  printf '%-22s live %-8s restored %s\n' "$t" "$live" "$restored"
  # Writes since the backup can only add rows; fewer than ~90% of live means a broken restore.
  if [ "$restored" = "-" ] || [ $((restored * 10)) -lt $((live * 9)) ]; then FAIL=1; fi
done

tar -tzf "$SET/storage.tar.gz" > /dev/null && echo "storage archive ok ($(tar -tzf "$SET/storage.tar.gz" | grep -vc '/$') files)"
tar -tzf "$SET/config.tar.gz" && echo "config archive ok"
[ "$FAIL" = 0 ] && echo "RESTORE TEST PASSED" || { echo "RESTORE TEST FAILED"; exit 1; }
