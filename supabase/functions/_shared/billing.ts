// AI image plans, packs and allowances, shared by club-art (spending images) and billing (buying them).
// Prices here are only what the website shows; what a buyer is charged is set in the Lemon Squeezy and
// Discord store dashboards, which must match (Discord's price-parity rule). Every number can be
// overridden with BILLING_PLANS / BILLING_PACKS (JSON, merged per key) without a code change.

// deno-lint-ignore no-explicit-any
type Db = any;

export type Tier = "free" | "lifetime" | "starter" | "club" | "pro" | "unlimited";
export type Plan = { name: string; price: number; monthly: number; welcome?: number; daily_after?: number; once?: boolean; credits?: number };
export type Pack = { name: string; price: number; credits: number };

export const DEFAULT_PLANS: Record<Tier, Plan> = {
  free: { name: "Free", price: 0, monthly: 0, welcome: 10 },
  lifetime: { name: "Club Unlock", price: 19.99, monthly: 0, once: true, credits: 60 },
  starter: { name: "Starter", price: 4.99, monthly: 25 },
  club: { name: "Club", price: 9.99, monthly: 60 },
  pro: { name: "Pro", price: 19.99, monthly: 140 },
  unlimited: { name: "Unlimited", price: 49.99, monthly: 350, daily_after: 10 },
};
export const DEFAULT_PACKS: Record<string, Pack> = {
  pack30: { name: "30 images", price: 4.99, credits: 30 },
  pack80: { name: "80 images", price: 12.99, credits: 80 },
};
// Higher wins when a server holds more than one (say a Discord and a website plan)
export const TIER_RANK: Tier[] = ["free", "lifetime", "starter", "club", "pro", "unlimited"];
// Statuses that still give the plan (a cancelled subscription runs to the end of its period)
const LIVE = new Set(["active", "on_trial", "past_due", "cancelled", "lifetime"]);

function overrides<T>(base: Record<string, T>, raw: string | undefined): Record<string, T> {
  if (!raw) return base;
  try {
    const extra = JSON.parse(raw) as Record<string, Partial<T>>;
    const out: Record<string, T> = { ...base };
    for (const [k, v] of Object.entries(extra)) if (v && typeof v === "object") out[k] = { ...(base[k] ?? {}), ...v } as T;
    return out;
  } catch {
    console.warn("[billing] ignoring invalid BILLING_PLANS/BILLING_PACKS JSON");
    return base;
  }
}

function idMap(raw: string | undefined): Record<string, string> {
  try {
    const v = JSON.parse(raw || "{}");
    return Object.fromEntries(Object.entries(v).filter(([, id]) => typeof id === "string" || typeof id === "number").map(([k, id]) => [k, String(id)]));
  } catch {
    return {};
  }
}

export type BillingConfig = {
  plans: Record<string, Plan>;
  packs: Record<string, Pack>;
  // product key (a tier or a pack) -> store id
  lemonVariants: Record<string, string>;
  discordSkus: Record<string, string>;
  limitsOn: boolean;
};

export function billingConfig(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): BillingConfig {
  return {
    plans: overrides(DEFAULT_PLANS, env("BILLING_PLANS")),
    packs: overrides(DEFAULT_PACKS, env("BILLING_PACKS")),
    lemonVariants: idMap(env("LEMONSQUEEZY_VARIANTS")),
    discordSkus: idMap(env("DISCORD_SKUS")),
    limitsOn: /^(on|true|1|yes)$/i.test(String(env("IMAGE_LIMITS") || "").trim()),
  };
}

/** Which product a store id sells, or null. */
export function productFor(ids: Record<string, string>, storeId: string | number | null | undefined): string | null {
  if (storeId === null || storeId === undefined) return null;
  return Object.entries(ids).find(([, id]) => id === String(storeId))?.[0] ?? null;
}

export type SubscriptionRow = { tier: string; status: string; active: boolean; current_period_end: string | null };

/** The best plan among a server's subscription rows and manual grant. */
export function activeTier(rows: SubscriptionRow[], manual: { enabled?: boolean; expires_at?: string | null; tier?: string | null } | null, now = new Date()): Tier {
  let best: Tier = "free";
  const take = (t: string) => {
    if (TIER_RANK.includes(t as Tier) && TIER_RANK.indexOf(t as Tier) > TIER_RANK.indexOf(best)) best = t as Tier;
  };
  for (const r of rows) {
    if (!r.active || !LIVE.has(r.status)) continue;
    if (r.current_period_end && new Date(r.current_period_end) <= now) continue;
    take(r.tier);
  }
  if (manual?.enabled && (!manual.expires_at || new Date(manual.expires_at) > now)) take(manual.tier || "unlimited");
  return best;
}

