// XI Lab (FUT) tools for AI apps: read-only advice on the player's own Ultimate Team cards and squads.
// They call the same services as the website's fut-api (../_shared/fut/service.ts), so chemistry here always
// matches gafferbot.app/fut. Listed only while FUT_ENABLED=true. Nothing here touches an EA account or the
// transfer market, and nothing saves: building and saving squads stays on the website for now (optimizer runs are logged).
// Names all say "fut" because GafferBot's Pro Clubs tools already use "chemistry" and "player cards".
import { Tool, ToolError } from "./protocol.ts";
import {
  compareCards, futDb, FutError, getCard, latestSquadId, logRun, runWorkspace, searchMyCards, toWorkspaceCard, workspaceFor, type FutDb,
} from "../_shared/fut/service.ts";
import { marketCardId, marketFor, platformParam } from "../_shared/fut/market.ts";
import { KB_CATEGORIES, knowledgeMap, knowledgeTopic } from "../_shared/fut/knowledge.ts";
import { scanRequestSchema, thesisInputSchema } from "../_shared/fut/xilab/market/index.ts";
import { parseSolveBody, sbcOverview, solveForUser } from "../_shared/fut/sbc-data.ts";
import { checkPastedEvolution, evolutionsOverview } from "../_shared/fut/evolutions-data.ts";
import { tradeOverview } from "../_shared/fut/trades.ts";
import { sellOrKeep } from "../_shared/fut/sell-keep.ts";
import { metaForCard, metaTop } from "../_shared/fut/meta-data.ts";
import { calendarFor } from "../_shared/fut/calendar.ts";
import { fodderIndex } from "../_shared/fut/fodder.ts";
import { objectivesPlan } from "../_shared/fut/objectives.ts";
import { champsOverview } from "../_shared/fut/champs.ts";
import { activeRules } from "../_shared/fut/service.ts";
import { searchPlayers } from "../_shared/fut/player-finder.ts";
import { ACCELERATE_TYPES, ALL_STATS, cleanPlayerQuery, PLAYSTYLES } from "../_shared/fut/stats.ts";
import { compareAnyCards } from "../_shared/fut/card-compare.ts";
import { cardPriceHistory } from "../_shared/fut/price-history.ts";
import { coachPlan, playingNow } from "../_shared/fut/coach.ts";
import { dailyStrategy } from "../_shared/fut/strategy.ts";
import { packAdvice } from "../_shared/fut/packs.ts";
import { accountOverview } from "../_shared/fut/account.ts";
import { currentSquad, squadAdvice } from "../_shared/fut/current-squad.ts";
import { upgradeOptions } from "../_shared/fut/upgrades-data.ts";
import { idealSquad, MAX_PLAYSTYLE, PLAYER_TRAITS, SHAPE_TRAITS, topMetas } from "../_shared/fut/ideal-squad.ts";
import { loadTeam, teamPlan } from "../_shared/fut/knowledge-team.ts";
import { squadRoles } from "../_shared/fut/squad-suggest.ts";
import { envForUser } from "../_shared/fut/ai-keys.ts";
import { FORMATIONS, type Squad } from "../_shared/fut/xilab/workspace/index.ts";

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
    description: "EA FC Ultimate Team: one card's details by card id (from get_my_fut_inventory, search_fut_players, search_fut_market_cards or a squad): face stats plus every in-game attribute FUT.GG lists (acceleration, sprint speed, agility, finishing, composure and so on), foot, height, AcceleRATE, alternative positions, PlayStyles and FC 27 roles (+ / ++). " + LABELS,
    inputSchema: {
      type: "object",
      properties: { card_id: { type: "string", description: "Card id." } },
      required: ["card_id"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const card = await getCard(db, userId, String(args.card_id ?? ""));
      if (!card) throw new ToolError("Card not found among the player's cards or the market card list.");
      return { card, ...(await fullStats(db, card.id)) };
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

// ---------------------------------------------------------------- Market Lab (research only)

const MARKET = "Prices are the player's own imported history (XI Lab has no licensed live price feed), so say how old the latest price is and never present it as live. " +
  "Results are evidence, not predictions: report the status, the reasons and the 'could be wrong' list, and never call anything a guaranteed profit. " +
  "Nothing here buys, sells, bids or touches the transfer market.";
const PLATFORM = { type: "string", enum: ["console", "pc"], description: "Market: console (PlayStation and Xbox share one) or pc. Default console." };
const CARD_ID = { type: "string", description: "One of the player's card ids (from get_my_fut_inventory)." };

function zodArgs<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: (string | number)[]; message: string }[] } } }, v: unknown): T {
  const r = schema.safeParse(v);
  if (r.success) return r.data as T;
  throw new ToolError(`Invalid arguments: ${r.error!.issues.slice(0, 5).map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ")}`);
}
const cardArg = (v: unknown) => {
  try { return marketCardId(v); } catch (e) { throw new ToolError((e as Error).message); }
};

