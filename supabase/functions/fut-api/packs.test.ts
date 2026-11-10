// Pack Advisor: the helper's pack store upload, the value model, the buy/skip verdict and the timing tips.
// Fictional packs, odds and prices only.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";
import { bandValue, forgetValueBands, nextPromoSlot, packValue, parseStoreUpload, timingFor, verdictFor, type Band, type PackOdd } from "../_shared/fut/packs.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const H = 3_600_000;

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

const odd = (label: string, probability: number, min: number | null, special = false): PackOdd => ({
  label, odds_text: `${Math.round(probability * 100)}%`, probability, min_rating: min, max_rating: null, special,
  category_id: null, tier_id: null, quality_id: null, rarity_asset_id: null, rules: [],
});

// Band rows: [overall, kind, cards, p25, median, mean].
const BANDS: Band[] = [
  [75, "common", 100, 200, 250, 300], [75, "rare", 100, 400, 500, 600], [79, "rare", 50, 500, 600, 700],
  [82, "rare", 40, 1500, 2000, 2500], [83, "rare", 30, 3000, 4000, 5000], [84, "rare", 20, 8000, 10000, 20000],
  [86, "rare", 10, 20000, 30000, 60000], [86, "special", 10, 50000, 80000, 200000],
];

const pack = {
  pack_id: 101, name: "Rare Gold Pack", name_key: "K", description: null, state: "available", pack_type: "GOLD", coins: 7500, points: 100,
  untradeable: false, is_player_pick: false, item_count: 12, gold: 12, silver: 0, bronze: 0, rare: 3, content_type: "players",
  start_at: null, end_at: null, purchase_limit: null, purchase_count: null, unopened: false,
  odds: [odd("Player 84+ OVR", 0.1, 84), odd("Player 82+ OVR", 1, 82), odd("Special item", 0.02, 84, true)],
};

Deno.test("band value weights each rating by how many cards are priced", () => {
  const v = bandValue(BANDS, 82, 83, ["rare"])!;
  assert(v.cards === 70 && Math.round(v.low) === Math.round((40 * 2000 + 30 * 4000) / 70), JSON.stringify(v));
  assert(bandValue(BANDS, 90, 99, ["rare"]) === null, "nothing priced above 90");
});

Deno.test("pack value: best card from nested odds lines, special upside, fodder for the rest", () => {
  const v = packValue(pack, BANDS);
  // Best card: 10% in 84-99 rare, 90% in 82-83 rare. Special: 2% x (special 84+ minus rare fodder).
  const best = 0.1 * ((20 * 10000 + 10 * 30000) / 30) + 0.9 * ((40 * 2000 + 30 * 4000) / 70);
  const fodderRare = (100 * 500 + 50 * 600) / 150, fodderCommon = 250;
  const expected = best + 0.02 * (80000 - fodderRare) + 2 * fodderRare + 9 * fodderCommon;
  assert(Math.abs(v.ev_low! - expected) <= 1, `ev_low ${v.ev_low} vs ${expected}`);
  assert(v.ev_high! > v.ev_low!, "mean-based value includes the big pulls");
  assert(v.fodder_items === 11 && v.lines.length === 3 && v.lines.every((l) => l.used), JSON.stringify(v.lines));
  assert(v.lines.find((l) => l.label === "Player 82+ OVR")!.covers === "82-83", "a line runs up to just below the better line");

  const blind = packValue({ ...pack, odds: [] }, BANDS);
  assert(blind.notes.some((n) => /odds/.test(n)) && blind.ev_low === null, "no odds: says to open them, and no value from fodder alone");
  assert(verdictFor(pack, blind).verdict === "no_odds", "a pack without odds isn't judged");
  assert(verdictFor(pack, packValue({ ...pack, odds: [], item_count: null, gold: null, rare: null }, [])).verdict === "no_odds", "no odds, nothing to price");
});

