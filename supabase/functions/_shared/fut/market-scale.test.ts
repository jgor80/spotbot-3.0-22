// Market Lab must stay quick with the whole tracked card list (a few thousand cards). Before, each load compared
// every card against every other card and re-read every price row per card, which took the page past its timeout.
import { createMarketService, DEFAULT_BASKETS, DEFAULT_MARKET_RULES, rebalance, type MarketCard, type PriceObservation, type PriceSource } from "./xilab/market/index.ts";

Deno.test("market: overview, radar and a card page stay fast with 2,400 tracked cards", async () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const POS = ["ST", "CM", "CB", "RW", "LB", "GK", "CAM", "CDM"];
  const cards: MarketCard[] = Array.from({ length: 2400 }, (_, i) => ({
    id: `c${i}`, name: `Card ${i}`, club: "C", league: "L", nation: "N", positions: [POS[i % POS.length]], rating: 80 + (i % 14),
    category: i % 9 === 0 ? "promo" : i % 31 === 0 ? "icon" : "base", tradeable: true, source: "fixture", stats: {},
  }));
  // Eight days of prices every four hours, like the FUT.GG refreshes plus the hourly top-ups
  const rows: PriceObservation[] = [];
  for (let s = 48; s >= 1; s--) {
    const t = new Date(now - (s * 4 - 3) * 3_600_000).toISOString();
    cards.forEach((c, i) => rows.push({ card_id: c.id, platform: "console", price: 1000 + ((c.rating * 131 + s * 17 * (1 + (i % 7))) % 5000), observed_at: t, received_at: t, season: "FC27", source_id: "user_import", evidence: "estimate" }));
  }
  const members = DEFAULT_BASKETS.flatMap((b) => rebalance(b, cards, [], new Date(now - 10 * 86_400_000).toISOString()));
  const perm = { commercial_use: false, storage: true, retention_days: null, display: true, derived_analytics: true, model_training: false, redistribution: false, attribution: null };
  const sources = [{ id: "user_import", name: "Imports", kind: "user_import", status: "enabled", is_demo: false, status_note: "", permissions: perm, evidence: "estimate" }] as PriceSource[];
  const svc = createMarketService({
    cards: { list: () => Promise.resolve(cards), catalogue: () => Promise.resolve(cards) },
    prices: { query: () => Promise.resolve(rows), insert: () => Promise.resolve({ inserted: 0, skipped: 0 }) },
    memberships: { list: () => Promise.resolve(members), replace: () => Promise.resolve() },
    watchlists: { list: () => Promise.resolve([]), upsert: (_o, w) => Promise.resolve(w), remove: () => Promise.resolve() },
    sources, rules: DEFAULT_MARKET_RULES, now: () => new Date(now).toISOString(),
  });
  const started = performance.now();
  const overview = await svc.getMarketOverview("me");
  const radar = await svc.findMarketOpportunities("me", { limit: 50 });
  const card = await svc.getCardMarketIntelligence("me", "c7");
  const took = performance.now() - started;
  if (overview.coverage.fresh !== 2400 || radar.total !== 2400) throw new Error(`coverage ${JSON.stringify(overview.coverage)}, radar ${radar.total}`);
  if (overview.indexes.find((i) => i.basket_id === "market")?.value === null) throw new Error("market index missing");
  if (card.relative_strength.find((r) => r.benchmark === "rating")!.peers < 100) throw new Error("rating peers missing");
  // Generous for a slow CI machine; the old code needed minutes for this
  if (took > 15_000) throw new Error(`Market Lab took ${Math.round(took)}ms for 2,400 cards`);
  console.log(`market scale: ${Math.round(took)}ms`);
});
