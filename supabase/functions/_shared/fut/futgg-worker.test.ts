import { syncFutggPrices, validateBlob } from "../../../../worker/futgg-sync.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }
const now = Date.now(), published = Math.floor(now / 1000) - 60;
const index = { v: 2, id0: 100, d: [10, 20] };
const prices = { v: 2, p: [1000, 0, 5000], s: [0, 0, 1] };
const manifest = { _version: 1, "player-prices-index": "aa", "player-prices-ps5-dyn": "bb", "player-prices-pc-dyn": "cc",
  _published_at: { "player-prices-ps5-dyn": published, "player-prices-pc-dyn": published } };

Deno.test("FUT.GG cron follows manifest, makes four anonymous GETs and persists both platforms", async () => {
  const urls: string[] = [], writes: { name: string; args: Record<string, unknown> }[] = [];
  const request: typeof fetch = (input, init) => {
    const url = String(input); urls.push(url);
    const headers = new Headers(init?.headers);
    assert(!headers.has("authorization") && !headers.has("cookie"), "No account/session headers");
    assert(!init?.body && !init?.credentials, "No credentials or POST body on provider requests");
    return Promise.resolve(new Response(JSON.stringify(url.endsWith("manifest.json") ? manifest : url.includes("index.") ? index : prices)));
  };
  const db = { rpc(name: string, args: Record<string, unknown>) { writes.push({ name, args }); return Promise.resolve({ data: { card_count: 3 }, error: null }); } };
  const result = await syncFutggPrices(db, request, now);
  assert(urls.length === 4 && urls.every((u) => u.startsWith("https://r2.fut.gg/27/")));
  assert(urls[3].endsWith("player-prices-pc-dyn.v1.cc.json"));
  assert(writes.filter((w) => w.name === "ingest_futgg_snapshot").length === 2);
  assert(writes[0].args.p_platform === "console" && writes[1].args.p_platform === "pc");
  assert(writes[0].args.p_published_at === new Date(published * 1000).toISOString());
  assert(writes[2].args.p_status === "succeeded" && "console" in result && "pc" in result);
});

Deno.test("FUT.GG throttling stops immediately, logs a failure and never falls back to other hosts", async () => {
  const calls: string[] = [], statuses: unknown[] = [];
  let failed = false;
  try {
    await syncFutggPrices({ rpc(_name, args) { statuses.push(args.p_status); return Promise.resolve({ data: null, error: null }); } },
      (input) => { calls.push(String(input)); return Promise.resolve(new Response("slow down", { status: 429 })); }, now);
  } catch (e) { failed = e instanceof Error && e.message.includes("429"); }
  assert(failed && calls.length === 1 && statuses[0] === "failed");
});

Deno.test("FUT.GG malformed second platform cannot partially ingest the first platform", async () => {
  const writes: string[] = [];
  let failed = false;
  try {
    await syncFutggPrices({ rpc(name) { writes.push(name); return Promise.resolve({ data: null, error: null }); } },
      (input) => { const url = String(input); return Promise.resolve(new Response(JSON.stringify(
        url.endsWith("manifest.json") ? manifest : url.includes("index.") ? index : url.includes("pc-dyn") ? { ...prices, p: [] } : prices))); }, now);
  } catch { failed = true; }
  assert(failed && !writes.includes("ingest_futgg_snapshot"));
});

Deno.test("FUT.GG format validation refuses unknown versions and bad IDs/statuses", () => {
  for (const [i, p] of [[{ ...index, v: 3 }, prices], [{ ...index, d: [0, 20] }, prices], [index, { ...prices, s: [0, 0, 7] }]]) {
    let failed = false; try { validateBlob(i, p); } catch { failed = true; } assert(failed);
  }
});
