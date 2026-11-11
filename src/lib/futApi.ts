import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import type { PlayerQuery } from "@/lib/futStats";

export const cardInputRules = z.object({
  overall: z.number().int().min(1).max(99),
  skill_moves: z.number().int().min(1).max(5),
  weak_foot: z.number().int().min(1).max(5),
});
export const compareCardRules = z.array(z.string()).min(2).max(4);
export const optimizerRules = z.object({ max_swaps: z.number().int().min(1).max(4) });
export const squadBudgetRules = z.number().finite().int().min(0);
export const cardLimitRules = z.number().int().min(1).max(100);
export const CARD_LIST_LIMIT = "100";
export function squadBudget(value: string | number | null | undefined): number {
  const amount = value == null || value === "" ? 0 : Number(value);
  if (!squadBudgetRules.safeParse(amount).success) throw new Error("Budget must be a whole number of coins, 0 or more.");
  return amount;
}
function withBudget(squad: FutSquad): FutSquad { return { ...squad, budget: squadBudget(squad.budget) }; }

export type Evidence = "game_data" | "estimate" | "hypothesis" | "verified";
export type Stats = { pac: number; sho: number; pas: number; dri: number; def: number; phy: number };
export interface FutCard {
  id: string; player_name: string; version?: string; overall: number; positions: string[];
  club: string; league: string; nation: string; is_icon: boolean; is_hero: boolean;
  skill_moves: number; weak_foot: number; stats: Stats; playstyles: string[]; playstyles_plus: string[];
  evidence: Evidence; notes: string; owned: boolean; tradeable: boolean;
  purchase_price?: number | null; price?: number | null; source?: string; updated_at?: string;
  /** EA's item id, for cards from EA's feed or the market card list (lets the card show its player's face). */
  ea_item_id?: number | null;
}
export interface FutManager { id: string; name: string; nation: string; league: string; price?: number | null; owned?: boolean }
export interface SlotCard {
  id: string; name: string; rating: number; positions: string[]; club: string; league: string;
  nation: string; is_icon: boolean; is_hero: boolean; price?: number | null; owned: boolean;
  stats: Stats; evidence?: Evidence;
}
export interface FutSlot { slot: string; position: string; card: SlotCard | null; locked: boolean }
export interface FutSquad {
  id?: string; owner_id?: string; name: string; formation: string; manager: FutManager | null;
  budget?: number | null; parent_id?: string | null; created_at?: string; updated_at?: string; slots: FutSlot[];
}
export interface RuleInfo { rule_version?: string; rule_status?: string; evidence?: string }
/** EA player faces and base card backgrounds: only when the server's FUT_EA_IMAGES switch is on. They load straight from EA. */
export interface CardImages { faces: boolean; portrait_base: string | null; background_base?: string | null; credit: string | null }
export interface CardArtSeen { url: string; first_seen_at: string; last_seen_at: string; sightings: number }
export interface FutHealth extends RuleInfo { ok?: boolean; api?: string; card_images?: CardImages }
export type LinkType = "club" | "league" | "nation";
export interface LinkBreakdown { key: string | null; count: number; points: number; next_threshold: number | null; needed_for_next: number | null }
export interface PlayerChemistry {
  slot: string; card_id?: string; name: string; chemistry: number; in_position?: boolean; links?: Record<LinkType, number>;
  manager_bonus?: number; breakdown?: Record<LinkType, LinkBreakdown>; notes?: string[];
}
export interface Chemistry extends RuleInfo {
  chemistry: { total: number; players: PlayerChemistry[] };
  fit: { slots: unknown; average: number; evidence: "estimate" };
}
export interface SwapPreview extends RuleInfo {
  total_before: number; total_after: number; diff: { changes: Record<string, unknown>[] };
}
export interface Optimization extends RuleInfo {
  status: "already_met" | "solutions" | "infeasible";
  solutions: { swaps: unknown[]; cost: number | Record<string, unknown>; total_before: number; total_after: number;
    explanation: string[]; buy: unknown[]; squad: FutSquad }[];
  rejected: unknown[]; blockers: unknown[];
}
export interface Comparison extends RuleInfo { rows: unknown[]; verdict?: string[] }
export interface Formation { id: string; name: string }
export interface FormationSlot { slot: string; position: string; row: number }
export interface ClubImportResult {
  added: number; updated: number; managers_added: number; over_limit: number;
  skipped: { reason: string; count: number }[]; verified: false; note: string; prices_linked?: number;
}
export interface SquadImportEntry { slot?: string | null; position?: string | null; name: string; rating?: number | null; version?: string | null }
export interface SquadImportOption { card: SlotCard; version: string | null; score: number }
export interface SquadImportRow { input: SquadImportEntry; slot: string | null; card: SlotCard | null; version: string | null; confidence: "sure" | "likely" | "check" | "missing"; options: SquadImportOption[]; reason?: string }
export interface SquadImportResult { squad: FutSquad; rows: SquadImportRow[]; formation_changed: string | null; cleared: string[]; via: "list" | "ai"; note: string | null }
export type SuggestBy = "ovr" | "chem";
export interface BestSquad { formation: string; squad: FutSquad; chemistry: number; rating: number; filled: number; empty: string[] }
export interface UpgradeSwap { slot: string; position: string; cost: number; out: { id: string | null; name: string | null; rating: number | null; meta: number | null; sells_for: number | null }; in: { id: string; name: string; rating: number | null; owned: boolean; meta: number | null; card: SlotCard } }
export interface UpgradePlan { swaps: UpgradeSwap[]; cost: number; net_cost: number; rating_before: number; rating_after: number; chem_before: number; chem_after: number; meta_gain: number | null; gain: number; per_10k: number | null }
export interface UpgradePath { platform: "console" | "pc"; candidates: number; before: { rating: number; chem: number }; budget: number; best: UpgradePlan | null; singles: UpgradePlan[]; pairs: UpgradePlan[]; free: UpgradePlan[]; note: string; verified: false }
export interface ClubShare { platform: "console" | "pc"; share_pulls: boolean; share_board: boolean; min_pull_rating: number }
export interface BestSquadResult { by: SuggestBy; owned_cards: number; results: BestSquad[] }
export interface SlotSuggestion { card: SlotCard; team_chemistry: number; chemistry: number; change: number }
export interface SlotSuggestions { slot: string; position: string; before: number; suggestions: SlotSuggestion[] }
export interface CardRole { position: string; role: string; level: "plus" | "plusplus" }
export type SquadRoles = Record<string, { position: string; roles: CardRole[] }>;
export interface SquadImportImage { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string }
export class FutApiError extends Error {
  constructor(message: string, public status?: number) { super(message); this.name = "FutApiError"; }
}

