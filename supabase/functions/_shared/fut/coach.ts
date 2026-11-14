// Coins plan (Jeff, 2026-11-14): "what should I do with my coins right now for my squad". One ordered answer that joins
// the FUT tools instead of making the user visit each one: the coins the helper saw (My Account), what is waiting on the
// transfer list, the cards nobody plays (Sell or Keep, counting the squad they really play), the best upgrade for that
// squad with the coins they'd have (Upgrade path), the open SBCs (SBC Solver), the week's market rhythm and the best
// flip for whatever is left (Daily Strategy). Advice only: nothing is bought, sold or listed.
import { activeRules, FutError, type FutDb } from "./service.ts";
import { currentSquad, type CurrentSquad } from "./current-squad.ts";
import { sellOrKeep, type Advice } from "./sell-keep.ts";
import { upgradeOptions } from "./upgrades-data.ts";
import type { Plan } from "./upgrades.ts";
import { dailyStrategy, type CoinMove, type PileFix, type Timing } from "./strategy.ts";
import { evaluate } from "./squad-suggest.ts";

type Row = Record<string, unknown>;
type Platform = "console" | "pc";
export const EA_TAX = 0.05;
const afterTax = (v: number) => Math.floor(v * (1 - EA_TAX));
const c = (n: number) => Math.round(n).toLocaleString("en-US");
/** Below this upgrade score a swap isn't worth spending on (about one team-rating point or a few chemistry). */
export const MIN_GAIN = 4;

export type StepKind = "collect" | "relist" | "sell" | "swap" | "upgrade" | "save" | "sbc" | "flip" | "hold" | "setup";
export interface CoachStep {
  kind: StepKind; title: string; detail: string;
  /** Coins this step brings in (positive) or spends (negative); null when it doesn't move coins or isn't known. */
  coins: number | null;
  /** The FUT page that does this step in full. */
  link: { to: string; label: string } | null;
  items?: { name: string; rating: number | null; coins: number | null; note: string; card_id?: string | null }[];
}

export interface CoachInput {
  coins: number | null; coins_at: string | null;
  squad: Pick<CurrentSquad, "source" | "note"> & { name: string | null; formation: string | null; rating: number | null; chemistry: number | null };
  /** Sold items waiting on the transfer list (coins after tax) and stuck items to relist. */
  sold: { count: number; coins: number };
  pile: PileFix[];
  /** Every tradeable club card's verdict (Sell or Keep). */
  advice: Advice[];
  /** The upgrade search for the coins available after collecting and selling. */
  upgrades: { best: Plan | null; singles: Plan[]; pairs: Plan[]; free: Plan[] } | null;
  timing: Pick<Timing, "now" | "next" | "buy_bias" | "sell_bias" | "events" | "weekday" | "uk_time">;
  /** Daily Strategy's single best way to make coins right now, and its buy list (for the leftover). */
  move: CoinMove | null;
  flips: { name: string; rating: number; buy_at: number; sell_at: number; profit: number; ea_item_id: number }[];
  sbc: { open: number; ending: { name: string; end_at: string }[]; seen_at: string | null };
  prices_at: string | null;
}

