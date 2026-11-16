#!/usr/bin/env bash
# Pulls main onto the Hetzner server and deploys whatever changed:
#   new supabase/migrations/*.sql   -> applied in order, each in one transaction, recorded in ops.applied_migrations
#   scripts/hetzner/ changed        -> the server's own scripts (this one, health checks, backups) reinstall themselves
#   bot dependencies changed        -> npm ci in public/spotbot
#   bot or function bundles changed -> pm2 restart, then waits until the bot is connected to Discord;
#                                      if it never connects, the bot is put back on the last good commit
# Runs as root from spotbot-deploy.timer (see install-auto-deploy.sh). Safe to run by hand: does nothing when
# the server already matches origin/main. Stops at the first failing migration and leaves the bot running.
# Every run writes STATUS_FILE, which the bot serves on /health/deploy and gafferbot.app on /api/deploy-status
# for the GitHub "Deploy check" workflow.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/spotbot}"
REPO_USER="${REPO_USER:-claude}"
BRANCH="${BRANCH:-main}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db-xue3q5tb1udz4bvq6oxbg1pv}"
PM2_APP="${PM2_APP:-spotbot}"
DISCORD_HEALTH_URL="${DISCORD_HEALTH_URL:-http://127.0.0.1:8880/health/discord}"
# Seconds to wait for the restarted bot to connect to Discord before rolling it back
DISCORD_WAIT="${DISCORD_WAIT:-180}"
# Optional Discord webhook for deploy results; set in /etc/spotbot-deploy.env. Falls back to the health
# alerts webhook (ALERT_WEBHOOK_URL in /etc/spotbot-ops.env) so failures are never silent.
DEPLOY_WEBHOOK_URL="${DEPLOY_WEBHOOK_URL:-}"
OPS_ENV_FILE="${OPS_ENV_FILE:-/etc/spotbot-ops.env}"
STATE_DIR="${STATE_DIR:-/var/lib/spotbot-deploy}"
# Last commit that deployed cleanly; changes are measured from here so a failed run is retried in full.
STATE_FILE="${STATE_FILE:-$STATE_DIR/last-deployed}"
STATUS_FILE="${STATUS_FILE:-$STATE_DIR/status.json}"
# Tree id of scripts/hetzner the server's installed scripts were built from
OPS_TREE_FILE="$STATE_DIR/server-scripts-tree"
# A failed commit is retried once, this many seconds later (a database that was restarting, a network blip)
RETRY_AFTER="${RETRY_AFTER:-600}"

exec 9>/run/spotbot-deploy.lock
flock -n 9 || { echo "another deploy is running"; exit 0; }
mkdir -p "$STATE_DIR"

if [ -z "$DEPLOY_WEBHOOK_URL" ] && [ -r "$OPS_ENV_FILE" ]; then
  DEPLOY_WEBHOOK_URL=$(sed -n 's/^ALERT_WEBHOOK_URL=//p' "$OPS_ENV_FILE" | tail -n 1 | tr -d "\"'\r ")
fi

REPO_HOME=$(getent passwd "$REPO_USER" | cut -d: -f6)
as_repo() { runuser -u "$REPO_USER" -- env HOME="$REPO_HOME" "$@"; }
git_repo() { as_repo git -C "$REPO_DIR" "$@"; }
psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# notify MESSAGE [silent]: "silent" posts without a push notification (Discord flag 4096), so the
# routine "deployed, bot restarted" note on every merge doesn't ping; failures still notify.
notify() {
  echo "$1"
  [ -n "$DEPLOY_WEBHOOK_URL" ] || return 0
  local body
  body=$(node -e 'console.log(JSON.stringify({content: process.argv[1].slice(0, 1900), allowed_mentions: {parse: []}, ...(process.argv[2] === "silent" ? {flags: 4096} : {})}))' "$1" "${2:-}")
  curl -fsS -m 10 -H 'Content-Type: application/json' -d "$body" "$DEPLOY_WEBHOOK_URL" >/dev/null || true
}

# write_status STATE MESSAGE: what the last run did, for /health/deploy. STATE is ok, failed or rolled_back.
write_status() {
  node -e '
    const [file, state, commit, running, message, ...migrations] = process.argv.slice(1);
    const body = { state, commit, running_commit: running, message, migrations, at: new Date().toISOString() };
    if (state !== "ok") body.failed_commit = commit;
    require("fs").writeFileSync(file + ".tmp", JSON.stringify(body));
    require("fs").renameSync(file + ".tmp", file);' \
    "$STATUS_FILE" "$1" "$NEW" "$RUNNING" "$2" "${RAN[@]}" || true
  chmod 644 "$STATUS_FILE" 2>/dev/null || true
}

