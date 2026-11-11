// Live FUT.GG prices for the Daily Strategy (Jeff, 2026-11-11: "make sure the recommendations are getting real
// numbers, especially buy it now numbers").
//
// The stored series only has the full refreshes at 06:00 and 18:00 UTC, so a plan built late in the evening used
// prices up to 12 hours old: a card that jumped when the 18:00 UK SBCs landed still showed its old price. FUT.GG
// republishes its lowest Buy Now estimates for every card about once an hour (the "-dyn" price files), so the plan
// fetches the newest file when it is built and uses those prices as the latest point. Picks without a live price are
// dropped. The fetch runs where fut-api runs (the bot's server; FUT.GG blocks Cloudflare Workers) and is cached, so
// page loads cost one small manifest request at most every few minutes.

export type LiveFetch = (url: string) => Promise<Response>;
export interface LivePrices { platform: "console" | "pc"; at: string; prices: Map<number, number> }

const ROOT = "https://r2.fut.gg/27";
const FILES = { console: "player-prices-ps5-dyn", pc: "player-prices-pc-dyn" } as const;
const MANIFEST_TTL = 5 * 60_000;
const MAX_PRICE = 15_000_000;

const defaultFetch: LiveFetch = (u) => fetch(u, { headers: { Accept: "application/json", "User-Agent": "XI-Lab-Market-Collector/1.0" }, signal: AbortSignal.timeout(15_000) });

type Json = Record<string, unknown>;
const cache: { manifest?: { at: number; value: Json }; index?: { hash: string; ids: number[] }; prices: Partial<Record<"console" | "pc", { hash: string; value: LivePrices }>> } = { prices: {} };

async function getJson(fetcher: LiveFetch, url: string): Promise<Json> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`FUT.GG ${res.status}`);
  const body = await res.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("FUT.GG sent an unexpected file");
  return body as Json;
}
function fileUrl(manifest: Json, name: string) {
  const hash = manifest[name], version = manifest._version;
  if (!Number.isSafeInteger(version) || typeof hash !== "string" || !/^[a-f0-9]+$/.test(hash)) throw new Error(`FUT.GG manifest has no ${name}`);
  return { url: `${ROOT}/${name}.v${version}.${hash}.json`, hash };
}

/** Pure: the card ids from FUT.GG's price index (first id, then gaps). */
export function decodeIndex(index: Json): number[] {
  const d = index.d;
  if (index.v !== 2 || !Number.isSafeInteger(index.id0) || !Array.isArray(d)) throw new Error("Unexpected FUT.GG index format");
  const ids = [Number(index.id0)];
  for (const delta of d) {
    if (!Number.isSafeInteger(delta) || Number(delta) <= 0) throw new Error("Invalid FUT.GG card id");
    ids.push(ids[ids.length - 1]! + Number(delta));
  }
  return ids;
}

/** Pure: id → price from a price file, keeping only cards FUT.GG marks as having a current price (status 0). */
export function decodePrices(ids: number[], blob: Json): Map<number, number> {
  const p = blob.p, s = blob.s;
  if (blob.v !== 2 || !Array.isArray(p) || !Array.isArray(s) || p.length !== ids.length || s.length !== ids.length) throw new Error("FUT.GG price file doesn't match its index");
  const out = new Map<number, number>();
  for (let i = 0; i < ids.length; i++) {
    const price = p[i], status = s[i];
    if (status === 0 && Number.isSafeInteger(price) && (price as number) >= 1 && (price as number) <= MAX_PRICE) out.set(ids[i]!, price as number);
  }
  return out;
}

/** The newest FUT.GG prices for a platform, or null when FUT.GG can't be reached (the plan then says its prices are old). */
export async function liveFutggPrices(platform: "console" | "pc", fetcher: LiveFetch = defaultFetch, now = Date.now()): Promise<LivePrices | null> {
  try {
    if (!cache.manifest || now - cache.manifest.at > MANIFEST_TTL) cache.manifest = { at: now, value: await getJson(fetcher, `${ROOT}/manifest.json`) };
    const manifest = cache.manifest.value, name = FILES[platform];
    const file = fileUrl(manifest, name), idx = fileUrl(manifest, "player-prices-index");
    const key = `${idx.hash}:${file.hash}`;
    const hit = cache.prices[platform];
    if (hit?.hash === key) return hit.value;
    if (cache.index?.hash !== idx.hash) cache.index = { hash: idx.hash, ids: decodeIndex(await getJson(fetcher, idx.url)) };
    const prices = decodePrices(cache.index.ids, await getJson(fetcher, file.url));
    const stamp = Number((manifest._published_at as Json | undefined)?.[name]);
    if (!Number.isFinite(stamp) || stamp <= 0) throw new Error("FUT.GG manifest has no publish time");
    const value: LivePrices = { platform, at: new Date(stamp * 1000).toISOString(), prices };
    cache.prices[platform] = { hash: key, value };
    return value;
  } catch (e) {
    console.warn("live FUT.GG prices unavailable:", e instanceof Error ? e.message : String(e));
    cache.manifest = undefined;
    return null;
  }
}

/** Test hook: forget cached files. */
export function resetLiveCache() { cache.manifest = undefined; cache.index = undefined; cache.prices = {}; }
