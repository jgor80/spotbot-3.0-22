// XI Lab (FUT) tools for AI apps: read-only advice on the player's own Ultimate Team cards and squads.
// They call the same services as the website's fut-api (../_shared/fut/service.ts), so chemistry here always
// matches gafferbot.app/fut. Listed only while FUT_ENABLED=true. Nothing here touches an EA account or the
// transfer market, and nothing writes: saving squads stays on the website for now.
// Names all say "fut" because GafferBot's Pro Clubs tools already use "chemistry" and "player cards".
import { Tool, ToolError } from "./protocol.ts";
import {
  compareCards, currentSquad, futDb, FutError, getCard, getSquad, isUuid, listSquads, searchMyCards, squadChemistry, type FutDb,
} from "../_shared/fut/service.ts";

// The slice of the MCP context these tools need (kept local so this file has no remote imports).
export interface FutCtx {
  // deno-lint-ignore no-explicit-any
  db: any;
  discordUserId: string;
  /** Tests pass an in-memory fut schema; production uses the service-role client's `fut` schema. */
  futDb?: FutDb;
}

const SIGN_IN = "XI Lab uses your GafferBot website account. Sign in once at https://gafferbot.app/fut with Discord, then ask again.";

// XI Lab data is keyed by the website account (auth user id), found through the verified Discord link.
async function account(ctx: FutCtx): Promise<{ db: FutDb; userId: string }> {
  const { data: link } = await ctx.db.from("user_discord_links").select("auth_user_id")
    .eq("discord_user_id", ctx.discordUserId).eq("verified", true).maybeSingle();
  if (!link?.auth_user_id) throw new ToolError(SIGN_IN);
  return { db: ctx.futDb ?? futDb(ctx.db), userId: link.auth_user_id as string };
}

// FutError carries a message meant for the user; anything else is a real failure.
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FutError) throw new ToolError(e.message);
    throw e;
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const LABELS = "Every card carries an evidence label (game_data = copied from the game screen, estimate, hypothesis); say which numbers are the player's own entries.";

export const FUT_TOOLS: Tool<FutCtx>[] = [
  {
    name: "get_my_fut_squad",
    title: "My FUT squad (XI Lab)",
    description: "EA FC Ultimate Team: the player's saved XI Lab squad with each slot's card, lock and role. Leave squad_id out for their active squad; set list: true to list all saved squads. " + LABELS,
    inputSchema: {
      type: "object",
      properties: {
        squad_id: { type: "string", description: "A squad id from list: true. Optional." },
        list: { type: "boolean", description: "List every saved squad instead of returning one." },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      if (args.list === true) return { squads: await listSquads(db, userId) };
      const id = str(args.squad_id);
      if (id && !isUuid(id)) throw new ToolError("squad_id must be an id from get_my_fut_squad with list: true.");
      const squad = id ? await getSquad(db, userId, id) : await currentSquad(db, userId);
      if (!squad) throw new ToolError(id ? "Squad not found." : "No saved squads yet. The player builds one at https://gafferbot.app/fut.");
      return { squad };
    }),
  },
  {
    name: "get_my_fut_inventory",
    title: "My FUT cards (XI Lab)",
    description: "EA FC Ultimate Team: cards the player entered in XI Lab (their club and targets), strongest first. Filter by name/club/league/nation text, position code, minimum overall, or owned only. " + LABELS,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text in the name, club, league, nation or version." },
        position: { type: "string", description: "Position code, e.g. CB, CDM, ST." },
        min_overall: { type: "integer", minimum: 1, maximum: 99 },
        owned_only: { type: "boolean", description: "Only cards they own (leave out to include targets)." },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Default 25." },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : undefined);
      const cards = await searchMyCards(db, userId, {
        q: str(args.query)?.slice(0, 60), position: str(args.position), min_overall: n(args.min_overall),
        owned_only: args.owned_only === true, limit: n(args.limit),
      });
      return { count: cards.length, cards };
    }),
  },
  {
    name: "get_fut_card",
    title: "FUT card details (XI Lab)",
    description: "EA FC Ultimate Team: one card's details by card id (from get_my_fut_inventory or a squad). " + LABELS,
    inputSchema: {
      type: "object",
      properties: { card_id: { type: "string", description: "Card id." } },
      required: ["card_id"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const card = await getCard(db, userId, String(args.card_id ?? ""));
      if (!card) throw new ToolError("Card not found among the player's cards.");
      return { card };
    }),
  },
  {
    name: "compare_fut_cards",
    title: "Compare FUT cards (XI Lab)",
    description: "EA FC Ultimate Team: side-by-side numbers for 2 to 4 of the player's cards: who leads each stat, shared positions, shared club/league/nation. It compares numbers only; don't present it as who plays better. Missing stats are left out, never guessed.",
    inputSchema: {
      type: "object",
      properties: { card_ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } },
      required: ["card_ids"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await compareCards(db, userId, args.card_ids);
    }),
  },
  {
    name: "calculate_fut_chemistry",
    title: "FUT squad chemistry (XI Lab)",
    description: "EA FC Ultimate Team: chemistry for the player's saved squad from XI Lab's tested chemistry engine (never estimate it yourself): each player's 0-3, the club/league/nation links behind it and what the next point needs. " +
      "Optionally preview up to 4 simultaneous swaps (card_id null empties a slot): every starter is recalculated, so the diff shows who gains and who loses. Previews never change the saved squad. " +
      "Report the rule version and say plainly when the rules are unverified (community thresholds, not confirmed by EA).",
    inputSchema: {
      type: "object",
      properties: {
        squad_id: { type: "string", description: "Leave out for the active squad." },
        swaps: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            properties: { slot: { type: "string", description: "Slot name from the squad, e.g. LCB." }, card_id: { type: ["string", "null"] } },
            required: ["slot", "card_id"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await squadChemistry(db, userId, { squad_id: str(args.squad_id), swaps: args.swaps });
    }),
  },
];