export async function futRequest<T>(path: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`fut-api/v1${path}`, { method, ...(body === undefined ? {} : { body }) });
  if (error) {
    const response = (error as { context?: Response }).context;
    let message = error.message;
    if (response && typeof response.clone === "function") {
      const payload = await response.clone().json().catch(() => null);
      if (typeof payload?.error === "string") message = payload.error;
    }
    throw new FutApiError(message, response?.status);
  }
  if (data?.error) throw new FutApiError(data.error);
  // Most routes answer { data }; /health answers { ok, api } on its own. React Query rejects undefined, so never return it.
  if (data && typeof data === "object" && "data" in data) return (data as { data: T }).data;
  return (data ?? null) as T;
}
export const futKeys = { formationSlots: ["fut", "formations", "slots"] as const, account: ["fut", "account"] as const, sbc: ["fut", "sbc"] as const, evolutions: ["fut", "evolutions"] as const, calendar: ["fut", "calendar"] as const, fodder: ["fut", "fodder"] as const, clubShare: ["fut", "club-share"] as const, trades: ["fut", "trades"] as const, sellKeep: ["fut", "sell-keep"] as const, champs: ["fut", "champs"] as const, meta: ["fut", "meta"] as const, packs: ["fut", "packs"] as const, knowledge: ["fut", "knowledge"] as const, strategy: ["fut", "strategy"] as const, market: ["fut", "market"] as const, all: ["fut"] as const, health: ["fut", "health"] as const, squads: ["fut", "squads"] as const, cards: ["fut", "cards"] as const, managers: ["fut", "managers"] as const };

export type MarketPlatform = "console" | "pc";

