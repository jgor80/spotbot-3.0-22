import assertNode from "node:assert/strict";
import {
  accelerate, accelerateType, apAtLevel, apSpent, ARCHETYPES, attrCap, ATTRIBUTES, BODY, bodyEffects, buildPath, buildSummary, costBetween, costTier, decodeBuild, emptyBuild,
  encodeBuild, importProClubsBuilder, levelNeeded, matchValue, MAX_PLAYSTYLES, menuValue, normaliseBuild, PLAYSTYLE_DEFS, playstyleSlots, playstyleStatus, pointCost,
  raiseFor, SPECIALIZATIONS, specializationStatus, startValue, trainable,
} from "../../../src/lib/proBuild.ts";
import { ATTRIBUTE_KEYS } from "../../../src/lib/proClubsData.ts";

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
  const b = { ...importProClubsBuilder(pcbLink)!.build, playstyles: ["Jockey", "Intercept", "Relentless"], specialization: "marauder.athlete" };
  const code = encodeBuild(b);
  ok(/^[A-Za-z0-9_-]+$/.test(code), "url-safe");
  ok(code.length < 260, `short enough for chat (${code.length})`);
  eq(decodeBuild(code), b);
  ok(buildPath(b).startsWith("/build?b="));
  eq(decodeBuild(encodeBuild(emptyBuild())), emptyBuild());
  eq(decodeBuild("garbage"), null);
  eq(decodeBuild(""), null);
});

Deno.test("old gb1 share codes still open, with the old PlayStyle numbering", () => {
  // gb1~arch~level~h~w~sm~wf~budget~attrs~styles~name ; old style 8 was "Game Changer", 16 "Rapid"
  const old = btoa("gb1~finisher~30~180~78~4~4~300~0.10,4.12~8,16~Old link");
  const b = decodeBuild(old)!;
  eq([b.archetype, b.level, b.heightCm, b.weightKg, b.skillMoves, b.weakFoot], ["finisher", 30, 180, 78, 4, 4]);
  eq(b.points, { [ATTRIBUTES[0].key]: 10, [ATTRIBUTES[4].key]: 12 });
  eq(b.playstyles, ["Gamechanger", "Rapid"]);
  eq([b.name, b.budget, b.specialization], ["Old link", null, null]);
});

Deno.test("builds are cleaned up: ranges, caps, signatures and the four PlayStyle slots", () => {
  const b = normaliseBuild({ archetype: "nope", level: 999, heightCm: 10, skillMoves: 9, points: { finishing: -3, heading: 5, bogus: 7, sprintSpeed: 500 }, playstyles: ["Rapid", "Rapid", "Made Up", "Game Changer", "Low Driven Shot"], name: "a|b" });
  eq(b.archetype, "finisher");
  eq([b.level, b.heightCm, b.skillMoves], [55, BODY.finisher.h[0], 5]);
  eq(b.points.headingAccuracy, 5);
  eq(startValue("finisher", "sprintSpeed") + b.points.sprintSpeed, attrCap("finisher", "sprintSpeed"), "points stop at the cap");
  eq(b.playstyles, ["Rapid", "Gamechanger"], "old names map over, signatures are automatic, unknown ones go");
  eq(b.name, "a b");
  const many = normaliseBuild({ playstyles: ["Finesse Shot", "Chip Shot", "Power Shot", "Dead Ball", "Precision Header", "Acrobatic"] });
  eq(many.playstyles.length, MAX_PLAYSTYLES);
  eq(MAX_PLAYSTYLES, 4);
  eq(normaliseBuild({ archetype: "finisher", playstyles: ["Far Reach"] }).playstyles, [], "keeper styles only for keepers");
  eq(normaliseBuild({ archetype: "boss", specialization: "finisher.finisher" }).specialization, null, "specialization must match the archetype");
});

Deno.test("summary: AP by level, overspend and the level a build needs", () => {
  const marauder = importProClubsBuilder(pcbLink)!.build;
  const s = buildSummary(marauder);
  eq([s.available, s.spent], [apAtLevel(40), apSpent(marauder)]);
  eq(s.remaining, s.available - s.spent);
  ok(s.spent > s.available, "this imported build is more than level 40 gives");
  ok(s.notes[0].includes(`needs level ${s.levelNeeded}`));
  eq(buildSummary({ ...marauder, level: 55 }).notes, []);
  const locked = buildSummary({ ...emptyBuild("boss"), level: 55, playstyles: ["Finesse Shot"] });
  ok(locked.notes.some((n) => n.includes("Not unlocked yet: Finesse Shot")));
  const tooMany = buildSummary({ ...emptyBuild("boss"), level: 5, playstyles: ["Bruiser", "Jockey"] });
  ok(tooMany.notes.some((n) => n.includes("1 PlayStyle slot")));
});

