# Auto-link every club member: Discord, EA gamertag, and the website

## Where things stand (PCN Palermo)
- Linked: AirDangus23, ViolentRAGNAR, LEGEND7_AC, ReppJake.
- Not linked yet: CAPOUE I 29, DEADPOND41, Glitch2daMAX, NoOneReady, Prof_Steeler-_-, urnotme79. These players show up in EA matches, but nothing yet connects them to a Discord account.

## What we'll build
1. **Bulk scan of server members (`/roster autolink`, plus a button on the manager panel)**
   - The bot reads every member of the server and compares their Discord name, nickname and display name with the unlinked gamertags from this club's matches.
   - A strong match (exact, or a very close name like "AirDangus" and "AirDangus23") links the player automatically. It also adds them to the club roster and gives them their position role.
   - A possible match sends the player a DM asking "Is this you, <gamertag>?" with a one-tap button. The manager also gets a list where they can confirm or skip each guess.
   - No match: the gamertag is posted in a manager channel with a picker, so the manager can choose the right server member in one click.
2. **Automatic nightly pass:** the same scan runs after each club sync, so new gamertags get linked without anyone typing.
3. **Linking to the website:** when someone signs in to the website with Discord, their account connects to their Discord ID automatically. Their linked gamertag, stats and clubs then appear right away, with no username to type. This replaces the current "type your Discord username" box.
4. **Safety:** a gamertag already linked to another person is never moved automatically. Managers can still move it with /forcelink. Every automatic link is logged, and the manager can undo it from the list.

## What you'll need to do
- Push to GitHub and redeploy the bot on Railway, with `BOT_PROXY_SECRET` set there.
- Run `/roster autolink` once in PCN Palermo, then confirm anything it wasn't sure about.

## Technical details
- `auto-link.cjs`: add `bulkScan(guild, { autoThreshold: 0.92, promptThreshold: 0.8 })` using `guild.members.fetch()` (needs the Server Members intent) and the existing `similarity`, `link`, `addToRosters` and `applyPositionRoles`. Results post as an embed with confirm, skip and undo buttons, plus a user-select picker for gamertags with no match.
- Run `bulkScan` from the autopilot after each sync. Keep a per-guild record of declined guesses so the same pair isn't suggested again.
- Website: check that Discord sign-in is configured. On sign-in, read the Discord ID from the user's sign-in details and save it to the account-to-Discord link table automatically, marked as verified. `useDiscordLink` then becomes read-only, with the manual username lookup kept as a fallback.
- Run the database changes through the bot gateway function (needs `BOT_PROXY_SECRET` on Railway).
