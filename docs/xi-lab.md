# XI Lab: the FUT side of GafferBot

XI Lab is an EA FC Ultimate Team squad assistant: a squad builder with the Chemistry Surgeon, swap previews
and an optimizer that finds the cheapest chemistry fix, plus Market Lab (price history, indexes, relative strength,
momentum, mean reversion, a trade thesis simulator and a watchlist; research only, it never trades). It runs on GafferBot's platform as a separate module: it shares sign-in, the database server, the
functions server, the MCP connector and the look, and keeps its own data, API and engine.

| Part | Where |
| --- | --- |
| Data | `fut` schema, `supabase/migrations/20261102020000_fut_schema.sql`; Market Lab tables in `20261102030000_fut_market.sql` |
| Website API | `supabase/functions/fut-api` (served at `/api/functions/v1/fut-api/v1/...`) |
| MCP tools | `supabase/functions/gafferbot-mcp/fut.ts` |
| Shared services | `supabase/functions/_shared/fut/service.ts`: cards, managers and the Postgres storage the workspace runs on (both of the above call it) |
| Market Lab storage | `supabase/functions/_shared/fut/market.ts`: Postgres adapters for XI Lab's market service |
| Engine, squad workspace, Market Lab | `supabase/functions/_shared/fut/xilab/{chemistry,workspace,market,intelligence,shared}`, copied from [jgor80/11-lab](https://github.com/jgor80/11-lab) |
| Website pages | `/fut` (not built yet; `noindex` in `public/_headers`) |

## Website API (`/fut-api/v1`)

All routes need a signed-in GafferBot user and act on that user's data only. Anywhere a route takes `squad`,
send either a saved squad id or the whole squad object, so the page can ask questions about unsaved edits.

| Route | What it does |
| --- | --- |
| `GET/POST /cards`, `GET/PUT/DELETE /cards/:id`, `POST /cards/compare` | The user's own cards (typed in from the game) |
| `GET/POST /managers`, `DELETE /managers/:id` | The user's managers (nation and league are all chemistry uses) |
| `GET /formations`, `POST /squads/new` | A blank squad for a formation (not saved yet) |
| `POST /squads/assign` | Put a card (`card_id`, a `card` object, or `null`) in a slot; returns the edited squad |
| `GET /squads`, `POST /squads`, `GET/DELETE /squads/:id`, `POST /squads/save-as` | Saved squads; save-as keeps the original |
| `POST /squads/chemistry` | Chemistry per player and in total, plus tactical fit as a separate estimate |
| `POST /squads/diagnose` | Chemistry Surgeon for one `slot`, or every player below 3 |
| `POST /squads/preview` | What one swap does to all 11 players |
| `POST /squads/optimize` | Cheapest 1-4 swaps that reach a `goal`; locked slots never move; logged in `fut.optimization_runs` |
| `POST /squads/compare` | Two squads side by side (`a`, `b`, optional `base`) |
| `GET /market/overview?platform=` | Indexes, regime, relative-strength leaders and declines, price coverage |
| `GET /market/opportunities?status=&max_price=&category=&limit=` | Scanner: status, reasons and risks per priced card |
| `GET /market/cards/:id`, `GET /market/cards/:id/relative-value?others=` | Card Intelligence; price against tactical-fit estimate vs comparables |
| `POST /market/thesis` | Trade thesis arithmetic (5% tax, break-even, risk/reward) |
| `POST /market/compare-squad` | A card against a saved squad (`squad` id or object), through the chemistry engine; locks respected |
| `GET/POST /market/watchlist`, `DELETE /market/watchlist/:card_id?platform=` | The user's watchlist |
| `POST /market/prices/import` | `{ text }`: CSV (`card_id,platform,price,observed_at,kind,event_at`) or JSON; private to the user; up to 5,000 rows |
| `GET /market/sources` | Price providers, their status and what their terms allow |

## MCP tools

`get_my_fut_squad`, `get_my_fut_inventory`, `get_fut_card`, `compare_fut_cards`, `calculate_fut_chemistry`,
`diagnose_fut_chemistry`, `preview_fut_swap`, `optimize_fut_squad`, `compare_fut_squads`, and for Market Lab
`get_fut_market_overview`, `get_fut_card_market_intelligence`, `find_fut_market_opportunities`,
`compare_fut_card_relative_value`, `analyze_fut_trade_thesis`, `get_fut_market_data_sources`. All read-only; with
no `squad_id` they use the squad the player edited last.

## Rules

- **Separate data.** Only XI Lab code reads `fut`. GafferBot features never join to it, and XI Lab never
  reads Pro Clubs tables (it only looks up `user_discord_links` to find the website account behind an MCP
  connection). Users are keyed by `auth.users(id)`; no GafferBot club or server is needed.
- **Chemistry is calculated, never guessed.** Only XI Lab's tested engine computes it, from the rule version
  in `fut.chemistry_*`. The seeded FC 27 rules are community numbers marked `unverified`, and every answer
  says so.
- **No EA ratings database here until it is licensed.** Launch cards are typed in by each user and private to
  them. Nothing a user types can be labelled `verified`.
- **Read-only AI tools.** The MCP FUT tools never save anything (optimizer runs are logged for audit), never
  touch an EA account and never use the transfer market. Prices are what the user typed in, not live prices.
- **Prices.** No price feed is authorised (EA's FC Community API is closed; FUTBIN, FUT.GG and FUTWIZ have no
  agreement), so Market Lab's only prices are each user's own imports, private to them. Shared baskets are built
  from catalogue cards only, so until a licensed catalogue and feed exist the market indexes report insufficient
  data and the per-card analysis runs on the user's own history. Nothing buys, sells, bids or uses an EA login.
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

Each copied file says which 11-lab commit it came from. The copy takes `src/chemistry`, `src/workspace`,
`src/market`, `src/intelligence` and `src/shared`; nothing that needs Node or the SQLite card data.