# fail MESSAGE [final]: records the failure and stops. "final" means don't retry this commit on its own.
fail() {
  local tries=1
  [ "${2:-}" = final ] && tries=2
  [ -f "$STATE_FILE.failed" ] && read -r fcommit _ ftries < "$STATE_FILE.failed" || true
  [ "${fcommit:-}" = "$NEW" ] && tries=$(( ${ftries:-1} + 1 ))
  echo "$NEW $(date +%s) $tries" > "$STATE_FILE.failed"
  write_status "${STATUS_STATE:-failed}" "$1"
  [ "$tries" -lt 2 ] && set -- "$1 It will be retried once in $((RETRY_AFTER / 60)) minutes." || set -- "$1"
  notify "$1"
  exit 1
}

# update_server_scripts COMMIT: health checks, backups and this deploy script run as root from root-owned
# copies. They used to need `sudo bash install-ops.sh` by hand after every change; now they reinstall from
# COMMIT whenever its scripts/hetzner/ differs from what was installed. Taken from git (not the working
# tree), so what root runs is what was merged. A failure alerts once per version and doesn't hold up the bot.
update_server_scripts() {
  local tree src
  tree=$(git_repo rev-parse "$1:scripts/hetzner") || return 0
  [ "$tree" = "$(cat "$OPS_TREE_FILE" 2>/dev/null)" ] && return 0
  [ "$tree" = "$(cat "$OPS_TREE_FILE.failed" 2>/dev/null)" ] && return 0
  src=$(mktemp -d /run/spotbot-scripts.XXXXXX)
  if git_repo archive "$1" scripts/hetzner | tar -x -C "$src" \
      && REPO_DIR="$REPO_DIR" REPO_USER="$REPO_USER" bash "$src/scripts/hetzner/install-ops.sh" >/dev/null \
      && REPO_DIR="$REPO_DIR" REPO_USER="$REPO_USER" DB_CONTAINER="$DB_CONTAINER" bash "$src/scripts/hetzner/install-auto-deploy.sh" >/dev/null; then
    echo "$tree" > "$OPS_TREE_FILE"
    rm -f "$OPS_TREE_FILE.failed"
    SUMMARY+=$'\n'"Server scripts (health checks, backups, deploys) updated"
  else
    echo "$tree" > "$OPS_TREE_FILE.failed"
    notify "⚠️ GafferBot deploy ${1:0:7}: updating the server scripts (health checks, backups) failed; deploys carry on with the old ones. Check: journalctl -u spotbot-deploy.service -n 100"
  fi
  rm -rf "$src"
}

git_repo fetch -q origin "$BRANCH"
OLD=$(cat "$STATE_FILE" 2>/dev/null || git_repo rev-parse HEAD)
NEW=$(git_repo rev-parse "origin/$BRANCH")
RUNNING=$OLD
RAN=()
SUMMARY=""
if [ "${1:-}" != "--force" ]; then
  # Nothing new to deploy, but the server scripts may still be behind the running commit (first run after
  # this was added, or an install that failed and was fixed by hand).
  if [ "$OLD" = "$NEW" ]; then
    update_server_scripts "$NEW"
    [ -n "$SUMMARY" ] && notify "✅ ${SUMMARY#$'\n'} at ${NEW:0:7}" silent
    # First run of this version: report the commit that is already live so the Deploy check can see it
    [ -f "$STATUS_FILE" ] || write_status ok "Up to date at $(git_repo log -1 --format='%h %s' "$NEW")"
    exit 0
  fi
  # A commit that failed is retried once after RETRY_AFTER; after that only the next push (or --force) retries it.
  if [ -f "$STATE_FILE.failed" ] && read -r fcommit ftime ftries < "$STATE_FILE.failed" && [ "$fcommit" = "$NEW" ]; then
    [ "${ftries:-1}" -ge 2 ] && exit 0
    [ $(( $(date +%s) - ${ftime:-0} )) -lt "$RETRY_AFTER" ] && exit 0
  fi
fi

CHANGED=$(git_repo diff --name-only "$OLD" "$NEW")
changed() { grep -qE "$1" <<<"$CHANGED"; }

