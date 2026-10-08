# EA match_event_aggregate codes — verified 2026-10-08 on 49,423 player-games (31,979 with event data)

Raw FC27 match player objects contain NO interceptions or clearances fields; only goals, assists, shots, passes, tackles, saves, mom, rating.

Locked (match the official boxscore):
- 214 = goals (r 0.985, exact 99%)
- 11 = assists (r 0.965, exact 99%)
- 217 = shots (r 0.90), 13 = shots (r 0.87)
- 267 / 50 / 49 = GK saves (r 0.91 / 0.87 / 0.86, keeper-only)
- 164, 0, 121, 229 = successful tackles (r ~0.70-0.73)
- 1, 163 = tackle attempts (r 0.68 / 0.58)

Plausible, unverifiable (no ground truth; shown as estimates):
- 32 dribbles (fw 3.2 > mf 1.7 > df 0.6 per game)
- 34 carries, 176 possession gains
- 8 interceptions, 6 clearances (used historically; no EA field to confirm)

Rejected:
- 118 is NOT a second assist: 98% of the time it only appears when the same player has an assist and is <= assists. It is a sub-type of assist.
- 102 (possessions lost): appears in only 10% of games, max 26 — not a per-player turnover count.
- 61 (blocks): never occurs in FC27 data.
- OurProClub's sample totals could not be matched to any player/code combination in our data.

## Refined OurProClub mapping (current)
At the club's request we report OurProClub's mapping, refined so it never double-counts:
- `second_assists` = raw 118 (OurProClub's label). `hockey_assists` = max(118 − official assists, 0).
- `chances_created` = 118 + 35 (through balls). Take-ons = 32 won / max(3, 32) attempted.
- `possessions_won` 176, `possessions_lost` 102 (sparse), `blocks` 61 (rarely sent). Net possession = won − lost.
- Season archive: `ball_recoveries` = 176 + interceptions; `defensive_stops` = tackles + interceptions + clearances + blocks.
Code 49 stays a GK-save code and is never used for recoveries. All of these are shown with a * as estimates.
