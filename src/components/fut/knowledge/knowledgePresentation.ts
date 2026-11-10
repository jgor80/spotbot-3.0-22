import type { KbAgreement, KbCategory, KbSourceRef } from "@/lib/futApi";

export const CATEGORY_LABELS: Record<KbCategory, string> = {
  formations: "Formations", tactics: "Custom tactics", players: "Players", playstyles: "PlayStyles & roles", attacking: "Attacking",
  defending: "Defending", skills: "Skill moves", settings: "Settings", modes: "Modes", market: "Market", other: "Other",
};

export const AGREEMENT: Record<KbAgreement, { label: string; color: string; help: string }> = {
  agreed: { label: "Agreed", color: "var(--kb-agreed)", help: "70%+ of what's said points one way" },
  leaning: { label: "Leaning", color: "var(--kb-leaning)", help: "55–70% one way" },
  split: { label: "Split", color: "var(--kb-split)", help: "People disagree" },
  early: { label: "Too early", color: "var(--kb-early)", help: "Fewer than 3 claims so far" },
};
export const AGREEMENT_ORDER: KbAgreement[] = ["agreed", "leaning", "split", "early"];

export const STANCE = {
  1: { label: "For", color: "var(--kb-for)" },
  [-1]: { label: "Against", color: "var(--kb-against)" },
  0: { label: "Mixed", color: "var(--kb-mixed)" },
} as const;

/** "Mostly for", "Mostly against" or "Mixed" from net sentiment -1..1. */
export function sentimentText(net: number | null | undefined): string {
  if (net == null) return "No view yet";
  if (net >= 0.5) return "People rate it";
  if (net >= 0.15) return "Mostly positive";
  if (net > -0.15) return "Mixed views";
  if (net > -0.5) return "Mostly negative";
  return "People pan it";
}

export function trendText(trend: number | null | undefined): string {
  if (trend == null) return "steady";
  if (trend >= 0.6) return "new or surging";
  if (trend >= 0.2) return "rising";
  if (trend > -0.2) return "steady";
  if (trend > -0.6) return "cooling";
  return "fading";
}

export function sourceLabel(s: Pick<KbSourceRef, "kind" | "title" | "community">): string {
  const where = s.kind === "reddit" ? (s.community ?? "Reddit") : s.kind === "youtube" ? `YouTube${s.community ? ` · ${s.community}` : ""}` : s.kind === "note" ? "Your notes" : (s.community ?? "Web");
  if (s.title) return `${s.title} (${where})`;
  return s.kind === "reddit" ? `Reddit post in ${where}` : s.kind === "youtube" ? "YouTube video" : where;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
