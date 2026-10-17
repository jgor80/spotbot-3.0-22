// Ingests an in-game Pro Clubs photo for a player: checks it with AI vision, stores it, and saves
// what the AI could read from the screen (position, overall, archetype). Called by the bot (Discord
// attachments) and by signed-in web users for their own pro (Trophy Room → My Pro Photos).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { ManageBody, managePhotos } from "./manage.ts";
import { identifyCaller } from "../_shared/auth.ts";

const SECRET = Deno.env.get("BOT_PROXY_SECRET") ?? "";
const AI_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX_BYTES = 8 * 1024 * 1024;
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

const Body = z.object({
  guild_id: z.string().regex(/^\d{5,25}$/),
  discord_user_id: z.string().regex(/^\d{5,25}$/),
  submitted_by: z.string().regex(/^\d{5,25}$/).optional(),
  image_url: z.string().url().refine((u) => /^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(u), "Discord attachments only"),
  // Which guided shot the member was asked for (Studio → Upload Photos); sets the reusable pose.
  shot: z.enum(["headshot", "celebration"]).optional(),
});

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["is_pro_clubs_player", "is_raw_capture", "face_visible", "reason", "screen", "position", "overall", "archetype", "height", "playstyles", "pose", "kit_number", "description"],
  properties: {
    is_pro_clubs_player: { type: "boolean", description: "True if the image shows an EA FC Pro Clubs / Virtual Pro player (render, lobby, edit-pro, team sheet or player card)." },
    is_raw_capture: { type: "boolean", description: "True only for an unedited capture of the game: a console/PC screenshot or a phone photo of a TV or monitor showing the game. False for AI-generated or AI-edited images, fan renders, drawings, cutouts and composites." },
    face_visible: { type: "boolean", description: "True if the pro's face is clearly visible (not from behind, not hidden)." },
    reason: { type: "string" },
    screen: { type: "string", enum: ["edit_pro", "lobby", "player_card", "match", "team_sheet", "other"] },
    position: { type: ["string", "null"], description: "Position abbreviation visible on screen, e.g. ST, CAM, CB, GK" },
    overall: { type: ["integer", "null"] },
    archetype: { type: ["string", "null"] },
    height: { type: ["string", "null"] },
    playstyles: { type: "array", items: { type: "string" } },
    pose: { type: "string", enum: ["ready", "stride", "ball", "celebrate", "profile", "captain", "other"], description: "The closest reusable graphics pose shown by the player." },
    kit_number: { type: ["integer", "null"], description: "Shirt/kit number only when clearly and fully legible on the player's kit or an on-screen kit-number field; otherwise null." },
    description: { type: "string", description: "One short sentence describing the pro's look (kit, hair, boots). No guesses about real identity." },
  },
};

// The web app: the member's own photos only, whoever the body names. guild_id is optional; when given it
// must be a server they can see, and tags the upload like a Discord one from that server.
const WebBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("web_upload"), image_b64: z.string().min(100).max(12_000_000), content_type: z.enum(["image/png", "image/jpeg", "image/webp"]), shot: z.enum(["headshot", "celebration"]).optional(), guild_id: z.string().regex(/^\d{5,25}$/).optional() }),
  z.object({ action: z.literal("web_list") }),
  z.object({ action: z.literal("web_delete"), photo_asset_id: z.string().uuid() }),
]);
const WEB_GUILD = "web-upload";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });

