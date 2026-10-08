// Club art: AI artwork (no text) for the Discord Graphics Studio.
// The bot composes headlines, names and stats on top, so numbers are always real.
// Auth: x-bot-secret (BOT_PROXY_SECRET). The player's in-game pro photo is the reference image,
// kept as an EA FC 3D game render (never "humanized") and dressed in the club's own kit.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rankPhotos } from "./photo-selection.ts";
import { teamPrompt, appendReferences, isRearFacing } from "./team-art.ts";

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
  style: z.enum(["esports", "modern", "vintage", "obsidian", "cyber", "chrome", "mvp", "synthwave", "sicilia", "sunday"]),
  club_name: z.string().min(1).max(60),
  kit: z.object({
    primary: z.string().max(30).optional(),
    secondary: z.string().max(30).optional(),
    description: z.string().max(200).optional(),
  }).default({}),
  discord_user_id: z.string().regex(/^\d{5,25}$/).optional(),
  guild_id: z.string().regex(/^\d{5,25}$/).optional(),
  team_player_ids: z.array(z.string().regex(/^\d{5,25}$/)).min(1).max(5).optional(),
  position: z.string().max(10).optional(),
  mood: z.enum(["win", "draw", "loss", "neutral"]).default("neutral"),
  competition: z.string().max(60).optional(),
  composition: z.enum(["lower-third", "editorial", "side-panel"]).default("lower-third"),
  pose: z.enum(["ready", "stride", "ball", "celebrate", "profile", "captain"]).default("ready"),
  variation: z.string().max(60).optional(),
  has_stats: z.boolean().default(true),
  has_tagline: z.boolean().default(true),
  // Manually confirmed by the member in the card form; treated like a verified upload number.
  kit_number_override: z.number().int().min(1).max(99).optional(),
});

const STYLE: Record<string, string> = {
  esports: "ultra esports poster look: dramatic neon rim light in the club colours, volumetric smoke, lens flares, sparks, grunge halftone and torn-paper texture, deep black shadows, high contrast",
  modern: "live sports-television broadcast look: night match under floodlights, directional light spill, slight motion blur in the background crowd, crisp rim light on the player, cool broadcast colour grade, glossy and premium like a top-flight TV production",
  vintage: "vintage 1990s trading-card look: warm faded film grain, matte paper texture, muted club colours, halftone print dots, retro stadium floodlights",
  cyber: "neo-Tokyo cyberpunk esports look: obsidian black backdrop, acid-yellow and hot-magenta neon rim lights, holographic grid haze, rain sheen, sharp high-contrast shadows",
  chrome: "liquid chrome esports major look: iridescent refracted light, floating glass shards, cool silver studio backdrop with pastel holographic reflections, specular highlights",
  mvp: "tournament MVP trophy-stage look: dark arena, golden confetti drifting, warm gold spotlights, carbon-black backdrop, champion atmosphere",
  synthwave: "synthwave chillwave look: soft dusk sky in purple, magenta and peach, distant neon glow, light haze, dreamy retro-futuristic stadium lights, smooth airbrushed gradients",
  sicilia: "1974 Sicilian collectible look: dramatic Italian movie-poster lighting, warm Mediterranean golden hour, Palermo skyline with baroque domes, bell towers and Monte Pellegrino softly behind the stadium, slightly faded grainy offset-print finish, muted pink, black, ivory and gold tones, theatrical but not parody",
  sunday: "1982 Sunday-league disaster look: grey drizzle and sideways rain, a churned muddy park pitch with puddles, the player soaked, mud-splattered kit and socks, exhausted or exasperated expression, overcast flat light, a lonely floodlight, faded wet-film grain, comic but affectionate, never cruel",
  obsidian: "elite black-and-gold look: carbon-fibre black backdrop, subtle gold foil streaks, moody spotlight, desaturated tones with gold highlights, luxury trophy-room feel",
};

function kitLine(kit: z.infer<typeof Body>["kit"], club: string) {
  const colours = [kit.primary, kit.secondary].filter(Boolean).join(" and ");
  return `The player must wear ${club}'s own kit${colours ? ` in ${colours}` : ""}${kit.description ? ` (${kit.description})` : ""}, whatever kit the reference shows. No real-world brand or sponsor logos.`;
}

