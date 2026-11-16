// Knowledge Bank → Pro Clubs builds: the community meta build per position (Reddit + YouTube), and adding a build post,
// video or share link yourself. See src/lib/metaBuilds.ts and supabase/functions/_shared/fut/meta-builds.ts.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { CommunityMetaBuilds, META_PERIODS } from "@/components/build/CommunityMetaBuilds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function AddBuildSource() {
  const qc = useQueryClient();
  const [url, setUrl] = useState(""), [text, setText] = useState(""), [share, setShare] = useState(true);
  const add = useMutation({
    mutationFn: () => futApi.knowledge.add({ url: url.trim() || undefined, text: text.trim() || undefined, share, area: "proclubs" }),
    onSuccess: () => { setUrl(""); setText(""); qc.invalidateQueries({ queryKey: ["meta-builds"] }); qc.invalidateQueries({ queryKey: futKeys.knowledge }); },
  });
  const r = add.data;
  return <section className="space-y-3 rounded-xl border border-border p-4">
    <div>
      <h2 className="font-semibold">Add a build</h2>
      <p className="text-sm text-muted-foreground">A Reddit post, a YouTube video, a Pro Clubs Builder or GafferBot build link, or a build you paste in. GafferBot reads the builds out of it and adds them to the community picture.</p>
    </div>
    <div className="space-y-1.5"><Label htmlFor="kb-build-url">Link</Label><Input id="kb-build-url" value={url} placeholder="https://..." onChange={(e) => setUrl(e.target.value)} /></div>
    <div className="space-y-1.5"><Label htmlFor="kb-build-text">Text (optional with a Reddit, YouTube or build link)</Label>
      <Textarea id="kb-build-text" rows={4} value={text} maxLength={12_000} placeholder="e.g. ST: Finisher, 6'1, 80 kg, 4★ skills, 5★ weak foot. Finesse Shot, Quick Step, Rapid. Max finishing and acceleration first." onChange={(e) => setText(e.target.value)} /></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm"><Switch checked={share} onCheckedChange={setShare} disabled={!url.trim()} /> Count it in the community builds (links only)</label>
      <Button onClick={() => add.mutate()} disabled={add.isPending || (!url.trim() && !text.trim())}><Plus className="mr-1 h-4 w-4" />{add.isPending ? "Adding..." : "Add"}</Button>
    </div>
    <ErrorNotice error={add.error} />
    {r && <p className="text-sm text-muted-foreground" role="status">Added. Claude is reading the builds out of it now (up to a minute); you can follow it on the Sources tab under Added by me. {r.shared ? "Once read, it counts in the community builds." : "It's kept private to you."}</p>}
  </section>;
}

export function ProClubsBuilds() {
  const [days, setDays] = useState<number>(180);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="max-w-2xl text-sm text-muted-foreground">
        What the Pro Clubs community says is the best Virtual Pro build for each position: archetype, body, skill moves, PlayStyles and the attributes to max, from r/ProClubs and Pro Clubs build videos. Newer builds count more.
      </p>
      <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
        <SelectTrigger className="w-40" aria-label="Period"><SelectValue /></SelectTrigger>
        <SelectContent>{META_PERIODS.map((d) => <SelectItem key={d} value={String(d)}>Last {d} days</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <CommunityMetaBuilds key={days} days={days} />
    <AddBuildSource />
  </div>;
}
