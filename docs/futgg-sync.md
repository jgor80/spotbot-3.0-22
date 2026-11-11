# FUT.GG prices: bot to the website

The bot's scheduler on the Hetzner server collects the public FUT.GG index and console/PC price files at
**06:00 and 18:00 UTC** (`futgg-prices` in `public/spotbot/scheduler.cjs`). After a restart it also runs once,
two minutes in, if the last successful refresh is more than 12 hours old. The code lives in
`worker/futgg-sync.ts` and is bundled for the bot with `npm run build:bot-futgg` (rebuild after editing).
It uses the bot's existing service-role database client to call service-role-only ingestion functions in the
`fut` schema. No EA login, browser extension, residential proxy or new secret is required. It runs only when
the bot has `FUT_ENABLED=true` (the XI Lab switch); `FUTGG_SYNC=off` pauses just this job.

Right after the prices, the bot runs the fut-api job `futgg-catalogue` (`_shared/fut/futgg-catalogue.ts`): it reads
FUT.GG's `streamlined-pool` (rating, position, club, nation, league, card type per price-index id) and `fc-core-data`
(names for those ids), plus the EA FC Web App's public `players.json` (player names by base id; its address comes from
the Web App page's `fut_guid`/`fut_year`). Every card is upserted as a catalogue card (`fut.upsert_futgg_catalogue`),
cards whose latest price on either platform is 1,000+ coins are marked `market_tracked`
(`fut.refresh_futgg_tracked`), and Market Lab's baskets are rebalanced. Market Lab lists the caller's own cards plus
the tracked catalogue cards (own copy wins), and FUT.GG quotes map onto both.

This started on the Cloudflare Worker's cron, but FUT.GG answers HTTP 403 to requests from Cloudflare
Workers (first run, 2026-11-08 06:00 UTC), so the Worker cron was removed.

Each refresh performs four public GETs using the current manifest hashes. Both platform blobs are validated
before ingestion. PostgreSQL decodes the card ID deltas and commits each platform snapshot in one transaction.
Concurrent/repeated ingestion is serialized and idempotent. Invalid files, access denials, older snapshots and
changed prices with unchanged publication times fail instead of overwriting known data. There is no automatic
retry loop or challenge solver. Source timestamps and first receipt times are retained; subsequent identical
fetches update only `checked_at`. Cache retention is 90 days, independent of users' own import history.

`futgg_snapshots` and `futgg_prices` are service-role-only tables with RLS and no browser grants. SBC costs and
reward values are kept separately from nullable market quotes. The price adapter maps bulk EA item IDs onto
only the requesting user's card UUIDs, honors platform and point-in-time cutoffs, and paginates PostgREST reads.
It does not copy shared snapshots into every user's private import history or consume their import quota.

The existing website market analyses now read those matched prices automatically. The Market Lab overview
shows dataset coverage, publication/check times, the twice-daily schedule, missing snapshots and failed runs.
`GET /fut-api/v1/market/feeds/futgg` exposes that status to signed-in users. The former hourly limited-feed job
is removed from the bot scheduler; its manual import/status endpoints remain available.

## Hourly prices for charts (off by default)

With `FUTGG_HOURLY=on` the bot also checks FUT.GG at 20 minutes past every hour (`futgg-hourly`,
`syncFutggHot` in `worker/futgg-sync.ts`). It fetches only the manifest (one GET) and compares each platform's
publication time with the newest one already stored (`fut.futgg_latest_published`, full or hourly). Only when FUT.GG
has published newer files does it fetch the index and those files (at most four GETs an hour, the same files FUT.GG's
own site loads, no retries). `fut.ingest_futgg_hot` keeps just the hot cards: market-tracked catalogue cards, cards on
anyone's watchlist and cards in anyone's synced club, in `fut.futgg_hot_prices` for 14 days. The twice-daily full
refresh, its 90-day retention and Market Lab's analysis are unchanged; the hourly rows feed only the price charts
(`fut.card_price_history`, `GET /prices/history`). Before turning it on, check FUT.GG's current terms and how often
the files actually change (`fut.futgg_hot_runs` shows each stored publication).

## Deployment

Merging to main is enough: the Hetzner auto-deploy applies migrations and restarts the bot, and the first
refresh runs two minutes after the restart. Check the bot log for `futgg-prices` and open Market Lab. A failed
run is recorded in `fut.market_provider_runs` (Market Lab shows its message), with previous data retained,
and is reported through the bot's error webhook.

For a database administrator, read-only checks:

```sql
SELECT platform,published_at,checked_at,card_count,priced_count
FROM fut.futgg_snapshots ORDER BY published_at DESC LIMIT 4;
SELECT status,finished_at,message FROM fut.market_provider_runs
WHERE source_id='futgg_bulk' ORDER BY finished_at DESC LIMIT 4;
```

## Limits

This is third-party price data; public access is not an EA partnership or a data licence. Permission flags in
the app describe this personal research integration, not a grant of provider rights. No public redistribution
endpoint is added. Source status can disable it.

All entries in the returned files are retained, including missing/non-market values; this does not guarantee
every FUT card has a price. Dataset publication time is not a per-card quote-update timestamp, and each mapped
observation is labelled as an estimate with that limitation. A twice-daily dataset can become stale under the
market engine's existing freshness rules before the next download. Those rules are preserved.

The feed contains IDs and prices, not a complete card metadata catalogue. Existing analysis still operates on
cards known to the signed-in user's inventory. Global chemistry/ratings catalogues and shared basket membership
are unchanged. This change connects bulk prices to existing website features; it does not claim market-wide
analysis works without the missing card metadata/history.

Tests use mocked HTTP, owner-scoped in-memory adapters and real in-memory PostgreSQL (PGlite). No production
secrets or database are needed. Run `deno test --allow-env --allow-read supabase/functions/_shared/fut/futgg*.test.ts`.