export function isLive(status: string, periodEnd: string | null, now = new Date()) {
  return LIVE.has(status) && (!periodEnd || new Date(periodEnd) > now);
}

/** Images one render costs: group art sends a photo per player, so it counts double. */
export function creditsFor(kind: string, teamPlayers: number) {
  return teamPlayers > 0 || kind === "banner" ? 2 : 1;
}

export async function tierOf(db: Db, guildId: string, env: (k: string) => string | undefined = (k) => Deno.env.get(k)): Promise<Tier> {
  const listed = new Set(String(env("PREMIUM_GUILDS") || "").split(/[\s,]+/).filter(Boolean));
  if (listed.has(guildId)) return "unlimited";
  const [{ data: subs }, { data: manual }] = await Promise.all([
    db.from("billing_subscriptions").select("tier,status,active,current_period_end").eq("guild_id", guildId).eq("active", true),
    db.from("premium_servers").select("enabled,expires_at,tier").eq("guild_id", guildId).maybeSingle(),
  ]);
  return activeTier(subs ?? [], manual ?? null);
}

export type Usage = { tier: Tier; plan: Plan; used: number; monthly: number; left: number; pack_balance: number; welcome_pending: number };

/** What a server has left this month (allowance plus packs), without spending anything. */
export async function usageOf(db: Db, guildId: string, config = billingConfig()): Promise<Usage> {
  const tier = await tierOf(db, guildId);
  const plan = config.plans[tier] ?? DEFAULT_PLANS.free;
  const month = new Date();
  month.setUTCDate(1);
  month.setUTCHours(0, 0, 0, 0);
  const [{ data: rows }, { data: credits }] = await Promise.all([
    db.from("image_ledger").select("credits").eq("guild_id", guildId).eq("source", "allowance").neq("status", "refunded").gte("created_at", month.toISOString()),
    db.from("image_credits").select("pack_balance,welcome_granted").eq("guild_id", guildId).maybeSingle(),
  ]);
  const used = (rows ?? []).reduce((s: number, r: { credits: number }) => s + r.credits, 0);
  // A server that has never rendered gets its welcome images on the first one
  const welcome = credits?.welcome_granted ? 0 : config.plans.free?.welcome ?? 0;
  const pack = (credits?.pack_balance ?? 0) + welcome;
  return { tier, plan, used, monthly: plan.monthly, left: Math.max(0, plan.monthly - used) + pack, pack_balance: pack, welcome_pending: welcome };
}

export type Reservation = { ok: true; id: string; source: string; left: number } | { ok: false; left: 0; message: string };

export async function reserveImages(db: Db, b: { guild_id: string; discord_user_id?: string | null; kind: string; credits: number }, config = billingConfig(), site = siteUrl()): Promise<Reservation> {
  const tier = await tierOf(db, b.guild_id);
  const plan = config.plans[tier] ?? DEFAULT_PLANS.free;
  const { data, error } = await db.rpc("reserve_ai_image", {
    p_guild: b.guild_id, p_user: b.discord_user_id ?? null, p_kind: b.kind, p_credits: b.credits,
    p_monthly: plan.monthly, p_welcome: config.plans.free?.welcome ?? 0, p_daily: plan.daily_after ?? 0, p_pass: 0,
  });
  if (error) throw new Error(`image allowance check failed: ${error.message}`);
  const left = Math.max(0, (data.monthly ?? 0) - (data.used ?? 0)) + (data.pack_balance ?? 0);
  if (data.ok) return { ok: true, id: data.id, source: data.source, left };
  const need = b.credits > 1 ? `${b.credits} AI images` : "an AI image";
  return { ok: false, left: 0, message: `This server is out of AI images (this needs ${need}). Get more at ${site}/billing?guild=${b.guild_id}` };
}

export async function refundImages(db: Db, id: string) {
  const { error } = await db.rpc("refund_ai_image", { p_id: id });
  if (error) console.warn(`[billing] refund failed for ${id}: ${error.message}`);
}

export async function settleImages(db: Db, id: string) {
  const { error } = await db.from("image_ledger").update({ status: "done" }).eq("id", id).eq("status", "reserved");
  if (error) console.warn(`[billing] settle failed for ${id}: ${error.message}`);
}

export function siteUrl() {
  return (Deno.env.get("PUBLIC_SITE_URL") || "https://gafferbot.app").replace(/\/$/, "");
}
