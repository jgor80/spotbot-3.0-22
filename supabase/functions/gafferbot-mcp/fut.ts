// XI Lab (FUT) tools for AI apps: read-only advice on the player's own Ultimate Team cards and squads.
// They call the same services as the website's fut-api (../_shared/fut/service.ts), so chemistry here always
// matches gafferbot.app/fut. Listed only while FUT_ENABLED=true. Nothing here touches an EA account or the
// transfer market, and nothing saves: building and saving squads stays on the website for now (optimizer runs are logged).
// Names all say "fut" because GafferBot's Pro Clubs tools already use "chemistry" and "player cards".
import { Tool, ToolError } from "./protocol.ts";
import {
  compareCards, futDb, FutError, getCard, latestSquadId, logRun, runWorkspace, searchMyCards, toWorkspaceCard, workspaceFor, type FutDb,
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
    return await runWorkspace(fn);
  } catch (e) {
    if (e instanceof FutError) throw new ToolError(e.message);
    throw e;
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : undefined);

/** The squad the AI named, or the one the player edited last. */
async function squadId(db: FutDb, userId: string, v: unknown): Promise<string> {
  const id = str(v) ?? (await latestSquadId(db, userId));
  if (!id) throw new ToolError("No saved squads yet. The player builds one at https://gafferbot.app/fut.");
  return id;
}

const SQUAD_ID = { type: "string", description: "A saved squad id (from get_my_fut_squad with list: true). Leave out for the squad edited last." };
const RULES = "Numbers come from XI Lab's tested chemistry engine: never estimate chemistry yourself. Report the rule version and say plainly when the rules are unverified (community thresholds, not confirmed by EA).";
const READ_ONLY = "Read-only: nothing is saved and nothing touches the player's EA account or the transfer market.";
const LABELS = "Every card carries an evidence label (game_data = copied from the game screen, estimate, hypothesis); say which numbers are the player's own entries.";