FUT_TOOLS.push(
  {
    name: "get_fut_market_overview",
    title: "FUT market overview (XI Lab Market Lab)",
    description: "EA FC Ultimate Team: Market Lab overview for the player's priced cards: benchmark indexes with 1h-7d changes and volatility, a rule-based market regime with the measurements behind it, cards showing unusual relative strength or declines, and price coverage. " + MARKET,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const o = await (await marketFor(db)).getMarketOverview(userId, { platform: platformParam(args.platform) });
      const { index_history: _h, ...rest } = o;
      return rest;
    }),
  },
  {
    name: "get_fut_card_market_intelligence",
    title: "FUT card market intelligence (XI Lab Market Lab)",
    description: "EA FC Ultimate Team: one card's Market Lab page: latest price and its age, relative strength against five benchmarks, momentum, mean reversion, signal status with reasons and risks, card utility (tactical-fit estimate) and comparable cards. " + MARKET,
    inputSchema: { type: "object", properties: { card_id: CARD_ID, platform: PLATFORM }, required: ["card_id"], additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const r = await (await marketFor(db)).getCardMarketIntelligence(userId, cardArg(args.card_id), { platform: platformParam(args.platform) });
      // The full hourly history is for charts; the AI gets the last 24 points.
      return { ...r, price: { ...r.price, history: r.price.history.slice(-24) } };
    }),
  },
  {
    name: "find_fut_market_opportunities",
    title: "Scan FUT market signals (XI Lab Market Lab)",
    description: "EA FC Ultimate Team: Market Lab's scanner over the player's priced cards. Each card gets a status (favorable_setup, research_further, watch, overheated, elevated_risk, insufficient_evidence) with reasons. A favorable setup is not a guaranteed profitable trade. " + MARKET,
    inputSchema: {
      type: "object",
      properties: {
        platform: PLATFORM,
        status: { type: "array", items: { type: "string", enum: ["watch", "research_further", "favorable_setup", "overheated", "elevated_risk", "insufficient_evidence"] } },
        max_price: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 20." },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const q = zodArgs(scanRequestSchema, { ...args, limit: args.limit ?? 20 });
      return await (await marketFor(db)).findMarketOpportunities(userId, q);
    }),
  },
  {
    name: "compare_fut_card_relative_value",
    title: "FUT relative value (XI Lab Market Lab)",
    description: "EA FC Ultimate Team: a card's price against its tactical-fit estimate, next to comparable cards (same primary position, overall within 2) or the cards you name. Fit is a face-stat estimate; PlayStyles, roles and chemistry are not in it. " + MARKET,
    inputSchema: {
      type: "object",
      properties: { card_id: CARD_ID, others: { type: "array", items: { type: "string" }, maxItems: 10 }, platform: PLATFORM },
      required: ["card_id"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const others = Array.isArray(args.others) ? args.others.map(cardArg) : undefined;
      return await (await marketFor(db)).compareCardRelativeValue(userId, cardArg(args.card_id), { platform: platformParam(args.platform), others });
    }),
  },
  {
    name: "analyze_fut_trade_thesis",
    title: "FUT trade thesis (XI Lab Market Lab)",
    description: "EA FC Ultimate Team: arithmetic on a trade the player is considering: investment, EA's 5% sale tax, break-even listing price, profit at their target, loss at their downside, risk/reward and the win rate needed to break even. It is not a forecast: any probability comes from the player. Cards held are never counted as coins. " + MARKET,
    inputSchema: {
      type: "object",
      properties: {
        card_id: CARD_ID,
        platform: PLATFORM,
        quantity: { type: "integer", minimum: 1, maximum: 100 },
        buy_price: { type: "integer", minimum: 1 },
        target_price: { type: "integer", minimum: 1 },
        downside_price: { type: "integer", minimum: 0 },
        coin_balance: { type: "integer", minimum: 0 },
        assumed_target_probability: { type: "number", minimum: 0, maximum: 1, description: "Only if the player gives one." },
      },
      required: ["card_id", "buy_price", "target_price", "downside_price"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const input = zodArgs(thesisInputSchema, { platform: "console", quantity: 1, ...args });
      cardArg(input.card_id);
      return await (await marketFor(db)).analyzeTradeThesis(userId, input);
    }),
  },
  {
    name: "get_fut_market_data_sources",
    title: "FUT market data sources (XI Lab Market Lab)",
    description: "EA FC Ultimate Team: which price sources Market Lab can use and why others are off (not authorised), with what each source's terms allow. Use it to explain where prices come from.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: (_args, ctx) => run(async () => {
      const { db } = await account(ctx);
      return { sources: (await marketFor(db)).getDataSourceStatus() };
    }),
  },
  {
    name: "list_my_fut_sbcs",
    title: "My SBCs (XI Lab SBC Solver)",
    description: "EA FC Ultimate Team: the player's open Squad Building Challenge sets as the XI Lab helper last saw them in the EA Web App, with each opened challenge's requirements read into plain lines (EA's field names are unverified on FC 27; list anything under unread). Use before solve_fut_sbc. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await sbcOverview(db, userId, platformParam(args.platform));
    }),
  },
  {
    name: "solve_fut_sbc",
    title: "Solve an SBC (XI Lab SBC Solver)",
    description: "EA FC Ultimate Team: the cheapest squad for one SBC challenge (or up to 10 in a set, never reusing a card) from the player's spare duplicates and untradeables first, then tradeable club cards, then the cheapest market cards at FUT.GG's latest prices; plus what to buy, the real coin cost, and whether the reward is worth it. Give requirements as pasted text (one per line, e.g. 'Min. Team Rating: 84') or as the requirement objects list_my_fut_sbcs returns. Team rating and chemistry are estimates; the player builds and submits the squad themselves. " + READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        platform: PLATFORM,
        set_id: { type: "integer", description: "The SBC set (from list_my_fut_sbcs), to value its reward." },
        reward: { type: "integer", minimum: 0, description: "What the reward is worth in coins, if the player says." },
        challenges: {
          type: "array", minItems: 1, maxItems: 10,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              formation: { type: "string", description: "e.g. 4-3-3 or EA's f433. Default 4-3-3." },
              text: { type: "string", description: "Requirements, one per line." },
              requirements: { type: "array", items: { type: "object" }, description: "Requirement objects from list_my_fut_sbcs." },
            },
            additionalProperties: false,
          },
        },
        options: {
          type: "object",
          properties: {
            use_tradeables: { type: "boolean", description: "Use tradeable club cards. Default true." },
            buy: { type: "boolean", description: "Buy missing cards. Default true." },
            protect_from: { type: "integer", minimum: 1, maximum: 99, description: "Never use club cards rated this or higher." },
          },
          additionalProperties: false,
        },
      },
      required: ["challenges"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const b = args as Record<string, unknown>;
      return await runWorkspace(() => solveForUser(db, userId, platformParam(b.platform), parseSolveBody(b)));
    }),
  },
  {
    name: "find_fut_evolutions",
    title: "Evolutions for my club (XI Lab Evolutions finder)",
    description: "EA FC Ultimate Team: live evolutions the XI Lab helper saw in the EA Web App (or one the player pastes as requirement and upgrade text), each with the player's club cards that can enter it, what they become after every level, and the overall gain in their latest saved squad; plus the best evolution per card. New ratings add EA's +OVR upgrades, so they're estimates; EA's FC 27 evolution fields are unverified (report anything under unread). " + READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        platform: PLATFORM,
        name: { type: "string", description: "Pasted evolution's name." },
        requirements: { type: "string", description: "Pasted requirements, one per line (e.g. 'Overall: Max 82', 'Position: CM')." },
        upgrades: { type: "string", description: "Pasted upgrades, one per line, 'Level N' lines between levels (e.g. '+3 OVR', 'PlayStyle+: Finesse Shot')." },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const b = args as Record<string, unknown>;
      if (str(b.requirements) || str(b.upgrades)) return await runWorkspace(() => checkPastedEvolution(db, userId, b));
      return await runWorkspace(() => evolutionsOverview(db, userId, platformParam(b.platform)));
    }),
  },
  {
    name: "get_my_fut_trades",
    title: "My trading profit (XI Lab trade log)",
    description: "EA FC Ultimate Team: the player's buys and sales as the XI Lab helper saw them on their transfer list and Transfer Targets (won items are buys, sold items are sales, matched by EA's item id): after-tax profit in total, this week and this month, win rate, tax paid, best and worst flips, recent flips, cards still held valued at FUT.GG's price after tax, and sales with no buy price on record. Buys straight from a search to the club aren't seen. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const t = await tradeOverview(db, userId, platformParam((args as Record<string, unknown>).platform));
      return { ...t, flips: t.flips.slice(0, 30), open: t.open.slice(0, 30), sales_without_buy: t.sales_without_buy.slice(0, 20) };
    }),
  },
  {
    name: "fut_sell_or_keep",
    title: "Sell or keep my club cards",
    description: "EA FC Ultimate Team: a verdict for every tradeable card in the player's synced club, with the reason: keep (starts in the squad they play in the EA Web App or a saved squad), keep_evo (a live evolution would make it start), hold_fodder (high-rated card at the cheapest price for its rating, better used in SBCs), sell_now (falling on FUT.GG), sell_high (near its two-week high), wait (still rising) or sell (steady, unused); plus coins after tax from selling. Prices are FUT.GG's. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const platform = platformParam((args as Record<string, unknown>).platform);
      const r = await runWorkspace(() => sellOrKeep(db, userId, platform, async () => new Map((await evolutionsOverview(db, userId, platform)).best_upgrades.map((b) => [b.card_id, { name: b.evolution, gain: b.gain }])), () => playingNow(db, userId)));
      return { ...r, advice: r.advice.slice(0, 60).map(({ trend: _t, ...a }) => a) };
    }),
  },
  {
    name: "fut_meta_rating",
    title: "Metarating: how good a FUT card actually plays",
    description: "EA FC Ultimate Team: GafferBot's metarating. With card_id: the card's score (1-99) in each role at each of its positions, from in-game attributes, PlayStyles and PlayStyles+, height, AcceleRATE, weak foot and skill moves under the best chem style, with strengths, weaknesses and a one-line verdict vs its overall. With position (and optional role, max_price, owned_only): the best-scoring cards for that position on FUT.GG's card list. An estimate, not EA's numbers. " + READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "string", description: "A card id from search_my_fut_cards or the market tools." },
        position: { type: "string", description: "GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW or ST, to list the best cards there." },
        role: { type: "string", description: "Optional role at that position, e.g. 'Advanced Forward', 'Ball-Playing Defender'." },
        max_price: { type: "integer", description: "Optional budget in coins." },
        owned_only: { type: "boolean", description: "Only cards in the player's synced club." },
        platform: PLATFORM,
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const b = args as Record<string, unknown>;
      if (str(b.card_id)) return await metaForCard(db, userId, String(b.card_id));
      if (!str(b.position)) throw new ToolError("Give card_id, or a position to list the best cards for it.");
      const r = await metaTop(db, userId, b);
      return { ...r, cards: r.cards.slice(0, 15) };
    }),
  },
  {
    name: "get_my_fut_champs",
    title: "My Champs and Rivals record (XI Lab tracker)",
    description: "EA FC Ultimate Team: the Champions, Rivals and Squad Battles games the player logged on the website, grouped into runs (a Champs weekend, a Rivals week): record, goals, form, streaks, results against each opponent formation, how the run went early vs late, what they still need for their win target, and a Discord-ready recap per run. Logged by the player, not read from EA. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const o = await champsOverview(db, userId, platformParam((args as Record<string, unknown>).platform));
      return { ...o, formations: undefined, runs: o.runs.slice(0, 8).map((r) => ({ ...r, games: r.games.slice(-30) })) };
    }),
  },
  {
    name: "fut_market_calendar",
    title: "FUT market calendar: when prices usually rise and crash",
    description: "EA FC Ultimate Team: the next 7 days of FUT's usual weekly rhythm in UK time (Team of the Week, Rivals and Champs rewards, Friday promos, Champs weekend, Monday) with a back-test from GafferBot's own FUT.GG snapshots: how tracked cards in each rating band moved after each of the last weeks' events, and whether that's a pattern (sell before, buy before) or not enough data yet; plus recent market-wide crashes. With card_id: the same back-test on that card's own price. The schedule is the usual one, not confirmed for FC 27. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM, card_id: { type: "string", description: "Optional: one card (from search or the club) to back-test on its own price." } }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      return await calendarFor(db, userId, platformParam(a.platform), typeof a.card_id === "string" && a.card_id ? a.card_id : null);
    }),
  },
  {
    name: "fut_fodder_index",
    title: "FUT fodder index: what SBC fodder costs now",
    description: "EA FC Ultimate Team: the price of SBC fodder, the cheapest cards of each rating from 81 to 91 (average of the 5 cheapest on FUT.GG), at every twice-daily refresh over the last days (1-90, default 30), with an equal-weighted index (100 = start of the period), each rating's change over 24 hours and 7 days, and a signal: spike (15%+ above its 7-day median, likely SBC demand: sell spares, don't buy) or cheap (10%+ below: stock up). " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM, days: { type: "integer", minimum: 1, maximum: 90 } }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db } = await account(ctx);
      const a = args as Record<string, unknown>;
      const r = await fodderIndex(db, platformParam(a.platform), typeof a.days === "number" ? a.days : 30);
      return { ...r, index_history: r.index_history.slice(-60), ratings: r.ratings.map(({ history: _h, ...x }) => x) };
    }),
  },
  {
    name: "fut_plan_objectives",
    title: "Plan one XI for my FUT objectives",
    description: "EA FC Ultimate Team: reads the player requirements in the player's open objectives (captured by the XI Lab helper, or pasted as text, one per line), such as 'with 3 Premier League players in your starting XI' or 'using a Brazilian player', and builds one XI from their club cards that covers as many at once as possible (best-overall XI first, cheapest swaps in overall). Per objective: covered (with which players), can't cover (and why), any XI, or not read; plus the game mode it's for. Formation: the latest saved squad's unless given. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM, formation: { type: "string", description: "e.g. 4-3-3; default the latest saved squad's" }, text: { type: "string", maxLength: 20000, description: "Optional: objectives pasted one per line, instead of the helper's capture." } }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      const r = await runWorkspace(() => objectivesPlan(db, userId, platformParam(a.platform), a));
      return { ...r, squad: r.squad ? { formation: r.squad.formation, slots: r.squad.slots.map((s) => ({ slot: s.slot, position: s.position, card: s.card ? { id: s.card.id, name: s.card.name, rating: s.card.rating ?? null } : null })) } : null };
    }),
  },
);