// Daily strategy (GET /strategy): advice only, GafferBot never trades.
export type StrategyRisk = "careful" | "normal" | "bold";
export interface StrategyBuy { ea_item_id: number; name: string; version: string | null; rating: number; position: string | null; kind: string; price: number; buy_at: number; sell_at: number; profit: number; roi: number; quantity: number | null; spend: number | null; total_profit: number | null; median: number; low: number; high: number; change_24h: number | null; points: number; confidence: "low" | "medium" | "high"; hold: string; why: string[]; risks: string[]; target_raw?: number; p_hit?: number | null }
export interface StrategySell { card_id: string; ea_item_id: number; name: string; version: string | null; rating: number | null; position: string | null; quantity: number; list_at: number; quick_at: number; after_tax: number; median: number | null; high: number | null; change_24h: number | null; reason: string; why: string; in_squad: boolean }
export interface StrategyPileFix { ea_item_id: number; name: string; rating: number | null; state: string; buy_now: number | null; price: number | null; action: "clear" | "relist" | "lower"; list_at: number | null; why: string }
export interface StrategyRecordItem { plan_date: string; name: string; buy_at: number; sell_at: number; best: number | null; now: number | null; outcome: "hit" | "open_up" | "open_down" | "too_soon" | "unknown"; now_pct: number | null }
export interface DailyStrategy {
  platform: MarketPlatform; as_of: string; uk_date: string; prices_at: string | null; headline: string; stance: "buy" | "sell" | "flip";
  mood: { label: string; median_24h: number | null; median_72h: number | null; cards: number };
  timing: { uk_time: string; weekday: string; buy_bias: number; sell_bias: number; extra_reserve: number; now: string; next: string | null; events: { name: string; date: string; days: number; advice: string }[]; daily: string };
  budget: { coins: number | null; coins_source: "helper" | "entered" | null; coins_at: string | null; reserve_pct: number; reserve: number | null; spend: number | null; per_pick: number | null; buy_spend: number; expected_profit: number; free_slots: number; risk: StrategyRisk };
  steps: string[]; buys: StrategyBuy[]; watch: StrategyBuy[]; sells: StrategySell[]; transfer_list: StrategyPileFix[];
  record: { days: number; picks: number; hit: number; open_up: number; open_down: number; avg_now_pct: number | null; items: StrategyRecordItem[] };
  learning?: {
    ready: boolean; updated_at: string | null; buy_picks: number; buy_hit_rate: number | null; hours_to_hit: number | null; target_reach: number;
    sell_calls: number; sell_right_rate: number | null; lessons: string[];
    followed: { trades: number; sold: number; profit: number; items: { plan_date: string; ea_item_id: number; name: string; bought_for: number; sold_for: number | null; profit: number | null; target: number }[] };
  };
  notes: string[]; verified: false;
}
export type MarketEvidence = Evidence | "verified";
export type MarketStatus = "favorable_setup" | "research_further" | "watch" | "overheated" | "elevated_risk" | "insufficient_evidence";
export interface MarketProvenance { rules_version: string; engine_version: string; as_of: string; demo: boolean; sources: unknown; evidence: MarketEvidence }
export type MarketFreshnessStatus = "fresh" | "stale" | "missing";
export interface MarketBestFit { position: string; profile: string; score: number | null }
export interface MarketFreshness { status: string; latest_observed_at?: string | null; age_hours?: number | null; stale_after_hours?: number | null; message?: string }
export interface MarketRegime { primary: string; flags: { regime: string; because: string | string[] }[]; observations: string[]; not_evaluable: { regime: string; reason: string }[]; strategy_notes: string[] }
export interface MarketMover { card_id: string; name: string; rating: number; change_24h: number | null; vs_market_pp: number | null; latest_observed_at: string | null }
export interface MarketOverview { platform: MarketPlatform; indexes: { basket_id: string; label: string; description: string; value: number | null; changes: Record<string, number | null>; volatility_24h: number | null; trend: string; constituents_now: number; distribution: unknown }[]; index_history: Record<string, { t: string; value: number | null }[]>; regime: MarketRegime; relative_strength_leaders: MarketMover[]; largest_declines: MarketMover[]; coverage: { cards: number; fresh: number; stale: number; missing: number }; notes: string[]; provenance: MarketProvenance }
export interface MarketOpportunity { card_id: string; name: string; rating: number; category: string; platform: MarketPlatform; latest_price: number | null; latest_observed_at: string | null; freshness: MarketFreshnessStatus; status: MarketStatus; categories: string[]; reasons: string[]; could_be_wrong: string[]; change_24h: number | null; change_72h: number | null; vs_market_24h_pp: number | null }
export interface MarketOpportunities { regime: MarketRegime; items: MarketOpportunity[]; total: number; offset?: number; categories?: string[]; provenance: MarketProvenance }
export interface MarketComparable { card_id: string; name: string; rating: number; positions: string[]; best_fit: MarketBestFit | null; latest_price: number | null; freshness: MarketFreshnessStatus; change_24h: number | null; price_vs_subject: number | null }
export interface MarketCardIntel {
 card: { id: string; name: string; rating: number; positions: string[]; club: string; league: string; nation: string; category: string; version: string };
 utility: { gameplay: { by_position: { position: string; profile: string; score: number | null }[]; best: MarketBestFit | null; versatility: number | null; evidence: MarketEvidence; basis: unknown }; unavailable: { model: string; reason: string }[] };
 price: { latest: number | null; freshness: MarketFreshness; history: { t: string; price: number | null }[]; sources: unknown };
 relative_strength: { benchmark: string; label: string; peers: number; cells: { window: string; card: number | null; benchmark: number | null; diff_pp: number | null; verdict: string }[] }[];
 momentum: { changes: Record<string, number | null>; sma_6h: number | null; sma_24h: number | null; short_above_long: boolean | null; breakout: string | null; structure: string | null; acceleration: string | null; volatility_24h: number | null; vol_adjusted_24h: number | null; max_drawdown_7d: number | null };
 mean_reversion: { z_7d: number | null; range_position_7d: number | null; low_7d: number | null; high_7d: number | null; peer_price_ratio: number | null; peer_count: number; pattern: string | null; unusually_low: boolean | null };
 assessment: { status: MarketStatus; categories: string[]; reasons: string[]; could_be_wrong: string[]; entry_risk: { elevated: boolean; change_72h: number | null; note: string }; evidence: MarketEvidence };
 regime: MarketRegime; comparables: MarketComparable[]; watch: MarketWatchItem | null; catalysts: { items: unknown[]; note: string }; community: { note: string }; provenance: MarketProvenance;
}
export interface MarketRelativeItem { card_id: string; name: string; rating: number; best_fit: MarketBestFit | null; versatility: number | null; latest_price: number | null; freshness: MarketFreshnessStatus; coins_per_fit_point: number | null }
export interface MarketRelativeValue { subject: MarketRelativeItem; others: MarketRelativeItem[]; note: string; provenance: MarketProvenance }
export interface MarketThesisInput { card_id: string; platform: MarketPlatform; buy_price: number; target_price: number; downside_price: number; quantity?: number }
export interface MarketThesis { investment: number | null; tax_at_target: number | null; tax_at_downside: number | null; break_even_price: number | null; profit_at_target: number | null; loss_at_downside: number | null; return_at_target_pct: number | null; return_at_downside_pct: number | null; risk_reward: number | null; break_even_win_rate: number | null; price_checks: { field: string; price: number; valid: boolean; nearest_valid: number | null }[]; market: { latest_price: number | null; freshness: MarketFreshness; buy_vs_latest_pct: number | null }; warnings: string[]; limitations: string[]; evidence: MarketEvidence }
export interface MarketSquadComparison { summary: string; options: unknown[]; already_in_squad: string | null; owned: boolean; cost: unknown; skipped_locked: unknown; no_eligible_slot: boolean; rule_version: string; evidence: MarketEvidence }
export interface MarketWatchItem { card_id: string; name: string; platform: MarketPlatform; added_at: string; note: string | null; target_buy: number | null; target_sell: number | null; price_at_add: number | null; latest_price: number | null; freshness: MarketFreshnessStatus; status: MarketStatus; since_added_pct: number | null; at_target_buy: boolean; at_target_sell: boolean; reasons?: string[]; could_be_wrong?: string[] }
export interface MarketWatchlist { items: MarketWatchItem[]; note: string }
export interface MarketImportResult { accepted: number; inserted: number; skipped: number; duplicates: number; rejected: { line: number; reason: string }[]; held: number; linked_from_held: number; still_held: number; shared_with_community?: number }
export interface HelperStatus { connected: boolean; key_hint: string | null; created_at: string | null; last_used_at: string | null; key?: string }
export interface Fc27FeedStatus { feed_updated: string | null; hours_old: number | null; cards: number; last_run: { at: string; status: string; message: string } | null; note: string }
export interface MarketEaReference { label: string; evidence: MarketEvidence; market_average: number | null; observed_at: string | null; history: { observed_at: string; market_average: number }[]; recent_sales: { price: number; seen_at: string }[]; note: string }
export interface FutggFeedStatus {
  enabled: boolean; schedule: string; note: string;
  last_run: { finished_at: string; status: string; message: string } | null;
  platforms: { platform: MarketPlatform; published_at: string | null; received_at: string | null; checked_at: string | null; card_count: number; market_price_count: number; age_hours: number | null; overdue: boolean }[];
}
export interface MarketCatalogueCard { id: string; player_name: string; version: string | null; overall: number; position: string; club: string | null; league: string | null; nation: string | null; is_icon: boolean; is_hero: boolean; market_tracked: boolean; ea_item_id: number; price: number; previous_price: number | null; change_pct: number | null }
export interface MarketCatalogue { platform: MarketPlatform; published_at: string | null; previous_published_at: string | null; catalogue_cards: number; total: number; cards: MarketCatalogueCard[] }
export interface MarketSharing { sharing: boolean; since: string | null; your_contributions: number; deleted?: number }
export interface CommunityPull { sharers: number; your_cards_with_ea_id: number; cards_with_community_prices: number; observations: number; max_contributors: number; import: MarketImportResult | null; note: string }
export interface Fc27MarketPull { updated: string | null; hours_old: number | null; your_cards_with_ea_id: number; matched: number; observations: number; import: MarketImportResult | null; note: string }
export interface MarketHeld { items: { ea_item_id: string | number; asset_id: string | number; rating: number; details: { rare_flag?: number; team_id?: number; league_id?: number; nation_id?: number; position?: string } | null; special_version: boolean | null; observations: number; platforms: string[]; latest_price: number | null; latest_platform: string; latest_observed_at: string | null; reason: string }[]; total_observations: number; evidence: MarketEvidence; note: string }
export interface MarketSource { id: string; name: string; kind: string; status: "enabled" | "disabled" | "not_authorized"; is_demo: boolean; status_note: string; permissions: Record<string, boolean | null>; evidence: MarketEvidence }
export type PackVerdict = "buy" | "only_for_fodder" | "skip" | "points_only" | "no_odds" | "no_prices";
export interface PackOddsLine { label: string; odds_text: string; probability: number | null; covers: string | null; value_low: number | null; value_high: number | null; used: boolean; note?: string }
export interface PackAdviceItem {
  pack_id: number; name: string; named: boolean; image_url: string | null; quality: "gold" | "silver" | "bronze" | "mixed";
  description: string | null; coins: number | null; points: number | null; untradeable: boolean; is_player_pick: boolean;
  item_count: number | null; rare: number | null; end_at: string | null; start_at: string | null; unopened: boolean;
  ev_low: number | null; ev_high: number | null; ev_after_tax: number | null; value_per_100_points: number | null;
  verdict: PackVerdict; ratio: number | null; why: string; lines: PackOddsLine[]; notes: string[]; fodder_each: number | null; fodder_items: number;
  trend_pct: number | null; tips: string[]; history: { t: string; value: number }[];
}
export interface PackOpening { pack_id: number | null; pack_name: string; pack_coins: number | null; opened_at: string; items: number; tradeable_value: number; untradeable_value: number; after_tax: number; profit: number | null; best: { ea_item_id: number; rating: number | null; price: number | null } | null }
/** A store-like answer the helper saw (address with ids as N, top-level field names) and how much it could read. */
export interface PackStoreSeen { path: string; keys: string[]; packs: number; odds: number; at: string | null }
export interface PackAdvice {
  platform: MarketPlatform; captured_at: string | null; prices_at: string | null; shape: { pack_keys?: string[]; odds_keys?: string[]; category_keys?: string[]; seen?: PackStoreSeen[]; seen_at?: string } | null;
  /** Stored packs left out because they aren't live in the store now (ended, not started, gone from the latest list). */
  hidden?: number;
  packs: PackAdviceItem[]; pulls: { items: number; opens: PackOpening[] }; model: string[]; verified: false;
}
export type AccountTradeState = "listed" | "sold" | "expired" | "unlisted" | "winning" | "outbid" | "won" | "lost" | "watching";
export interface AccountItem { item_id: number; ea_item_id: number; item_type: string | null; rating: number | null; untradeable: boolean; name: string; version: string | null; position: string | null; price: number | null }
export interface AccountTrade extends AccountItem { trade_id: string | null; state: AccountTradeState; buy_now: number | null; current_bid: number | null; starting_bid: number | null; expires_at: string | null }
export interface AccountSbc { set_id: number; name: string; category: string | null; description: string | null; challenges: number | null; completed: number | null; times_completed: number | null; repeat_limit: number | null; repeatable: boolean; end_at: string | null; awards: { type: string; value: number | null; count: number | null; untradeable: boolean }[] }
export interface AccountObjective { id: number | null; name: string; group: string | null; progress: number | null; target: number | null; done: boolean; end_at: string | null; xp: number | null }
export type AccountSection = "balance" | "profile" | "tradepile" | "watchlist" | "unassigned" | "sbcs" | "sbc_challenges" | "evolutions" | "objectives" | "season";
export interface AccountOverview {
  platform: MarketPlatform; connected: boolean; updated_at: string | null; prices_at: string | null; seen: Record<AccountSection, string | null>;
  balance: { coins: number | null; points: number | null; draft_tokens: number | null; currencies: { name: string; funds: number }[] } | null;
  profile: { persona_name: string | null; club_name: string | null; club_abbr: string | null; established: string | null; won: number | null; lost: number | null; draw: number | null; trophies: number | null; division_online: number | null; division_offline: number | null; unopened_packs: number | null; unassigned_count: number | null; tradepile_max: number | null; watchlist_max: number | null } | null;
  history: { t: string; coins: number | null; points: number | null; draft_tokens: number | null }[];
  tradepile: { summary: { total: number; max: number | null; listed: number; sold: number; expired: number; unlisted: number; sold_for: number; sold_after_tax: number; listed_buy_now: number; listed_after_tax: number; idle_market_value: number; overpriced: number }; items: AccountTrade[] } | null;
  watchlist: { summary: { total: number; winning: number; outbid: number; won: number; lost: number; coins_in_bids: number }; items: AccountTrade[] } | null;
  unassigned: { total: number; duplicates: number; tradeable_value: number; items: (AccountItem & { duplicate: boolean })[] } | null;
  sbcs: { total: number; open: number; items: AccountSbc[] } | null;
  objectives: { total: number; done: number; xp_left: number; items: AccountObjective[] } | null;
  season: Record<string, number> | null; tips: string[]; shape: Record<string, string[]> | null; verified: false;
}
export type SbcOp = "min" | "max" | "exact";
export type SbcGroup = "league" | "nation" | "club";
export type SbcRequirement =
  | { kind: "players" | "team_rating" | "chemistry" | "player_chemistry"; op: SbcOp; value: number }
  | { kind: "rating"; op: SbcOp; value: number; count?: number }
  | { kind: "quality"; op: SbcOp; value: "bronze" | "silver" | "gold"; count?: number }
  | { kind: "rarity"; op: SbcOp; value: "common" | "rare" | "special" | "totw"; count: number }
  | { kind: "same" | "distinct"; of: SbcGroup; op: SbcOp; value: number }
  | { kind: "from"; of: SbcGroup | "any"; names: string[]; op: SbcOp; count: number };
