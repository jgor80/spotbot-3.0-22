// Knowledge Bank for my team: applying a topic or source to a squad, and the community game plan (formation, tactics,
// players by position with price and owned), on real PostgreSQL (PGlite) with Claude faked.
import { handle, type Deps } from "./handler.ts";
import {
  applyToTeam, EMPTY_TEAM, fold, formationName, mentions, playerLookup, playstylesIn, priceOutlook, quickApply, teamPlan, type StatPicker, type TeamContext,
} from "../_shared/fut/knowledge-team.ts";
import { knowledgeDb, ME, OTHER, rpcOver } from "../_shared/fut/knowledge-test-db.ts";

function assert(ok: unknown, msg = "Assertion failed"): asserts ok { if (!ok) throw new Error(msg); }

const team: TeamContext = {
  squad: { id: "sq1", name: "Main", formation: "4-4-2", xi: [
    { slot: "GK", position: "GK", name: "Gianluigi Donnarumma", rating: 89 },
    { slot: "LST", position: "ST", name: "Erling Haaland", rating: 91 },
    { slot: "RST", position: "ST", name: null, rating: null },
  ] },
  squads: [{ id: "sq1", name: "Main", formation: "4-4-2" }],
  club: [
    { name: "Erling Haaland", rating: 91, positions: ["ST"], version: "Rare", playstyles: ["Power Shot"], playstyles_plus: ["Acrobatic"] },
    { name: "Gianluigi Donnarumma", rating: 89, positions: ["GK"], version: "Rare", playstyles: [], playstyles_plus: [] },
    { name: "Rodri", rating: 90, positions: ["CDM", "CM"], version: "Rare", playstyles: ["Intercept"], playstyles_plus: ["Tiki Taka"] },
    { name: "Vinícius Júnior", rating: 90, positions: ["LW", "LM"], version: "Rare", playstyles: ["Finesse Shot", "Rapid"], playstyles_plus: ["Trickster"] },
  ],
  coins: 150_000,
};