// Knowledge bank: what the FUT community says about gameplay and strategy (Reddit, YouTube, the player's own notes).
// The AI app answers from the claims itself, so these never call Claude on the server.
const KB_NOTE = "Ultimate Team only: for Pro Clubs Virtual Pro builds use get_meta_builds. These are community opinions read from Reddit posts, YouTube videos and the player's own notes, not facts: say how many sources back a view, where people disagree, and link the sources.";
FUT_TOOLS.push(
  {
    name: "search_fut_knowledge",
    title: "Search the FUT knowledge bank",
    description: "EA FC Ultimate Team gameplay and strategy: claims the community makes about formations, custom tactics, players, PlayStyles, attacking, defending, skill moves, settings and modes, each with its stance (for, against, mixed) and source link. Use it to answer questions like \"is 4-2-3-1 still meta?\" or \"best tactics for 4-4-2\". " + KB_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, e.g. \"4-4-2 custom tactics\" or \"Explosive AcceleRATE\"." },
        days: { type: "integer", description: "Only claims from the last N days (default 120)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const q = (str(args.query) ?? "").slice(0, 300);
      if (!q) throw new FutError("query is required.");
      const { data, error } = await db.rpc("kb_search", { p_user: userId, p_q: q, p_limit: 40, p_days: Math.min(Math.max(int(args.days) ?? 120, 1), 365) });
      if (error) throw new Error(error.message);
      return { claims: data, note: KB_NOTE };
    }),
  },
  {
    name: "get_fut_knowledge_map",
    title: "Map of what the FUT community is saying",
    description: "EA FC Ultimate Team: every topic the community talked about recently, with how many claims, net sentiment (-1 against to 1 for), agreement (agreed, leaning, split, early) and trend (-1 cooling to 1 rising). Give a topic key to get its weekly trend and the statements on each side with their sources. " + KB_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Look back this many days (default 30)." },
        category: { type: "string", enum: [...KB_CATEGORIES], description: "Only one kind of topic." },
        topic_key: { type: "string", description: "A topic's key from the map, for its detail." },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const days = Math.min(Math.max(int(args.days) ?? 30, 1), 365);
      const key = str(args.topic_key);
      if (key) {
        if (!/^[a-z0-9-]{1,80}$/.test(key)) throw new FutError("topic_key must be a key from the map.");
        const topic = await knowledgeTopic(db, userId, key, Math.max(days, 7));
        if (!topic) throw new FutError("Nobody has talked about that topic in this period.");
        return { topic, note: KB_NOTE };
      }
      const category = str(args.category);
      if (category && !(KB_CATEGORIES as readonly string[]).includes(category)) throw new FutError(`category must be one of ${KB_CATEGORIES.join(", ")}.`);
      return { map: await knowledgeMap(db, userId, days, category ?? null), note: KB_NOTE };
    }),
  },
);

