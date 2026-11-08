// Market-wide card list (catalogue cards) for Market Lab, refreshed by the bot right after the twice-daily FUT.GG
// price download (scheduler.cjs → fut-api job "futgg-catalogue"). Public files only, no account or session:
//  - FUT.GG manifest, price index (EA item ids), streamlined card pool (rating, position, club, nation, league,
//    card type per id, same order as the index) and core data (club/nation/league/card type names);
//  - the EA FC Web App's public player name file (names by base player id).
// Cards are upserted as catalogue rows (owner_user_id NULL, source futgg_catalogue); those priced at 1,000+ coins
// are marked market_tracked, and Market Lab's baskets are rebalanced so the indexes include them.
import { FutError, type FutDb } from "./service.ts";

const FUTGG = "https://r2.fut.gg/27";
const EA_WEB_APP = "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/";
const MAX_BYTES = 8 * 1024 * 1024;
const BATCH = 2000;
type Json = Record<string, unknown>;
export type Fetcher = (url: string) => Promise<Response>;

/** EA's numeric position codes as FUT.GG lists them (only the ones FUT cards use). */
export const EA_POSITIONS: Record<number, string> = {
  0: "GK", 2: "RB", 3: "RB", 4: "CB", 5: "CB", 6: "CB", 7: "LB", 8: "LB", 9: "CDM", 10: "CDM", 11: "CDM",
  12: "RM", 13: "CM", 14: "CM", 15: "CM", 16: "LM", 17: "CAM", 18: "CAM", 19: "CAM", 20: "ST", 21: "ST", 22: "ST",
  23: "RW", 24: "ST", 25: "ST", 26: "ST", 27: "LW",
};

export interface CatalogueCard {
  ea_item_id: number; name: string; version: string | null; overall: number; position: string;
  club: string | null; league: string | null; nation: string | null; is_icon: boolean; is_hero: boolean; published_at: string | null;
}

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const res = await fetcher(url);
  if (!res.ok) throw new FutError(`${new URL(url).host} returned HTTP ${res.status} for the card list`, 502);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new FutError("Card list file is too large", 502);
  return JSON.parse(text);
}
async function getText(fetcher: Fetcher, url: string): Promise<string> {
  const res = await fetcher(url);
  if (!res.ok) throw new FutError(`${new URL(url).host} returned HTTP ${res.status} for the card list`, 502);
  return await res.text();
}
const obj = (v: unknown, what: string): Json => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new FutError(`Unexpected ${what} format`, 502);
  return v as Json;
};
const arr = (v: unknown, n: number, what: string): unknown[] => {
  if (!Array.isArray(v) || v.length !== n) throw new FutError(`Unexpected ${what} format`, 502);
  return v;
};
function fileUrl(manifest: Json, name: string): string {
  const hash = manifest[name], version = manifest._version;
  if (!Number.isSafeInteger(version) || typeof hash !== "string" || !/^[a-f0-9]+$/.test(hash)) throw new FutError(`FUT.GG manifest has no ${name}`, 502);
  return `${FUTGG}/${name}.v${version}.${hash}.json`;
}
const nameMap = (list: unknown, key = "eaId"): Map<number, string> => {
  const out = new Map<number, string>();
  if (Array.isArray(list)) for (const x of list as Json[]) if (Number.isSafeInteger(x?.[key]) && typeof x.name === "string") out.set(Number(x[key]), x.name);
  return out;
};

/** EA's player file names a card by its base player id: the item id without the version bits (id mod 2^24). */
export const basePlayerId = (eaItemId: number) => eaItemId % 16_777_216;

