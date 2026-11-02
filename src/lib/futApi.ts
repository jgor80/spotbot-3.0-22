import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

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
export interface Chemistry extends RuleInfo {
  chemistry: { total: number; players: { slot: string; name: string; chemistry: number; links?: unknown }[] };
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
  return data?.data as T;
}
export const futKeys = { market: ["fut", "market"] as const, all: ["fut"] as const, health: ["fut", "health"] as const, squads: ["fut", "squads"] as const, cards: ["fut", "cards"] as const, managers: ["fut", "managers"] as const };

export type MarketPlatform = "console" | "pc";
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
export interface MarketOpportunities { regime: MarketRegime; items: MarketOpportunity[]; total: number; provenance: MarketProvenance }
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
export interface MarketImportResult { accepted: number; inserted: number; skipped: number; duplicates: number; rejected: { line: number; reason: string }[]; held: number; linked_from_held: number; still_held: number }
export interface MarketHeld { items: { ea_item_id: string | number; asset_id: string | number; rating: number; details: { rare_flag?: number; team_id?: number; league_id?: number; nation_id?: number; position?: string } | null; special_version: boolean | null; observations: number; platforms: string[]; latest_price: number | null; latest_platform: string; latest_observed_at: string | null; reason: string }[]; total_observations: number; evidence: MarketEvidence; note: string }
export interface MarketSource { id: string; name: string; kind: string; status: "enabled" | "disabled" | "not_authorized"; is_demo: boolean; status_note: string; permissions: Record<string, boolean | null>; evidence: MarketEvidence }
const marketPath = (path: string, platform: MarketPlatform, filters: Record<string, string> = {}) => `/market${path}?${new URLSearchParams({ ...filters, platform })}`;

export const futApi = {
  market: {
    overview: (platform: MarketPlatform) => futRequest<MarketOverview>(marketPath("/overview", platform)),
    opportunities: (platform: MarketPlatform, filters: Record<string, string> = {}) => futRequest<MarketOpportunities>(marketPath("/opportunities", platform, filters)),
    card: (id: string, platform: MarketPlatform) => futRequest<MarketCardIntel>(marketPath(`/cards/${encodeURIComponent(id)}`, platform)),
    relativeValue: (id: string, platform: MarketPlatform, others: string[] = []) => futRequest<MarketRelativeValue>(marketPath(`/cards/${encodeURIComponent(id)}/relative-value`, platform, { others: others.join(",") })),
    thesis: (input: MarketThesisInput) => futRequest<MarketThesis>("/market/thesis", "POST", input),
    compareSquad: (card_id: string, platform: MarketPlatform, squad: string) => futRequest<MarketSquadComparison>("/market/compare-squad", "POST", { card_id, platform, squad }),
    watchlist: (platform: MarketPlatform) => futRequest<MarketWatchlist>(marketPath("/watchlist", platform)),
    watch: (input: { card_id: string; platform: MarketPlatform; target_buy?: number; target_sell?: number; note?: string }) => futRequest<MarketWatchItem>("/market/watchlist", "POST", input),
    unwatch: (id: string, platform: MarketPlatform) => futRequest(marketPath(`/watchlist/${encodeURIComponent(id)}`, platform), "DELETE"),
    importPrices: (text: string, platform: MarketPlatform) => futRequest<MarketImportResult>(marketPath("/prices/import", platform), "POST", { text }),
    held: (platform: MarketPlatform) => futRequest<MarketHeld>(marketPath("/held", platform)),
    linkHeld: (ea_item_id: string | number, card_id: string, platform: MarketPlatform) => futRequest<{ linked: number }>(marketPath("/held/link", platform), "POST", { ea_item_id, card_id }),
    relink: (platform: MarketPlatform) => futRequest<{ linked: number; still_held: number }>(marketPath("/held/relink", platform), "POST", {}),
    sources: (platform: MarketPlatform) => futRequest<MarketSource[]>(marketPath("/sources", platform)),
  },
  health: () => futRequest<RuleInfo>("/health"),
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
  squads: () => futRequest<FutSquad[]>("/squads"),
  squad: (id: string) => futRequest<FutSquad>(`/squads/${encodeURIComponent(id)}`),
  newSquad: (input: { formation: string; name?: string; budget?: number }) => futRequest<FutSquad>("/squads/new", "POST", { ...input, budget: squadBudget(input.budget) }),
  assign: (squad: FutSquad, slot: string, cardId: string | null) => futRequest<FutSquad>("/squads/assign", "POST", { squad: withBudget(squad), slot, ...(cardId === null ? { card: null } : { card_id: cardId }) }),
  saveSquad: (squad: FutSquad) => futRequest<FutSquad>("/squads", "POST", withBudget(squad)),
  saveAs: (squad: FutSquad, name: string) => futRequest<FutSquad>("/squads/save-as", "POST", { squad: withBudget(squad), name }),
  deleteSquad: (id: string) => futRequest(`/squads/${encodeURIComponent(id)}`, "DELETE"),
  chemistry: (squad: FutSquad | string) => futRequest<Chemistry>("/squads/chemistry", "POST", { squad: typeof squad === "string" ? squad : withBudget(squad) }),
  diagnose: (squad: FutSquad, slot?: string) => futRequest<RuleInfo & Record<string, unknown>>("/squads/diagnose", "POST", { squad: withBudget(squad), ...(slot ? { slot } : {}) }),
  preview: (squad: FutSquad, slot: string, cardId: string | null) => futRequest<SwapPreview>("/squads/preview", "POST", { squad: withBudget(squad), slot, ...(cardId === null ? { card: null } : { card_id: cardId }) }),
  optimize: (squad: FutSquad, goal: { slot?: string; slot_target?: number; total_target?: number }, options: { budget?: number; max_swaps: number; allow_manager_change: boolean; allow_net_loss: boolean }) => { optimizerRules.parse(options); return futRequest<Optimization>("/squads/optimize", "POST", { squad: withBudget(squad), goal, options: { ...options, budget: squadBudget(options.budget) } }); },
  compareSquads: (a: FutSquad, b: FutSquad) => futRequest<Comparison>("/squads/compare", "POST", { a: withBudget(a), b: withBudget(b) }),
};
