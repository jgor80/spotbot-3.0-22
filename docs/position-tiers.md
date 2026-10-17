# Position tiers

Every player has three tiers of positions per server, stored in `player_positions`
(one row per `guild_id` + `discord_user_id`):

| Tier | Column | How many | Discord role | Meaning |
| --- | --- | --- | --- | --- |
| Comp position (primary) | `primary_position` | 1 | Main role, e.g. `ST` (hoisted, coloured by line when the bot creates it) | The position they play in competitive matches |
| Plays well (secondary) | `secondary_positions text[]` | up to 3 | Quiet role, e.g. `ST (2nd)` (no colour, not hoisted, not mentionable, below the main roles) | Positions they play well |
| Emergency | `emergency_positions text[]` | up to 3 | None | Positions they can fill in a pinch |

No position appears in more than one tier. Codes are the usual 15: GK LB CB RB LWB RWB CDM CM CAM LM RM LW RW CF ST
(the pickers and roles use the 12 without LWB, RWB, CF).

## Reading it

- Bot: `positionTiers.load(guildId, userId)`, `loadMany(guildId, ids)` (Map of id → tiers) and
  `covering(guildId, pos)` (`{ primary: [ids], secondary: [ids], emergency: [ids] }`) from
  `public/spotbot/position-tiers.cjs`; tiers are `{ primary, secondary: [], emergency: [] }`.
  `tierOf(tiers, pos)` returns `'primary' | 'secondary' | 'emergency' | null`.
- Web: `get-player-profile` returns `player.position_tiers` with the same shape (`PositionTiers` in `src/types/player.ts`).
- Lineup building should try the comp position first, then players who play it well, then emergency cover.

## Kept in step

- `team_rosters.primary_position` / `secondary_position` mirror the primary and first secondary for
  every club roster the player is on in that server, so lineups and team sheets keep working.
- A live free agent listing (`free_agents.position`, `secondary_positions`, `emergency_positions`)
  follows the player's latest tiers.
- Members holding position roles from before tiers are folded in at startup and whenever they gain a
  position role (empty primary takes the first main role; others become secondaries; nothing is removed).

## Where players and managers set them

- `/me → My Positions` (also on the web Control Room) and the Positions Panel (`/manager → Lineups & Spots`):
  position buttons, the one picker everywhere. The pickable positions are the ones GafferBot's top
  formations use: ST, LW, RW, CAM, CM, LM, RM, LB, CB, RB, GK (rows of 5 at most, Discord's limit).
  On the shared panel a tap sets your comp position and opens your own editor; in the editor the top
  row picks the tier (Comp position, Plays well, Emergency) and each tap toggles a position, coloured
  green (comp), blue (plays well) or red (emergency). Old panels with dropdowns still work and turn
  into the button panel when used.
- Older positions read as their nearest pick everywhere (`LEGACY_POSITIONS`: CDM → CM, LWB → LB,
  RWB → RB, CF → ST), so saved tiers, old roles and old panels keep working; a CM fits a CDM spot in
  lineups and spot auto-assign. Old position roles come off when the player's tiers are next saved.
- `/manager → Roster & Squad → Add Player`: position, secondary and emergency each add to the player's tiers.
- Voice spot auto-assign, the position board and drafts read the same tiers (comp, then played well,
  then emergency); players who never set tiers fall back to their position roles and older ranked
  picks. Spot Preferences, the Prefs Panel and Positions From Roles all open or fill these tiers.
- Event sign-ups with positions use the same buttons, pre-picked from the player's tiers.
