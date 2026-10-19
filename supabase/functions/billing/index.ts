// Buying AI image plans and packs for a Discord server, on the website or in Discord's store.
// - Lemon Squeezy webhooks (X-Signature, LEMONSQUEEZY_WEBHOOK_SECRET): plans and packs bought on the web.
// - Bot (x-bot-secret): `discord_entitlement` for purchases in Discord's store, `status` for Studio.
// - Signed-in web users: `web_status` and `web_checkout` for servers they can see (user_has_guild_access).
// Both stores write the same billing_subscriptions rows and image_credits balance, at the same prices.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { identifyCaller } from "../_shared/auth.ts";
import { billingConfig, siteUrl, usageOf } from "../_shared/billing.ts";
import { type Change, discordChange, lemonChange, verifyLemonSignature } from "./events.ts";

const SECRET = Deno.env.get("BOT_PROXY_SECRET") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
const guildId = z.string().regex(/^\d{5,25}$/);

const BotBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), guild_id: guildId }),
  z.object({
    action: z.literal("discord_entitlement"),
    guild_hint: guildId.nullable().optional(),
    entitlement: z.object({
      id: z.string().max(30), sku_id: z.string().max(30), guild_id: z.string().max(30).nullable().optional(), user_id: z.string().max(30).nullable().optional(),
      ends_at: z.string().max(40).nullable().optional(), deleted: z.boolean().optional(), consumed: z.boolean().optional(),
    }),
  }),
]);
const WebBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("web_status"), guild_id: guildId }),
  z.object({ action: z.literal("web_checkout"), guild_id: guildId, product: z.string().max(30) }),
]);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function apply(change: Change) {
  if (change.kind === "ignore") return { applied: false, reason: change.reason };
  if (change.kind === "debit") {
    const removed = await removeCredits(change.guild_id, change.amount, change.provider, change.event_id);
    return { applied: true, removed };
  }
  if (change.kind === "subscription") {
    if (change.source_updated_at) {
      const { data: current } = await db.from("billing_subscriptions").select("source_updated_at")
        .eq("provider", change.provider).eq("external_id", change.external_id).maybeSingle();
      if (current?.source_updated_at && new Date(current.source_updated_at) > new Date(change.source_updated_at)) {
        return { applied: false, reason: "older than the saved state" };
      }
    }
    const { error } = await db.from("billing_subscriptions").upsert({
      guild_id: change.guild_id, provider: change.provider, external_id: change.external_id, tier: change.tier, status: change.status,
      active: change.active, current_period_end: change.period_end, buyer_discord_id: change.buyer, updated_at: new Date().toISOString(),
      ...(change.source_updated_at ? { source_updated_at: change.source_updated_at } : {}),
    }, { onConflict: "provider,external_id" });
    if (error) throw new Error(`subscription save failed: ${error.message}`);
    if (change.credits) await addCredits(change.guild_id, change.credits.amount, change.provider, change.credits.event_id);
    if (change.debit) await removeCredits(change.guild_id, change.debit.amount, change.provider, change.debit.event_id);
    return { applied: true, tier: change.tier, active: change.active };
  }
  const added = await addCredits(change.guild_id, change.amount, change.provider, change.event_id);
  return { applied: true, credits: change.amount, added };
}

// Takes back up to `amount` unspent pack images, once per refund event; returns how many were removed.
async function removeCredits(guild: string, amount: number, provider: string, eventId: string) {
  const { data, error } = await db.rpc("remove_image_credits", { p_guild: guild, p_credits: amount, p_provider: provider, p_event: eventId });
  if (error) throw new Error(`refund failed: ${error.message}`);
  const removed = Number(data) || 0;
  if (removed < amount) console.warn(`[billing] refund ${eventId}: ${amount - removed} of ${amount} images were already spent in ${guild}`);
  return removed;
}

async function addCredits(guild: string, amount: number, provider: string, eventId: string) {
  const { data, error } = await db.rpc("add_image_credits", { p_guild: guild, p_credits: amount, p_provider: provider, p_event: eventId });
  if (error) throw new Error(`credits failed: ${error.message}`);
  return data === true;
}

