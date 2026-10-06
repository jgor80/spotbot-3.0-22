// Announce a saved lineup (team sheet) in a Discord channel and notify the players in it.
//
// POST { action: "channels", guild_id }
//   -> { channels: [{ id, name, parent }], default_channel_id }
// POST { action: "voice", guild_id, user_ids }
//   -> { channels: [{ id, name, user_ids }] }  who is in which voice channel right now,
//      plus { id: "checkins" } for players who answered In or Late to tonight's roll call
// POST { action: "announce", lineup_id, channel_id, mention_players?, dm_players?, message?, image_base64? }
//   -> { success, message_id, channel_id, dm_sent, dm_failed }
//
// Callers: a signed-in web app user (JWT) or the Discord bot (service role key).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, identifyCaller, type Caller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const UUID_REGEX = /^[0-9a-f-]{36}$/i;
// Text and announcement channels
const POSTABLE_CHANNEL_TYPES = new Set([0, 5]);
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

// Group positions into pitch lines for the team sheet embed
const POSITION_LINES: { label: string; positions: string[] }[] = [
  { label: "🧤 Goalkeeper", positions: ["GK"] },
  { label: "🛡️ Defence", positions: ["LWB", "LB", "CB", "LCB", "RCB", "RB", "RWB", "SW"] },
  { label: "⚙️ Midfield", positions: ["CDM", "LDM", "RDM", "LM", "CM", "LCM", "RCM", "RM", "CAM", "LAM", "RAM"] },
  { label: "⚡ Attack", positions: ["LW", "LF", "CF", "RF", "RW", "ST", "LS", "RS"] },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function discord(path: string, init: RequestInit = {}) {
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bot ${token}`);
  return await fetch(`${DISCORD_API}${path}`, { ...init, headers });
}

function lineFor(position: string): number {
  const idx = POSITION_LINES.findIndex((l) => l.positions.includes(position.toUpperCase()));
  return idx === -1 ? POSITION_LINES.length - 1 : idx;
}

function playerLabel(discordUserId: string, name: string | null | undefined): string {
  if (DISCORD_ID_REGEX.test(discordUserId)) return `<@${discordUserId}>`;
  return name || discordUserId.replace(/^ea_/, "");
}

async function listChannels(supabase: any, guildId: string) {
  const res = await discord(`/guilds/${guildId}/channels`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[announce-lineup] channel list failed ${res.status}: ${text}`);
    return json({ error: "Could not load Discord channels. Is the bot in this server?" }, 502);
  }
  const all = await res.json() as any[];
  const categories = new Map(all.filter((c) => c.type === 4).map((c) => [c.id, c.name]));
  const channels = all
    .filter((c) => POSTABLE_CHANNEL_TYPES.has(c.type))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({ id: c.id, name: c.name, parent: categories.get(c.parent_id) || null }));

  // Default to the channel this server last announced a lineup in
  const { data: last } = await supabase
    .from("lineups")
    .select("channel_id")
    .eq("guild_id", guildId)
    .not("channel_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({ channels, default_channel_id: last?.channel_id || null });
}

// Discord's REST API only answers voice state per user, so look each candidate up
async function voiceChannels(supabase: any, guildId: string, userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter((id) => DISCORD_ID_REGEX.test(id)))).slice(0, 60);
  const byChannel = new Map<string, string[]>();
  const queue = [...ids];
  const worker = async () => {
    while (queue.length) {
      const userId = queue.shift()!;
      const res = await discord(`/guilds/${guildId}/voice-states/${userId}`);
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after") || "1");
        await new Promise((r) => setTimeout(r, Math.min(retry, 5) * 1000));
        queue.push(userId);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        continue; // 404: not in voice
      }
      const state = await res.json();
      if (!state.channel_id) continue;
      if (!byChannel.has(state.channel_id)) byChannel.set(state.channel_id, []);
      byChannel.get(state.channel_id)!.push(userId);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  let names = new Map<string, string>();
  if (byChannel.size) {
    const res = await discord(`/guilds/${guildId}/channels`);
    if (res.ok) names = new Map((await res.json() as any[]).map((c) => [c.id, c.name]));
  }
  const channels = Array.from(byChannel.entries())
    .map(([id, members]) => ({ id, name: names.get(id) || "Voice", user_ids: members }))
    .sort((a, b) => b.user_ids.length - a.user_ids.length);

  const checkins = await rollCallCheckins(supabase, guildId);
  if (checkins.length) channels.push({ id: "checkins", name: "Tonight's roll call (In and Late)", user_ids: checkins });
  return json({ channels });
}

