import assertNode from "node:assert/strict";

const assert = (v: unknown, msg?: string) => assertNode.ok(v, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => assertNode.deepEqual(a, b, msg);
const assertMatch = (s: string, re: RegExp) => assertNode.match(s, re);
import { compareClubs, eaMatchToRow, eaMembers, eaOverall, parseCompareParam, publicClubPath, publicClubView, type PublicClubPayload } from "../../../src/lib/publicClub.ts";
import { clearCache, handle } from "./handler.ts";

const agg = (counts: Record<number, number>) => Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(",");

// i: newest = 0; we win 3-1 most nights, lose 0-2 every fourth game
function eaMatch(i: number, us = "100", them = "200") {
  const lose = i % 4 === 3;
  const sf = lose ? 0 : 3, sa = lose ? 2 : 1;
  const side = (names: string[], strong: boolean) =>
    Object.fromEntries(names.map((n, j) => [`p${j}`, {
      playername: n,
      pos: j === 0 ? "forward" : j === 1 ? "midfielder" : j === 2 ? "defender" : "goalkeeper",
      rating: strong ? "7.6" : "6.4",
      goals: j === 0 && strong ? String(sf) : "0",
      assists: j === 1 && strong ? "1" : "0",
      mom: j === 0 && strong ? "1" : "0",
      match_event_aggregate_0: agg(strong ? { 215: 25, 216: 4, 13: 4, 217: 6, 106: 3, 0: 2 } : { 215: 15, 216: 6, 13: 1, 217: 3, 106: 1 }),
    }]));
  return {
    matchId: `m${i}`,
    timestamp: 1_790_000_000 - i * 3600,
    clubs: { [us]: { goals: String(sf), details: { name: "Us FC" } }, [them]: { goals: String(sa), details: { name: `Rivals ${i}` } } },
    players: { [us]: side(["Nine", "Eight", "Five", "One"], !lose), [them]: side(["A", "B", "C", "D"], lose) },
  };
}

const payload = (id: string, n = 12): PublicClubPayload => ({
  clubId: id,
  platform: "common-gen5",
  name: `Club ${id}`,
  crest: null,
  overall: eaOverall([{ clubId: id, gamesPlayed: "100", wins: id === "100" ? "60" : "40", ties: "10", losses: id === "100" ? "30" : "50", goals: "250", goalsAgainst: "150", skillRating: id === "100" ? "1650" : "1500", bestDivision: "2", titlesWon: "3", promotions: "4", relegations: "1" }]),
  members: eaMembers({ members: [{ name: "Nine", gamesPlayed: "50", goals: "60", assists: "10", ratingAve: "7.9", manOfTheMatch: "12", favoritePosition: "forward", passSuccessRate: "78" }] }),
  rows: Array.from({ length: n }, (_, i) => eaMatchToRow(eaMatch(i, id), id, "league")!),
  fetchedAt: new Date().toISOString(),
});

Deno.test("a raw EA match becomes a club_matches-style row", () => {
  const row = eaMatchToRow(eaMatch(0), "100", "league")!;
  assertEquals(row.result, "win");
  assertEquals([row.score_for, row.score_against], [3, 1]);
  assertEquals(row.opponent_club_name, "Rivals 0");
  assertEquals(row.match_type, "leagueMatch");
  const stats = row.player_stats as { ea_username: string; goals: number; motm: boolean }[];
  assertEquals(stats.find((p) => p.ea_username === "Nine")?.goals, 3);
  assert(stats.find((p) => p.ea_username === "Nine")?.motm);
  assertEquals(eaMatchToRow({ clubs: { "100": { goals: 1 } } }, "100", "league"), null);
});

Deno.test("members and overall stats parse EA's string numbers", () => {
  const p = payload("100");
  assertEquals(p.members[0].goals, 60);
  assertEquals(p.members[0].rating, 7.9);
  assertEquals(p.overall?.skillRating, 1650);
  assertEquals(p.overall?.draws, 10);
  assertEquals(eaOverall(null), null);
  assertEquals(eaMembers([]), []);
});

Deno.test("the page view: form, team scores out of 1000, verdicts and player scores", () => {
  const v = publicClubView(payload("100"));
  assertEquals(v.recent.games, 12);
  assertEquals(v.recent.wins, 9);
  assertEquals(v.form.slice(0, 4), ["win", "win", "win", "loss"]);
  assert(v.areas.attack !== null && v.areas.attack >= 0 && v.areas.attack <= 1000);
  assert(v.areas.ratingEdge !== null && v.areas.ratingEdge > 500);
  assertEquals(v.results.length, 12);
  assert(v.players.some((s) => s.name === "Nine"));
});

Deno.test("club vs club marks the better side", () => {
  const { rows } = compareClubs(payload("100"), payload("300", 6));
  const sr = rows.find((r) => r.label === "Skill rating")!;
  assertEquals(sr.values, ["1650", "1500"]);
  assertEquals(sr.better, 0);
  const win = rows.find((r) => r.label === "All-time win rate")!;
  assertEquals(win.better, 0);
  assert(rows.some((r) => r.label.endsWith("(out of 1000)")));
});

Deno.test("links and compare params", () => {
  assertEquals(publicClubPath("nx", "42"), "/club/nx/42");
  assertEquals(parseCompareParam("common-gen5:123"), { platform: "common-gen5", clubId: "123" });
  assertEquals(parseCompareParam("ps5:123"), null);
  assertEquals(parseCompareParam("nx:abc"), null);
});

Deno.test("the function: search, club, errors and caching", async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  let status = 200;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (status !== 200) return Promise.resolve(new Response("denied", { status }));
    if (url.includes("allTimeLeaderboard/search")) return Promise.resolve(Response.json([{ clubId: 100, clubInfo: { name: "Us FC", customKit: { crestAssetId: "99" } }, skillRating: "1650" }]));
    if (url.includes("clubs/info")) return Promise.resolve(Response.json({ "100": { name: "Us FC", clubId: 100, customKit: { crestAssetId: "99" } } }));
    if (url.includes("overallStats")) return Promise.resolve(Response.json([{ clubId: "100", gamesPlayed: "10", wins: "7", ties: "1", losses: "2", goals: "20", goalsAgainst: "9" }]));
    if (url.includes("members/stats")) return Promise.resolve(Response.json({ members: [{ name: "Nine", gamesPlayed: "10" }] }));
    if (url.includes("matchType=leagueMatch")) return Promise.resolve(Response.json([eaMatch(0), eaMatch(1)]));
    return Promise.resolve(Response.json([]));
  }) as typeof fetch;
  try {
    clearCache();
    const get = (q: string) => handle(new Request(`http://x/public-club?${q}`));
    const search = await (await get("search=us&platform=common-gen5")).json();
    assertEquals(search.clubs[0].clubId, "100");
    assertMatch(search.clubs[0].crest, /l99\.png$/);

    const res = await get("clubId=100&platform=common-gen5");
    assertEquals(res.status, 200);
    const club = await res.json();
    assertEquals(club.name, "Us FC");
    assertEquals(club.rows.length, 2);
    assertEquals(club.overall.wins, 7);
    const n = calls.length;
    await get("clubId=100&platform=common-gen5");
    assertEquals(calls.length, n, "second load comes from the cache");

    assertEquals((await get("clubId=abc&platform=common-gen5")).status, 400);
    assertEquals((await get("clubId=1&platform=ps5")).status, 400);
    assertEquals((await get("search=a")).status, 400);
    assertEquals((await handle(new Request("http://x/public-club", { method: "POST" }))).status, 405);

    status = 403;
    clearCache();
    const blocked = await get("clubId=100&platform=common-gen5");
    assertEquals(blocked.status, 503);
    assertMatch((await blocked.json()).error, /EA/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
