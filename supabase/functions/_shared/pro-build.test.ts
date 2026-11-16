import assertNode from "node:assert/strict";
import {
  applyProfile,
  cleanProfile,
  accelerate, accelerateType, apAtLevel, apSpent, ARCHETYPES, attrCap, ATTRIBUTES, BODY, bodyEffects, buildPath, buildSummary, costBetween, costTier, decodeBuild, emptyBuild,
  encodeBuild, importProClubsBuilder, levelNeeded, matchValue, MAX_PLAYSTYLES, menuValue, normaliseBuild, PLAYSTYLE_DEFS, playstyleSlots, playstyleStatus, pointCost,
  raiseFor, SPECIALIZATIONS, specializationStatus, startValue, trainable,
  levelRewards, levelNeededEstimate, limitToLevel, masteryText, nextStarCost, starCost, starRule, starsAp, LEVEL_CAP, HEIGHT_RANGE, WEIGHT_RANGE,
} from "../../../src/lib/proBuild.ts";
import {
  AP_BY_LEVEL, AP_BY_LEVEL_ESTIMATE, ATTR_MAX, ATTRIBUTE_KEYS, CAPS, COST_BANDS, COST_TIERS, MASTERIES, MASTERY_MILESTONES, PLAYSTYLE_SLOT_LEVELS,
  SIGNATURE_PERK_LEVELS, SIGNATURE_PLUS_LEVELS, STARS, START_VALUES, ARCHETYPE_RULES,
} from "../../../src/lib/proClubsData.ts";

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

Deno.test("a player's saved masteries and facility boosts apply to every build", () => {
  const profile = cleanProfile({ masteryLevels: { spark: 30, nope: 9 }, boosts: { finishing: 3, gkDiving: 2, junk: 4 } } as never);
  assertNode.deepEqual(profile, { masteryLevels: { spark: 30 }, boosts: { finishing: 3, gkDiving: 2 } });
  const striker = applyProfile(emptyBuild("finisher"), profile, { target: 20, spark: 12 });
  assertNode.deepEqual(striker.masteryLevels, { spark: 30, target: 20 }); // higher of profile and saved builds
  assertNode.deepEqual(striker.boosts, { finishing: 3 }); // keeper boosts only on keepers
  assertNode.deepEqual(applyProfile(emptyBuild("shotstopper"), profile).boosts, { finishing: 3, gkDiving: 2 });
  // Removing a boost from the profile removes it from builds that had it
  assertNode.deepEqual(applyProfile({ ...striker, boosts: { finishing: 5 } }, { boosts: {} }).boosts, {});
});

// ---------- The data layer checks itself, so a new season's edit can't leave the tables out of step ----------