function promptFor(b: z.infer<typeof Body>, hasRef: boolean, kitNumber: number | null = null) {
  const look = STYLE[b.style];
  const render = "Keep it looking like an EA SPORTS FC in-game 3D character render (video-game Virtual Pro model, game-engine shading), not a real human photo.";
  // A shirt number is allowed only when the player's own uploaded screenshot showed it legibly.
  const noText = kitNumber
    ? `No text, letters, logos or watermarks anywhere. The only numerals allowed are the player's verified kit number ${kitNumber}, printed cleanly on the shirt (and optionally shorts) where it is naturally visible; no other numbers.`
    : "Absolutely no text, letters, numbers, logos or watermarks anywhere, including no shirt or shorts numbers.";
  // Card-style shot variety: tight portraits, waist-up, action and celebration, never the same crop every time.
  const poses = {
    ready: "WAIST-UP three-quarter portrait, shoulders turned, looking towards the camera, camera at chest height",
    stride: "FULL-BODY action shot sprinting or dribbling at speed, dynamic lean, ball at the feet, boots fully visible",
    ball: "HALF-BODY shot (from mid-thigh up) holding a football under one arm, confident expression",
    celebrate: "KNEES-UP goal celebration, both arms out or one fist raised, mouth open shouting, joyful energy",
    profile: "CLOSE CHEST-UP portrait, head and shoulders filling much of the frame, intense focused stare",
    captain: "THREE-QUARTER-LENGTH (from knees up) hands-on-hips stance, slight low camera angle",
  };
  const framing = "FRAMING RULES (critical): the whole head — hair, beard, glasses and headwear — must sit completely inside the image with clear empty space above it; the top of the hair at least 9% below the top edge and the eyes never higher than 15% of the image height. Never crop the top of the head, face, chin or hands at the frame edge. For full-body shots, keep both boots inside the frame too. Centre the subject horizontally unless the composition says otherwise.";
  const placement = b.kind !== "card" ? "Subject in the upper two thirds; keep the lower third empty."
    : !b.has_stats ? `Portrait-first composition: make the virtual pro large and dominant, filling the frame from 9% (top of the hair) to ${b.has_tagline ? "86%" : "90%"} height, using the requested shot type. No empty lower third, blank side panels or reserved stat bands. Keep the top 8% and bottom ${b.has_tagline ? "14%" : "10%"} clear enough for compact club and name lettering. Continue the stadium and kit into the lower frame.`
    : b.composition === "editorial" ? "Editorial composition: leave a dark empty band from 12% to 28% height for the name; place the character below that band, face between 32% and 50% height, with the lower third empty."
    : b.composition === "side-panel" ? "Asymmetric composition: character to the right, face in the upper right half. Leave the lower left area and bottom third dark and empty for a nameplate and optional stats."
    : "Broadcast lower-third composition: character centred, face in the upper half, lower third empty for a nameplate and optional stats.";
   const poseRule = b.pose === "celebrate"
     ? "SIGNATURE CELEBRATION: if the reference photo shows a celebration pose (raised fists, arms out, knee slide, etc.), reproduce that exact celebration posture, arm and hand positions as this player's signature goal celebration — vary only the camera angle, framing and background. Take the face, hair, beard and accessories from the reference."
     : "Never copy the reference photo's posture, arm or hand positions — take only the face, hair, beard and accessories from it.";
   const variation = `Creative edition ${b.variation || crypto.randomUUID()}: independently vary camera angle, stadium detail and lighting within the selected style. The pose must be ${poses[b.pose]}. ${poseRule} Never copy its background or typography. ${placement} ${framing}`;
  if (b.kind === "banner") {
    return `Championship celebration artwork for the esports football club ${b.club_name}${b.competition ? ` winning ${b.competition}` : ""}. A large gleaming trophy in the centre on a stage, confetti and pyrotechnics, stadium lights. ${hasRef ? `The reference shows one of the club's players: include them lifting or standing beside the trophy, keeping their face, hair and accessories. ${render} ${kitLine(b.kit, b.club_name)}` : `Club colours ${[b.kit.primary, b.kit.secondary].filter(Boolean).join(" and ") || "throughout"}.`} Style: ${look}. Wide landscape composition. Independently vary trophy camera angle, lighting and stage arrangement for edition ${b.variation || crypto.randomUUID()}. ${noText}`;
  }
  const action = b.kind === "poster"
    ? b.mood === "win" ? "celebrating a victory with a fist pump, roaring" : b.mood === "loss" ? "determined, walking off the pitch, focused" : "intense, ready for kick-off"
    : `player-card portrait${b.position ? `, as a ${b.position}` : ""}`;
  const subject = hasRef
    ? `Recreate this exact in-game Virtual Pro character (same face, skin tone, hair, beard, glasses and accessories), ${action}. Preserve identity and game-render materials, but pose the body freshly as requested; adapt the camera and background to this graphic. ${render} ${kitLine(b.kit, b.club_name)}`
    : `A stylised silhouette of a footballer in ${b.club_name}'s kit (${[b.kit.primary, b.kit.secondary].filter(Boolean).join(" and ") || "club colours"}), ${action}, seen from behind or in shadow so no face is shown.`;
  return `Vertical football club artwork. ${subject} Stadium background lit in the club colours. Style: ${look}. ${variation} ${noText}`;
}

