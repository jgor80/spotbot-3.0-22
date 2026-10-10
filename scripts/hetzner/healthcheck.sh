#!/usr/bin/env bash
# Health checks for the self-hosted stack, run every 2 minutes as root by spotbot-health.timer.
# A check alerts once it has failed twice in a row, then stays quiet until it recovers (one
# recovery message). Alerts go to ALERT_WEBHOOK_URL (a Discord webhook) from /etc/spotbot-ops.env.
set -uo pipefail

STACK_ID="${STACK_ID:-xue3q5tb1udz4bvq6oxbg1pv}"
SITE_URL="${SITE_URL:-https://gafferbot.app}"
KONG_URL="${KONG_URL:-https://supabasekong-$STACK_ID.65.108.243.142.sslip.io}"
FUNCTIONS_HEALTH_URL="${FUNCTIONS_HEALTH_URL:-http://127.0.0.1:8880/health}"
MIN_AVAILABLE_MB="${MIN_AVAILABLE_MB:-150}"
MAX_DISK_PCT="${MAX_DISK_PCT:-85}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
STATE_DIR="${STATE_DIR:-/var/lib/spotbot-health}"
mkdir -p "$STATE_DIR"

notify() {
  echo "$1"
  [ -n "$ALERT_WEBHOOK_URL" ] || return 0
  local body
  body=$(node -e 'console.log(JSON.stringify({content: process.argv[1].slice(0, 1900)}))' "$1")
  curl -fsS -m 10 -H 'Content-Type: application/json' -d "$body" "$ALERT_WEBHOOK_URL" >/dev/null || true
}

# http_ok URL CODES...: true when URL answers with one of CODES within 15s.
http_ok() {
  local url=$1; shift
  local code
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$url")
  for c in "$@"; do [ "$code" = "$c" ] && return 0; done
  DETAIL="HTTP $code"; return 1
}

record() { # name ok|fail detail
  local name=$1 result=$2 detail=${3:-} f="$STATE_DIR/$1" prev
  prev=$(cat "$f" 2>/dev/null || echo 0)
  if [ "$result" = ok ]; then
    [ "$prev" -ge 2 ] && notify ":green_circle: $name recovered on $(hostname)"
    echo 0 > "$f"
  else
    echo $((prev + 1)) > "$f"
    [ "$prev" = 1 ] && notify ":red_circle: $name is failing on $(hostname): $detail"
  fi
  return 0
}

check() { # name command...
  local name=$1; shift
  DETAIL=""
  if "$@"; then record "$name" ok; else record "$name" fail "$DETAIL"; fi
}

bot_online() {
  local status
  status=$(PM2_HOME=/root/.pm2 pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      try { const p = JSON.parse(s).find(x => x.name === "spotbot"); console.log(p ? p.pm2_env.status : "missing"); }
      catch { console.log("unknown"); }
    })')
  DETAIL="pm2 status $status"; [ "$status" = online ]
}
memory_ok() {
  local avail; avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  DETAIL="only ${avail} MB RAM available"; [ "$avail" -ge "$MIN_AVAILABLE_MB" ]
}
disk_ok() {
  local pct; pct=$(df --output=pcent / | tail -n 1 | tr -dc 0-9)
  DETAIL="disk ${pct}% full"; [ "$pct" -le "$MAX_DISK_PCT" ]
}

check "Website ($SITE_URL)" http_ok "$SITE_URL" 200
check "Bot functions (:8880)" http_ok "$FUNCTIONS_HEALTH_URL" 200
# Kong answers 401 without an apikey; anything but a 5xx or no answer means it is up.
check "Supabase API (Kong)" http_ok "$KONG_URL/auth/v1/health" 200 401
check "Bot process (pm2)" bot_online
check "Server memory" memory_ok
check "Server disk" disk_ok