Deno.test("AP comes from the level, capped at 55", () => {
  eq([1, 10, 20, 40, 55].map(apAtLevel), [100, 224, 397, 962, 1419]);
  eq(apAtLevel(99), 1419);
  eq(levelNeeded(100), 1);
  eq(levelNeeded(1419), 55);
  eq(levelNeeded(1420), null);
  for (let l = 2; l <= 55; l++) ok(apAtLevel(l) > apAtLevel(l - 1), `AP grows at level ${l}`);
});

Deno.test("prices follow the published worked examples", () => {
  eq(costBetween("marauder", "crossing", 75, 90), 92);
  eq(costBetween("boss", "crossing", 45, 90), 194);
  eq(costBetween("target", "sprintSpeed", 65, 92), 274);
  eq(costBetween("finisher", "finishing", 75, 99), 374);
  // a point gets dearer the higher it goes, and dearer on a higher price tier
  ok(pointCost("finisher", "finishing", 99) > pointCost("finisher", "finishing", 70));
  for (const a of ARCHETYPES) for (const k of ATTRIBUTE_KEYS) if (trainable(a.key, k)) ok(costTier(a.key, k) >= 1 && costTier(a.key, k) <= 4, `${a.key}.${k} tier`);
});

// AP to reach each specialization from a fresh level-1 build, as published by the community (Nov 2026)
const SPEC_COSTS: Record<string, number> = {"shotstopper.shotstopper":455,"shotstopper.octopus":503,"shotstopper.spider":559,"sweeperkeeper.sweeperkeeper":380,"sweeperkeeper.launcher":428,"sweeperkeeper.extra":559,"progressor.progressor":401,"progressor.pioneer":543,"progressor.janitor":575,"boss.boss":316,"boss.capitano":519,"boss.enforcer":548,"marauder.marauder":353,"marauder.athlete":462,"marauder.speedster":545,"disruptor.disruptor":454,"disruptor.destroyer":497,"disruptor.anchor":618,"recycler.recycler":412,"recycler.thief":438,"recycler.driver":470,"maestro.heartbeat":397,"maestro.crasher":485,"maestro.maestro":544,"creator.creator":372,"creator.architect":394,"creator.sniper":509,"spark.joker":326,"spark.spark":465,"spark.ace":495,"magician.invader":348,"magician.magician":386,"magician.hotshot":525,"finisher.finisher":308,"finisher.hunter":388,"finisher.presser":457,"target.target":392,"target.runner":485,"target.roamer":573};

Deno.test("every specialization costs what the published table says from a fresh build", () => {
  eq(SPECIALIZATIONS.length, 39);
  for (const spec of SPECIALIZATIONS) {
    const st = specializationStatus(emptyBuild(spec.archetype)).find((s) => s.spec.key === spec.key)!;
    eq(st.apToReach, SPEC_COSTS[spec.key], spec.key);
    const reached = specializationStatus(raiseFor(emptyBuild(spec.archetype), spec.req)).find((s) => s.spec.key === spec.key)!;
    ok(reached.met, `${spec.key} met after raiseFor`);
  }
});

Deno.test("PlayStyles: signatures are automatic, others unlock by attribute, keepers keep theirs", () => {
  const boss = playstyleStatus({ ...emptyBuild("boss"), level: 55 });
  const by = (n: string) => boss.find((s) => s.def.name === n)!;
  eq(by("Bruiser").signature > 0 && by("Bruiser").unlocked, true);
  eq(by("Bruiser").plus, true, "level 55 makes both signatures PlayStyle+");
  const fresh = playstyleStatus(emptyBuild("boss"));
  eq(fresh.find((s) => s.def.name === "Precision Header")!.apToUnlock, 30);
  eq(fresh.find((s) => s.def.name === "Slide Tackle")!.apToUnlock, 15);
  ok(by("Precision Header").apToUnlock! < 30, "the level 55 mastery point counts towards unlocks");
  for (const n of ["Finesse Shot", "Gamechanger", "Incisive Pass", "Inventive"]) eq(by(n).apToUnlock, null, `${n} out of reach for a Boss`);
  eq(playstyleStatus({ ...emptyBuild("boss"), level: 19 }).filter((s) => s.plus).length, 0);
  eq(playstyleStatus({ ...emptyBuild("boss"), level: 20 }).filter((s) => s.plus).length, 1);
  eq([1, 5, 15, 40, 55].map(playstyleSlots), [0, 1, 2, 3, 4]);
  eq(PLAYSTYLE_DEFS.filter((p) => !p.keeperOnly).length + PLAYSTYLE_DEFS.filter((p) => p.keeperOnly).length, PLAYSTYLE_DEFS.length);
});

