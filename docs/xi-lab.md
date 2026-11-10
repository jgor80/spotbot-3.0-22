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
| `GET /club/value?platform=` | Club trade value: the user's synced cards split tradeable / untradeable (copies counted from the club file), each priced at the latest FUT.GG price or the user's own newer Web App capture, with totals before and after EA's 5% tax (`fut.club_trade_value`) |
| `GET/POST /managers`, `DELETE /managers/:id` | The user's managers (nation and league are all chemistry uses) |
| `GET /formations`, `POST /squads/new` | A blank squad for a formation (not saved yet) |
| `GET /formations/slots`, `POST /squads/formation` | Every FC 27 Ultimate Team formation (28, in-game names such as `4-3-3 (2)`, FC 27's 12 positions only) with slots and pitch rows; switch an unsaved squad's formation keeping every card |
| `POST /squads/best` | "Suggest best squad": `{ squad, by: "ovr" \| "chem", formation? }` (`formation` defaults to the squad's, or `"all"` for all 28). Builds the best XI from the user's club cards (owned), everyone in a position they play, locked players kept: `ovr` maximises total overall with chemistry as tie-break, `chem` maximises team chemistry with overall as tie-break (greedy start plus one start per big league/nation/club, improved by replacements and slot swaps). Returns `{ by, owned_cards, results: [{ formation, squad, chemistry, rating, filled, empty }] }`, best first. Not saved |
| `POST /squads/suggest` | Ranked club cards for one slot: `{ squad, slot, by }` returns cards that play the slot's position and aren't already in the squad, with the team chemistry and the card's own chemistry if placed there |
| `POST /squads/roles` | Each squad card's FC 27 player roles (+ / ++) for its slot's position, from `fut.card_roles` (FUT.GG card data). A club card borrows the catalogue card with the same EA item id |
| `POST /squads/import` | Squad Builder's "Import squad" chat: `{ squad, text?, image? }`. A plain list ("ST Mbappe 91" per line, comma-separated, or a CSV with a `name` column) is read without AI; free text and screenshots (`image: { media_type, data }` base64, shrunk to 1600px in the browser) are read by Claude (`ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`, model `FUT_IMPORT_MODEL`, default claude-opus-5-5 at low effort with server-side fallback; `FUT_IMPORT_AI_PER_HOUR`, default 30, per user). Each player is matched to the user's own cards first (owned ones win), then the FUT.GG catalogue cards, accent-insensitive, rating and version breaking ties, and placed by named slot, then position, then a slot the card plays. Returns the edited squad (not saved) plus each line's match, confidence and other versions |
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
| `POST /helper/account` | Helper key only: the user's account as the helper copied it from Web App answers (format `xilab-account-capture`): balance, club record, transfer list, watchlist, unassigned, SBCs, objectives, season. Each section replaces the stored one only when it was seen later; coins/points add a history point when they change (or every 6 hours) |
| `GET /account?platform=` | My Account: balance and its history, transfer list / watchlist / unassigned with FUT.GG names and prices, SBCs, objectives, season numbers, tips and the field names seen |
| `DELETE /account?platform=` | Clear the stored account and balance history for one platform |
| `GET /knowledge/map?days=&category=` | Knowledge Bank map: every topic the community talked about in the period (shared sources plus the caller's own), with for/against/mixed counts, net sentiment (-1..1, weighted by upvotes/views), agreement (agreed, leaning, split, early) and trend (-1..1, newer half of the period against the older half) |
| `GET /knowledge/topics/:key?days=` | One topic: totals, claims per week and its statements with their source links |
| `GET /knowledge/sources?mine=&limit=&offset=`, `POST /knowledge/sources`, `DELETE /knowledge/sources/:id` | Sources (newest first). POST `{ url?, text?, title?, share? }` adds a Reddit/YouTube link (fetched through their APIs when configured) or pasted text and reads it straight away (`FUT_KB_ADDS_PER_HOUR`, default 20). Notes are always private; a linked source is shared only when asked. Users delete only their own |
| `POST /knowledge/ask` | `{ question, history? }`: an answer from the bank's claims with numbered sources (Claude, `FUT_KB_ASK_PER_HOUR` default 60), or the best matching claims grouped by topic without a key |
| `GET /knowledge/status` | Bank totals, the last collection run, and which feeds have keys |

## MCP tools

`get_my_fut_squad`, `get_my_fut_inventory`, `get_fut_card`, `compare_fut_cards`, `calculate_fut_chemistry`,
`diagnose_fut_chemistry`, `preview_fut_swap`, `optimize_fut_squad`, `compare_fut_squads`, and for Market Lab
`get_fut_market_overview`, `get_fut_card_market_intelligence`, `find_fut_market_opportunities`,
`compare_fut_card_relative_value`, `analyze_fut_trade_thesis`, `get_fut_market_data_sources`, and for the Knowledge Bank
`search_fut_knowledge` and `get_fut_knowledge_map` (the AI app answers from the claims itself, so they never call Claude). All read-only; with
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
- **Pack Advisor (since 2026-11-09, Jeff's call).** The helper (v0.5.0+; v0.7.0 reads any store, pack or odds answer and logs the addresses it saw) copies the pack store the Web App loads
  when the user opens the Store (prices, contents and EA's published pack odds) and the items packs gave when the user
  opened them. Values come from `fut.pack_value_bands` (FUT.GG prices grouped by rating and kind, last 8 days).
  The model is an estimate and the store's field names are unverified on FC 27 (`fut.pack_store_captures.shape` keeps
  what the helper saw). Judged on the typical (median) pack; the mean-based average is shown but never makes a pack a buy.
  Nothing buys or opens packs.
- **Card pictures (since 2026-11-09).** Cards are drawn by GafferBot itself (`src/components/fut/FutCardArt.tsx`):
  rating, position, name and face stats, coloured by card type. FUT.GG's card renders are never used (its terms ban
  reusing its content). EA images are off unless `FUT_EA_IMAGES=on` (`FUT_EA_FACES=on` also works; Jeff's call,
  2026-11-10): then `GET /health` returns `card_images.portrait_base` (player faces) and `background_base` (EA's common
  and rare gold/silver/bronze card backgrounds), looked up from the Web App page and cached 6h, and each browser loads
  them straight from EA with a "© EA" credit. Nothing is downloaded, stored or re-served. EA doesn't publish promo,
  Icon or Hero backgrounds there, so those keep GafferBot's design. EA's terms only allow personal, non-commercial use,
  so this stays a deliberate switch.
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

## Knowledge Bank (`/fut/knowledge`)

What the community says about FUT gameplay and strategy, as a map, an Ask chat and the sources (Jeff, 2026-11-10).
Code in `_shared/fut/knowledge.ts`, tables and queries in `20261110160000_fut_knowledge_bank.sql` (`fut.kb_*`).

- **Collecting.** The bot's scheduler runs the fut-api job `knowledge-ingest` at :41 every 3 hours (`fut-knowledge` in
  `scheduler.cjs`; `FUT_KNOWLEDGE=off` pauses it). Reddit: the day's top gameplay posts (keyword and flair filter, no
  NSFW, pack pulls or memes, at least `FUT_KB_REDDIT_MIN_SCORE` upvotes, default 20) from `FUT_KB_SUBREDDITS` (default
  `EASportsFC,fut`) with their top comments, through Reddit's Data API with an app-only token (`REDDIT_CLIENT_ID`,
  `REDDIT_CLIENT_SECRET`, optional `REDDIT_USER_AGENT`; Reddit has to approve the app). Without those keys Reddit is
  read from its public RSS feeds instead (`/r/<sub>/top/.rss?t=day`, then each post's `/comments/<id>/.rss` for its top
  comments; `FUT_KB_REDDIT_PER_SUB`, default 6 in this mode). Feeds carry no scores, so the post's rank in the day's
  top list is told to the reader and score stays 0; pasted Reddit links are fetched the same way. `FUT_KB_REDDIT_RSS=off`
  turns this off. Checked from the Hetzner server 2026-11-10 (HTTP 200). YouTube: the last 3 days'
  most-watched videos for each of `FUT_KB_YOUTUBE_QUERIES` (`|`-separated) with their top comments, through the YouTube
  Data API (`YOUTUBE_API_KEY`), only at `FUT_KB_YOUTUBE_HOURS` (default 1,7,13,19 UTC) to stay inside the free quota.
  Video transcripts aren't available through the API; users can paste them. Nothing is scraped from web pages.
- **Send to Knowledge Bank.** The Sources tab has a bookmarklet (`sendToBank.ts`). Clicked on a page the user is
  reading, it opens `/fut/knowledge?tab=sources#kb=<json>` with the link, title and text (selected text, else the
  Reddit post and top comments on new or old Reddit, else the page's main text; YouTube sends only the link) filled in.
  The text rides in the #fragment, so it never reaches a server, and nothing is added until the user presses Add.
- **Reading.** Claude (`FUT_KB_MODEL`, default claude-opus-5-5 at low effort) reads up to `FUT_KB_READ_PER_RUN`
  (default 25) waiting sources per run, most popular first, into at most 12 claims each: topic (reusing known topic
  names), category, a paraphrased statement, stance (for / against / mixed) and strength. A source gets three tries.
- **Keeping.** Collected sources keep only their link, kind, community, date and score 30 days after collection
  (`kb_cleanup`); the claims stay. A user's sources are private unless shared and go with their account.
- **Weighting.** A claim counts `strength × (1 + min(2, log10(score) / 2))`, so a 10k-upvote post counts about three
  times a fresh one.

