# sync-ea-stats function notes

## Running locally (e.g., `ea-sync-local.js`)
- You can keep using your existing local trigger script as-is. The function still accepts a JSON body with `sync_type` (defaults to `full`).
- New optional flag: `probe_hidden` (boolean) will run the extra hidden-endpoint probes. If you want that behavior locally, add the flag to your request body or set `EA_PROBE_HIDDEN=true` in the environment. Otherwise, you can omit it and nothing changes.
- CORS preflight handling and Supabase service role usage remain unchanged, so no script changes are required just to trigger the sync.

Request shape example:

```json
{
  "sync_type": "full",
  "probe_hidden": false
}
```

If your script was simply POSTing `{ "sync_type": "full" }` (or no body), it continues to work without modification. Only update it if you want to toggle `probe_hidden`.

## How to launch the function locally
- Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and export your service role credentials: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or place them in a `.env` file in this folder).
- From the repo root, start the local function server:

```bash
supabase functions serve sync-ea-stats --env-file supabase/functions/sync-ea-stats/.env
```

- In another terminal, trigger it with curl (or your existing `ea-sync-local.js`):

```bash
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sync_type":"full","probe_hidden":false}' \
  http://localhost:54321/functions/v1/sync-ea-stats
```

You can omit `probe_hidden` unless you want the extra endpoint probes. When deployed in Supabase, the function is reachable at `https://<your-project>.supabase.co/functions/v1/sync-ea-stats` with the same headers/body.

### Keeping your local trigger script up to date
The repo now includes `ea-sync-local.js` as a ready-to-run trigger helper that mirrors the examples above. It reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `SYNC_TYPE`, and `EA_PROBE_HIDDEN` from the environment, then POSTs to `sync-ea-stats` and prints the response.

Run it from this folder (set env vars inline or load them via `node --env-file .env ea-sync-local.js`):

```bash
SUPABASE_URL=http://localhost:54321 \
SUPABASE_SERVICE_ROLE_KEY=your-key \
node ea-sync-local.js
```

If you maintain your own `ea-sync-local.js`, mirror the same flags (especially `EA_PROBE_HIDDEN=true` when you want hidden endpoints probed) so it stays aligned with the latest sync options.