/** Pure: turns the downloaded files into catalogue cards. Throws when the files don't line up. */
export function buildCatalogue(input: { index: Json; pool: Json; core: Json; players: Json; publishedAt?: string | null }): CatalogueCard[] {
  const { index, pool, core, players } = input;
  const d = index.d;
  if (!Number.isSafeInteger(index.id0) || !Array.isArray(d)) throw new FutError("Unexpected FUT.GG index format", 502);
  const ids = [Number(index.id0)];
  for (const delta of d) {
    if (!Number.isSafeInteger(delta) || Number(delta) <= 0) throw new FutError("Invalid FUT.GG card id", 502);
    ids.push(ids[ids.length - 1]! + Number(delta));
  }
  const n = ids.length;
  if (pool.n !== n || pool.id0 !== ids[0] || pool.idn !== ids[n - 1]) throw new FutError("FUT.GG card pool doesn't match the price index", 502);
  const o = arr(pool.o, n, "card pool"), r = arr(pool.r, n, "card pool"), pos = arr(pool.pos, n, "card pool");
  const nat = arr(pool.nat, n, "card pool"), lg = arr(pool.lg, n, "card pool"), cl = arr(pool.cl, n, "card pool");
  const rarities = nameMap(core.rarities), clubs = nameMap(core.clubs), nations = nameMap(core.nations), leagues = nameMap(core.leagues);
  const names = new Map<number, string>();
  for (const list of [players.Players, players.LegendsPlayers]) {
    if (!Array.isArray(list)) continue;
    for (const p of list as Json[]) {
      if (!Number.isSafeInteger(p?.id)) continue;
      const common = typeof p.c === "string" && p.c.trim() ? p.c.trim() : "";
      const full = [p.f, p.l].filter((x) => typeof x === "string" && x.trim()).join(" ").trim();
      if (common || full) names.set(Number(p.id), common || full);
    }
  }
  if (names.size < 1000) throw new FutError("EA's player name file looks incomplete", 502);
  const out: CatalogueCard[] = [];
  for (let i = 0; i < n; i++) {
    const id = ids[i]!, name = names.get(basePlayerId(id)), position = EA_POSITIONS[Number(pos[i])], overall = Number(o[i]);
    if (!name || !position || !Number.isInteger(overall) || overall < 1 || overall > 99) continue;
    const version = rarities.get(Number(r[i])) ?? null, v = (version ?? "").toLowerCase();
    out.push({
      ea_item_id: id, name: name.slice(0, 60), version: version?.slice(0, 40) ?? null, overall, position,
      club: clubs.get(Number(cl[i])) ?? null, league: leagues.get(Number(lg[i])) ?? null, nation: nations.get(Number(nat[i])) ?? null,
      is_icon: v.includes("icon"), is_hero: !v.includes("icon") && v.includes("hero"), published_at: input.publishedAt ?? null,
    });
  }
  return out;
}

/** Finds the current player name file from the Web App page (it moves every game year and content update). */
export function eaPlayersUrl(html: string): string {
  const guid = html.match(/fut_guid\s*=\s*"([A-Za-z0-9-]{8,64})"/)?.[1], year = html.match(/fut_year\s*=\s*"(\d{4})"/)?.[1];
  if (!guid || !year) throw new FutError("Couldn't find the EA Web App content id", 502);
  return `${EA_WEB_APP}content/${guid}/${year}/fut/items/web/players.json`;
}

export interface CatalogueResult { cards: number; written: number; tracked: number; skipped: number }

export async function syncFutggCatalogue(db: FutDb, fetcher: Fetcher = (u) => fetch(u, { headers: { Accept: "application/json, text/html", "User-Agent": "XI-Lab-Market-Collector/1.0" }, signal: AbortSignal.timeout(30_000) })): Promise<CatalogueResult> {
  const manifest = obj(await getJson(fetcher, `${FUTGG}/manifest.json`), "FUT.GG manifest");
  const [index, pool, core, html] = await Promise.all([
    getJson(fetcher, fileUrl(manifest, "player-prices-index")), getJson(fetcher, fileUrl(manifest, "streamlined-pool")),
    getJson(fetcher, fileUrl(manifest, "fc-core-data")), getText(fetcher, EA_WEB_APP),
  ]);
  const players = obj(await getJson(fetcher, eaPlayersUrl(html)), "EA player file");
  const stamp = obj(manifest._published_at ?? {}, "FUT.GG manifest")["streamlined-pool"];
  const publishedAt = Number.isSafeInteger(stamp) ? new Date(Number(stamp) * 1000).toISOString() : null;
  const cards = buildCatalogue({ index: obj(index, "FUT.GG index"), pool: obj(pool, "card pool"), core: obj(core, "FUT.GG core data"), players, publishedAt });
  let written = 0;
  for (let i = 0; i < cards.length; i += BATCH) {
    const { data, error } = await db.rpc("upsert_futgg_catalogue", { p_cards: cards.slice(i, i + BATCH) });
    if (error) throw new FutError(`Card list save failed: ${error.message}`, 500);
    written += Number(data ?? 0);
  }
  const { data: tracked, error } = await db.rpc("refresh_futgg_tracked", { p_min_price: 1000 });
  if (error) throw new FutError(`Card list tracking failed: ${error.message}`, 500);
  const d = (index as Json).d, total = Array.isArray(d) ? d.length + 1 : cards.length;
  return { cards: cards.length, written, tracked: Number(tracked ?? 0), skipped: total - cards.length };
}