Deno.test("knowledge team helpers: formations, names, PlayStyles, quick check", () => {
  assert(formationName("4-2-3-1 (2)") === "4-2-3-1 (2)" && formationName("4231 wide") === "4-2-3-1 (2)" && formationName("4-2-3-1") === "4-2-3-1");
  assert(formationName("4-3-3 holding") === "4-3-3 (2)" && formationName("4-3-3 attack") === "4-3-3 (4)" && formationName("5-2-1-2 is broken") === "5-2-1-2");
  assert(formationName("4-4-2 (2)") === "4-4-2 (2)" && formationName("Rivals") === null && formationName("2-2-2") === null && formationName("4-4-4") === null);
  assert(fold("Vinícius Júnior") === "vinicius junior" && fold("Ødegaard") === "odegaard");
  assert(mentions("TOTW Vinicius is cracked", "Vinícius Júnior") === false, "first names alone don't count");
  assert(mentions("Junior on the left wing", "Vinícius Júnior") && mentions("Rodri at CDM", "Rodri") && !mentions("Rodrigo at CB", "Rodri"));
  const lookup = playerLookup("TOTW Kylian Mbappé (92)");
  assert(lookup?.name === "kylian mbappe" && lookup.last === "mbappe", JSON.stringify(lookup));
  assert(playerLookup("Rodri")?.last === "" && playerLookup("??") === null);
  assert(JSON.stringify(playstylesIn("Finesse Shot+ wingers and Rapid")) === JSON.stringify([{ name: "Finesse Shot", plus: true }, { name: "Rapid", plus: false }]), JSON.stringify(playstylesIn("Finesse Shot+ wingers and Rapid")));

  const m = quickApply([
    { topic: "4-4-2", category: "formations", statement: "Two strikers: Haaland up top with a runner", stance: 1 },
    { topic: "Finesse Shot+", category: "playstyles", statement: "Finesse Shot+ wingers are the meta", stance: 1 },
  ], team);
  assert(m[0]!.kind === "formation" && m[0]!.text.includes("You play 4-4-2"), JSON.stringify(m));
  assert(m.some((x) => x.kind === "player" && x.players[0] === "Erling Haaland" && x.text.includes("in your squad")), JSON.stringify(m));
  const fs = m.find((x) => x.kind === "playstyle")!;
  assert(fs.text === "None of your club cards has Finesse Shot+.", fs.text);
  const other = quickApply([{ topic: "4-2-3-1 (2)", category: "formations", statement: "Wide 4231 holds", stance: 1 }], team);
  assert(other[0]!.text === "This is about 4-2-3-1 (2); you play 4-4-2.", other[0]!.text);
  assert(quickApply([{ topic: "4-4-2 (2)", category: "formations", statement: "x", stance: 1 }], team)[0]!.text.includes("variant"));
  assert(quickApply([{ topic: "4-4-2", category: "formations", statement: "x", stance: 1 }], EMPTY_TEAM)[0]!.text.includes("Save a squad"));

  // Price moves read for a buyer and for an owner
  const row = (price: number, d3: number | null, low14: number, high14: number) => ({ ea_item_id: 1, price, d1: null, d3, d7: null, low14, high14 });
  assert(priceOutlook(row(90_000, 100_000, 80_000, 120_000), false)?.signal === "falling" && priceOutlook(row(90_000, 100_000, 80_000, 120_000), false)!.call.includes("wait"));
  assert(priceOutlook(row(82_000, 100_000, 80_000, 120_000), false)?.signal === "falling", "still dropping at its low isn't a buy yet");
  assert(priceOutlook(row(82_000, 83_000, 80_000, 120_000), false)?.signal === "near_low" && priceOutlook(row(82_000, 83_000, 80_000, 120_000), false)!.call.includes("good time to buy"), "levelled off at the low is");
  assert(priceOutlook(row(119_000, 100_000, 80_000, 120_000), true)?.call.includes("good time to sell") && priceOutlook(row(105_000, 100_000, 100_000, 106_000), false)?.signal === "rising");
  assert(priceOutlook(row(100_000, 100_000, 99_000, 101_000), false)?.signal === "steady" && priceOutlook(undefined, false) === null);
});

const post = (id: string, score: number) => ({
  kind: "reddit", external_id: id, url: `https://www.reddit.com/r/EASportsFC/comments/${id}/`, title: `Post ${id}`, author: "someone",
  community: "r/EASportsFC", published_at: new Date(Date.now() - 86_400_000).toISOString(), score, comments: 10,
  body: "A long enough post body about the meta in FC 27.", excerpt: "A long enough post",
});
const claim = (topic: string, category: string, stance: number, statement: string, strength = 2) =>
  ({ topic_key: fold(topic).replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), topic, category, statement, stance, strength });

function claudeFake(reply: (system: string) => unknown) {
  const calls: { system: string; user: string }[] = [];
  const fetcher = (url: string, init?: RequestInit) => {
    if (!url.includes("api.anthropic.com")) return Promise.resolve(new Response("nope", { status: 404 }));
    const body = JSON.parse(String(init?.body));
    calls.push({ system: body.system, user: typeof body.messages[0].content === "string" ? body.messages[0].content : JSON.stringify(body.messages[0].content) });
    return Promise.resolve(new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply(body.system)) }] })));
  };
  return { calls, fetcher };
}

