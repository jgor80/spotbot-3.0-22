// Generated from worker/futgg-sync.ts by npm run build:bot-futgg. Do not edit by hand.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// worker/futgg-sync.ts
var futgg_sync_exports = {};
__export(futgg_sync_exports, {
  syncFutggHot: () => syncFutggHot,
  syncFutggPrices: () => syncFutggPrices,
  validateBlob: () => validateBlob
});
module.exports = __toCommonJS(futgg_sync_exports);
var ROOT = "https://r2.fut.gg/27";
var MAX_BYTES = 8 * 1024 * 1024;
var FILES = { console: "player-prices-ps5-dyn", pc: "player-prices-pc-dyn" };
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid FUT.GG JSON object");
  return value;
}
function url(manifest, name) {
  const hash = manifest[name], version = manifest._version;
  if (!Number.isSafeInteger(version) || Number(version) < 1 || typeof hash !== "string" || !/^[a-f0-9]+$/.test(hash)) throw new Error(`Invalid FUT.GG manifest entry: ${name}`);
  return `${ROOT}/${name}.v${version}.${hash}.json`;
}
async function readJson(address, request) {
  const res = await request(address, { headers: { Accept: "application/json", "User-Agent": "XI-Lab-Market-Collector/1.0" }, signal: AbortSignal.timeout(25e3) });
  if (!res.ok) throw new Error(`FUT.GG returned HTTP ${res.status}; stopping without retries`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("FUT.GG returned no body");
  const decoder = new TextDecoder();
  let body = "", size = 0;
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("FUT.GG response exceeds size limit");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return object(JSON.parse(body));
}
function validateBlob(index, blob) {
  if (index.v !== 2 || blob.v !== 2 || !Number.isSafeInteger(index.id0) || Number(index.id0) <= 0) throw new Error("Unsupported FUT.GG index format");
  const d = index.d, p = blob.p, s = blob.s;
  if (!Array.isArray(d) || !Array.isArray(p) || !Array.isArray(s) || !p.length || p.length !== d.length + 1 || s.length !== p.length) throw new Error("FUT.GG price/index length mismatch");
  if (p.length > 1e5) throw new Error("FUT.GG snapshot exceeds card limit");
  let id = Number(index.id0);
  for (const delta of d) {
    if (!Number.isSafeInteger(delta) || delta <= 0 || !Number.isSafeInteger(id += delta)) throw new Error("Invalid FUT.GG card ID delta");
  }
  for (let i = 0; i < p.length; i++) {
    if (p[i] !== null && (!Number.isSafeInteger(p[i]) || p[i] < 0)) throw new Error("Invalid FUT.GG price");
    if (!Number.isInteger(s[i]) || s[i] < 0 || s[i] > 4) throw new Error("Unsupported FUT.GG price status");
  }
}
async function ingest(db, request, now) {
  const manifest = await readJson(`${ROOT}/manifest.json`, request);
  const published = object(manifest._published_at);
  const index = await readJson(url(manifest, "player-prices-index"), request);
  const snapshots = [];
  for (const [platform, name] of Object.entries(FILES)) {
    const blob = await readJson(url(manifest, name), request);
    validateBlob(index, blob);
    const stamp = published[name];
    if (!Number.isSafeInteger(stamp) || Number(stamp) <= 0 || Number(stamp) * 1e3 > now + 6e5) throw new Error("Invalid FUT.GG publication time");
    snapshots.push({ platform, blob, publishedAt: new Date(Number(stamp) * 1e3).toISOString() });
  }
  const result = {};
  for (const snapshot of snapshots) {
    const { data, error } = await db.rpc("ingest_futgg_snapshot", {
      p_platform: snapshot.platform,
      p_game_year: 27,
      p_published_at: snapshot.publishedAt,
      p_index: index,
      p_prices: snapshot.blob
    });
    if (error) throw new Error(`FUT.GG ${snapshot.platform} database ingestion failed: ${error.message}`);
    result[snapshot.platform] = data;
  }
  return result;
}
async function syncFutggPrices(db, request = fetch, now = Date.now()) {
  const started = new Date(now).toISOString();
  try {
    const result = await ingest(db, request, now);
    const { error } = await db.rpc("record_futgg_run", { p_status: "succeeded", p_started_at: started, p_message: JSON.stringify(result) });
    if (error) throw new Error(`FUT.GG sync status could not be saved: ${error.message}`);
    return result;
  } catch (error) {
    try {
      await db.rpc("record_futgg_run", { p_status: "failed", p_started_at: started, p_message: error instanceof Error ? error.message : String(error) });
    } catch {
    }
    throw error;
  }
}
async function syncFutggHot(db, request = fetch, now = Date.now()) {
  const manifest = await readJson(`${ROOT}/manifest.json`, request);
  const published = object(manifest._published_at);
  const fresh = [];
  for (const [platform, name] of Object.entries(FILES)) {
    const stamp = published[name];
    if (!Number.isSafeInteger(stamp) || Number(stamp) <= 0 || Number(stamp) * 1e3 > now + 6e5) throw new Error("Invalid FUT.GG publication time");
    const publishedAt = new Date(Number(stamp) * 1e3).toISOString();
    const { data, error } = await db.rpc("futgg_latest_published", { p_platform: platform });
    if (error) throw new Error(`FUT.GG latest publication time unavailable: ${error.message}`);
    if (!data || Date.parse(String(data)) < Date.parse(publishedAt)) fresh.push({ platform, name, publishedAt });
  }
  if (!fresh.length) return { unchanged: true, requests: 1 };
  const index = await readJson(url(manifest, "player-prices-index"), request);
  const result = { requests: 2 + fresh.length };
  for (const f of fresh) {
    const blob = await readJson(url(manifest, f.name), request);
    validateBlob(index, blob);
    const { data, error } = await db.rpc("ingest_futgg_hot", { p_platform: f.platform, p_game_year: 27, p_published_at: f.publishedAt, p_index: index, p_prices: blob });
    if (error) throw new Error(`FUT.GG ${f.platform} hourly ingestion failed: ${error.message}`);
    result[f.platform] = data;
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  syncFutggHot,
  syncFutggPrices,
  validateBlob
});
