import { describe, expect, test, mock } from "bun:test";
const calls = [];
mock.module("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (path, options) => { calls.push({ path, options }); return Promise.resolve({ data: { data: {} }, error: null }); } } } }));
const { cardInputRules, compareCardRules, optimizerRules, cardLimitRules, squadBudget, futApi } = await import("../../lib/futApi");
const { swapLine, linkLine } = await import("./chemistryPresentation");

describe("XI Lab input limits", () => {
  test("overall is an integer from 1 to 99", () => {
    for (const value of [1, 99]) expect(cardInputRules.safeParse({ overall: value, skill_moves: 1, weak_foot: 1 }).success).toBe(true);
    for (const value of [0, 100, 1.5]) expect(cardInputRules.safeParse({ overall: value, skill_moves: 1, weak_foot: 1 }).success).toBe(false);
  });
  test("skill moves are 1 to 5", () => {
    for (const value of [1, 5]) expect(cardInputRules.safeParse({ overall: 99, skill_moves: value, weak_foot: 1 }).success).toBe(true);
    for (const value of [0, 6]) expect(cardInputRules.safeParse({ overall: 99, skill_moves: value, weak_foot: 1 }).success).toBe(false);
  });
  test("weak foot is 1 to 5", () => {
    for (const value of [1, 5]) expect(cardInputRules.safeParse({ overall: 99, skill_moves: 1, weak_foot: value }).success).toBe(true);
    for (const value of [0, 6]) expect(cardInputRules.safeParse({ overall: 99, skill_moves: 1, weak_foot: value }).success).toBe(false);
  });
  test("comparison requires 2 to 4 cards", () => {
    for (const n of [2, 3, 4]) expect(compareCardRules.safeParse(Array.from({ length: n }, (_, i) => String(i))).success).toBe(true);
    for (const n of [0, 1, 5]) expect(compareCardRules.safeParse(Array.from({ length: n }, (_, i) => String(i))).success).toBe(false);
  });
  test("optimizer permits 1 to 4 swaps", () => {
    for (const n of [1, 2, 3, 4]) expect(optimizerRules.safeParse({ max_swaps: n }).success).toBe(true);
    for (const n of [0, 5]) expect(optimizerRules.safeParse({ max_swaps: n }).success).toBe(false);
  });
  test("card list permits limits 1 to 100 and defaults to 100", async () => {
    expect(cardLimitRules.safeParse(1).success).toBe(true);
    expect(cardLimitRules.safeParse(100).success).toBe(true);
    for (const n of [0, 101, 200]) expect(cardLimitRules.safeParse(n).success).toBe(false);
    await futApi.cards();
    expect(calls.at(-1).path).toBe("fut-api/v1/cards?limit=100");
  });
  test("empty budget means zero and non-whole or nonfinite budgets are rejected", () => {
    for (const input of ["", null, undefined, 0]) expect(squadBudget(input)).toBe(0);
    expect(squadBudget("12500")).toBe(12500);
    for (const input of [-1, 1.5, NaN, Infinity, "bad"]) expect(() => squadBudget(input)).toThrow();
  });
  test("new squads, saved squads and copies send zero instead of missing or null budgets", async () => {
    const squad = { name: "Test", formation: "4-4-2", manager: null, slots: [], budget: null };
    await futApi.newSquad({ formation: "4-4-2" });
    expect(calls.at(-1).options.body.budget).toBe(0);
    await futApi.saveSquad(squad);
    expect(calls.at(-1).options.body.budget).toBe(0);
    await futApi.saveAs(squad, "Copy");
    expect(calls.at(-1).options.body.squad.budget).toBe(0);
    const before = calls.length;
    expect(() => futApi.saveSquad({ ...squad, budget: NaN })).toThrow();
    expect(calls.length).toBe(before);
  });
  test("swap presentation preserves API delta instead of deriving it", () => {
    const line = swapLine({ name: "Player", before: 1, after: 3, delta: -7 });
    expect(line).toMatchObject({ before: 1, after: 3, signed: "-7" });
    expect(swapLine({ name: "Player", before: 1, after: 3 }).signed).toBeUndefined();
  });
  test("link counts and next point needs retain API numbers", () => {
    const line = linkLine({ count: 4, needed_for_next: 9, next_threshold: 20, mystery: 87 }, "league");
    expect(line).toMatchObject({ count: 4, needed: 9, threshold: 20, extra: { mystery: 87 } });
  });
});
