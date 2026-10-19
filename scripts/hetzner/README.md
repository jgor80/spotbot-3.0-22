# Moving to the self-hosted (Hetzner) Supabase

## 1. Web app (Cloudflare)

The Supabase URL and anon key are baked in when Vite builds, so they are set as
**build** variables, not runtime variables. Build variables win over the committed
`.env` (which Lovable keeps pointing at Lovable Cloud for its own preview).

Cloudflare dashboard → Workers & Pages → the gafferbot.app worker → Settings →
Build → **Variables and secrets** → add (for Production, and for previews if wanted):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | public Kong URL, e.g. `https://api.gafferbot.app` (no trailing slash) |
| `VITE_SUPABASE_ANON_KEY` | the Hetzner `ANON_KEY` (public, safe in the browser) |

Then Deployments → retry the latest build (or push to main). The build log prints
`Supabase backend: <url>`; the build fails if the anon key still belongs to the
Lovable project, so a half-switched site can't ship.

Also on the Hetzner backend: set `SITE_URL=https://gafferbot.app` and add
`https://gafferbot.app/**` to `ADDITIONAL_REDIRECT_URLS` in the Supabase `.env`,
and allow `https://gafferbot.app` in CORS if Kong restricts origins.

## 2. Pro photos and card assets

Run on the Hetzner box from a checkout of this repo (Node 18+, no npm install):

```sh
export SUPABASE_URL=https://api.gafferbot.app        # public Kong URL
export SUPABASE_SERVICE_ROLE_KEY=...                 # from the Supabase .env; never commit
node scripts/hetzner/upload-pro-photos.mjs /opt/spotbot/storage-backup/pro-photos --dry-run
node scripts/hetzner/upload-pro-photos.mjs /opt/spotbot/storage-backup/pro-photos
```

It creates the private `pro-photos` bucket if missing, uploads every file with the
same object path (`<guild_id>/<discord_user_id>-<key>.<ext>`, `cards/<user>/...`, `generated/<user>/...`),
then rewrites `pro_photo_assets.image_url` and `pro_photos.image_url` with new
10-year signed links. Old Lovable links can't be reused: they are signed with
Lovable's JWT secret. Re-running is safe (uploads upsert, already-moved rows are skipped).
`player_cards` stores only paths, so cards work once the files are uploaded.

Check nothing else in the database still points at Lovable Cloud (expect 0):

```sh
pg_dump --data-only --schema=public "$DATABASE_URL" | grep -c vynlrqlisrvuejwawaxh
```

## 3. Bot and edge functions

The bot reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from its env, and edge
functions read `SUPABASE_URL` from the runtime, so they only need their env set to
the Hetzner values. Edge function secrets (`BOT_PROXY_SECRET`, `DISCORD_*`,
`OPENAI_API_KEY`, ...) must be copied to the Hetzner functions env.

## 4. Automatic deploys from GitHub

`scripts/hetzner/auto-deploy.sh` keeps `/opt/spotbot` a mirror of `main` (tracked files are reset;
untracked `.env` files and backups are kept). A systemd timer runs it every 2 minutes and, when
`main` has moved:

- applies new `supabase/migrations/*.sql` in filename order, each in one transaction, recorded in
  `ops.applied_migrations`. A failing migration rolls back, stops the deploy and leaves the bot on its
  old code; the next push (or `auto-deploy.sh --force`) retries it.
- runs `npm ci` in `public/spotbot` when its package files changed.
- restarts the pm2 `spotbot` process when anything under `public/spotbot/` changed and checks it is
  back online. Backend functions run inside the bot, so this is also how function changes go live.

Function sources are bundled by the `Rebuild local functions` GitHub Action, which commits
`public/spotbot/local-functions/` whenever `supabase/functions/` changes on `main` (including Lovable's
edits), so the server never builds them itself. The web app deploys through Cloudflare's Git builds.

Install once, as root (after `git pull` brings these files to the server):

```sh
sudo bash /opt/spotbot/scripts/hetzner/install-auto-deploy.sh
```

It marks every migration before `20261010080000` as already applied (override with
`BASELINE_BEFORE=...`), so that one and anything newer run on the first deploy. Deploy results can be
posted to Discord by putting `DEPLOY_WEBHOOK_URL=<webhook>` in `/etc/spotbot-deploy.env`.

Useful commands (the `claude` user may run these with sudo, nothing else):

```sh
sudo systemctl start spotbot-deploy.service      # deploy now
sudo systemctl start spotbot-restart.service     # restart the bot
sudo journalctl -u spotbot-deploy.service -n 200 --no-pager
sudo tail -n 300 /root/.pm2/logs/spotbot-error.log
```

