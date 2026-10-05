# Discord Command Coverage

This project exposes Discord-facing commands through Supabase Edge Functions. Use this list to confirm coverage (including spot availability/preference flows) and find the entry points in code.

## Availability & "Spot" management
- **spotpanel** (`public/spotbot/index.cjs`): creates the SquadIQ control panel for managing club spots from Discord.
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
