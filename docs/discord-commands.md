# Discord Command Coverage

This project exposes Discord-facing commands through Supabase Edge Functions. Use this list to confirm coverage (including spot availability/preference flows) and find the entry points in code.

## Manager Hub (`public/spotbot/manager-hub.cjs`)
- **/manager**: posts and pins the hub. Buttons: Call Session (posts an In / Late / Out roll call stored as an availability event), Team Sheet (latest lineup with Announce Lineup), Sync Matches (pulls EA matches and refreshes the hub), Club Stats (with a Goals / Assists / Ratings / Form leaderboard picker) and Tactical Insights.
- **/insights**: duo and trio chemistry, formation win rates, win vs. loss gaps and takeaways for your club.
- **/clubstats**: with no action, shows the club stats card; the enable / disable / status actions still manage EA monitoring.
- Insights math is shared with the web Insights page: `public/spotbot/club-insights.cjs` is generated from `src/lib/clubInsights.ts` with `npm run build:bot-lib`.

## Squads and club leaders (`public/spotbot/squads.cjs`)
- **/squad link team:<name>**: links the club for your voice channel (or the current club) to a squad from the Teams table, creating it if needed. That squad's lineups feed the hub's Team Sheet and `/teamsheet`.
- **/squad captain user** (server admins) and **/squad manager user** (admins or the captain, toggles): name the club's leaders. Once a club has named leaders, only they and server admins can run its hub actions, `/teamsheet`, `/syncclub` and `/lfg`, and only they (or web admins) can publish its lineups from the web. Clubs with nobody named keep the old rule: any manager role.
- **/squad info**: shows the link and leaders.
- **/lfg [when] [note]**: posts a "looking for a friendly" card. A leader of another club on the server presses Accept (from their club's voice channel) and both contacts are pinged.

## Events and availability (`public/spotbot/events.cjs`)
- **/event new when:"thu 9pm"**: posts an event board with Available / Maybe / Can't make it buttons. The board updates live and names who is in, maybe and out, who on the roster has not answered, and who is injured or away. Options: `title`, `type` (League match, Friendly, Scrim, Training, Tryout, Tournament), `preset`, `deadline` ("2h" before kick-off or a time like "wed 6pm"; default 1h before), `repeat` (weekly or every 2 weeks), `ping` role, `channel`, `positions` (players pick up to 3 positions when they sign up; on by default for tryouts), `club`, `description`.
- Times are read in the server timezone (`/event timezone`). Accepted: "thu 9pm", "tomorrow 20:00", "tonight", "in 2h", "2026-10-08 21:00", or a Discord `<t:...>` timestamp. Everyone sees times in their own timezone.
- **Reminders**: before the deadline the bot DMs everyone who has not answered (with the same buttons), and pings anyone with DMs closed under the board. Managers can nudge early with the board's Remind button or `/event remind`.
- **Recurring**: `repeat` creates a series; the bot posts each next event a day after the previous kick-off. `/event series list` and `/event series stop`.
- **Presets**: `/event preset save` (title, type, usual day and time, deadline, ping role, channel, position sign-up), `/event preset list`, `/event preset delete`, then `/event new preset:<name>`. Up to 25 per server.
- **/event list** shows upcoming events with counts and links; the hub's Events button shows the same. **/event cancel** cancels and pings everyone who said they could play.
- **/available**: your next five events with your answers and buttons, in one place.
- Events close automatically after kick-off plus their duration.

## Roster (`public/spotbot/roster.cjs`)
- **/roster add user [position] [secondary] [role] [status]**, **/roster remove user**, **/roster status user status [note]** (Active, Trial, Injured, Away, Inactive; injured, away and inactive players are not chased for availability).
- **/roster import role**: adds everyone with a role; position roles (from `/positionpanel`) fill in their positions.
- **/roster view [by] [position]**: the roster grouped by position (main players and cover), by status, or filtered to one position. Players without a roster position fall back to their `/myprefs` or position roles. The footer flags key positions nobody covers.
- The roster belongs to the club's squad (`/squad link`); one named after the club is created on first use.

## Availability & "Spot" management
- **/positionpanel**: members pick up to 3 positions and get the matching roles.
- **spotpanel** (`public/spotbot/index.cjs`): creates the GafferBot control panel for managing club spots from Discord.
- **availability-response** (`supabase/functions/availability-response/index.ts`): records a player's "yes / no / maybe" response for an event.
- **get-event-availability** (`supabase/functions/get-event-availability/index.ts`): fetches the response breakdown for a specific event so you can see who has a spot.
- **mark-attendance** (`supabase/functions/mark-attendance/index.ts`): admin-side override to mark players present/absent.
- **Position/spot preferences** (`supabase/functions/sync-ea-stats/index.ts`): auto-detects and upserts player position preferences (most-played spots) during EA sync; linked EA accounts migrate existing preferences (`supabase/functions/link-ea-account/index.ts`).

## Scouting & stats commands
- **scout-player** (`supabase/functions/scout-player/index.ts`): scout any gamertag or guild member, aggregating stats across clubs and returning AI analysis plus raw EA field coverage.
- **get-player-profile** (`supabase/functions/get-player-profile/index.ts`): fetch stored ratings, summaries, and EA links for a Discord user.
- **recent-results** (`supabase/functions/recent-results/index.ts`): aggregate last-match leaders (AMR, goals, assists, passes, tackles, dribbles, interceptions, saves) and optional AI recap.
- **get-leaderboard** (`supabase/functions/get-leaderboard/index.ts`): returns overall, goals, assists, wins, and in-form leaderboards built from aggregated server stats.
- **calculate-ratings** (`supabase/functions/calculate-ratings/index.ts`): recalculates player ratings after stat updates.
- **sync-ea-stats** (`supabase/functions/sync-ea-stats/index.ts`): fetches all available EA stats across tracked clubs, aggregates per player, updates ratings, form, and position preferences.

## Competition and lineup commands
- **claim-competition-win** (`supabase/functions/claim-competition-win/index.ts`)
- **create-lineup** (`supabase/functions/create-lineup/index.ts`)
- **get-lineup** (`supabase/functions/get-lineup/index.ts`)
- **announce-lineup** (`supabase/functions/announce-lineup/index.ts`): posts a saved lineup to a Discord channel (web Save & Announce, bot `/teamsheet`)
- **draft-start / draft-pick / draft-result** (respective `supabase/functions/draft-*/index.ts`)
- **suggest-optimal-lineup** (`supabase/functions/suggest-optimal-lineup/index.ts`)
- **event-create** (`supabase/functions/event-create/index.ts`)
- **get-event-availability** (`supabase/functions/get-event-availability/index.ts`)
- **mark-attendance** (`supabase/functions/mark-attendance/index.ts`)

## Messaging, reminders, and linking
- **availability-response** (`supabase/functions/availability-response/index.ts`)
- **send-reminders** (`supabase/functions/send-reminders/index.ts`)
- **link-ea-account** (`supabase/functions/link-ea-account/index.ts`)
- **verify-ea-username** (`supabase/functions/verify-ea-username/index.ts`)

## Peer feedback and probability tools
- **submit-peer-evaluation** (`supabase/functions/submit-peer-evaluation/index.ts`)
- **win-probability** (`supabase/functions/win-probability/index.ts`)
