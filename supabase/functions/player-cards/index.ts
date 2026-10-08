// Saved player cards: the bot stores each finished card here so members can browse and delete their own.
// Auth: x-bot-secret (BOT_PROXY_SECRET). Images live in private storage; reads return short-lived signed URLs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { identifyCaller } from "../_shared/auth.ts";

const SECRET = Deno.env.get("BOT_PROXY_SECRET") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const BUCKET = "pro-photos";
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const id = z.string().regex(/^\d{5,25}$/);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("binder") }),
  z.object({ action: z.literal("latest"), guild_id: id, discord_user_ids: z.array(id).max(100).optional() }),
  z.object({ action: z.literal("save"), guild_id: id, discord_user_id: id, style: z.string().max(30), name: z.string().min(1).max(40),
    front_b64: z.string().min(10).max(12_000_000), back_b64: z.string().max(12_000_000).optional() }),
  z.object({ action: z.literal("list"), discord_user_id: id }),
  z.object({ action: z.literal("get"), discord_user_id: id, card_id: z.string().uuid() }),
  z.object({ action: z.literal("delete"), discord_user_id: id, card_id: z.string().uuid() }),
]);
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const sign = async (path: string | null) => path ? (await db.storage.from(BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  const bot = !!SECRET && safeEqual(req.headers.get("x-bot-secret") ?? "", SECRET);
  const caller = bot ? null : await identifyCaller(req, db);
  if (!bot && caller?.kind !== "user") return json({ error: "unauthorized" }, 401);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Invalid request." }, 400);
  const b = p.data;
  // Binder: the signed-in member's own collection, fronts and backs. Ownership comes from their
  // verified Discord link, never from the request body.
  if (b.action === "binder") {
    if (bot || caller?.kind !== "user") return json({ error: "Forbidden" }, 403);
    const { data: links } = await db.from("user_discord_links").select("discord_user_id").eq("auth_user_id", caller.userId);
    const ids = (links ?? []).map((l) => l.discord_user_id).filter(Boolean);
    if (!ids.length) return json({ cards: [] });
    const { data } = await db.from("player_cards").select("id,style,name,created_at,storage_path,back_path").in("discord_user_id", ids).order("created_at", { ascending: false }).limit(60);
    return json({ cards: await Promise.all((data ?? []).map(async (c) => ({ id: c.id, style: c.style, name: c.name, created_at: c.created_at, front_url: await sign(c.storage_path), back_url: await sign(c.back_path) }))) });
  }
  // Only card fronts are shared within an authorized server. Collections/backs/deletion stay bot-owner scoped.
  if (b.action === "latest") {
    if (!bot) {
      const userDb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("authorization") ?? "" } } });
      const { data: allowed, error } = await userDb.rpc("user_has_guild_access", { check_guild_id: b.guild_id });
      if (error || allowed !== true) return json({ error: "Forbidden" }, 403);
    }
    if (b.discord_user_ids?.length === 0) return json({ cards: [] });
    let query = db.from("player_cards").select("discord_user_id,style,storage_path,created_at").eq("guild_id", b.guild_id).order("created_at", { ascending: false }).limit(1000);
    if (b.discord_user_ids) query = query.in("discord_user_id", b.discord_user_ids);
    const { data, error } = await query;
    if (error) return json({ error: "Could not load cards." }, 500);
    const seen = new Set<string>();
    const latest = (data ?? []).filter(card => { if (seen.has(card.discord_user_id)) return false; seen.add(card.discord_user_id); return true; });
    return json({ cards: await Promise.all(latest.map(async card => ({ discord_user_id: card.discord_user_id, style: card.style, front_url: await sign(card.storage_path) }))) });
  }
  if (!bot) return json({ error: "Forbidden" }, 403);
  if (b.action === "save") {
    const key = crypto.randomUUID();
    const front = `cards/${b.discord_user_id}/${key}.png`;
    const back = b.back_b64 ? `cards/${b.discord_user_id}/${key}-back.png` : null;
    const up = await db.storage.from(BUCKET).upload(front, bytes(b.front_b64), { contentType: "image/png" });
    if (up.error) return json({ error: "Could not save the card." }, 500);
    if (back && b.back_b64) await db.storage.from(BUCKET).upload(back, bytes(b.back_b64), { contentType: "image/png" });
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
