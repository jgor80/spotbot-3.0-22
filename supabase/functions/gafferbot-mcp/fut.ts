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
import { champsOverview } from "../_shared/fut/champs.ts";

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
    description: "EA FC Ultimate Team: a verdict for every tradeable card in the player's synced club, with the reason: keep (starts in a saved squad), keep_evo (a live evolution would make it start), hold_fodder (high-rated card at the cheapest price for its rating, better used in SBCs), sell_now (falling on FUT.GG), sell_high (near its two-week high), wait (still rising) or sell (steady, unused); plus coins after tax from selling. Prices are FUT.GG's. " + READ_ONLY,
    inputSchema: { type: "object", properties: { platform: PLATFORM }, additionalProperties: false },
    run: (args, ctx) => run(async () => {
      const { db, userId } = await account(ctx);
      const platform = platformParam((args as Record<string, unknown>).platform);
      const r = await runWorkspace(() => sellOrKeep(db, userId, platform, async () => new Map((await evolutionsOverview(db, userId, platform)).best_upgrades.map((b) => [b.card_id, { name: b.evolution, gain: b.gain }]))));
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
);

// Knowledge bank: what the FUT community says about gameplay and strategy (Reddit, YouTube, the player's own notes).
// The AI app answers from the claims itself, so these never call Claude on the server.
const KB_NOTE = "These are community opinions read from Reddit posts, YouTube videos and the player's own notes, not facts: say how many sources back a view, where people disagree, and link the sources.";
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
