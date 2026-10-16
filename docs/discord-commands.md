# Discord Command Coverage

## Slash commands and panels (`public/spotbot/panels.cjs`)
GafferBot registers four slash commands:
- **/manager** (leaders): the Manager Hub. Its **More tools** menu opens each area (Events, Match Night, Lineups & Spots, Drafts, Stats & Scouting, Roster & Squad, Recruiting, Premium, Admin) as a private menu of buttons.
- **/me** (everyone): the Player Hub, only visible to the person who ran it. Admins can post a shared copy with **/manager → Admin → Post Player Hub**.
- **/help** and **/setup**.

Every other former command is a panel button. A button that needs input opens a form: players, channels and roles are dropdowns, fixed choices are dropdowns, and lists the old command autocompleted (events, presets, watchlist, EA names) are filled in when the form opens. On submit the button runs the same handler the slash command used (`commandProxy` in panels.cjs), so the behaviour described below is unchanged; the sections below still use the old command names as the names of those actions. Area buttons only work for captains, managers and admins (`isManager`), and actions that used Discord's default permissions (Brand: Manage Server, Position Roles Panel: Manage Roles) check that permission on the button. The old definitions stay in index.cjs as `ACTION_SCHEMAS`, which the forms are built from.

| Old command | Now | Who |
|---|---|---|
| `/mystats` | /me → My Stats | Everyone |
| `/profile` | /me → My Profile | Everyone |
| `/leaderboard` | /me → Leaderboard | Everyone |
| `/available` | /me → My Events | Everyone |
| `/checkin` | /me → Check In | Everyone |
| `/sub` | /me → Need a Sub | Everyone |
| `/whoisplaying` | /me → Who's Playing | Everyone |
| `/myprefs` | /me → My Positions | Everyone |
| `/syncprefs` | /me → Positions From Roles | Everyone |
| `/reliability` | /me → My Reliability | Everyone |
| `/linkea` | /me → Link EA | Everyone |
| `/linkxbox` | /me → Link Xbox | Everyone |
| `/fa` | /me → Free Agent | Everyone |
| `/fa` | /me → Free Agent Details | Everyone |
| `/lfc card` | /me → Resume Card | Everyone |
| `/lfc verify` | /me → Check a Resume | Everyone |
| `/apply` | /me → Apply to Trial | Everyone |
| `/claimwin` | /me → Claim a Win | Everyone |
| `/event new` | /manager → Events → New Event | Leaders |
| `/event new` | /manager → Events → Event From Preset | Leaders |
| `/event list` | /manager → Events → Upcoming | Leaders |
| `/event edit` | /manager → Events → Edit Event | Leaders |
| `/event post` | /manager → Events → Repost Board | Leaders |
| `/event remind` | /manager → Events → Remind | Leaders |
| `/event mark` | /manager → Events → Mark a Player | Leaders |
| `/event close` | /manager → Events → Close Answers | Leaders |
| `/event reopen` | /manager → Events → Reopen Answers | Leaders |
| `/event cancel` | /manager → Events → Cancel Event | Leaders |
| `/event timezone` | /manager → Events → Timezone | Leaders |
| `/event preset list` | /manager → Events → Presets | Leaders |
| `/event preset save` | /manager → Events → Save Preset | Leaders |
| `/event preset delete` | /manager → Events → Delete Preset | Leaders |
| `/event series list` | /manager → Events → Repeating Events | Leaders |
| `/event series stop` | /manager → Events → Stop Repeating | Leaders |
| `/checkin` | /manager → Match Night → Open Check-in | Leaders |
| `/sub` | /manager → Match Night → Find a Sub | Leaders |
| `/reliability` | /manager → Match Night → Reliability | Leaders |
| `/attendance` | /manager → Match Night → Attendance | Leaders |
| `/lfg` | /manager → Match Night → Find a Friendly | Leaders |
| `/autopilot` | /manager → Match Night → Autopilot | Leaders |
| `/teamsheet` | /manager → Lineups & Spots → Team Sheet | Leaders |
| `/spotpanel` | /manager → Lineups & Spots → Spots Panel | Leaders |
| `/spots` | /manager → Lineups & Spots → Spots Board | Leaders |
| `/vcspots` | /manager → Lineups & Spots → Voice Spots | Leaders |
| `/whoisplaying` | /manager → Lineups & Spots → Who's Playing | Leaders |
| `/spotblock` | /manager → Lineups & Spots → Block Mover | Leaders |
| `/autoassign` | /manager → Lineups & Spots → Auto-assign | Leaders |
| `/pospanel` | /manager → Lineups & Spots → Prefs Panel | Leaders |
| `/posboard` | /manager → Lineups & Spots → Voice Prefs | Leaders |
| `/posprefs` | /manager → Lineups & Spots → All Prefs | Leaders |
| `/syncprefs` | /manager → Lineups & Spots → Prefs From Roles | Leaders |
| `/positionpanel` | /manager → Lineups & Spots → Position Roles Panel | Leaders |
| `/draft` | /manager → Drafts → Start Draft | Leaders |
| `/draftpanel` | /manager → Drafts → Draft Panel | Leaders |
| `/draftpick` | /manager → Drafts → Pick Player | Leaders |
| `/draftresult` | /manager → Drafts → Report Result | Leaders |
| `/draftreroll` | /manager → Drafts → Reroll Captains | Leaders |
| `/draftcancel` | /manager → Drafts → Cancel Draft | Leaders |
| `/applyfriendly` | /manager → Drafts → Apply Friendly Stats | Leaders |
| `/clubstats` | /manager → Stats & Scouting → Club Stats | Leaders |
| `/syncclub` | /manager → Stats & Scouting → Sync Matches | Leaders |
| `/insights` | /manager → Stats & Scouting → Insights | Leaders |
| `/leaderboard` | /manager → Stats & Scouting → Leaderboard | Leaders |
| `/profile` | /manager → Stats & Scouting → Player Profile | Leaders |
| `/ratingspanel` | /manager → Stats & Scouting → Ratings Panel | Leaders |
| `/scoutclub` | /manager → Stats & Scouting → Scout a Club | Leaders |
| `/clubmatches` | /manager → Stats & Scouting → Club Matches | Leaders |
| `/matchpreview` | /manager → Stats & Scouting → Match Preview | Leaders |
| `/scoutpanel` | /manager → Stats & Scouting → Scouting Panel | Leaders |
| `/roster view` | /manager → Roster & Squad → View Roster | Leaders |
| `/roster add` | /manager → Roster & Squad → Add Player | Leaders |
| `/roster player` | /manager → Roster & Squad → Player Details | Leaders |
| `/roster status` | /manager → Roster & Squad → Set Status | Leaders |
| `/roster remove` | /manager → Roster & Squad → Remove Player | Leaders |
| `/roster import` | /manager → Roster & Squad → Import Role | Leaders |
| `/squad info` | /manager → Roster & Squad → Squad Info | Leaders |
| `/squad link` | /manager → Roster & Squad → Link Squad | Leaders |
| `/squad captain` | /manager → Roster & Squad → Set Captain | Leaders |
| `/squad manager` | /manager → Roster & Squad → Add/Remove Manager | Leaders |
| `/forcelink` | /manager → Roster & Squad → Link Player to EA | Leaders |
| `/reviewlinks` | /manager → Roster & Squad → Review EA Links | Leaders |
| `/recruit search` | /manager → Recruiting → Search Free Agents | Leaders |
| `/recruit gaps` | /manager → Recruiting → Squad Gaps | Leaders |
| `/recruit post` | /manager → Recruiting → Recruitment Poster | Leaders |
| `/recruit applypanel` | /manager → Recruiting → Apply Button | Leaders |
| `/recruit setup` | /manager → Recruiting → Recruiting Setup | Leaders |
| `/scout opponent` | /manager → Recruiting → Opponent Dossier | Leaders |
| `/network setup` | /manager → Admin → Network Setup | Server admins |
| `/network status` | /manager → Admin → Network Status | Leaders |
| `/network clubs` | /manager → Match Night → Network Clubs | Leaders |
| `/network need` | /manager → Match Night → Need a Player | Leaders |
| `/network leaderboard` | /me → Network Leaderboard, /manager → Stats & Scouting → Network Leaderboard | Everyone |
| `/network suspend` | /manager → Admin → Owner: Network Suspend | Bot owners |
| `/scout watchlist` | /manager → Recruiting → Watchlist | Leaders |
| `/scout add` | /manager → Recruiting → Watch a Player | Leaders |
| `/scout remove` | /manager → Recruiting → Unwatch | Leaders |
| `/premium status` | /manager → Premium → Premium Status | Leaders |
| `/premium cards` | /manager → Premium → Player Cards | Leaders |
| `/premium totw` | /manager → Premium → Team of the Week | Leaders |
| `/premium overlay` | /manager → Premium → Stream Overlay | Leaders |
| `/premium trophies` | /manager → Premium → Trophies | Leaders |
| `/premium coach` | /manager → Premium → Assistant Coach | Leaders |
| `/premium on` | /manager → Premium → Owner: Premium On | Leaders |
| `/premium off` | /manager → Premium → Owner: Premium Off | Leaders |
| `/setclub` | /manager → Admin → Link EA Club | Leaders |
| `/squadiq` | /manager → Admin → Control Panel | Leaders |
| `/refreshpanel` | /manager → Admin → Refresh Panel | Leaders |
| `/eapanel` | /manager → Admin → EA Panel | Leaders |
| `/brand` | /manager → Admin → Brand | Leaders |
| `/brand` | /manager → Admin → Bot Avatar | Leaders |
| `/brand` | /manager → Admin → Reset Brand | Leaders |
| `/twitchsetup` | /manager → Admin → Twitch Alert | Leaders |
| `/twitchremove` | /manager → Admin → Remove Twitch | Leaders |
| `/twitchlist` | /manager → Admin → Twitch List | Leaders |
| `/pendingwins` | /manager → Admin → Pending Wins | Leaders |
| `/verifywin` | /manager → Admin → Verify a Win | Leaders |