export const FUT_TOOLS: Tool<FutCtx>[] = [
  {
    name: "get_my_fut_squad",
    title: "My FUT squad (XI Lab)",
    description: "EA FC Ultimate Team: one of the player's saved XI Lab squads with each slot's card and lock, plus the manager and budget. Leave squad_id out for the squad they edited last; set list: true to list every saved squad. " + LABELS,
    inputSchema: {
      type: "object",
      properties: { squad_id: SQUAD_ID, list: { type: "boolean", description: "List every saved squad instead of returning one." } },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const ws = await workspaceFor(db);
      if (args.list === true) {
        const squads = await ws.listSquads(userId);
        return { squads: squads.map((s) => ({ id: s.id, name: s.name, formation: s.formation, filled: s.slots.filter((x) => x.card).length, budget: s.budget, updated_at: s.updated_at })) };
      }
      return { squad: await ws.getSquad(userId, await squadId(db, userId, args.squad_id)) };
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
      const cards = await searchMyCards(db, userId, {
        q: str(args.query)?.slice(0, 60), position: str(args.position), min_overall: int(args.min_overall),
        owned_only: args.owned_only === true, limit: int(args.limit),
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
    description: "EA FC Ultimate Team: chemistry for a saved squad: team total out of 33, each player's 0-3 with the club/league/nation links behind it, plus tactical fit as a separate estimate (fit is not chemistry). " + RULES,
    inputSchema: { type: "object", properties: { squad_id: SQUAD_ID }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await (await workspaceFor(db)).calculateChemistry(userId, await squadId(db, userId, args.squad_id));
    }),
  },
  {
    name: "diagnose_fut_chemistry",
    title: "FUT Chemistry Surgeon (XI Lab)",
    description: "EA FC Ultimate Team: XI Lab's Chemistry Surgeon. For one slot: why that player has the chemistry they have, which links they count towards and what the next point needs. Leave slot out for every player below 3. " + RULES,
    inputSchema: {
      type: "object",
      properties: { squad_id: SQUAD_ID, slot: { type: "string", description: "Slot name from the squad, e.g. LCB or RST." } },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await (await workspaceFor(db)).diagnose(userId, await squadId(db, userId, args.squad_id), str(args.slot));
    }),
  },
  {
    name: "preview_fut_swap",
    title: "Preview a FUT swap (XI Lab)",
    description: "EA FC Ultimate Team: what happens to all 11 players if one of the player's cards goes into a slot (card_id null empties it). Every starter is recalculated, so the diff shows who gains and who loses. " + READ_ONLY + " " + RULES,
    inputSchema: {
      type: "object",
      properties: {
        squad_id: SQUAD_ID,
        slot: { type: "string", description: "Slot name from the squad, e.g. LCB." },
        card_id: { type: ["string", "null"], description: "One of the player's card ids, or null to empty the slot." },
      },
      required: ["slot", "card_id"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      let card = null;
      if (args.card_id !== null) {
        const c = await getCard(db, userId, String(args.card_id ?? ""));
        if (!c) throw new ToolError("Card not found among the player's cards.");
        card = toWorkspaceCard(c);
      }
      const slot = str(args.slot);
      if (!slot) throw new ToolError("slot is required (e.g. LCB).");
      return await (await workspaceFor(db)).previewAssign(userId, await squadId(db, userId, args.squad_id), slot, card);
    }),
  },
  {
    name: "optimize_fut_squad",
    title: "Find FUT chemistry fixes (XI Lab)",
    description: "EA FC Ultimate Team: XI Lab's optimizer. Finds the cheapest 1-4 swaps (from the player's own cards and priced targets) that reach a goal: a slot's chemistry and/or a team total, within budget. Locked players never move; by default a fix that lowers team chemistry is rejected and listed as rejected. If nothing fits, blockers say which limit stops it. " +
      "Prices are what the player entered, not live market prices. " + READ_ONLY + " " + RULES,
    inputSchema: {
      type: "object",
      properties: {
        squad_id: SQUAD_ID,
        slot: { type: "string", description: "Slot to fix, e.g. LST." },
        slot_target: { type: "integer", minimum: 0, maximum: 3, description: "Chemistry wanted in that slot (default 3)." },
        total_target: { type: "integer", minimum: 0, maximum: 33, description: "Team chemistry wanted." },
        budget: { type: "integer", minimum: 0, description: "Coins available; defaults to the squad's budget." },
        max_swaps: { type: "integer", minimum: 1, maximum: 4, description: "Default 3." },
        allow_manager_change: { type: "boolean" },
        allow_net_loss: { type: "boolean", description: "Default false." },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const id = await squadId(db, userId, args.squad_id);
      const goal = { slot: str(args.slot), slot_target: int(args.slot_target), total_target: int(args.total_target) };
      if (!goal.slot && goal.total_target === undefined) throw new ToolError("Give a slot to fix, a total_target, or both.");
      const options = {
        budget: int(args.budget), max_swaps: int(args.max_swaps),
        allow_manager_change: typeof args.allow_manager_change === "boolean" ? args.allow_manager_change : undefined,
        allow_net_loss: typeof args.allow_net_loss === "boolean" ? args.allow_net_loss : undefined,
      };
      const result = await (await workspaceFor(db)).optimize(userId, id, { goal, options });
      await logRun(db, userId, { squad: id, kind: "optimize", input: { goal, options }, result, via: "mcp" });
      return result;
    }),
  },
  {
    name: "compare_fut_squads",
    title: "Compare FUT squads (XI Lab)",
    description: "EA FC Ultimate Team: two saved squads side by side: chemistry and tactical-fit estimate per slot and in total, who differs, and plain trade-offs from those numbers. " + RULES,
    inputSchema: {
      type: "object",
      properties: { squad_a: { type: "string", description: "Saved squad id." }, squad_b: { type: "string", description: "Saved squad id." } },
      required: ["squad_a", "squad_b"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = str(args.squad_a), b = str(args.squad_b);
      if (!a || !b) throw new ToolError("Give two saved squad ids.");
      return await (await workspaceFor(db)).compare(userId, a, b);
    }),
  },
];
