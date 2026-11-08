// Public bulk files used by FUT.GG's client. Four GETs per run, no account/session/challenge solver.
// Runs on the bot (public/spotbot/futgg-sync.cjs via npm run build:bot-futgg, scheduled in scheduler.cjs):
// FUT.GG answers 403 to Cloudflare Workers. Rebuild the .cjs after editing this file.
const ROOT = "https://r2.fut.gg/27";
const MAX_BYTES = 8 * 1024 * 1024;
const FILES = { console: "player-prices-ps5-dyn", pc: "player-prices-pc-dyn" } as const;
type Json = Record<string, unknown>;
type Fetch = typeof fetch;
export interface BulkDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid FUT.GG JSON object");
  return value as Json;
}
function url(manifest: Json, name: string): string {
  const hash = manifest[name], version = manifest._version;
  if (!Number.isSafeInteger(version) || Number(version) < 1 || typeof hash !== "string" || !/^[a-f0-9]+$/.test(hash)) throw new Error(`Invalid FUT.GG manifest entry: ${name}`);
  return `${ROOT}/${name}.v${version}.${hash}.json`;
}
async function readJson(address: string, request: Fetch): Promise<Json> {
  const res = await request(address, { headers: { Accept: "application/json", "User-Agent": "XI-Lab-Market-Collector/1.0" }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`FUT.GG returned HTTP ${res.status}; stopping without retries`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("FUT.GG returned no body");
  const decoder = new TextDecoder();
  let body = "", size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("FUT.GG response exceeds size limit"); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  return object(JSON.parse(body));
}

/** Validate both blobs before any write. SQL independently validates and decodes the index transactionally. */
export function validateBlob(index: Json, blob: Json): void {
  if (index.v !== 2 || blob.v !== 2 || !Number.isSafeInteger(index.id0) || Number(index.id0) <= 0) throw new Error("Unsupported FUT.GG index format");
  const d = index.d, p = blob.p, s = blob.s;
  if (!Array.isArray(d) || !Array.isArray(p) || !Array.isArray(s) || !p.length || p.length !== d.length + 1 || s.length !== p.length) throw new Error("FUT.GG price/index length mismatch");
  if (p.length > 100_000) throw new Error("FUT.GG snapshot exceeds card limit");
  let id = Number(index.id0);
  for (const delta of d) {
    if (!Number.isSafeInteger(delta) || delta <= 0 || !Number.isSafeInteger(id += delta)) throw new Error("Invalid FUT.GG card ID delta");
  }
  for (let i = 0; i < p.length; i++) {
    if (p[i] !== null && (!Number.isSafeInteger(p[i]) || p[i] < 0)) throw new Error("Invalid FUT.GG price");
    if (!Number.isInteger(s[i]) || s[i] < 0 || s[i] > 4) throw new Error("Unsupported FUT.GG price status");
  }
}

async function ingest(db: BulkDb, request: Fetch, now: number) {
  const manifest = await readJson(`${ROOT}/manifest.json`, request);
  const published = object(manifest._published_at);
  const index = await readJson(url(manifest, "player-prices-index"), request);
  const snapshots = [];
  for (const [platform, name] of Object.entries(FILES)) {
    const blob = await readJson(url(manifest, name), request);
    validateBlob(index, blob);
    const stamp = published[name];
    if (!Number.isSafeInteger(stamp) || Number(stamp) <= 0 || Number(stamp) * 1000 > now + 600_000) throw new Error("Invalid FUT.GG publication time");
    snapshots.push({ platform, blob, publishedAt: new Date(Number(stamp) * 1000).toISOString() });
  }
  const result: Record<string, unknown> = {};
  for (const snapshot of snapshots) {
    const { data, error } = await db.rpc("ingest_futgg_snapshot", {
      p_platform: snapshot.platform, p_game_year: 27, p_published_at: snapshot.publishedAt,
      p_index: index, p_prices: snapshot.blob,
    });
    if (error) throw new Error(`FUT.GG ${snapshot.platform} database ingestion failed: ${error.message}`);
    result[snapshot.platform] = data;
  }
  return result;
}

export async function syncFutggPrices(db: BulkDb, request: Fetch = fetch, now = Date.now()) {
  const started = new Date(now).toISOString();
  try {
    const result = await ingest(db, request, now);
    const { error } = await db.rpc("record_futgg_run", { p_status: "succeeded", p_started_at: started, p_message: JSON.stringify(result) });
    if (error) throw new Error(`FUT.GG sync status could not be saved: ${error.message}`);
    return result;
  } catch (error) {
    try {
      await db.rpc("record_futgg_run", { p_status: "failed", p_started_at: started, p_message: error instanceof Error ? error.message : String(error) });
    } catch { /* Keep the original failure if the database is unavailable. */ }
    throw error;
  }
}
