// The GafferBot MCP tools. Each one acts as the token's Discord user and checks that user's access to the
// server before reading anything from it, the same member rule the web app uses (guildAccessLevel).
import { Tool, ToolError } from "./protocol.ts";

export interface Ctx {
  // deno-lint-ignore no-explicit-any
  db: any;
  discordUserId: string;
  access: (guildId: string) => Promise<"leader" | "member" | null>;
}

const SNOWFLAKE = /^\d{17,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Servers checked one by one when the player has no recorded link to them; above this, only linked servers are listed.
const PROBE_ALL_LIMIT = 50;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

const guildIdProp = { type: "string", description: "Discord server ID from list_servers. Optional when you are in only one server." };
const clubKeyProp = { type: "string", description: "Club key from list_servers (e.g. club1) for servers that run more than one club." };
const playerProp = { type: "string", description: 'A Discord username (partial match) or "me".' };

// ---------- Access ----------

async function accessibleServers(ctx: Ctx) {
  const [{ data: settings }, { data: played }, { data: roles }] = await Promise.all([
    ctx.db.from("guild_settings").select("guild_id, name, clubs").limit(500),
    ctx.db.from("player_summary").select("guild_id").eq("discord_user_id", ctx.discordUserId).limit(200),
    ctx.db.from("user_roles").select("guild_id").eq("discord_user_id", ctx.discordUserId).limit(200),
  ]);
  const all = (settings || []) as { guild_id: string; name: string | null; clubs: unknown }[];
  const linked = new Set([...(played || []), ...(roles || [])].map((r: { guild_id: string }) => r.guild_id));
  const candidates = all.length <= PROBE_ALL_LIMIT ? all : all.filter((g) => linked.has(g.guild_id));
  const checked = await Promise.all(candidates.map(async (g) => ({ g, level: await ctx.access(g.guild_id) })));
  return checked.filter((c) => c.level).map(({ g, level }) => ({
    guild_id: g.guild_id,
    name: g.name,
    your_access: level,
    clubs: (Array.isArray(g.clubs) ? g.clubs : [])
      .filter((c: { enabled?: boolean }) => c && c.enabled !== false)
      .map((c: { key: string; name: string; ea_club_id?: string }) => ({ club_key: c.key, name: c.name, ea_linked: !!c.ea_club_id })),
  }));
}

async function resolveGuild(args: Record<string, unknown>, ctx: Ctx): Promise<string> {
  const guildId = str(args.guild_id);
  if (guildId) {
    if (!SNOWFLAKE.test(guildId)) throw new ToolError("guild_id must be a Discord server ID. Call list_servers to find it.");
    if (!(await ctx.access(guildId))) throw new ToolError("You don't have access to that server.");
    return guildId;
  }
  const servers = await accessibleServers(ctx);
  if (servers.length === 1) return servers[0].guild_id;
  if (!servers.length) throw new ToolError("You aren't in any GafferBot servers yet.");
  throw new ToolError(`You're in ${servers.length} servers; pass guild_id. Call list_servers to see them.`);
}

// ---------- Names ----------

async function namesFor(ctx: Ctx, guildId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data: players } = await ctx.db.from("player_summary").select("discord_user_id, discord_username")
    .eq("guild_id", guildId).in("discord_user_id", unique);
  for (const p of players || []) if (p.discord_username) names.set(p.discord_user_id, p.discord_username);
  const missing = unique.filter((id) => !names.has(id));
  if (missing.length) {
    const { data: profiles } = await ctx.db.from("profiles").select("discord_user_id, discord_username, display_name")
      .in("discord_user_id", missing);
    for (const p of profiles || []) names.set(p.discord_user_id, p.discord_username || p.display_name || p.discord_user_id);
  }
  return names;
}

