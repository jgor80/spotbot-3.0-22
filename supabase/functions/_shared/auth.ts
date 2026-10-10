// Request authentication shared by edge functions that both the Discord bot and the web app call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type Caller =
  | { kind: "bot" }
  | { kind: "user"; userId: string };

// The bot sends the service-role key as its bearer token; the web app sends the signed-in user's JWT.
export async function identifyCaller(req: Request, admin: AdminClient): Promise<Caller | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRoleKey && token === serviceRoleKey) return { kind: "bot" };

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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const LEADER_ROLES = ["admin", "moderator", "manager", "captain"];

// Resolves a signed-in web user to their linked Discord id, if any.
export async function linkedDiscordId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("user_discord_links")
    .select("discord_user_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return data?.discord_user_id ?? null;
}

export type GuildAccess = { member: boolean; leader: boolean; discordId: string | null };

// Proves the caller actually belongs to (or manages) the requested Discord server,
// not just that they are signed in. The bot and web admins pass every check.
export async function guildAccess(admin: AdminClient, caller: Caller, guildId: string): Promise<GuildAccess> {
  if (caller.kind === "bot") return { member: true, leader: true, discordId: null };

  const { data: webAdmin } = await admin
    .from("web_admins")
    .select("auth_user_id")
    .eq("auth_user_id", caller.userId)
    .maybeSingle();
  if (webAdmin) return { member: true, leader: true, discordId: null };

  const discordId = await linkedDiscordId(admin, caller.userId);
  if (!discordId) return { member: false, leader: false, discordId: null };

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordId)
    .in("role", LEADER_ROLES)
    .limit(1)
    .maybeSingle();
  if (roleRow) return { member: true, leader: true, discordId };

  // A player with recorded matches in this guild counts as a member.
  const { data: played } = await admin
    .from("player_stats")
    .select("id")
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordId)
    .limit(1)
    .maybeSingle();
  return { member: !!played, leader: false, discordId };
}

// Like rejectUnlessCaller, but also requires guild membership (or leadership with opts.leader).
export async function rejectUnlessGuildAccess(
  req: Request,
  guildId: string,
  opts: { leader?: boolean } = {},
): Promise<Response | null> {
  const admin = createAdminClient();
  const caller = await identifyCaller(req, admin);
  if (!caller) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: rejectHeaders });
  }
  const access = await guildAccess(admin, caller, guildId);
  if (!access.member || (opts.leader && !access.leader)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: rejectHeaders });
  }
  return null;
}
