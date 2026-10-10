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
