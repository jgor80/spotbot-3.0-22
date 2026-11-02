import { FutSquad } from "@/lib/futApi";
import { ApiDetails } from "./FutShared";
import { firstField, linkLine, record, remainingFields, swapLine } from "./chemistryPresentation";

function Extra({ value }: { value: Record<string, unknown> }) {
  return Object.keys(value).length ? <ApiDetails value={value} /> : null;
}
export function SwapChanges({ changes, squad }: { changes: unknown[]; squad: FutSquad }) {
  return changes.length ? <ul className="space-y-2">{changes.map((change, index) => {
    const row = record(change);
    const player = squad.slots.find(slot => slot.slot === row?.slot)?.card?.name;
    const line = swapLine(change, player);
    return <li key={index} className="space-y-1 text-sm">{line ? <><p className="break-words font-medium">{line.name}: {line.before} → {line.after}{line.signed !== undefined && ` (${line.signed})`}</p><Extra value={line.extra} /></> : <ApiDetails value={change} />}</li>;
  })}</ul> : <p className="text-sm text-muted-foreground">No player chemistry changes.</p>;
}
function SurgeonLinks({ value }: { value: unknown }) {
  const rows = Array.isArray(value) ? value.map(item => [undefined, item] as const) : Object.entries(record(value) ?? {});
  if (!rows.length) return <ApiDetails value={value} />;
  return <ul className="space-y-3">{rows.map(([kind, item], index) => {
    const link = linkLine(item, kind);
    return <li key={index} className="space-y-1 border-l-2 border-border pl-3 text-sm">{link ? <>
      <p className="font-medium">{link.category}{typeof link.name === "string" && ` · ${link.name}`}: {link.count}</p>
      {link.needed !== undefined && <p><ApiDetails value={link.needed} /> needed for the next point</p>}
      {link.threshold !== undefined && <p>Next point at <ApiDetails value={link.threshold} /></p>}
      {link.explanation !== undefined && <ApiDetails value={link.explanation} />}
      <Extra value={link.extra} />
    </> : <ApiDetails value={kind ? { [kind]: item } : item} />}</li>;
  })}</ul>;
}
export function SurgeonDetails({ value }: { value: unknown }) {
  if (Array.isArray(value)) return <div className="space-y-4">{value.map((item, index) => <SurgeonDetails key={index} value={item} />)}</div>;
  const row = record(value);
  if (!row) return <ApiDetails value={value} />;
  const name = firstField(row, ["name", "player_name"]);
  const explanation = firstField(row, ["explanation", "explanations", "text", "summary"]);
  const used: string[] = [];
  if (typeof name?.value === "string") used.push(name.key);
  if (explanation) used.push(explanation.key);
  if (row.links !== undefined) used.push("links");
  const nested = ["players", "diagnoses", "diagnosis", "slots"].filter(key => row[key] !== undefined);
  used.push(...nested);
  return <div className="space-y-3">
    {typeof name?.value === "string" && <p className="break-words font-medium">{name.value}</p>}
    {explanation && <ApiDetails value={explanation.value} />}
    {row.links !== undefined && <SurgeonLinks value={row.links} />}
    {nested.map(key => <SurgeonDetails key={key} value={row[key]} />)}
    <Extra value={remainingFields(row, used)} />
  </div>;
}
