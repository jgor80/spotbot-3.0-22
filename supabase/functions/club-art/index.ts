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
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
  const noText = "Absolutely no text, letters, numbers, logos or watermarks anywhere; leave clean dark space in the lower third for a headline.";
  if (b.kind === "banner") {
    return `Championship celebration artwork for the esports football club ${b.club_name}${b.competition ? ` winning ${b.competition}` : ""}. A large gleaming trophy in the centre on a stage, confetti and pyrotechnics, stadium lights. ${hasRef ? `The reference shows one of the club's players: include them lifting or standing beside the trophy, keeping their face, hair and accessories. ${render} ${kitLine(b.kit, b.club_name)}` : `Club colours ${[b.kit.primary, b.kit.secondary].filter(Boolean).join(" and ") || "throughout"}.`} Style: ${look}. Wide landscape composition. ${noText}`;
  }
  const action = b.kind === "poster"
    ? b.mood === "win" ? "celebrating a victory with a fist pump, roaring" : b.mood === "loss" ? "determined, walking off the pitch, focused" : "intense, ready for kick-off"
    : `heroic portrait pose for a player card${b.position ? `, as a ${b.position}` : ""}`;
  const subject = hasRef
    ? `The reference image is the player's in-game Virtual Pro. Recreate this exact character (same face, skin tone, hair, beard, glasses and accessories), ${action}, waist-up, centred, filling the upper two thirds. ${render} ${kitLine(b.kit, b.club_name)}`
    : `A stylised silhouette of a footballer in ${b.club_name}'s kit (${[b.kit.primary, b.kit.secondary].filter(Boolean).join(" and ") || "club colours"}), ${action}, seen from behind or in shadow so no face is shown.`;
  return `Vertical esports football graphic artwork. ${subject} Stadium background lit in the club colours. Style: ${look}. ${noText}`;
}

async function proPhoto(discordId?: string) {
  if (!discordId) return null;
  const { data } = await db.from("pro_photos").select("image_url").eq("discord_user_id", discordId).maybeSingle();
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

  const ref = await proPhoto(b.discord_user_id);
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
    const detail = await res.text().catch(() => "");
    console.error(`[club-art] AI ${res.status}: ${detail.slice(0, 300)}`);
    const msg = res.status === 402 ? "AI credits ran out." : res.status === 429 ? "The art studio is busy, try again in a minute." : res.status === 403 ? "The image AI refused or isn't enabled for this workspace." : "Couldn't create the artwork.";
    return json({ error: msg }, res.status >= 500 ? 502 : res.status);
  }
  const out = await res.json().catch(() => null);
  const b64 = out?.data?.[0]?.b64_json;
  if (!b64) return json({ error: "The AI returned no image (it may have declined the request)." }, 502);
  return json({ image_b64: b64, used_pro_photo: !!ref });
});
