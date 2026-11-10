// SBC Solver: requirement text, EA's requirement capture, team rating, the solver and the "worth it?" verdict.
import { checkSquad, formationFromEa, fromEa, parseRequirementLine, parseRequirements, rarityOf, solveMany, solveSbc, teamRating, worthIt, type SbcCard } from "./sbc.ts";
import { activeRules } from "./service.ts";
import { futMemoryDb, seededRules } from "./test-db.ts";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

Deno.test("team rating: average plus excess, rounded down", () => {
  eq(teamRating(Array(11).fill(84)), 84, "eleven 84s");
  eq(teamRating([...Array(10).fill(83), 90]), 84, "one 90 lifts ten 83s to 84");
  eq(teamRating([...Array(10).fill(83), 86]), 83, "one 86 is not enough");
});

Deno.test("requirement text from EA, FUT.GG and FUTBIN", () => {
  eq(parseRequirementLine("Min. Team Rating: 84"), { kind: "team_rating", op: "min", value: 84 }, "team rating");
  eq(parseRequirementLine("Squad Rating: Min. 86"), { kind: "team_rating", op: "min", value: 86 }, "squad rating");
  eq(parseRequirementLine("Min. Team Chemistry: 25"), { kind: "chemistry", op: "min", value: 25 }, "chem");
  eq(parseRequirementLine("Min. 1 Players: Team of the Week"), { kind: "rarity", op: "min", value: "totw", count: 1 }, "totw");
  eq(parseRequirementLine("Rare: Min 2"), { kind: "rarity", op: "min", value: "rare", count: 2 }, "rare");
  eq(parseRequirementLine("Players from the same Club: Max. 3"), { kind: "same", of: "club", op: "max", value: 3 }, "same club");
  eq(parseRequirementLine("Leagues: Min 3"), { kind: "distinct", of: "league", op: "min", value: 3 }, "leagues");
  eq(parseRequirementLine("Countries/Regions: Max. 4"), { kind: "distinct", of: "nation", op: "max", value: 4 }, "nations");
  eq(parseRequirementLine("Min. 2 Players from: Premier League"), { kind: "from", of: "any", names: ["Premier League"], op: "min", count: 2 }, "from");
  eq(parseRequirementLine("League: LALIGA EA SPORTS OR Serie A Enilive, Min 1"), { kind: "from", of: "league", names: ["LALIGA EA SPORTS", "Serie A Enilive"], op: "min", count: 1 }, "league list");
  eq(parseRequirementLine("Player Quality: Min. Gold"), { kind: "quality", op: "min", value: "gold" }, "quality");
  eq(parseRequirementLine("Min. 3 Players: Gold"), { kind: "quality", op: "min", value: "gold", count: 3 }, "gold count");
  eq(parseRequirementLine("Min. 2 Players: 85+ OVR"), { kind: "rating", op: "min", value: 85, count: 2 }, "rated count");
  eq(parseRequirementLine("Exactly 11 Players"), { kind: "players", op: "exact", value: 11 }, "size");
  const { requirements, unread } = parseRequirements("Min. Team Rating: 84\nSomething EA invented\n\nRare: Min 2");
  eq(requirements.length, 2, "two read");
  eq(unread, ["Something EA invented"], "unread kept");
});

Deno.test("EA's captured requirements and formation codes", () => {
  const names = { leagues: new Map([[13, "Premier League"]]), nations: new Map<number, string>(), clubs: new Map<number, string>() };
  const r = fromEa([
    { type: "TEAM_RATING", scope: "GREATER", values: [84], count: -1, slot: -1 },
    { type: "LEAGUE_ID", scope: "GREATER", values: [13, 53], count: 2, slot: null },
    { type: "SAME_CLUB_COUNT", scope: "LOWER", values: [2], count: null, slot: null },
    { type: "MYSTERY", scope: null, values: [1], count: null, slot: null },
  ], names);
  eq(r.requirements, [
    { kind: "team_rating", op: "min", value: 84 },
    { kind: "from", of: "league", names: ["Premier League", "EA 53"], op: "min", count: 2 },
    { kind: "same", of: "club", op: "max", value: 2 },
  ], "mapped");
  eq(r.unread, ["MYSTERY 1"], "unknown kept");
  eq(formationFromEa("f4231"), "4-2-3-1", "f4231");
  eq(formationFromEa("f4332"), null, "unknown shape is null");
  eq(formationFromEa("f433-2"), "4-3-3 (2)", "variant");
  eq(formationFromEa("4-4-2"), "4-4-2", "ours");
});

