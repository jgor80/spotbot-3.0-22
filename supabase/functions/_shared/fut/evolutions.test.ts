// Evolutions finder: pasted text, EA's captured evolutions, eligibility, the evolved card and the squad gain.
import { checkRules, evolve, fromEa, matchEvolution, parseEvolutionText, parseRuleLine, parseUpgradeLine, type EvoCard } from "./evolutions.ts";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

Deno.test("evolution requirement and upgrade lines", () => {
  eq(parseRuleLine("Overall: Max. 82"), { field: "overall", op: "max", value: 82 }, "overall");
  eq(parseRuleLine("Max. 85 Pace"), { field: "pac", op: "max", value: 85 }, "lead op");
  eq(parseRuleLine("Max OVR 84"), { field: "overall", op: "max", value: 84 }, "lead op stat number");
  eq(parseRuleLine("PlayStyles+: Max 1"), { field: "playstyles_plus", op: "max", value: 1 }, "ps+");
  eq(parseRuleLine("Position: CM, CDM"), { field: "position", op: "in", values: ["CM", "CDM"] }, "positions");
  eq(parseRuleLine("Rarity: Rare"), { field: "rarity", op: "in", values: ["Rare"] }, "rarity");
  eq(parseRuleLine("Skill Moves: Max 3"), { field: "skill_moves", op: "max", value: 3 }, "sm");
  eq(parseUpgradeLine("+3 OVR"), [{ field: "overall", add: 3 }], "+3 ovr");
  eq(parseUpgradeLine("Pace +5, Dribbling +2"), [{ field: "pac", add: 5 }, { field: "dri", add: 2 }], "two stats");
  eq(parseUpgradeLine("PlayStyle+: Finesse Shot"), [{ field: "playstyle", name: "Finesse Shot", plus: true }], "ps+");
  eq(parseUpgradeLine("New position: CAM"), [{ field: "position", name: "CAM" }], "position");
  const e = parseEvolutionText("Maestro", "Overall: Max 82\nwhatever", "Level 1\n+2 OVR\nPassing +3\nLevel 2\nPlayStyle: Incisive Pass");
  eq(e.levels.length, 2, "two levels");
  eq(e.unread, ["whatever"], "unread");
});

Deno.test("EA's evolutions map known names and keep the rest", () => {
  const e = fromEa({
    evo_id: 31, name: "Maestro", description: null, end_at: null, coins: 15000, points: null, status: null,
    requirements: [{ type: "OVR", values: [82], scope: "LOWER" }, { type: "POSITION", values: ["CM"], scope: null }, { type: "LEAGUE_ID", values: [13], scope: null }, { type: "MYSTERY", values: [1], scope: null }],
    levels: [{ upgrades: [{ type: "OVR", values: [2], scope: null }, { type: "ATTRIBUTE_PASSING", values: [3], scope: null }] }, { upgrades: [{ type: "PLAYSTYLE", values: ["Incisive Pass"], scope: null }] }],
  }, { leagues: new Map([[13, "Premier League"]]), nations: new Map(), clubs: new Map() });
  eq(e.rules, [{ field: "overall", op: "max", value: 82 }, { field: "position", op: "in", values: ["CM"] }, { field: "league", op: "in", values: ["Premier League"] }], "rules");
  eq(e.levels, [[{ field: "overall", add: 2 }, { field: "pas", add: 3 }], [{ field: "playstyle", name: "Incisive Pass", plus: false }]], "levels");
  eq(e.unread, ["MYSTERY 1"], "unread");
});

const card = (p: Partial<EvoCard>): EvoCard => ({
  id: "c", name: "Card", version: "Rare", overall: 80, positions: ["CM"], league: "Premier League", nation: "England", club: "Club",
  stats: { pac: 70, sho: 70, pas: 80, dri: 78, def: 65, phy: 72 }, skill_moves: 3, weak_foot: 3, playstyles: [], playstyles_plus: [], ...p,
});

Deno.test("eligibility, evolved card and squad gain", () => {
  const evo = parseEvolutionText("Maestro", "Overall: Max 82\nPosition: CM\nPace: Max 75", "+3 OVR\nPassing +4\nPlayStyle: Incisive Pass\nNew position: CAM");
  const yes = card({ id: "a", overall: 81 });
  const tooGood = card({ id: "b", overall: 85 });
  const unknown = card({ id: "d", overall: 79, stats: {} });
  eq(checkRules(yes, evo.rules).map((c) => c.ok), [true, true, true], "eligible");
  eq(checkRules(unknown, evo.rules).map((c) => c.ok), [true, true, null], "no pace synced");
  const after = evolve(yes, evo.levels);
  eq([after.overall, after.stats.pas, after.playstyles, after.positions], [84, 84, ["Incisive Pass"], ["CM", "CAM"]], "evolved");
  const slots = [{ slot: "CAM", position: "CAM", rating: 82, card_id: "x" }, { slot: "LCM", position: "CM", rating: 80, card_id: "y" }];
  const r = matchEvolution(evo, [tooGood, unknown, yes], slots);
  eq(r.matches.map((m) => m.card.id), ["a", "d"], "eligible first, too-good card out");
  eq(r.matches[0]!.squad, { slot: "LCM", gain: 4 }, "replaces the 80 CM");
  eq([r.eligible, r.maybe], [1, 1], "counts");
});
