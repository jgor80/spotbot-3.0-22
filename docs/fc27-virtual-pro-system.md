# EA FC 27 Clubs: how the Virtual Pro system works

What the Build lab (`/build`) replicates, and how sure we are of each part. The data lives in
`src/lib/proClubsData.ts`; the rules that use it are in `src/lib/proBuild.ts`.

EA doesn't publish AP prices, starting values or unlock thresholds. The numbers below come from
community measurements (Pro Clubs HQ's AP cost and requirement guides, PRO11's archetype tables), all
for FC 27 Season 2 (from the 22 October 2026 update), cross-checked against each other. EA's own
archetype notes (19 October 2026) confirm the 13 archetypes, the reset, and that each archetype prices
each attribute differently.

## Confirmed (sources agree, worked examples reproduce)

| Part | How it works |
| --- | --- |
| Archetypes | 13: Shot Stopper, Sweeper Keeper, Progressor, Boss, Marauder, Disruptor, Recycler, Maestro, Creator, Spark, Magician, Finisher, Target. Each has its own starting value for all 34 attributes (keepers have 5 GK attributes, outfielders can't train them). |
| Level and AP | Level cap 55. AP is a fixed chart by level: 100 at level 1, 224 at 10, 397 at 20, 962 at 40, 1,419 at 55. Big jumps land on every 5th level. |
| AP prices | Each attribute sits on one of 4 price tiers for each archetype (cheapest to most expensive). A point's cost depends on the value you take it to: 1-2 AP up to 60, rising to 35-50 AP for the 99th point. So the last few points of an attribute cost as much as the first twenty. Example: 75→90 Crossing is 92 AP on a Marauder but 194 AP (from 45) on a Boss. |
| Height and weight | Each archetype has its own range and default body. Every 4 cm from the default moves Jumping, Sprint Speed and Strength up and Acceleration, Agility and Balance down by 1 (the other way when shorter). Every 8 kg moves Balance, Jumping and Strength up and Acceleration, Agility and Sprint Speed down. Keepers have their own list (Diving, Reflexes, Handling). This applies in matches only; the menu shows trained values. |
| AcceleRATE | 182 cm and under can be Explosive; 183 cm and over is Lengthy (Controlled at any height). |
| PlayStyles | 36 (30 outfield, 6 keeper). Each unlocks when its 2-3 attributes reach set values (for example Finesse Shot: Curve 80, Finishing 80, Shot Power 75). Regular slots open at levels 5, 15, 40 and 55 (4 at the cap). |
| Signatures | Each archetype has 2 Signature PlayStyles that come free and don't use a slot. The first becomes PlayStyle+ at level 20, the second at level 55. |
| Signature Perks | One at level 10, a second (archetype-specific, triggered by a game situation) at level 45. |
| Masteries | Levelling an archetype gives +1 to a pair of attributes at level 10, then +1 to the second at 30 and +1 to the first at 55. |
| Specializations | 3 per archetype (39). Reach the first attribute at 92 and the other two at 90 to unlock one; it swaps a Signature for its PlayStyle+. One active at a time. The planner reproduces all 39 published AP costs from a fresh build (cheapest Finisher+ 308 AP, dearest Anchor 618 AP). |
| Attribute caps | Confirmed caps below 99 are used (for example Boss Acceleration and Sprint Speed 90, Target Jumping 96, Finisher Standing Tackle 75). |

## Not confirmed (the page says so)

- Maximum values for most attributes: anything without a confirmed cap is treated as 99.
- Keeper PlayStyle requirements: FC 26 values are used.
- How skill moves and weak foot stars are set in FC 27: the stars are cosmetic on the card.
- AP prices for keepers' Long Shots and Volleys.
- Four Specializations have a requirement that is reported by players only or missing (Joker, Invader: third attribute unknown; Hunter, Runner: one target reported by players). They are marked on the card.
- Whether Amps can give a PlayStyle+ is disputed; the planner doesn't model Amps.

## How the planner uses it

- The AP budget comes from the level (no more typing it in). The page shows AP spent, AP left and the
  lowest level that pays for the build.
- Each attribute shows its starting value, trained value, cap, price tier, the AP for the next point and
  the in-match value after body effects.
- Locked PlayStyles and Specializations show what they need and an "unlock for N AP" button that raises
  just the attributes needed (mastery points count).
- Share links (`gb2` codes) store attributes as points above the archetype's starting value; old `gb1`
  links still open. Pro Clubs Builder links import the same way.

When EA changes prices, edit `COST_TIERS` / `COST_BANDS` (and the other tables) in
`src/lib/proClubsData.ts`; `supabase/functions/_shared/pro-build.test.ts` checks the worked examples and
the 39 Specialization costs.
