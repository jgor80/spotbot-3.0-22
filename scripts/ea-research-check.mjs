// Checks GafferBot's EA event decoding and advanced stats against the community FC27 dataset from
// https://github.com/Interactive-63/eafc-pro-clubs-api-research (data/eafc_27_raw_player_data.csv,
// 51k player rows with EA's named stats next to the raw event counts).
//
//   npm run build:bot-lib && npm run build:bot-events
//   node scripts/ea-research-check.mjs path/to/eafc_27_raw_player_data.csv
//
// Prints a report and exits non-zero if a check that should hold fails.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { eaEventStats } = require("../public/spotbot/ea-events.cjs");
const insights = require("../public/spotbot/club-insights.cjs");

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/ea-research-check.mjs eafc_27_raw_player_data.csv");
  process.exit(2);
}

// --- CSV (quoted fields allowed) ---
function parseLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const lines = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
const head = parseLine(lines[0]);
const eventCols = head.map((h, i) => [h, i]).filter(([h]) => h.startsWith("event_"));
const rows = lines.slice(1).map((l) => {
  const c = parseLine(l);
  const r = Object.fromEntries(head.map((h, i) => [h, c[i]]));
  r.match_event_aggregate_0 = eventCols.filter(([, i]) => Number(c[i]) > 0).map(([h, i]) => `${h.slice(6)}:${Math.round(Number(c[i]))}`).join(",");
  return r;
});
const n = (v) => Number(v) || 0;

let failed = 0;
const pctStr = (x) => `${(x * 100).toFixed(1)}%`;
function check(label, share, min) {
  const ok = share >= min;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${pctStr(share)} (need ${pctStr(min)})`);
}
function info(label, value) {
  console.log(`      ${label}: ${value}`);
}
function corr(xs, ys) {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sx += (xs[i] - mx) ** 2;
    sy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sx * sy);
}
function checkCorr(label, pairs, sign) {
  const r = corr(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  const ok = Math.sign(r) === sign && Math.abs(r) >= 0.05;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: r = ${r.toFixed(3)} over ${pairs.length} rows (expect ${sign > 0 ? "positive" : "negative"})`);
}

const decoded = rows.map((r) => ({ r, s: eaEventStats(r) }));
console.log(`${rows.length} player rows\n`);

// 1. Decoded codes agree with EA's own named stats
console.log("1. Event codes vs EA's named stats (exact match, rows where the stat is non-zero)");
const exact = (name, get, stat) => {
  const sub = decoded.filter(({ r }) => n(r[stat]) > 0);
  check(name, sub.filter(({ r, s }) => get(s) === n(r[stat])).length / sub.length, 0.6);
};
exact("goals = 214", (s) => s.goals, "goals");
exact("assists = 11", (s) => s.assists, "assists");
exact("shots = 217 + 218", (s) => s.shotsOnTarget + s.shotsOffTarget, "shots");
exact("passes made = 215", (s) => s.passesCompleted, "passesmade");
exact("pass attempts = 215 + 216", (s) => s.passesCompleted + s.passesFailed, "passattempts");
exact("tackles made = 0", (s) => s.tacklesWon, "tacklesmade");
const all = (label, test, min = 0.95) => check(label, decoded.filter(test).length / decoded.length, min);
all("in-box + outside-box on target = 217", ({ s }) => s.shotsOnTargetInBox + s.shotsOnTargetOutsideBox === s.shotsOnTarget);
all("in-box + outside-box off target = 218", ({ s }) => s.shotsOffTargetInBox + s.shotsOffTargetOutsideBox === s.shotsOffTarget);
all("weak-foot goals <= goals", ({ r, s }) => s.weakFootGoals <= n(r.goals));
all("first-time goals <= goals", ({ r, s }) => s.firstTimeGoals <= n(r.goals));
all("through-ball assists <= assists", ({ r, s }) => s.throughBallAssists <= n(r.assists));
all("out-of-position severities 99-103 sum to 219", ({ r }) => [99, 100, 101, 102, 103].reduce((t, k) => t + n(r[`event_${k}`]), 0) === n(r.event_219));
all("standing + sliding tackles = tackles won", ({ s }) => s.standingTacklesWon + s.slidingTacklesWon === s.tacklesWon, 0.9);
const passDirSum = decoded.filter(({ s }) => s.passesCompleted > 0);
check("forward + backward + sideways passes within 2 of passes made", passDirSum.filter(({ s }) => Math.abs(s.forwardPasses + s.backwardPasses + s.sidewaysPasses - s.passesCompleted) <= 2).length / passDirSum.length, 0.9);

