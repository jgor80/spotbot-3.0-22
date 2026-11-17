# EA FC 27 Clubs: how the Virtual Pro system works

What the Build lab (`/build`) replicates, and how sure we are of each part. The data lives in
`src/lib/proClubsData.ts`; the rules that use it are in `src/lib/proBuild.ts`.

EA doesn't publish AP prices, starting values or unlock thresholds. The numbers below come from
community measurements (Pro Clubs HQ's AP cost and requirement guides, PRO11's archetype tables), all
for FC 27 Season 2 (from the 22 October 2026 update), cross-checked against each other. EA's own
archetype notes (19 October 2026) confirm the 13 archetypes, the reset, and that each archetype prices
each attribute differently.

## Audit, 16 November 2026

Every table was checked again against EA's own pages and the community sources below. "Confirmed" means
EA says it or two or more community sources agree and the numbers reproduce their worked examples. "One
source" means it is published once and nothing contradicts it.

| Part | Status | Checked against |
| --- | --- | --- |
| 13 archetypes, free resets, AP reset on 22 October | Confirmed (EA) | EA Grounds deep dive; EA Archetypes Update, 19 Oct 2026 |
| Level cap 55 and AP at every level (100 at 1, 224 at 10, 397 at 20, 962 at 40, 1,419 at 55) | Confirmed | Pro Clubs HQ level rewards, Pro Clubs Builder AP table: all 55 levels identical. Levels 41-55 are read in game by Pro Clubs HQ only |
| AP price bands (1-2 AP up to 60, 35-50 AP for the 99th point) | Confirmed | Pro Clubs HQ and Pro Clubs Builder publish the same 15 bands |
| Price tier of every attribute on every archetype (387 values) | Confirmed | Matches Pro Clubs HQ's data exactly, and every attribute EA lists as dearer or cheaper on 19 Oct sits where EA's note says |
| Starting value of every attribute (387 values) | Confirmed | Matches Pro Clubs HQ exactly; PRO11 re-checked them in October |
| Attribute ceilings (387 values) | Two sites agree | Pro Clubs HQ ceiling tables (PRO11 republishes them) and Pro Clubs Builder's own table: all 387 identical (checked 17 November). EA publishes none, and the two sites may share an origin. The full table reproduces every published "which archetypes can reach this PlayStyle" list |
| Skill move and weak foot stars | Two sites agree, one row disputed | Each archetype has its own starting stars and maximum, and extra stars cost AP from the same budget (Finisher: 5★ skill moves 40 AP, 5★ weak foot 85 AP). Pro Clubs Builder publishes every star's price for all 13 and Pro Clubs HQ's totals match all of them. The Target's skill moves are 48 AP (8/15/25) on both; PRO11 says 65, so 48 is used |
| Height and weight ranges and defaults | Confirmed | Pro Clubs HQ height and weight guide: all 13 identical |
| Height and weight shifts (4 cm and 8 kg steps) | Community-reported | Pro Clubs HQ says these are FC 26's shifts carried into FC 27; community measurements passed on by Jeff (17 November) say they apply to FC 27 |
| Keepers' Long Shots and Volleys prices | One source | Pro Clubs HQ's keeper price lists (Shot Stopper 20 and 20 AP to the 60 ceiling, Sweeper Keeper 15 and 20) match the planner's tiers |
| 30 outfield PlayStyle requirements | Confirmed | Pro Clubs HQ (read in FC 27) and PRO11 agree on every row. Re-checked 17 November against Pro Clubs HQ's page: all 36 thresholds, how many archetypes reach each PlayStyle and the cheapest price for each match the planner, and are now a test |
| 6 goalkeeper PlayStyle requirements | Not confirmed | FC 26 values. Pro Clubs HQ says a keeper's list hasn't been read in FC 27, PRO11 defers to it, and no other FC 27 source was found (17 November) |
| PlayStyle slots (5, 15, 40, 55), PlayStyle+ (20, 55), Signature Perks (10, 45) | Confirmed | Pro Clubs HQ ladder, PRO11 archetype pages |
| Signatures (two per archetype since 22 Oct) and level-45 perks | Confirmed | Pro Clubs HQ archetype changes, PRO11 |
| Mastery pairs | Confirmed (EA) | EA's own table in the Grounds deep dive, all 13 pairs in the same order |
| Mastery milestones (10: +1 +1, 30: +1 second, 55: +1 first) | Confirmed | EA gives the level 10 example; Pro Clubs HQ read 30 and 55 in game |
| 35 of 39 Specializations (92 / 90 / 90) and their AP costs | Confirmed | Pro Clubs HQ and PRO11 agree; the planner reproduces every published cost |
| Joker, Invader, Hunter, Runner | One community post | EA removed Attacking Positioning from Specialization requirements on 22 Oct and named no replacement. A Reddit rundown of EA's 23 October fix by the author of statifybuilder.com (passed on by Jeff, 17 November) gives Joker Curve 90, Invader Sprint Speed 90, Hunter Balance 90 and Runner Aggression 90; an EA Forums player reported the same for Hunter and Runner. The same post says Runner now gives Rapid+ (was Enforcer+) and Octopus gives Footwork+ (was Deflector+), so no Specialization repeats its archetype's own Signature. Its Signature and Mastery tables match ours line for line. Pro Clubs HQ, Pro Clubs Builder and FCClub still list Attacking Positioning |
| AcceleRATE thresholds | Confirmed for FC 26, not restated for FC 27 | Lengthy's minimum height is 185 cm: EA set it for men's players in FC 26 Title Update 1.4.0 (January 2026, "Strength minimum 65, Strength minus Agility at least 4, Acceleration minimum 40" unchanged) and FIFAUTeam lists 185 for FC 27. EA's FC 27 notes only restate the women's height. Pro Clubs HQ and Pro Clubs Builder still show 183, the pre-patch number. The planner uses 185 since 17 November |
| Club facility boosts | Not confirmed | No source publishes FC 27 facility numbers (FCClub says the values can't be read yet), so they are typed in by hand |
| Amps | Not modelled | EA: up to three at a time, timed, attribute boosts and on the top tiers PlayStyles and PlayStyle+ |
| Levels past 55 | Estimate | FC 27 stops at 55. FC 26's AP for levels 56 to 100 (3,167 AP at 100; its first 55 levels pay exactly what FC 27's do) is used only to say "about level N" for a build that spends more than level 55 gives, and is labelled an estimate |