// ---------------------------------------------------------------- full card stats, market card search, prices

/** Every in-game attribute FUT.GG lists for a card, plus its roles: what Player Ratings shows. Empty when not fetched yet. */
async function fullStats(db: FutDb, cardId: string) {
  const [a, r] = await Promise.all([
    db.from("card_attributes").select("*").eq("card_id", cardId).maybeSingle(),
    db.from("card_roles").select("*").eq("card_id", cardId),
  ]);
  const row = (a?.data ?? null) as Record<string, unknown> | null;
  const roles = ((r?.data ?? []) as Record<string, unknown>[]).map((x) => ({ position: x.position_code, role: x.role, level: x.level }));
  if (!row) return { attributes: null, roles, attributes_note: "FUT.GG's full attributes haven't been read for this card yet (a few hundred cards are read per run)." };
  const detail = (row.detail && typeof row.detail === "object" ? row.detail : {}) as Record<string, unknown>;
  return {
    attributes: { ...detail, foot: row.foot ?? null, height_cm: row.height_cm ?? null, accelerate_type: row.accelerate_type ?? null, alt_positions: row.alt_positions ?? [], total_igs: row.total_igs ?? null, fetched_at: row.fetched_at ?? null },
    roles,
  };
}

const STAT_LIST = ALL_STATS.map((x) => x.key).join(", ");
const STAT_BOUND = { type: "array", maxItems: 12, items: { type: "object", properties: { stat: { type: "string" }, value: { type: "integer", minimum: 1, maximum: 5000 } }, required: ["stat", "value"], additionalProperties: false } };
const FUTGG = "Cards and prices come from FUT.GG's public card list (lowest Buy Now estimates, refreshed twice a day plus hourly for some cards), not EA: say how old the prices are. " + READ_ONLY;
const POSITIONS = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"];
const clampInt = (v: unknown, min: number, max: number, dflt: number) => Math.min(max, Math.max(min, int(v) ?? dflt));

