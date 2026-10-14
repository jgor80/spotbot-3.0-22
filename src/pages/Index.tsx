import { eventKind } from "@/lib/eventKind";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";
import {
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  Lightbulb,
  Loader2,
  Shield,
  Trophy,
  UsersRound,
  Goal,
  Handshake,
  Star,
} from "lucide-react";
import { DashboardLayout, PageHeader } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SyncMatchesButton } from "@/components/club/SyncMatchesButton";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { competitionLabel, computeOverview, toInsightMatches, type ClubMatchRow, type InsightMatch, type MatchResult } from "@/lib/clubInsights";

interface UpcomingEvent {
  id: string;
  title: string;
  event_type: string;
  scheduled_at: string;
  club_key: string | null;
  counts: { yes: number; maybe: number; no: number };
}

const RESULT_STYLE: Record<MatchResult, string> = {
  win: "bg-success text-success-foreground",
  draw: "bg-muted-foreground/30 text-foreground",
  loss: "bg-destructive text-destructive-foreground",
};

function ResultChip({ result, className }: { result: MatchResult; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
        RESULT_STYLE[result],
        className
      )}
    >
      {result[0].toUpperCase()}
    </span>
  );
}

function kickoffLabel(date: Date) {
  const time = format(date, "HH:mm");
  if (isToday(date)) return `Tonight ${time}`;
  if (isTomorrow(date)) return `Tomorrow ${time}`;
  return format(date, "EEE d MMM, HH:mm");
}

// Leaders across the recent matches, from EA's per-player stats
function topPerformers(matches: InsightMatch[]) {
  const totals = new Map<string, { name: string; goals: number; assists: number; ratingSum: number; games: number }>();
  for (const m of matches) {
    for (const p of m.players) {
      const name = (p.ea_username || "").trim();
      if (!name) continue;
      const t = totals.get(name.toLowerCase()) ?? { name, goals: 0, assists: 0, ratingSum: 0, games: 0 };
      t.goals += p.goals ?? 0;
      t.assists += p.assists ?? 0;
      if (typeof p.rating === "number") {
        t.ratingSum += p.rating;
        t.games += 1;
      }
      totals.set(name.toLowerCase(), t);
    }
  }
  type Total = typeof totals extends Map<string, infer V> ? V : never;
  const list = [...totals.values()];
  const best = (score: (t: Total) => number, keep: (t: Total) => boolean): Total | undefined =>
    list.filter(keep).sort((a, b) => score(b) - score(a))[0];
  const minGames = Math.min(3, matches.length);
  return {
    scorer: best((t) => t.goals, (t) => t.goals > 0),
    creator: best((t) => t.assists, (t) => t.assists > 0),
    rated: best((t) => t.ratingSum / t.games, (t) => t.games >= minGames),
  };
}