# The server is a mirror of main: tracked files are reset, untracked ones (.env, backups) are kept.
git_repo reset -q --hard "$NEW"
SUMMARY="Deployed $(git_repo log -1 --format='%h %s' "$NEW")"
update_server_scripts "$NEW"

# --- Migrations -----------------------------------------------------------------------------------
psql_db -c "create schema if not exists ops; create table if not exists ops.applied_migrations (
  filename text primary key, applied_at timestamptz not null default now());" >/dev/null
APPLIED=$(psql_db -Atc "select filename from ops.applied_migrations")
for f in $(ls "$REPO_DIR/supabase/migrations" | grep -E '\.sql$' | sort); do
  grep -qxF "$f" <<<"$APPLIED" && continue
  echo "applying $f"
  if ! { cat "$REPO_DIR/supabase/migrations/$f"; printf "\ninsert into ops.applied_migrations(filename) values ('%s');\n" "$f"; } \
      | psql_db --single-transaction -f - ; then
    fail "⚠️ GafferBot deploy stopped: migration $f failed (rolled back). Code is at ${NEW:0:7}; bot was not restarted. Ran before it: ${RAN[*]:-none}."
  fi
  RAN+=("$f")
done
[ ${#RAN[@]} -gt 0 ] && SUMMARY+=$'\n'"Migrations: ${RAN[*]}"

# --- Bot ------------------------------------------------------------------------------------------
# bot_healthy: pm2 says online and the bot itself says it is connected to Discord. pm2 alone isn't
# enough: a module-level error once left the process up (website fine) with Discord never logged in.
bot_healthy() {
  sleep 10
  local status
  status=$(pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      try { const p = JSON.parse(s.slice(s.indexOf("["))).find(x => x.name === process.argv[1]);
        console.log(p ? p.pm2_env.status : "missing"); } catch { console.log("unknown"); } });' "$PM2_APP" || echo unknown)
  [ "$status" = online ] || { WHY="pm2 status is '$status'"; return 1; }
  local waited=0
  until curl -fsS -m 5 -o /dev/null "$DISCORD_HEALTH_URL"; do
    waited=$((waited + 5))
    [ "$waited" -ge "$DISCORD_WAIT" ] && { WHY="not connected to Discord after ${DISCORD_WAIT}s"; return 1; }
    sleep 5
  done
}

bot_deps() { (cd "$REPO_DIR/public/spotbot" && as_repo npm ci --omit=dev --no-audit --no-fund); }

if changed '^public/spotbot/(package\.json|package-lock\.json)$' || [ "${1:-}" = "--force" ]; then
  bot_deps || fail "⚠️ GafferBot deploy: npm ci failed at ${NEW:0:7}; bot not restarted."
fi

if changed '^public/spotbot/' || [ "${1:-}" = "--force" ]; then
  # No --update-env: the bot's tokens live in pm2's saved env, which the timer's sparse env would replace.
  pm2 restart "$PM2_APP" >/dev/null
  if ! bot_healthy; then
    BROKE="$WHY"
    if [ "$OLD" != "$NEW" ]; then
      # Put the bot back on the last good commit. Migrations already applied stay (they are additive).
      git_repo reset -q --hard "$OLD"
      if changed '^public/spotbot/(package\.json|package-lock\.json)$'; then bot_deps || true; fi
      pm2 restart "$PM2_APP" >/dev/null
      if bot_healthy; then
        RUNNING=$OLD STATUS_STATE=rolled_back fail "🔴 GafferBot deploy ${NEW:0:7} broke the bot ($BROKE), so it was put back on ${OLD:0:7} and is running again. Fix main and merge again. Check: pm2 logs $PM2_APP" final
      fi
      RUNNING=$OLD fail "🔴 GafferBot bot is down: ${NEW:0:7} failed ($BROKE) and going back to ${OLD:0:7} failed too ($WHY). Discord itself may be down. Check: pm2 logs $PM2_APP" final
    fi
    fail "🔴 GafferBot deploy ${NEW:0:7}: bot unhealthy after restart ($BROKE). Check: pm2 logs $PM2_APP" final
  fi
  SUMMARY+=$'\n'"Bot restarted and connected to Discord"
fi
RUNNING=$NEW

if changed '^supabase/functions/' && ! changed '^public/spotbot/local-functions/'; then
  SUMMARY+=$'\n'"Function sources changed; the rebuilt bundles deploy on the next run once CI commits them."
fi

echo "$NEW" > "$STATE_FILE"
rm -f "$STATE_FILE.failed"
write_status ok "$SUMMARY"
notify "✅ $SUMMARY" silent