Mastery points do not count towards PlayStyle and Specialization targets: the planner checks the attribute you
bought, before bonuses (`MASTERY_COUNTS_FOR_UNLOCKS` in `proClubsData.ts`). That is community-reported (Jeff, 17
November) and Pro Clubs HQ prices its PlayStyles the same way; PRO11 says it hasn't confirmed it. Whether a Mastery
point can lift an attribute past its ceiling is still unknown; the planner lets it, up to 99.

Sources: EA SPORTS FC 27 The Grounds Deep Dive and The Grounds Developer Archetypes Update (ea.com);
Pro Clubs HQ guides (level rewards, AP costs, PlayStyle requirements, Masteries, Specializations, height
and weight, AcceleRATE, archetypes head to head); Pro Clubs Builder (attribute points); PRO11 (archetype
pages, Specializations); FIFAUTeam (FC 27 AcceleRATE); FCClub (club progression); Reddit rundown of EA's 23 October fix by the statifybuilder.com author (Specializations).

## A new season or a higher level cap

Everything the game decides is in `src/lib/proClubsData.ts`; pages and `proBuild.ts` read it and repeat
nothing. To move to a new cap or season:

1. Append the new levels' AP to `AP_GAINS`. `LEVEL_CAP` is the last level in that list, and the level
   slider, AP bar and "level needed" follow.