async function analyze(dataUrl: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": AI_KEY, Authorization: `Bearer ${AI_KEY}`, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "pro_photo", strict: true, schema } },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Is this an image of a single footballer that a club member could use as their EA SPORTS FC Pro Clubs player (Virtual Pro)? It may be an in-game screenshot (Edit Pro, goal celebrations, lobby, player card, match) or a phone photo of a TV or monitor showing the game; screen glare, a tilted angle, moiré lines, bezels or a living room around the screen are fine. EA's game engine looks lifelike, so photorealism alone is not a reason to reject. Set is_pro_clubs_player false only for images with no footballer, multiple players with no clear subject, memes, or obviously unrelated content. Set is_raw_capture false when the image looks AI-generated or AI-edited (e.g. Midjourney or ChatGPT art, smoothed painterly skin, warped hands or text), a fan render, drawing, cutout on a plain background or a composite; we only keep real captures of the game so artwork matches the player's actual pro. Describe the pro, not the TV or room. Read any position, overall rating, archetype, height and playstyles visible on screen. Read the kit number only if it is clearly legible on the shirt, shorts or an on-screen kit number field — never guess partly hidden digits. Classify the visible pose as ready, stride, ball, celebrate, profile, captain or other so graphics can reuse the best reference. Use null when facts are not visible. Never invent values." },
          { type: "input_image", image_url: dataUrl },
        ],
      }],
    }),
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "");
    throw Object.assign(new Error(`AI ${res.status}: ${msg.slice(0, 200)}`), { status: res.status });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") text += ev.delta;
        if (ev.type === "response.refusal.delta" || ev.type === "error") throw new Error("AI declined the image");
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("AI")) throw e;
      }
    }
  }
  return JSON.parse(text);
}

// The signed-in web user's verified Discord account, or null
async function webMember(req: Request): Promise<string | null> {
  const caller = await identifyCaller(req, db);
  if (caller?.kind !== "user") return null;
  const { data: link } = await db.from("user_discord_links").select("discord_user_id").eq("auth_user_id", caller.userId).eq("verified", true).maybeSingle();
  return link?.discord_user_id ?? null;
}

async function handleWeb(req: Request, input: unknown) {
  const member = await webMember(req);
  if (!member) return json({ error: "Sign in with Discord to manage your pro photos." }, 401);
  const parsed = WebBody.safeParse(input);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const b = parsed.data;
  if (b.action === "web_list") {
    const { data, error } = await db.from("pro_photo_assets").select("id,storage_path,image_url,pose,analysis,created_at")
      .eq("discord_user_id", member).eq("source_kind", "upload").order("created_at", { ascending: false }).limit(30);
    if (error) return json({ error: "Couldn't load your photos." }, 500);
    const photos = await Promise.all((data ?? []).map(async (p) => ({
      id: p.id, pose: p.pose, description: p.analysis?.description ?? null, created_at: p.created_at,
      image_url: p.storage_path ? (await db.storage.from("pro-photos").createSignedUrl(p.storage_path, 3600)).data?.signedUrl ?? null : p.image_url,
    })));
    return json({ photos });
  }
  if (b.action === "web_delete") {
    const result = await managePhotos(db, { action: "delete", discord_user_id: member, requester_id: member, photo_asset_id: b.photo_asset_id });
    return json(result.body, result.status);
  }
  let guildId = WEB_GUILD;
  if (b.guild_id) {
    // Same check the web app's own reads use: the member can see that server
    const userDb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "", { global: { headers: { Authorization: req.headers.get("authorization") ?? "" } } });
    const { data: allowed } = await userDb.rpc("user_has_guild_access", { check_guild_id: b.guild_id });
    if (allowed === true) guildId = b.guild_id;
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(b.image_b64), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: "That file couldn't be read." }, 400);
  }
  return ingest({ guild_id: guildId, discord_user_id: member, submitted_by: member, bytes, type: b.content_type, shot: b.shot });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  const input = await req.json().catch(() => null);
  if (!SECRET || !safeEqual(req.headers.get("x-bot-secret") ?? "", SECRET)) {
    return typeof input?.action === "string" && input.action.startsWith("web_") ? handleWeb(req, input) : json({ error: "unauthorized" }, 401);
  }
  if (input?.action === "list" || input?.action === "delete") {
    const management = ManageBody.safeParse(input);
    if (!management.success) return json({ error: "Invalid photo management request." }, 400);
    const result = await managePhotos(db, management.data);
    return json(result.body, result.status);
  }
  const parsed = Body.safeParse(input);
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { guild_id, discord_user_id, image_url, submitted_by, shot } = parsed.data;

  const img = await fetch(image_url);
  const type = (img.headers.get("content-type") || "").split(";")[0];
  if (!img.ok || !/^image\/(png|jpe?g|webp)$/.test(type)) return json({ error: "Send a PNG, JPG or WebP image." }, 400);
  return ingest({ guild_id, discord_user_id, submitted_by, bytes: new Uint8Array(await img.arrayBuffer()), type, shot });
});

