// Champs / Rivals tracker (Jeff, 2026-11-10): the user's own Ultimate Team games, logged by hand, grouped into runs
// (a Champs weekend, a Rivals week). Record, goals, form, streaks, how they do against each formation and as the run
// wears on, what they still need for their target, and a recap to paste into Discord. Nothing is read from EA.
import { FutError, type FutDb } from "./service.ts";
import { FORMATIONS } from "./xilab/workspace/formations.ts";

type Row = Record<string, unknown>;
type Platform = "console" | "pc";
export type Mode = "champs" | "rivals" | "squad_battles" | "other";
export const MODES: Mode[] = ["champs", "rivals", "squad_battles", "other"];
const MODE_LABEL: Record<Mode, string> = { champs: "Champions", rivals: "Rivals", squad_battles: "Squad Battles", other: "Games" };
export const MAX_GAMES_PER_RUN = 100;

export interface Run { id: string; user_id: string; platform: Platform; mode: Mode; name: string; games_allowed: number | null; target_wins: number | null; started_at: string; finished_at: string | null }
export interface Game { id: string; run_id: string; played_at: string; goals_for: number; goals_against: number; penalties: "won" | "lost" | null; extra_time: boolean; opponent_quit: boolean; opponent_formation: string | null; squad_name: string | null; notes: string | null }

/** W, D or L. A draw decided on penalties counts as the shootout's result, as EA scores it. */
export const result = (g: Pick<Game, "goals_for" | "goals_against" | "penalties">): "W" | "D" | "L" =>
  g.goals_for > g.goals_against ? "W" : g.goals_for < g.goals_against ? "L" : g.penalties === "won" ? "W" : g.penalties === "lost" ? "L" : "D";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

