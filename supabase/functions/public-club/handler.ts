// Public club pages (gafferbot.app/club/<platform>/<clubId>, /clubs, /clubs/compare): no sign-in.
//   GET ?search=<name>[&platform=common-gen5|nx]   clubs matching a name, both platforms by default
//   GET ?clubId=<id>&platform=<platform>           club info, overall stats, members and recent matches
// Only EA's public Pro Clubs endpoints are read (the same data anyone can see in game), shaped by
// src/lib/publicClub.ts. Answers are cached in memory for a few minutes so a busy page doesn't hammer
// EA; the Worker rate-limits callers by IP before requests get here.
import { eaCrestUrl, eaMatchToRow, eaMembers, eaOverall, isPublicPlatform, PUBLIC_PLATFORMS, type MatchCategory, type PublicClubPayload, type PublicPlatform } from "../../../src/lib/publicClub.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EA_HEADERS = {
  accept: "application/json",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://www.ea.com",
  referer: "https://www.ea.com/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

const EA = "https://proclubs.ea.com/api/fc";
const CLUB_TTL_MS = 5 * 60_000;
const SEARCH_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string, ttl: number): T | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  return undefined;
}
function remember(key: string, value: unknown) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
}

class EaUnavailable extends Error {}

// deno-lint-ignore no-explicit-any
async function ea(path: string, params: Record<string, string>): Promise<any> {
  const url = `${EA}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: EA_HEADERS, signal: AbortSignal.timeout(10_000) });
  if (res.status === 403 || res.status === 429 || res.status >= 500) {
    await res.body?.cancel();
    throw new EaUnavailable(`EA answered ${res.status}`);
  }
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  return await res.json().catch(() => null);
}

const json = (body: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });

async function searchClubs(name: string, platforms: PublicPlatform[]) {
  const key = `s:${platforms.join(",")}:${name.toLowerCase()}`;
  const hit = cached<unknown[]>(key, SEARCH_TTL_MS);
  if (hit) return hit;
  const results = await Promise.all(
    platforms.map(async (platform) => {
      const data = await ea("allTimeLeaderboard/search", { platform, clubName: name }).catch((e) => {
        if (e instanceof EaUnavailable) throw e;
        return null;
      });
      // deno-lint-ignore no-explicit-any
      const list: any[] = Array.isArray(data) ? data : data && typeof data === "object" ? Object.values(data) : [];
      return list
        .map((c) => {
          const clubId = String(c?.clubId ?? c?.clubInfo?.clubId ?? "");
          const info = c?.clubInfo || c;
          return clubId
            ? {
                clubId,
                platform,
                name: String(info?.name || c?.clubName || clubId),
                crest: eaCrestUrl(info?.customKit?.crestAssetId ?? info?.crestAssetId),
                skillRating: Number(c?.skillRating) || null,
                games: Number(c?.gamesPlayed) || null,
              }
            : null;
        })
        .filter(Boolean);
    })
  );
  const out = results.flat().slice(0, 30);
  remember(key, out);
  return out;
}

async function clubPayload(clubId: string, platform: PublicPlatform): Promise<PublicClubPayload | null> {
  const key = `c:${platform}:${clubId}`;
  const hit = cached<PublicClubPayload | null>(key, CLUB_TTL_MS);
  if (hit !== undefined) return hit;
  const clubParams = { platform, clubIds: clubId };
  const matchParams = (matchType: string) => ({ ...clubParams, matchType, maxResultCount: "50" });
  const [info, overall, members, league, playoff, friendly] = await Promise.all([
    ea("clubs/info", clubParams),
    ea("clubs/overallStats", clubParams).catch(() => null),
    ea("members/stats", { platform, clubId }).catch(() => null),
    ea("clubs/matches", matchParams("leagueMatch")).catch(() => null),
    ea("clubs/matches", matchParams("playoffMatch")).catch(() => null),
    ea("clubs/matches", matchParams("friendlyMatch")).catch(() => null),
  ]);
  const clubInfo = Array.isArray(info) ? info[0] : info?.[clubId] ?? (info?.name ? info : null);
  if (!clubInfo?.name) {
    remember(key, null);
    return null;
  }
  // deno-lint-ignore no-explicit-any
  const list = (d: any): any[] => (Array.isArray(d) ? d : d && typeof d === "object" ? Object.values(d) : []);
  const rows = ([["league", league], ["playoff", playoff], ["friendly", friendly]] as [MatchCategory, unknown][])
    .flatMap(([cat, d]) => list(d).map((m) => eaMatchToRow(m, clubId, cat)))
    .filter((r): r is NonNullable<typeof r> => !!r);
  const payload: PublicClubPayload = {
    clubId,
    platform,
    name: String(clubInfo.name),
    crest: eaCrestUrl(clubInfo.customKit?.crestAssetId ?? clubInfo.crestAssetId),
    overall: eaOverall(overall),
    members: eaMembers(members),
    rows,
    fetchedAt: new Date().toISOString(),
  };
  remember(key, payload);
  return payload;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  const url = new URL(req.url);
  const platformParam = url.searchParams.get("platform");
  try {
    const search = (url.searchParams.get("search") || "").trim();
    if (search) {
      if (search.length < 2 || search.length > 40) return json({ error: "Search for 2 to 40 characters of a club name." }, 400);
      const platforms = isPublicPlatform(platformParam) ? [platformParam] : PUBLIC_PLATFORMS.map((p) => p.value);
      return json({ clubs: await searchClubs(search, platforms) }, 200, 300);
    }
    const clubId = url.searchParams.get("clubId") || "";
    if (!/^\d{1,15}$/.test(clubId) || !isPublicPlatform(platformParam)) return json({ error: "Pass a numeric clubId and a platform (common-gen5 or nx)." }, 400);
    const payload = await clubPayload(clubId, platformParam);
    if (!payload) return json({ error: "No club with that ID on that platform." }, 404);
    return json(payload, 200, 120);
  } catch (e) {
    if (e instanceof EaUnavailable) return json({ error: "EA's servers aren't answering right now. Try again in a minute." }, 503);
    console.error("[public-club]", e);
    return json({ error: "Couldn't load that club." }, 500);
  }
}

// For tests
export const clearCache = () => cache.clear();
