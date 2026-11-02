import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FutCard, Evidence, Stats } from "@/lib/futApi";
import { evidenceLabels } from "./FutShared";

export const POSITIONS = ["GK", "LB", "CB", "RB", "LWB", "RWB", "CDM", "CM", "LM", "RM", "CAM", "LW", "RW", "CF", "ST"];
const blank: Omit<FutCard, "id"> = { player_name: "", version: "", overall: 75, positions: [], club: "", league: "", nation: "", is_icon: false, is_hero: false, skill_moves: 3, weak_foot: 3, stats: { pac: 50, sho: 50, pas: 50, dri: 50, def: 50, phy: 50 }, playstyles: [], playstyles_plus: [], evidence: "game_data", notes: "", owned: true, tradeable: false, purchase_price: null, price: null };
export function CardForm({ initial, pending, onSave }: { initial?: FutCard; pending: boolean; onSave: (card: Omit<FutCard, "id">) => void }) {
  const [form, setForm] = useState<Omit<FutCard, "id">>(initial ?? blank);
  const [styles, setStyles] = useState(initial?.playstyles.join(", ") ?? "");
  const [plus, setPlus] = useState(initial?.playstyles_plus.join(", ") ?? "");
  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm(f => ({ ...f, [key]: value }));
  const textFields = [["player_name", "Player name"], ["version", "Version"], ["club", "Club"], ["league", "League"], ["nation", "Nation"]] as const;
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); onSave({ ...form, playstyles: styles.split(",").map(s => s.trim()).filter(Boolean), playstyles_plus: plus.split(",").map(s => s.trim()).filter(Boolean) }); }}>
    <div className="grid gap-3 sm:grid-cols-2">{textFields.map(([key, title]) => <div className="space-y-1.5" key={key}><Label htmlFor={`card-${key}`}>{title}</Label><Input id={`card-${key}`} required={key !== "version"} value={form[key] ?? ""} onChange={e => update(key, e.target.value)} /></div>)}
      {([['overall', 'Overall', 99], ['skill_moves', 'Skill moves', 5], ['weak_foot', 'Weak foot', 5]] as const).map(([key, title, max]) => <div key={key} className="space-y-1.5"><Label htmlFor={`card-${key}`}>{title}</Label><Input id={`card-${key}`} type="number" min={1} max={max} required value={form[key]} onChange={e => update(key, Number(e.target.value))} /></div>)}
    </div>
    <fieldset className="space-y-2"><legend className="text-sm font-medium">Positions</legend><div className="flex flex-wrap gap-2">{POSITIONS.map(position => <Button key={position} type="button" size="sm" variant={form.positions.includes(position) ? "default" : "outline"} aria-pressed={form.positions.includes(position)} onClick={() => update("positions", form.positions.includes(position) ? form.positions.filter(p => p !== position) : [...form.positions, position])}>{position}</Button>)}</div></fieldset>
    <fieldset><legend className="mb-2 text-sm font-medium">Stats</legend><div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{(Object.keys(form.stats) as (keyof Stats)[]).map(key => <div key={key} className="space-y-1.5"><Label htmlFor={`stat-${key}`}>{key.toUpperCase()}</Label><Input id={`stat-${key}`} type="number" min={0} max={99} required value={form.stats[key]} onChange={e => update("stats", { ...form.stats, [key]: Number(e.target.value) })} /></div>)}</div></fieldset>
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="playstyles">Playstyles</Label><Input id="playstyles" value={styles} onChange={e => setStyles(e.target.value)} placeholder="Finesse Shot, Rapid" /></div><div className="space-y-1.5"><Label htmlFor="playstyles-plus">Playstyles+</Label><Input id="playstyles-plus" value={plus} onChange={e => setPlus(e.target.value)} placeholder="Finesse Shot+" /></div>
      <div className="space-y-1.5"><Label>Evidence</Label><Select value={form.evidence} onValueChange={v => update("evidence", v as Evidence)}><SelectTrigger aria-label="Evidence"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(evidenceLabels).map(([key, title]) => <SelectItem key={key} value={key}>{title}</SelectItem>)}</SelectContent></Select></div>
      {([['price', 'Price (user-entered coins)'], ['purchase_price', 'Purchase price (user-entered coins)']] as const).map(([key, title]) => <div className="space-y-1.5" key={key}><Label htmlFor={`card-${key}`}>{title}</Label><Input id={`card-${key}`} type="number" min={0} step={1} value={form[key] ?? ""} onChange={e => update(key, e.target.value === "" ? null : Number(e.target.value))} /></div>)}
    </div>
    <div className="flex flex-wrap gap-5">{([['owned', 'Owned'], ['tradeable', 'Tradeable'], ['is_icon', 'Icon'], ['is_hero', 'Hero']] as const).map(([key, title]) => <Label key={key} className="flex items-center gap-2"><Checkbox checked={form[key]} onCheckedChange={v => update(key, v === true)} />{title}</Label>)}</div>
    <div className="space-y-1.5"><Label htmlFor="card-notes">Notes</Label><Textarea id="card-notes" value={form.notes} onChange={e => update("notes", e.target.value)} /></div>
    <Button type="submit" disabled={pending || form.positions.length === 0}>{pending ? "Saving…" : "Save card"}</Button>
  </form>;
}
