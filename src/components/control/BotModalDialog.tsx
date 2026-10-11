// A form (modal) a GafferBot handler opened, drawn from Discord's modal JSON and answered as a modal submit.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChannelPicker, MemberPicker } from "@/components/control/Pickers";
import type { ApiObject, PanelContext } from "@/lib/webPanel";

interface ModalInput {
  label: string;
  description: string | null;
  c: ApiObject;
}

const NONE = "__none";

// Inputs in order, from both classic action rows and the newer label components
function inputsOf(json: ApiObject): { inputs: ModalInput[]; notes: string[] } {
  const inputs: ModalInput[] = [];
  const notes: string[] = [];
  for (const top of json.components || []) {
    if (top.type === 1) for (const c of top.components || []) inputs.push({ label: c.label || "", description: null, c });
    else if (top.type === 18 && top.component) inputs.push({ label: top.label || "", description: top.description || null, c: top.component });
    else if (top.type === 10 && top.content) notes.push(top.content);
  }
  return { inputs, notes };
}

function initialValues(inputs: ModalInput[]) {
  const v: Record<string, string | string[] | null> = {};
  for (const { c } of inputs) {
    if (c.type === 4) v[c.custom_id] = c.value ?? "";
    else if (c.type === 3) {
      const picked = (c.options || []).filter((o: ApiObject) => o.default).map((o: ApiObject) => o.value);
      v[c.custom_id] = picked;
    } else v[c.custom_id] = (c.default_values || []).map((d: ApiObject) => d.id);
  }
  return v;
}

export function BotModalDialog({
  modal,
  ctx,
  onClose,
  onSubmit,
}: {
  modal: ApiObject | null;
  ctx: PanelContext;
  onClose: () => void;
  onSubmit: (values: Record<string, string | string[] | null>) => Promise<void>;
}) {
  const { inputs, notes } = modal ? inputsOf(modal) : { inputs: [], notes: [] };
  const [values, setValues] = useState<Record<string, string | string[] | null>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (modal) setValues(initialValues(inputsOf(modal).inputs));
  }, [modal]);
  const set = (id: string, v: string | string[] | null) => setValues((s) => ({ ...s, [id]: v }));
  const fileOnly = inputs.some(({ c }) => c.type === 19 && c.required !== false);

  return (
    <Dialog open={!!modal} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modal?.title}</DialogTitle>
          {notes.length > 0 && <DialogDescription className="whitespace-pre-line">{notes.join("\n")}</DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onSubmit(values);
            } finally {
              setBusy(false);
            }
          }}
        >
          {inputs.map(({ label, description, c }) => {
            const id = c.custom_id as string;
            const required = c.required !== false;
            const v = values[id];
            let control: JSX.Element;
            if (c.type === 4) {
              const props = {
                value: (v as string) ?? "",
                placeholder: c.placeholder,
                maxLength: c.max_length,
                minLength: c.min_length,
                required,
                onChange: (e: { target: { value: string } }) => set(id, e.target.value),
              };
              control = c.style === 2 ? <Textarea rows={4} {...props} /> : <Input {...props} />;
            } else if (c.type === 3) {
              const picked = (v as string[]) || [];
              if ((c.max_values ?? 1) > 1) {
                control = (
                  <div className="flex flex-wrap gap-1.5">
                    {(c.options || []).map((o: ApiObject) => {
                      const on = picked.includes(o.value);
                      return (
                        <Button
                          key={o.value}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          disabled={!on && picked.length >= c.max_values}
                          onClick={() => set(id, on ? picked.filter((x) => x !== o.value) : [...picked, o.value])}
                        >
                          {o.emoji?.name && `${o.emoji.name} `}
                          {o.label}
                        </Button>
                      );
                    })}
                  </div>
                );
              } else {
                control = (
                  <Select value={picked[0] ?? NONE} onValueChange={(x) => set(id, x === NONE ? [] : [x])}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={c.placeholder || "Pick one"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {!required && <SelectItem value={NONE}>{c.placeholder || "None"}</SelectItem>}
                      {(c.options || []).map((o: ApiObject) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.emoji?.name && `${o.emoji.name} `}
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }
            } else if (c.type === 8) {
              control = <ChannelPicker channels={ctx.channels} types={c.channel_types?.length ? c.channel_types : [0, 5]} value={((v as string[]) || [])[0] ?? null} onChange={(x) => set(id, [x])} />;
            } else if (c.type === 6) {
              control = (
                <Select value={((v as string[]) || [])[0] ?? NONE} onValueChange={(x) => set(id, x === NONE ? [] : [x])}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Pick a role" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {!required && <SelectItem value={NONE}>None</SelectItem>}
                    {ctx.roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        @{r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            } else if (c.type === 5 || c.type === 7) {
              control = <MemberPicker guildId={ctx.guild.id} value={((v as string[]) || [])[0] ?? null} onChange={(x) => set(id, x ? [x] : [])} />;
            } else {
              control = <p className="text-sm text-muted-foreground">File uploads only work in Discord.</p>;
            }
            return (
              <div key={id} className="space-y-1.5">
                <Label>
                  {label}
                  {required && c.type !== 19 && <span className="text-destructive"> *</span>}
                </Label>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
                {control}
              </div>
            );
          })}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || fileOnly}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
