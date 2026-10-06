# GafferBot

Club management for EA SPORTS FC Pro Clubs Discord servers: the GafferBot Discord bot plus its web dashboard, backed by Supabase.

What it does:

- **Manager Hub**: `/manager` posts a pinned hub with Call Session (In / Late / Out roll call), Team Sheet, Sync Matches, Club Stats and Tactical Insights buttons. `/insights` and `/clubstats` show the same cards directly. A server with one club never sees a club picker; with several, the hub follows the club linked to your voice channel.
- **Squads and league servers**: `/squad` links each club to a squad (First XI, Academy) and names its captain and managers, who then own that club's hub, team sheet and syncs. `/lfg` matches clubs on the same server for friendlies.
- **Events and availability**: `/event new when:"thu 9pm"` posts a live board (Available / Maybe / Out) that names who still owes an answer, with deadlines, automatic DM reminders, weekly series, presets and tryout position sign-ups. `/available` answers all your upcoming events in one place.
- **Roster**: `/roster` tracks each player's positions and status (active, trial, injured, away). `/roster view` lists players by position, and `/roster import` adds everyone with a role.
- **Spots**: live spot panels per club (`/spotpanel`, `/spots`, `/vcspots`).
- **Team sheets**: build a lineup on the web (Lineup Builder), save it, and announce it in Discord with a pitch graphic, pings for the starting XI and optional DMs. `/teamsheet` posts the latest lineup from Discord.
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
| `public/spotbot/ea-sync-local.cjs` | Optional local EA sync worker (runs from a home connection when EA blocks cloud IPs). |
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

The bot is deployed with Nixpacks (`nixpacks.toml`): it installs `public/spotbot` dependencies and starts `node public/spotbot/index.cjs`. To run it yourself:

```sh
cd public/spotbot
npm install
BOT_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
```

Bot environment variables:

| Variable | Required | Used for |
|---|---|---|
| `BOT_TOKEN` | yes | Discord bot token |
| `SUPABASE_URL` | yes | e.g. `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side database access. Never put this in the web app or a public file. |
| `OPENAI_API_KEY` | no | Scouting reports |
| `OPENXBL_API_KEY` | no | Xbox presence |
| `EA_SESSION_COOKIE` | no | Helps when EA blocks requests |
| `DASHBOARD_URL` | no | Your web dashboard address; adds an "Open Lineup Builder" link to the hub's Team Sheet |

The bot registers its slash commands on start, so adding or removing a command only needs a restart.

### Linking a club for FC27

EA issued new club IDs for FC27. Run `/setclub name:<exact EA club name>` (platform is optional: PS5 / Xbox Series / PC share one platform, Switch is separate). Clubs linked in an earlier FC are relinked automatically once when the bot starts monitoring them, but only if the club name matches exactly. Otherwise run `/setclub` again.

## Local EA sync (optional)

EA often blocks requests from cloud hosts. `ea-sync-local.cjs` runs on your own machine, syncs every 15 minutes between 9 AM and 3 AM Central, and writes matches, member stats and ratings to Supabase.

```sh
cd public/spotbot
npm install
cat > .env <<'EOF'
SUPABASE_URL=https://<project-ref>.supabase.co
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