2. Add any new unlock level to `PLAYSTYLE_SLOT_LEVELS`, `SIGNATURE_PLUS_LEVELS`, `SIGNATURE_PERK_LEVELS`
   or `MASTERY_MILESTONES`. The level ladder and the Mastery wording on the page are built from these.
3. For new prices or ceilings edit `COST_TIERS`, `COST_BANDS`, `CAPS`; for stars `STARS`; for
   Specialization targets `SPECIALIZATION_TARGETS` and `SPECIALIZATIONS`.
4. Update `RULESET` (the season shown on the page) and `UNCONFIRMED_NOTES`.
5. Run `deno test supabase/functions/_shared/pro-build.test.ts`: it checks that the tables cover every
   archetype and attribute, that levels fit under the cap, and the published worked examples. Then
   `npm run build:bot-probuild` and `node scripts/build-local-functions.mjs`.

Only append to `ATTRIBUTE_KEYS`, `PLAYSTYLE_DEFS`, `SPECIALIZATIONS` and the archetype list: share codes
store positions in them.

## How the planner uses it

- **Limit to my level** (on by default, remembered per browser): on, an edit can't spend more AP than the
  level gives (`limitToLevel`). Off, a build can overspend and the page says which level it needs; past level 55
  that is an estimate from `AP_BY_LEVEL_ESTIMATE`. A build that arrives over budget turns the limit off for
  that visit so no points are cut. When EA raises the cap, append the real numbers to `AP_GAINS` and the
  estimate shrinks to whatever is still unknown.
- The AP budget comes from the level (no more typing it in). The page shows AP spent, AP left and the
  lowest level that pays for the build.
- Each attribute shows its starting value, trained value, ceiling, price tier, the AP for the next point and
  the in-match value after body effects.
- Skill move and weak foot stars start at the archetype's own stars; extra ones are priced and count in AP spent.
- Locked PlayStyles and Specializations show what they need and an "unlock for N AP" button that raises
  just the attributes needed (Mastery points don't count towards the target).
- Share links (`gb2` codes) store attributes as points above the archetype's starting value; old `gb1`
  links still open. Pro Clubs Builder links import the same way.

When EA changes prices, edit `COST_TIERS` / `COST_BANDS` (and the other tables) in
`src/lib/proClubsData.ts`; `supabase/functions/_shared/pro-build.test.ts` checks the worked examples and
the 39 Specialization costs.

## Added on top (November 2026)

- **AcceleRATE** comes from the build, using in-match values: Explosive needs 182 cm or less, Agility 65+,
  Agility at least 10 over Strength and Acceleration 80+; Lengthy needs 185 cm or more (183 and 184 cm are always Controlled),
  Strength 65+, Strength at least 4 over Agility and Acceleration 40+; everything else is Controlled
  (`ACCELERATE` in `proClubsData.ts`).
- **Masteries from other archetypes**: every archetype levelled to 10/30/55 adds its mastery to all builds.
  Levels are entered on the page, or filled from the member's saved builds (highest level per archetype).
- **Club facility boosts**: entered by hand per attribute (up to +10), in matches only, so they never unlock
  PlayStyles or Specializations. EA doesn't publish FC 27's facility numbers.
- Share codes become `gb3` only when masteries or boosts are set; `gb2`/`gb1` still open.
- **Units**: imperial by default with a metric toggle (remembered per browser); saved builds keep their units.
- **Saved builds** (`player_builds`, `player-cards` function `builds_*` actions): up to 30 per member, one marked
  "on my cards". Graphics Studio then offers a **With My Build** card (six in-match group ratings instead of
  stats) and a **My build** back of card (`public/spotbot/graphics-build-card.cjs`, using `pro-build.cjs`
  generated by `npm run build:bot-probuild`).
- **Saved once for every build**: signed-in members' masteries and facility boosts live on their account
  (`player_build_profiles`, `player-cards` action `build_profile`). `applyProfile` puts them on every build the
  page opens and on the Studio build card/back; masteries are the higher of the entered level and the member's
  saved builds, and boosts come from the account alone.
