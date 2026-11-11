// Champs tracker: results (penalties count), record, form, streaks, formations, stages, target and recap.
import { recapText, result, summarize, type Game } from "./champs.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

let n = 0;
const g = (gf: number, ga: number, p: Partial<Game> = {}): Game => ({ id: `g${++n}`, run_id: "r", played_at: new Date(Date.UTC(2026, 10, 7, 10, n)).toISOString(), goals_for: gf, goals_against: ga, penalties: null, extra_time: false, opponent_quit: false, opponent_formation: null, squad_name: null, notes: null, ...p });

Deno.test("result: penalties decide a draw", () => {
  assert(result(g(2, 1)) === "W" && result(g(1, 1)) === "D" && result(g(1, 1, { penalties: "won" })) === "W" && result(g(0, 0, { penalties: "lost" })) === "L", "results");
});

Deno.test("summarize: record, goals, form, streaks, by formation, stages and target", () => {
  const games = [
    g(3, 0, { opponent_formation: "4-2-3-1" }), g(2, 1, { opponent_formation: "4-2-3-1" }), g(1, 0, { opponent_formation: "4-4-2" }), g(4, 2),
    g(1, 2, { opponent_formation: "4-2-3-1" }), g(2, 2, { penalties: "won" }), g(0, 1, { opponent_formation: "5-2-1-2" }), g(0, 3, { opponent_formation: "5-2-1-2" }), g(1, 2),
  ];
  const s = summarize(games, { games_allowed: 15, target_wins: 11 });
  assert(s.games === 9 && s.w === 5 && s.d === 0 && s.l === 4 && s.win_rate === 56, JSON.stringify(s));
  assert(s.goals_for === 14 && s.goals_against === 13 && s.clean_sheets === 2 && s.extra_time === 1, JSON.stringify(s));
  assert(s.form === "LWLLL" && s.best_win_streak === 4 && s.current_streak === "L3", `${s.form} ${s.best_win_streak} ${s.current_streak}`);
  const f = s.by_formation.find((x) => x.formation === "4-2-3-1")!;
  assert(f.games === 3 && f.w === 2 && f.win_rate === 67 && s.by_formation[0]!.formation === "4-2-3-1", JSON.stringify(s.by_formation));
  assert(s.stages.length === 3 && s.stages[0]!.win_rate === 100 && s.stages[2]!.win_rate === 0, JSON.stringify(s.stages));
  assert(s.target!.need === 6 && s.target!.left === 6 && s.target!.status === "on" && /6 wins needed from 6 games left/.test(s.target!.line), JSON.stringify(s.target));
  assert(summarize(games, { games_allowed: 10, target_wins: 11 }).target!.status === "out of reach", "out of reach");
  const recap = recapText({ mode: "champs", name: "Weekend 1", games_allowed: 15, target_wins: 11 }, s);
  assert(/5W 0D 4L from 9 of 15 games \(56%\)/.test(recap) && /Toughest: 5-2-1-2 \(0W from 2\)/.test(recap) && /Faded late: 100% early, 0% at the end/.test(recap), recap);
  const empty = summarize([]);
  assert(empty.games === 0 && empty.win_rate === null && empty.current_streak === null && empty.target === null, "empty");
});
