#!/usr/bin/env bash
# One-time setup on the Hetzner server (run as root): installs spotbot-deploy.timer, which runs
# auto-deploy.sh every 2 minutes, and records the migrations the database already has.
#   sudo bash /opt/spotbot/scripts/hetzner/install-auto-deploy.sh
# Re-running is safe. Migrations before BASELINE_BEFORE are marked applied without running them
# (the database was restored with them); later ones run on the next deploy.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/spotbot}"
REPO_USER="${REPO_USER:-claude}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db-xue3q5tb1udz4bvq6oxbg1pv}"
BASELINE_BEFORE="${BASELINE_BEFORE:-20261010080000}"
PM2_BIN=$(command -v pm2)
SYSTEMCTL_BIN=$(command -v systemctl)
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# --- Baseline the migration tracker ---------------------------------------------------------------
psql_db -c "create schema if not exists ops; create table if not exists ops.applied_migrations (
  filename text primary key, applied_at timestamptz not null default now());
  revoke all on schema ops from public, anon, authenticated;" >/dev/null
# Carry over anything an earlier deploy.sh recorded in public._applied_migrations
psql_db -c "do \$\$ begin if to_regclass('public._applied_migrations') is not null then
  execute 'insert into ops.applied_migrations(filename) select filename from public._applied_migrations on conflict do nothing';
end if; end \$\$;" >/dev/null 2>&1 || true
COUNT=0
for f in $(ls "$REPO_DIR/supabase/migrations" | grep -E '\.sql$' | sort); do
  [[ "$f" < "$BASELINE_BEFORE" ]] || continue
  psql_db -c "insert into ops.applied_migrations(filename) values ('$f') on conflict do nothing" >/dev/null
  COUNT=$((COUNT + 1))
done
echo "baseline: $COUNT migrations before $BASELINE_BEFORE marked as applied"

# Deploys measure changes from the last deployed commit; start from what the server runs now.
mkdir -p /var/lib/spotbot-deploy
[ -s /var/lib/spotbot-deploy/last-deployed ] || git -C "$REPO_DIR" -c safe.directory="$REPO_DIR" rev-parse HEAD > /var/lib/spotbot-deploy/last-deployed

# --- systemd service + timer ----------------------------------------------------------------------
touch /etc/spotbot-deploy.env && chmod 600 /etc/spotbot-deploy.env
cat > /etc/systemd/system/spotbot-deploy.service <<EOF
[Unit]
Description=Deploy GafferBot from GitHub main
After=network-online.target docker.service

[Service]
Type=oneshot
Environment=HOME=/root PM2_HOME=/root/.pm2 REPO_DIR=$REPO_DIR REPO_USER=$REPO_USER DB_CONTAINER=$DB_CONTAINER
EnvironmentFile=-/etc/spotbot-deploy.env
ExecStart=/usr/bin/env bash $REPO_DIR/scripts/hetzner/auto-deploy.sh
EOF

cat > /etc/systemd/system/spotbot-restart.service <<EOF
[Unit]
Description=Restart the GafferBot pm2 process

[Service]
Type=oneshot
Environment=HOME=/root PM2_HOME=/root/.pm2
ExecStart=$PM2_BIN restart spotbot
EOF

cat > /etc/systemd/system/spotbot-deploy.timer <<'EOF'
[Unit]
Description=Check GitHub main for GafferBot changes every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
EOF

# Let the claude user (and Claude sessions running as it) trigger a deploy or restart and read
# bot logs, without general root access.
cat > /etc/sudoers.d/spotbot-claude <<EOF
$REPO_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN start spotbot-deploy.service, $SYSTEMCTL_BIN start spotbot-restart.service, /usr/bin/journalctl -u spotbot-deploy.service -n 200 --no-pager, /usr/bin/tail -n 300 /root/.pm2/logs/spotbot-out.log, /usr/bin/tail -n 300 /root/.pm2/logs/spotbot-error.log
EOF
chmod 440 /etc/sudoers.d/spotbot-claude
visudo -cf /etc/sudoers.d/spotbot-claude >/dev/null

systemctl daemon-reload
systemctl enable --now spotbot-deploy.timer
echo "installed. Watch it with: journalctl -u spotbot-deploy.service -f"
echo "Optional: put DEPLOY_WEBHOOK_URL=<discord webhook> in /etc/spotbot-deploy.env for deploy messages."