export interface SbcChallengeSeen { set_id: number; challenge_id: number; name: string; description: string | null; status: string | null; formation: string | null; ea_formation: string | null; requirements: SbcRequirement[]; lines: string[]; unread: string[]; awards: AccountSbc["awards"] }
export interface SbcOverview { platform: MarketPlatform; sets_at: string | null; challenges_at: string | null; sets: (AccountSbc & { challenges_seen: SbcChallengeSeen[] })[]; other_challenges: SbcChallengeSeen[]; shape: { challenge: string[] | null; requirement: string[] | null }; formations: string[]; verified: false }
export interface SbcCard { id: string; name: string; rating: number; positions: string[]; league: string | null; nation: string | null; club: string | null; version: string | null; is_icon?: boolean; is_hero?: boolean; source: "owned" | "spare" | "buy"; untradeable: boolean; price: number | null; ea_item_id?: number | null }
export interface SbcCheck { label: string; ok: boolean; actual: number | string }
export interface SbcSolved { name: string; formation: string; feasible: boolean; slots: { slot: string; position: string; card: SbcCard | null }[]; checks: SbcCheck[]; team_rating: number; chemistry: number; buy_cost: number; tradeable_value: number; total_cost: number; counts: { spare: number; untradeable: number; tradeable: number; buy: number }; notes: string[] }
export type SbcWorthVerdict = "do_it" | "close" | "skip" | "unknown" | "free";
export interface SbcSolution { platform: MarketPlatform; prices_at: string | null; owned_cards: number; spare_duplicates: number; dropped_requirements: number; challenges: SbcSolved[]; total_cost: number; buy_cost: number; feasible: boolean; reward: { value: number | null; label: string | null }; worth: { verdict: SbcWorthVerdict; why: string }; verified: false }
export interface SbcSolveInput { platform: MarketPlatform; set_id?: number; reward?: number; challenges: { name: string; formation: string; requirements?: SbcRequirement[]; text?: string }[]; options: { use_tradeables: boolean; buy: boolean; protect_from: number | null; exclude?: string[] } }
export interface EvoCard { id: string; name: string; version: string | null; overall: number; positions: string[]; league: string | null; nation: string | null; club: string | null; is_icon?: boolean; is_hero?: boolean; stats: Partial<Record<"pac" | "sho" | "pas" | "dri" | "def" | "phy", number>>; skill_moves: number | null; weak_foot: number | null; playstyles: string[]; playstyles_plus: string[]; ea_item_id?: number | null; untradeable?: boolean }
export interface EvoMatch { card: EvoCard; after: EvoCard; checks: { label: string; ok: boolean | null }[]; eligible: boolean | null; squad: { slot: string | null; gain: number } }
export interface EvolutionView { id: string; name: string; description: string | null; end_at: string | null; coins: number | null; points: number | null; unread: string[]; source: "helper" | "pasted"; rule_lines: string[]; level_lines: string[][]; eligible: number; maybe: number; matches: EvoMatch[] }
export interface MetaRoleScore { position: string; role: string; score: number; tier: string; chem_style: string | null; base: number; bonuses: { playstyles: number; height: number; accelerate: number; weak_foot: number; skill_moves: number }; strengths: string[]; weaknesses: string[]; playstyles: string[] }
export type ChampsMode = "champs" | "rivals" | "squad_battles" | "other";
export interface ChampsSummary { games: number; w: number; d: number; l: number; win_rate: number | null; goals_for: number; goals_against: number; goal_diff: number; avg_for: number | null; avg_against: number | null; clean_sheets: number; extra_time: number; opponent_quits: number; form: string; best_win_streak: number; current_streak: string | null; by_formation: { formation: string; games: number; w: number; d: number; l: number; gf: number; ga: number; win_rate: number | null }[]; stages: { stage: string; games: number; win_rate: number | null }[]; target: { target: number; need: number | null; left: number | null; status: string; line: string } | null }
export interface ChampsGame { id: string; run_id: string; played_at: string; goals_for: number; goals_against: number; penalties: "won" | "lost" | null; extra_time: boolean; opponent_quit: boolean; opponent_formation: string | null; squad_name: string | null; notes: string | null; result: "W" | "D" | "L" }
export interface ChampsRun { id: string; platform: MarketPlatform; mode: ChampsMode; name: string; games_allowed: number | null; target_wins: number | null; started_at: string; finished_at: string | null; summary: ChampsSummary; recap: string; games: ChampsGame[] }
export interface ChampsOverview { platform: MarketPlatform; runs: ChampsRun[]; by_mode: (ChampsSummary & { mode: ChampsMode; label: string })[]; formations: string[]; note: string }
export interface CardCompare {
  platform: MarketPlatform; summary: string; note: string; verified: false; shared_positions: string[]; shared_playstyles: string[]; chem_styles: { outfield: string[]; gk: string[] };
  cards: { id: string; name: string; rating: number; version: string | null; positions: string[]; ea_item_id: number | null; owned: boolean; chem_style: string | null; price: number | null; playstyles: string[]; only_this: string[]; meta: MetaRoleScore | null; wins: number; price_per_rating: number | null; price_per_meta: number | null }[];
  rows: { key: string; label: string; group: string; values: (number | null)[]; leaders: number[] }[];
}
export interface MetaCardRating { card_id: string; name: string; rating: number; positions: string[]; best: MetaRoleScore | null; roles: MetaRoleScore[]; verdict: string; estimated: boolean; note: string; verified: false }
export interface MetaTop { platform: MarketPlatform; position: string; role: string | null; roles: string[]; max_price: number | null; published_at: string | null; with_stats: number; note: string; verified: false; cards: { card_id: string; ea_item_id: number | null; name: string; rating: number; version: string | null; position: string; owned: boolean; price: number | null; meta: MetaRoleScore }[] }
export interface FodderRating { rating: number; floor: number; cards: number; at: string; change_24h: number | null; change_7d: number | null; vs_week: number | null; low_30d: number; high_30d: number; signal: "spike" | "cheap" | "normal" | "new"; line: string; history: { t: string; value: number }[] }
export interface FodderIndexData { platform: MarketPlatform; days: number; headline: string; index: number | null; index_change_7d: number | null; index_history: { t: string; value: number }[]; ratings: FodderRating[]; note: string; verified: false }
export type CalendarVerdict = "sell_before" | "buy_before" | "no_pattern" | "not_enough_data";
export interface CalendarStats { band: string; weeks: number; median: number | null; falls: number; rises: number; verdict: CalendarVerdict; line: string }
export interface MarketCalendar { platform: MarketPlatform; days_of_prices: number; note: string; verified: false;
  upcoming: { key: string; label: string; at: string; uk: string; why: string; window_hours: number; headline: string; verdict: CalendarVerdict; bands: CalendarStats[] }[];
  crashes: { t: string; move: number; cards: number; uk_weekday: string; uk_date: string }[];
  card: { card_id: string; name: string | null; points: number; events: (CalendarStats & { key: string; label: string })[] } | null }