/** The whole plan from what the tools already know. Pure. */
export function buildCoachPlan(x: CoachInput) {
  const steps: CoachStep[] = [];
  const coins = x.coins ?? 0;
  const sellNow = x.advice.filter((a) => a.verdict === "sell_now" || a.verdict === "sell_high");
  const sellSteady = x.advice.filter((a) => a.verdict === "sell");
  const sellNowCoins = sellNow.reduce((n, a) => n + (a.after_tax ?? 0), 0);
  const steadyCoins = sellSteady.reduce((n, a) => n + (a.after_tax ?? 0), 0);
  const fodder = x.advice.filter((a) => a.verdict === "hold_fodder");
  const waiting = x.advice.filter((a) => a.verdict === "wait");
  const cashNow = coins + x.sold.coins;
  const available = cashNow + sellNowCoins + steadyCoins;

  const best = x.upgrades?.best && x.upgrades.best.gain >= MIN_GAIN ? x.upgrades.best : null;
  const freeSwap = x.upgrades?.free.find((p) => p.gain >= 1) ?? null;
  // Which of the sells the upgrade needs: the falling/near-high ones first, the steady ones only when they're needed.
  const upgradeCost = best?.net_cost ?? 0;
  const needSteady = best ? Math.max(0, upgradeCost - cashNow - sellNowCoins) : 0;
  const steadyToSell: Advice[] = [];
  let raised = 0;
  for (const a of sellSteady) { if (raised >= needSteady) break; steadyToSell.push(a); raised += a.after_tax ?? 0; }
  const badTimeToBuy = x.timing.buy_bias < 0;
  const goodTimeToSell = x.timing.sell_bias > 0;

  if (x.coins === null) steps.push({
    kind: "setup", title: "Let GafferBot see your coins", coins: null, link: { to: "/fut/account", label: "My Account" },
    detail: "Open the EA Web App with the XI Lab helper running. Until then this plan assumes 0 coins and only counts what you can raise by selling.",
  });

  // 1. Coins already earned
  if (x.sold.count) steps.push({
    kind: "collect", title: `Collect ${c(x.sold.coins)} coins from ${x.sold.count} sold item${x.sold.count === 1 ? "" : "s"}`, coins: x.sold.coins,
    detail: "Clear sold items on your transfer list: the coins aren't yours to spend until you do.", link: { to: "/fut/account", label: "Transfer list" },
  });
  const relist = x.pile.filter((p) => p.action !== "clear");
  if (relist.length) steps.push({
    kind: "relist", title: `Relist ${relist.length} stuck item${relist.length === 1 ? "" : "s"} at today's price`, coins: null,
    detail: "Coins sitting in unsold cards can't buy upgrades.", link: { to: "/fut/strategy", label: "Daily Strategy" },
    items: relist.slice(0, 5).map((p) => ({ name: p.name, rating: p.rating, coins: p.list_at, note: p.why })),
  });

  // 2. Cards nobody plays
  const toSell = [...sellNow, ...steadyToSell];
  if (toSell.length) {
    const total = toSell.reduce((n, a) => n + (a.after_tax ?? 0), 0);
    steps.push({
      kind: "sell", title: `Sell ${toSell.length} card${toSell.length === 1 ? "" : "s"} you don't play for about ${c(total)} coins`, coins: total,
      detail: [
        sellNow.length ? `${sellNow.length === toSell.length ? (toSell.length === 1 ? "It's" : "They're") : `${sellNow.length} of them ${sellNow.length === 1 ? "is" : "are"}`} falling or near ${sellNow.length === 1 ? "its" : "their"} two-week high, so ${goodTimeToSell ? "now is a good time" : "don't wait long"}.` : "",
        steadyToSell.length ? `${steadyToSell.length === toSell.length ? (toSell.length === 1 ? "It's" : "They're") : `${steadyToSell.length} ${steadyToSell.length === 1 ? "is" : "are"}`} steady in price and only sold to fund the upgrade below.` : "",
        "None of them start in the squad you play.",
      ].filter(Boolean).join(" "),
      link: { to: "/fut/sell", label: "Sell or Keep" },
      items: toSell.slice(0, 8).map((a) => ({ name: a.name, rating: a.rating, coins: a.after_tax, note: a.reason, card_id: a.id })),
    });
  }

  // 3. Free improvements from the club
  if (freeSwap && (!best || !best.swaps.some((s) => s.cost === 0 && freeSwap.swaps.some((f) => f.in.id === s.in.id)))) {
    const s = freeSwap.swaps[0]!;
    steps.push({
      kind: "swap", title: `Free upgrade: start ${s.in.name} (${s.in.rating ?? "?"}) instead of ${s.out.name ?? "nobody"} at ${s.position}`, coins: 0,
      detail: `It's already in your club. Team rating ${freeSwap.rating_before} to ${freeSwap.rating_after}, chemistry ${freeSwap.chem_before} to ${freeSwap.chem_after}.`,
      link: { to: "/fut/squads", label: "Squad Builder" },
    });
  }

  // 4. The upgrade
  if (best) {
    const buys = best.swaps.filter((s) => s.cost > 0);
    const outSell = best.swaps.reduce((n, s) => n + (s.out.sells_for ?? 0), 0);
    const when = badTimeToBuy ? ` ${x.timing.weekday} is usually an expensive time to buy. If it can wait: ${x.timing.next ?? "buy when prices dip."}` : "";
    steps.push({
      kind: "upgrade",
      title: buys.length
        ? `Buy ${buys.map((s) => `${s.in.name} (${s.in.rating ?? "?"}) for ${s.position}`).join(" and ")} for about ${c(best.cost)} coins`
        : `Start ${best.swaps.map((s) => s.in.name).join(" and ")}`,
      coins: -best.cost,
      detail: [
        `Team rating ${best.rating_before} to ${best.rating_after}, chemistry ${best.chem_before} to ${best.chem_after}${best.meta_gain ? `, ${best.meta_gain > 0 ? "+" : ""}${Math.round(best.meta_gain)} metarating` : ""}.`,
        best.swaps.map((s) => `${s.in.name} replaces ${s.out.name ?? "an empty spot"}${s.out.sells_for ? ` (sell them for about ${c(s.out.sells_for)})` : ""}.`).join(" "),
        outSell ? `After selling who they replace it costs you about ${c(best.net_cost)}.` : "",
        when,
      ].filter(Boolean).join(" "),
      link: { to: "/fut/squads", label: "Squad Builder" },
      items: best.swaps.map((s) => ({ name: s.in.name, rating: s.in.rating, coins: s.cost, note: `${s.position}: replaces ${s.out.name ?? "nobody"}`, card_id: s.in.owned ? null : s.in.id })),
    });
  } else if (x.upgrades && x.squad.source !== "none") {
    const dream = x.upgrades.singles[0];
    steps.push({
      kind: "save", title: available > 0 ? `No upgrade worth buying with ${c(available)} coins yet` : "Raise coins before upgrading",
      coins: null,
      detail: dream ? `The nearest one, ${dream.swaps[0]!.in.name}, barely moves your team.` : "Every card that would improve your squad costs more than you'd have. Grow your coins with the flip below, then check back.",
      link: { to: "/fut/squads", label: "Squad Builder" },
    });
  }

  // 5. SBCs
  if (x.sbc.open) {
    const soon = x.sbc.ending[0];
    steps.push({
      kind: "sbc", title: `${x.sbc.open} SBC${x.sbc.open === 1 ? "" : "s"} open: check which are worth doing with your club`, coins: null,
      detail: [
        fodder.length ? `You're holding ${fodder.length} card${fodder.length === 1 ? "" : "s"} as SBC fodder (cheaper to use than to sell).` : "",
        soon ? `${soon.name} ends ${soon.end_at.slice(0, 10)}.` : "",
        "SBC Solver fills each one from your club and says whether the reward beats the cost.",
      ].filter(Boolean).join(" "),
      link: { to: "/fut/sbc", label: "SBC Solver" },
    });
  }

  // 6. Whatever is left: make it grow
  const left = Math.max(0, cashNow + sellNowCoins + raised - (best?.net_cost ?? 0));
  const flip = x.flips.find((f) => f.buy_at <= left);
  if (flip) steps.push({
    kind: "flip", title: `With the ${c(left)} left: buy ${flip.name} (${flip.rating}) at ${c(flip.buy_at)}, list at ${c(flip.sell_at)}`, coins: flip.profit,
    detail: `Daily Strategy's best flip you can afford: about ${c(flip.profit)} profit after tax if it sells.${badTimeToBuy ? " Prices often dip later, so wait for the dip if you can." : ""}`,
    link: { to: "/fut/strategy", label: "Daily Strategy" },
  });
  else if (!best && x.move && x.move.kind !== "wait") steps.push({
    kind: "flip", title: x.move.title, coins: x.move.coins, detail: x.move.detail, link: { to: "/fut/strategy", label: "Daily Strategy" },
  });
  else if (!steps.some((s) => s.kind === "upgrade" || s.kind === "flip")) steps.push({
    kind: "hold", title: "Hold your coins for now", coins: null, link: { to: "/fut/strategy", label: "Daily Strategy" },
    detail: x.move?.detail ?? "Nothing is cheap enough to flip for a safe profit right now. Holding coins costs nothing; a bad buy does.",
  });

  // The one-line answer
  const upgradeStep = steps.find((s) => s.kind === "upgrade");
  const flipStep = steps.find((s) => s.kind === "flip");
  const sellStep = steps.find((s) => s.kind === "sell");
  let headline: { kind: StepKind; title: string; detail: string };
  if (x.squad.source === "none") headline = { kind: "setup", title: "Sync your club first", detail: x.squad.note };
  else if (upgradeStep) headline = {
    kind: "upgrade", title: `Upgrade your squad: ${upgradeStep.title.charAt(0).toLowerCase()}${upgradeStep.title.slice(1)}`,
    detail: `${best!.rating_before} to ${best!.rating_after} team rating.${sellStep && best!.net_cost > cashNow ? " Sell the cards you don't play first to afford it." : ""}${badTimeToBuy ? " Prices usually peak right now, so buy after the dip if you can wait." : ""}`,
  };
  else if (sellStep && !flipStep) headline = { kind: "sell", title: "Sell the cards you don't play and save up", detail: `${sellStep.title}. No upgrade is worth it yet.` };
  else if (flipStep) headline = { kind: "flip", title: "Grow your coins: no upgrade is worth buying yet", detail: flipStep.title };
  else headline = { kind: "hold", title: "Hold your coins", detail: "No upgrade is worth it and nothing is cheap enough to flip right now." };

  return {
    headline, steps,
    money: { coins: x.coins, coins_at: x.coins_at, sold: x.sold.coins, sell_now: sellNowCoins, sell_steady: steadyCoins, available, upgrade_cost: best?.net_cost ?? null, left },
    squad: x.squad,
    timing: x.timing,
    keep: { fodder: fodder.length, waiting: waiting.length },
    others: (x.upgrades?.pairs.length ? x.upgrades.pairs : x.upgrades?.singles ?? []).filter((p) => p !== best).slice(0, 4),
    prices_at: x.prices_at,
  };
}
export type CoachPlan = ReturnType<typeof buildCoachPlan> & { platform: Platform; notes: string[]; verified: false };

