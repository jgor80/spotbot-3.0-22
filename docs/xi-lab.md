# XI Lab: the FUT side of GafferBot

XI Lab is an EA FC Ultimate Team squad assistant (chemistry, squad building, later the optimizer and market
tools). It runs on GafferBot's platform as a separate module: it shares sign-in, the database server, the
functions server, the MCP connector and the look, and keeps its own data, API and engine.

| Part | Where |
| --- | --- |
| Data | `fut` schema, `supabase/migrations/20261102020000_fut_schema.sql` |
| Website API | `supabase/functions/fut-api` (served at `/api/functions/v1/fut-api/v1/...`) |
| MCP tools | `supabase/functions/gafferbot-mcp/fut.ts` |
| Shared services | `supabase/functions/_shared/fut/service.ts` (both of the above call it) |
| Chemistry engine | `supabase/functions/_shared/fut/xilab/`, copied from [jgor80/11-lab](https://github.com/jgor80/11-lab) |
| Website pages | `/fut` (not built yet; `noindex` in `public/_headers`) |

## Rules

- **Separate data.** Only XI Lab code reads `fut`. GafferBot features never join to it, and XI Lab never
  reads Pro Clubs tables (it only looks up `user_discord_links` to find the website account behind an MCP
  connection). Users are keyed by `auth.users(id)`; no GafferBot club or server is needed.
- **Chemistry is calculated, never guessed.** Only XI Lab's tested engine computes it, from the rule version
  in `fut.chemistry_*`. The seeded FC 27 rules are community numbers marked `unverified`, and every answer
  says so.
- **No EA ratings database here until it is licensed.** Launch cards are typed in by each user and private to
  them. Nothing a user types can be labelled `verified`.
- **Read-only AI tools.** The MCP FUT tools never write, never touch an EA account and never use the transfer
  market.
- **One switch.** `FUT_ENABLED=true` turns on the API and the MCP tools together; anything else hides both.

## Turning it on

1. Merge: the server's auto-deploy applies the migration (additive, its own schema).
2. Expose the schema to the functions: add `fut` to PostgREST's schemas in the Supabase `.env`
   (`PGRST_DB_SCHEMAS=public,storage,graphql_public,fut`, keep whatever is already listed) and restart the
   `rest` container. The browser's `anon` and `authenticated` roles have no grants on `fut`, so this does not
   expose it to the website's direct database access.
3. Set `FUT_ENABLED=true` in the bot's environment and restart it (`pm2 restart spotbot`).

To switch it off, unset `FUT_ENABLED` and restart; data stays. To remove XI Lab entirely:
`DROP SCHEMA fut CASCADE`.

## Updating the engine

```sh
node scripts/sync-xilab.mjs ../11-lab   # path to an 11-lab checkout
deno test --allow-env --allow-read supabase/functions/fut-api supabase/functions/gafferbot-mcp
```

Each copied file says which 11-lab commit it came from.