// 2. Shares behave like quality measures (outfield rows with a match rating)
console.log("\n2. Derived shares vs EA match rating (outfield)");
const outfield = decoded.filter(({ r }) => r.pos !== "goalkeeper" && n(r.rating) > 0);
const share = (fn, minDen = 5) => outfield.map(({ r, s }) => [fn(s), n(r.rating)]).filter(([v]) => v && v.den >= minDen).map(([v, rt]) => [v.num / v.den, rt]);
checkCorr("decision score (best/good option vs should-have-passed/use-the-ball)", share((s) => ({ num: s.bestOption + s.goodOption, den: s.bestOption + s.goodOption + s.shouldHavePassedElsewhere + s.useTheBall })), 1);
checkCorr("positional discipline (in position vs out of position)", share((s) => ({ num: s.inPosition, den: s.inPosition + s.outOfPosition })), 1);
checkCorr("pass completion", share((s) => ({ num: s.passesCompleted, den: s.passesCompleted + s.passesFailed })), 1);
checkCorr("tackle success (won vs lost)", share((s) => ({ num: s.tacklesWon, den: s.tacklesWon + s.tacklesLost }), 2), 1);
// Not a quality signal (r is about 0), so the app shows it as a count only and never ranks by it
const ownThird = share((s) => ({ num: s.lostDefensiveThird, den: s.possessionsLost }), 3);
info("share of possession lost in our own third vs rating (shown as a count only)", `r = ${corr(ownThird.map((p) => p[0]), ownThird.map((p) => p[1])).toFixed(3)}`);

// 3. Role profiles make football sense
console.log("\n3. Per-game averages by EA role");
const roles = ["defender", "midfielder", "forward"];
const mean = (list, fn) => list.reduce((t, x) => t + fn(x), 0) / list.length;
const prof = Object.fromEntries(roles.map((pos) => {
  const list = outfield.filter(({ r }) => r.pos === pos);
  return [pos, {
    games: list.length,
    wonAtt: mean(list, ({ s }) => s.wonAttackingThird),
    wonDef: mean(list, ({ s }) => s.wonDefensiveThird),
    aerialAtt: mean(list, ({ s }) => s.aerialsWonAttacking),
    aerialDef: mean(list, ({ s }) => s.aerialsWonDefending),
    inPos: mean(list, ({ s }) => s.inPosition),
    shots: mean(list, ({ s }) => s.shotsOnTarget + s.shotsOffTarget),
    interceptions: mean(list, ({ s }) => s.interceptions),
  }];
}));
for (const pos of roles) {
  const p = prof[pos];
  info(pos.padEnd(10), `${p.games} rows · won in att third ${p.wonAtt.toFixed(2)} · won in own third ${p.wonDef.toFixed(2)} · aerials att ${p.aerialAtt.toFixed(2)} / def ${p.aerialDef.toFixed(2)} · in-position praise ${p.inPos.toFixed(1)} · shots ${p.shots.toFixed(2)} · interceptions ${p.interceptions.toFixed(2)}`);
}
const order = (label, ok) => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); };
order("forwards win the ball in the attacking third most, defenders least", prof.forward.wonAtt > prof.midfielder.wonAtt && prof.midfielder.wonAtt > prof.defender.wonAtt);
order("defenders win the ball in their own third most", prof.defender.wonDef > prof.midfielder.wonDef && prof.midfielder.wonDef > prof.forward.wonDef);
order("defenders win the most defensive aerials, forwards the most attacking ones", prof.defender.aerialDef > prof.forward.aerialDef && prof.forward.aerialAtt > prof.defender.aerialAtt);
order("forwards shoot most, defenders least", prof.forward.shots > prof.midfielder.shots && prof.midfielder.shots > prof.defender.shots);