export interface PriceHistoryData { card_id: string; ea_item_id?: number; name?: string; platform: MarketPlatform; days: number; note: string; points: { t: string; price: number; kind: "full" | "hourly" }[]; market_drops: { t: string; median_move: number; cards: number }[]; stats: { latest: number | null; latest_at?: string; low: number | null; high: number | null; change_24h: number | null; change_7d: number | null; change_range: number | null; hourly_points: number } }
export type SellVerdict = "keep" | "keep_evo" | "hold_fodder" | "sell_now" | "sell_high" | "wait" | "sell" | "no_price";
export interface SellAdvice { id: string; name: string; rating: number; version: string | null; positions: string[]; ea_item_id: number | null; purchase_price: number | null; squads: string[]; evo: { name: string; gain: number } | null; floor: number | null; verdict: SellVerdict; reason: string; price: number | null; after_tax: number | null; change_3d: number | null; change_7d: number | null; profit: number | null }
export interface SellOrKeep { platform: MarketPlatform; prices_at: string | null; note: string; untradeable_skipped: number; verified: false; totals: { cards: number; counts: Record<SellVerdict, number>; sell_now_coins: number; sell_all_coins: number; keep_value: number; fodder_value: number }; advice: SellAdvice[] }
export interface TradeFlip { item_id: number; ea_item_id: number; name: string; rating: number | null; bought_for: number; sold_for: number; after_tax: number; profit: number; bought_at: string | null; sold_at: string; held_hours: number | null; roi: number }
export interface TradeOpen { item_id: number; ea_item_id: number; name: string; rating: number | null; bought_for: number; bought_at: string | null; listed_for: number | null; price: number | null; unrealised: number | null }
export interface TradeOverview {
  platform: MarketPlatform; prices_at: string | null; note: string; verified: false;
  totals: { flips: number; profit: number; week: number; month: number; win_rate: number | null; tax_paid: number; open: number; open_cost: number; unrealised: number | null; sales_without_buy: number; sales_without_buy_after_tax: number };
  best: TradeFlip[]; worst: TradeFlip[]; history: { t: string; value: number }[]; flips: TradeFlip[]; open: TradeOpen[];
  sales_without_buy: { item_id: number; ea_item_id: number; name: string; rating: number | null; sold_for: number; after_tax: number; sold_at: string | null }[];
}
export interface EvolutionsOverview { platform: MarketPlatform; seen_at: string | null; club_cards: number; squad: string | null; evolutions: EvolutionView[]; best_upgrades: { card_id: string; name: string; evolution: string; gain: number; after: number; slot: string | null }[]; shape: Record<string, string[]>; verified: false }
export interface ClubValueCard { id: string; player_name: string; version: string | null; overall: number; position: string; club: string | null; league: string | null; nation: string | null; is_icon: boolean; is_hero: boolean; ea_item_id: number | null; tradeable: boolean | null; quantity: number; tradeable_quantity: number; futgg_price: number | null; captured_price: number | null; captured_at: string | null; price: number | null; price_source: "futgg" | "web_app_capture" | null; value: number | null; value_after_tax: number | null; missing_from_last_sync: boolean }
export interface ClubValue { platform: MarketPlatform; prices_published_at: string | null; last_sync: string | null; totals: { cards: number; tradeable_cards: number; untradeable_cards: number; unknown_cards: number; tradeable_copies: number; priced_tradeable: number; unpriced_tradeable: number; value: number; value_after_tax: number; untradeable_value: number }; cards: ClubValueCard[] }
export interface PlayerRole { position: string; role: string; level: "plus" | "plusplus" }
export interface PlayerCard {
  id: string; player_name: string; version: string | null; overall: number; position: string; alt_positions: string[];
  club: string | null; league: string | null; nation: string | null; is_icon: boolean; is_hero: boolean; market_tracked: boolean;
  ea_item_id: number; price: number | null; skill_moves: number | null; weak_foot: number | null; foot: "left" | "right" | null;
  height_cm: number | null; accelerate_type: string | null; pac: number | null; sho: number | null; pas: number | null; dri: number | null;
  def: number | null; phy: number | null; has_stats: boolean; owned: boolean; fit: number | null; stats: Record<string, number>;
  playstyles: string[]; playstyles_plus: string[]; roles: PlayerRole[];
}
export interface PlayerSearch { platform: MarketPlatform; published_at: string | null; sort: string; direction: "asc" | "desc"; catalogue_cards: number; with_stats: number; total: number; cards: PlayerCard[] }
export interface FinderTurn { role: "user" | "assistant"; text: string }
export interface FinderResult { reply: string; query: PlayerQuery; summary: string[]; via: "ai" | "words"; relaxed: string | null; result: PlayerSearch }
const marketPath = (path: string, platform: MarketPlatform, filters: Record<string, string> = {}) => `/market${path}?${new URLSearchParams({ ...filters, platform })}`;