Deno.test("body: height and weight shift attributes in matches only", () => {
  const t = { ...emptyBuild("target"), heightCm: 195, weightKg: 80 };
  eq(bodyEffects(t), { jumping: 1, sprintSpeed: 5, strength: 1, acceleration: -1, agility: -1, balance: -5 });
  eq(menuValue(t, "balance"), startValue("target", "balance"), "the menu doesn't show body effects");
  eq(matchValue(t, "balance"), startValue("target", "balance") - 5);
  eq(bodyEffects(emptyBuild("target")), {});
});

Deno.test("AcceleRATE comes from height and in-match Agility, Strength and Acceleration", () => {
  // A 195 cm Target is strong and tall: Lengthy
  const t = { ...emptyBuild("target"), heightCm: 195, weightKg: 80 };
  eq(accelerateType(t), "Lengthy");
  // A short, agile, quick Spark: Explosive once Acceleration reaches 80
  const spark = normaliseBuild({ ...emptyBuild("spark"), heightCm: 170, points: { acceleration: 30, agility: 20 } });
  eq(accelerateType(spark), "Explosive");
  const r = accelerate(spark);
  ok(r.explosive.every((c) => c.ok));
  // Too tall for Explosive: Controlled
  eq(accelerateType({ ...spark, heightCm: 186 }), "Controlled");
  ok(accelerate({ ...spark, heightCm: 186 }).explosive.some((c) => c.label === "Height" && !c.ok));
  // A facility boost counts (in matches)
  const slow = normaliseBuild({ ...spark, points: { ...spark.points, acceleration: 0 } });
  const needed = 80 - matchValue(slow, "acceleration");
  if (needed > 0 && needed <= 10) eq(accelerateType({ ...slow, boosts: { acceleration: needed } }), "Explosive");
});

Deno.test("archetype and attribute lists line up with the share format", () => {
  eq(ARCHETYPES.length, 13);
  eq(new Set(ATTRIBUTES.map((a) => a.key)).size, ATTRIBUTES.length);
});

Deno.test("masteries from other archetypes and club facility boosts, kept in share codes", () => {
  // Finisher mastery is Composure + Finishing, and it counts on every archetype, a Boss included
  const boss = emptyBuild("boss");
  const base = menuValue(boss, "finishing");
  const withMastery = normaliseBuild({ ...boss, masteryLevels: { finisher: 55, nope: 9 } });
  eq(withMastery.masteryLevels, { finisher: 55 });
  eq(menuValue(withMastery, "finishing"), base + 2, "finishing is Finisher's second mastery attribute: +1 at 10, +1 at 30");
  eq(menuValue(normaliseBuild({ ...boss, masteryLevels: { finisher: 9 } }), "finishing"), base, "nothing below level 10");
  // Facility boosts: in matches only, capped at BOOST_MAX
  const boosted = normaliseBuild({ ...boss, boosts: { strength: 4, gkDiving: 3, crossing: 99 } });
  eq(boosted.boosts, { strength: 4, crossing: 10 });
  eq(matchValue(boosted, "strength", {}), Math.min(99, menuValue(boosted, "strength") + 4));
  eq(menuValue(boosted, "strength"), menuValue(boss, "strength"));
  // Round trip through a gb3 code; builds without either stay gb2
  const code = encodeBuild({ ...withMastery, boosts: { strength: 4 } });
  ok(atob(code.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (code.length % 4)) % 4)).startsWith("gb3~"));
  eq(decodeBuild(code), normaliseBuild({ ...withMastery, boosts: { strength: 4 } }));
  ok(atob(encodeBuild(boss).replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (encodeBuild(boss).length % 4)) % 4)).startsWith("gb2~"));
});
