import { memo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys, Stats } from "@/lib/futApi";
import { cn } from "@/lib/utils";
import { backgroundUrl, cardName, cardTheme, faceUrl, type CardArtInput } from "./cardArt";

export interface CardArtCard extends CardArtInput {
  name: string;
  position?: string | null;
  ea_item_id?: number | null;
  stats?: Partial<Stats> | null;
}

/** Whether cards may show EA player faces and card backgrounds, and where they load from (the server's FUT_EA_IMAGES switch). */
export function useCardImages() {
  const health = useQuery({ queryKey: futKeys.health, queryFn: futApi.health, retry: false, staleTime: 30 * 60_000 });
  const images = health.data?.card_images;
  return images?.faces && images.portrait_base ? images : null;
}

// Our own shape: angled shoulders and a pointed foot
const SHAPE = "polygon(14% 0, 86% 0, 100% 9%, 100% 87%, 50% 100%, 0 87%, 0 9%)";
// EA's background files have a transparent margin (about 9.6% sides, 12% top, 7% bottom): scale it off so the card fills the box
const EA_CROP = { width: "123.2%", height: "123.2%", left: "-11.8%", top: "-14.8%" } as const;
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
function CardArt({ card, compact = false, showStats = false, className, title }: { card: CardArtCard; compact?: boolean; showStats?: boolean; className?: string; title?: string }) {
  const images = useCardImages();
  const theme = cardTheme(card);
  const src = faceUrl(images?.portrait_base, card.ea_item_id);
  const [broken, setBroken] = useState<string[]>([]);
  const face = src && !broken.includes(src) ? src : null;
  const bgSrc = backgroundUrl(images?.background_base, theme);
  const bg = bgSrc && !broken.includes(bgSrc) ? bgSrc : null;
  const lost = (url: string) => setBroken(list => list.includes(url) ? list : [...list, url]);
  // On EA's own card the name sits under EA's divider line, a little lower than on ours
  const nameTop = bg ? "83cqw" : "74cqw", statsTop = bg ? "99cqw" : "93cqw";
  const stats = showStats && card.stats ? STAT_KEYS.filter(k => card.stats?.[k] != null) : [];
  const label = title ?? [card.rating, card.position, card.name, theme.label].filter(v => v != null && v !== "").join(" · ");
  return <div role="img" aria-label={label} title={label} className={cn("relative aspect-[5/7] shrink-0 select-none", className)} style={{ containerType: "inline-size" }}>
    <div className="absolute inset-0 drop-shadow-sm" style={bg ? undefined : { clipPath: SHAPE, background: theme.frame }}>
      <div className="absolute overflow-hidden" style={bg ? { inset: 0, color: theme.text } : { inset: "2.2cqw", clipPath: SHAPE, background: theme.background, color: theme.text }}>
        {bg
          ? <img src={bg} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => lost(bg)} className="absolute max-w-none" style={EA_CROP} />
          /* Soft diagonal sheen so flat colours still read as a card */
          : <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.22) 45%, transparent 60%)" }} />}
        <div className="absolute" style={compact ? { right: "-6cqw", top: "22cqw", width: "82cqw", height: "82cqw" } : { right: bg ? "6cqw" : "2cqw", top: bg ? "14cqw" : "9cqw", width: bg ? "66cqw" : "64cqw", height: bg ? "66cqw" : "64cqw" }}>
          {face ? <img src={face} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => lost(face)} className="h-full w-full object-contain object-bottom" /> : <Silhouette color={theme.text} />}
        </div>
        <div className="absolute flex flex-col items-center font-display leading-none" style={{ left: compact ? "8cqw" : bg ? "12cqw" : "9cqw", top: compact ? "8cqw" : bg ? "18cqw" : "11cqw" }}>
          <span className="font-bold tabular-nums" style={{ fontSize: compact ? "40cqw" : "25cqw" }}>{card.rating ?? "–"}</span>
          {card.position && <span className="font-semibold" style={{ fontSize: compact ? "22cqw" : "11cqw", marginTop: "1.5cqw", color: theme.accent }}>{card.position}</span>}
        </div>
        {!compact && <>
          <div className="absolute inset-x-0 truncate px-[8cqw] text-center font-display font-bold" style={{ top: nameTop, fontSize: "11.5cqw", lineHeight: 1.15 }}>{cardName(card.name)}</div>
          {!bg && <div className="absolute mx-auto" style={{ top: "89cqw", left: "18cqw", right: "18cqw", height: "0.8cqw", background: theme.accent, opacity: 0.45 }} />}
          {stats.length > 0
            ? <div className="absolute grid grid-cols-3 gap-x-[3cqw] gap-y-[1.5cqw] font-display tabular-nums" style={{ top: statsTop, left: "11cqw", right: "11cqw", fontSize: "8cqw", lineHeight: 1 }}>
              {stats.map(k => <span key={k} className="flex items-baseline justify-center gap-[1.5cqw]"><span className="font-bold">{card.stats?.[k]}</span><span className="uppercase" style={{ fontSize: "6cqw", color: theme.accent }}>{k}</span></span>)}
            </div>
            : <div className="absolute inset-x-0 truncate px-[14cqw] text-center font-semibold uppercase tracking-wide" style={{ top: bg ? "100cqw" : "94cqw", fontSize: "6.5cqw", color: theme.accent }}>{theme.label}</div>}
        </>}
      </div>
    </div>
  </div>;
}

// Card details rarely change while a page is open: skip redrawing a card unless what it shows changed
const same = (a: CardArtCard, b: CardArtCard) => a.name === b.name && a.rating === b.rating && a.position === b.position && a.version === b.version
  && a.is_icon === b.is_icon && a.is_hero === b.is_hero && a.category === b.category && a.ea_item_id === b.ea_item_id
  && JSON.stringify(a.stats ?? null) === JSON.stringify(b.stats ?? null);
export const FutCardArt = memo(CardArt, (a, b) => same(a.card, b.card) && a.compact === b.compact && a.showStats === b.showStats && a.className === b.className && a.title === b.title);

/** The small "© EA" credit line, shown only while EA images are switched on. */
export function CardImageCredit() {
  const images = useCardImages();
  return images?.credit ? <p className="text-[11px] text-muted-foreground">{images.credit}</p> : null;
}
