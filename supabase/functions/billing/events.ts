// Turns a Lemon Squeezy webhook or a Discord entitlement into what changes for a server.
// Pure, so both stores are handled (and tested) the same way.
import { type BillingConfig, isLive, productFor } from "../_shared/billing.ts";

export type Change =
  | { kind: "subscription"; provider: "lemonsqueezy" | "discord"; external_id: string; guild_id: string; tier: string; status: string; active: boolean; period_end: string | null; buyer: string | null; credits?: { amount: number; event_id: string } }
  | { kind: "credits"; provider: "lemonsqueezy" | "discord"; guild_id: string; amount: number; event_id: string; buyer: string | null }
  | { kind: "ignore"; reason: string };

const GUILD = /^\d{5,25}$/;

// deno-lint-ignore no-explicit-any
type Json = any;

export function lemonChange(event: string, payload: Json, config: BillingConfig, now = new Date()): Change {
  const custom = payload?.meta?.custom_data ?? {};
  const guild = String(custom.guild_id ?? "");
  if (!GUILD.test(guild)) return { kind: "ignore", reason: "no server on the purchase" };
  const buyer = GUILD.test(String(custom.discord_user_id ?? "")) ? String(custom.discord_user_id) : null;
  const a = payload?.data?.attributes ?? {};
  const id = String(payload?.data?.id ?? "");
  if (!id) return { kind: "ignore", reason: "no id" };

  if (event === "order_created" || event === "order_refunded") {
    const product = productFor(config.lemonVariants, a.first_order_item?.variant_id);
    if (!product) return { kind: "ignore", reason: "unknown product" };
    const refunded = event === "order_refunded" || a.status === "refunded";
    const pack = config.packs[product];
    if (pack) {
      // A refunded pack's images stay spent; refunds are handled by hand
      if (refunded || a.status !== "paid") return { kind: "ignore", reason: "pack not paid" };
      return { kind: "credits", provider: "lemonsqueezy", guild_id: guild, amount: pack.credits, event_id: `order:${id}`, buyer };
    }
    const plan = config.plans[product];
    if (plan?.once) {
      if (!refunded && a.status !== "paid") return { kind: "ignore", reason: "order not paid" };
      return {
        kind: "subscription", provider: "lemonsqueezy", external_id: `order:${id}`, guild_id: guild, tier: product,
        status: refunded ? "refunded" : "lifetime", active: !refunded, period_end: null, buyer,
        ...(refunded || !plan.credits ? {} : { credits: { amount: plan.credits, event_id: `order:${id}` } }),
      };
    }
    return { kind: "ignore", reason: "subscription orders are handled by subscription events" };
  }

  if (event.startsWith("subscription_") && !event.startsWith("subscription_payment")) {
    const product = productFor(config.lemonVariants, a.variant_id);
    if (!product || !config.plans[product] || config.plans[product].once) return { kind: "ignore", reason: "unknown plan" };
    const status = String(a.status ?? "");
    // Cancelled and expired plans run to ends_at; live ones have no end until Lemon Squeezy says so
    const periodEnd = ["cancelled", "expired"].includes(status) ? (a.ends_at ?? null) : null;
    return {
      kind: "subscription", provider: "lemonsqueezy", external_id: `sub:${id}`, guild_id: guild, tier: product,
      status, active: isLive(status, periodEnd, now), period_end: periodEnd, buyer,
    };
  }
  return { kind: "ignore", reason: `event ${event} not used` };
}

export type Entitlement = { id: string; sku_id: string; guild_id?: string | null; user_id?: string | null; ends_at?: string | null; deleted?: boolean; consumed?: boolean };

/** guildHint: the server where the buyer last opened a buy button, for purchases Discord ties to a user. */
export function discordChange(e: Entitlement, config: BillingConfig, guildHint: string | null = null, now = new Date()): Change {
  const product = productFor(config.discordSkus, e.sku_id);
  if (!product) return { kind: "ignore", reason: "unknown SKU" };
  const guild = e.guild_id && GUILD.test(e.guild_id) ? e.guild_id : guildHint && GUILD.test(guildHint) ? guildHint : null;
  if (!guild) return { kind: "ignore", reason: "no server for this purchase" };
  const buyer = e.user_id && GUILD.test(e.user_id) ? e.user_id : null;
  const pack = config.packs[product];
  if (pack) {
    if (e.deleted) return { kind: "ignore", reason: "pack refunded" };
    return { kind: "credits", provider: "discord", guild_id: guild, amount: pack.credits, event_id: `ent:${e.id}`, buyer };
  }
  const plan = config.plans[product];
  if (!plan) return { kind: "ignore", reason: "unknown plan" };
  if (plan.once) {
    return {
      kind: "subscription", provider: "discord", external_id: `ent:${e.id}`, guild_id: guild, tier: product,
      status: e.deleted ? "refunded" : "lifetime", active: !e.deleted, period_end: null, buyer,
      ...(e.deleted || !plan.credits ? {} : { credits: { amount: plan.credits, event_id: `ent:${e.id}` } }),
    };
  }
  const status = e.deleted ? "expired" : "active";
  const periodEnd = e.ends_at ?? null;
  return { kind: "subscription", provider: "discord", external_id: `ent:${e.id}`, guild_id: guild, tier: product, status, active: isLive(status, periodEnd, now), period_end: periodEnd, buyer };
}

export async function verifyLemonSignature(secret: string, raw: string, signature: string) {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let r = 0;
  for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return r === 0;
}
