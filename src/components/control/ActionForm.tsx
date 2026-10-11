// The form for a panel action: the same inputs the Discord form asks for, with web pickers.
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChannelPicker, MemberPicker, SearchPicker } from "@/components/control/Pickers";
import { webPanel, type PanelAction, type PanelContext, type PanelField } from "@/lib/webPanel";

const LONG_TEXT = new Set(["note", "notes", "description", "message", "reason"]);
// Autocomplete inputs where any typed value is fine (as in the Discord forms)
const TYPED_OK = new Set(["zone", "username"]);
const NONE = "__none";

// Today's date and the next 5 minutes in the server's timezone, as the Discord form preselects
function nowIn(tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  const mins = Math.min(Math.ceil((Number(p.hour) * 60 + Number(p.minute)) / 5) * 5, 23 * 60 + 55);
  const time = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { date: `${p.year}-${p.month}-${p.day}`, time };
}

export type FormValues = Record<string, string | null>;

function FieldInput({
  field,
  value,
  label,
  onChange,
  ctx,
  actionId,
  channelId,
}: {
  field: PanelField;
  value: string | null;
  label: string | null;
  onChange: (value: string | null, label?: string) => void;
  ctx: PanelContext;
  actionId: string;
  channelId: string | null;
}) {
  if (field.kind === "when") {
    const [date = "", time = ""] = (value || "").split(" ");
    const zone = ctx.timezone.replace(/_/g, " ");
    return (
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input type="date" value={date} onChange={(e) => onChange(e.target.value ? `${e.target.value} ${time || "20:00"}` : null)} />
          <Input type="time" step={300} value={time} onChange={(e) => onChange(e.target.value ? `${date || nowIn(ctx.timezone).date} ${e.target.value}` : null)} className="w-32" />
        </div>
        <p className="text-xs text-muted-foreground">Server time ({zone}). Change it under Events → Timezone.</p>
      </div>
    );
  }
  if (field.choices) {
    return (
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger className="h-10">
          <SelectValue placeholder={field.required ? "Pick one" : "Optional"} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {!field.required && <SelectItem value={NONE}>None</SelectItem>}
          {field.choices.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.autocomplete) {
    return (
      <SearchPicker
        value={value}
        valueLabel={label}
        onChange={onChange}
        allowTyped={TYPED_OK.has(field.name)}
        placeholder={field.required ? "Pick one" : "Optional"}
        load={async (q) => (await webPanel.choices(ctx.guild.id, actionId, field.name, q, channelId)).choices.map((c) => ({ value: c.value, label: c.name }))}
      />
    );
  }
  if (field.type === 6 || field.type === 9) return <MemberPicker guildId={ctx.guild.id} value={value} valueLabel={label} onChange={onChange} />;
  if (field.type === 7) return <ChannelPicker channels={ctx.channels} types={field.channelTypes} value={value} onChange={(id) => onChange(id)} />;
  if (field.type === 8) {
    return (
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger className="h-10">
          <SelectValue placeholder="Pick a role" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {!field.required && <SelectItem value={NONE}>None</SelectItem>}
          {ctx.roles.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              <span style={r.color ? { color: r.color } : undefined}>@{r.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === 5) {
    return (
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger className="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {!field.required && <SelectItem value={NONE}>Default</SelectItem>}
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (field.type === 4 || field.type === 10) {
    return (
      <Input
        type="number"
        inputMode="decimal"
        step={field.type === 4 ? 1 : "any"}
        min={field.min}
        max={field.max}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }
  const props = {
    value: value ?? "",
    maxLength: Math.min(field.maxLength || 4000, 4000),
    placeholder: field.name === "formation" ? "e.g. 4-3-3, 4-2-3-1 wide" : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
  };
  return LONG_TEXT.has(field.name) ? <Textarea rows={3} {...props} /> : <Input {...props} />;
}

export function ActionForm({
  action,
  ctx,
  channelId,
  open,
  onOpenChange,
  onSubmit,
}: {
  action: PanelAction | null;
  ctx: PanelContext;
  channelId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FormValues) => Promise<void>;
}) {
  const initial = useMemo(() => {
    const v: FormValues = {};
    for (const f of action?.fields || []) {
      if (f.kind === "when" && f.required) {
        const n = nowIn(ctx.timezone);
        v[f.name] = `${n.date} ${n.time}`;
      }
    }
    return v;
  }, [action, ctx.timezone]);
  const [values, setValues] = useState<FormValues>(initial);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  if (action && action.id !== lastAction) {
    setLastAction(action.id);
    setValues(initial);
    setLabels({});
  }
  if (!action) return null;
  const missing = action.fields.filter((f) => f.required && !values[f.name]);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {action.emoji} {action.label}
          </DialogTitle>
          <DialogDescription>{action.hint || "Same as the button in Discord. Leave optional boxes empty to use the defaults."}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (missing.length) return;
            setBusy(true);
            try {
              await onSubmit(values);
            } finally {
              setBusy(false);
            }
          }}
        >
          {action.fields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label className="flex items-baseline gap-1">
                {f.kind === "when" ? "Kick-off" : f.label}
                {f.required && <span className="text-destructive">*</span>}
              </Label>
              {f.description && f.kind !== "when" && <p className="text-xs text-muted-foreground">{f.description}</p>}
              <FieldInput
                field={f}
                value={values[f.name] ?? null}
                label={labels[f.name] ?? null}
                ctx={ctx}
                actionId={action.id}
                channelId={channelId}
                onChange={(v, l) => {
                  setValues((s) => ({ ...s, [f.name]: v }));
                  if (l) setLabels((s) => ({ ...s, [f.name]: l }));
                }}
              />
            </div>
          ))}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || missing.length > 0}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
