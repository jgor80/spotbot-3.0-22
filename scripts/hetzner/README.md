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