FUT_TOOLS.push(
  {
    name: "search_fut_players",
    title: "Search every FUT card with full stats (Player Ratings)",
    description: "EA FC Ultimate Team: GafferBot's Player Ratings search over the whole market card list (not just the player's club), with each card's full in-game attributes, PlayStyles, PlayStyles+, roles, foot, height, AcceleRATE, price and whether the player owns it. Search by name (text), positions, rating, price, card type, league/nation/club, stat minimums and maximums (e.g. sprint_speed 90+), PlayStyles; rank by a weighted fit of stats (weights 1-5) or sort by any stat, price or name. Turn requests like \"fast CB under 50k with good passing\" into weights and limits yourself. Stat keys: " + STAT_LIST + ". " + FUTGG,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: 60, description: "Name (or part of it), e.g. \"Mbappe\"." },
        positions: { type: "array", items: { type: "string", enum: POSITIONS }, maxItems: 12 },
        include_alt_positions: { type: "boolean", description: "Match alternative positions too (default true)." },
        card_type: { type: "string", enum: ["icon", "hero", "promo", "base"] },
        min_rating: { type: "integer", minimum: 1, maximum: 99 }, max_rating: { type: "integer", minimum: 1, maximum: 99 },
        min_price: { type: "integer", minimum: 0 }, max_price: { type: "integer", minimum: 0 },
        priced_only: { type: "boolean", description: "Leave out cards with no price (SBC, objective, untradeable)." },
        minimums: { ...STAT_BOUND, description: "Stat floors, e.g. [{stat: \"pac\", value: 90}]." },
        maximums: { ...STAT_BOUND, description: "Stat ceilings, e.g. [{stat: \"height_cm\", value: 180}]." },
        foot: { type: "string", enum: ["left", "right"] },
        playstyles: { type: "array", items: { type: "string" }, maxItems: 6, description: `Must have these PlayStyles (or PlayStyles+). Names: ${PLAYSTYLES.join(", ")}.` },
        playstyles_plus: { type: "array", items: { type: "string" }, maxItems: 4, description: "Must have these as PlayStyles+." },
        accelerate_types: { type: "array", items: { type: "string", enum: [...ACCELERATE_TYPES] }, maxItems: 7 },
        league: { type: "string" }, nation: { type: "string" }, club: { type: "string" },
        owned_only: { type: "boolean", description: "Only cards in the player's synced club." },
        weights: { type: "array", maxItems: 12, description: "Rank by fit: [{stat, weight 1-5}].", items: { type: "object", properties: { stat: { type: "string" }, weight: { type: "integer", minimum: 1, maximum: 5 } }, required: ["stat", "weight"], additionalProperties: false } },
        sort: { type: "string", description: "A stat key, \"fit\", \"price\" or \"name\". Default: fit with weights, else overall." },
        direction: { type: "string", enum: ["asc", "desc"] },
        platform: PLATFORM,
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 20." },
        offset: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const { platform, limit, offset, ...q } = args as Record<string, unknown>;
      const r = await searchPlayers(db, userId, cleanPlayerQuery(q), { platform: platformParam(platform), limit: clampInt(limit, 1, 50, 20), offset: clampInt(offset, 0, 100_000, 0) });
      return { ...r, note: "Use a card's id with get_fut_card, compare_any_fut_cards, get_fut_price_history, fut_meta_rating or get_fut_card_market_intelligence." };
    }),
  },
  {
    name: "search_fut_market_cards",
    title: "FUT market card list with prices (Market cards)",
    description: "EA FC Ultimate Team: the market-wide card list with each card's latest price and its 24-hour change, filtered by name, position, card type, rating and price, sorted by price, rating, biggest risers or fallers, or name. Use it to look up a card's price by name, compare prices of several cards, or see what's rising and falling. " + FUTGG,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 60, description: "Name (or part of it)." },
        position: { type: "string", enum: POSITIONS },
        type: { type: "string", enum: ["icon", "hero", "promo", "base"] },
        min_rating: { type: "integer", minimum: 1, maximum: 99 }, max_rating: { type: "integer", minimum: 1, maximum: 99 },
        min_price: { type: "integer", minimum: 0, maximum: 15000000 }, max_price: { type: "integer", minimum: 0, maximum: 15000000 },
        sort: { type: "string", enum: ["price_desc", "price_asc", "rating_desc", "change_desc", "change_asc", "name"], description: "Default price_desc." },
        platform: PLATFORM,
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 20." },
        offset: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db } = await account(ctx);
      const a = args as Record<string, unknown>;
      const position = str(a.position)?.toUpperCase() ?? null, type = str(a.type) ?? null, sort = str(a.sort) ?? "price_desc";
      if (position && !POSITIONS.includes(position)) throw new ToolError("position must be a position code like ST or CB.");
      if (type && !["icon", "hero", "promo", "base"].includes(type)) throw new ToolError("type must be icon, hero, promo or base.");
      if (!["price_desc", "price_asc", "rating_desc", "change_desc", "change_asc", "name"].includes(sort)) throw new ToolError("Unknown sort.");
      const opt = (v: unknown, min: number, max: number) => (int(v) === undefined ? null : Math.min(max, Math.max(min, int(v)!)));
      const { data, error } = await db.rpc("futgg_market_cards", {
        p_platform: platformParam(a.platform), p_q: str(a.query)?.slice(0, 60) ?? null, p_position: position, p_type: type,
        p_min_rating: opt(a.min_rating, 1, 99), p_max_rating: opt(a.max_rating, 1, 99), p_min_price: opt(a.min_price, 0, 15_000_000), p_max_price: opt(a.max_price, 0, 15_000_000),
        p_sort: sort, p_limit: clampInt(a.limit, 1, 50, 20), p_offset: clampInt(a.offset, 0, 100_000, 0),
      });
      if (error) throw new FutError(`Market cards are unavailable: ${error.message}`, 500);
      return data;
    }),
  },
  {
    name: "get_fut_price_history",
    title: "FUT card price history",
    description: "EA FC Ultimate Team: one card's FUT.GG price over the last 1-90 days (default 14; twice daily plus hourly for tracked cards), with low, high, latest and changes, and market-wide drops marked. Card ids come from search_fut_players, search_fut_market_cards or the player's cards. " + FUTGG,
    inputSchema: { type: "object", properties: { card_id: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 90 }, platform: PLATFORM }, required: ["card_id"], additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      const r = await cardPriceHistory(db, userId, platformParam(a.platform), String(a.card_id ?? ""), clampInt(a.days, 1, 90, 14));
      // The full series is for charts; the AI gets the latest 60 points.
      return { ...r, points: r.points.slice(-60), points_total: r.points.length };
    }),
  },
  {
    name: "compare_any_fut_cards",
    title: "Compare any FUT cards with full stats",
    description: "EA FC Ultimate Team: side by side for 2 to 4 of any cards (the player's or from the market list): every in-game attribute with an optional chem style applied to each, PlayStyles each has that the others don't, metaratings per position and the current FUT.GG price. Chem style boosts and metaratings are GafferBot's estimates. " + READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        card_ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
        chem_styles: { type: "object", additionalProperties: { type: "string" }, description: "Optional: card id -> chem style name (e.g. Hunter, Shadow, Engine; GK: Wall, Shield, Cat, Glove)." },
        platform: PLATFORM,
      },
      required: ["card_ids"],
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await compareAnyCards(db, userId, args as Record<string, unknown>);
    }),
  },
  {
    name: "get_my_fut_club_value",
    title: "What my FUT club is worth",
    description: "EA FC Ultimate Team: which cards in the player's synced club are tradeable and what the tradeable copies sell for now (latest FUT.GG price, or their own newer Web App capture), with totals before and after EA's 5% tax. Untradeable cards are counted, not valued. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM, limit: { type: "integer", minimum: 1, maximum: 100, description: "Most valuable cards to list (default 30)." } }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      const { data, error } = await db.rpc("club_trade_value", { p_user: userId, p_platform: platformParam(a.platform) });
      if (error) throw new FutError(`Club value is unavailable: ${error.message}`, 500);
      const d = (data ?? {}) as Record<string, unknown>;
      const n = clampInt(a.limit, 1, 100, 30);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d)) out[k] = Array.isArray(v) && v.length > n ? v.slice(0, n) : v;
      return out;
    }),
  },
);

