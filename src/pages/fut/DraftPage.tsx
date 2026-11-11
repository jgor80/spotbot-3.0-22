import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dices, Gift, Trophy } from "lucide-react";
import { futApi, futKeys, type DraftCard, type DraftOptions } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { FutCardArt } from "@/components/fut/FutCardArt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const PACKS = [{ key: "gold", label: "Gold Players" }, { key: "rare", label: "Rare Players" }, { key: "x10_84", label: "84+ x10" }, { key: "x5_87", label: "87+ x5" }];
const art = (c: DraftCard) => ({ name: c.name, rating: c.overall, position: c.positions[0] ?? null, version: c.version, is_icon: c.is_icon, is_hero: c.is_hero, ea_item_id: c.ea_item_id });

function Draft({ enabled }: { enabled: boolean }) {
  const [params, setParams] = useSearchParams();
  const [formation, setFormation] = useState("4-3-3"), [code, setCode] = useState(params.get("seed") ?? "");
  const [draft, setDraft] = useState<DraftOptions | null>(null), [picks, setPicks] = useState<Record<string, string>>({});
  const formations = useQuery({ queryKey: futKeys.formationSlots, queryFn: futApi.formationSlots, enabled, staleTime: Infinity });
  const start = useMutation({ mutationFn: () => futApi.draft(formation, code.trim().toLowerCase() || undefined), onSuccess: d => { setDraft(d); setPicks({}); setCode(d.seed); setParams({ seed: d.seed }, { replace: true }); finish.reset(); } });
  const finish = useMutation({ mutationFn: () => futApi.finishDraft({ seed: draft!.seed, formation: draft!.formation, picks }) });
  const done = draft ? draft.slots.every(s => picks[s.slot]) : false;
  const pickedNames = new Set(Object.entries(picks).map(([slot, id]) => draft?.slots.find(s => s.slot === slot)?.options.find(o => o.id === id)?.name.toLowerCase()));
  return <Section title="Draft">
    <p className="text-sm text-muted-foreground">Five real FC 27 cards per slot; pick one each. The same code gives everyone the same options, so you can race your mates. Score = team rating + chemistry.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); start.mutate(); }}>
      <div className="space-y-1.5"><Label>Formation</Label><Select value={formation} onValueChange={setFormation}><SelectTrigger className="w-36" aria-label="Formation"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(formations.data ?? { "4-3-3": [] }).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="draft-code">Code (optional)</Label><Input id="draft-code" className="w-36" maxLength={16} value={code} onChange={e => setCode(e.target.value)} placeholder="New code" /></div>
      <Button type="submit" disabled={start.isPending}><Dices className="mr-2 h-4 w-4" />{start.isPending ? "Dealing…" : "Start draft"}</Button>
    </form>
    <ErrorNotice error={start.error || finish.error} />
    {draft && <div className="space-y-4">
      <p className="text-sm">Code <b>{draft.seed}</b> · {draft.formation} · {Object.keys(picks).length}/{draft.slots.length} picked</p>
      {draft.slots.map(s => <div key={s.slot} className="space-y-1">
        <p className="text-sm font-medium">{s.slot}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">{s.options.map(o => {
          const on = picks[s.slot] === o.id, dupe = !on && pickedNames.has(o.name.toLowerCase());
          return <button key={o.id} type="button" disabled={dupe || !!finish.data} aria-pressed={on} title={`${o.name} · ${o.club ?? ""} · ${o.league ?? ""} · ${o.nation ?? ""}`} onClick={() => setPicks(p => ({ ...p, [s.slot]: o.id }))} className={`shrink-0 rounded-md border-2 p-1 ${on ? "border-primary" : "border-transparent"} ${dupe ? "opacity-40" : ""}`}><FutCardArt card={art(o)} compact className="w-16" /><span className="block w-16 truncate text-[10px]">{o.club}</span></button>;
        })}</div>
      </div>)}
      <Button disabled={!done || finish.isPending || !!finish.data} onClick={() => finish.mutate()}><Trophy className="mr-2 h-4 w-4" />{finish.isPending ? "Scoring…" : "Finish draft"}</Button>
      {finish.data && <p className="font-display text-lg font-semibold">Score {finish.data.score}: rating {finish.data.rating}, chemistry {finish.data.chemistry}/33.{finish.data.personal_best ? " Your best on this code." : ` Your best is ${finish.data.previous_best}.`}</p>}
    </div>}
  </Section>;
}

function Packs({ platform }: { platform: "console" | "pc" }) {
  const [pack, setPack] = useState("rare");
  const open = useMutation({ mutationFn: () => futApi.openSimPack(pack, platform) });
  const d = open.data;
  return <Section title="Pack opener">
    <p className="text-sm text-muted-foreground">For fun: simulated packs with made-up odds, not EA's. Nothing is opened in your club.</p>
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5"><Label>Pack</Label><Select value={pack} onValueChange={setPack}><SelectTrigger className="w-40" aria-label="Pack"><SelectValue /></SelectTrigger><SelectContent>{PACKS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent></Select></div>
      <Button disabled={open.isPending} onClick={() => open.mutate()}><Gift className="mr-2 h-4 w-4" />{open.isPending ? "Opening…" : "Open pack"}</Button>
    </div>
    <ErrorNotice error={open.error} />
    {d && <div className="space-y-2">
      <p className="text-sm">{d.label}: best <b>{d.best?.name} {d.best?.overall}</b> · worth about {numberText(d.value)} coins on FUT.GG</p>
      <div className="flex flex-wrap gap-2">{d.cards.map(c => <div key={c.id} className="w-16"><FutCardArt card={art(c)} compact className="w-16" /><span className="block truncate text-[10px] text-muted-foreground">{c.price ? numberText(c.price) : "–"}</span></div>)}</div>
    </div>}
  </Section>;
}

/** Draft simulator (shareable codes for Discord draft nights) and a for-fun pack opener. */
export default function DraftPage() {
  const context = useMarketPlatform();
  return <MarketShell title="Draft and Packs" showTabs={false} {...context}>
    <Draft enabled={context.enabled} />
    <Packs platform={context.platform} />
  </MarketShell>;
}
