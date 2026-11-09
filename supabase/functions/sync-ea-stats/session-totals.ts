// A session's totals, rebuilt from every match attached to it. The sync used to add each new match to
// the stored totals (read, add, write): a failed read or write lost that match for good once its player
// rows were saved, and two syncs at once overwrote each other's increments. Recomputing from the saved
// matches is idempotent, so any later sync repairs the totals.

// deno-lint-ignore no-explicit-any
type Json = any;

export type SessionMatch = { result: string | null; score_for: number | null; score_against: number | null; player_stats: Json };

export function sessionTotals(matches: SessionMatch[]) {
  const t = {
    match_count: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0,
    total_shots: 0, total_shots_on_target: 0, total_passes_made: 0, total_pass_attempts: 0,
    total_tackles: 0, total_tackle_attempts: 0, total_assists: 0, red_cards: 0, clean_sheets: 0,
    players: [] as string[], player_count: 0,
  };
  const players = new Set<string>();
  for (const m of matches) {
    t.match_count++;
    if (m.result === "win") t.wins++;
    else if (m.result === "draw") t.draws++;
    else if (m.result === "loss") t.losses++;
    t.goals_for += Number(m.score_for) || 0;
    t.goals_against += Number(m.score_against) || 0;
    if (Number(m.score_against) === 0) t.clean_sheets++;
    for (const p of Array.isArray(m.player_stats) ? m.player_stats : []) {
      t.total_shots += Number(p?.shots) || 0;
      t.total_shots_on_target += Number(p?.goals) || 0; // goals stand in for shots on target, as before
      t.total_passes_made += Number(p?.passes_made) || 0;
      t.total_pass_attempts += Number(p?.pass_attempts) || 0;
      t.total_tackles += Number(p?.tackles) || 0;
      t.total_tackle_attempts += Number(p?.tackle_attempts) || 0;
      t.total_assists += Number(p?.assists) || 0;
      if (p?.red_cards) t.red_cards++;
      if (p?.ea_username) players.add(String(p.ea_username));
    }
  }
  t.players = [...players];
  t.player_count = t.players.length;
  return t;
}
