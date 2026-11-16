#!/usr/bin/env bash
# Waits until the Hetzner server has deployed COMMIT (or a later commit of main) and the bot is connected
# to Discord, reading gafferbot.app/api/deploy-status (written by scripts/hetzner/auto-deploy.sh).
# Fails with the server's own message when the deploy failed, was rolled back, or never happened.
#   bash scripts/deploy-check.sh <commit>
set -uo pipefail
SHA=${1:?commit}
STATUS_URL=${STATUS_URL:-https://gafferbot.app/api/deploy-status}
TIMEOUT=${TIMEOUT:-900}
INTERVAL=${INTERVAL:-20}

# covers A B: B is A or a later commit
covers() { [ -n "$2" ] && git cat-file -e "$2^{commit}" 2>/dev/null && git merge-base --is-ancestor "$1" "$2"; }
field() { jq -r "$1 | select(. != null)" <<<"$BODY" 2>/dev/null; }

start=$(date +%s)
last=""
while :; do
  git fetch -q origin main 2>/dev/null || true
  BODY=$(curl -fsS -m 20 "$STATUS_URL" 2>/dev/null || echo '{}')
  state=$(field .deploy.state)
  running=$(field .deploy.running_commit)
  failed=$(field .deploy.failed_commit)
  message=$(field .deploy.message)
  discord=$(field .discord_connected)
  now="state=${state:-none} running=${running:0:7} failed=${failed:0:7} discord=${discord:-unknown}"
  [ "$now" != "$last" ] && echo "$(date -u +%H:%M:%S) $now" && last=$now

  # The bot runs this commit (or a later one): done once it is connected to Discord.
  if covers "$SHA" "$running"; then
    if [ "$discord" = true ]; then
      echo "Deployed: server runs ${running:0:7}, which includes ${SHA:0:7}, and the bot is connected to Discord."
      [ -n "$message" ] && [ "$state" = ok ] && printf '%s\n' "$message"
      exit 0
    fi
  fi
  if [ "$state" = rolled_back ] && covers "$SHA" "$failed"; then
    echo "::error title=Deploy rolled back::$message"
    exit 1
  fi
  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT" ]; then
    if [ "$state" = failed ] && covers "$SHA" "$failed"; then
      echo "::error title=Deploy failed::$message"
    elif [ "$discord" = false ]; then
      echo "::error title=Bot offline::The server runs ${running:0:7} but the bot is not connected to Discord."
    elif [ -z "$state" ]; then
      echo "::error title=No deploy status::gafferbot.app/api/deploy-status has no deploy status. The server's auto-deploy may not be running (or predates this check)."
    else
      echo "::error title=Deploy not seen::After $((TIMEOUT / 60)) minutes the server still runs ${running:0:7}, not ${SHA:0:7} or later. Last message: $message"
    fi
    exit 1
  fi
  sleep "$INTERVAL"
done
