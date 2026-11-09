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
| `POST /club/import` | Club sync: the club file the XI Lab helper saves from the user's own EA Web App club (format `xilab-club-capture`). Upserts the user's cards by EA item id (evidence `game_data`, format unverified on FC 27), adds missing managers, keeps cards not in the file, then relinks held price captures |
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
| `POST /market/prices/import` | `{ text }`: CSV (`card_id,platform,price,observed_at,kind,event_at`), a Web App capture CSV (`ea_item_id,...`) or JSON; private to the user; up to 5,000 rows |
| `POST /market/import/fc27-market` | Pull third-party console prices (and their short history) for the caller's synced cards from the public fc27-market API (Val Town bowli/fut-market-api, FUT.GG-derived, unlicensed); stored privately under source `fc27_market`, evidence estimate |
| `GET /market/held` | Captured prices for EA items not in your cards yet (promos, Icons, Heroes), one entry per item |
| `POST /market/held/relink` | Link held captures to cards that now carry that EA item id (also runs on every import) |
| `POST /market/held/link` | `{ ea_item_id, card_id }`: link one item's held captures to your card with the same rating |
| `GET /market/sources` | Price providers, their status and what their terms allow |
| `POST /helper/packs` | Helper key only: the pack store and pack pulls the helper copied from the user's Web App (format `xilab-store-capture`). Replaces that platform's stored packs; pulls add up |
| `GET /packs?platform=` | Pack Advisor: each stored pack valued on FUT.GG rating-band prices (typical and average), a verdict (worth buying, only for SBC fodder, skip, FC Points only, needs odds), timing tips, the user's own pack openings and the store field names seen |
| `DELETE /packs?platform=` | Clear the stored packs and pulls for one platform |

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
- **Market-wide card list (since 2026-11-08, Jeff's call).** Catalogue cards (`owner_user_id` NULL, source
  `futgg_catalogue`) come from FUT.GG's public card pool and EA's public Web App player name file, refreshed twice a day
  by the bot (`_shared/fut/futgg-catalogue.ts`). They carry name, rating, position, club, league, nation and card type
  only (no face stats or PlayStyles) and aren't a licence from EA or FUT.GG. Users' own cards stay private to them,
  and nothing a user types can be labelled `verified`.
- **Read-only AI tools.** The MCP FUT tools never save anything (optimizer runs are logged for audit), never
  touch an EA account and never use the transfer market. Prices are what the user typed in, not live prices.
- **Prices.** FUT.GG's public bulk price files (twice a day, `docs/futgg-sync.md`) price the market-wide card list and
  any synced card with the same EA item id; catalogue cards at 1,000+ coins (`market_tracked`) feed the shared baskets
  and indexes. No feed is licensed (EA's FC Community API is closed). Users can add their own private prices: CSV/JSON imports, and capture files
  from the XI Lab Price Capture browser extension (11-lab `extension/`), which records only the transfer-market
  results the EA Web App already loaded when the user searched. Capture rows are stored under `web_app_capture`
  and matched to cards by EA item id (`player_cards.source_card_key` when it's EA's numeric id). Captures for items
  the user has no card for yet are held privately in `fut.market_capture_holds` and linked later. Shared baskets are built
  from catalogue cards only, so a user's private cards never enter an index. Nothing on the server buys, sells, bids or uses an EA login, and the extension never searches, clicks or bids.
- **Pack Advisor (since 2026-11-09, Jeff's call).** The helper (v0.5.0+) copies the pack store the Web App loads
  when the user opens the Store (prices, contents and EA's published pack odds) and the items packs gave when the user
  opened them. Values come from `fut.pack_value_bands` (FUT.GG prices grouped by rating and kind, last 8 days).
  The model is an estimate and the store's field names are unverified on FC 27 (`fut.pack_store_captures.shape` keeps
  what the helper saw). Judged on the typical (median) pack; the mean-based average is shown but never makes a pack a buy.
  Nothing buys or opens packs.
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
