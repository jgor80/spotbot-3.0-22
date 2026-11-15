import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compareClubs, compareParam, parseCompareParam, publicClubPath } from "@/lib/publicClub";
import { ClubSearch, Crest, platformLabel, usePublicClub } from "@/components/publicClub/publicClubApi";

// /clubs: find any EA Pro Clubs club. /clubs/compare?a=<platform>:<id>&b=<platform>:<id>: two clubs side by side.
export function PublicClubsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">EA FC Pro Clubs</p>
          <h1 className="font-display text-3xl font-bold">Look up any club</h1>
          <p className="mt-1 text-muted-foreground">
            Record, form, team scores out of 1000 against real FC27 clubs, player scores and the squad. No sign-in.
          </p>
        </div>
        <Card className="p-5"><ClubSearch /></Card>
        <p className="text-sm text-muted-foreground">
          Want to size up an opponent? <Link to="/clubs/compare" className="underline">Compare two clubs</Link>. Looking for players or a club? Try the{" "}
          <Link to="/transfers" className="underline">transfer board</Link>.
        </p>
      </div>
    </div>
  );
}

function Side({ param, onPick, label }: { param: string | null; onPick: (v: string) => void; label: string }) {
  const parsed = parseCompareParam(param);
  const club = usePublicClub(parsed?.platform ?? null, parsed?.clubId ?? null);
  if (!parsed) {
    return (
      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold">{label}</div>
        <ClubSearch onPick={(c) => onPick(compareParam(c.platform, c.clubId))} />
      </Card>
    );
  }
  return (
    <Card className="flex items-center gap-3 p-4">
      {club.data ? <Crest src={club.data.crest} name={club.data.name} /> : <div className="h-10 w-10 rounded-full bg-muted" />}
      <div className="min-w-0 flex-1">
        <Link to={publicClubPath(parsed.platform, parsed.clubId)} className="block truncate font-semibold hover:underline">{club.data?.name ?? (club.error ? "Couldn't load" : "Loading…")}</Link>
        <div className="text-xs text-muted-foreground">{platformLabel(parsed.platform)}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onPick("")}>Change</Button>
    </Card>
  );
}

export function ClubComparePage() {
  const [params, setParams] = useSearchParams();
  const a = params.get("a"), b = params.get("b");
  const pa = parseCompareParam(a), pb = parseCompareParam(b);
  const ca = usePublicClub(pa?.platform ?? null, pa?.clubId ?? null);
  const cb = usePublicClub(pb?.platform ?? null, pb?.clubId ?? null);
  const result = useMemo(() => (ca.data && cb.data ? compareClubs(ca.data, cb.data) : null), [ca.data, cb.data]);
  const set = (key: "a" | "b") => (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(key, v);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link to="/clubs" className="text-sm text-muted-foreground hover:underline">← Find a club</Link>
          <h1 className="mt-2 font-display text-3xl font-bold">Club vs club</h1>
          <p className="mt-1 text-muted-foreground">Two clubs side by side: all-time record, recent form and team scores out of 1000.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Side param={a} onPick={set("a")} label="First club" />
          <Side param={b} onPick={set("b")} label="Second club" />
        </div>
        {result && ca.data && cb.data && (
          <Card className="p-5">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 text-sm sm:gap-x-8">
              <span />
              <span className="max-w-[7rem] truncate text-right font-semibold sm:max-w-none">{ca.data.name}</span>
              <span className="max-w-[7rem] truncate text-right font-semibold sm:max-w-none">{cb.data.name}</span>
              {result.rows.map((row) => (
                <div key={row.label} className="contents">
                  <span className="text-muted-foreground">{row.label}</span>
                  {[0, 1].map((i) => (
                    <span key={i} className={cn("text-right tabular-nums", row.better === i && "font-semibold text-green-600")}>{row.values[i]}</span>
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Recent numbers use the games EA still lists for each club, so the two may cover different stretches.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