export default function Dashboard() {
  const { selectedGuildId, selectedGuild, isLoading: guildLoading } = useGuild();
  const clubNames = useMemo(
    () => new Map((selectedGuild?.clubs || []).map((c) => [c.key, c.name])),
    [selectedGuild]
  );
  const multiClub = (selectedGuild?.clubs || []).filter((c) => c.enabled).length > 1;

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["match-night-events", selectedGuildId],
    queryFn: async (): Promise<UpcomingEvent[]> => {
      // Keep tonight's game on screen until a few hours after kick-off
      const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("availability_events")
        .select("id, title, event_type, scheduled_at, club_key")
        .eq("guild_id", selectedGuildId!)
        .eq("closed", false)
        .gte("scheduled_at", since)
        .order("scheduled_at", { ascending: true })
        .limit(4);
      if (error) throw error;
      const rows = data || [];
      const ids = rows.map((e) => e.id);
      const { data: responses } = ids.length
        ? await supabase.from("player_availability").select("event_id, response").in("event_id", ids)
        : { data: [] as { event_id: string; response: string }[] };
      return rows.map((e) => {
        const mine = (responses || []).filter((r) => r.event_id === e.id);
        const count = (r: string) => mine.filter((x) => x.response === r).length;
        return { ...e, counts: { yes: count("yes"), maybe: count("maybe"), no: count("no") } };
      });
    },
    enabled: !!selectedGuildId,
  });

  const { data: matchRows, isLoading: matchesLoading } = useQuery({
    queryKey: ["match-night-results", selectedGuildId],
    queryFn: async (): Promise<(ClubMatchRow & { club_key: string | null })[]> => {
      const { data, error } = await supabase
        .from("club_matches")
        .select("id, result, score_for, score_against, match_type, created_at, opponent_club_name, player_stats, match_data, club_key")
        .eq("guild_id", selectedGuildId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as (ClubMatchRow & { club_key: string | null })[];
    },
    enabled: !!selectedGuildId,
  });

  const { data: squadSize } = useQuery({
    queryKey: ["match-night-squad", selectedGuildId],
    queryFn: async () => {
      const { count } = await supabase
        .from("player_summary")
        .select("*", { count: "exact", head: true })
        .eq("guild_id", selectedGuildId!);
      return count ?? 0;
    },
    enabled: !!selectedGuildId,
  });

  const matches = useMemo(() => toInsightMatches(matchRows || []), [matchRows]);
  const clubOf = useMemo(() => new Map((matchRows || []).map((r) => [r.id, r.club_key])), [matchRows]);
  const overview = useMemo(() => computeOverview(matches), [matches]);
  const leaders = useMemo(() => topPerformers(matches), [matches]);
  const [nextEvent, ...laterEvents] = events || [];

  if (!selectedGuildId && !guildLoading) {
    return (
      <DashboardLayout>
        <PageHeader title="Match Night" className="mb-6" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Pick a Discord server at the top to see your club.
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        className="mb-6"
        title="Match Night"
        description={selectedGuild?.name ?? "Your club at a glance"}
        actions={selectedGuildId && <SyncMatchesButton guildId={selectedGuildId} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start lg:gap-6">
        {/* Next fixture */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="bg-gradient-hero px-5 py-5 text-primary-foreground md:px-6 md:py-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-90">
              <CalendarClock className="h-4 w-4" />
              Next up
            </div>
            {eventsLoading ? (
              <Loader2 className="mt-4 h-6 w-6 animate-spin" />
            ) : nextEvent ? (
              <>
                <span className="mt-2 inline-block rounded bg-background/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
                  {eventKind(nextEvent.title, nextEvent.event_type)}
                </span>
                <h2 className="mt-1 font-display text-2xl font-bold leading-tight md:text-3xl">{nextEvent.title}</h2>
                <p className="mt-1 text-sm opacity-90">
                  {kickoffLabel(new Date(nextEvent.scheduled_at))}
                  {" · "}
                  {new Date(nextEvent.scheduled_at) > new Date()
                    ? `in ${formatDistanceToNowStrict(new Date(nextEvent.scheduled_at))}`
                    : "kicked off"}
                  {multiClub && nextEvent.club_key && clubNames.get(nextEvent.club_key)
                    ? ` · ${clubNames.get(nextEvent.club_key)}`
                    : ""}
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-2 font-display text-2xl font-bold">Nothing scheduled</h2>
                <p className="mt-1 text-sm opacity-90">
                  Post a board in Discord with <code className="rounded bg-black/20 px-1">/manager → Events → New Event</code> and answers show up here.
                </p>
              </>
            )}
          </div>
          <CardContent className="p-5 md:p-6">
            {nextEvent ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="grid grid-cols-3 gap-3 sm:gap-6">
                  {[
                    { label: "Available", value: nextEvent.counts.yes, tone: "text-success" },
                    { label: "Maybe", value: nextEvent.counts.maybe, tone: "text-warning" },
                    { label: "Out", value: nextEvent.counts.no, tone: "text-destructive" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className={cn("font-display text-3xl font-bold leading-none", s.tone)}>{s.value}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to={`/teams?event=${nextEvent.id}`}>
                    <UsersRound className="mr-2 h-4 w-4" />
                    Build the lineup
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link to="/teams">
                    <UsersRound className="mr-2 h-4 w-4" />
                    Open Lineup Builder
                  </Link>
                </Button>
              </div>
            )}
            {laterEvents.length > 0 && (
              <ul className="mt-5 divide-y divide-border border-t">
                {laterEvents.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/teams?event=${e.id}`}
                      className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-primary"
                    >
                      <CalendarPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Badge variant="outline" className="shrink-0">{eventKind(e.title, e.event_type)}</Badge>
                      <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                      <span className="shrink-0 text-muted-foreground">{kickoffLabel(new Date(e.scheduled_at))}</span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{e.counts.yes} in</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Form</CardTitle>
          </CardHeader>
          <CardContent>
            {matchesLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No synced matches yet. Hit Sync Latest Matches after a game.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {overview.form.map((r, i) => (
                    <ResultChip key={i} result={r} />
                  ))}
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs text-muted-foreground">W-D-L</dt>
                    <dd className="mt-1 font-display text-xl font-bold">
                      {overview.wins}-{overview.draws}-{overview.losses}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs text-muted-foreground">Goals</dt>
                    <dd className="mt-1 font-display text-xl font-bold">
                      {overview.goalsFor}:{overview.goalsAgainst}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs text-muted-foreground">Squad</dt>
                    <dd className="mt-1 font-display text-xl font-bold">{squadSize ?? "–"}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">Last {matches.length} synced matches, latest first.</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent results */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Recent results</CardTitle>
            <Button asChild variant="ghost" size="sm" className="-mr-2 text-muted-foreground">
              <Link to="/games">
                All games <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {matches.length === 0 ? (
              <p className="px-6 pb-4 text-sm text-muted-foreground">Results appear here once matches sync from EA.</p>
            ) : (
              <ul className="divide-y divide-border">
                {matches.slice(0, 6).map((m) => {
                  const scorers = m.players
                    .filter((p) => (p.goals ?? 0) > 0)
                    .map((p) => `${p.ea_username}${(p.goals ?? 0) > 1 ? ` ×${p.goals}` : ""}`)
                    .join(", ");
                  const club = clubOf.get(m.id);
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-6 py-3">
                      <ResultChip result={m.result} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">vs {m.opponent}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {format(m.playedAt, "EEE d MMM")}
                          {m.competition !== "league" ? ` · ${competitionLabel(m.competition)}` : ""}
                          {multiClub && club && clubNames.get(club) ? ` · ${clubNames.get(club)}` : ""}
                          {scorers ? ` · ⚽ ${scorers}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 font-display text-lg font-bold tabular-nums">
                        {m.scoreFor}–{m.scoreAgainst}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* In form */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">In form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { icon: Goal, label: "Top scorer", who: leaders.scorer, stat: leaders.scorer && `${leaders.scorer.goals} goals` },
              { icon: Handshake, label: "Top creator", who: leaders.creator, stat: leaders.creator && `${leaders.creator.assists} assists` },
              {
                icon: Star,
                label: "Best average rating",
                who: leaders.rated,
                stat: leaders.rated && (leaders.rated.ratingSum / leaders.rated.games).toFixed(1),
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <row.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{row.label}</div>
                  <div className="truncate text-sm font-medium">{row.who?.name ?? "–"}</div>
                </div>
                {row.stat && <Badge variant="secondary">{row.stat}</Badge>}
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">From the same recent matches.</p>
          </CardContent>
        </Card>
      </div>

      {/* Shortcuts */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:mt-6">
        {[
          { to: "/teams", icon: UsersRound, title: "Lineup Builder", text: "Pick the XI and post it" },
          { to: "/leaderboard", icon: Trophy, title: "Club Stats", text: "Who's carrying the team" },
          { to: "/insights", icon: Lightbulb, title: "Tactical Insights", text: "Pairings and formations" },
          { to: "/scouting", icon: Shield, title: "Scouting", text: "Opponents and targets" },
        ].map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <s.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 text-sm font-semibold">{s.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.text}</div>
          </Link>
        ))}
      </div>
    </DashboardLayout>
  );
}
