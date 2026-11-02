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

export type Evidence = "game_data" | "estimate" | "hypothesis";
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
export const futKeys = { all: ["fut"] as const, health: ["fut", "health"] as const, squads: ["fut", "squads"] as const, cards: ["fut", "cards"] as const, managers: ["fut", "managers"] as const };
export const futApi = {
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