async function proPhoto(b: z.infer<typeof Body>, team = false): Promise<{ file: File; kitNumber: number | null; description: string | null } | null> {
  if (!b.discord_user_id) return null;
  const { data: assets } = await db.from("pro_photo_assets").select("image_url,pose,source_kind,graphic_kind,analysis")
    .eq("discord_user_id", b.discord_user_id).order("created_at", { ascending: false }).limit(200);
  // Group art uses only the player's own face-visible uploads: rear shots force the model to invent a face,
  // and generated art can already carry another player's traits.
  const pool = team ? (assets ?? []).filter((a) => a.source_kind === "upload" && !isRearFacing(a.analysis?.description)) : (assets ?? []);
  const candidates: { image_url: string; analysis?: { description?: string } | null }[] = rankPhotos(pool, b.pose, b.kind, b.club_name);
  // Latest number legibly read from the player's own uploads; generated art never verifies a number.
  const n = (assets ?? []).find((a) => a.source_kind === "upload" && Number.isInteger(a.analysis?.kit_number))?.analysis?.kit_number;
  const kitNumber = Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
  if (!team || !candidates.length) {
    const { data: latest } = await db.from("pro_photos").select("image_url").eq("discord_user_id", b.discord_user_id).maybeSingle();
    if (latest) candidates.push(latest);
  }
  for (const photo of candidates) {
    try {
      const res = await fetch(photo.image_url);
      const type = (res.headers.get("content-type") || "").split(";")[0];
      if (!res.ok || !/^image\/(png|jpe?g|webp)$/.test(type)) continue;
      const description = photo.analysis?.description ?? null;
      return { file: new File([await res.arrayBuffer()], `pro.${type.split("/")[1]}`, { type }), kitNumber, description };
    } catch { /* Try another saved photo when a reference is no longer reachable. */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (!SECRET || !safeEqual(req.headers.get("x-bot-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  if (!AI_KEY) return json({ error: "AI is not configured." }, 500);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;

  const teamIds = [...new Set(b.team_player_ids ?? [])];
  if (teamIds.length && (b.kind === 'card' || !b.guild_id)) return json({ error: 'Team artwork needs a server and a team-focused graphic.' }, 400);
  if (teamIds.length) {
    // Recheck membership server-side rather than trusting a supplied player list.
    const { data: teams, error: teamError } = await db.from('teams').select('id').eq('guild_id', b.guild_id).ilike('name', b.club_name);
    if (teamError) return json({ error: 'Could not verify the active club roster.' }, 503);
    if (teams?.length !== 1) return json({ error: 'Could not identify the exact club team.' }, 422);
    const { data: roster, error } = await db.from('team_rosters').select('discord_user_id,status').eq('team_id', teams[0].id).in('discord_user_id', teamIds);
    if (error) return json({ error: 'Could not verify the active club roster.' }, 503);
    const active = new Set((roster ?? []).filter((r) => (r.status || 'active') === 'active').map((r) => r.discord_user_id));
    if (teamIds.some((id) => !active.has(id))) return json({ error: 'Team artwork can only feature active players from this club.' }, 422);
  }
  const { data: names } = teamIds.length
    ? await db.from('profiles').select('discord_user_id,ea_username').in('discord_user_id', teamIds)
    : { data: [] };
  const nameOf = new Map((names ?? []).map((p) => [p.discord_user_id, p.ea_username]));
  const group = await Promise.all(teamIds.map(async (userId) => {
    const photo = await proPhoto({ ...b, discord_user_id: userId }, true);
    return photo ? { ...photo, userId, name: nameOf.get(userId) ?? null } : null;
  }));
  if (group.some((r) => !r)) return json({ error: 'A selected active player has no reachable saved pro photo. Nothing was rendered.' }, 422);
  const refs = group.filter((r) => r !== null);
  const found = teamIds.length ? null : await proPhoto(b);
  const ref = found?.file ?? null;
  const kitNumber = b.kit_number_override ?? found?.kitNumber ?? null;
  const prompt = refs.length ? teamPrompt(b, refs, STYLE[b.style], kitLine(b.kit, b.club_name)) : promptFor(b, !!ref, kitNumber);
  const size = b.kind === "banner" ? "1536x1024" : "1024x1536";
  let res: Response;
  if (ref || refs.length) {
    const form = new FormData();
    form.set("model", MODEL);
    form.set("prompt", prompt);
    form.set("size", size);
    appendReferences(form, refs.length ? refs : ref ? [{ file: ref }] : []);
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
  let artworkSaved = !b.discord_user_id;
  if (!teamIds.length && b.discord_user_id && ref) {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const sourceKey = crypto.randomUUID();
    const path = `generated/${b.discord_user_id}/${sourceKey}.png`;
    const saved = await db.storage.from("pro-photos").upload(path, bytes, { contentType: "image/png" });
    if (!saved.error) {
      const signed = await db.storage.from("pro-photos").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (!signed.error) {
        const { error } = await db.from("pro_photo_assets").insert({
        discord_user_id: b.discord_user_id, guild_id: "graphics-studio", image_url: signed.data.signedUrl,
        storage_path: path, source_key: sourceKey, source_kind: "generated", graphic_kind: b.kind,
        pose: b.pose, analysis: { style: b.style, composition: b.composition, club_name: b.club_name },
        });
        artworkSaved = !error;
      }
    }
  }
  return json({ image_b64: b64, used_pro_photo: !!ref || refs.length > 0, artwork_saved: artworkSaved, kit_number: teamIds.length ? null : kitNumber, team_player_ids: teamIds });
});