// 4. Club-level: rebuild club_matches rows and run the same code the app runs
console.log("\n4. App code on rebuilt club matches");
const byTeam = new Map();
for (const r of rows) {
  const id = `${r.matchId}:${r.clubId}`;
  if (!byTeam.has(id)) byTeam.set(id, []);
  byTeam.get(id).push(r);
}
const goalsBy = new Map();
for (const [id, list] of byTeam) goalsBy.set(id, list.reduce((t, r) => t + n(r.goals), 0));
const clubs = new Map();
for (const [id, list] of byTeam) {
  const [matchId, clubId] = id.split(":");
  const other = [...byTeam.keys()].length && [...(byTeam.get(id) ? [] : [])];
  void other;
  const opp = rows.find((r) => r.matchId === matchId && r.clubId !== clubId);
  const scoreFor = goalsBy.get(id);
  const scoreAgainst = opp ? goalsBy.get(`${matchId}:${opp.clubId}`) : 0;
  const result = list.some((r) => n(r.wins) > 0) ? "win" : list.some((r) => n(r.losses) > 0) ? "loss" : "draw";
  const players = Object.fromEntries(list.map((r) => [r.playerId, { playername: r.playername, pos: r.pos, match_event_aggregate_0: r.match_event_aggregate_0 }]));
  const row = {
    id, result, score_for: scoreFor, score_against: scoreAgainst, match_type: "leagueMatch", created_at: null,
    opponent_club_name: "x", match_data: { timestamp: Number(list[0].timestamp), players: { [clubId]: players } },
    player_stats: list.map((r) => ({ ea_username: r.playername, rating: n(r.rating), position: r.pos })),
  };
  if (!clubs.has(clubId)) clubs.set(clubId, []);
  clubs.get(clubId).push(row);
}
const clubMatches = [...clubs.values()].map((rs) => insights.toInsightMatches(rs));
const allMatches = clubMatches.flat();
info("team-matches", `${allMatches.length} across ${clubs.size} clubs`);
check("players get their EA events attached", allMatches.flatMap((m) => m.players).filter((p) => p.events).length / allMatches.flatMap((m) => m.players).length, 0.95);

const pressing = insights.computePressing(allMatches);
for (const b of pressing) info(`pressing ${b.band.padEnd(6)} (${b.range} wins in att third)`, `${b.games} games · ${b.winPct.toFixed(1)}% won · ${b.goalsFor.toFixed(2)} scored · ${b.goalsAgainst.toFixed(2)} conceded`);

const fatigue = new Map();
for (const ms of clubMatches) {
  for (const l of insights.computeSessionFatigue(ms)) {
    const f = fatigue.get(l.label) || { games: 0, wins: 0, dq: 0, dqGames: 0, oop: 0 };
    f.games += l.games;
    f.wins += (l.winPct / 100) * l.games;
    if (l.decisionScore !== null) { f.dq += l.decisionScore * l.games; f.dqGames += l.games; f.oop += l.outOfPositionPerPlayer * l.games; }
    fatigue.set(l.label, f);
  }
}
for (const [label, f] of fatigue) info(`session ${label.padEnd(8)}`, `${f.games} games · ${(f.wins / f.games * 100).toFixed(1)}% won · decision score ${(f.dq / f.dqGames).toFixed(1)}% · out of position ${(f.oop / f.dqGames).toFixed(2)} per player`);

const players = clubMatches.flatMap((ms) => insights.computeAdvancedPlayers(ms, 5));
info("players with 5+ games", players.length);
const shares = players.map((p) => p.derived.forwardShare).filter((v) => v !== null).sort((a, b) => a - b);
const q = (x) => shares[Math.floor(shares.length * x)];
info("forward pass share quartiles (pass style cut-offs)", `25% ${q(0.25).toFixed(1)} · median ${q(0.5).toFixed(1)} · 75% ${q(0.75).toFixed(1)} (app uses ${insights.PASS_STYLE_CUTOFFS?.recycler ?? "?"} / ${insights.PASS_STYLE_CUTOFFS?.progressive ?? "?"})`);
const styles = {};
for (const p of players) if (p.derived.passStyle) styles[p.derived.passStyle] = (styles[p.derived.passStyle] || 0) + 1;
info("pass styles", JSON.stringify(styles));

// Best role is picked by rating, so this checks whether positional discipline agrees with it
const multi = players.filter((p) => p.bestRole);
let better = 0, compared = 0;
for (const p of multi) {
  const best = p.roles.find((r) => r.role === p.bestRole);
  for (const r of p.roles) {
    if (r.role === p.bestRole || r.role === "GK" || r.games < 3 || best.avgRating === null || r.avgRating === null) continue;
    compared++;
    if ((best.positionalDiscipline ?? 0) > (r.positionalDiscipline ?? 0)) better++;
  }
}
info("players with a best role (2+ outfield roles, 3+ games each)", multi.length);
if (compared) info("positional discipline is also higher in the best-rated role", `${better}/${compared} (${pctStr(better / compared)})`);

const pairs = clubMatches.flatMap((ms) => insights.computePartnerships(ms, 5));
const withApart = pairs.filter((p) => p.outOfPositionApart !== null);
info("partnerships (5+ games together)", `${pairs.length}, ${withApart.length} with games apart to compare`);
if (withApart.length) {
  const tighter = withApart.filter((p) => p.outOfPositionTogether < p.outOfPositionApart).length;
  info("pairs out of position less together than apart", `${tighter}/${withApart.length}`);
}
const sample = insights.generateAdvancedInsights(clubMatches.sort((a, b) => b.length - a.length)[0]);
info("insights for the busiest club", sample.length ? "\n        - " + sample.map((i) => i.text).join("\n        - ") : "none");

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