/** Record, goals, form, streaks, by formation and by stage of the run. Pure. */
export function summarize(games: Game[], run?: Pick<Run, "games_allowed" | "target_wins"> | null) {
  const list = [...games].sort((a, b) => a.played_at.localeCompare(b.played_at));
  const res = list.map(result);
  const w = res.filter((r) => r === "W").length, d = res.filter((r) => r === "D").length, l = res.filter((r) => r === "L").length;
  const gf = list.reduce((n, g) => n + g.goals_for, 0), ga = list.reduce((n, g) => n + g.goals_against, 0);
  let best = 0, cur = 0;
  for (const r of res) { cur = r === "W" ? cur + 1 : 0; best = Math.max(best, cur); }
  let now = 0;
  for (let i = res.length - 1; i >= 0 && res[i] === res[res.length - 1]; i--) now++;
  const byFormation = new Map<string, { games: number; w: number; d: number; l: number; gf: number; ga: number }>();
  list.forEach((g, i) => {
    const k = g.opponent_formation ?? "Not noted";
    const s = byFormation.get(k) ?? { games: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    s.games++; s[res[i] === "W" ? "w" : res[i] === "D" ? "d" : "l"]++; s.gf += g.goals_for; s.ga += g.goals_against;
    byFormation.set(k, s);
  });
  // How the run goes as it wears on: first third, middle, last third.
  const third = Math.ceil(list.length / 3);
  const stages = list.length >= 6 ? [0, 1, 2].map((i) => {
    const part = res.slice(i * third, (i + 1) * third);
    return { stage: ["Start", "Middle", "End"][i]!, games: part.length, win_rate: pct(part.filter((r) => r === "W").length, part.length) };
  }) : [];
  const left = run?.games_allowed ? Math.max(0, run.games_allowed - list.length) : null;
  const need = run?.target_wins ? Math.max(0, run.target_wins - w) : null;
  const target = run?.target_wins ? {
    target: run.target_wins, need, left,
    status: need === 0 ? "reached" : left === null ? "open" : need! > left ? "out of reach" : "on",
    line: need === 0 ? `Target of ${run.target_wins} wins reached.` : left === null ? `${need} more win${need === 1 ? "" : "s"} for ${run.target_wins}.`
      : need! > left ? `${run.target_wins} wins is out of reach: ${need} needed, ${left} game${left === 1 ? "" : "s"} left.`
      : `${need} win${need === 1 ? "" : "s"} needed from ${left} game${left === 1 ? "" : "s"} left (${pct(need!, left)}%).`,
  } : null;
  return {
    games: list.length, w, d, l, win_rate: pct(w, list.length), goals_for: gf, goals_against: ga, goal_diff: gf - ga,
    avg_for: list.length ? Math.round((gf / list.length) * 10) / 10 : null, avg_against: list.length ? Math.round((ga / list.length) * 10) / 10 : null,
    clean_sheets: list.filter((g) => g.goals_against === 0).length, extra_time: list.filter((g) => g.extra_time || g.penalties).length,
    opponent_quits: list.filter((g) => g.opponent_quit).length,
    form: res.slice(-5).join(""), best_win_streak: best, current_streak: res.length ? `${res[res.length - 1]}${now}` : null,
    by_formation: [...byFormation.entries()].map(([formation, s]) => ({ formation, ...s, win_rate: pct(s.w, s.games) })).sort((a, b) => b.games - a.games || a.formation.localeCompare(b.formation)),
    stages, target,
  };
}

/** A short recap for Discord. Pure. */
export function recapText(run: Pick<Run, "mode" | "name" | "games_allowed" | "target_wins">, s: ReturnType<typeof summarize>) {
  const lines = [`**${run.name}** · ${MODE_LABEL[run.mode]}`, `${s.w}W ${s.d}D ${s.l}L from ${s.games}${run.games_allowed ? ` of ${run.games_allowed}` : ""} games${s.win_rate !== null ? ` (${s.win_rate}%)` : ""} · goals ${s.goals_for}-${s.goals_against}`];
  if (s.form) lines.push(`Form: ${s.form.split("").join(" ")} · best run ${s.best_win_streak} wins`);
  const tough = s.by_formation.filter((f) => f.formation !== "Not noted" && f.games >= 2).sort((a, b) => (a.win_rate ?? 0) - (b.win_rate ?? 0))[0];
  if (tough && (tough.win_rate ?? 100) < (s.win_rate ?? 0)) lines.push(`Toughest: ${tough.formation} (${tough.w}W from ${tough.games})`);
  if (s.stages.length === 3 && s.stages[2]!.win_rate !== null && s.stages[0]!.win_rate !== null && s.stages[0]!.win_rate - s.stages[2]!.win_rate >= 20) lines.push(`Faded late: ${s.stages[0]!.win_rate}% early, ${s.stages[2]!.win_rate}% at the end.`);
  if (s.target) lines.push(s.target.line);
  return lines.join("\n");
}

// ------------------------------------------------------------------ data

const FORMATION_NAMES = new Set(Object.keys(FORMATIONS));
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const small = (v: unknown, lo: number, hi: number, name: string) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new FutError(`${name} must be a whole number from ${lo} to ${hi}.`);
  return n;
};
const fail = (e: { message?: string } | null) => { if (e) throw new FutError(`Champs tracker: ${e.message ?? "database error"}`, 500); };

async function ownRun(db: FutDb, userId: string, id: string): Promise<Run> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FutError("Run not found.", 404);
  const { data, error } = await db.from("ut_runs").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  fail(error);
  if (!data) throw new FutError("Run not found.", 404);
  return data as Run;
}

export async function createRun(db: FutDb, userId: string, b: Row) {
  const mode = MODES.includes(b.mode as Mode) ? b.mode as Mode : "champs";
  const platform: Platform = b.platform === "pc" ? "pc" : "console";
  const row = {
    id: crypto.randomUUID(), started_at: new Date().toISOString(), finished_at: null, user_id: userId, platform, mode, name: text(b.name, 80) ?? `${MODE_LABEL[mode]} ${new Date().toISOString().slice(0, 10)}`,
    games_allowed: small(b.games_allowed, 1, 100, "games_allowed"), target_wins: small(b.target_wins, 1, 100, "target_wins"),
  };
  const { data, error } = await db.from("ut_runs").insert(row).select("*").single();
  fail(error);
  return data as Run;
}

