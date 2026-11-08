# REVIEW_PANEL.md — GafferBot

Config for the Review Panel (multi-judge code review). The shared package defines how to
review; this file defines what matters in GafferBot. `AGENTS.md` holds the detailed design
rules — judges should treat those rules as the spec.

```yaml
application: gafferbot
purpose: Discord bot + web dashboard (gafferbot.app) for EA SPORTS FC Pro Clubs servers — events and availability, lineups, EA stats sync, recaps and the Chronicle, AI player art, recruitment, the cross-server Network, an MCP server for AI apps, and XI Lab (FUT).
users:
  - club leader (manager/captain/admin role): runs the hub, lineups, events, Control Room
  - player: answers events, views stats/cards, uploads pro photos, uses /me
  - other servers: see only public club info via the Network
  - AI apps: act as one Discord user through MCP OAuth or a gb_ token
  - public visitor: /, /terms, /privacy (indexed)
stage: public, with paid plans

architecture:
  - Web: Vite/React in src/, served by a Cloudflare Worker (worker/) that also hosts Discord OAuth, MCP OAuth and the /api/functions/v1/* proxy
  - Bot: public/spotbot/*.cjs on a Hetzner server; redeploys on merge to main
  - Functions: supabase/functions/* (Deno), bundled to public/spotbot/local-functions/ and run in-process by the bot
  - Database: self-hosted Supabase (Postgres + RLS); migrations in supabase/migrations/ and drizzle/

critical_paths:
  - Auth and identity: worker/index.ts Discord OAuth, auth-discord, auto-link.cjs, link-ea-account, redeem-link-invite
  - Server access checks: requireGuildAccess / resolveDiscordActor / isDiscordClubLeader (_shared/auth.ts) mirrored by isManager in index.cjs
  - Web → bot bridge: web-panel function + web-panels.cjs (routeInteraction as the real member)
  - MCP: gafferbot-mcp (manage.ts, moderation.ts, lineups.ts, fut.ts), worker/mcp-oauth.ts, mcp-token
  - Billing and AI image credits: billing function, _shared/billing.ts, premium.cjs, reserve_ai_image / settle_stale_image_reservations, club-art
  - Paid AI calls: club-art, pro-photo vision check, player-cards, scouting reports, AI writer (Lovable gateway routing to OpenAI / Gemini / Claude)
  - Bot ↔ DB proxy: bot-proxy (BOT_PROXY_SECRET), local-functions.cjs (FUNCTIONS_ORIGIN_SECRET, 16 MB cap)
  - GafferBot Network: network*.cjs visibility/block/report/rate-limit helpers
  - Channel moderation (message deletion) via MCP
  - EA sync: sync-ea-stats, ea-activity.cjs, scheduler.cjs (concurrency, stuck runs, dedupe)
  - Events, availability, reminders, pings (event-board.cjs choosePing)
  - Lineups: pickLineup, movePlayer, announce-lineup
  - Pro photos and storage: pro-photo function, private bucket, signed URLs
  - Public pages and prerender: src/lib/seo.ts, scripts/prerender.mjs, public/_headers

sensitive_data:
  - Discord user IDs, guild membership, DMs sent through the bot
  - Player photos (likeness) and generated art
  - Bot token, service-role key, BOT_PROXY_SECRET, FUNCTIONS_ORIGIN_SECRET, OAuth secrets, MCP refresh tokens
  - Billing records (Lemon Squeezy, Discord entitlements)
  - Free-agent contact (names hidden until the player says yes)

paid_apis:
  - OpenAI: images (gpt-image-1.5 / gpt-image-1), strict-JSON vision, scouting reports
  - Gemini, then Claude: plain chat via the AI gateway routing
  - OpenXBL (Xbox presence)
  - EA Pro Clubs endpoints and optional EA_PROXY_URL (rate limits, blocking)

constraints:
  - AGENTS.md rules are the spec; don't re-litigate them, but flag code that breaks them
  - Discord price parity: website and Discord store prices match
  - Branding actions are web-only
  - Never hard-code a club's flavour in shared code
  - XI Lab copies in _shared/fut/xilab/ are synced from jgor80/11-lab — never review as edits
  - Leader rules in _shared/auth.ts and index.cjs stay in step

validation:
  - npm ci
  - npm run lint
  - npx tsc -p tsconfig.app.json --noEmit
  - npm run build
  - (cd public/spotbot && npm install --no-audit --no-fund && for f in *.cjs local/*.cjs; do node --check "$f"; done && npm test)
  - deno test --allow-env --allow-read supabase/functions/

review:
  default: standard
  good_enough: 8.5
  max_rounds: 3
  require_security_for:
    - Anything under worker/, auth, account linking, leader/permission checks
    - Any function that takes a guild_id or acts for a Discord user
    - MCP tools, tokens, OAuth
    - Billing, credits, entitlements, webhooks
    - Paid AI call paths
    - Network (cross-server) features
    - Storage, photo upload, message deletion
    - Database migrations and RLS
  out_of_scope:
    - public/spotbot/local-functions/** (generated bundles; review the supabase/functions source)
    - public/spotbot/club-insights.cjs and lineup-autofill.cjs (generated)
    - supabase/functions/_shared/fut/xilab/** (synced copy)
    - Generated Supabase types
```

## Notes for judges

- The bot has two permission gates that must agree: `isManager` in index.cjs and
  `isDiscordClubLeader` in `_shared/auth.ts`. A change to one without the other is a
  finding.
- Every web-callable function taking a `guild_id` must call `requireGuildAccess`; caller
  checks alone aren't enough.
- AI image spend must be reserved before the call and refunded on failure. Any new paid
  path that skips `reserve_ai_image` or `throttleWebUser` is a cost finding.
- Network features must use the network helpers (visibility, block, report, rate limit,
  cleanText). Anything that leaks member info across servers is Critical.
- Concurrency hot spots: event answers from many players at once, two leaders editing a
  lineup, scheduler ticks overlapping, Discord entitlement replays at startup.
- Time: events live in the server's timezone; Chronicle prints at 3 AM local; DST matters.
