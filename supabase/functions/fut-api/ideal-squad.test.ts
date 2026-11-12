// Squad Builder's ideal squad: the playstyle read into traits, formations scored on community + style + club, and the
// whole thing (formation, XI, tactics, buy targets) on real PostgreSQL (PGlite) with Claude faked.
import { handle, type Deps } from "./handler.ts";
import { idealSquad, liftPool, MAX_PLAYSTYLE, readPlaystyleWords, scoreFormations, styleFit } from "../_shared/fut/ideal-squad.ts";
import { fold, type FormationPick, type StatPicker, type TeamContext } from "../_shared/fut/knowledge-team.ts";
import { knowledgeDb, ME, rpcOver } from "../_shared/fut/knowledge-test-db.ts";
import { activeRules } from "../_shared/fut/service.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";
import { createSquad, type WorkspaceCard } from "../_shared/fut/xilab/workspace/index.ts";

function assert(ok: unknown, msg = "Assertion failed"): asserts ok { if (!ok) throw new Error(msg); }

let n = 0;
const card = (name: string, rating: number, positions: string[], stats: WorkspaceCard["stats"] = {}): WorkspaceCard =>
  ({ id: `c${++n}`, name, club: `Club ${n}`, league: `League ${n % 3}`, nation: `Nation ${n % 4}`, positions, is_icon: false, is_hero: false, rating, price: 0, owned: true, stats, source: "database" }) as WorkspaceCard;

/** A club that fills any formation, with two strikers, wingers who also play wide midfield, and spare midfielders. */
const club = (): WorkspaceCard[] => [
  card("Keeper One", 86, ["GK"]), card("Left Back", 84, ["LB"]), card("Right Back", 84, ["RB"]),
  card("Centre Back A", 86, ["CB"]), card("Centre Back B", 85, ["CB"]), card("Centre Back C", 82, ["CB"]),
  card("Holder A", 86, ["CDM", "CM"]), card("Holder B", 84, ["CDM", "CM"]), card("Mid A", 87, ["CM", "CAM"]), card("Mid B", 85, ["CM"]), card("Ten", 86, ["CAM", "CM"]),
  card("Wide Left", 87, ["LW", "LM"], { pac: 93 }), card("Wide Right", 86, ["RW", "RM"], { pac: 91 }),
  card("Erling Haaland", 91, ["ST"], { pac: 88, phy: 90 }), card("Quick Striker", 85, ["ST"], { pac: 95 }), card("Slow Striker", 85, ["ST"], { pac: 70 }),
];

const pick = (formation: string, score: number, claims = 4): FormationPick =>
  ({ key: fold(formation).replace(/[^a-z0-9]+/g, "-"), topic: formation, formation, score, net: Math.sign(score) * 0.6, buzz: Math.abs(score), agreement: "leaning", claims, for: claims, against: 0, said: null, cite: null }) as FormationPick;

