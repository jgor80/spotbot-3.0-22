import { PgPriceStore } from "./market.ts";
import { futggStatus } from "./futgg-status.ts";
import { futMemoryDb } from "./test-db.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }
const at = "2026-11-08T06:00:00.000Z", after = "2026-11-08T07:00:00.000Z";

Deno.test("FUT.GG history maps exact EA items only to the caller's cards and preserves as-of/platform boundaries", async () => {
  const quote = { game_year: 27, ea_item_id: 100, platform: "console", published_at: at, received_at: at, price: 1000 };
  const db = futMemoryDb({ player_cards: [
    { id: "mine", owner_user_id: "A", source_card_key: "100" }, { id: "other", owner_user_id: "B", source_card_key: "100" },
    { id: "manual", owner_user_id: "A", source_card_key: "not-ea" },
  ], futgg_prices: [quote, { ...quote, platform: "pc", price: 900 }, { ...quote, received_at: after, price: 500 },
    { ...quote, published_at: after, price: 400 }, { ...quote, ea_item_id: 999, price: 100 }, { ...quote, price: null }] });
  const store = new PgPriceStore(db, true);
  const found = await store.query("A", { as_of: at, platform: "console" });
  assert(found.length === 1 && found[0].card_id === "mine" && found[0].price === 1000);
  assert(found[0].source_id === "futgg_bulk" && found[0].evidence === "estimate" && found[0].quality?.length);
  assert((await store.query("A", { as_of: at, card_ids: ["other"] })).length === 0);
  assert((await new PgPriceStore(db, false).query("A", { as_of: at })).length === 0, "Disabled sources do not supply quotes");
});

Deno.test("FUT.GG status shows missing, overdue and failed refreshes without inventing a successful check", async () => {
  const db = futMemoryDb({ market_price_sources: [{ id: "futgg_bulk", status: "enabled" }],
    futgg_snapshots: [{ game_year: 27, platform: "console", published_at: at, received_at: at, checked_at: after, card_count: 20000, priced_count: 19000 }],
    market_provider_runs: [{ source_id: "futgg_bulk", finished_at: after, status: "failed", message: "network failure" }] });
  const result = await futggStatus(db, Date.parse(at) + 13 * 3_600_000);
  assert(result.enabled && result.last_run?.status === "failed");
  assert(result.platforms[0].overdue && result.platforms[0].market_price_count === 19000);
  assert(result.platforms[1].published_at === null && result.platforms[1].overdue);
  const missing = await futggStatus(futMemoryDb());
  assert(!missing.enabled && missing.platforms.length === 0);
});

Deno.test("FUT.GG history reads beyond PostgREST's 1000-row page limit", async () => {
  const rows = Array.from({ length: 1100 }, (_, i) => ({ game_year: 27, ea_item_id: 100, platform: "console",
    published_at: new Date(Date.parse(at) - i * 1000).toISOString(), received_at: at, price: 1000 + i }));
  const db = futMemoryDb({ player_cards: [{ id: "mine", owner_user_id: "A", source_card_key: "100" }], futgg_prices: rows });
  const prices = await new PgPriceStore(db, true).query("A", { platform: "console", as_of: at });
  assert(prices.length === 1100 && new Set(prices.map((p) => p.price)).size === 1100);
});
