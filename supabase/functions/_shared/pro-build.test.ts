import assertNode from "node:assert/strict";
import { ARCHETYPES, ATTRIBUTES, buildPath, buildSummary, decodeBuild, emptyBuild, encodeBuild, importProClubsBuilder, normaliseBuild } from "../../../src/lib/proBuild.ts";

const eq = (a: unknown, b: unknown, msg?: string) => assertNode.deepEqual(a, b, msg);
const ok = (v: unknown, msg?: string) => assertNode.ok(v, msg);

// A real Pro Clubs Builder share (their format: base64 of the pipe-separated build)
const PCB = "1|5|40|182|73|2|3|acceleration:13,sprintSpeed:13,stamina:5,aggression:8,strength:20,jumping:15,crossing:7,curve:5,longPassing:13,shortPassing:12,vision:10,reactions:12,ballControl:10,agility:8,balance:5,standingTackle:12,slidingTackle:6,defAware:15,interceptions:15|||All Around Fullback|";
const pcbLink = `https://proclubsbuilder.co.uk/b/${btoa(PCB)}`;

Deno.test("imports a Pro Clubs Builder link", () => {
  const r = importProClubsBuilder(pcbLink)!;
  ok(r, "parsed");
  eq(r.skipped, []);
  eq(r.build.archetype, "marauder");
  eq([r.build.level, r.build.heightCm, r.build.weightKg, r.build.skillMoves, r.build.weakFoot], [40, 182, 73, 2, 3]);
  eq(r.build.name, "All Around Fullback");
  eq(Object.keys(r.build.points).length, 19);
  eq(r.build.points.defAware, 15);
  eq(r.build.points.strength, 20);
  // Bare code, trailing slash and query string all work; junk doesn't
  eq(importProClubsBuilder(btoa(PCB))?.build.archetype, "marauder");
  eq(importProClubsBuilder(`${pcbLink}/?ref=x`)?.build.level, 40);
  eq(importProClubsBuilder("https://proclubsbuilder.co.uk/builder"), null);
  eq(importProClubsBuilder("not a link"), null);
});

Deno.test("unknown attributes from an import are reported, not guessed", () => {
  const r = importProClubsBuilder(btoa("1|12|10|180|75|3|3|finishing:10,mysteryStat:4|||Poacher|"))!;
  eq(r.build.archetype, "finisher");
  eq(r.build.points, { finishing: 10 });
  eq(r.skipped, ["mysteryStat"]);
});

Deno.test("share codes round-trip and stay short", () => {
  const b = { ...importProClubsBuilder(pcbLink)!.build, playstyles: ["Jockey", "Intercept", "Relentless"], budget: 220 };
  const code = encodeBuild(b);
  ok(/^[A-Za-z0-9_-]+$/.test(code), "url-safe");
  ok(code.length < 260, `short enough for chat (${code.length})`);
  eq(decodeBuild(code), b);
  ok(buildPath(b).startsWith("/build?b="));
  eq(decodeBuild(encodeBuild(emptyBuild())), emptyBuild());
  eq(decodeBuild("garbage"), null);
  eq(decodeBuild(""), null);
});

Deno.test("builds are cleaned up: ranges, unknown PlayStyles and the PlayStyle cap", () => {
  const b = normaliseBuild({ archetype: "nope", level: 999, heightCm: 10, skillMoves: 9, points: { finishing: -3, heading: 5, bogus: 7 }, playstyles: ["Rapid", "Rapid", "Made Up"], name: "a|b" });
  eq(b.archetype, emptyBuild().archetype);
  eq([b.level, b.heightCm, b.skillMoves], [100, 150, 5]);
  eq(b.points, { headingAccuracy: 5 });
  eq(b.playstyles, ["Rapid"]);
  eq(b.name, "a b");
  const many = normaliseBuild({ playstyles: ["Finesse Shot", "Chip Shot", "Power Shot", "Dead Ball", "Precision Header", "Acrobatic", "Low Driven Shot", "Power Header", "Game Changer", "Incisive Pass", "Pinged Pass"] });
  eq(many.playstyles.length, 10);
});

Deno.test("summary: points left, overspend and odd choices", () => {
  const marauder = importProClubsBuilder(pcbLink)!.build;
  const s = buildSummary({ ...marauder, budget: 220 });
  eq([s.spent, s.remaining], [204, 16]);
  eq(s.notes, []);
  ok(buildSummary({ ...marauder, budget: 200 }).notes[0].includes("4 points over"));
  const keeperPoints = buildSummary({ ...emptyBuild("finisher"), points: { gkDiving: 10, finishing: 2 } });
  ok(keeperPoints.notes.some((n) => n.includes("Goalkeeping points do nothing")));
  const offPlan = buildSummary({ ...emptyBuild("boss"), points: { finishing: 20 } });
  ok(offPlan.notes.some((n) => n.includes("isn't what a Boss is built around")));
});

Deno.test("archetype and attribute lists line up with the share format", () => {
  eq(ARCHETYPES.length, 13);
  eq(new Set(ATTRIBUTES.map((a) => a.key)).size, ATTRIBUTES.length);
});