Deno.test("ideal squad: reading a playstyle and scoring formations", async () => {
  const rules = await activeRules(futMemoryDb(seededRules()) as never);
  const style = readPlaystyleWords("I love two strikers and crossing from out wide, then hitting teams on the counter with pace");
  assert(["two_strikers", "wide_mids", "counter"].every((k) => style.shape.includes(k)) && style.players.includes("pace") && style.players.includes("physical"), JSON.stringify(style));
  assert(style.via === "words" && style.summary.startsWith("You like two strikers"), style.summary);
  const none = readPlaystyleWords("");
  assert(!none.shape.length && !none.players.length && none.summary === "" && styleFit("4-4-2", none) === null);
  assert(readPlaystyleWords("give me the 4231 wide").summary === "You named 4-2-3-1 (2).");

  // Shapes: 4-4-2 (2) has two strikers, wide players and holders; the narrow 4-2-3-1 has none of the first two
  const fit442 = styleFit("4-4-2 (2)", style)!, fit4231 = styleFit("4-2-3-1", style)!;
  assert(fit442.fit === 1 && !fit442.missed.length && fit4231.fit === 0 && fit4231.missed.includes("two strikers"), JSON.stringify([fit442, fit4231]));
  assert(styleFit("5-3-2", readPlaystyleWords("five at the back, solid, don't concede"))!.fit === 1 && styleFit("4-3-3", readPlaystyleWords("wingers cutting inside and a three man midfield"))!.fit === 1);

  // The community backs the wide 4-2-3-1 hardest; the style wants two strikers. Both count and both are shown.
  const base = createSquad({ formation: "4-3-3", owner_id: ME });
  const ranked = [pick("4-2-3-1 (2)", 9), pick("4-4-2", 3), pick("5-2-1-2", -4)];
  const { options, squads } = scoreFormations(base, club(), rules, ranked, style, "4-3-3");
  const top = options[0]!;
  assert(top.style!.fit === 1 && (FORM_STS[top.formation] ?? 0) === 2, `a two-striker shape wins: ${JSON.stringify(options.map((o) => [o.formation, o.score]))}`);
  const by = (f: string) => options.find((o) => o.formation === f)!;
  assert(top.formation === "4-1-3-2" && by("4-4-2 (2)").score === top.score && top.score > by("4-2-3-1 (2)").score && by("4-2-3-1 (2)").score > by("5-2-1-2").score, JSON.stringify(options.map((o) => [o.formation, o.score])));
  assert(by("4-4-2").why.includes("The community backs it (4 claims)") && by("4-4-2").why.includes("it gives you two strikers") && by("4-4-2").club!.filled === 11, by("4-4-2").why);
  assert(by("5-2-1-2").why.includes("cool on it") && by("4-3-3").community === null && by("4-3-3").why.includes("Nobody in the bank"), by("5-2-1-2").why + by("4-3-3").why);
  assert(squads.get(top.formation)!.filled === 11 && options.every((o) => o.score >= 0 && o.score <= 100) && options.length <= 14);

  // No playstyle: the community and the club decide. A named formation gets a push. No bank talk: style and club decide.
  const plain = scoreFormations(base, club(), rules, ranked, none, null).options;
  assert(plain[0]!.formation === "4-2-3-1 (2)" && plain[0]!.style === null, JSON.stringify(plain.map((o) => [o.formation, o.score])));
  const named = scoreFormations(base, club(), rules, ranked, readPlaystyleWords("I want to play 5-2-1-2"), null).options;
  assert(named.find((o) => o.formation === "5-2-1-2")!.why.startsWith("You named it") && named.find((o) => o.formation === "5-2-1-2")!.score > plain.find((o) => o.formation === "5-2-1-2")!.score);
  const quiet = scoreFormations(base, club(), rules, [], style, null).options;
  assert(quiet[0]!.style!.fit === 1 && quiet[0]!.community === null && !quiet[0]!.why.includes("bank"), JSON.stringify(quiet[0]));
  const noClub = scoreFormations(base, [], rules, ranked, style, null).options;
  assert(noClub[0]!.club === null && noClub.length > 3, "works with no club cards");

  // A pace style lifts the quick striker over an equally rated slow one; a community-rated name gets a lift too
  const lifted = liftPool(club(), style, new Map([["mid b", 2]]));
  const r = (name: string) => lifted.find((c) => c.name === name)!.rating!;
  assert(r("Quick Striker") > r("Slow Striker") && r("Mid B") === 87 && r("Keeper One") === 86, JSON.stringify(lifted.map((c) => [c.name, c.rating])));
});

const FORM_STS: Record<string, number> = { "4-4-2": 2, "4-4-2 (2)": 2, "3-5-2": 2, "4-1-2-1-2": 2, "4-1-3-2": 2, "3-1-4-2": 2, "3-4-1-2": 2, "4-2-2-2": 2, "4-2-4": 2 };

const post = (id: string, score: number) => ({
  kind: "reddit", external_id: id, url: `https://www.reddit.com/r/EASportsFC/comments/${id}/`, title: `Post ${id}`, author: "someone",
  community: "r/EASportsFC", published_at: new Date(Date.now() - 86_400_000).toISOString(), score, comments: 10,
  body: "A long enough post body about the meta in FC 27.", excerpt: "A long enough post",
});
const claim = (topic: string, category: string, stance: number, statement: string, strength = 2) =>
  ({ topic_key: fold(topic).replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), topic, category, statement, stance, strength });

