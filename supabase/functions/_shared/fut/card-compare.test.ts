// Card compare: chem style applied, leaders, PlayStyles diff, metarating at shared positions, price per point.
import { compareTable, type CompareInput } from "./card-compare.ts";
import type { MetaCard } from "./meta.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const meta = (p: Partial<MetaCard>): MetaCard => ({ name: "X", rating: 85, positions: ["ST"], stats: { acceleration: 85, sprint_speed: 85, finishing: 85, positioning: 85, composure: 80, ball_control: 82, dribbling: 82 }, playstyles: [], playstyles_plus: [], height_cm: 182, accelerate_type: null, weak_foot: 3, skill_moves: 3, ...p });
const input = (id: string, m: Partial<MetaCard>, price: number | null, chem: string | null = null): CompareInput => ({ id, meta: meta(m), price, chem_style: chem, ea_item_id: null, version: null, owned: false });

Deno.test("compareTable: boosts, leaders, PlayStyle diff, shared positions, value and summary", () => {
  const r = compareTable([
    input("a", { name: "Pricey", rating: 88, positions: ["ST", "CF"], stats: { ...meta({}).stats, finishing: 92 }, playstyles_plus: ["Finesse Shot"], playstyles: ["Rapid"] }, 80_000),
    input("b", { name: "Budget", rating: 84, positions: ["ST", "LW"], playstyles: ["Finesse Shot", "Power Shot"] }, 20_000, "Hunter"),
  ]);
  assert(r.shared_positions.join() === "ST", JSON.stringify(r.shared_positions));
  const acc = r.rows.find((x) => x.key === "acceleration")!;
  assert(acc.values[1] === 91 && acc.leaders.join() === "1", `Hunter adds 6 pace to the budget card: ${JSON.stringify(acc)}`);
  const fin = r.rows.find((x) => x.key === "finishing")!;
  assert(fin.values[0] === 92 && fin.values[1] === 91 && fin.leaders.join() === "0", JSON.stringify(fin));
  assert(r.rows.find((x) => x.key === "weak_foot")!.leaders.length === 0, "ties have no leader");
  assert(r.shared_playstyles.join() === "Finesse Shot" && r.cards[0]!.only_this.join() === "Rapid" && r.cards[1]!.only_this.join() === "Power Shot", JSON.stringify(r.cards.map((c) => c.only_this)));
  assert(r.cards[0]!.playstyles[0] === "Finesse Shot+", "PS+ marked");
  assert(r.cards[1]!.meta!.chem_style === "Hunter" && r.cards[0]!.meta!.chem_style !== null, "chosen style kept, best style otherwise");
  assert(r.cards[0]!.price_per_rating === 909 && r.cards[1]!.price_per_rating === 238, JSON.stringify(r.cards.map((c) => c.price_per_rating)));
  assert(/plays best at ST/.test(r.summary) && /75% cheaper/.test(r.summary), r.summary);
});
