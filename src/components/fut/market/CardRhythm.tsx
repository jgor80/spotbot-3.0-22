import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys, type MarketPlatform } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { useInView } from "./MarketShared";

/** How this card's own FUT.GG price moved after each weekly FUT event (Market Calendar back-test). */
export function CardRhythm({ cardId, platform, enabled }: { cardId: string; platform: MarketPlatform; enabled: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const q = useQuery({ queryKey: [...futKeys.calendar, "card", cardId, platform], queryFn: () => futApi.marketCalendar(platform, cardId), enabled: enabled && inView && Boolean(cardId), staleTime: 30 * 60_000 });
  const events = q.data?.card?.events ?? [];
  return <div ref={ref} className="space-y-2">
    <ErrorNotice error={q.error} />
    {q.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : <ul className="space-y-1 text-sm">{events.map(e => <li key={e.key}><span className="font-medium">{e.label}:</span> {e.line}</li>)}</ul>}
    <Link className="text-sm text-primary underline-offset-4 hover:underline" to="/fut/calendar">Market Calendar</Link>
  </div>;
}
