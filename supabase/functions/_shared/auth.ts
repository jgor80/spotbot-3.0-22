// Request authentication shared by edge functions that both the Discord bot and the web app call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type Caller =
  | { kind: "bot" }
  | { kind: "user"; userId: string };

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// The bot sends x-bot-secret (BOT_PROXY_SECRET) or the service-role key as its bearer token;
// the web app sends the signed-in user's JWT.
export async function identifyCaller(req: Request, admin: AdminClient): Promise<Caller | null> {
  const botSecret = Deno.env.get("BOT_PROXY_SECRET") ?? "";
  const givenSecret = req.headers.get("x-bot-secret") ?? "";
  if (botSecret.length >= 24 && givenSecret && safeEqual(givenSecret, botSecret)) return { kind: "bot" };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRoleKey && safeEqual(token, serviceRoleKey)) return { kind: "bot" };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { kind: "user", userId: data.user.id };
}

export function createAdminClient(): AdminClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

const rejectHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
  "Content-Type": "application/json",
};

// For functions deployed with verify_jwt = false: returns a 401/403 response unless the caller is the bot
// (service-role key) or, when allowed, a signed-in web user. The public anon key alone is never enough.
export async function rejectUnlessCaller(
  req: Request,
  opts: { botOnly?: boolean } = {},
): Promise<Response | null> {
  const caller = await identifyCaller(req, createAdminClient());
  if (!caller) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: rejectHeaders });
  }
  if (opts.botOnly && caller.kind !== "bot") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: rejectHeaders });
  }
  return null;
}

// Who is acting, as a Discord user. The bot is trusted to name the member it acts for; a web user is always
// their own verified Discord link, whatever the request body claims. Returns a 401/403 response otherwise.
export async function resolveDiscordActor(
  req: Request,
  admin: AdminClient,
  claimedDiscordId: string | undefined | null,
): Promise<{ discordUserId: string | null } | Response> {
  const caller = await identifyCaller(req, admin);
  if (!caller) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: rejectHeaders });
  }
  if (caller.kind === "bot") return { discordUserId: claimedDiscordId || null };
  const { data: link } = await admin
    .from("user_discord_links")
    .select("discord_user_id")
    .eq("auth_user_id", caller.userId)
    .eq("verified", true)
    .maybeSingle();
  if (!link?.discord_user_id) {
    return new Response(
      JSON.stringify({ success: false, error: "Sign in with Discord to manage your server" }),
      { status: 403, headers: rejectHeaders },
    );
  }
  return { discordUserId: link.discord_user_id as string };
}