// Players who said In or Late to a roll call started in the last 12 hours
async function rollCallCheckins(supabase: any, guildId: string): Promise<string[]> {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: event } = await supabase
    .from("availability_events")
    .select("id")
    .eq("guild_id", guildId)
    .eq("closed", false)
    .gte("scheduled_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!event) return [];
  const { data: responses } = await supabase
    .from("player_availability")
    .select("discord_user_id")
    .eq("event_id", event.id)
    .in("response", ["yes", "maybe"]);
  return (responses || []).map((r: any) => r.discord_user_id);
}

// Once a squad has a named captain or managers, only they (or a web admin) can announce from the web
async function webCallerMayAnnounce(supabase: any, userId: string, teamId: string | null): Promise<boolean> {
  if (!teamId) return true;
  const { data: team } = await supabase
    .from("teams")
    .select("captain_discord_id, manager_discord_ids")
    .eq("id", teamId)
    .maybeSingle();
  const leaders = [team?.captain_discord_id, ...(team?.manager_discord_ids || [])].filter(Boolean);
  if (!leaders.length) return true;

  const { data: admin } = await supabase.from("web_admins").select("id").eq("auth_user_id", userId).maybeSingle();
  if (admin) return true;
  const { data: link } = await supabase
    .from("user_discord_links")
    .select("discord_user_id")
    .eq("auth_user_id", userId)
    .eq("verified", true)
    .maybeSingle();
  return !!link && leaders.includes(link.discord_user_id);
}