// Knowledge bank: what the FUT community says about gameplay and strategy
export const KB_CATEGORIES = ["formations", "tactics", "players", "playstyles", "attacking", "defending", "skills", "settings", "modes", "market", "other"] as const;
export type KbCategory = typeof KB_CATEGORIES[number];
export type KbAgreement = "agreed" | "leaning" | "split" | "early";
export interface KbTopic { key: string; topic: string; category: KbCategory; claims: number; sources: number; for: number; against: number; mixed: number; buzz: number; net: number | null; agreement: KbAgreement; trend: number | null; last_said: string; has_mine: boolean }
export interface KbMap { days: number; category: string | null; claims: number; sources: number; topics: KbTopic[] }
export interface KbSourceRef { id: string; kind: "reddit" | "youtube" | "web" | "note"; url: string | null; title: string | null; community: string | null; score: number; published_at: string; mine: boolean }
export interface KbStatement { id: number; statement: string; stance: -1 | 0 | 1; strength: number; said_at: string; weight: number; source: KbSourceRef }
export interface KbTopicDetail extends Omit<KbTopic, "buzz" | "trend" | "last_said" | "has_mine"> { days: number; weeks: { week: string; for: number; against: number; mixed: number }[]; statements: KbStatement[] }
export interface KbSource extends KbSourceRef { author: string | null; excerpt: string | null; collected_at: string; comments: number; status: "pending" | "read" | "skipped" | "failed"; note: string | null; shared: boolean; claims: number }
export interface KbRun { started_at: string; finished_at: string | null; feeds: Record<string, { status: string; collected?: number; error?: string }>; read: number; skipped: number; failed: number; error: string | null }
export interface KbStatus { sources: number; claims: number; topics: number; waiting: number; last_run: KbRun | null; last_success: string | null; feeds: { reddit: boolean; reddit_mode?: "api" | "rss" | "off"; youtube: boolean; reader: boolean }; paused: boolean }
export interface KbAddResult { id: string; claims: number; relevant: boolean; summary: string; shared: boolean; topics: string[] }
export interface KbAnswer { answer: string; via: "ai" | "search"; sources: (KbSourceRef & { n: number })[]; topics: string[]; claims: number }