// ---------------------------------------------------------------- the plans: Coach, Daily Strategy, packs, account

const ADVICE = "Advice only: GafferBot never bids, buys, lists or quick sells for the player (EA bans automated trading), so tell them to check prices in the game and do every trade themselves.";
const cut = <T>(v: T[] | null | undefined, n: number) => (Array.isArray(v) ? v.slice(0, n) : v);

FUT_TOOLS.push(
  {
    name: "get_fut_coach_plan",
    title: "FUT Coach: what to do with my coins right now",
    description: "EA FC Ultimate Team: the FUT Coach page (gafferbot.app/fut). Ordered steps for the player's coins and the squad they actually play: collect sold items, relist, sell or quick sell unused cards, free club swaps, the best upgrade for the budget, SBCs worth doing, and the best affordable flip, each with coins and why. Built from their helper-captured coins, transfer list, club and squad plus FUT.GG prices. " + ADVICE,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await runWorkspace(() => coachPlan(db, userId, platformParam((args as Record<string, unknown>).platform)));
    }),
  },
  {
    name: "get_fut_daily_strategy",
    title: "FUT Daily Strategy: today's buys, sells and quick sells",
    description: "EA FC Ultimate Team: the Daily Strategy page (gafferbot.app/fut/strategy). Today's stance (buy, sell or flip day) and market mood, the one best coin move now, which picking rule is in use and why (replayed on past prices), buy picks with buy and sell prices, profit after tax, chance and 24h forecast, picks per price range, club cards to sell, cards worth more quick sold than listed, transfer list fixes (clear, relist, lower, quick sell), budget split and reserve, and the record of earlier picks. Viewing it stores today's plan so later days can score it, exactly as opening the page does. " + ADVICE,
    inputSchema: {
      type: "object",
      properties: {
        platform: PLATFORM,
        budget: { type: "integer", minimum: 0, maximum: 2000000000, description: "Coins to plan with. Leave out to use the coins the XI Lab helper last saw." },
        risk: { type: "string", enum: ["careful", "normal", "bold"], description: "Default normal." },
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      const budget = int(a.budget);
      const s = await dailyStrategy(db, userId, platformParam(a.platform), { budget: budget !== undefined && budget >= 0 ? budget : null, risk: a.risk === "careful" || a.risk === "bold" ? a.risk : "normal" });
      return { ...s, buys: cut(s.buys, 15), watch: cut(s.watch, 10), sells: cut(s.sells, 20), transfer_list: cut(s.transfer_list, 40) };
    }),
  },
  {
    name: "get_fut_pack_advice",
    title: "FUT Pack Advisor: which store packs are worth it",
    description: "EA FC Ultimate Team: the Pack Advisor (gafferbot.app/fut/packs). Each pack the XI Lab helper saw in the player's EA store with its odds, expected value from FUT.GG prices against its coin price, a verdict (buy, only_for_fodder, skip, points_only, no_odds, no_prices), timing tips and their own recent pulls. Expected value is an estimate from published odds. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await packAdvice(db, userId, platformParam((args as Record<string, unknown>).platform));
    }),
  },
  {
    name: "get_my_fut_account",
    title: "My FUT account: coins, transfer list, SBCs, objectives",
    description: "EA FC Ultimate Team: My Account (gafferbot.app/fut/account), as the XI Lab helper last saw it in the EA Web App: coins, FC Points and other currencies, profile, transfer list (sold, unsold, active, with what sold items bring in after tax), Transfer Targets, unassigned items and duplicates, open SBC sets and challenges, evolutions, objectives with progress, season progress, and tips. Each section says when it was captured. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await accountOverview(db, userId, platformParam((args as Record<string, unknown>).platform));
    }),
  },
  {
    name: "get_my_fut_watchlist",
    title: "My FUT watchlist (Market Lab)",
    description: "EA FC Ultimate Team: the cards the player watches in Market Lab with their target buy and sell prices, the latest price and how far it is from each target. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await (await marketFor(db)).getWatchlist(userId, { platform: platformParam((args as Record<string, unknown>).platform) });
    }),
  },
);