async function resolvePlayer(ctx: Ctx, guildId: string, player: string): Promise<{ id: string; name: string }> {
  if (player.toLowerCase() === "me") {
    const names = await namesFor(ctx, guildId, [ctx.discordUserId]);
    return { id: ctx.discordUserId, name: names.get(ctx.discordUserId) || "you" };
  }
  const safe = player.replace(/[%_\\,()]/g, "").slice(0, 40);
  const { data } = await ctx.db.from("player_summary").select("discord_user_id, discord_username")
    .eq("guild_id", guildId).ilike("discord_username", `%${safe}%`).limit(5);
  const rows = data || [];
  const exact = rows.find((r: { discord_username: string }) => r.discord_username?.toLowerCase() === player.toLowerCase());
  if (exact || rows.length === 1) {
    const r = exact || rows[0];
    return { id: r.discord_user_id, name: r.discord_username };
  }
  if (!rows.length) throw new ToolError(`No player matching "${player}" in this server.`);
  throw new ToolError(`"${player}" matches ${rows.map((r: { discord_username: string }) => r.discord_username).join(", ")}. Be more specific.`);
}

// ---------- Tools ----------

// EA match categories as sync-ea-stats stores them.
const MATCH_TYPES: Record<string, string> = { league: "division", cup: "competition", friendly: "friendly" };
const PLAYER_SORTS = ["goals", "assists", "avg_match_rating", "games_played", "win_rate", "man_of_match", "clean_sheets", "form_rating", "overall_rating"];
const PLAYER_FIELDS = "discord_user_id, discord_username, primary_position, games_played, wins, draws, losses, win_rate, goals, assists, " +
  "second_assists, avg_match_rating, man_of_match, clean_sheets, saves, shots, tackles, interceptions, pass_attempts, passes_made, " +
  "form_rating, overall_rating, reliability_score, current_streak, streak_type, last_active_at";

