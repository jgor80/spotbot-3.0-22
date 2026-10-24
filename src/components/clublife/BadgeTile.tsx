import { cn } from "@/lib/utils";
import { badgeOf, TIER_CLASS } from "@/lib/clubLife";

// One badge on a wall: glyph medal, name and how rare it is. Locked badges are drawn faded.
export function BadgeTile({ badge, detail, rarity, locked, featured }: { badge: string; detail?: string | null; rarity?: string; locked?: boolean; featured?: boolean }) {
  const b = badgeOf(badge);
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border p-3", locked ? "border-dashed border-border opacity-50" : TIER_CLASS[b.tier], featured && "ring-2 ring-primary")} title={b.help}>
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 font-display text-xs font-bold", locked ? "border-border" : "border-current")}>{b.glyph}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {b.name}
          {featured && <span className="ml-1 text-xs text-primary">· on my cards</span>}
        </p>
        <p className="truncate text-xs capitalize text-muted-foreground">{locked ? b.help : [b.tier, rarity, detail].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
}