## 5. Backups and health alerts

Install once, as root (re-run after these scripts change; it copies them to the root-owned
`/usr/local/lib/spotbot-ops` so the repo user can't alter what root runs):

```sh
sudo bash /opt/spotbot/scripts/hetzner/install-ops.sh
```

**Backups** (`backup.sh`, nightly 03:30 UTC) write `/var/backups/spotbot/<timestamp>/` (root-only):
`postgres.dump` (pg_dump custom format of the `postgres` database: public, auth, storage schemas),
`roles.sql`, `storage.tar.gz` (the MinIO data folder, every storage object) and `config.tar.gz`
(bot and Supabase `.env` files plus the Supabase `docker-compose.yml`). It keeps 7 nightly sets and
4 Sunday sets. For off-site copies, set up an rclone remote as root (`rclone config`: Cloudflare R2,
Backblaze B2 or a Hetzner Storage Box over SFTP; wrap it in an rclone `crypt` remote since the
config archive holds secrets) and set `RCLONE_REMOTE=<remote>:<path>` in `/etc/spotbot-ops.env`.

Prove a backup restores (loads it into a scratch `restore_check` database, compares row counts with
live, checks the archives, drops the scratch database; nothing live is touched):

```sh
sudo bash /usr/local/lib/spotbot-ops/restore-test.sh
```

Real restore onto this or a fresh Coolify Supabase stack (stop the bot first: `pm2 stop spotbot`):

```sh
SET=/var/backups/spotbot/<timestamp>
DB=supabase-db-xue3q5tb1udz4bvq6oxbg1pv
docker exec -i $DB pg_restore -U postgres -d postgres --clean --if-exists --no-owner < $SET/postgres.dump
# storage: stop the minio container, then
tar -C /data/coolify/services/xue3q5tb1udz4bvq6oxbg1pv/volumes -xzf $SET/storage.tar.gz
# config: inspect first, then extract the files you need
tar -tzf $SET/config.tar.gz && tar -C / -xzf $SET/config.tar.gz opt/spotbot/.env
pm2 restart spotbot
```

On a brand-new stack, keep its own `.env` JWT secret identical to the backed-up one (from
`config.tar.gz`) or every API key and signed storage URL stops working.

**Health checks** (`healthcheck.sh`, every 2 minutes) cover gafferbot.app, the bot's functions
server (`:8880/health`), Supabase Kong, the pm2 `spotbot` process, free RAM (< 150 MB) and disk
(> 85 %). A check alerts after two failures in a row and once more when it recovers. Put a Discord
webhook in `ALERT_WEBHOOK_URL` in `/etc/spotbot-ops.env`. pm2 already restarts the bot when it
crashes; the installer also saves the pm2 process list so `pm2-root.service` brings it back after a
reboot.

**Locking down the functions server.** The Worker reaches the bot's functions server on `:8880`.
Set the same random value (`openssl rand -hex 32`) as `FUNCTIONS_ORIGIN_SECRET` in the bot's
`.env` and as a Worker secret (`wrangler secret put FUNCTIONS_ORIGIN_SECRET`); the server then
refuses anything that didn't come through the Worker. Set a second value as `MCP_LEADER_CHECK_SECRET`
in both places so the AI sign-in's leader check stops sending the service-role key. Set the Worker
secrets first, then the bot's, then restart the bot. To take the port off the internet, run a
Cloudflare Tunnel to `http://127.0.0.1:8880`, set `FUNCTIONS_HOST=127.0.0.1`, point the Worker's
`FUNCTIONS_ORIGIN` at the tunnel hostname (https), and remove the ufw rule for 8880. Request
bodies over 16 MB are refused.

`ALLOWED_GUILD_IDS` lists the servers the bot may stay in. Unset keeps only the original home
server; `ALLOWED_GUILD_IDS=*` allows every server.

**Deleting someone's data.** For a deletion request (the privacy policy promises 30 days), run
`purge-data.mjs` with the bot's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:
`node scripts/hetzner/purge-data.mjs --user <discord id>` or `--guild <server id>`. It prints what
would go (rows per table and photo/card/crest files); add `--confirm` to delete. Billing records are
kept for accounting (a player's id is blanked in them). Rows where the player only appears in a
required "who did it" column are listed as `keep` for a manual look.

Re-run `install-ops.sh` after pulling changes to it: it copies `healthcheck.sh` into place (which now
also checks the bot is connected to Discord via `:8880/health/discord`) and sets up pm2 log rotation
(20 MB files, 10 kept, compressed).
