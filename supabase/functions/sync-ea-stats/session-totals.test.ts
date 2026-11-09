import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionTotals } from "./session-totals.ts";

const p = (ea_username: string, o: Record<string, number> = {}) => ({ ea_username, shots: 0, goals: 0, passes_made: 0, pass_attempts: 0, tackles: 0, tackle_attempts: 0, assists: 0, red_cards: 0, ...o });

test("totals come from every attached match", () => {
  const t = sessionTotals([
    { result: "win", score_for: 3, score_against: 0, player_stats: [p("Ace", { shots: 4, goals: 2, passes_made: 20, pass_attempts: 25, assists: 1 }), p("Bee", { tackles: 3, tackle_attempts: 5 })] },
    { result: "loss", score_for: 1, score_against: 2, player_stats: [p("Ace", { shots: 2, goals: 1, red_cards: 1 }), p("Cee")] },
    { result: "draw", score_for: 1, score_against: 1, player_stats: null },
  ]);
  assert.deepEqual(
    { ...t, players: [...t.players].sort() },
    {
      match_count: 3, wins: 1, draws: 1, losses: 1, goals_for: 5, goals_against: 3,
      total_shots: 6, total_shots_on_target: 3, total_passes_made: 20, total_pass_attempts: 25,
      total_tackles: 3, total_tackle_attempts: 5, total_assists: 1, red_cards: 1, clean_sheets: 1,
      players: ["Ace", "Bee", "Cee"], player_count: 3,
    },
  );
});

test("recomputing is idempotent: the same matches give the same totals", () => {
  const matches = [{ result: "win", score_for: 2, score_against: 1, player_stats: [p("Ace", { shots: 1 })] }];
  assert.deepEqual(sessionTotals(matches), sessionTotals(matches));
  assert.equal(sessionTotals([]).match_count, 0);
});
