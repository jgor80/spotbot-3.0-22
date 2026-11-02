import type { MarketBestFit, MarketPlatform, MarketStatus } from "@/lib/futApi";
export const platformStorageKey = "xi-lab-market-platform";
export function marketPlatform(value: unknown): MarketPlatform { return value === "pc" ? "pc" : "console"; }
export const statusStyles: Record<MarketStatus, { label: string; className: string }> = {
 favorable_setup: { label: "Favourable setup", className: "border-success/30 bg-success/10 text-success" },
 research_further: { label: "Research further", className: "border-info/30 bg-info/10 text-info" },
 watch: { label: "Watch", className: "border-border bg-muted text-muted-foreground" },
 overheated: { label: "Overheated", className: "border-warning/30 bg-warning/10 text-warning" },
 elevated_risk: { label: "Elevated risk", className: "border-destructive/30 bg-destructive/10 text-destructive" },
 insufficient_evidence: { label: "Insufficient evidence", className: "border-border bg-muted text-muted-foreground" },
};
export function numberText(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? "–" : value.toLocaleString("en-US"); }
export function percentText(value: number | null | undefined, unit = "%"): string { return value == null || !Number.isFinite(value) ? "–" : `${value > 0 ? "+" : ""}${numberText(value)}${unit}`; }
export function dateText(value?: string | null): string { if (!value) return "–"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US"); }
export function coinInput(value: string, required = true): number | undefined { if (!value.trim() && !required) return undefined; const number = Number(value); if (!value.trim() || !Number.isFinite(number) || !Number.isInteger(number) || number < 0) throw new Error("Enter a whole number of coins, 0 or more."); return number; }
export function importRowCount(text: string): number {
 const trimmed = text.trim(); if (!trimmed) return 0;
 if (trimmed.startsWith("[")) { const parsed: unknown = JSON.parse(trimmed); if (!Array.isArray(parsed)) throw new Error("JSON prices must be an array of rows."); return parsed.length; }
 let quoted = false, count = 0, hasContent = false;
 for (let i = 0; i < trimmed.length; i++) { const char = trimmed[i]; if (char === '"') { if (quoted && trimmed[i + 1] === '"') i++; else quoted = !quoted; } if (char === "\n" && !quoted) { if (hasContent) count++; hasContent = false; } else if (char.trim()) hasContent = true; }
 if (hasContent) count++;
 return Math.max(0, count - 1);
}
export function validateImport(text: string): string { const rows = importRowCount(text); if (!rows) throw new Error("Add price rows to import."); if (rows > 5000) throw new Error("Import up to 5,000 rows at a time."); return text; }
export function matchingCards<T extends { overall: number }>(cards: T[], rating: number): T[] { return cards.filter(card => card.overall === rating); }
export function presentationValue(value: unknown): unknown { if (value == null) return "–"; if (typeof value === "number") return numberText(value); if (Array.isArray(value)) return value.map(presentationValue); if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, presentationValue(item)])); return value; }
export function bestFitText(value?: MarketBestFit | null): string { return value ? `${value.position} · ${value.profile} · ${numberText(value.score)}` : "–"; }
