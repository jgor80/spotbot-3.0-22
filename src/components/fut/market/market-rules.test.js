import { describe, expect, test, mock } from "bun:test";
const calls = [];
mock.module("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (path, options) => { calls.push({ path, options }); return Promise.resolve({ data: { data: {} }, error: null }); } } } }));
const { futApi } = await import("../../../lib/futApi");
const { marketPlatform, matchingCards, validateImport, numberText, percentText, coinInput, bestFitText } = await import("./marketPresentation");
describe("Market Lab rules", () => {
 test("platform defaults to console and allows pc", () => { expect(marketPlatform(null)).toBe("console"); expect(marketPlatform("console")).toBe("console"); expect(marketPlatform("pc")).toBe("pc"); expect(marketPlatform("unknown")).toBe("console"); });
 test("every platform query sends its selected platform", async () => {
  await futApi.market.overview("pc"); expect(calls.at(-1)?.path).toBe("fut-api/v1/market/overview?platform=pc");
  await futApi.market.opportunities("console", { status: "watch", max_price: "25000", limit: "100" }); expect(calls.at(-1)?.path).toBe("fut-api/v1/market/opportunities?status=watch&max_price=25000&limit=100&platform=console");
  await futApi.market.unwatch("card 1", "pc"); expect(calls.at(-1)?.path).toBe("fut-api/v1/market/watchlist/card%201?platform=pc"); expect(calls.at(-1)?.options.method).toBe("DELETE");
 });
 test("research sends user prices unchanged instead of computing costs", async () => { const body = { card_id: "a", platform: "pc", buy_price: 10000, target_price: 13000, downside_price: 9000, quantity: 2 }; await futApi.market.thesis(body); expect(calls.at(-1)?.options.body).toEqual(body); });
 test("held links use only cards with exactly matching overall", () => { const cards = [{ id: "a", overall: 88 }, { id: "b", overall: 89 }, { id: "c", overall: 88 }]; expect(matchingCards(cards, 88).map(card => card.id)).toEqual(["a", "c"]); expect(matchingCards(cards, 87)).toEqual([]); });
 test("imports allow 5000 rows but reject 5001", () => { const csv = (n) => "card_id,platform,price\n" + Array.from({ length: n }, () => "a,console,100").join("\n"); expect(validateImport(csv(5000))).toBe(csv(5000)); expect(() => validateImport(csv(5001))).toThrow(); expect(() => validateImport(JSON.stringify(Array.from({ length: 5001 }, () => ({ price: 1 }))))).toThrow(); });
 test("quoted newlines count as one CSV row", () => { const text = 'card_id,platform,price\n"a\nb",console,100'; expect(validateImport(text)).toBe(text); });
 test("missing numbers remain missing and API percentages are not rescaled", () => { expect(numberText(null)).toBe("–"); expect(numberText(0)).toBe("0"); expect(numberText(10000)).toBe("10,000"); expect(percentText(-3.75)).toBe("-3.75%"); expect(percentText(1.2)).toBe("+1.2%"); });
 test("optional targets stay absent and invalid coin values are rejected", () => { expect(coinInput("", false)).toBeUndefined(); expect(coinInput("12500")).toBe(12500); for (const input of ["", "-1", "1.5", "NaN"]) expect(() => coinInput(input)).toThrow(); });
 test("best fit shows position, profile and score, or a dash", () => { expect(bestFitText({ position: "ST", profile: "Advanced Forward", score: 82 })).toBe("ST · Advanced Forward · 82"); expect(bestFitText(null)).toBe("–"); });
});
