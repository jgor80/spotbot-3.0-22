// Public community meta builds (gafferbot.app/build "Load community meta build", the Knowledge Bank's Pro Clubs builds
// tab), no sign-in: the best Virtual Pro build per position, worked out from the builds the Pro Clubs community
// recommends on Reddit and YouTube (see _shared/fut/meta-builds.ts and src/lib/metaBuilds.ts). Only shared sources are
// read, never anyone's private notes. GET ?days=30|90|180|365 (default 180).
import { loadMetaBuilds } from "../_shared/fut/meta-builds.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
export const PERIODS = [30, 90, 180, 365];
const CACHE_MS = 10 * 60_000; // new builds arrive every 3 hours at most
const cached = new Map<number, { at: number; body: unknown }>();
export const clearCache = () => cached.clear();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": status === 200 ? "public, max-age=300" : "no-store" },
  });

export function createHandler(getDb: () => Db) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "GET") return json({ error: "GET only" }, 405);
    const asked = Number(new URL(req.url).searchParams.get("days"));
    const days = PERIODS.includes(asked) ? asked : 180;
    try {
      const hit = cached.get(days);
      if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.body);
      const body = { ...(await loadMetaBuilds(getDb(), days)), generated_at: new Date().toISOString() };
      cached.set(days, { at: Date.now(), body });
      return json(body);
    } catch (e) {
      console.error("[meta-builds]", e);
      return json({ error: "Couldn't load the community meta builds." }, 500);
    }
  };
}