Deno.test("data tables line up: every archetype has every table, and the level lists fit under the cap", () => {
  const keys = ARCHETYPES.map((a) => a.key).sort();
  for (const [name, table] of Object.entries({ START_VALUES, COST_TIERS, CAPS, BODY, STARS, MASTERIES, ARCHETYPE_RULES })) eq(Object.keys(table).sort(), keys, `${name} covers all archetypes`);
  for (const a of keys) {
    for (const table of [START_VALUES, COST_TIERS, CAPS]) eq(table[a].length, ATTRIBUTE_KEYS.length, `${a} row length`);
    ATTRIBUTE_KEYS.forEach((k, i) => {
      const [start, tier, cap] = [START_VALUES[a][i], COST_TIERS[a][i], CAPS[a][i]];
      eq([start > 0, tier > 0], [cap > 0, cap > 0], `${a}.${k}: trainable in all three tables or none`);
      if (cap) ok(start <= cap && cap <= ATTR_MAX, `${a}.${k}: start ${start} <= ceiling ${cap} <= ${ATTR_MAX}`);
    });
    for (const kind of ["skillMoves", "weakFoot"] as const) {
      const r = STARS[a][kind];
      ok(r.start >= 1 && r.max <= 5 && r.start <= r.max, `${a} ${kind} range`);
      eq(r.cost.length, r.max - r.start, `${a} ${kind}: one price per extra star`);
    }
    for (const sig of ARCHETYPE_RULES[a].signatures) ok(PLAYSTYLE_DEFS.some((p) => p.name === sig), `${a} signature ${sig} is a PlayStyle`);
  }
  eq(LEVEL_CAP, AP_BY_LEVEL.length - 1, "the cap is the last level with AP");
  const levels = [...PLAYSTYLE_SLOT_LEVELS, ...SIGNATURE_PLUS_LEVELS, ...SIGNATURE_PERK_LEVELS, ...MASTERY_MILESTONES.map((m) => m.level)];
  for (const l of levels) ok(l >= 1 && l <= LEVEL_CAP, `level ${l} is within the cap`);
  for (const list of [PLAYSTYLE_SLOT_LEVELS, MASTERY_MILESTONES.map((m) => m.level)]) eq([...list].sort((x, y) => x - y), list, "levels ascend");
  eq(COST_BANDS[COST_BANDS.length - 1][0], ATTR_MAX, "the last price band reaches the top of the scale");
  for (let i = 1; i < COST_BANDS.length; i++) ok(COST_BANDS[i][0] > COST_BANDS[i - 1][0], "price bands ascend");
  for (const p of PLAYSTYLE_DEFS) for (const k of Object.keys(p.req)) ok((ATTRIBUTE_KEYS as readonly string[]).includes(k), `${p.name} needs a real attribute`);
  for (const sp of SPECIALIZATIONS) {
    ok(PLAYSTYLE_DEFS.some((p) => p.name === sp.plus), `${sp.key} gives a real PlayStyle`);
    for (const [k, need] of sp.req) ok(need <= attrCap(sp.archetype, k), `${sp.key}: ${k} ${need} is under the ceiling`);
  }
  // No attribute is in two Mastery pairs (EA's table)
  const mastered = Object.values(MASTERIES).flat();
  eq(new Set(mastered).size, mastered.length);
  eq(HEIGHT_RANGE, [162, 200]);
  eq(WEIGHT_RANGE, [60, 100]);
});

Deno.test("ceilings reproduce the published lists of which PlayStyles each archetype can't reach", () => {
  // Pro Clubs HQ, PlayStyle requirements guide: outfield archetypes over the 30 outfield PlayStyles, keepers over all 36
  const OUT: Record<string, string[]> = {
    finisher: ["Anticipate", "Jockey"], magician: ["Anticipate", "Jockey"], target: ["Anticipate", "Jockey"],
    spark: [], creator: [], disruptor: [], maestro: [], recycler: [], marauder: [], progressor: [],
    boss: ["Finesse Shot", "Gamechanger", "Incisive Pass", "Inventive"],
    shotstopper: ["Acrobatic", "Dead Ball", "Finesse Shot", "Gamechanger", "Low Driven Shot", "Power Shot", "Incisive Pass", "Inventive", "Anticipate", "Jockey", "Slide Tackle", "Rapid", "Technical", "Trickster", "Bruiser"],
    sweeperkeeper: ["Acrobatic", "Dead Ball", "Finesse Shot", "Gamechanger", "Low Driven Shot", "Power Shot", "Incisive Pass", "Inventive", "Jockey", "Bruiser"],
  };
  for (const a of ARCHETYPES) {
    const gk = a.line === "GK";
    const out = PLAYSTYLE_DEFS.filter((p) => (gk || !p.keeperOnly) && Object.entries(p.req).some(([k, need]) => need! > attrCap(a.key, k))).map((p) => p.name);
    eq(out.sort(), [...OUT[a.key]].sort(), `${a.key} can't reach`);
  }
  // Their ceilings summary: Reactions is 99 on every outfield archetype; the Finisher reaches 99 in nine, the Disruptor and Marauder in two
  const at99 = (a: string) => ATTRIBUTE_KEYS.filter((k) => attrCap(a, k) === 99).length;
  eq([at99("finisher"), at99("disruptor"), at99("marauder")], [9, 2, 2]);
  for (const a of ARCHETYPES) if (a.line !== "GK") eq(attrCap(a.key, "reactions"), 99);
  eq([attrCap("spark", "acceleration"), attrCap("spark", "sprintSpeed"), attrCap("disruptor", "stamina"), attrCap("boss", "curve"), attrCap("finisher", "slidingTackle")], [99, 95, 99, 75, 75]);
  // and the cheapest PlayStyle prices they quote from a fresh build
  const cost = (a: string, n: string) => playstyleStatus(emptyBuild(a)).find((s) => s.def.name === n)!.apToUnlock;
  eq([cost("finisher", "Chip Shot"), cost("creator", "Whipped Pass"), cost("recycler", "Slide Tackle"), cost("maestro", "First Touch"), cost("disruptor", "Slide Tackle"), cost("progressor", "Power Shot")], [52, 31, 21, 31, 26, 265]);
  eq(costBetween("spark", "sprintSpeed", 75, 90), 129);
});