// ---------------------------------------------------------------- Squad Builder helpers (nothing saved)

/** The squad the AI named, else the one the player plays now (Web App capture, newest saved, or the club's best XI). */
async function squadFor(db: FutDb, userId: string, v: unknown): Promise<{ squad: Squad; note: string | null }> {
  const id = str(v);
  if (id) return { squad: await (await workspaceFor(db)).getSquad(userId, id) as Squad, note: null };
  const cur = await currentSquad(db, userId);
  if (!cur.squad) throw new ToolError(cur.note);
  return { squad: cur.squad, note: cur.note };
}
const ANY_SQUAD = { type: "string", description: "A saved squad id (get_my_fut_squad with list: true). Leave out for the squad the player plays now (get_my_current_fut_squad)." };
const slim = (s: Squad) => ({ id: s.id, name: s.name, formation: s.formation, slots: s.slots.map((x) => ({ slot: x.slot, position: x.position, card: x.card ? { id: x.card.id, name: x.card.name, rating: x.card.rating ?? null, positions: x.card.positions } : null })) });
/** AI on the server only runs on the player's own saved Claude key; otherwise the AI app does the thinking itself. */
async function ownAiEnv(db: FutDb, userId: string) {
  const base = (k: string) => Deno.env.get(k);
  const { env, own } = await envForUser(db, userId, base);
  return own ? env : (k: string) => (k === "ANTHROPIC_API_KEY" || k === "CLAUDE_API_KEY" ? undefined : base(k));
}

