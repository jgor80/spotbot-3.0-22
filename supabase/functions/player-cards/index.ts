// Saved player cards: the bot stores each finished card here so members can browse and delete their own.
// Auth: x-bot-secret (BOT_PROXY_SECRET). Images live in private storage; reads return short-lived signed URLs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const SECRET = Deno.env.get("BOT_PROXY_SECRET") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const BUCKET = "pro-photos";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const id = z.string().regex(/^\d{5,25}$/);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), guild_id: id, discord_user_id: id, style: z.string().max(30), name: z.string().min(1).max(40),
    front_b64: z.string().min(10).max(12_000_000), back_b64: z.string().max(12_000_000).optional() }),
  z.object({ action: z.literal("list"), discord_user_id: id }),
  z.object({ action: z.literal("get"), discord_user_id: id, card_id: z.string().uuid() }),
  z.object({ action: z.literal("delete"), discord_user_id: id, card_id: z.string().uuid() }),
]);
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const sign = async (path: string | null) => path ? (await db.storage.from(BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null : null;

Deno.serve(async (req) => {
  if (!SECRET || !safeEqual(req.headers.get("x-bot-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Invalid request." }, 400);
  const b = p.data;
  if (b.action === "save") {
    const key = crypto.randomUUID();
    const front = `cards/${b.discord_user_id}/${key}.png`;
    const back = b.back_b64 ? `cards/${b.discord_user_id}/${key}-back.png` : null;
    const up = await db.storage.from(BUCKET).upload(front, bytes(b.front_b64), { contentType: "image/png" });
    if (up.error) return json({ error: "Could not save the card." }, 500);
    if (back) await db.storage.from(BUCKET).upload(back, bytes(b.back_b64!), { contentType: "image/png" });
    const { data, error } = await db.from("player_cards").insert({ guild_id: b.guild_id, discord_user_id: b.discord_user_id, style: b.style, name: b.name, storage_path: front, back_path: back }).select("id").single();
    return error ? json({ error: "Could not save the card." }, 500) : json({ id: data.id });
  }
  if (b.action === "list") {
    const { data } = await db.from("player_cards").select("id,style,name,created_at").eq("discord_user_id", b.discord_user_id).order("created_at", { ascending: false }).limit(25);
    return json({ cards: data ?? [] });
  }
  // Owner check on every single-card action: a member can only open or delete their own cards.
  const { data: card } = await db.from("player_cards").select("*").eq("id", b.card_id).eq("discord_user_id", b.discord_user_id).maybeSingle();
  if (!card) return json({ error: "Card not found." }, 404);
  if (b.action === "get") return json({ card: { id: card.id, style: card.style, name: card.name, created_at: card.created_at, front_url: await sign(card.storage_path), back_url: await sign(card.back_path) } });
  await db.storage.from(BUCKET).remove([card.storage_path, card.back_path].filter(Boolean));
  await db.from("player_cards").delete().eq("id", card.id);
  return json({ ok: true });
});