Deno.test("skill move and weak foot stars: each archetype's range, and extra stars cost AP", () => {
  // Published totals from each archetype's starting stars to its maximum: [skill moves, weak foot]
  const TOTALS: Record<string, [string, number, string, number]> = {
    shotstopper: ["1-2", 5, "1-3", 30], sweeperkeeper: ["1-3", 15, "1-4", 48], progressor: ["2-4", 30, "3-4", 25], boss: ["2-3", 10, "2-4", 55],
    marauder: ["2-5", 65, "3-5", 65], disruptor: ["2-4", 30, "3-5", 85], recycler: ["2-4", 23, "3-5", 65], maestro: ["2-5", 65, "3-5", 65],
    creator: ["2-5", 65, "3-5", 65], spark: ["3-5", 40, "3-5", 65], magician: ["3-5", 55, "3-5", 65], finisher: ["3-5", 40, "3-5", 85], target: ["2-5", 65, "2-5", 105],
  };
  for (const a of ARCHETYPES) {
    const sm = starRule(a.key, "skillMoves"), wf = starRule(a.key, "weakFoot");
    eq([`${sm.start}-${sm.max}`, starCost(a.key, "skillMoves", sm.max), `${wf.start}-${wf.max}`, starCost(a.key, "weakFoot", wf.max)], TOTALS[a.key], a.key);
    eq(starsAp(emptyBuild(a.key)), 0, "starting stars are free");
  }
  // Published star by star: a Finisher's skill moves cost 15 then 25, weak foot 35 then 50
  eq([starCost("finisher", "skillMoves", 4), nextStarCost("finisher", "skillMoves", 4), nextStarCost("finisher", "skillMoves", 5)], [15, 25, null]);
  eq([starCost("finisher", "weakFoot", 4), starCost("finisher", "weakFoot", 5)], [35, 85]);
  // They come out of the same budget, and a build can't hold stars its archetype doesn't allow
  const f = normaliseBuild({ archetype: "finisher", skillMoves: 5, weakFoot: 4, points: { finishing: 5 } });
  eq(apSpent(f), costBetween("finisher", "finishing", 75, 80) + 40 + 35);
  eq(buildSummary(f).starsAp, 75);
  eq([normaliseBuild({ archetype: "boss", skillMoves: 5, weakFoot: 1 }).skillMoves, normaliseBuild({ archetype: "boss", skillMoves: 5, weakFoot: 1 }).weakFoot], [3, 2]);
  eq(decodeBuild(encodeBuild(f)), f);
});

Deno.test("level rewards and mastery wording come from the data tables", () => {
  // The published FC 27 ladder
  eq(levelRewards(), [
    { level: 5, rewards: ["PlayStyle slot 1"] },
    { level: 10, rewards: ["Signature Perk 1", "Mastery +1 +1"] },
    { level: 15, rewards: ["PlayStyle slot 2"] },
    { level: 20, rewards: ["Signature 1 becomes PlayStyle+"] },
    { level: 30, rewards: ["Mastery +1"] },
    { level: 40, rewards: ["PlayStyle slot 3"] },
    { level: 45, rewards: ["Signature Perk 2"] },
    { level: 55, rewards: ["PlayStyle slot 4", "Signature 2 becomes PlayStyle+", "Mastery +1"] },
  ]);
  eq(masteryText("finisher", (k) => k), "+1 composure and +1 finishing at level 10, +1 finishing at 30, +1 composure at 55");
  // A fully mastered archetype is worth +2 on both of its attributes
  const all = normaliseBuild({ archetype: "boss", masteryLevels: { finisher: LEVEL_CAP } });
  eq([menuValue(all, "composure") - startValue("boss", "composure"), menuValue(all, "finishing") - startValue("boss", "finishing")], [2, 2]);
});

