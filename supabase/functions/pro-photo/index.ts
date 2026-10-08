// Ingests an in-game Pro Clubs photo for a player: checks it with AI vision, stores it, and saves
// what the AI could read from the screen (position, overall, archetype). Called only by the bot.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

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
});

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["is_pro_clubs_player", "reason", "screen", "position", "overall", "archetype", "height", "playstyles", "pose", "description"],
  properties: {
    is_pro_clubs_player: { type: "boolean", description: "True if the image shows an EA FC Pro Clubs / Virtual Pro player (render, lobby, edit-pro, team sheet or player card)." },
    reason: { type: "string" },
    screen: { type: "string", enum: ["edit_pro", "lobby", "player_card", "match", "team_sheet", "other"] },
    position: { type: ["string", "null"], description: "Position abbreviation visible on screen, e.g. ST, CAM, CB, GK" },
    overall: { type: ["integer", "null"] },
    archetype: { type: ["string", "null"] },
    height: { type: ["string", "null"] },
    playstyles: { type: "array", items: { type: "string" } },
    pose: { type: "string", enum: ["ready", "stride", "ball", "celebrate", "profile", "captain", "other"], description: "The closest reusable graphics pose shown by the player." },
    description: { type: "string", description: "One short sentence describing the pro's look (kit, hair, boots). No guesses about real identity." },
  },
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

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
          { type: "input_text", text: "Is this an image of a single footballer that a club member could use as their EA SPORTS FC Pro Clubs player (Virtual Pro)? Accept in-game screenshots (Edit Pro, lobby, player card, match) AND custom renders, cutouts or action shots of one player in kit, even with no game menus or HUD visible and even if very photorealistic — EA renders look lifike. Set is_pro_clubs_player false only for images with no footballer, multiple players with no clear subject, memes, or obviously unrelated content. Read any position, overall rating, archetype, height and playstyles visible on screen. Classify the visible pose as ready, stride, ball, celebrate, profile, captain or other so graphics can reuse the best reference. Use null when facts are not visible. Never invent values." },
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

Deno.serve(async (req) => {
  if (!SECRET || !safeEqual(req.headers.get("x-bot-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { guild_id, discord_user_id, image_url, submitted_by } = parsed.data;

  const img = await fetch(image_url);
  const type = (img.headers.get("content-type") || "").split(";")[0];
  if (!img.ok || !/^image\/(png|jpe?g|webp)$/.test(type)) return json({ error: "Send a PNG, JPG or WebP image." }, 400);
  const bytes = new Uint8Array(await img.arrayBuffer());
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

  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${guild_id}/${discord_user_id}-${sourceKey}.${ext}`;
  const up = await db.storage.from("pro-photos").upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) return json({ error: "Couldn't store the photo." }, 500);
  const signed = await db.storage.from("pro-photos").createSignedUrl(path, TEN_YEARS);
  if (signed.error) return json({ error: "Couldn't store the photo." }, 500);

  const { data: prof } = await db.from("profiles").select("ea_username").eq("discord_user_id", discord_user_id).maybeSingle();
  const pos = typeof analysis.position === "string" ? analysis.position.toUpperCase().slice(0, 5) : null;
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
});
