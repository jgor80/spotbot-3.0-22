// Recent EA FC game clips from linked Xbox players, for the bot's #clips-and-highlights auto-poster.
// OpenXBL only exposes clips the API-key account can see: its own DVR plus clips friends share to the
// activity feed. Players must be on that account's friends list with clips visible to friends/everyone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SECRET = Deno.env.get("BOT_PROXY_SECRET") ?? "";
const FC_TITLE = /\b(EA SPORTS FC|FC ?2[4-9]|FIFA)\b/i;

type Clip = { id: string; xuid: string; gamertag: string | null; title: string; recorded_at: string; duration_s: number | null; video_url: string | null; thumbnail_url: string | null };

// deno-lint-ignore no-explicit-any
function fromFeed(item: any): Clip | null {
  if (item?.activityItemType !== "GameDVR" && item?.contentType !== "GameDVR") return null;
  const title = item.contentTitle || item.titleName || "";
  if (!FC_TITLE.test(title)) return null;
  return {
    id: String(item.clipId || item.gameClipId || item.itemId || item.contentId),
    xuid: String(item.userXuid || item.authorInfo?.xuid || ""),
    gamertag: item.gamertag || item.authorInfo?.name || null,
    title,
    recorded_at: item.dateRecorded || item.date || item.startTime,
    duration_s: Number(item.duration || item.durationInSeconds) || null,
    video_url: item.downloadUri || item.gameClipUris?.[0]?.uri || null,
    thumbnail_url: item.clipThumbnail || item.screenshotUri || item.thumbnails?.[0]?.uri || null,
  };
}

// deno-lint-ignore no-explicit-any
function fromDvr(c: any, ownXuid: string): Clip | null {
  const title = c.titleName || "";
  if (!FC_TITLE.test(title)) return null;
  return {
    id: String(c.contentId || c.gameClipId),
    xuid: String(c.xuid || ownXuid),
    gamertag: c.gamertag || null,
    title,
    recorded_at: c.uploadDate || c.dateRecorded,
    duration_s: Number(c.durationInSeconds) || null,
    // deno-lint-ignore no-explicit-any
    video_url: c.contentLocators?.find((l: any) => l.locatorType === "Download")?.uri || c.gameClipUris?.[0]?.uri || null,
    // deno-lint-ignore no-explicit-any
    thumbnail_url: c.contentLocators?.find((l: any) => /Thumbnail_Large/i.test(l.locatorType))?.uri || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SECRET || req.headers.get("x-bot-secret") !== SECRET) return json({ error: "Forbidden" }, 403);
  const key = Deno.env.get("OPENXBL_API_KEY");
  if (!key) return json({ error: "OPENXBL_API_KEY not configured" }, 500);

  let body: { guild_id?: string; since?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof body.guild_id !== "string" || !/^\d{5,25}$/.test(body.guild_id)) return json({ error: "guild_id required" }, 400);
  const since = body.since ? new Date(body.since) : new Date(Date.now() - 6 * 3600e3);
  if (isNaN(since.getTime())) return json({ error: "Invalid since" }, 400);

  const xbl = async (path: string) => {
    const r = await fetch(`https://xbl.io${path}`, { headers: { "X-Authorization": key, Accept: "application/json" } });
    const text = await r.text();
    // deno-lint-ignore no-explicit-any
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* keep null */ }
    const code = data?.code;
    if (!r.ok || (typeof code === "number" && code >= 400)) throw new Error(`OpenXBL ${path} ${code || r.status}`);
    return data?.content ?? data;
  };

  const clips: Clip[] = [];
  const errors: string[] = [];
  try {
    const feed = await xbl("/api/v2/activity/feed");
    for (const it of feed?.activityItems || []) {
      const c = fromFeed(it);
      if (c) clips.push(c);
    }
  } catch (e) { errors.push((e as Error).message); }
  try {
    const dvr = await xbl("/api/v2/dvr/gameclips");
    for (const it of dvr?.values || dvr?.gameClips || []) {
      const c = fromDvr(it, "");
      if (c) clips.push(c);
    }
  } catch (e) { errors.push((e as Error).message); }

  if (!clips.length && errors.length) return json({ error: "Xbox clip lookup failed", details: errors }, 502);

  const fresh = clips.filter((c) => c.recorded_at && new Date(c.recorded_at) >= since && c.video_url);
  const xuids = [...new Set(fresh.map((c) => c.xuid).filter(Boolean))];
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profiles } = xuids.length
    ? await admin.from("profiles").select("discord_user_id, xbox_xuid, xbox_gamertag, ea_username").in("xbox_xuid", xuids)
    : { data: [] };
  // deno-lint-ignore no-explicit-any
  const byXuid = new Map((profiles || []).map((p: any) => [String(p.xbox_xuid), p]));
  const seen = new Set<string>();
  const out = [];
  for (const c of fresh) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    // deno-lint-ignore no-explicit-any
    const p: any = byXuid.get(c.xuid);
    if (!p) continue; // only linked club members
    out.push({ ...c, discord_user_id: p.discord_user_id, ea_username: p.ea_username, gamertag: c.gamertag || p.xbox_gamertag });
  }
  return json({ clips: out, warnings: errors });
});