Deno.test("rarity from version names", () => {
  eq(rarityOf({ version: "Team of the Week", is_icon: false, is_hero: false }), ["totw", "special", "rare"], "totw");
  eq(rarityOf({ version: "Special (EA rareflag 3)" }), ["totw", "special", "rare"], "club file rareflag 3");
  eq(rarityOf({ version: "Rare" }), ["rare"], "rare");
  eq(rarityOf({ version: "Common" }), ["common"], "common");
  eq(rarityOf({ version: "Icon", is_icon: true }), ["special", "rare"], "icon");
});

const POS = ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"];
let n = 0;
const card = (p: Partial<SbcCard>): SbcCard => ({
  id: `c${++n}`, name: `Player ${n}`, rating: 80, positions: ["CM"], league: "League A", nation: "Nation A", club: `Club ${n}`, version: "Rare",
  source: "owned", untradeable: true, price: 1000, ...p,
});

Deno.test("solver: uses spare and untradeable club cards before buying, and meets team rating", () => {
  n = 0;
  const pool: SbcCard[] = [
    ...Array.from({ length: 8 }, () => card({ rating: 83, source: "spare", price: 900 })),
    ...Array.from({ length: 6 }, () => card({ rating: 84, untradeable: true, price: 1500 })),
    ...Array.from({ length: 4 }, () => card({ rating: 88, untradeable: false, price: 20000 })),
    ...Array.from({ length: 20 }, (_, i) => card({ rating: 85 + (i % 3), source: "buy", untradeable: false, price: 3000 + i * 100 })),
  ];
  const r = solveSbc("4-3-3", [{ kind: "team_rating", op: "min", value: 84 }], pool, null);
  assert(r.feasible, `feasible: ${JSON.stringify(r.checks)}`);
  assert(r.team_rating >= 84, `rating ${r.team_rating}`);
  assert(r.counts.tradeable === 0, "keeps the tradeable 88s");
  assert(r.counts.spare >= 6, `uses spares first: ${JSON.stringify(r.counts)}`);
  const noBuy = solveSbc("4-3-3", [{ kind: "team_rating", op: "min", value: 87 }], pool, null, { buy: false, use_tradeables: false });
  assert(!noBuy.feasible && noBuy.buy_cost === 0, "can't reach 87 without buying or tradeables");
});

Deno.test("solver: group, rarity and chemistry rules", async () => {
  n = 0;
  const pool: SbcCard[] = [
    ...POS.map((p) => card({ positions: [p], rating: 75, league: "League B", nation: "Nation B", club: "Club B", untradeable: true, price: 400 })),
    ...POS.map((p) => card({ positions: [p], rating: 76, league: `L${p}${n}`, nation: `N${n}`, untradeable: true, price: 300 })),
    card({ positions: ["ST"], rating: 82, version: "Team of the Week", source: "buy", untradeable: false, price: 9000 }),
  ];
  const reqs = parseRequirements("Min. 1 Players: Team of the Week\nPlayers from the same League: Max. 8\nMin. Team Chemistry: 10").requirements;
  const rules = await activeRules(futMemoryDb(seededRules()));
  const r = solveSbc("4-3-3", reqs, pool, rules);
  assert(r.feasible, `feasible: ${JSON.stringify(r.checks.map((c) => [c.label, c.actual, c.ok]))}`);
  assert(r.counts.buy === 1 && r.buy_cost === 9000, "buys the one TOTW");
  const check = checkSquad("4-3-3", r.slots, reqs, rules);
  assert(check.chemistry >= 10, `chem ${check.chemistry}`);
});

Deno.test("solving a set never uses one card twice", () => {
  n = 0;
  const pool = Array.from({ length: 22 }, () => card({ rating: 80, untradeable: true }));
  const ch = { name: "x", formation: "4-4-2", requirements: [{ kind: "team_rating" as const, op: "min" as const, value: 80 }] };
  const r = solveMany([ch, { ...ch, name: "y" }], pool, null);
  assert(r.feasible, "both feasible");
  const ids = r.challenges.flatMap((c) => c.slots.map((s) => s.card!.id));
  eq(new Set(ids).size, 22, "22 different cards");
});

Deno.test("worth it", () => {
  eq(worthIt(0, { value: null, label: null }).verdict, "free", "free");
  eq(worthIt(10000, { value: 15000, label: "pack" }).verdict, "do_it", "do it");
  eq(worthIt(10000, { value: 9500, label: "pack" }).verdict, "close", "close");
  eq(worthIt(10000, { value: 2000, label: "pack" }).verdict, "skip", "skip");
  eq(worthIt(10000, { value: null, label: null }).verdict, "unknown", "unknown");
});