Deno.test("verdicts: after tax for tradeable packs, SBC-fodder value for untradeable, points-only packs", () => {
  const v = packValue(pack, BANDS);
  const cheap = verdictFor({ ...pack, coins: 3000 }, v), dear = verdictFor({ ...pack, coins: 100_000 }, v);
  assert(cheap.verdict === "buy" && cheap.ratio! > 1, JSON.stringify(cheap));
  assert(dear.verdict === "skip" && /lose coins/.test(dear.why), JSON.stringify(dear));
  const near = verdictFor({ ...pack, coins: Math.round((v.ev_low! * 0.95) / 0.85) }, v);
  assert(near.verdict === "only_for_fodder" && Math.abs(near.ratio! - 0.85) < 0.01, JSON.stringify(near));
  const lucky = verdictFor({ ...pack, coins: Math.round((v.ev_low! * 0.95) / 0.5) }, v);
  assert(v.ev_high! > 2 * v.ev_low! ? lucky.verdict === "only_for_fodder" : lucky.verdict === "skip", "the average alone never makes a pack a buy");
  const untradeable = verdictFor({ ...pack, coins: 3000, untradeable: true }, v);
  assert(untradeable.verdict === "only_for_fodder" && /Untradeable/.test(untradeable.why), "untradeable is never a straight buy");
  assert(verdictFor({ ...pack, coins: null }, v).verdict === "points_only", "points only");
});

