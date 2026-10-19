#!/usr/bin/env bash
# One-time setup on the Hetzner server (run as root) for backups and health alerts:
#   sudo bash /opt/spotbot/scripts/hetzner/install-ops.sh
# - spotbot-backup.timer: backup.sh nightly at 03:30 UTC (catches up after downtime)
# - spotbot-health.timer: healthcheck.sh every 2 minutes
# - /etc/spotbot-ops.env (root-only) for ALERT_WEBHOOK_URL, RCLONE_REMOTE and overrides
# - pm2 resurrects the bot at boot (pm2-root.service) and the current process list is saved
# The scripts are copied to /usr/local/lib/spotbot-ops (root-owned) so the repo user can't change
# what root runs; re-run this after pulling changes to them. Re-running is safe.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

SRC="$(cd "$(dirname "$0")" && pwd)"
LIB=/usr/local/lib/spotbot-ops
REPO_USER="${REPO_USER:-claude}"
SYSTEMCTL_BIN=$(command -v systemctl)
NODE_DIR=$(dirname "$(command -v node)")

install -d -m 755 "$LIB"
install -m 755 "$SRC/backup.sh" "$SRC/healthcheck.sh" "$SRC/restore-test.sh" "$LIB/"
install -d -m 700 /var/backups/spotbot
command -v rclone >/dev/null || { apt-get update -qq && apt-get install -y -qq rclone; }

if [ ! -f /etc/spotbot-ops.env ]; then
  cat > /etc/spotbot-ops.env <<'ENV'
# Discord webhook for backup failures and health alerts (Server Settings -> Integrations -> Webhooks)
ALERT_WEBHOOK_URL=
# Off-site copy, e.g. r2:gafferbot-backups or storagebox:spotbot (configure with `rclone config` as root)
RCLONE_REMOTE=
ENV
fi
chmod 600 /etc/spotbot-ops.env

PATH_LINE="Environment=PATH=$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

cat > /etc/systemd/system/spotbot-backup.service <<UNIT
[Unit]
Description=Back up GafferBot database, storage and config
After=docker.service

[Service]
Type=oneshot
Nice=10
IOSchedulingClass=idle
$PATH_LINE
Environment=HOME=/root
EnvironmentFile=-/etc/spotbot-ops.env
ExecStart=/usr/bin/env bash $LIB/backup.sh
UNIT

cat > /etc/systemd/system/spotbot-backup.timer <<'UNIT'
[Unit]
Description=Nightly GafferBot backup

[Timer]
OnCalendar=*-*-* 03:30:00 UTC
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
UNIT

cat > /etc/systemd/system/spotbot-health.service <<UNIT
[Unit]
Description=GafferBot health checks

[Service]
Type=oneshot
$PATH_LINE
Environment=HOME=/root PM2_HOME=/root/.pm2
EnvironmentFile=-/etc/spotbot-ops.env
ExecStart=/usr/bin/env bash $LIB/healthcheck.sh
UNIT

cat > /etc/systemd/system/spotbot-health.timer <<'UNIT'
[Unit]
Description=Run GafferBot health checks every 2 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
UNIT

# Let the repo user start a backup and read these logs, nothing else.
cat > /etc/sudoers.d/spotbot-ops <<SUDO
$REPO_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN start spotbot-backup.service, /usr/bin/journalctl -u spotbot-backup.service -n 100 --no-pager, /usr/bin/journalctl -u spotbot-health.service -n 100 --no-pager
SUDO
chmod 440 /etc/sudoers.d/spotbot-ops
visudo -cf /etc/sudoers.d/spotbot-ops >/dev/null

# Bot logs are rotated (20 MB per file, 10 kept, compressed) so they can't fill the disk.
if command -v pm2 >/dev/null; then
  if ! PM2_HOME=/root/.pm2 pm2 jlist 2>/dev/null | grep -q '"name":"pm2-logrotate"'; then
    PM2_HOME=/root/.pm2 pm2 install pm2-logrotate >/dev/null
  fi
  PM2_HOME=/root/.pm2 pm2 set pm2-logrotate:max_size 20M >/dev/null
  PM2_HOME=/root/.pm2 pm2 set pm2-logrotate:retain 10 >/dev/null
  PM2_HOME=/root/.pm2 pm2 set pm2-logrotate:compress true >/dev/null
fi

# Bot comes back after a reboot: pm2-root.service resurrects the saved process list.
if command -v pm2 >/dev/null; then
  PM2_HOME=/root/.pm2 pm2 save >/dev/null
  systemctl is-enabled pm2-root.service >/dev/null 2>&1 || PM2_HOME=/root/.pm2 pm2 startup systemd -u root --hp /root >/dev/null
fi

systemctl daemon-reload
systemctl enable --now spotbot-backup.timer spotbot-health.timer
echo "installed. Run a first backup now with: systemctl start spotbot-backup.service"
echo "Then prove it restores: bash $LIB/restore-test.sh"
echo "Add ALERT_WEBHOOK_URL (and RCLONE_REMOTE for off-site copies) in /etc/spotbot-ops.env."