The bot also calls Supabase Edge Functions. Use this list to confirm coverage (including spot availability/preference flows) and find the entry points in code.

## Manager Hub (`public/spotbot/manager-hub.cjs`)
- **/manager**: posts and pins the hub. Buttons: Call Session (posts an In / Late / Out roll call stored as an availability event), Team Sheet (latest lineup with Announce Lineup), Sync Matches (pulls EA matches and refreshes the hub), Club Stats (with a Goals / Assists / Ratings / Form leaderboard picker) and Tactical Insights.
- **/insights**: duo and trio chemistry, formation win rates, win vs. loss gaps and takeaways for your club.
- **/clubstats**: with no action, shows the club stats card; the enable / disable / status actions still manage EA monitoring.

## Help, club views and EA linking (`public/spotbot/club-stats.cjs`)
- **/help**: TeamSheet-style help: one short page per area (Getting started with the 3-step setup, Events & availability, Match night, Roster & players, Club & stats, Squad & recruiting, Setup & admin, Stats explained), switched with a picker. Each page lists commands with one line each. Replaces `/spothelp`; the panel Help buttons open it too.
- **/clubstats action:Members | Top players | In form | Recent matches [stat]**: built from saved matches, no EA call. Members lists everyone who has played with GP, G, A and rating, marking who is linked to Discord. Top players ranks by the chosen `stat` (averages need 3+ games). In form ranks average rating over the last 10 matches.
- **/linkea username**: autocompletes from the club's saved matches and EA's member list (searchable, so no 25-option cap), saves EA's exact spelling, refuses a name another member holds (a manager moves it with `/forcelink`), and folds in stats saved before linking.
- **/setclub**: with no exact name match, shows a picker of what EA found instead of linking the first lookalike; with nothing found, explains that EA only lists a club after its first FC27 league match. EA outages are reported as such.
- Insights math is shared with the web Insights page: `public/spotbot/club-insights.cjs` is generated from `src/lib/clubInsights.ts` with `npm run build:bot-lib`.