export const TOOLS: Tool<Ctx>[] = [
  {
    name: "list_servers",
    title: "List my servers",
    description: "Discord servers running GafferBot that you belong to, with each server's clubs. Call this first to get guild_id and club_key values.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (_args, ctx) => ({ servers: await accessibleServers(ctx) }),
  },
  {
    name: "get_club_stats",
    title: "Club record",
    description: "Season record for a server's clubs from EA: wins/draws/losses, goals, division, skill rating, streaks and last results.",
    inputSchema: { type: "object", properties: { guild_id: guildIdProp, club_key: clubKeyProp }, additionalProperties: false },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      let q = ctx.db.from("club_stats").select(
        "club_key, club_name, ea_platform, wins, draws, losses, goals_scored, goals_conceded, total_clean_sheets, " +
          "overall_matches_played, league_games, cup_games, friendly_games, current_division, best_division, skill_rating, " +
          "reputation_tier, promotions, relegations, win_streak, unbeaten_streak, loss_streak, last_5_results, last_10_results, " +
          "total_members, last_synced_at",
      ).eq("guild_id", guildId);
      const clubKey = str(args.club_key);
      if (clubKey) q = q.eq("club_key", clubKey);
      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) throw new ToolError("No EA stats for this club yet. Link the club to EA with /setup in Discord.");
      return { clubs: data };
    },
  },
  {
    name: "get_recent_matches",
    title: "Recent matches",
    description: "Latest EA matches for a server's clubs with score, opponent, match type and each player's rating, goals and assists.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: guildIdProp,
        club_key: clubKeyProp,
        match_type: { type: "string", enum: ["league", "cup", "friendly"], description: "Only this kind of match." },
        limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      let q = ctx.db.from("club_matches")
        .select("ea_match_id, club_key, match_type, result, score_for, score_against, opponent_club_name, player_stats, created_at")
        .eq("guild_id", guildId).order("created_at", { ascending: false }).limit(clampInt(args.limit, 10, 1, 30));
      const clubKey = str(args.club_key);
      if (clubKey) q = q.eq("club_key", clubKey);
      const type = MATCH_TYPES[String(args.match_type)];
      if (type) q = q.eq("match_type", type);
      const { data, error } = await q;
      if (error) throw error;
      return {
        matches: (data || []).map((m: Record<string, unknown>) => ({
          ea_match_id: m.ea_match_id,
          club_key: m.club_key,
          recorded_at: m.created_at,
          match_type: Object.keys(MATCH_TYPES).find((k) => MATCH_TYPES[k] === m.match_type) || m.match_type,
          result: m.result,
          score: `${m.score_for ?? "?"}-${m.score_against ?? "?"}`,
          opponent: m.opponent_club_name,
          players: (Array.isArray(m.player_stats) ? m.player_stats : []).map((p: Record<string, unknown>) => ({
            player: p.ea_username, position: p.position, rating: p.rating, goals: p.goals, assists: p.assists, motm: !!p.motm,
          })),
        })),
      };
    },
  },
  {
    name: "get_players",
    title: "Player stats",
    description: "Player stats in a server: one player's full line (with streaks), or a leaderboard sorted by a stat.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: guildIdProp,
        player: playerProp,
        sort_by: { type: "string", enum: PLAYER_SORTS, default: "goals" },
        min_games: { type: "integer", minimum: 0, default: 1, description: "Leaderboard only: ignore players with fewer games." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 15 },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      const player = str(args.player);
      if (player) {
        const who = await resolvePlayer(ctx, guildId, player);
        const [{ data: stats }, { data: streaks }] = await Promise.all([
          ctx.db.from("player_summary").select(PLAYER_FIELDS).eq("guild_id", guildId).eq("discord_user_id", who.id).maybeSingle(),
          ctx.db.from("player_streaks").select(
            "current_win_streak, current_loss_streak, current_goal_streak, current_clean_sheet_streak, longest_win_streak, " +
              "longest_goal_streak, last_5_results, last_10_results, form_rating",
          ).eq("guild_id", guildId).eq("discord_user_id", who.id).maybeSingle(),
        ]);
        if (!stats) throw new ToolError(`${who.name} has no recorded stats in this server yet.`);
        return { player: stats, streaks: streaks || null };
      }
      const sortBy = PLAYER_SORTS.includes(String(args.sort_by)) ? String(args.sort_by) : "goals";
      const { data, error } = await ctx.db.from("player_summary").select(PLAYER_FIELDS).eq("guild_id", guildId)
        .gte("games_played", clampInt(args.min_games, 1, 0, 1000))
        .order(sortBy, { ascending: false, nullsFirst: false }).limit(clampInt(args.limit, 15, 1, 50));
      if (error) throw error;
      return { sorted_by: sortBy, players: data || [] };
    },
  },
  {
    name: "list_events",
    title: "Events",
    description: "Scheduled sessions and matches with how many players said yes, maybe or no, and your own answer. Upcoming by default.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: guildIdProp,
        when: { type: "string", enum: ["upcoming", "past"], default: "upcoming" },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      const past = args.when === "past";
      // An event stays "upcoming" until three hours after kick-off, while it is likely still being played.
      const cutoff = new Date(Date.now() - 3 * 3600_000).toISOString();
      let q = ctx.db.from("availability_events")
        .select("id, title, event_type, club_key, scheduled_at, deadline_at, duration_minutes, formation, description, closed, cancelled")
        .eq("guild_id", guildId).limit(clampInt(args.limit, 10, 1, 25));
      q = past ? q.lt("scheduled_at", cutoff).order("scheduled_at", { ascending: false })
        : q.gte("scheduled_at", cutoff).eq("cancelled", false).order("scheduled_at", { ascending: true });
      const { data: events, error } = await q;
      if (error) throw error;
      const ids = (events || []).map((e: { id: string }) => e.id);
      const { data: answers } = ids.length
        ? await ctx.db.from("player_availability").select("event_id, discord_user_id, response").in("event_id", ids)
        : { data: [] };
      return {
        events: (events || []).map((e: Record<string, unknown>) => {
          const mine = (answers || []).filter((a: { event_id: string }) => a.event_id === e.id);
          const count = (r: string) => mine.filter((a: { response: string }) => a.response === r).length;
          return {
            ...e,
            answers: { yes: count("yes"), maybe: count("maybe"), no: count("no") },
            your_answer: mine.find((a: { discord_user_id: string }) => a.discord_user_id === ctx.discordUserId)?.response || null,
          };
        }),
      };
    },
  },
  {
    name: "get_event",
    title: "Event availability",
    description: "One event's details and every player's answer (yes/maybe/no), with signed-up positions and notes.",
    inputSchema: {
      type: "object",
      properties: { event_id: { type: "string", description: "Event ID from list_events." } },
      required: ["event_id"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const eventId = str(args.event_id);
      if (!eventId || !UUID.test(eventId)) throw new ToolError("event_id must be an event ID from list_events.");
      const { data: event } = await ctx.db.from("availability_events")
        .select("id, guild_id, title, event_type, club_key, scheduled_at, deadline_at, duration_minutes, formation, description, closed, cancelled")
        .eq("id", eventId).maybeSingle();
      if (!event || !(await ctx.access(event.guild_id))) throw new ToolError("Event not found.");
      const { data: answers } = await ctx.db.from("player_availability")
        .select("discord_user_id, response, position, note, responded_at").eq("event_id", eventId);
      const names = await namesFor(ctx, event.guild_id, (answers || []).map((a: { discord_user_id: string }) => a.discord_user_id));
      const group = (r: string) => (answers || []).filter((a: { response: string }) => a.response === r).map((a: Record<string, unknown>) => ({
        player: names.get(a.discord_user_id as string) || a.discord_user_id,
        positions: a.position || undefined,
        note: a.note || undefined,
        answered_at: a.responded_at,
      }));
      return { event, yes: group("yes"), maybe: group("maybe"), no: group("no") };
    },
  },
  {
    name: "get_lineups",
    title: "Team sheets",
    description: "Recent team sheets (lineups) with formation, each slot's position and player, subs, and who confirmed or declined.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: guildIdProp,
        event_id: { type: "string", description: "Only the team sheet for this event." },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 3 },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      let q = ctx.db.from("lineups")
        .select("id, name, formation, event_id, team_avg_rating, win_probability, vibe_chemistry_score, created_at, updated_at, teams(name, tag), availability_events(title, scheduled_at)")
        .eq("guild_id", guildId).order("created_at", { ascending: false }).limit(clampInt(args.limit, 3, 1, 10));
      const eventId = str(args.event_id);
      if (eventId) {
        if (!UUID.test(eventId)) throw new ToolError("event_id must be an event ID from list_events.");
        q = q.eq("event_id", eventId);
      }
      const { data: lineups, error } = await q;
      if (error) throw error;
      const ids = (lineups || []).map((l: { id: string }) => l.id);
      const { data: slots } = ids.length
        ? await ctx.db.from("lineup_slots").select("lineup_id, slot_index, position, discord_user_id, is_substitute, confirmed_at, declined_at")
          .in("lineup_id", ids).order("slot_index")
        : { data: [] };
      const names = await namesFor(ctx, guildId, (slots || []).map((s: { discord_user_id: string }) => s.discord_user_id));
      return {
        lineups: (lineups || []).map((l: Record<string, unknown>) => ({
          ...l,
          slots: (slots || []).filter((s: { lineup_id: string }) => s.lineup_id === l.id).map((s: Record<string, unknown>) => ({
            position: s.position,
            player: s.discord_user_id ? names.get(s.discord_user_id as string) || s.discord_user_id : null,
            substitute: !!s.is_substitute,
            status: s.declined_at ? "declined" : s.confirmed_at ? "confirmed" : "pending",
          })),
        })),
      };
    },
  },
  {
    name: "get_chemistry",
    title: "Player chemistry",
    description: "Which players do best together: pairs with games together, record and synergy score. Optionally for one player.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: guildIdProp,
        player: playerProp,
        min_games: { type: "integer", minimum: 1, default: 3 },
        limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      let q = ctx.db.from("player_chemistry")
        .select("player_a_discord_id, player_b_discord_id, games_together, wins_together, draws_together, losses_together, win_rate, synergy_score, last_played_together")
        .eq("guild_id", guildId).gte("games_together", clampInt(args.min_games, 3, 1, 1000))
        .order("synergy_score", { ascending: false, nullsFirst: false }).limit(clampInt(args.limit, 10, 1, 30));
      const player = str(args.player);
      if (player) {
        const who = await resolvePlayer(ctx, guildId, player);
        q = q.or(`player_a_discord_id.eq.${who.id},player_b_discord_id.eq.${who.id}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      const names = await namesFor(ctx, guildId, rows.flatMap((r: Record<string, string>) => [r.player_a_discord_id, r.player_b_discord_id]));
      return {
        pairs: rows.map(({ player_a_discord_id: a, player_b_discord_id: b, ...rest }: Record<string, unknown>) => ({
          players: [names.get(a as string) || a, names.get(b as string) || b],
          ...rest,
        })),
      };
    },
  },
];
