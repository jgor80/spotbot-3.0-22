// Club art: AI artwork (no text) for the Discord Graphics Studio.
// The bot composes headlines, names and stats on top, so numbers are always real.
// Auth: x-bot-secret (BOT_PROXY_SECRET). The player's in-game pro photo is the reference image,
// kept as an EA FC 3D game render (never "humanized") and dressed in the club's own kit.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const SECRET = Deno.env.get("BOT_PROXY_SECRET") ?? "";
const AI_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GATEWAY = "https://ai.gateway.lovable.dev";
const MODEL = "openai/gpt-image-2.5-sunburst";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const Body = z.object({
  kind: z.enum(["card", "banner", "poster"]),
  style: z.enum(["esports", "modern", "vintage", "obsidian"]),
  club_name: z.string().min(1).max(60),
  kit: z.object({
    primary: z.string().max(30).optional(),
    secondary: z.string().max(30).optional(),
    description: z.string().max(200).optional(),
  }).default({}),
  discord_user_id: z.string().regex(/^\d{5,25}$/).optional(),
  position: z.string().max(10).optional(),
  mood: z.enum(["win", "draw", "loss", "neutral"]).default("neutral"),
  competition: z.string().max(60).optional(),
  composition: z.enum(["lower-third", "editorial", "side-panel"]).default("lower-third"),
  pose: z.enum(["ready", "stride", "ball", "celebrate", "profile", "captain"]).default("ready"),
  variation: z.string().max(60).optional(),
});

const STYLE: Record<string, string> = {
  esports: "ultra esports poster look: dramatic neon rim light in the club colours, volumetric smoke, lens flares, sparks, grunge halftone and torn-paper texture, deep black shadows, high contrast",
  modern: "clean modern broadcast look like a Champions League TV graphic: crisp studio lighting, soft gradients, geometric light streaks, glassy surfaces, minimal and premium",
  vintage: "vintage 1990s trading-card look: warm faded film grain, matte paper texture, muted club colours, halftone print dots, retro stadium floodlights",
  obsidian: "elite black-and-gold look: carbon-fibre black backdrop, subtle gold foil streaks, moody spotlight, desaturated tones with gold highlights, luxury trophy-room feel",
};

function kitLine(kit: z.infer<typeof Body>["kit"], club: string) {
  const colours = [kit.primary, kit.secondary].filter(Boolean).join(" and ");
  return `The player must wear ${club}'s own home kit${colours ? ` in ${colours}` : ""}${kit.description ? ` (${kit.description})` : ""}, whatever kit the reference shows. No real-world brand or sponsor logos.`;
}

function promptFor(b: z.infer<typeof Body>, hasRef: boolean) {
  const look = STYLE[b.style];
  const render = "Keep it looking like an EA SPORTS FC in-game 3D character render (video-game Virtual Pro model, game-engine shading), not a real human photo.";
  const noText = "Absolutely no text, letters, numbers, logos or watermarks anywhere; keep the lower third dark and uncluttered for the bot's typography.";
  const poses = {
    ready: "three-quarter standing pose, shoulders turned, looking towards the camera",
    stride: "in motion striding across the pitch, natural arm swing, three-quarter view",
    ball: "holding a football at the hip, relaxed shoulders and confident expression",
    celebrate: "a composed fist-pump celebration with one arm raised",
    profile: "side-profile portrait, looking across the stadium with focused expression",
    captain: "hands on hips, captain-like stance, low camera angle",
  };
  const placement = b.kind !== "card" ? "Subject in the upper two thirds; keep the lower third empty."
    : b.composition === "editorial" ? "Editorial composition: leave a dark empty band from 12% to 28% height for the name; place the character below that band, face between 32% and 50% height, with the lower third empty."
    : b.composition === "side-panel" ? "Asymmetric composition: character to the right, face in the upper right half. Leave the lower left area and bottom third dark and empty for a nameplate and optional stats."
    : "Broadcast lower-third composition: character centred, face in the upper half, lower third empty for a nameplate and optional stats.";
  const variation = `Creative edition ${b.variation || crypto.randomUUID()}: independently vary camera angle, stadium detail and lighting within the selected style. The pose must be ${poses[b.pose]}. Do not copy the reference pose or its background. ${placement}`;
  if (b.kind === "banner") {
    return `Championship celebration artwork for the esports football club ${b.club_name}${b.competition ? ` winning ${b.competition}` : ""}. A large gleaming trophy in the centre on a stage, confetti and pyrotechnics, stadium lights. ${hasRef ? `The reference shows one of the club's players: include them lifting or standing beside the trophy, keeping their face, hair and accessories. ${render} ${kitLine(b.kit, b.club_name)}` : `Club colours ${[b.kit.primary, b.kit.secondary].filter(Boolean).join(" and ") || "throughout"}.`} Style: ${look}. Wide landscape composition. Independently vary trophy camera angle, lighting and stage arrangement for edition ${b.variation || crypto.randomUUID()}. ${noText}`;
  }
  const action = b.kind === "poster"
    ? b.mood === "win" ? "celebrating a victory with a fist pump, roaring" : b.mood === "loss" ? "determined, walking off the pitch, focused" : "intense, ready for kick-off"
    : `player-card portrait${b.position ? `, as a ${b.position}` : ""}`;
  const subject = hasRef
    ? `The reference image supplies identity only. Recreate this exact in-game Virtual Pro character (same face, skin tone, hair, beard, glasses and accessories), ${action}. Preserve identity and game-render materials but change pose, camera and background. ${render} ${kitLine(b.kit, b.club_name)}`
    : `A stylised silhouette of a footballer in ${b.club_name}'s kit (${[b.kit.primary, b.kit.secondary].filter(Boolean).join(" and ") || "club colours"}), ${action}, seen from behind or in shadow so no face is shown.`;
  return `Vertical football club artwork. ${subject} Stadium background lit in the club colours. Style: ${look}. ${variation} ${noText}`;
}