FUT_TOOLS.push(
  {
    name: "get_my_current_fut_squad",
    title: "The FUT squad I play now",
    description: "EA FC Ultimate Team: the squad the player actually plays: their active squad from the EA Web App (XI Lab helper capture) with bench, else their newest saved squad, else the strongest eleven their club can field; says which and why. " + READ_ONLY,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: (_args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const c = await currentSquad(db, userId);
      return { ...c, squad: c.squad ? slim(c.squad) : null };
    }),
  },
  {
    name: "fut_squad_advisor",
    title: "FUT squad advisor: better picks for every place",
    description: "EA FC Ultimate Team: Squad Builder's advisor. For each place in the squad: who plays there now, club cards that would do better ranked by skill (overall) or chemistry, the best market target they can afford with their coins and the best there is (by metarating); the same players rearranged into other formations; and the club's best eleven in each formation. " + RULES + " " + READ_ONLY,
    inputSchema: { type: "object", properties: { squad_id: ANY_SQUAD, by: { type: "string", enum: ["ovr", "chem"], description: "Rank by overall (default) or chemistry." }, platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      const { squad, note } = await squadFor(db, userId, a.squad_id);
      const [rules, mine] = await Promise.all([activeRules(db), searchMyCards(db, userId, { all: true, owned_only: true })]);
      const r = await runWorkspace(() => squadAdvice(db, userId, squad, mine.map(toWorkspaceCard), rules, { by: a.by === "chem" ? "chem" : "ovr", platform: platformParam(a.platform) }));
      const shape = (f: { squad: Squad }) => ({ ...f, squad: slim(f.squad) });
      return { squad: slim(squad), squad_note: note, ...r, slots: r.slots.map((x) => ({ ...x, picks: x.picks.slice(0, 5) })), rearrange: r.rearrange.slice(0, 5).map(shape), club: r.club.slice(0, 5).map(shape) };
    }),
  },
  {
    name: "fut_squad_upgrades",
    title: "FUT upgrade path within a budget",
    description: "EA FC Ultimate Team: the best single and two-card upgrades for a squad within a coin budget, from the market card list and the player's unused club cards (which cost nothing), with the cost, overall and chemistry change and metarating gain of each. " + FUTGG,
    inputSchema: { type: "object", properties: { squad_id: ANY_SQUAD, budget: { type: "integer", minimum: 0, maximum: 15000000, description: "Coins to spend." }, platform: PLATFORM }, required: ["budget"], additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      const { squad, note } = await squadFor(db, userId, a.squad_id);
      const r = await runWorkspace(() => upgradeOptions(db, userId, squad, { budget: a.budget, platform: a.platform }));
      return { squad: slim(squad), squad_note: note, ...r };
    }),
  },
  {
    name: "fut_ideal_squad",
    title: "FUT ideal squad for how I play",
    description: "EA FC Ultimate Team: Squad Builder's \"Build my ideal squad\". From how the player says they like to play (and optional style pills, number of strikers and defenders, or a fixed formation), it weighs formations by fit, what the Knowledge Bank community backs and what their club can field, then gives the formation, the XI from their club, custom tactics, player instructions and buy targets per position. Not saved. Style traits: " + [...Object.keys(SHAPE_TRAITS), ...Object.keys(PLAYER_TRAITS)].join(", ") + ". Server-side AI only runs on the player's own saved Claude key; otherwise playstyle words are read by simple rules. " + READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        playstyle: { type: "string", maxLength: MAX_PLAYSTYLE, description: "In their words, e.g. \"I like quick counters down the wings and crossing to a big striker\"." },
        traits: { type: "array", maxItems: 20, items: { type: "string", enum: [...Object.keys(SHAPE_TRAITS), ...Object.keys(PLAYER_TRAITS)] } },
        strikers: { type: "integer", enum: [1, 2, 3] },
        defenders: { type: "integer", enum: [3, 4, 5] },
        formation: { type: "string", description: "Fix the formation, e.g. 4-2-3-1." },
        squad_id: ANY_SQUAD,
        days: { type: "integer", minimum: 1, maximum: 365, description: "Community look-back (default 90)." },
        platform: PLATFORM,
      },
      additionalProperties: false,
    },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      const formation = str(a.formation) ?? null;
      if (formation && !FORMATIONS[formation]) throw new ToolError(`formation must be one of: ${Object.keys(FORMATIONS).join(", ")}.`);
      const platform = platformParam(a.platform);
      const { squad } = await squadFor(db, userId, a.squad_id);
      const [rules, mine, team, env] = await Promise.all([activeRules(db), searchMyCards(db, userId, { all: true, owned_only: true }), loadTeam(db, userId, squad.id ?? null, platform), ownAiEnv(db, userId)]);
      team.squad = { id: squad.id, name: squad.name, formation: squad.formation, xi: squad.slots.map((x) => ({ slot: x.slot, position: x.position, name: x.card?.name ?? null, rating: x.card?.rating ?? null })) };
      const known = [...Object.keys(SHAPE_TRAITS), ...Object.keys(PLAYER_TRAITS)];
      const traits = Array.isArray(a.traits) ? (a.traits as unknown[]).filter((t): t is string => typeof t === "string" && known.includes(t)) : [];
      const r = await runWorkspace(() => idealSquad(db, userId, squad, mine.map(toWorkspaceCard), rules, {
        playstyle: (str(a.playstyle) ?? "").slice(0, MAX_PLAYSTYLE), formation, days: clampInt(a.days, 1, 365, 90), platform, traits,
        strikers: [1, 2, 3].includes(a.strikers as number) ? a.strikers as 1 | 2 | 3 : null, defenders: [3, 4, 5].includes(a.defenders as number) ? a.defenders as 3 | 4 | 5 : null,
      }, team, env, fetch));
      return { ...r, squad: slim(r.squad) };
    }),
  },
  {
    name: "get_fut_meta_formations",
    title: "Top FUT meta formations right now",
    description: "EA FC Ultimate Team: the three formations the Knowledge Bank community backs most right now, with how many claims, net sentiment and a line people said, plus the custom tactics talked about most. Falls back to the usual metas when there isn't enough talk. " + KB_NOTE,
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 365, description: "Default 90." } }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      return await topMetas(db, userId, clampInt((args as Record<string, unknown>).days, 1, 365, 90));
    }),
  },
  {
    name: "get_fut_squad_roles",
    title: "FC 27 roles of my squad's players",
    description: "EA FC Ultimate Team: each squad card's FC 27 player roles (+ or ++) for the position it plays in the squad, so you can say who fits which role and tactic. " + READ_ONLY,
    inputSchema: { type: "object", properties: { squad_id: ANY_SQUAD }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const { squad, note } = await squadFor(db, userId, (args as Record<string, unknown>).squad_id);
      return { squad: slim(squad), squad_note: note, roles: await runWorkspace(() => squadRoles(db, userId, squad)) };
    }),
  },
  {
    name: "get_fut_team_plan",
    title: "Knowledge Bank \"For my team\" plan",
    description: "EA FC Ultimate Team: the Knowledge Bank's \"For my team\" page. What the community says, applied to the player's squad and club: the formation to play and why, custom tactics and player instructions, and per position the players the community rates or calls overrated (with price, price outlook and whether they own them), the best cards by stats, and their own options. Tactics written by AI only when the player saved their own Claude key; otherwise the community picks alone. " + KB_NOTE,
    inputSchema: { type: "object", properties: { squad_id: ANY_SQUAD, days: { type: "integer", minimum: 1, maximum: 365, description: "Default 30." }, platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const a = args as Record<string, unknown>;
      const platform = platformParam(a.platform);
      const [team, env] = await Promise.all([loadTeam(db, userId, str(a.squad_id) ?? null, platform), ownAiEnv(db, userId)]);
      return await runWorkspace(() => teamPlan(db, userId, { days: clampInt(a.days, 1, 365, 30), platform }, team, env, fetch));
    }),
  },
);