// Check, store and record one upload: the same rules for Discord and the web
async function ingest({ guild_id, discord_user_id, submitted_by, bytes, type, shot }: { guild_id: string; discord_user_id: string; submitted_by?: string; bytes: Uint8Array<ArrayBuffer>; type: string; shot?: "headshot" | "celebration" }) {
  if (bytes.length > MAX_BYTES) return json({ error: "Image is over 8 MB." }, 400);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sourceKey = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  const { data: existing } = await db.from("pro_photo_assets").select("image_url,analysis").eq("discord_user_id", discord_user_id).eq("source_key", sourceKey).maybeSingle();
  if (existing) return json({ accepted: true, image_url: existing.image_url, analysis: existing.analysis, already_saved: true });

  let b64 = "";
  for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  let analysis;
  try {
    analysis = await analyze(`data:${type};base64,${btoa(b64)}`);
  } catch (e) {
    const status = (e as { status?: number }).status;
    return json({ error: status === 402 ? "AI credits ran out." : status === 429 ? "AI is busy, try again in a minute." : "Couldn't analyze that image." }, status && status < 500 ? status : 502);
  }
  if (!analysis.is_pro_clubs_player) return json({ accepted: false, analysis });
  if (analysis.is_raw_capture === false) return json({ accepted: false, analysis, error: "That looks like an AI rendering or edited image. Upload a raw screenshot or a phone photo of your screen instead." });
  if (shot === "headshot" && analysis.face_visible === false) return json({ accepted: false, analysis, error: "The headshot needs your pro's face clearly visible, facing the camera." });
  if (shot === "headshot") analysis.pose = "profile";
  else if (shot === "celebration") analysis.pose = "celebrate";

  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${guild_id}/${discord_user_id}-${sourceKey}.${ext}`;
  const up = await db.storage.from("pro-photos").upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) return json({ error: "Couldn't store the photo." }, 500);
  const signed = await db.storage.from("pro-photos").createSignedUrl(path, TEN_YEARS);
  if (signed.error) return json({ error: "Couldn't store the photo." }, 500);

  const { data: prof } = await db.from("profiles").select("ea_username").eq("discord_user_id", discord_user_id).maybeSingle();
  const pos = typeof analysis.position === "string" ? analysis.position.toUpperCase().slice(0, 5) : null;
  if (!(Number.isInteger(analysis.kit_number) && analysis.kit_number >= 1 && analysis.kit_number <= 99)) analysis.kit_number = null;
  const ovr = Number.isInteger(analysis.overall) && analysis.overall >= 40 && analysis.overall <= 99 ? analysis.overall : null;
  const { error: assetError } = await db.from("pro_photo_assets").upsert({
    guild_id, discord_user_id, submitted_by: submitted_by ?? discord_user_id,
    image_url: signed.data.signedUrl, storage_path: path, source_key: sourceKey,
    source_kind: "upload", pose: analysis.pose === "other" ? null : analysis.pose, analysis,
  }, { onConflict: "discord_user_id,source_key", ignoreDuplicates: true });
  if (assetError) return json({ error: "Couldn't add the photo to the player's collection." }, 500);
  const { error } = await db.from("pro_photos").upsert({
    guild_id, discord_user_id, submitted_by: submitted_by ?? discord_user_id,
    ea_username: prof?.ea_username ?? null, image_url: signed.data.signedUrl,
    position: pos, overall: ovr, archetype: analysis.archetype ?? null, analysis,
  }, { onConflict: "discord_user_id" });
  if (error) return json({ error: "Couldn't save the photo." }, 500);
  return json({ accepted: true, image_url: signed.data.signedUrl, ea_username: prof?.ea_username ?? null, analysis: { ...analysis, position: pos, overall: ovr } });
}
