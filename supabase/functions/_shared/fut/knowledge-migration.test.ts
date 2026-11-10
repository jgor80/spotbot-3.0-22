// Knowledge bank SQL in real PostgreSQL (PGlite): collecting, reading, the map, a topic, search, privacy and cleanup.
import { knowledgeDb, ME, OTHER, rpcOver } from "./knowledge-test-db.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const post = (id: string, score: number, daysAgo: number) => ({
  kind: "reddit", external_id: id, url: `https://www.reddit.com/r/EASportsFC/comments/${id}/`, title: `Post ${id}`, author: "someone",
  community: "r/EASportsFC", published_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), score, comments: 10,
  body: "A long enough post body about the meta in FC 27.", excerpt: "A long enough post",
});

Deno.test("knowledge bank: collect, read, map, topic, search, privacy, cleanup", async () => {
  const db = await knowledgeDb();
  const { rpc } = rpcOver(db);
  try {
    const n = await rpc("kb_collect", { p_sources: [post("a1", 2000, 2), post("a2", 50, 20), post("a3", 5, 1), { ...post("bad", 1, 1), body: "short" }] });
    assert(n.error === null && n.data === 3, `three stored, the short one dropped: ${JSON.stringify(n)}`);
    const again = await rpc("kb_collect", { p_sources: [{ ...post("a1", 3000, 2) }] });
    assert(again.data === 0, "already stored");
    const pending = (await rpc("kb_pending", { p_limit: 10 })).data as { id: string; score: number }[];
    assert(pending.length === 3 && pending[0]!.score === 3000, `most popular first with its newer score: ${JSON.stringify(pending.map((p) => p.score))}`);
    const [a1, a2, a3] = pending;

    const claim = (topic: string, stance: number, statement = `${topic} take ${stance}`) => ({ topic_key: topic.toLowerCase().replace(/[^a-z0-9]+/g, "-"), topic, category: "formations", statement, stance, strength: 2 });
    let r = await rpc("kb_save_reading", { p_source: a1!.id, p_status: "read", p_note: "Formation thread", p_claims: [claim("4-2-3-1", 1), claim("4-2-3-1", 1), claim("5-2-1-2", -1), { ...claim("x", 1), category: "nope" }] });
    assert(r.data === 3, `bad category dropped: ${JSON.stringify(r)}`);
    r = await rpc("kb_save_reading", { p_source: a2!.id, p_status: "read", p_note: null, p_claims: [claim("4-2-3-1", -1), claim("5-2-1-2", -1)] });
    assert(r.data === 2);
    r = await rpc("kb_save_reading", { p_source: a3!.id, p_status: "failed", p_note: "busy", p_claims: null });
    const left = (await rpc("kb_pending", {})).data as { id: string; attempts: number }[];
    assert(left.length === 1 && left[0]!.attempts === 1, "a failure stays pending");
    await rpc("kb_save_reading", { p_source: a3!.id, p_status: "failed", p_note: "busy", p_claims: null });
    await rpc("kb_save_reading", { p_source: a3!.id, p_status: "failed", p_note: "busy", p_claims: null });
    assert(((await rpc("kb_pending", {})).data as unknown[]).length === 0, "three failures and it stops");

    // A private note of mine: only I see its claims
    const mine = await rpc("kb_add", { p_user: ME, p_source: { kind: "note", title: "My notes", body: "I think 4-2-3-1 is great and long enough", shared: false } });
    assert(typeof mine.data === "string", JSON.stringify(mine));
    await rpc("kb_save_reading", { p_source: mine.data, p_status: "read", p_note: null, p_claims: [claim("4-2-3-1", 1, "my private take"), { ...claim("Explosive AcceleRATE", 1), category: "players" }] });

    const map = (await rpc("kb_map", { p_user: ME, p_days: 30 })).data as { claims: number; topics: { key: string; claims: number; net: number; agreement: string; trend: number; has_mine: boolean }[] };
    const f = map.topics.find((t) => t.key === "4-2-3-1")!;
    assert(map.claims === 7 && f.claims === 4 && f.has_mine, JSON.stringify(map));
    assert(f.net > 0 && f.agreement !== "early", `popular for-claims outweigh one against: ${JSON.stringify(f)}`);
    assert(f.trend > 0, "most of the talk is recent");
    const bad = map.topics.find((t) => t.key === "5-2-1-2")!;
    assert(bad.net === -1 && bad.agreement === "early", `two claims is still early: ${JSON.stringify(bad)}`);
    const theirs = (await rpc("kb_map", { p_user: OTHER, p_days: 30 })).data as { claims: number; topics: { key: string }[] };
    assert(theirs.claims === 5 && !theirs.topics.some((t) => t.key === "explosive-accelerate"), "my private note is hidden from others");
    const week = (await rpc("kb_map", { p_user: OTHER, p_days: 7 })).data as { claims: number };
    assert(week.claims === 3, "the 20-day-old post is outside a week");
    const cat = (await rpc("kb_map", { p_user: ME, p_days: 30, p_category: "players" })).data as { topics: unknown[] };
    assert(cat.topics.length === 1, "category filter");

    const topic = (await rpc("kb_topic", { p_user: OTHER, p_key: "4-2-3-1", p_days: 90 })).data as { claims: number; weeks: unknown[]; statements: { statement: string; source: { url: string } }[] };
    assert(topic.claims === 3 && topic.weeks.length >= 1 && topic.statements[0]!.source.url.includes("reddit.com"), JSON.stringify(topic));
    assert(!topic.statements.some((s) => s.statement === "my private take"));
    assert((await rpc("kb_topic", { p_user: OTHER, p_key: "nothing-here" })).data === null);

    const found = (await rpc("kb_search", { p_user: ME, p_q: "what's the best 4-2-3-1 setup?", p_limit: 10 })).data as { topic_key: string }[];
    assert(found.length >= 3 && found.every((c) => c.topic_key === "4-2-3-1"), JSON.stringify(found));
    const any = (await rpc("kb_search", { p_user: OTHER, p_q: "", p_limit: 3 })).data as unknown[];
    assert(any.length === 3, "no words: strongest recent claims");

    const list = (await rpc("kb_source_list", { p_user: ME, p_mine: true })).data as { total: number; sources: { mine: boolean; claims: number }[] };
    assert(list.total === 1 && list.sources[0]!.mine && list.sources[0]!.claims === 2, JSON.stringify(list));
    assert((await rpc("kb_delete", { p_user: OTHER, p_id: mine.data })).data === false, "not theirs to delete");
    assert((await rpc("kb_delete", { p_user: ME, p_id: a1!.id })).data === false, "collected sources can't be deleted");
    assert((await rpc("kb_delete", { p_user: ME, p_id: mine.data })).data === true);

    const status = (await rpc("kb_status", {})).data as { sources: number; claims: number; topics: number };
    assert(status.sources === 3 && status.claims === 5 && status.topics === 2, JSON.stringify(status));
    const known = (await rpc("kb_known_topics", {})).data as { topic: string }[];
    assert(known[0]!.topic === "4-2-3-1", JSON.stringify(known));

    await db.exec("UPDATE fut.kb_sources SET collected_at = now() - interval '31 days' WHERE external_id = 'a2'");
    assert((await rpc("kb_cleanup", {})).data === 1);
    const old = await db.query<{ title: string | null; url: string }>("SELECT title, url FROM fut.kb_sources WHERE external_id = 'a2'");
    assert(old.rows[0]!.title === null && old.rows[0]!.url.includes("a2"), "link kept, title cleared");

    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT * FROM fut.kb_sources"); } catch { denied = true; } assert(denied, "web roles can't read sources");
    denied = false; try { await db.query(`SELECT fut.kb_map('${ME}', 30, NULL)`); } catch { denied = true; } assert(denied, "web roles can't call the map");
  } finally { await db.close(); }
});
