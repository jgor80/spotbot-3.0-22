import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PUBLIC_PLATFORMS, publicClubPath, type PublicClubPayload, type PublicPlatform } from "@/lib/publicClub";

export interface ClubHit {
  clubId: string;
  platform: PublicPlatform;
  name: string;
  crest: string | null;
  skillRating: number | null;
  games: number | null;
}

async function call<T>(query: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`public-club?${query}`, { method: "GET" });
  if (error) {
    // The function's own message (e.g. EA unavailable, no such club) is in the response body
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error || "Couldn't reach the club data right now.");
  }
  return data as T;
}

export function usePublicClub(platform: PublicPlatform | null, clubId: string | null) {
  return useQuery({
    queryKey: ["public-club", platform, clubId],
    enabled: !!platform && !!clubId,
    staleTime: 2 * 60_000,
    retry: false,
    queryFn: () => call<PublicClubPayload>(new URLSearchParams({ clubId: clubId!, platform: platform! }).toString()),
  });
}

export function platformLabel(p: PublicPlatform) {
  return PUBLIC_PLATFORMS.find((x) => x.value === p)?.label ?? p;
}

export function Crest({ src, name, className = "h-10 w-10" }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img src={src} alt="" className={`${className} shrink-0 object-contain`} onError={() => setFailed(true)} />;
  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-full bg-muted font-display text-sm font-bold`}>
      {name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
    </div>
  );
}

// Search EA clubs by name; onPick gets the chosen club (defaults to linking to its page)
export function ClubSearch({ onPick, placeholder = "Search a club name" }: { onPick?: (c: ClubHit) => void; placeholder?: string }) {
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState<PublicPlatform | "all">("all");
  const [query, setQuery] = useState<{ q: string; platform: PublicPlatform | "all" } | null>(null);
  const results = useQuery({
    queryKey: ["public-club-search", query],
    enabled: !!query,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => {
      const params = new URLSearchParams({ search: query!.q });
      if (query!.platform !== "all") params.set("platform", query!.platform);
      return call<{ clubs: ClubHit[] }>(params.toString());
    },
  });

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 2) setQuery({ q: text.trim(), platform });
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={40} className="sm:flex-1" />
        <Select value={platform} onValueChange={(v) => setPlatform(v as PublicPlatform | "all")}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PUBLIC_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={text.trim().length < 2}><Search className="mr-1 h-4 w-4" /> Search</Button>
      </form>
      {results.isFetching && <p className="text-sm text-muted-foreground">Searching EA…</p>}
      {results.error && <p className="text-sm text-destructive">{(results.error as Error).message}</p>}
      {results.data && !results.data.clubs.length && <p className="text-sm text-muted-foreground">No clubs found with that name.</p>}
      {!!results.data?.clubs.length && (
        <div className="divide-y divide-border rounded-lg border">
          {results.data.clubs.map((c) => {
            const body = (
              <>
                <Crest src={c.crest} name={c.name} className="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{platformLabel(c.platform)}</span>
                {c.skillRating && <span className="text-sm tabular-nums text-muted-foreground">SR {c.skillRating}</span>}
              </>
            );
            return onPick ? (
              <button key={`${c.platform}:${c.clubId}`} type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted" onClick={() => onPick(c)}>
                {body}
              </button>
            ) : (
              <Link key={`${c.platform}:${c.clubId}`} to={publicClubPath(c.platform, c.clubId)} className="flex items-center gap-3 px-3 py-2 hover:bg-muted">
                {body}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
