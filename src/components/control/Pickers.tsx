// Pickers for the control room: server members, autocomplete suggestions and channels,
// matching the dropdowns the Discord forms show.
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { webPanel, type PanelChannel } from "@/lib/webPanel";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

// A searchable dropdown; `load` fetches options for what was typed (server-side search)
export function SearchPicker({
  value,
  valueLabel,
  onChange,
  load,
  placeholder = "Pick one",
  allowTyped = false,
}: {
  value: string | null;
  valueLabel?: string | null;
  onChange: (value: string | null, label?: string) => void;
  load: (query: string) => Promise<Option[]>;
  placeholder?: string;
  allowTyped?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setFailed(null);
    load(debounced)
      .then((list) => alive && setOptions(list))
      .catch((err: Error) => alive && setFailed(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // load is recreated by parents on every render; the query and open state decide refetches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debounced]);

  const shown = valueLabel || options.find((o) => o.value === value)?.label || value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? shown : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search…" value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
              </div>
            )}
            {!loading && failed && <div className="px-3 py-4 text-sm text-destructive">{failed}</div>}
            {!loading && !failed && <CommandEmpty>Nothing found.</CommandEmpty>}
            <CommandGroup>
              {allowTyped && query.trim() && !options.some((o) => o.value === query.trim()) && (
                <CommandItem
                  value={`typed:${query}`}
                  onSelect={() => {
                    onChange(query.trim(), query.trim());
                    setOpen(false);
                  }}
                >
                  Use “{query.trim()}”
                </CommandItem>
              )}
              {!loading &&
                options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    onSelect={() => {
                      onChange(o.value === value ? null : o.value, o.label);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", o.value === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="ml-auto pl-2 text-xs text-muted-foreground">{o.hint}</span>}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function MemberPicker({ guildId, value, valueLabel, onChange }: { guildId: string; value: string | null; valueLabel?: string | null; onChange: (id: string | null, label?: string) => void }) {
  return (
    <SearchPicker
      value={value}
      valueLabel={valueLabel}
      onChange={onChange}
      placeholder="Pick a player"
      load={async (q) => (await webPanel.members(guildId, q)).members.map((m) => ({ value: m.id, label: m.name, hint: m.username }))}
    />
  );
}

const TEXT_TYPES = [0, 5];

export function ChannelPicker({
  channels,
  types = TEXT_TYPES,
  value,
  onChange,
  sendableOnly = false,
  placeholder = "Pick a channel",
}: {
  channels: PanelChannel[];
  types?: number[];
  value: string | null;
  onChange: (id: string) => void;
  sendableOnly?: boolean;
  placeholder?: string;
}) {
  const list = channels.filter((c) => types.includes(c.type) && (!sendableOnly || c.canSend));
  const groups = new Map<string, PanelChannel[]>();
  for (const c of list) {
    const key = c.parent || "";
    groups.set(key, [...(groups.get(key) || []), c]);
  }
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="h-10">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {[...groups.entries()].map(([parent, items]) => (
          <SelectGroup key={parent || "none"}>
            {parent && <SelectLabel className="text-xs uppercase tracking-wide text-muted-foreground">{parent}</SelectLabel>}
            {items.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {[2, 13].includes(c.type) ? "🔊 " : "# "}
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