Deno.test("ideal squad: formation, XI, tactics and buy targets from the playstyle and the bank", async () => {
  const pg = await knowledgeDb();
  const { rpc } = rpcOver(pg);
  try {
    const rules = await activeRules(futMemoryDb(seededRules()) as never);
    await rpc("kb_collect", { p_sources: [post("i1", 3000), post("i2", 400)] });
    const [a, b] = (await rpc("kb_pending", { p_limit: 10 })).data as { id: string }[];
    const save = (id: string, claims: unknown[]) => rpc("kb_save_reading", { p_source: id, p_status: "read", p_note: "Meta thread", p_claims: claims });
    await save(a!.id, [
      claim("4-2-3-1 (2)", "formations", 1, "Best formation now, two CDMs hold", 3),
      claim("4-4-2", "formations", 1, "Two strikers still work"),
      claim("Balanced defensive approach", "tactics", 1, "Balanced, depth 55 stops the counter", 3),
      claim("Erling Haaland", "players", 1, "Haaland bullies every centre back", 3),
    ]);
    await save(b!.id, [claim("4-2-3-1 Wide", "formations", 1, "Wide 4231 is the meta"), claim("5-2-1-2", "formations", -1, "Too passive after the patch")]);
    await pg.exec(`RESET ROLE;
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '1 hour');
      INSERT INTO fut.player_cards (owner_user_id, source_id, player_name, version, overall, positions, source_card_key) VALUES
        (NULL, 'futgg_catalogue', 'Erling Haaland', 'Rare', 91, '{ST}', '5001'),
        ('${ME}', 'club', 'Erling Haaland', 'Rare', 91, '{ST}', '5001');
      SET ROLE service_role;`);

    const pool = club();
    const base = createSquad({ formation: "4-3-3", owner_id: ME, name: "Main" });
    const team: TeamContext = {
      squad: { id: base.id, name: "Main", formation: "4-3-3", xi: [] }, squads: [], coins: 200_000,
      club: pool.map((c) => ({ name: c.name, rating: c.rating!, positions: c.positions, version: "Rare", playstyles: [], playstyles_plus: [] })),
    };
    const stats: StatPicker = (position) => Promise.resolve(position === "ST" ? [{ card_id: "x2", ea_item_id: 4001, name: "Budget Striker", rating: 84, version: "Rare", price: 12_000, owned: false, score: 88, role: "Poacher", why: "90 Finishing" }] : []);
    const noKey = () => undefined;
    const input = { days: 90, platform: "console" as const };

    // No Claude key: the word reader and the numbers still give a full answer
    const two = await idealSquad({ rpc }, ME, base, pool, rules, { ...input, playstyle: "Two strikers, crosses from out wide and quick counter attacks" }, team, noKey, fetch as never, undefined, stats);
    assert(two.playstyle.via === "words" && (FORM_STS[two.formation] ?? 0) === 2, `two strikers and the bank's 4-4-2: ${two.formation} ${JSON.stringify(two.options.map((o) => [o.formation, o.score]))}`);
    assert(two.plan.formation.name === two.formation && two.plan.formation.basis === "playstyle" && two.squad.formation === two.formation && two.options[0]!.formation === two.formation);
    assert(two.squad.slots.length === 11 && !two.empty.length && two.rating >= 84 && two.chemistry >= 0, JSON.stringify([two.empty, two.rating]));
    const sts = two.squad.slots.filter((s) => s.position === "ST").map((s) => s.card!.name);
    assert(sts.includes("Erling Haaland") && sts.includes("Quick Striker"), `the pacey striker partners Haaland: ${sts}`);
    assert(two.squad.slots.every((s) => pool.some((c) => c.id === s.card!.id && c.rating === s.card!.rating)), "real club cards come back, not the lifted ones");
    const haaland = two.squad.slots.find((s) => s.card!.name === "Erling Haaland")!;
    assert(two.notes[haaland.slot]?.includes("the community rates him") && two.notes[haaland.slot]!.includes("90 strength"), JSON.stringify(two.notes));
    assert(two.plan.positions.find((g) => g.position === "ST")?.in_formation === 2 && two.plan.positions.find((g) => g.position === "ST")!.by_stats[0]?.name === "Budget Striker", "buy targets follow the chosen formation");
    assert(two.options.length <= 6 && two.options.some((o) => o.formation === "4-2-3-1 (2)" && o.community!.score > 0));

    // No playstyle: the community's formation; a formation the user picks wins over both
    const plain = await idealSquad({ rpc }, ME, base, pool, rules, { ...input, playstyle: "  " }, team, noKey, fetch as never, undefined, stats);
    assert(plain.formation === "4-2-3-1 (2)" && plain.playstyle.summary === "" && plain.plan.tactics.recommended.length === 1, plain.formation);
    const forced = await idealSquad({ rpc }, ME, base, pool, rules, { ...input, playstyle: "two strikers", formation: "5-4-1" }, team, noKey, fetch as never, undefined, stats);
    assert(forced.formation === "5-4-1" && forced.squad.slots.filter((s) => s.position === "CB").length === 3 && forced.options[0]!.formation !== "5-4-1");
    // Locked players stay; an empty club still gets a formation and a plan
    const locked = { ...base, slots: base.slots.map((s) => s.slot === "ST" ? { ...s, card: pool.find((c) => c.name === "Slow Striker")!, locked: true } : s) };
    const keep = await idealSquad({ rpc }, ME, locked, pool, rules, { ...input, playstyle: "pace up front, one striker", formation: "4-3-3" }, team, noKey, fetch as never, undefined, stats);
    assert(keep.squad.slots.find((s) => s.slot === "ST")!.card!.name === "Slow Striker" && keep.squad.slots.find((s) => s.slot === "ST")!.locked);
    const bare = await idealSquad({ rpc }, ME, base, [], rules, { ...input, playstyle: "wingers and a number 10" }, { ...team, club: [] }, noKey, fetch as never, undefined, stats);
    assert(bare.empty.length === 11 && bare.rating === 0 && bare.options[0]!.style!.fit === 1 && bare.plan.positions.length > 0, JSON.stringify([bare.formation, bare.empty.length]));

    // With Claude: it reads the style, and the plan is told the style and why the formation was picked
    const calls: { system: string; user: string }[] = [];
    const fetcher = (url: string, init?: RequestInit) => {
      if (!url.includes("api.anthropic.com")) return Promise.resolve(new Response("nope", { status: 404 }));
      const body = JSON.parse(String(init?.body));
      calls.push({ system: body.system, user: typeof body.messages[0].content === "string" ? body.messages[0].content : JSON.stringify(body.messages[0].content) });
      const reply = body.system.includes("Turn it into traits")
        ? { shape: ["back_five", "two_strikers", "made_up"], players: ["defending"], summary: "You sit in with five at the back and break with two up top." }
        : { summary: "A back five with two strikers suits you.", formation_why: "", settings: [{ setting: "Depth", value: "40", why: "You sit deep", cites: [], inferred: true }], instructions: [], for_your_team: ["Haaland leads the line."], player_positions: [] };
      return Promise.resolve(new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply) }] })));
    };
    const key = (k: string) => k === "ANTHROPIC_API_KEY" ? "k" : undefined;
    let checks = 0;
    const ai = await idealSquad({ rpc }, ME, base, pool, rules, { ...input, playstyle: "I park the bus and nick it late" }, team, key, fetcher, () => { checks++; }, stats);
    assert(ai.playstyle.via === "ai" && JSON.stringify(ai.playstyle.shape) === '["back_five","two_strikers"]' && ai.playstyle.summary.startsWith("You sit in"), JSON.stringify(ai.playstyle));
    assert(ai.squad.slots.filter((s) => s.position === "CB").length === 3 && (FORM_STS[ai.formation] ?? 0) === 2 && ai.formation !== "5-2-1-2" && ai.plan.via === "ai" && ai.plan.settings[0]!.setting === "Depth" && checks === 1, `${ai.formation} ${checks}`);
    assert(calls.length === 2 && calls[0]!.user === "I park the bus and nick it late" && calls[1]!.system.includes('like to play: "I park the bus and nick it late"') && calls[1]!.system.includes(`decided already: ${ai.formation} (picked for how the player likes to play`), calls[1]!.system.slice(0, 900));
    let limited = "";
    await idealSquad({ rpc }, ME, base, pool, rules, { ...input, playstyle: "x" }, team, key, fetcher, () => { throw new Error("too many"); }, stats).catch((e) => { limited = (e as Error).message; });
    assert(limited === "too many" && calls.length === 2, "the hourly cap is checked before Claude");
    // Claude down: the word reader and the numbers carry on
    const down = await idealSquad({ rpc }, ME, base, pool, rules, { ...input, playstyle: "two strikers" }, team, key, () => Promise.resolve(new Response("{}", { status: 529 })), undefined, stats);
    assert(down.playstyle.via === "words" && (FORM_STS[down.formation] ?? 0) === 2 && down.plan.via === "data", `${down.playstyle.via} ${down.formation} ${down.plan.via}`);
  } finally { await pg.close(); }
});

Deno.test("ideal squad route: checks its input", async () => {
  const deps: Deps = { db: futMemoryDb(seededRules()), userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  const call = async (body: unknown) => {
    const res = await handle(new Request("http://local/functions/v1/fut-api/v1/squads/ideal", { method: "POST", headers: { "content-type": "application/json", "x-test-user": ME }, body: JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() as { error?: string } };
  };
  const squad = createSquad({ formation: "4-3-3", owner_id: ME });
  const long = await call({ squad, playstyle: "x".repeat(MAX_PLAYSTYLE + 1) });
  assert(long.status === 400 && long.data.error?.includes("under 600"), JSON.stringify(long));
  assert((await call({ squad, playstyle: 5 })).status === 400 && (await call({ squad, playstyle: "wingers", formation: "9-9-9" })).status === 400 && (await call({ squad, playstyle: "wingers", days: 900 })).status === 400);
});