## Squads and club leaders (`public/spotbot/squads.cjs`)
- **/squad link team:<name>**: links the club for your voice channel (or the current club) to a squad from the Teams table, creating it if needed. That squad's lineups feed the hub's Team Sheet and `/teamsheet`.
- **/squad captain user** (server admins) and **/squad manager user** (admins or the captain, toggles): name the club's leaders. Once a club has named leaders, only they and server admins can run its hub actions, `/teamsheet`, `/syncclub` and `/lfg`, and only they (or web admins) can publish its lineups from the web. Clubs with nobody named keep the old rule: any manager role.
- **/squad info**: shows the link and leaders.
- **/lfg [when] [note]**: posts a "looking for a friendly" card. A leader of another club on the server presses Accept (from their club's voice channel) and both contacts are pinged.

## Setup and branding (`public/spotbot/club-setup.cjs`)
- **/setup**: a checklist (EA club, squad, roster, timezone, first event) with the one next command to run, plus permission diagnostics: server permissions (Manage Roles, Mention roles, Change Nickname), whether the bot's role sits below the position roles, commands an admin turned off in Server Settings → Integrations (and admin-only ones), linked clubs whose match recaps have no channel, and the channel permissions the bot is missing in this channel and every channel it has posted events or lineups in. When the bot joins a server it posts a short welcome pointing at `/setup`.
- **/brand** (server admins): `color` (hex), `footer`, `lineup_title` (`{team}` is replaced), `logo_url` (crest on team sheets), `nickname` and `avatar` (the bot's name and picture in this server only), `reset`. Colours and footer apply to event boards and team sheets; a preview is shown.

## Events and availability (`public/spotbot/events.cjs`)
- **/event new when:"thu 9pm"**: posts an event board with Available / Maybe / Can't make it buttons. The board updates live and names who is in, maybe and out, who on the roster has not answered, and who is injured or away. Options: `title`, `type` (League match, Friendly, Scrim, Training, Tryout, Tournament), `preset`, `deadline` ("2h" before kick-off or a time like "wed 6pm"; default 1h before), `repeat` (weekly or every 2 weeks), `ping` role, `channel`, `positions` (players pick up to 3 positions when they sign up; on by default for tryouts), `club`, `description`.
- Times are read in the server timezone (`/event timezone`). Accepted: "thu 9pm", "tomorrow 20:00", "tonight", "in 2h", "2026-10-08 21:00", or a Discord `<t:...>` timestamp. Everyone sees times in their own timezone. Also "21/09/26 1800", "21 sep 8pm" and "1800 tomorrow": numeric dates are day-first unless the server timezone is in the Americas. The `when` box previews how the text is read while you type.
- **Reminders**: before the deadline the bot DMs everyone who has not answered (with the same buttons), and pings anyone with DMs closed under the board. Managers can nudge early with the board's Remind button or `/event remind`.
- **Recurring**: `repeat` creates a series; the bot posts each next event a day after the previous kick-off. `/event series list` and `/event series stop`.
- **Presets**: `/event preset save` (title, type, usual day and time, deadline, ping role, channel, position sign-up), `/event preset list`, `/event preset delete`, then `/event new preset:<name>`. Up to 25 per server.
- **/event list** shows upcoming events with counts and links; the hub's Events button shows the same. **/event cancel** cancels and pings everyone who said they could play.
- **Leader tools**: **/event edit event [when] [title] [deadline] [description]** updates the board in place (moving kick-off keeps the deadline gap, resets reminders, and pings everyone who said they could play); **/event close** / **/event reopen** stop or restart answers (the lock is kept on the club in guild_settings.clubs[].locked_events); **/event post event [channel]** re-posts the board and removes the old one; **/event mark event user answer [position]** sets or clears a player's answer.
- **/available**: your next five events with your answers and buttons, in one place.
- Events close automatically after kick-off plus their duration.

## Match night (`public/spotbot/matchnight.cjs`)
- **Check-in** opens automatically 30 minutes before kick-off, under the event board. It pings the starting XI (the lineup saved for the event, else the club's latest lineup from the last day, else everyone who said yes or maybe) and shows a live squad status: Checked in, Running late, Dropped out, and Not checked in yet, each with their lineup position.
- **/checkin**: managers open check-in early; players check themselves in.
- **Subs**: a starter who taps Can't make it on the check-in triggers a sub request for their position. Managers use the check-in's Request sub button (pick who to replace or a position) or **/sub [position] [replacing] [note]**. The request pings the bench, players who said yes or maybe but aren't starting, and anyone who plays that position (its `/positionpanel` role or a top-three preference), never starters or anyone who said no, at most 25 (else the event's ping role). The first to tap I can cover gets the spot, is swapped into the lineup (the published team sheet edits in place), checked in, and pointed at the club voice channel and the event's details; a second tap is told it's covered.
- **Reliability**: when an event with a check-in closes, attendance is recorded and show-up rates are recomputed over the last 20 events. Only a firm "Available" counts as a promise, and dropping out on the check-in counts as notice, not a no-show. **/reliability [player]** lists the rates, and the event board flags players under 75% (after 3 events).

## Autopilot (`public/spotbot/autopilot.cjs`)
Jobs the bot runs by itself for each club, all on by default. **/autopilot** (or the hub's Autopilot button) shows them, switches each one off or on, picks the channel for recaps and the digest (default: the club's stats channel, else where its events are posted) and previews the digest. Settings live on the club in `guild_settings.clubs` (`autopilot`).
- **Voice check-ins**: from 30 minutes before kick-off until the event ends, anyone in the club's linked voice channel (`/vcspots`) is checked in, and the check-in post updates.
- **Auto team sheet**: 10 minutes before kick-off, if no lineup is saved for the event, the bot drafts one from who is in voice (plus anyone checked in by button): the formation the club wins most with (3+ tracked games, else its last one), positions from sign-ups and preferences, ratings, and a nudge for the club's best duos. It saves the lineup against the event and posts it under the check-in, pinging the squad's captain and managers (else the event's creator), with **Publish** (posts the team sheet and pings the XI) and **Tweak** (redraft in another formation, or open the Lineup Builder).
- **Match recaps**: when a finished match lands in `club_matches` (from the scheduled EA sync or the bot's own monitor), the bot posts a recap: result banner and crest, goals, assists, Man of the Match, a talking point (hat-trick, a duo's goal contributions, first clean sheet in a while, streaks) and form. Matches older than 3 hours (history backfills) are skipped. No extra EA polling: it reads what the sync already saved.
- **Auto sub requests**: from 10 minutes before kick-off until the end, a starter who leaves the voice channel and isn't back within 3 minutes gets a sub request for their position, as above.
- **Monday digest**: Monday from 10:00 in the server's timezone: the week's record and form, formation win rates (best and weakest), best duos and trio, players with 90%+ show-up rates and anyone who said yes and didn't show this week.
- **Session recap**: a session opens when the club's linked voice channel gets its first player and closes once it has been empty for 15 minutes (so the last EA match has time to sync). The bot then posts every match played in between (from 5 minutes before the channel filled), the record and goals, and each player sorted by average rating with games played and only their non-zero stats (goals, shots, assists, passes, tackles, interceptions, saves, MOTM). EA's 3.0 "left early" ratings are left out of averages. Free.
- Premium jobs (⭐, see below) appear here too and only run on Premium servers: **Matchday graphics**, **Big moments**, **Stat trophies**, **Assistant coach**.

## GafferBot Premium (`premium.cjs` and the modules below)
**For now every server gets Premium free.** The checks below only apply once the bot runs with `PREMIUM_PAYWALL=on`. Then a server has Premium when the bot owner switched it on (**/premium on [server_id] [note]**, **/premium off**; owners are the Discord user ids in `BOT_OWNER_IDS`, stored in `premium_servers`), its id is in `PREMIUM_GUILDS`, or it holds an active Discord App Subscription for `DISCORD_PREMIUM_SKU_ID` (Discord handles billing and ties it to the server, so there is no email matching). **/premium status** shows what is included; premium commands on other servers answer with the same list and, when a SKU is set, Discord's Subscribe button. All premium commands live under **/premium** (plus **/scout opponent**) to stay under Discord's 100-command limit.
- **Matchday graphics** (`graphics.cjs`, `broadcast.cjs`): every autopilot match recap gets a 1600×900 image: crests (the server's /brand logo; EA's crest for the opponent, initials when it can't be fetched), score, result, Man of the Match with their Discord avatar, match details and a player table (rating, goals, assists, shots, passes, tackles, saves). **/premium cards [period] [player] [club] [post]**: FUT-style cards from synced matches (OVR is EA's pro overall when the members endpoint returns one, otherwise derived from average match rating and labelled so; badges Sniper, Playmaker, Wall, Safe Hands, Metronome, Star Man; In Form when the last 5 ratings average over 8.5), also posted on the 1st of each month from 18:00. **/premium totw [post]**: Team of the Week (4-3-3 by best average rating, 2+ games in 7 days, across every club in the server), also posted Sunday from 20:00. Images are SVG rendered with resvg; fonts are in `assets/fonts` (SIL OFL).
- **Opponent dossier** (`dossier.cjs`): **/scout opponent club [platform]** reads up to 20 of their latest league and playoff matches from EA (friendlies if there are almost none): record and goals, inferred shape (humans per line in games with 10+ humans, else the average humans per line), danger man (goals and assists per game, share of the team's shots, conversion), supply line, keeper save percentage, weakest regular defender, team passing, tackling and conversion, clean sheets, and a short game plan. EA publishes no formations, event times or shot locations, so the dossier says nothing about when goals happen or how they change shape when trailing.
- **Streamer kit** (`stream-kit.cjs`, `supabase/functions/stream-overlay`, web route `/overlay/:token`): **/premium overlay [club] [new_link]** gives leaders an OBS browser-source link with the latest team sheet on a transparent mini pitch, tonight's average rating, goals and assists per player, and the session score, refreshed every 30 seconds. **Big moments**: hat-tricks, 4+ goal hauls, perfect 10 ratings, wins by 5+ and every 5th straight win get a post in the recap channel, with buttons for anyone in the server live on Twitch (`/twitchsetup`; a live flag older than 6 hours is ignored); the newest moment is pinned and the previous one unpinned.
- **Stat trophies** (`stat-roles.cjs`): roles the bot creates and moves after every synced match: 👑 Club Legend (50+ games, EA's count or synced), ⚽ Golden Boot and 🎯 Playmaker (last 30 days), 🧤 Golden Glove (clean sheets, keepers first), 🔥 In-Form (last 5 ratings average over 8.5). Ties share. Players need `/linkea`. Changes are announced. **/premium trophies [club] [refresh]** shows holders; leaders can refresh. Needs Manage Roles and the bot's role above the trophy roles.
- **Assistant coach** (`coach.cjs`): added to the session recap, or on demand with **/premium coach [club]** for the latest session: pairings whose team pass completion drops when they play together (and pairings that click), late games of the night vs early ones (tonight and across past nights; EA has no match minutes), player of the night, who faded, and early exits. The findings are computed by the bot; OpenAI (`OPENAI_API_KEY`) only rewrites them in a coach's voice, and without it the findings are posted as bullets.

## Roster (`public/spotbot/roster.cjs`)
- **/roster add user [position] [secondary] [role] [status]**, **/roster remove user**, **/roster status user status [note]** (Active, Trial, Injured, Away, Inactive; injured, away and inactive players are not chased for availability).
- **/roster remove user** now sets the player Inactive (off boards and reminders, history kept); `delete:True` removes them. **/roster player user** (leaders, private): roster status, positions and role, EA stats from the last 50 club matches, and their answers to recent events.
- **/roster import role**: adds everyone with a role; position roles (from `/positionpanel`) fill in their positions.
- **/roster view [by] [position]**: the roster grouped by position (main players and cover), by status, or filtered to one position. Players without a roster position fall back to their `/myprefs` or position roles. The footer flags key positions nobody covers.
- The roster belongs to the club's squad (`/squad link`); one named after the club is created on first use.

## Recruitment: free agents (`public/spotbot/recruitment.cjs`)
- **/fa status [position] [secondary] [timezone] [platform] [notes] [gamertag]**: a player lists themselves in the free agent pool shared by every server GafferBot is in (works in DMs too). Strictly opt-in: listings show positions, timezone, platform, notes, the EA gamertag (✅ when it matches the account linked with `/linkea`) and GafferBot match stats, never the Discord name. Listings drop out of search after 30 days unless refreshed; `status:Remove my listing` takes one down.
- **/recruit search position [min_rating] [timezone] [platform]** (managers): the best 10 matches, main position first, then second and nearby positions. Timezone matches an hour either side. Players already on one of this server's rosters are left out.
- **Reach Out** (the menu under search results, the watchlist, or a scouting alert): the manager adds an optional message and the bot DMs the player with Interested / Not right now / Stop all contact. Interested sends the player a one-use 7-day invite and only then tells the manager who they are. Stop all contact takes the listing down and blocks further reach-outs. One reach-out per server per player per 7 days, and 15 per server per day.
- **/recruit setup [channel] [invite_channel] [alerts] [min_rating] [trialist_role]**: where scouting alerts and reach-out replies go (without a channel, replies are DMed to the manager), which channel invites open on, and the alert threshold.

## GafferBot Network (`public/spotbot/network.cjs`)
- Servers that opt in can see each other's clubs; replacement requests, friendly invites and hosted BYOTs build on it. Every server starts off the network.
- **/network setup enabled [channel] [show_server_name] [region]** (server admins): join or leave. The channel is where requests from other servers land. Other servers see club name, platform, EA division, skill rating, record and region, plus the server's name only with `show_server_name`. Only clubs linked to EA are listed. Leaving hides the clubs at once.
- **/network clubs [platform] [region]** (anyone on a listed server): the other listed clubs, top 15 by skill rating, with a menu to report or block a server.
- **/network need position when [note] [reach]** (club leaders, listed servers): asks for a replacement. The bot DMs up to 10 listed free agents for that position and platform (each player gets at most 3 of these a day, with Stop all contact), and unless `reach` is free agents only, posts a card with **I can play** in up to 25 other network servers' channels. Volunteers land in your network channel (or your DMs) with Accept / Pass; Accept DMs the player the club, kick-off, the manager's name and a one-use 24-hour invite, tells everyone else it's filled and closes the cards everywhere. Requests close 30 minutes after kick-off. 10 requests per server per day.
- **/network leaderboard [view] [platform] [region]** (anyone on a listed server): every listed club ranked by EA skill rating, with division, this season's record and "vs network" (this season's W-D-L against other network clubs from synced matches). Your clubs are starred and shown even outside the top 20. `view:Servers` rolls clubs up per server and only names servers that show their name.
- **/network status** (managers): this server's settings and the servers it blocked, with an Unblock menu.
- Blocking hides both servers from each other and is silent. Reports (5 per server per day) go to `NETWORK_REPORTS_CHANNEL_ID`, or the bot owners' DMs when it's unset. **/network suspend server_id [reason]** (bot owners) takes a server off the network; no reason lifts it. `NETWORK=off` switches the whole network off. Text typed into network requests has links, invites and mentions stripped and blocked words masked (`NETWORK_BLOCKED_WORDS` adds words).

## Recruitment: scouting (`public/spotbot/scouting.cjs`)
- **Recruitment Alerts**: after each synced match (whichever sync stored it), the bot reads the opponent's box score and posts up to two alerts to the recruitment channel for players rated at or above the threshold (default 8.0), with 90%+ passing (15+ attempts), 5+ tackles or a hat-trick. Buttons: Scout Player (their club stats and games against you), Add to Watchlist, and Reach Out when they're a listed free agent. Only matches from the last 6 hours are scanned, so a restart never floods old alerts.
- **/scout opponent** is the Premium dossier (see GafferBot Premium).
- **/scout watchlist**, **/scout add gamertag [position] [note]**, **/scout remove gamertag** (managers): up to 100 watched players per server, with listed free agents first and a Reach Out menu.
- Watched players ping the server (recruitment channel, else a DM to whoever added them) when they list as a free agent or appear for a new club in any synced match, at most once a day each.

## Recruitment: trials (`public/spotbot/trials.cjs`)
- **/apply** (or the **Apply to trial** button from **/recruit applypanel [channel]**, e.g. in #welcome): a form for EA gamertag, platform, up to 3 positions and notes. The player joins the roster as Trial, gets the trialist role (`/recruit setup trialist_role:`), and the recruitment channel gets a New trialist card with the decision buttons.
- **Tryout invites**: every upcoming `/event new type:Tryout` DMs the club's trialists once, with a link to the board. Trialists are on the roster, so they also show on the board and in Fill from Availability.
- **Report cards**: 45 minutes after a tryout closes (so the EA sync has caught up), each trialist who signed up or played gets a private report in the recruitment channel (else a DM to the event's creator): games and W/D/L, average rating, G/A, passing, tackles, MOTM, and chemistry (how the club's defenders and midfielders rated alongside them vs. their usual over the last 30 matches, and the win rate vs. the club's usual). Stats are matched by the gamertag they applied with. Buttons: **Promote to Active Roster** (roster Active, trialist role removed, player DMed), **Schedule 2nd Trial** (player told, invited to the next tryout) and **Release** (off the roster, role removed, player thanked and pointed at `/fa`). Players set to Trial with `/roster status` get reports too, using their `/linkea` gamertag.

## Recruitment: posters, resumes and gaps (`public/spotbot/recruit-cards.cjs`)
- **/recruit gaps** (managers): the positional gap radar. For GK, CB, full-back, CDM, CM/CAM, winger and striker it counts active roster players (second positions count half), weights them by check-in reliability, and flags areas that can't field a side reliably or have no cover, with a suggested number to recruit and any trialists there. It also shows under **/roster view**, and its button searches free agents for the worst gap.
- **/recruit post [positions] [notes] [channel]**: a branded poster (crest and colour from `/brand`, division, record, form, match nights from your event series, the positions you're trialling, which default to your gaps) with a reusable invite, plus a plain-text copy to paste in league Discords or Reddit.
- **/lfc card [private]**: a player's resume from their last 100 synced EA matches across every GafferBot server (goals and assists per game, average match rating, defensive actions per game, pass completion, MOTM, clean sheets for keepers) with a verification code. **/lfc verify code** shows the numbers a code was issued with, so a doctored screenshot can be caught.

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
- **announce-lineup** (`supabase/functions/announce-lineup/index.ts`): posts a saved lineup to a Discord channel (web Save & Announce, bot `/teamsheet`). Re-publishing a squad's lineup (same event, or within a day, same channel) edits the earlier team sheet and replies with who came in, dropped out or moved, pinging only them. A sub filled from a check-in updates the published sheet the same way. Uses the server's `/brand` colour, footer, title and crest, and shows the event's kick-off when the lineup is saved for an event.
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
