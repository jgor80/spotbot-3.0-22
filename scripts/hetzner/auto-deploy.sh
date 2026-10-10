#!/usr/bin/env bash
# Pulls main onto the Hetzner server and deploys whatever changed:
#   new supabase/migrations/*.sql  -> applied in order, each in one transaction, recorded in ops.applied_migrations
#   bot dependencies changed       -> npm ci in public/spotbot
#   bot or function bundles changed -> pm2 restart (functions run in-process from public/spotbot/local-functions)
# Runs as root from spotbot-deploy.timer (see install-auto-deploy.sh). Safe to run by hand: does nothing when
# the server already matches origin/main. Stops at the first failing migration and leaves the bot running.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/spotbot}"
REPO_USER="${REPO_USER:-claude}"
BRANCH="${BRANCH:-main}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db-xue3q5tb1udz4bvq6oxbg1pv}"
PM2_APP="${PM2_APP:-spotbot}"
# Optional Discord webhook for deploy results; set in /etc/spotbot-deploy.env
DEPLOY_WEBHOOK_URL="${DEPLOY_WEBHOOK_URL:-}"
# Last commit that deployed cleanly; changes are measured from here so a failed run is retried in full.
STATE_FILE="${STATE_FILE:-/var/lib/spotbot-deploy/last-deployed}"

exec 9>/run/spotbot-deploy.lock
flock -n 9 || { echo "another deploy is running"; exit 0; }

REPO_HOME=$(getent passwd "$REPO_USER" | cut -d: -f6)
as_repo() { runuser -u "$REPO_USER" -- env HOME="$REPO_HOME" "$@"; }
git_repo() { as_repo git -C "$REPO_DIR" "$@"; }
psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

fail() {
  mkdir -p "$(dirname "$STATE_FILE")" && echo "$NEW" > "$STATE_FILE.failed"
  notify "$1"
  exit 1
}

notify() {
  echo "$1"
  [ -n "$DEPLOY_WEBHOOK_URL" ] || return 0
  local body
  body=$(node -e 'console.log(JSON.stringify({content: process.argv[1].slice(0, 1900)}))' "$1")
  curl -fsS -m 10 -H 'Content-Type: application/json' -d "$body" "$DEPLOY_WEBHOOK_URL" >/dev/null || true
}

git_repo fetch -q origin "$BRANCH"
OLD=$(cat "$STATE_FILE" 2>/dev/null || git_repo rev-parse HEAD)
NEW=$(git_repo rev-parse "origin/$BRANCH")
if [ "${1:-}" != "--force" ]; then
  [ "$OLD" = "$NEW" ] && exit 0
  # A commit that already failed is not retried every tick; the next push (or --force) retries it.
  [ "$NEW" = "$(cat "$STATE_FILE.failed" 2>/dev/null)" ] && exit 0
fi

CHANGED=$(git_repo diff --name-only "$OLD" "$NEW")
changed() { grep -qE "$1" <<<"$CHANGED"; }

# The server is a mirror of main: tracked files are reset, untracked ones (.env, backups) are kept.
git_repo reset -q --hard "$NEW"
SUMMARY="Deployed $(git_repo log -1 --format='%h %s' "$NEW")"

# --- Migrations -----------------------------------------------------------------------------------
psql_db -c "create schema if not exists ops; create table if not exists ops.applied_migrations (
  filename text primary key, applied_at timestamptz not null default now());" >/dev/null
APPLIED=$(psql_db -Atc "select filename from ops.applied_migrations")
RAN=()
for f in $(ls "$REPO_DIR/supabase/migrations" | grep -E '\.sql$' | sort); do
  grep -qxF "$f" <<<"$APPLIED" && continue
  echo "applying $f"
  if ! { cat "$REPO_DIR/supabase/migrations/$f"; printf "\ninsert into ops.applied_migrations(filename) values ('%s');\n" "$f"; } \
      | psql_db --single-transaction -f - ; then
    fail "⚠️ GafferBot deploy stopped: migration $f failed (rolled back). Code is at ${NEW:0:7}; bot was not restarted. Ran before it: ${RAN[*]:-none}"
  fi
  RAN+=("$f")
done
[ ${#RAN[@]} -gt 0 ] && SUMMARY+=$'\n'"Migrations: ${RAN[*]}"

# --- Bot ------------------------------------------------------------------------------------------
if changed '^public/spotbot/(package\.json|package-lock\.json)$' || [ "${1:-}" = "--force" ]; then
  (cd "$REPO_DIR/public/spotbot" && as_repo npm ci --omit=dev --no-audit --no-fund) \
    || fail "⚠️ GafferBot deploy: npm ci failed at ${NEW:0:7}; bot not restarted."
fi

if changed '^public/spotbot/' || [ "${1:-}" = "--force" ]; then
  pm2 restart "$PM2_APP" --update-env >/dev/null
  sleep 20
  STATUS=$(pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const p = JSON.parse(s.slice(s.indexOf("["))).find(x => x.name === process.argv[1]);
      console.log(p ? p.pm2_env.status : "missing"); });' "$PM2_APP" || echo unknown)
  if [ "$STATUS" != "online" ]; then
    fail "⚠️ GafferBot deploy ${NEW:0:7}: bot is '$STATUS' after restart. Check: pm2 logs $PM2_APP"
  fi
  SUMMARY+=$'\n'"Bot restarted"
fi

if changed '^supabase/functions/' && ! changed '^public/spotbot/local-functions/'; then
  SUMMARY+=$'\n'"Function sources changed; the rebuilt bundles deploy on the next run once CI commits them."
fi

mkdir -p "$(dirname "$STATE_FILE")" && echo "$NEW" > "$STATE_FILE"
notify "✅ $SUMMARY"