async function proPhoto(discordId?: string, pose?: string) {
  if (!discordId) return null;
  let query = db.from("pro_photo_assets").select("image_url").eq("discord_user_id", discordId).eq("source_kind", "upload");
  if (pose) query = query.eq("pose", pose);
  const { data: matched } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  const fallback = matched ?? (await db.from("pro_photo_assets").select("image_url").eq("discord_user_id", discordId).eq("source_kind", "upload").order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
  const data = fallback ?? (await db.from("pro_photos").select("image_url").eq("discord_user_id", discordId).maybeSingle()).data;
  if (!data?.image_url) return null;
  const res = await fetch(data.image_url);
  const type = (res.headers.get("content-type") || "").split(";")[0];
  if (!res.ok || !/^image\/(png|jpe?g|webp)$/.test(type)) return null;
  return new File([await res.arrayBuffer()], `pro.${type.split("/")[1]}`, { type });
}

Deno.serve(async (req) => {
  if (!SECRET || !safeEqual(req.headers.get("x-bot-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  if (!AI_KEY) return json({ error: "AI is not configured." }, 500);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;

  const ref = await proPhoto(b.discord_user_id, b.pose);
  const prompt = promptFor(b, !!ref);
  const size = b.kind === "banner" ? "1536x1024" : "1024x1536";
  let res: Response;
  if (ref) {
    const form = new FormData();
    form.set("model", MODEL);
    form.set("prompt", prompt);
    form.set("size", size);
    form.append("image", ref);
    res = await fetch(`${GATEWAY}/v1/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${AI_KEY}` }, body: form });
  } else {
    res = await fetch(`${GATEWAY}/v1/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, size }),
    });
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    console.error(`[club-art] AI failed: ${res.status}`);
    const safeMessage = detail?.error?.message ?? detail?.message ?? (typeof detail?.error === "string" ? detail.error : null);
    const msg = typeof safeMessage === "string" ? safeMessage : "Couldn't create the artwork.";
    return json({ error: msg }, res.status >= 500 ? 502 : res.status);
  }
  const out = await res.json().catch(() => null);
  const b64 = out?.data?.[0]?.b64_json;
  if (!b64) return json({ error: "The AI returned no image or declined the request. Nothing was rendered." }, 422);
  if (b.discord_user_id) {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const sourceKey = crypto.randomUUID();
    const path = `generated/${b.discord_user_id}/${sourceKey}.png`;
    const saved = await db.storage.from("pro-photos").upload(path, bytes, { contentType: "image/png" });
    if (!saved.error) {
      const signed = await db.storage.from("pro-photos").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (!signed.error) await db.from("pro_photo_assets").insert({
        discord_user_id: b.discord_user_id, guild_id: "graphics-studio", image_url: signed.data.signedUrl,
        storage_path: path, source_key: sourceKey, source_kind: "generated", graphic_kind: b.kind,
        pose: b.pose, analysis: { style: b.style, composition: b.composition, club_name: b.club_name },
      });
    }
  }
  return json({ image_b64: b64, used_pro_photo: !!ref });
});