Deno.test("knowledge team: game plan and applying topics and sources, with and without Claude", async () => {
  const pg = await knowledgeDb();
  const { rpc } = rpcOver(pg);
  try {
    await rpc("kb_collect", { p_sources: [post("t1", 3000), post("t2", 400), post("t3", 50)] });
    const [a, b, c] = (await rpc("kb_pending", { p_limit: 10 })).data as { id: string }[];
    const save = (id: string, claims: unknown[]) => rpc("kb_save_reading", { p_source: id, p_status: "read", p_note: "Meta thread", p_claims: claims });
    await save(a!.id, [
      claim("4-2-3-1 (2)", "formations", 1, "Best formation now, two CDMs hold", 3),
      claim("4-2-3-1 Wide", "formations", 1, "Wide 4231 is the meta"),
      claim("5-2-1-2", "formations", -1, "Too passive after the patch"),
      claim("Balanced defensive approach", "tactics", 1, "Balanced, depth 55 stops the counter", 3),
      claim("Kylian Mbappé", "players", 1, "Mbappé is the best ST in the game", 3),
      claim("Rodri", "players", 1, "Rodri at CDM wins everything"),
      claim("Finesse Shot+", "playstyles", 1, "Finesse Shot+ is the best PlayStyle"),
    ]);
    await save(b!.id, [
      claim("High press", "tactics", -1, "Pressing after possession loss drains stamina", 2),
      claim("Mbappe", "players", 1, "Mbappe pace is unreal"),
      claim("Silva", "players", 1, "Silva is a bargain"),
      claim("4-4-2", "formations", -1, "Gets overrun in midfield"),
    ]);
    await save(c!.id, [claim("4-4-2", "formations", 1, "Two strikers still work")]);
    // The card list: two Mbappé versions (one owned via the club's synced card), Rodri, two different Silvas
    await pg.exec(`RESET ROLE;
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '1 hour');
      INSERT INTO fut.player_cards (owner_user_id, source_id, player_name, version, overall, positions, source_card_key) VALUES
        (NULL, 'futgg_catalogue', 'Kylian Mbappé', 'Rare', 91, '{ST,LW}', '1001'),
        (NULL, 'futgg_catalogue', 'Kylian Mbappé', 'TOTW', 93, '{ST}', '1002'),
        (NULL, 'futgg_catalogue', 'Rodri', 'Rare', 90, '{CDM}', '2001'),
        (NULL, 'futgg_catalogue', 'Bernardo Silva', 'Rare', 86, '{CM}', '3001'),
        (NULL, 'futgg_catalogue', 'Thiago Silva', 'Rare', 84, '{CB}', '3002'),
        ('${ME}', 'club', 'Kylian Mbappé', 'Rare', 91, '{ST}', '1001');
      INSERT INTO fut.futgg_prices SELECT x.id, 27, 'console', (SELECT published_at FROM fut.futgg_snapshots), x.price
        FROM (VALUES (1001, 1500000), (1002, 2400000), (2001, 600000), (4001, 12000)) x(id, price);
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '4 days');
      INSERT INTO fut.futgg_prices SELECT x.id, 27, 'console', (SELECT min(published_at) FROM fut.futgg_snapshots), x.price
        FROM (VALUES (1001, 1300000), (2001, 700000), (4001, 15000)) x(id, price);
      SET ROLE service_role;`);

    // Without Claude: the numbers alone
    const noKey = () => undefined;
    const asked: [string, number | null][] = [];
    const stats: StatPicker = (position, maxPrice) => {
      asked.push([position, maxPrice]);
      return Promise.resolve(position === "ST"
        ? [{ card_id: "x1", ea_item_id: 1001, name: "Kylian Mbappé", rating: 91, version: "Rare", price: 1_500_000, owned: true, score: 95, role: "Advanced Forward", why: "97 Acceleration" },
           { card_id: "x2", ea_item_id: 4001, name: "Budget Striker", rating: 84, version: "Rare", price: 12_000, owned: false, score: 88, role: "Poacher", why: "90 Finishing" }]
        : position === "CAM" ? [{ card_id: "x3", ea_item_id: 4002, name: "Stat Ten", rating: 86, version: "Rare", price: 40_000, owned: false, score: 90, role: "Playmaker", why: "92 Vision" }] : []);
    };
    const plan = await teamPlan({ rpc }, ME, { days: 30, platform: "console" }, team, noKey, fetch as never, undefined, stats);
    assert(plan.via === "data" && plan.claims === 12, JSON.stringify({ via: plan.via, claims: plan.claims }));
    assert(plan.formation.recommended?.formation === "4-2-3-1 (2)" && plan.formation.recommended.claims === 2, `the two wide 4-2-3-1 topics add up: ${JSON.stringify(plan.formation.ranked)}`);
    assert(plan.formation.yours?.formation === "4-4-2" && plan.formation.ranked.at(-1)!.formation === "5-2-1-2", JSON.stringify(plan.formation.ranked.map((f) => [f.formation, f.score])));
    assert(JSON.stringify(plan.formation.positions) === '["GK","LB","CB","RB","CDM","LM","RM","CAM","ST"]', JSON.stringify(plan.formation.positions));
    assert(plan.tactics.recommended[0]!.topic === "Balanced defensive approach" && plan.tactics.avoid[0]!.topic === "High press", JSON.stringify(plan.tactics));
    assert(plan.playstyles.recommended[0]!.topic === "Finesse Shot+");
    const st = plan.positions.find((g) => g.position === "ST")!;
    const mbappes = st.community.filter((p) => p.card?.player_name === "Kylian Mbappé");
    assert(mbappes.length === 2 && mbappes.every((p) => p.owned && p.card!.owned && p.card!.price === 1_500_000 && p.versions[0]!.version === "TOTW"), `owned Rare shown first, TOTW as another version: ${JSON.stringify(st.community)}`);
    assert(st.in_formation === 1 && st.yours[0]!.name === "Erling Haaland" && st.yours[0]!.in_squad, JSON.stringify(st.yours));
    const cdm = plan.positions.find((g) => g.position === "CDM")!;
    assert(cdm.community[0]!.topic === "Rodri" && cdm.community[0]!.owned && cdm.community[0]!.card!.price === 600_000 && cdm.community[0]!.owned_card?.rating === 90, "Rodri owned through the club list");
    const other = plan.positions.find((g) => g.position === "Other")!;
    assert(other.community[0]!.topic === "Silva" && other.community[0]!.card === null, "a surname that finds two different players isn't guessed");
    assert(plan.positions.at(-1)!.position === "Other" && plan.positions[0]!.position === "GK");
    const t1 = plan.citations.find((c) => c.url!.includes("/t1/"))!.n;
    assert(plan.citations.length === 2 && plan.formation.recommended.cite === t1, `only cited sources are listed: ${JSON.stringify(plan.citations)}`);
    assert(plan.team.squad?.formation === "4-4-2" && plan.team.coins === 150_000 && plan.team.club_size === 4);
    // Everything else it knows is used too: a longer look back when the period is thin, stat picks for every position, price moves
    assert(plan.widened_from === null && plan.formation.name === "4-2-3-1 (2)" && plan.formation.basis === "community" && plan.confidence === "low", JSON.stringify([plan.widened_from, plan.days, plan.formation.basis, plan.confidence]));
    assert(asked.length === 9 && asked.every(([, max]) => max === 150_000), "stat picks for all nine positions, within the coins");
    assert(st.by_stats.length === 1 && st.by_stats[0]!.name === "Budget Striker" && st.by_stats[0]!.outlook?.signal === "falling", `players already talked about aren't repeated; prices read: ${JSON.stringify(st.by_stats)}`);
    assert(plan.positions.find((g) => g.position === "CAM")!.by_stats[0]!.name === "Stat Ten", "a position nobody talks about still gets players");
    assert(mbappes[0]!.card!.outlook?.signal === "near_high" && mbappes[0]!.card!.outlook.call.includes("good time to sell") && mbappes[0]!.card!.affordable === null, JSON.stringify(mbappes[0]!.card));
    assert(cdm.community[0]!.card!.outlook?.signal === "falling" && plan.prices_at !== null, JSON.stringify(cdm.community[0]!.card));

    // With Claude: settings, instructions and notes for the team; the formation still comes from the numbers
    const f = claudeFake((system) => system.includes("game plan") ? {
      summary: "People back the wide 4-2-3-1 with a balanced block.", formation_why: "Two CDMs hold [1].",
      settings: [{ setting: "Defensive approach", value: "Balanced, depth 55", why: "Stops counters", cites: [2, 99], inferred: false }, { setting: "", value: "x", why: "", cites: [], inferred: false },
        { setting: "Width", value: "45", why: "Narrow suits two CDMs", cites: [], inferred: false }],
      instructions: [{ position: "cdm", instruction: "Stay back while attacking", why: "Shield the back four", cites: [1], inferred: false }],
      for_your_team: ["Move Vinícius to LM in the wide 4-2-3-1."],
      player_positions: [{ topic: "Silva", position: "CM" }],
    } : {});
    const ai = await teamPlan({ rpc }, ME, { days: 30, platform: "console", refresh: true }, team, (k) => k === "ANTHROPIC_API_KEY" ? "k" : undefined, f.fetcher, undefined, stats);
    assert(ai.via === "ai" && ai.summary?.includes("wide 4-2-3-1") && ai.formation.recommended?.formation === "4-2-3-1 (2)");
    assert(ai.settings.length === 2 && JSON.stringify(ai.settings[0]!.cites) === "[2]" && !ai.settings[0]!.inferred && ai.settings[1]!.inferred, `bad rows and unknown citations dropped, an uncited row is marked inferred: ${JSON.stringify(ai.settings)}`);
    assert(f.calls[0]!.user.includes("Budget Striker 84 (Poacher 88, 12,000, falling)") && f.calls[0]!.user.includes("Falling (") && f.calls[0]!.system.includes("Never say there is not enough data"), f.calls[0]!.user.slice(-900));
    assert(ai.instructions[0]!.position === "CDM" && ai.for_your_team.length === 1);
    assert(ai.positions.find((g) => g.position === "CM")?.community[0]?.topic === "Silva", "Claude places a player the card list couldn't");
    assert(f.calls[0]!.user.includes("Vinícius Júnior") && f.calls[0]!.user.includes(`[${t1}] 4-2-3-1 (2)`) && f.calls[0]!.system.includes("decided already: 4-2-3-1 (2)"), f.calls[0]!.user.slice(0, 500));
    const cached = await teamPlan({ rpc }, ME, { days: 30, platform: "console" }, team, (k) => k === "ANTHROPIC_API_KEY" ? "k" : undefined, f.fetcher, undefined, stats);
    assert(cached === ai && f.calls.length === 1, "the plan is kept for a while unless refreshed");
    let limited = "";
    await teamPlan({ rpc }, ME, { days: 30, platform: "console", refresh: true }, team, (k) => k === "ANTHROPIC_API_KEY" ? "k" : undefined, f.fetcher, () => { throw new Error("too many"); }, stats).catch((e) => { limited = (e as Error).message; });
    assert(limited === "too many", "the hourly cap is checked before Claude");

    // A thin period reads further back instead of waiting, and a formation is always named
    await pg.exec(`RESET ROLE; UPDATE fut.kb_claims SET said_at = now() - interval '60 days'; SET ROLE service_role;`);
    const old = await teamPlan({ rpc }, ME, { days: 30, platform: "console", refresh: true }, team, noKey, fetch as never, undefined, stats);
    assert(old.widened_from === 30 && old.days === 365 && old.formation.name === "4-2-3-1 (2)", JSON.stringify([old.widened_from, old.days, old.formation.name]));
    const empty = await teamPlan({ rpc }, OTHER, { days: 7, platform: "console" }, { ...team, squad: null }, noKey, fetch as never, undefined, stats);
    assert(empty.claims === 12 && empty.widened_from === 7, "the shared bank, read further back");
    await pg.exec(`RESET ROLE; UPDATE fut.kb_claims SET category = 'other' WHERE category = 'formations'; SET ROLE service_role;`);
    const noTalk = await teamPlan({ rpc }, ME, { days: 365, platform: "console", refresh: true }, team, noKey, fetch as never, undefined, stats);
    assert(noTalk.formation.recommended === null && noTalk.formation.name === "4-4-2" && noTalk.formation.basis === "your_squad" && noTalk.positions.some((g) => g.position === "ST" && g.in_formation === 2), "no formation talk: built on your own shape");
    const bare = await teamPlan({ rpc }, OTHER, { days: 365, platform: "console" }, EMPTY_TEAM, noKey, fetch as never, undefined, stats);
    assert(bare.formation.name === "4-2-3-1" && bare.formation.basis === "default" && bare.confidence === "low");
    await pg.exec(`RESET ROLE; UPDATE fut.kb_claims SET category = 'formations', said_at = now() - interval '1 day' WHERE topic_key ~ '^[345]-'; UPDATE fut.kb_claims SET said_at = now() - interval '1 day'; SET ROLE service_role;`);

    // Applying a topic and a source
    const topic = await applyToTeam({ rpc }, ME, { topic: "4-4-2" }, team, noKey, fetch as never);
    assert(topic.via === "data" && topic.about.title === "4-4-2" && topic.matches[0]!.text.includes("You play 4-4-2") && topic.advice === null, JSON.stringify(topic));
    const g = claudeFake(() => ({ fit: "high", headline: "Your 4-4-2 is what they're arguing about.", points: ["Haaland fits the runner role.", ""], actions: ["Try Balanced, depth 55."] }));
    const src = await applyToTeam({ rpc }, ME, { source: a!.id }, team, (k) => k === "CLAUDE_API_KEY" ? "k" : undefined, g.fetcher);
    assert(src.via === "ai" && src.about.kind === "source" && src.about.claims === 7 && src.advice?.fit === "high" && src.advice.points.length === 1, JSON.stringify(src));
    assert(src.matches.some((x) => x.kind === "player" && x.players[0] === "Rodri") && src.matches.some((x) => x.text.includes("Finesse Shot+")), JSON.stringify(src.matches));
    assert(g.calls[0]!.user.includes("Squad \"Main\" in 4-4-2") && g.calls[0]!.user.includes("Mbappé is the best ST"), g.calls[0]!.user);
    let missing = "";
    await applyToTeam({ rpc }, ME, { source: "00000000-0000-0000-0000-00000000dead" }, team, noKey, fetch as never).catch((e) => { missing = (e as Error).message; });
    assert(missing.includes("isn't in the knowledge bank"), missing);

    // A private note's claims apply for its owner only
    const note = (await rpc("kb_add", { p_user: ME, p_source: { kind: "note", title: "My notes", body: "notes body long enough to keep", shared: false } })).data as string;
    await save(note, [claim("4-4-2", "formations", 1, "My 4-4-2 notes")]);
    assert((await applyToTeam({ rpc }, ME, { source: note }, team, noKey, fetch as never)).about.claims === 1);
    let hidden = "";
    await applyToTeam({ rpc }, OTHER, { source: note }, EMPTY_TEAM, noKey, fetch as never).catch((e) => { hidden = (e as Error).message; });
    assert(hidden.includes("isn't in the knowledge bank"), "someone else's private note");

    // Through the routes (no squads or club in this test database: the plan still works from the bank alone)
    const db = { ...rpcOver(pg), from: () => ({}) };
    const deps: Deps = { db: db as unknown as Deps["db"], userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k], isBot: () => Promise.resolve(false) };
    // deno-lint-ignore no-explicit-any
    const call = async (path: string, method = "GET", body?: unknown): Promise<{ status: number; data: any }> => {
      const res = await handle(new Request(`http://local/functions/v1/fut-api/v1${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
      return { status: res.status, data: await res.json() };
    };
    const route = await call("/knowledge/team-plan?days=30");
    assert(route.status === 200 && route.data.data.formation.recommended.formation === "4-2-3-1 (2)" && route.data.data.team.squad === null, JSON.stringify(route.data).slice(0, 400));
    const applied = await call("/knowledge/apply", "POST", { topic: "5-2-1-2" });
    assert(applied.status === 200 && applied.data.data.matches[0].text.includes("Save a squad"), JSON.stringify(applied.data));
    assert((await call("/knowledge/apply", "POST", {})).status === 400);
    assert((await call("/knowledge/apply", "POST", { topic: "nobody-talks-about-this" })).status === 404);
  } finally {
    await pg.close();
  }
});
