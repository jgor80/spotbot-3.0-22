# Review Panel — GafferBot — Seed test (3 known bugs)

**Purpose:** before trusting the panel on new work, run it blind on code where we already
know the bug. Judges got a snapshot from before each fix, a neutral config, and no git
history. The answer key was held back until refereeing.

| Case | Snapshot | Planted (known) bug | Fixed in |
|---|---|---|---|
| A — Audit: manage-* functions + account linking | before `ed9a35b` | Functions trust `discord_user_id` from the request body → anyone can act as a leader; public-write RLS policies | `ed9a35b` (2026-10-10) |
| B — Diff: AI image billing launch `5372fa9` | at `5372fa9` | (1) welcome images per server → farmable by making new servers; (2) a render that dies mid-way leaves its reservation unrefunded forever | `11daef3` (2026-10-19) |
| C — Audit: EA stats sync records | before `a63ad36` | EA's member list sends only a win rate, so draws were stored as games played (0W/40D/0%); club W/D/L read from the wrong EA object | `a63ad36` (2026-10-17) |

Mode: Standard+ (four judges per case, independent subagents in parallel; maintainer
skipped on A/B and security skipped on C to limit cost). Same model for all judges.

## Results

| Case | Planted bug caught? | Panel score | Verdict | Extra real bugs found |
|---|---|---|---|---|
| A | **Yes, 4/4 judges, Critical.** Public-write RLS also caught (security, skeptic, advocate) | 2.0 | BLOCK | Competition claim can be approved twice (4/4) — **still live on main** |
| B | **(2) Yes** — skeptic Medium, correctness Low, advocate as a question. **(1) Missed** — security raised it only as an open question; correctness traced it and called it correct | 4.0 | BLOCK | Stale Lemon Squeezy webhook revives ended plans (3/4) — **fixed later in `d6deedc`**. Discord pack bought without a hint is never credited (3/4) — **fixed later in `d6deedc`** |
| C | **Yes, 4/4 judges, High** (correctly filed as Risk — the EA payload can't be seen from code). Club record source mix also caught (4/4) | 4.0 | FIX FIRST | Linked players' stats can split onto an `ea_` placeholder (4/4) — **still live**. SquadIQ Player Profile always shows 0 games / 0% (1/4) — **still live** |

**Catch rate on planted bugs: 3 of 4** (A, B-2, C; missed B-1 welcome farming).
**Bonus:** 2 real bugs you later found and fixed yourself, plus 3 still live on main today.
**Confirmed false alarms: 0.** Several findings remain unverified (listed in the ledger as `open`).

## Referee rulings (summary)

### Case A — BLOCK
1. KEEP **Critical** — manage-roster/teams/scouting/link-suggestions/claims trust body
   `discord_user_id` (all four judges; merged).
2. KEEP **Critical** — manage-guild-settings skips the role check when the ID is omitted (4/4).
3. KEEP **Critical** — link-ea-account lets any signed-in user link any Discord ID (4/4;
   advocate rated High; upgraded — irreversible cross-server stat moves).
4. KEEP **High** — public-write RLS policies on profiles, scouting_lists, link_suggestions (3/4).
5. KEEP **High** — Teams page create/delete always 400s (3/4). Fixed by the same commit (ID now resolved server-side).
6. KEEP **Medium** — competition claim can be approved twice (4/4). **Live on main.**
7. KEEP **Medium** — link-ea-account temp-profile move ignores errors, single guild (2/4).

### Case B — BLOCK
1. KEEP **High** — Discord pack with no in-memory hint is charged and never credited (3/4).
   Confirmed real: fixed in `d6deedc` with `billing_buy_hints`.
2. KEEP **Medium** — stale Lemon Squeezy `subscription_updated` reactivates an ended plan
   with no end date (3/4). Confirmed real: fixed in `d6deedc` (`source_updated_at`,
   renews_at + 3 days — the security judge's exact recommendation).
3. KEEP **Medium** — website lets a subscribed server start a second subscription (3/4).
   Unverified; no later fix found.
4. KEEP **Medium** (planted) — reservation stranded by a killed render is never refunded
   (skeptic Medium; correctness Low → upgraded to Medium; money path).
5. **Missed (planted)** — welcome images granted per server → farmable. Security listed it as
   an open question with the full abuse path; it should have been a Risk finding.

**Disagreement:** advocate accepted "a missed expiry webhook leaves a plan on — fails in the
customer's favour" as a tradeoff; security, skeptic and correctness filed it as a finding.
Referee sided with the finding (confirmed real). Advocate tuned — see below.

### Case C — FIX FIRST
1. KEEP **High (Risk)** — player W/D/L read from fields EA doesn't send; stored as all draws,
   0% (4/4). Confirmed real: `a63ad36`.
2. KEEP **Medium** — club W/D/L from `seasonalStats` vs goals from `overallStats`; disagrees
   with Team Stats (4/4). Confirmed real: same fix.
3. KEEP **High** — placeholder ID formats differ and the sync's unordered `ilike` can keep
   writing a linked player's stats to the placeholder (4/4). **Live on main.**
4. KEEP **Medium** — two writers (bot local sync vs cloud sync) for the club record (2/4).
5. KEEP **Medium** — one failed EA call zeroes the stored club record (2/4). Unverified.
6. KEEP **Medium** — SquadIQ reads `data.profile` but the function returns `data.player`
   (1/4). **Live on main.**

## Coverage gaps
- Validation commands not run (snapshots were exported without dependencies).
- One model for all judges; no model diversity.
- Maintainer judge not run on A/B; security not run on C.
- "Unverified" findings depend on runtime data (EA payloads, Lemon Squeezy retry order).

## Tuning applied after this test
See `calibration` notes in the panel package: security now checks free-grant farming and
files any concrete abuse path as a Risk; the rubric bars burying a concrete scenario in an
open question; the advocate no longer accepts fail-open money paths as a tradeoff.
