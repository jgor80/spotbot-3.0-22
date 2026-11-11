import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ErrorNotice } from "@/components/fut/FutShared";
import { futApi, futKeys, type MetaRoleScore } from "@/lib/futApi";
import { MarketLoading } from "@/components/fut/market/MarketShared";

export const tierClass = (score: number) => score >= 90 ? "border-success/40 bg-success/10 text-success" : score >= 85 ? "border-primary/40 bg-primary/10 text-primary" : score >= 80 ? "" : "border-warning/40 bg-warning/10 text-warning";

export function RoleLine({ r }: { r: MetaRoleScore }) {
  const extras = [r.bonuses.playstyles ? `PlayStyles +${r.bonuses.playstyles}` : null, r.bonuses.height ? `height ${r.bonuses.height > 0 ? "+" : ""}${r.bonuses.height}` : null, r.bonuses.accelerate ? `AcceleRATE ${r.bonuses.accelerate > 0 ? "+" : ""}${r.bonuses.accelerate}` : null, r.bonuses.weak_foot ? `weak foot ${r.bonuses.weak_foot > 0 ? "+" : ""}${r.bonuses.weak_foot}` : null, r.bonuses.skill_moves ? `skills ${r.bonuses.skill_moves > 0 ? "+" : ""}${r.bonuses.skill_moves}` : null].filter(Boolean);
  return <li className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-2 text-sm first:border-t-0">
    <Badge variant="outline" className={`tabular-nums ${tierClass(r.score)}`}>{r.score}</Badge>
    <span className="font-medium">{r.position} {r.role}</span>
    <span className="text-muted-foreground">{r.tier}{r.chem_style ? ` · ${r.chem_style}` : ""}{extras.length ? ` · ${extras.join(", ")}` : ""}</span>
    {(r.strengths.length > 0 || r.weaknesses.length > 0) && <span className="w-full text-xs text-muted-foreground">{r.strengths.length ? `Strengths: ${r.strengths.join(", ")}. ` : ""}{r.weaknesses.length ? `Watch: ${r.weaknesses.join(", ")}.` : ""}{r.playstyles.length ? ` PlayStyles that help: ${r.playstyles.join(", ")}.` : ""}</span>}
  </li>;
}

/** A card's metarating in every role it can play (used on the card page). */
export function MetaRating({ cardId, enabled = true }: { cardId: string; enabled?: boolean }) {
  const q = useQuery({ queryKey: [...futKeys.meta, "card", cardId], queryFn: () => futApi.meta.card(cardId), enabled: enabled && Boolean(cardId), staleTime: 10 * 60_000 });
  if (q.isPending) return <MarketLoading />;
  if (q.error) return <ErrorNotice error={q.error} />;
  const d = q.data!;
  return <div className="space-y-2">
    <p className="text-sm">{d.verdict}</p>
    <ul className="rounded-lg border border-border bg-card px-4">{d.roles.slice(0, 8).map(r => <RoleLine key={`${r.position}-${r.role}`} r={r} />)}</ul>
    <p className="text-xs text-muted-foreground">{d.estimated ? "Full in-game stats aren't in yet, so this uses face stats. " : ""}{d.note}</p>
  </div>;
}