Deno.test("timing: value trend, store window, limit and the Friday promo slot", () => {
  const now = Date.UTC(2026, 10, 12, 12); // Thursday 12:00 UTC (GMT in November)
  assert(nextPromoSlot(now) === Date.UTC(2026, 10, 13, 18), "Friday 6pm UK in winter is 18:00 UTC");
  assert(nextPromoSlot(Date.UTC(2026, 6, 1)) === Date.UTC(2026, 6, 3, 17), "in summer (BST) it's 17:00 UTC");
  const series = [{ at: new Date(now - 5 * 24 * H).toISOString(), ev: 5000 }, { at: new Date(now - 4 * 24 * H).toISOString(), ev: 5000 }, { at: new Date(now - H).toISOString(), ev: 6000 }];
  const t = timingFor({ now, ev_series: series, end_at: new Date(now + 5 * H).toISOString(), start_at: null, purchase_limit: 3, purchase_count: 1, has_special: true, verdict: "skip" });
  assert(t.trend_pct === 20, `trend ${t.trend_pct}`);
  assert(t.tips.some((x) => /up 20%/.test(x)) && t.tips.some((x) => /in 5 h/.test(x)) && t.tips.some((x) => /Limited to 3; you've bought 1/.test(x)), JSON.stringify(t.tips));
  assert(t.tips.some((x) => /promo usually lands/.test(x)), "promo tip within 30 h of Friday 6pm");
  const after = timingFor({ now: Date.UTC(2026, 10, 14, 10), ev_series: [], end_at: null, start_at: null, purchase_limit: null, purchase_count: null, has_special: true, verdict: "buy" });
  assert(after.trend_pct === null && after.tips.some((x) => /promo landed/.test(x)), JSON.stringify(after.tips));
});

Deno.test("store upload parsing keeps known fields and refuses other files", () => {
  let refused = false;
  try { parseStoreUpload({ format: "xilab-club-capture", version: 1 }); } catch { refused = true; }
  assert(refused, "club files are refused");
  const u = parseStoreUpload({ format: "xilab-store-capture", version: 1, platform: "pc", captured_at: "2026-11-09T18:00:00.000Z",
    packs: [{ ...pack, coins: -5, odds: [{ ...pack.odds[0], probability: 7 }, { label: "x" }] }, { pack_id: "nope" }],
    pulls: [{ item_id: 9, ea_item_id: 501, rating: 86, untradeable: false, pack_id: 101, opened_at: "2026-11-09T18:01:00.000Z" }, { item_id: 1 }],
    shape: { pack_keys: ["coins", 5], odds_keys: [] } });
  assert(u.platform === "pc" && u.packs.length === 1 && u.pulls.length === 1 && u.skipped === 2, JSON.stringify(u));
  assert(u.packs[0]!.coins === null && u.packs[0]!.odds.length === 1 && u.packs[0]!.odds[0]!.probability === null, "bad values are dropped, not guessed");
  assert(JSON.stringify(u.shape.pack_keys) === '["coins"]', JSON.stringify(u.shape));
});

Deno.test("routes: the helper key uploads the store, the user gets advice, nobody else sees it", async () => {
  forgetValueBands();
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  const published = new Date(Date.now() - 2 * H).toISOString();
  db.rpc = (fn, args) => Promise.resolve(fn === "pack_value_bands" && args.p_platform === "console"
    ? { data: { snapshots: [{ published_at: published, bands: BANDS }] }, error: null } : { data: { snapshots: [] }, error: null });
  db.tables.futgg_snapshots = [{ game_year: 27, platform: "console", published_at: published }];
  db.tables.futgg_prices = [{ game_year: 27, platform: "console", published_at: published, ea_item_id: 501, price: 30_000 }];
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => (k === "FUT_ENABLED" ? "true" : undefined) };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = { "x-test-user": ME }): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const key = (await call("POST", "/v1/helper/connect")).data.data.key as string;
  const file = { format: "xilab-store-capture", version: 1, verified: false, platform: "console", captured_at: new Date().toISOString(), packs: [pack, { ...pack, pack_id: 102, coins: 100_000, name: "Dear Pack" }],
    pulls: [{ item_id: 9, ea_item_id: 501, item_type: "player", rating: 86, rare_flag: 1, untradeable: false, pack_id: 101, opened_at: new Date(Date.now() - H).toISOString() }],
    shape: { pack_keys: ["coins", "packOdds"], odds_keys: ["oddsFormatted"], category_keys: [] } };
  const up = await call("POST", "/v1/helper/packs", file, { authorization: `Bearer ${key}` });
  assert(up.status === 200 && up.data.data.packs === 2 && up.data.data.pulls === 1, JSON.stringify(up.data));
  assert((await call("GET", "/v1/packs", undefined, { authorization: `Bearer ${key}` })).status === 403, "the key can't read advice");

  const advice = (await call("GET", "/v1/packs?platform=console")).data.data;
  assert(advice.packs.length === 2 && advice.packs[0].pack_id === 101 && advice.packs[1].verdict === "skip", JSON.stringify(advice.packs.map((p: { pack_id: number; verdict: string }) => [p.pack_id, p.verdict])));
  assert(advice.packs[0].ev_after_tax > 0 && advice.packs[0].lines.length === 3 && advice.prices_at === published, "valued on the latest refresh");
  assert(advice.shape.pack_keys.includes("packOdds"), "field names kept for the shape check");
  const open = advice.pulls.opens[0];
  assert(open.pack_name === "Rare Gold Pack" && open.tradeable_value === 30_000 && open.profit === Math.round(30_000 * 0.95) - 7500, JSON.stringify(open));

  // A second upload replaces the store list; another user sees nothing.
  await call("POST", "/v1/helper/packs", { ...file, packs: [pack], pulls: [] }, { authorization: `Bearer ${key}` });
  assert((await call("GET", "/v1/packs")).data.data.packs.length === 1, "store list replaced");
  assert((await call("GET", "/v1/packs", undefined, { "x-test-user": OTHER })).data.data.packs.length === 0, "private to the uploader");
  // Helper 0.7.0: store answers seen with no packs read are kept for the page, and the stored packs stay.
  const seen = [{ path: "/store/vN/list", keys: ["groups", "x".repeat(80)], packs: 0, odds: 0, at: new Date().toISOString() }, { nope: 1 }];
  const miss = await call("POST", "/v1/helper/packs", { ...file, packs: [], pulls: [], shape: { pack_keys: [], seen } }, { authorization: `Bearer ${key}` });
  assert(miss.status === 200 && miss.data.data.packs === 0, JSON.stringify(miss.data));
  const afterMiss = (await call("GET", "/v1/packs")).data.data;
  assert(afterMiss.packs.length === 1 && afterMiss.shape.seen.length === 1 && afterMiss.shape.seen[0].path === "/store/vN/list", JSON.stringify(afterMiss.shape));
  assert(JSON.stringify(afterMiss.shape.seen[0].keys) === '["groups"]' && afterMiss.shape.pack_keys.includes("packOdds"), "long names dropped, earlier field names kept");
  assert((await call("DELETE", "/v1/packs?platform=console")).data.data.cleared === true, "clear");
  assert((await call("GET", "/v1/packs")).data.data.packs.length === 0 && db.tables.pack_pulls!.length === 0, "cleared");
});
