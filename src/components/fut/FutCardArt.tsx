import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys, Stats } from "@/lib/futApi";
import { cn } from "@/lib/utils";
import { cardName, cardTheme, faceUrl, type CardArtInput } from "./cardArt";

export interface CardArtCard extends CardArtInput {
  name: string;
  position?: string | null;
  ea_item_id?: number | null;
  stats?: Partial<Stats> | null;
}

/** Whether cards may show EA player faces, and where they load from (the server's FUT_EA_FACES switch). */
export function useCardImages() {
  const health = useQuery({ queryKey: futKeys.health, queryFn: futApi.health, retry: false, staleTime: 60_000 });
  const images = health.data?.card_images;
  return images?.faces && images.portrait_base ? images : null;
}

// Our own shape: angled shoulders and a pointed foot
const SHAPE = "polygon(14% 0, 86% 0, 100% 9%, 100% 87%, 50% 100%, 0 87%, 0 9%)";
const STAT_KEYS: (keyof Stats)[] = ["pac", "sho", "pas", "dri", "def", "phy"];

function Silhouette({ color }: { color: string }) {
  return <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true" style={{ color }}>
    <circle cx="50" cy="36" r="19" fill="currentColor" opacity="0.28" />
    <path d="M14 100c2-22 17-36 36-36s34 14 36 36z" fill="currentColor" opacity="0.28" />
  </svg>;
}

/**
 * A FUT card drawn by GafferBot: rating, position, name and (with `stats`) face stats, coloured by card type.
 * `compact` keeps just rating, position and face for list thumbnails. Size it with a width class; it scales.
 * With EA faces switched on, the face loads straight from EA in the browser and falls back to a silhouette.
 */
export function FutCardArt({ card, compact = false, showStats = false, className, title }: { card: CardArtCard; compact?: boolean; showStats?: boolean; className?: string; title?: string }) {
  const images = useCardImages();
  const theme = cardTheme(card);
  const src = faceUrl(images?.portrait_base, card.ea_item_id);
  const [broken, setBroken] = useState<string | null>(null);
  const face = src && broken !== src ? src : null;
  const stats = showStats && card.stats ? STAT_KEYS.filter(k => card.stats?.[k] != null) : [];
  const label = title ?? [card.rating, card.position, card.name, theme.label].filter(v => v != null && v !== "").join(" · ");
  return <div role="img" aria-label={label} title={label} className={cn("relative aspect-[5/7] shrink-0 select-none", className)} style={{ containerType: "inline-size" }}>
    <div className="absolute inset-0 drop-shadow-sm" style={{ clipPath: SHAPE, background: theme.frame }}>
      <div className="absolute overflow-hidden" style={{ inset: "2.2cqw", clipPath: SHAPE, background: theme.background, color: theme.text }}>
        {/* Soft diagonal sheen so flat colours still read as a card */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.22) 45%, transparent 60%)" }} />
        <div className="absolute" style={compact ? { right: "-6cqw", top: "22cqw", width: "82cqw", height: "82cqw" } : { right: "2cqw", top: "9cqw", width: "64cqw", height: "64cqw" }}>
          {face ? <img src={face} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(face)} className="h-full w-full object-contain object-bottom" /> : <Silhouette color={theme.text} />}
        </div>
        <div className="absolute flex flex-col items-center font-display leading-none" style={{ left: compact ? "8cqw" : "9cqw", top: compact ? "8cqw" : "11cqw" }}>
          <span className="font-bold tabular-nums" style={{ fontSize: compact ? "40cqw" : "25cqw" }}>{card.rating ?? "–"}</span>
          {card.position && <span className="font-semibold" style={{ fontSize: compact ? "22cqw" : "11cqw", marginTop: "1.5cqw", color: theme.accent }}>{card.position}</span>}
        </div>
        {!compact && <>
          <div className="absolute inset-x-0 truncate px-[8cqw] text-center font-display font-bold" style={{ top: "74cqw", fontSize: "11.5cqw", lineHeight: 1.15 }}>{cardName(card.name)}</div>
          <div className="absolute mx-auto" style={{ top: "89cqw", left: "18cqw", right: "18cqw", height: "0.8cqw", background: theme.accent, opacity: 0.45 }} />
          {stats.length > 0
            ? <div className="absolute grid grid-cols-3 gap-x-[3cqw] gap-y-[1.5cqw] font-display tabular-nums" style={{ top: "93cqw", left: "9cqw", right: "9cqw", fontSize: "8cqw", lineHeight: 1 }}>
              {stats.map(k => <span key={k} className="flex items-baseline justify-center gap-[1.5cqw]"><span className="font-bold">{card.stats?.[k]}</span><span className="uppercase" style={{ fontSize: "6cqw", color: theme.accent }}>{k}</span></span>)}
            </div>
            : <div className="absolute inset-x-0 truncate px-[14cqw] text-center font-semibold uppercase tracking-wide" style={{ top: "94cqw", fontSize: "6.5cqw", color: theme.accent }}>{theme.label}</div>}
        </>}
      </div>
    </div>
  </div>;
}

/** The small "Player faces © EA" line, shown only when faces are switched on. */
export function CardImageCredit() {
  const images = useCardImages();
  return images?.credit ? <p className="text-[11px] text-muted-foreground">{images.credit}</p> : null;
}