// Discord's own server owner / Administrator / Manage Server, matching the bot's permCheck.isServerAdmin.
// Needs the DISCORD_BOT_TOKEN secret; without it only GafferBot roles count.
function discordGet(path: string) {
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) return Promise.resolve(null);
  return fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${token}` } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

const snowflake = (id: string) => /^\d{17,20}$/.test(id);

// A server member's name as Discord shows it (server nickname, then display name, then username), or null.
export async function discordMemberName(guildId: string, discordUserId: string): Promise<string | null> {
  if (!snowflake(guildId) || !snowflake(discordUserId)) return null;
  const m = await discordGet(`/guilds/${guildId}/members/${discordUserId}`);
  return m ? m.nick || m.user?.global_name || m.user?.username || null : null;
}

export async function isDiscordServerAdmin(guildId: string, discordUserId: string): Promise<boolean> {
  if (!snowflake(guildId) || !snowflake(discordUserId)) return false;
  const get = discordGet;
  const [guild, member] = await Promise.all([get(`/guilds/${guildId}`), get(`/guilds/${guildId}/members/${discordUserId}`)]);
  if (!guild || !member) return false;
  if (guild.owner_id === discordUserId) return true;
  const memberRoles = new Set<string>([guildId, ...(member.roles || [])]);
  let perms = 0n;
  for (const role of guild.roles || []) {
    if (memberRoles.has(role.id)) perms |= BigInt(role.permissions || "0");
  }
  return (perms & 0x8n) !== 0n || (perms & 0x20n) !== 0n;
}

// The bot's own leader rule (isManager in public/spotbot/index.cjs, isBotOwner in perm-check.cjs): bot owners,
// server admins, and anyone holding a Discord role whose name contains one of these words. Keep both in step,
// so the web and AI apps treat a player exactly as GafferBot does in Discord.
const LEADER_ROLE_WORDS = ["captain", "manager", "owner", "media", "admin"];
const BUILTIN_OWNER_IDS = ["501557839932948490"];

export function isBotOwner(discordUserId: string): boolean {
  const env = String(Deno.env.get("BOT_OWNER_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...BUILTIN_OWNER_IDS, ...env].includes(discordUserId);
}

export async function isDiscordClubLeader(guildId: string, discordUserId: string): Promise<boolean> {
  if (!snowflake(guildId) || !snowflake(discordUserId)) return false;
  if (isBotOwner(discordUserId)) return true;
  const [guild, member] = await Promise.all([discordGet(`/guilds/${guildId}`), discordGet(`/guilds/${guildId}/members/${discordUserId}`)]);
  if (!guild || !member) return false;
  if (guild.owner_id === discordUserId) return true;
  const memberRoles = new Set<string>([guildId, ...(member.roles || [])]);
  let perms = 0n;
  for (const role of guild.roles || []) {
    if (!memberRoles.has(role.id)) continue;
    perms |= BigInt(role.permissions || "0");
    const name = String(role.name || "").toLowerCase();
    if (role.id !== guildId && LEADER_ROLE_WORDS.some((w) => name.includes(w))) return true;
  }
  return (perms & 0x8n) !== 0n || (perms & 0x20n) !== 0n;
}

// GafferBot role check (has_any_role) that also lets Discord server admins through.
export async function hasGuildRole(
  admin: AdminClient,
  args: { _guild_id: string; _discord_user_id: string | null; _roles: string[] },
): Promise<{ data: boolean }> {
  if (!args._discord_user_id) return { data: false };
  const { data } = await admin.rpc("has_any_role", args);
  if (data) return { data: true };
  return { data: await isDiscordServerAdmin(args._guild_id, args._discord_user_id) };
}

// Per-server authorization for web users. The bot always passes; GafferBot web admins pass;
// otherwise the user's verified Discord account must be a member of the server ("member") or
// hold a GafferBot leader role / Discord admin rights there ("leader"). Returns a response to send back, or null.
export async function requireGuildAccess(
  req: Request,
  admin: AdminClient,
  guildId: string | null | undefined,
  level: "member" | "leader",
): Promise<Response | null> {
  const caller = await identifyCaller(req, admin);
  if (!caller) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: rejectHeaders });
  }
  if (caller.kind === "bot") return null;
  const forbidden = new Response(
    JSON.stringify({ success: false, error: "You don't have access to this server" }),
    { status: 403, headers: rejectHeaders },
  );
  if (!guildId || !snowflake(guildId)) return forbidden;

  const { data: webAdmin } = await admin.from("web_admins").select("id").eq("auth_user_id", caller.userId).maybeSingle();
  if (webAdmin) return null;

  const { data: link } = await admin
    .from("user_discord_links")
    .select("discord_user_id")
    .eq("auth_user_id", caller.userId)
    .eq("verified", true)
    .maybeSingle();
  const discordUserId = link?.discord_user_id as string | undefined;
  if (!discordUserId) return forbidden;

  const access = await guildAccessLevel(admin, guildId, discordUserId);
  if (access === "leader" || (access === "member" && level === "member")) return null;
  return forbidden;
}

// What a Discord user may see in a server: "leader" (a GafferBot leader role, or a leader in Discord by the
// bot's own rule: owner, admin rights or a captain/manager/admin-named role), "member" (recorded matches
// there, or a current Discord member), or null.
export async function guildAccessLevel(
  admin: AdminClient,
  guildId: string,
  discordUserId: string,
): Promise<"leader" | "member" | null> {
  if (!snowflake(guildId) || !snowflake(discordUserId)) return null;
  const { data: leader } = await admin.rpc("has_any_role", {
    _guild_id: guildId,
    _discord_user_id: discordUserId,
    _roles: ["admin", "moderator", "manager", "captain"],
  });
  if (leader || (await isDiscordClubLeader(guildId, discordUserId))) return "leader";

  // A player with recorded matches in this server, or a current Discord member, counts as a member.
  const { data: played } = await admin
    .from("player_stats")
    .select("id")
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordUserId)
    .limit(1)
    .maybeSingle();
  if (played) return "member";
  const member = await discordGet(`/guilds/${guildId}/members/${discordUserId}`);
  return member ? "member" : null;
}

// Per-user throttle for web callers of expensive functions (AI calls, EA lookups). The bot is never throttled.
// Kept in memory: every function runs inside the one bot process, so a restart only resets the counters.
const webHits = new Map<string, number[]>();

export async function throttleWebUser(
  req: Request,
  admin: AdminClient,
  name: string,
  max: number,
  windowMs: number,
): Promise<Response | null> {
  const caller = await identifyCaller(req, admin);
  if (!caller || caller.kind === "bot") return null;
  const key = `${name}:${caller.userId}`;
  const now = Date.now();
  const recent = (webHits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    return new Response(
      JSON.stringify({ success: false, error: "Too many requests, please try again in a few minutes" }),
      { status: 429, headers: rejectHeaders },
    );
  }
  recent.push(now);
  webHits.set(key, recent);
  if (webHits.size > 5000) {
    for (const [k, times] of webHits) if (!times.some((t) => now - t < windowMs)) webHits.delete(k);
  }
  return null;
}