export const futApi = {
  market: {
    overview: (platform: MarketPlatform) => futRequest<MarketOverview>(marketPath("/overview", platform)),
    opportunities: (platform: MarketPlatform, filters: Record<string, string> = {}) => futRequest<MarketOpportunities>(marketPath("/opportunities", platform, filters)),
    card: (id: string, platform: MarketPlatform) => futRequest<MarketCardIntel>(marketPath(`/cards/${encodeURIComponent(id)}`, platform)),
    eaReference: (id: string, platform: MarketPlatform) => futRequest<MarketEaReference>(marketPath(`/cards/${encodeURIComponent(id)}/ea-reference`, platform)),
    relativeValue: (id: string, platform: MarketPlatform, others: string[] = []) => futRequest<MarketRelativeValue>(marketPath(`/cards/${encodeURIComponent(id)}/relative-value`, platform, { others: others.join(",") })),
    thesis: (input: MarketThesisInput) => futRequest<MarketThesis>("/market/thesis", "POST", input),
    compareSquad: (card_id: string, platform: MarketPlatform, squad: string) => futRequest<MarketSquadComparison>("/market/compare-squad", "POST", { card_id, platform, squad }),
    watchlist: (platform: MarketPlatform) => futRequest<MarketWatchlist>(marketPath("/watchlist", platform)),
    watch: (input: { card_id: string; platform: MarketPlatform; target_buy?: number; target_sell?: number; note?: string }) => futRequest<MarketWatchItem>("/market/watchlist", "POST", input),
    unwatch: (id: string, platform: MarketPlatform) => futRequest(marketPath(`/watchlist/${encodeURIComponent(id)}`, platform), "DELETE"),
    importPrices: (text: string, platform: MarketPlatform) => futRequest<MarketImportResult>(marketPath("/prices/import", platform), "POST", { text }),
    fc27Feed: () => futRequest<Fc27FeedStatus>("/market/feeds/fc27-market"),
    futggFeed: () => futRequest<FutggFeedStatus>("/market/feeds/futgg"),
    catalogue: (platform: MarketPlatform, filters: Record<string, string> = {}) => futRequest<MarketCatalogue>(marketPath("/cards", platform, filters)),
    pullFc27Market: () => futRequest<Fc27MarketPull>("/market/import/fc27-market", "POST", {}),
    sharing: () => futRequest<MarketSharing>("/market/sharing"),
    helper: () => futRequest<HelperStatus>("/helper"),
    helperKey: () => futRequest<{ connected: boolean; key: string | null }>("/helper/key"),
    connectHelper: () => futRequest<HelperStatus>("/helper/connect", "POST", {}),
    disconnectHelper: () => futRequest<HelperStatus>("/helper", "DELETE"),
    setSharing: (sharing: boolean) => futRequest<MarketSharing>("/market/sharing", "POST", { sharing }),
    pullCommunity: () => futRequest<CommunityPull>("/market/import/community", "POST", {}),
    held: (platform: MarketPlatform) => futRequest<MarketHeld>(marketPath("/held", platform)),
    linkHeld: (ea_item_id: string | number, card_id: string, platform: MarketPlatform) => futRequest<{ linked: number }>(marketPath("/held/link", platform), "POST", { ea_item_id, card_id }),
    relink: (platform: MarketPlatform) => futRequest<{ linked: number; still_held: number }>(marketPath("/held/relink", platform), "POST", {}),
    sources: (platform: MarketPlatform) => futRequest<MarketSource[]>(marketPath("/sources", platform)),
  },
  knowledge: {
    status: () => futRequest<KbStatus>("/knowledge/status"),
    map: (days: number, category: KbCategory | null) => futRequest<KbMap>(`/knowledge/map?${new URLSearchParams({ days: String(days), ...(category ? { category } : {}) })}`),
    topic: (key: string, days: number) => futRequest<KbTopicDetail>(`/knowledge/topics/${encodeURIComponent(key)}?${new URLSearchParams({ days: String(days) })}`),
    sources: (mine: boolean, page = 0, limit = 30) => futRequest<{ total: number; sources: KbSource[] }>(`/knowledge/sources?${new URLSearchParams({ mine: String(mine), limit: String(limit), offset: String(page * limit) })}`),
    add: (input: { url?: string; text?: string; title?: string; share: boolean }) => futRequest<KbAddResult>("/knowledge/sources", "POST", input),
    remove: (id: string) => futRequest<{ deleted: string }>(`/knowledge/sources/${encodeURIComponent(id)}`, "DELETE"),
    ask: (question: string, history: FinderTurn[]) => futRequest<KbAnswer>("/knowledge/ask", "POST", { question, history }),
  },
  players: {
    search: (query: PlayerQuery, platform: MarketPlatform, page = 0, limit = 50) => futRequest<PlayerSearch>("/players/search", "POST", { query, platform, limit, offset: page * limit }),
    find: (message: string, previous: PlayerQuery | null, history: FinderTurn[], platform: MarketPlatform) => futRequest<FinderResult>("/players/find", "POST", { message, previous, history, platform }),
  },
  alerts: {
    settings: () => futRequest<{ dm: boolean; move_pct: number | null; needs_discord: string }>("/alerts/settings"),
    save: (input: { dm: boolean; move_pct: number | null }) => futRequest<{ dm: boolean; move_pct: number | null; needs_discord: string }>("/alerts/settings", "POST", input),
  },
  champs: {
    overview: (platform: MarketPlatform) => futRequest<ChampsOverview>(`/champs?${new URLSearchParams({ platform })}`),
    createRun: (input: { platform: MarketPlatform; mode: ChampsMode; name?: string; games_allowed?: number | null; target_wins?: number | null }) => futRequest<ChampsRun>("/champs/runs", "POST", input),
    updateRun: (id: string, input: { name?: string; games_allowed?: number | null; target_wins?: number | null; finished?: boolean }) => futRequest<ChampsRun>(`/champs/runs/${encodeURIComponent(id)}`, "POST", input),
    deleteRun: (id: string) => futRequest<{ deleted: string }>(`/champs/runs/${encodeURIComponent(id)}`, "DELETE"),
    addGame: (runId: string, input: { goals_for: number; goals_against: number; penalties?: "won" | "lost" | null; opponent_quit?: boolean; opponent_formation?: string | null; notes?: string }) => futRequest<ChampsGame>(`/champs/runs/${encodeURIComponent(runId)}/games`, "POST", input),
    deleteGame: (id: string) => futRequest<{ deleted: string }>(`/champs/games/${encodeURIComponent(id)}`, "DELETE"),
  },
  compareAny: (card_ids: string[], platform: MarketPlatform, chem_styles: Record<string, string>) => futRequest<CardCompare>("/compare/cards", "POST", { card_ids, platform, chem_styles }),
  meta: {
    card: (cardId: string) => futRequest<MetaCardRating>(`/meta/card?${new URLSearchParams({ card_id: cardId })}`),
    top: (q: { position: string; role?: string; max_price?: number | null; owned_only?: boolean; platform: MarketPlatform }) => futRequest<MetaTop>(`/meta/top?${new URLSearchParams({ position: q.position, platform: q.platform, ...(q.role ? { role: q.role } : {}), ...(q.max_price ? { max_price: String(q.max_price) } : {}), ...(q.owned_only ? { owned_only: "1" } : {}) })}`),
  },
  fodderIndex: (platform: MarketPlatform, days: number) => futRequest<FodderIndexData>(`/market/fodder?${new URLSearchParams({ platform, days: String(days) })}`),
  marketCalendar: (platform: MarketPlatform, cardId?: string) => futRequest<MarketCalendar>(`/market/calendar?${new URLSearchParams({ platform, ...(cardId ? { card_id: cardId } : {}) })}`),
  priceHistory: (cardId: string, platform: MarketPlatform, days: number) => futRequest<PriceHistoryData>(`/prices/history?${new URLSearchParams({ card_id: cardId, platform, days: String(days) })}`),
  sellOrKeep: (platform: MarketPlatform) => futRequest<SellOrKeep>(`/club/sell-or-keep?${new URLSearchParams({ platform })}`),
  trades: {
    overview: (platform: MarketPlatform) => futRequest<TradeOverview>(`/trades?${new URLSearchParams({ platform })}`),
    setBuyPrice: (platform: MarketPlatform, item_id: number, price: number | null) => futRequest<{ item_id: number; bought_for: number | null }>("/trades/buy-price", "POST", { platform, item_id, price }),
  },
  evolutions: {
    overview: (platform: MarketPlatform) => futRequest<EvolutionsOverview>(`/evolutions?${new URLSearchParams({ platform })}`),
    check: (input: { name: string; requirements: string; upgrades: string }) => futRequest<{ club_cards: number; squad: string | null; evolution: EvolutionView; verified: false }>("/evolutions/check", "POST", input),
  },
  sbc: {
    overview: (platform: MarketPlatform) => futRequest<SbcOverview>(`/sbc?${new URLSearchParams({ platform })}`),
    parse: (text: string) => futRequest<{ requirements: SbcRequirement[]; unread: string[]; lines: string[] }>("/sbc/parse", "POST", { text }),
    solve: (input: SbcSolveInput) => futRequest<SbcSolution>("/sbc/solve", "POST", input),
  },
  /** Card art addresses the helper saw the Web App load (shared EA file addresses, newest first). */
  cardArt: () => futRequest<CardArtSeen[]>("/card-art"),
  clubShare: {
    get: () => futRequest<ClubShare>("/club-share"),
    set: (patch: Partial<ClubShare>) => futRequest<ClubShare>("/club-share", "PUT", patch),
  },
  account: {
    get: (platform: MarketPlatform) => futRequest<AccountOverview>(`/account?${new URLSearchParams({ platform })}`),
    clear: (platform: MarketPlatform) => futRequest<{ cleared: boolean }>(`/account?${new URLSearchParams({ platform })}`, "DELETE"),
  },
  packs: {
    advice: (platform: MarketPlatform) => futRequest<PackAdvice>(`/packs?${new URLSearchParams({ platform })}`),
    clear: (platform: MarketPlatform) => futRequest<{ cleared: boolean }>(`/packs?${new URLSearchParams({ platform })}`, "DELETE"),
  },
  strategy: (platform: MarketPlatform, opts: { budget?: number | null; risk?: StrategyRisk } = {}) => futRequest<DailyStrategy>(`/strategy?${new URLSearchParams({ platform, ...(opts.budget != null ? { budget: String(opts.budget) } : {}), ...(opts.risk ? { risk: opts.risk } : {}) })}`),
  health: () => futRequest<FutHealth>("/health"),
  clubValue: (platform: MarketPlatform) => futRequest<ClubValue>(`/club/value?${new URLSearchParams({ platform })}`),
  cards: (filters: Record<string, string> = {}) => {
    const limit = filters.limit ?? CARD_LIST_LIMIT;
    cardLimitRules.parse(Number(limit));
    return futRequest<FutCard[]>(`/cards?${new URLSearchParams({ ...filters, limit })}`);
  },
  card: (id: string) => futRequest<FutCard>(`/cards/${encodeURIComponent(id)}`),
  saveCard: (card: Omit<FutCard, "id">, id?: string) => { cardInputRules.parse(card); return futRequest<FutCard>(id ? `/cards/${encodeURIComponent(id)}` : "/cards", id ? "PUT" : "POST", card); },
  deleteCard: (id: string) => futRequest(`/cards/${encodeURIComponent(id)}`, "DELETE"),
  compareCards: (ids: string[]) => { compareCardRules.parse(ids); return futRequest<Comparison>("/cards/compare", "POST", { card_ids: ids }); },
  managers: () => futRequest<FutManager[]>("/managers"),
  addManager: (manager: Omit<FutManager, "id">) => futRequest<FutManager>("/managers", "POST", manager),
  importClub: (file: unknown) => futRequest<ClubImportResult>("/club/import", "POST", file),
  deleteManager: (id: string) => futRequest(`/managers/${encodeURIComponent(id)}`, "DELETE"),
  formations: async (): Promise<Formation[]> => {
    const result = await futRequest<unknown>("/formations");
    const rows = Array.isArray(result) ? result : (result && typeof result === "object" ? Object.keys(result) : []);
    return rows.map((row: string | { id?: string; name?: string; formation?: string; key?: string }) => {
      if (typeof row === "string") return { id: row, name: row };
      const id = row.id ?? row.formation ?? row.key ?? row.name ?? "";
      return { id, name: row.name ?? id };
    }).filter(row => row.id);
  },
  formationSlots: () => futRequest<Record<string, FormationSlot[]>>("/formations/slots"),
  changeFormation: (squad: FutSquad, formation: string) => futRequest<FutSquad>("/squads/formation", "POST", { squad: withBudget(squad), formation }),
  squads: () => futRequest<FutSquad[]>("/squads"),
  squad: (id: string) => futRequest<FutSquad>(`/squads/${encodeURIComponent(id)}`),
  newSquad: (input: { formation: string; name?: string; budget?: number }) => futRequest<FutSquad>("/squads/new", "POST", { ...input, budget: squadBudget(input.budget) }),
  assign: (squad: FutSquad, slot: string, cardId: string | null) => futRequest<FutSquad>("/squads/assign", "POST", { squad: withBudget(squad), slot, ...(cardId === null ? { card: null } : { card_id: cardId }) }),
  saveSquad: (squad: FutSquad) => futRequest<FutSquad>("/squads", "POST", withBudget(squad)),
  saveAs: (squad: FutSquad, name: string) => futRequest<FutSquad>("/squads/save-as", "POST", { squad: withBudget(squad), name }),
  deleteSquad: (id: string) => futRequest(`/squads/${encodeURIComponent(id)}`, "DELETE"),
  chemistry: (squad: FutSquad | string) => futRequest<Chemistry>("/squads/chemistry", "POST", { squad: typeof squad === "string" ? squad : withBudget(squad) }),
  diagnose: (squad: FutSquad, slot?: string) => futRequest<RuleInfo & Record<string, unknown>>("/squads/diagnose", "POST", { squad: withBudget(squad), ...(slot ? { slot } : {}) }),
  bestSquad: (squad: FutSquad, by: SuggestBy, formation: string) => futRequest<BestSquadResult>("/squads/best", "POST", { squad: withBudget(squad), by, formation }),
  upgrades: (squad: FutSquad, budget: number, platform: "console" | "pc") => futRequest<UpgradePath>("/squads/upgrades", "POST", { squad: withBudget(squad), budget, platform }),
  suggestSlot: (squad: FutSquad, slot: string, by: SuggestBy) => futRequest<SlotSuggestions>("/squads/suggest", "POST", { squad: withBudget(squad), slot, by }),
  squadRoles: (squad: FutSquad) => futRequest<SquadRoles>("/squads/roles", "POST", { squad: withBudget(squad) }),
  importSquad: (squad: FutSquad, input: { text?: string; image?: SquadImportImage }) => futRequest<SquadImportResult>("/squads/import", "POST", { squad: withBudget(squad), ...input }),
  preview: (squad: FutSquad, slot: string, cardId: string | null) => futRequest<SwapPreview>("/squads/preview", "POST", { squad: withBudget(squad), slot, ...(cardId === null ? { card: null } : { card_id: cardId }) }),
  optimize: (squad: FutSquad, goal: { slot?: string; slot_target?: number; total_target?: number }, options: { budget?: number; max_swaps: number; allow_manager_change: boolean; allow_net_loss: boolean }) => { optimizerRules.parse(options); return futRequest<Optimization>("/squads/optimize", "POST", { squad: withBudget(squad), goal, options: { ...options, budget: squadBudget(options.budget) } }); },
  compareSquads: (a: FutSquad, b: FutSquad) => futRequest<Comparison>("/squads/compare", "POST", { a: withBudget(a), b: withBudget(b) }),
};