/** Starters of the squad the user plays in the EA Web App, by club card id (only a real capture, never a guess). */
export async function playingNow(db: FutDb, userId: string, known?: CurrentSquad): Promise<Map<string, string>> {
  const cur = known ?? await currentSquad(db, userId);
  if (cur.source !== "game" || !cur.squad) return new Map();
  return new Map(cur.squad.slots.flatMap((s) => (s.card ? [[s.card.id, "the squad you play"] as [string, string]] : [])));
}

const settle = async <T>(p: Promise<T>, what: string): Promise<T | null> => {
  try { return await p; } catch (e) { console.error(`[fut-api] coins plan ${what}:`, (e as Error).message); return null; }
};

export async function coachPlan(db: FutDb, userId: string, platform: Platform): Promise<CoachPlan> {
  const [stateRes, cur] = await Promise.all([
    db.from("account_state").select("balance,balance_at,tradepile,sbcs,sbcs_at").eq("user_id", userId).eq("platform", platform).maybeSingle(),
    currentSquad(db, userId),
  ]);
  if (stateRes.error) throw new FutError(`Your account is unavailable: ${stateRes.error.message}`, 500);
  const state = (stateRes.data ?? null) as Row | null;
  const n = Number((state?.balance as Row | null)?.coins);
  const coins = state?.balance && Number.isFinite(n) ? n : null;
  const pileRaw = (Array.isArray(state?.tradepile) ? state!.tradepile : []) as Row[];
  const soldItems = pileRaw.filter((i) => i.state === "sold");
  const sold = { count: soldItems.length, coins: soldItems.reduce((t, i) => t + afterTax(Number(i.current_bid ?? i.buy_now ?? 0) || 0), 0) };

  const [keep, strat] = await Promise.all([
    settle(sellOrKeep(db, userId, platform, undefined, () => playingNow(db, userId, cur)), "sell or keep"),
    settle(dailyStrategy(db, userId, platform), "daily strategy"),
  ]);
  const advice = keep?.advice ?? [];
  const sellable = advice.filter((a) => a.verdict === "sell_now" || a.verdict === "sell_high" || a.verdict === "sell").reduce((t, a) => t + (a.after_tax ?? 0), 0);
  const budget = Math.min(15_000_000, Math.max(0, (coins ?? 0) + sold.coins + sellable));
  const upgrades = cur.squad && cur.squad.slots.some((s) => s.card) ? await settle(upgradeOptions(db, userId, cur.squad, { budget, platform }), "upgrades") : null;

  let chemistry: number | null = null, rating: number | null = null;
  if (cur.squad) {
    try {
      const rules = await activeRules(db);
      chemistry = evaluate(cur.squad.formation, cur.squad.slots, cur.squad.manager, rules).total;
      const r = cur.squad.slots.flatMap((s) => (s.card ? [s.card.rating ?? 0] : []));
      rating = upgrades?.before.rating ?? (r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null);
    } catch (e) { console.error("[fut-api] coins plan chemistry:", (e as Error).message); }
  }

  const sets = (Array.isArray(state?.sbcs) ? state!.sbcs : []) as Row[];
  const open = sets.filter((s) => !(s.times_completed && !s.repeatable) && !(s.repeat_limit && Number(s.times_completed ?? 0) >= Number(s.repeat_limit)));
  const ending = open.filter((s) => typeof s.end_at === "string" && Date.parse(s.end_at as string) > Date.now())
    .sort((a, b) => String(a.end_at).localeCompare(String(b.end_at))).slice(0, 3).map((s) => ({ name: String(s.name ?? "SBC"), end_at: String(s.end_at) }));

  const plan = buildCoachPlan({
    coins, coins_at: (state?.balance_at as string | null) ?? null,
    squad: { source: cur.source, note: cur.note, name: cur.squad?.name ?? null, formation: cur.squad?.formation ?? null, rating, chemistry },
    sold, pile: strat?.transfer_list ?? [], advice,
    upgrades: upgrades ? { best: upgrades.best, singles: upgrades.singles, pairs: upgrades.pairs, free: upgrades.free } : null,
    timing: strat?.timing ?? { now: "", next: null, buy_bias: 0, sell_bias: 0, events: [], weekday: "", uk_time: "" },
    move: strat?.move ?? null,
    flips: (strat?.buys ?? []).map((b) => ({ name: b.name, rating: b.rating, buy_at: b.buy_at, sell_at: b.sell_at, profit: b.profit, ea_item_id: b.ea_item_id })),
    sbc: { open: open.length, ending, seen_at: (state?.sbcs_at as string | null) ?? null },
    prices_at: strat?.prices_at ?? keep?.prices_at ?? null,
  });
  const notes = [
    "Advice only. GafferBot never buys, sells or lists for you: do every trade yourself in the game.",
    "Prices are FUT.GG's lowest Buy Now estimates, not actual sales. Check the price in the game before you buy.",
    `Selling counts EA's ${Math.round(EA_TAX * 100)}% tax. Upgrades are scored on team rating, chemistry and how well each card plays its position (metarating).`,
  ];
  if (!keep) notes.push("Your sell list couldn't be read just now, so it isn't in this plan.");
  if (!strat) notes.push("Today's market plan couldn't be built just now, so flips and timing are missing.");
  return { platform, ...plan, notes, verified: false as const };
}