// What the web page and Studio show: plan, images left and what can be bought where
async function statusFor(guild: string) {
  const config = billingConfig();
  const usage = await usageOf(db, guild, config);
  const products = [
    ...Object.entries(config.plans).filter(([k]) => k !== "free").map(([key, p]) => ({ key, type: p.once ? "once" : "monthly", name: p.name, price: p.price, images: p.once ? p.credits ?? 0 : p.monthly, daily_after: p.daily_after ?? null })),
    ...Object.entries(config.packs).map(([key, p]) => ({ key, type: "pack", name: p.name, price: p.price, images: p.credits, daily_after: null })),
  ].map((p) => ({ ...p, web: Boolean(config.lemonVariants[p.key]), discord_sku: config.discordSkus[p.key] ?? null }));
  return { limits_on: config.limitsOn, tier: usage.tier, plan: usage.plan.name, used: usage.used, monthly: usage.monthly, pack_balance: usage.pack_balance, left: usage.left, products, billing_url: `${siteUrl()}/billing?guild=${guild}` };
}

async function checkout(guild: string, product: string, discordUserId: string | null) {
  const config = billingConfig();
  const variant = config.lemonVariants[product];
  const key = Deno.env.get("LEMONSQUEEZY_API_KEY");
  const store = Deno.env.get("LEMONSQUEEZY_STORE_ID");
  if (!variant || !key || !store) return json({ error: "That isn't on sale on the website yet." }, 400);
  const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: { redirect_url: `${siteUrl()}/billing?guild=${guild}&done=1` },
          checkout_data: { custom: { guild_id: guild, ...(discordUserId ? { discord_user_id: discordUserId } : {}) } },
        },
        relationships: { store: { data: { type: "stores", id: store } }, variant: { data: { type: "variants", id: variant } } },
      },
    }),
  });
  const out = await res.json().catch(() => null);
  const url = out?.data?.attributes?.url;
  if (!res.ok || typeof url !== "string") {
    console.error(`[billing] checkout failed: ${res.status}`);
    return json({ error: "Checkout is unavailable right now. Try again in a minute." }, 502);
  }
  return json({ url });
}

async function handleWebhook(req: Request) {
  const raw = await req.text();
  if (!(await verifyLemonSignature(Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET") ?? "", raw, req.headers.get("x-signature") ?? ""))) {
    return json({ error: "bad signature" }, 401);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "bad body" }, 400);
  }
  const event = String(req.headers.get("x-event-name") || payload?.meta?.event_name || "");
  const result = await apply(lemonChange(event, payload, billingConfig()));
  console.log(`[billing] lemonsqueezy ${event}: ${JSON.stringify(result)}`);
  return json({ ok: true });
}

async function handleWeb(req: Request, input: unknown) {
  const caller = await identifyCaller(req, db);
  if (caller?.kind !== "user") return json({ error: "Sign in with Discord first." }, 401);
  const parsed = WebBody.safeParse(input);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const b = parsed.data;
  // Same check the web app's own reads use: the member can see that server
  const userDb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "", { global: { headers: { Authorization: req.headers.get("authorization") ?? "" } } });
  const { data: allowed } = await userDb.rpc("user_has_guild_access", { check_guild_id: b.guild_id });
  if (allowed !== true) return json({ error: "You're not in that server." }, 403);
  if (b.action === "web_status") return json(await statusFor(b.guild_id));
  const { data: link } = await db.from("user_discord_links").select("discord_user_id").eq("auth_user_id", caller.userId).eq("verified", true).maybeSingle();
  return checkout(b.guild_id, b.product, link?.discord_user_id ?? null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  try {
    if (req.headers.get("x-signature")) return await handleWebhook(req);
    const input = await req.json().catch(() => null);
    if (SECRET && safeEqual(req.headers.get("x-bot-secret") ?? "", SECRET)) {
      const parsed = BotBody.safeParse(input);
      if (!parsed.success) return json({ error: "Invalid request." }, 400);
      const b = parsed.data;
      if (b.action === "status") return json(await statusFor(b.guild_id));
      const change = discordChange(b.entitlement, billingConfig(), b.guild_hint ?? null);
      const result = await apply(change);
      // Packs are Discord consumables: the bot consumes them once credited so they can be bought again
      return json({ ...result, consume: change.kind === "credits" });
    }
    if (typeof input?.action === "string" && input.action.startsWith("web_")) return await handleWeb(req, input);
    return json({ error: "unauthorized" }, 401);
  } catch (err) {
    console.error("[billing] failed:", err instanceof Error ? err.message : err);
    return json({ error: "Billing is unavailable right now." }, 500);
  }
});