export async function updateRun(db: FutDb, userId: string, id: string, b: Row) {
  await ownRun(db, userId, id);
  const patch: Row = {};
  if ("name" in b) patch.name = text(b.name, 80) ?? "Run";
  if ("games_allowed" in b) patch.games_allowed = small(b.games_allowed, 1, 100, "games_allowed");
  if ("target_wins" in b) patch.target_wins = small(b.target_wins, 1, 100, "target_wins");
  if ("finished" in b) patch.finished_at = b.finished === true ? new Date().toISOString() : null;
  fail((await db.from("ut_runs").update(patch).eq("id", id).eq("user_id", userId)).error);
  return ownRun(db, userId, id);
}

export async function deleteRun(db: FutDb, userId: string, id: string) {
  await ownRun(db, userId, id);
  fail((await db.from("ut_games").delete().eq("run_id", id).eq("user_id", userId)).error);
  fail((await db.from("ut_runs").delete().eq("id", id).eq("user_id", userId)).error);
  return { deleted: id };
}

export async function addGame(db: FutDb, userId: string, runId: string, b: Row) {
  const run = await ownRun(db, userId, runId);
  const { data: have, error } = await db.from("ut_games").select("id").eq("run_id", runId);
  fail(error);
  if ((have ?? []).length >= (run.games_allowed ?? MAX_GAMES_PER_RUN)) throw new FutError(run.games_allowed ? `This run allows ${run.games_allowed} games and has them all.` : `A run holds at most ${MAX_GAMES_PER_RUN} games.`);
  const gf = small(b.goals_for, 0, 30, "goals_for"), ga = small(b.goals_against, 0, 30, "goals_against");
  if (gf === null || ga === null) throw new FutError("Give the score: goals_for and goals_against.");
  const pens = b.penalties === "won" || b.penalties === "lost" ? b.penalties : null;
  if (pens && gf !== ga) throw new FutError("Penalties only decide a drawn game.");
  const formation = text(b.opponent_formation, 20);
  if (formation && !FORMATION_NAMES.has(formation)) throw new FutError(`Unknown formation ${formation}. Use one like 4-2-3-1 or 4-3-3 (2).`);
  const row = {
    id: crypto.randomUUID(), played_at: new Date().toISOString(), run_id: runId, user_id: userId, goals_for: gf, goals_against: ga, penalties: pens, extra_time: b.extra_time === true || !!pens,
    opponent_quit: b.opponent_quit === true, opponent_formation: formation, squad_name: text(b.squad_name, 80), notes: text(b.notes, 300),
    ...(typeof b.played_at === "string" && Number.isFinite(Date.parse(b.played_at)) ? { played_at: new Date(b.played_at).toISOString() } : {}),
  };
  const { data, error: e } = await db.from("ut_games").insert(row).select("*").single();
  fail(e);
  return data as Game;
}

export async function deleteGame(db: FutDb, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FutError("Game not found.", 404);
  const { data, error } = await db.from("ut_games").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  fail(error);
  if (!data) throw new FutError("Game not found.", 404);
  fail((await db.from("ut_games").delete().eq("id", id).eq("user_id", userId)).error);
  return { deleted: id };
}

/** All runs on a platform (newest first) with their games, each summarized, plus every game together by mode. */
export async function champsOverview(db: FutDb, userId: string, platform: Platform) {
  const { data: runs, error } = await db.from("ut_runs").select("*").eq("user_id", userId).eq("platform", platform).order("started_at", { ascending: false }).limit(60);
  fail(error);
  const list = (runs ?? []) as Run[];
  const games: Game[] = [];
  const ids = list.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error: e } = await db.from("ut_games").select("*").in("run_id", ids.slice(i, i + 50)).order("played_at", { ascending: true });
    fail(e);
    games.push(...((data ?? []) as Game[]));
  }
  const of = (id: string) => games.filter((g) => g.run_id === id);
  const out = list.map((r) => { const s = summarize(of(r.id), r); return { ...r, summary: s, recap: recapText(r, s), games: of(r.id).map((g) => ({ ...g, result: result(g) })) }; });
  const byMode = MODES.map((m) => ({ mode: m, label: MODE_LABEL[m], ...summarize(games.filter((g) => list.find((r) => r.id === g.run_id)?.mode === m)) })).filter((m) => m.games > 0);
  return { platform, runs: out, by_mode: byMode, formations: [...FORMATION_NAMES], note: "Games you logged yourself. Nothing is read from EA." };
}