async function announce(supabase: any, body: any, caller: Caller) {
  const { lineup_id, channel_id } = body;
  const mentionPlayers = body.mention_players !== false;
  const dmPlayers = body.dm_players === true;
  const note = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";

  if (!lineup_id || !UUID_REGEX.test(lineup_id)) return json({ error: "lineup_id is required" }, 400);
  if (!channel_id || !DISCORD_ID_REGEX.test(channel_id)) return json({ error: "channel_id is required" }, 400);

  const { data: lineup, error: lineupError } = await supabase
    .from("lineups")
    .select("id, guild_id, team_id, name, formation, team_avg_rating, share_code")
    .eq("id", lineup_id)
    .maybeSingle();
  if (lineupError || !lineup) return json({ error: "Lineup not found" }, 404);
  if (caller.kind === "user" && !(await webCallerMayAnnounce(supabase, caller.userId, lineup.team_id))) {
    return json({ error: "Only this squad's captain or managers can announce its lineup" }, 403);
  }

  // Only post into a channel that belongs to the lineup's server
  const channelRes = await discord(`/channels/${channel_id}`);
  if (!channelRes.ok) return json({ error: "The bot can't see that channel" }, 400);
  const channel = await channelRes.json();
  if (channel.guild_id !== lineup.guild_id) return json({ error: "That channel is in a different server" }, 400);

  const { data: slots } = await supabase
    .from("lineup_slots")
    .select("discord_user_id, position, slot_index, is_substitute")
    .eq("lineup_id", lineup_id)
    .order("slot_index");

  const playerIds = (slots || []).map((s: any) => s.discord_user_id);
  const { data: players } = playerIds.length
    ? await supabase
      .from("player_summary")
      .select("discord_user_id, discord_username")
      .eq("guild_id", lineup.guild_id)
      .in("discord_user_id", playerIds)
    : { data: [] };
  const nameById = new Map<string, string | null>(
    (players || []).map((p: any) => [p.discord_user_id, p.discord_username]),
  );

  let teamName: string | null = null;
  if (lineup.team_id) {
    const { data: team } = await supabase.from("teams").select("name").eq("id", lineup.team_id).maybeSingle();
    teamName = team?.name || null;
  }

  const starters = (slots || []).filter((s: any) => !s.is_substitute);
  const subs = (slots || []).filter((s: any) => s.is_substitute);

  const fields = POSITION_LINES.map((line, idx) => {
    const inLine = starters.filter((s: any) => lineFor(s.position) === idx);
    return {
      name: line.label,
      value: inLine.map((s: any) => `**${s.position}** ${playerLabel(s.discord_user_id, nameById.get(s.discord_user_id))}`)
        .join("\n"),
      inline: false,
    };
  }).filter((f) => f.value);
  if (subs.length) {
    fields.push({
      name: "🔁 Substitutes",
      value: subs.map((s: any) => playerLabel(s.discord_user_id, nameById.get(s.discord_user_id))).join(", "),
      inline: false,
    });
  }

  const title = lineup.name || `${teamName || "Club"} Starting XI`;
  const embed: Record<string, unknown> = {
    title: `📋 ${title}`,
    description: [
      `**Formation:** ${lineup.formation}`,
      lineup.team_avg_rating ? `**Avg rating:** ${Number(lineup.team_avg_rating).toFixed(1)}` : null,
      note || null,
    ].filter(Boolean).join("\n"),
    color: 0x22c55e,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: "Team sheet from SquadIQ" },
  };

  const discordStarterIds = starters.map((s: any) => s.discord_user_id).filter((id: string) => DISCORD_ID_REGEX.test(id));
  const payload: Record<string, unknown> = {
    content: mentionPlayers && discordStarterIds.length
      ? `You're in the starting XI: ${discordStarterIds.map((id: string) => `<@${id}>`).join(" ")}`
      : undefined,
    embeds: [embed],
    allowed_mentions: { parse: [], users: mentionPlayers ? discordStarterIds.slice(0, 100) : [] },
  };

  let postRes: Response;
  const imageBytes = decodeImage(body.image_base64);
  if (imageBytes) {
    embed.image = { url: "attachment://lineup.png" };
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", new Blob([imageBytes as BlobPart], { type: "image/png" }), "lineup.png");
    postRes = await discord(`/channels/${channel_id}/messages`, { method: "POST", body: form });
  } else {
    postRes = await discord(`/channels/${channel_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  if (!postRes.ok) {
    const text = await postRes.text();
    console.error(`[announce-lineup] post failed ${postRes.status}: ${text}`);
    return json({ error: "Discord rejected the post. Check the bot can send messages in that channel." }, 502);
  }
  const message = await postRes.json();

  await supabase
    .from("lineups")
    .update({ channel_id, message_id: message.id, updated_at: new Date().toISOString() })
    .eq("id", lineup_id);

  // Optional DM to each starter with their position and a link to the post
  let dmSent = 0;
  let dmFailed = 0;
  if (dmPlayers) {
    const link = `https://discord.com/channels/${lineup.guild_id}/${channel_id}/${message.id}`;
    for (const s of starters) {
      if (!DISCORD_ID_REGEX.test(s.discord_user_id)) continue;
      try {
        const dmChannel = await discord(`/users/@me/channels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient_id: s.discord_user_id }),
        });
        if (!dmChannel.ok) throw new Error(String(dmChannel.status));
        const { id: dmId } = await dmChannel.json();
        const dm = await discord(`/channels/${dmId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `📋 You're starting at **${s.position}** for **${teamName || title}** (${lineup.formation}).\n${link}`,
          }),
        });
        if (!dm.ok) throw new Error(String(dm.status));
        dmSent++;
      } catch (err) {
        // Players with DMs closed are expected; keep going
        console.log(`[announce-lineup] DM to ${s.discord_user_id} failed: ${(err as Error).message}`);
        dmFailed++;
      }
    }
  }

  return json({ success: true, message_id: message.id, channel_id, dm_sent: dmSent, dm_failed: dmFailed });
}

function decodeImage(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !value) return null;
  const b64 = value.replace(/^data:image\/png;base64,/, "");
  try {
    const bin = atob(b64);
    if (bin.length > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();
    const caller = await identifyCaller(req, supabase);
    if (!caller) return json({ error: "Sign in to announce lineups" }, 401);

    const body = await req.json();
    if (body.action === "channels") {
      if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) return json({ error: "guild_id is required" }, 400);
      return await listChannels(supabase, body.guild_id);
    }
    if (body.action === "voice") {
      if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) return json({ error: "guild_id is required" }, 400);
      if (!Array.isArray(body.user_ids)) return json({ error: "user_ids is required" }, 400);
      return await voiceChannels(supabase, body.guild_id, body.user_ids);
    }
    if (body.action === "announce") {
      return await announce(supabase, body, caller);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[announce-lineup] Error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
