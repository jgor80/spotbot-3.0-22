// Automatic lineups for AI apps: GafferBot picks an event's XI from who answered Available (then
// Maybe), each player's position tiers (comp, plays well, emergency), ratings and best pairings, with
// the same picker as Autopilot and the web Lineup Builder. The work runs inside the bot
// (public/spotbot/lineup-ai.cjs). Suggesting is open to any member and changes nothing; publishing
// posts the team sheet, needs a clubs:manage grant and a club leader, previews first and counts
// against the hourly change limit.
import { Tool, ToolError } from "./protocol.ts";
import { Ctx, PanelBridge } from "./tools.ts";
import { logChange, underLimit } from "./manage.ts";
import { SCOPE_MANAGE } from "../_shared/mcp-tokens.ts";

// deno-lint-ignore no-explicit-any
type Json = any;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const confirmed = (args: Record<string, unknown>) => args.confirm === true || args.confirm === "true";

function bridge(ctx: Ctx): PanelBridge {
  if (!ctx.lineups) throw new ToolError("Lineup tools only work on the GafferBot server, which isn't reachable from here.");
  return ctx.lineups;
}

async function call(ctx: Ctx, op: string, args: Record<string, unknown>): Promise<Json> {
  try {
    return await bridge(ctx).handle(op, { ...args, userId: ctx.discordUserId });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status) throw new ToolError(String(e.message || "GafferBot refused that."));
    throw err;
  }
}

// The event's server, once the caller is confirmed to be in it
async function eventGuild(args: Record<string, unknown>, ctx: Ctx): Promise<{ eventId: string; guildId: string }> {
  const eventId = str(args.event_id);
  if (!eventId || !UUID.test(eventId)) throw new ToolError("event_id must be an event ID from list_events.");
  const { data: event } = await ctx.db.from("availability_events").select("guild_id").eq("id", eventId).maybeSingle();
  if (!event || !(await ctx.access(event.guild_id))) throw new ToolError("Event not found.");
  return { eventId, guildId: event.guild_id };
}

function changesArg(args: Record<string, unknown>) {
  if (args.changes === undefined) return undefined;
  if (!Array.isArray(args.changes)) throw new ToolError("changes must be a list of { slot, player_id }.");
  return args.changes.slice(0, 20).map((c: Json) => ({ slot: c?.slot, player_id: c?.player_id }));
}

const eventProp = { type: "string", description: "Event ID from list_events." };
const formationProp = { type: "string", description: "Formation name, e.g. \"4-3-3 FLAT\". Leave out to use the club's best recent formation." };
const changesProp = {
  type: "array",
  description: "Optional moves on top of the automatic pick: put player_id in slot (the slot number from suggest_lineup). Whoever was there goes to the bench.",
  items: {
    type: "object",
    properties: { slot: { type: "integer" }, player_id: { type: "string", description: "Discord user ID from suggest_lineup." } },
    required: ["slot", "player_id"],
    additionalProperties: false,
  },
};

export const LINEUP_TOOLS: Tool<Ctx>[] = [
  {
    name: "suggest_lineup",
    title: "Suggest a lineup",
    description: "Builds the best starting XI and bench for an event from the players who said Available (Maybes only fill gaps), " +
      "using each player's comp, plays-well and emergency positions, ratings and the club's best pairings. Shows how each starter " +
      "fits their spot and any open spots. Changes nothing. Pass changes to try a swap.",
    inputSchema: {
      type: "object",
      properties: { event_id: eventProp, formation: formationProp, changes: changesProp },
      required: ["event_id"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const { eventId, guildId } = await eventGuild(args, ctx);
      const s = await call(ctx, "suggest", { guildId, eventId, formation: str(args.formation), changes: changesArg(args) });
      return { ...s, next: "Show this to the player. A club leader can post it with publish_lineup (same arguments)." };
    },
  },
  {
    name: "publish_lineup",
    audience: "leader",
    title: "Post a lineup",
    scope: SCOPE_MANAGE,
    readOnly: false,
    description: "Posts the automatic lineup (same picks as suggest_lineup, plus any changes) as the event's team sheet in its " +
      "Discord channel, mentioning the starters. Replaces a team sheet already saved for that event. Club leaders only. " +
      "Without confirm it only previews.",
    inputSchema: {
      type: "object",
      properties: {
        event_id: eventProp,
        formation: formationProp,
        changes: changesProp,
        confirm: { type: "boolean", description: "Leave out to preview. true only after the player said yes to the preview." },
      },
      required: ["event_id"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const { eventId, guildId } = await eventGuild(args, ctx);
      const req = { guildId, eventId, formation: str(args.formation), changes: changesArg(args) };
      if (!confirmed(args)) {
        const p = await call(ctx, "publish", req);
        return {
          preview: true,
          nothing_changed_yet: true,
          will: `Post this ${p.formation} team sheet in the event's channel and mention the starting XI` +
            (p.replaces_existing_team_sheet ? ", replacing the team sheet already saved for this event." : "."),
          ...p,
          next: "Show this to the player. Only if they say yes, call publish_lineup again with the same arguments plus confirm: true.",
        };
      }
      await underLimit(ctx);
      try {
        const r = await call(ctx, "publish", { ...req, confirm: true });
        await logChange(ctx, guildId, "publish_lineup", `event ${eventId}`, { event_id: eventId, formation: r.formation, changes: req.changes?.length || 0 }, { ok: true });
        return r;
      } catch (err) {
        await logChange(ctx, guildId, "publish_lineup", `event ${eventId}`, { event_id: eventId }, { ok: false, error: (err as Error).message });
        throw err;
      }
    },
  },
];
