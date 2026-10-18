# GafferBot

Club management for EA SPORTS FC Pro Clubs Discord servers: the GafferBot Discord bot plus its web dashboard, backed by Supabase.

What it does:

- **Manager Hub**: `/manager` posts a pinned hub with Call Session (In / Late / Out roll call), Team Sheet, Sync Matches, Club Stats and Tactical Insights buttons. `/insights` and `/clubstats` show the same cards directly. A server with one club never sees a club picker; with several, the hub follows the club linked to your voice channel.
- **Squads and league servers**: `/squad` links each club to a squad (First XI, Academy) and names its captain and managers, who then own that club's hub, team sheet and syncs. `/lfg` matches clubs on the same server for friendlies.
- **Events and availability**: `/event new when:"thu 9pm"` posts a live board (Available / Maybe / Out) that names who still owes an answer, with deadlines, automatic DM reminders, weekly series, presets and tryout position sign-ups. `/available` answers all your upcoming events in one place.
- **Match night**: check-in opens 30 minutes before kick-off with a live list of who's here, late, out or missing. Drop-outs trigger sub requests the first taker fills (swapped into the lineup), and `/reliability` shows show-up rates built from real check-ins.
- **Autopilot**: joining the club voice channel near kick-off checks players in, 10 minutes before kick-off the bot drafts the XI (best win-rate formation, positions, form, chemistry) and asks leaders to Publish or Tweak, finished EA matches get an automatic recap, a starter who leaves voice for 3 minutes triggers a sub request, and a Monday digest sums up formations, pairings and show-up rates. `/autopilot` (or the hub's Autopilot button) switches each part on or off.
- **Roster**: `/roster` tracks each player's positions and status (active, trial, injured, away). `/roster view` lists players by position, and `/roster import` adds everyone with a role.
- **Recruitment**: players opt in to a cross-server free agent pool with `/fa`; managers search it with `/recruit search` and press Reach Out, which DMs the player through the bot so nobody's Discord name is shared until they say yes. After each synced match the bot flags standout opponents (Recruitment Alerts), and `/scout` keeps a watchlist that pings you when a watched player lists as a free agent or changes clubs. `/apply` signs up trialists, tryouts invite them automatically, and managers get a report card after each tryout with Promote / Second trial / Release buttons. `/recruit post` makes a recruiting poster, `/lfc` a verified player resume, and `/recruit gaps` flags positions the squad is thin at.
- **Spots**: live spot panels per club (`/spotpanel`, `/spots`, `/vcspots`).
- **Team sheets**: build a lineup on the web (Lineup Builder), save it for an event, and announce it in Discord with a pitch graphic, pings for the starting XI and optional DMs. Fill from Availability places everyone who said yes (using their sign-up positions), and the event board's Build Lineup button opens the builder with the event picked. Re-publishing edits the same team sheet and lists who's in, out or moved. `/teamsheet` posts the latest lineup from Discord.
- **Setup and branding**: `/setup` shows the next step and any missing permissions. `/brand` sets colours, the team sheet title, a crest, and the bot's nickname and avatar in your server.
- **Club stats and insights**: EA match sync, the Games page, and the Insights page (record, form, duo and trio chemistry, player impact, win vs. loss gaps, formations).
- **Captains drafts**: `/draft`, then `/applyfriendly` links the EA friendly you played to the draft so everyone gets stats.
- **Position roles**: `/positionpanel` posts a panel where members pick up to three positions and get the matching roles.
- **Twitch and Xbox**: go-live alerts (`/twitchsetup`) and Xbox presence (`/linkxbox`).

The web dashboard has four main views (Match Night, Lineup Builder, Club Stats, Tactical Insights); everything else is under **More**.

## Repository layout

| Path | What it is |
|---|---|
| `src/` | Web dashboard (Vite, React, TypeScript, shadcn/ui). Edited in Lovable and here. |
| `public/spotbot/index.cjs` | The Discord bot (single file). |
| `public/spotbot/local/ea-sync-local.cjs` | Optional fallback EA sync worker for your own machine. Not needed to run the bot. |
| `public/spotbot/ea-fc27.cjs` | EA platform and region helpers shared by the bot and local sync. |
| `supabase/functions/` | Edge functions (Deno). Shared code is in `supabase/functions/_shared/`. |
| `supabase/migrations/` | Database schema. |
| `docs/discord-commands.md` | Command and edge function reference. |

## Web dashboard

```sh
npm install
npm run dev      # local dev server
npm run build    # production build
npm run lint     # ESLint for src/ (edge functions are checked with deno, see below)
```

The dashboard reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID` from `.env`. These are public values (the anon key), not secrets.

## Discord bot

In production the bot runs on the Hetzner server and redeploys on every merge to main (see `scripts/hetzner/README.md`). To run it yourself:

```sh
cd public/spotbot
npm install
BOT_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
```

Bot environment variables:

| Variable | Required | Used for |
|---|---|---|
| `BOT_TOKEN` | yes | Discord bot token |
| `SUPABASE_URL` | yes | The self-hosted Supabase (Kong) address, e.g. `https://supabasekong-xue3q5tb1udz4bvq6oxbg1pv.65.108.243.142.sslip.io` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side database access. Never put this in the web app or a public file. |
| `OPENAI_API_KEY` | no | Scouting reports and the Premium assistant coach's wording |
| `OPENXBL_API_KEY` | no | Xbox presence |
| `EA_SESSION_COOKIE` | no | Helps when EA blocks requests |
| `DASHBOARD_URL` | no | Your web dashboard address; adds an "Open Lineup Builder" link to the hub's Team Sheet and is the base of the /premium overlay link |
| `BOT_OWNER_IDS` | no | Comma-separated Discord user ids allowed to run `/premium on` and `/premium off` |
| `PREMIUM_PAYWALL` | no | Leave unset to give every server the Premium features free; set to `on` to limit them to Premium servers |
| `PREMIUM_GUILDS` | no | Comma-separated server ids that always have Premium (testing) |
| `DISCORD_PREMIUM_SKU_ID` | no | The SKU of a Discord App Subscription; servers holding it get Premium and non-premium servers see Discord's Subscribe button |
| `IMAGE_LIMITS` | no | Set to `on` to count AI images per server (plans, packs, welcome images); unset means unlimited |
| `ERROR_WEBHOOK_URL` | no | Discord webhook for a private channel; bot, scheduler and function errors post there (each distinct error once an hour, with a repeat count) |
| `DISCORD_SKUS` | no | JSON mapping plan and pack keys to Discord store SKUs, e.g. `{"starter":"…","club":"…","pro":"…","unlimited":"…","lifetime":"…","pack25":"…","pack70":"…"}` |
| `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET` | no | Website checkout. Point the Lemon Squeezy webhook at `https://gafferbot.app/api/functions/v1/billing` (order and subscription events) |
| `LEMONSQUEEZY_VARIANTS` | no | JSON mapping the same keys to Lemon Squeezy variant ids |
| `BILLING_PLANS`, `BILLING_PACKS` | no | JSON overrides for plan and pack numbers, e.g. `{"free":{"welcome":15},"club":{"monthly":75}}`. Store prices must match on both stores (Discord's price-parity rule) |
| `PUBLIC_SITE_URL` | no | Website address used in buy links (default `https://gafferbot.app`) |

The bot registers its slash commands on start, so adding or removing a command only needs a restart.

### Linking a club for FC27

EA issued new club IDs for FC27. Run `/setclub name:<exact EA club name>` (platform is optional: PS5 / Xbox Series / PC share one platform, Switch is separate). Clubs linked in an earlier FC are relinked automatically once when the bot starts monitoring them, but only if the club name matches exactly. Otherwise run `/setclub` again.

## Local EA sync (optional fallback)

You don't need a local machine: the `sync-ea-stats` edge function syncs EA on a schedule and when someone presses Sync, and both it and the bot retry when EA throttles cloud IPs (403/429), telling users if EA is still refusing. Use `local/ea-sync-local.cjs` only as a fallback if EA keeps blocking the cloud for long stretches. It runs on your own machine, syncs every 15 minutes between 9 AM and 3 AM Central, and writes matches, member stats and ratings to Supabase.

```sh
cd public/spotbot
npm install
cat > .env <<'EOF'
SUPABASE_URL=https://supabasekong-xue3q5tb1udz4bvq6oxbg1pv.65.108.243.142.sslip.io
SUPABASE_SERVICE_ROLE_KEY=<service role key>
# optional
EA_SESSION_COOKIE=
EOF
npm run sync
```

Keep `.env` out of git.

## Edge functions

Edge functions run on Supabase (Deno). Secrets they read, set in the Supabase dashboard under Edge Functions → Secrets:

| Secret | Used by |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | All functions (provided by Supabase automatically) |
| `DISCORD_BOT_TOKEN` | `announce-lineup`, `twitch-webhook` (the same token as the bot's `BOT_TOKEN`) |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_WEBHOOK_SECRET` | `twitch-webhook` |
| `OPENXBL_API_KEY` | `check-xbox-presence` |
| `OPENAI_API_KEY`, `LOVABLE_API_KEY` | AI analysis functions |
| `EA_SESSION_COOKIE`, `EA_PROBE_HIDDEN` | `sync-ea-stats` (optional) |

Functions that the web app calls with a user session, or the bot calls with the service-role key, check the caller with `_shared/auth.ts`.

To type-check a function locally:

```sh
npx deno check supabase/functions/<name>/index.ts
```

## Security

- The service-role key bypasses all database security. Only the bot, the local sync and edge functions may hold it.
- If the key is ever exposed, rotate it in the Supabase dashboard and update the bot host, your local `.env`, and anything else that uses it.