Deno.test("past today's cap the level needed is an estimate from FC 26's ladder", () => {
  // The estimate ladder is the real one up to the cap, then keeps rising
  eq(AP_BY_LEVEL_ESTIMATE.slice(0, AP_BY_LEVEL.length), AP_BY_LEVEL);
  ok(AP_BY_LEVEL_ESTIMATE.length > AP_BY_LEVEL.length);
  for (let i = AP_BY_LEVEL.length; i < AP_BY_LEVEL_ESTIMATE.length; i++) ok(AP_BY_LEVEL_ESTIMATE[i] > AP_BY_LEVEL_ESTIMATE[i - 1], `level ${i}`);
  eq(levelNeededEstimate(1419), { level: 55, estimate: false });
  eq(levelNeededEstimate(1420), { level: 56, estimate: true });
  eq(levelNeededEstimate(1444), { level: 56, estimate: true });
  eq(levelNeededEstimate(1445), { level: 57, estimate: true });
  // FC 26 gave 3,167 AP at level 100
  eq(levelNeededEstimate(3167), { level: 100, estimate: true });
  eq(levelNeededEstimate(3168), null);
  // A build past the cap says so, as an estimate
  const pts: Record<string, number> = {};
  for (const a of ATTRIBUTES) if (trainable("finisher", a.key)) pts[a.key] = attrCap("finisher", a.key) - startValue("finisher", a.key);
  const s = buildSummary(normaliseBuild({ archetype: "finisher", level: LEVEL_CAP, points: pts }));
  eq(s.levelNeeded, null);
  ok(s.spent > apAtLevel(LEVEL_CAP));
  eq(s.levelEstimate, levelNeededEstimate(s.spent)?.level ?? null);
  if (s.levelEstimate) ok(s.notes[0].includes(`Estimate: about level ${s.levelEstimate}`));
});

Deno.test("limit to my level: edits can't spend more AP than the level gives", () => {
  const base = normaliseBuild({ archetype: "finisher", level: 1 });
  const left = apAtLevel(1) - apSpent(base);
  // One attribute dragged to its ceiling stops where the AP runs out
  const dragged = limitToLevel(base, normaliseBuild({ ...base, points: { finishing: attrCap("finisher", "finishing") - startValue("finisher", "finishing") } }));
  ok(dragged.points.finishing > 0);
  ok(apSpent(dragged) <= apAtLevel(1));
  ok(apSpent(dragged) + pointCost("finisher", "finishing", startValue("finisher", "finishing") + dragged.points.finishing + 1) > apAtLevel(1));
  // An edit inside the budget goes through untouched
  const small = normaliseBuild({ ...base, points: { finishing: 1 } });
  ok(apSpent(small) - apSpent(base) <= left);
  eq(limitToLevel(base, small), small);
  // Lowering the level stops at the level the build needs
  const high = normaliseBuild({ archetype: "finisher", level: 40, points: { finishing: 20, composure: 15 } });
  const need = levelNeeded(apSpent(high))!;
  ok(need > 1 && need <= 40);
  eq(limitToLevel(high, { ...high, level: 1 }).level, need);
  // A multi-attribute jump that doesn't fit is refused whole (same object back)
  const big = normaliseBuild({ ...base, points: { finishing: 30, composure: 30, sprintSpeed: 30 } });
  ok(apSpent(big) > apAtLevel(1));
  ok(limitToLevel(base, big) === base);
  // A star the level can't pay for is refused
  const rule = starRule("finisher", "weakFoot");
  const starred = normaliseBuild({ ...dragged, weakFoot: rule.max });
  if (apSpent(starred) > apAtLevel(1)) ok(limitToLevel(dragged, starred) === dragged);
  // A build that is already over can still be brought down
  const overB = normaliseBuild({ ...big });
  const less = normaliseBuild({ ...overB, points: { ...overB.points, finishing: 29 } });
  eq(limitToLevel(overB, less), less);
});
