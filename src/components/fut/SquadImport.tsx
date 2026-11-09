import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, MessageSquareText, Paperclip, SendHorizontal, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { futApi, FutSquad, SlotCard, SquadImportImage, SquadImportResult, SquadImportRow } from "@/lib/futApi";
import { ErrorNotice } from "./FutShared";

type Message =
  | { id: number; role: "user"; text: string; file?: string }
  | { id: number; role: "bot"; result: SquadImportResult; before: FutSquad; undone?: boolean };

const MAX_SIDE = 1600;
const MAX_TEXT = 4000;

/** Shrink a screenshot to at most 1600px on its long side as JPEG, so uploads stay small and fast. */
async function readImage(file: File): Promise<SquadImportImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image couldn't be opened. Try a PNG or JPEG screenshot."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't read images.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
    return { media_type: "image/jpeg", data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const confidenceLabel: Record<SquadImportRow["confidence"], string> = { sure: "Match", likely: "Likely", check: "Check", missing: "Not found" };
const cardLine = (card: SlotCard, version: string | null) => `${card.name} ${card.rating}${version ? ` · ${version}` : ""}${card.owned ? " · owned" : ""}`;

function Reply({ message, squad, onPick, onUndo }: { message: Extract<Message, { role: "bot" }>; squad: FutSquad; onPick: (slot: string, card: SlotCard) => void; onUndo: () => void }) {
  const { result } = message;
  const placed = result.rows.filter(row => row.slot);
  const other = result.rows.filter(row => !row.slot);
  return <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
    <p className="font-medium">
      {placed.length ? `Placed ${placed.length} player${placed.length === 1 ? "" : "s"}` : "Nothing placed"}
      {result.formation_changed ? `, switched to ${result.formation_changed}` : ""}
      {result.cleared.length ? `, emptied ${result.cleared.join(", ")}` : ""}.
    </p>
    {result.note && <p className="text-muted-foreground">{result.note}</p>}
    <ul className="space-y-2">
      {placed.map(row => {
        const current = squad.slots.find(slot => slot.slot === row.slot)?.card;
        const chosen = row.options.find(option => option.card.id === current?.id) ?? row.options[0];
        return <li key={`${row.slot}-${row.input.name}`} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-14 justify-center">{row.slot}</Badge>
            <span className="min-w-0 break-words">{chosen ? cardLine(chosen.card, chosen.version) : row.input.name}</span>
            <Badge variant={row.confidence === "check" ? "destructive" : row.confidence === "likely" ? "secondary" : "outline"}>{confidenceLabel[row.confidence]}</Badge>
          </div>
          {row.options.length > 1 && !message.undone && <Select value={current?.id ?? ""} onValueChange={id => { const option = row.options.find(o => o.card.id === id); if (option && row.slot) onPick(row.slot, option.card); }}>
            <SelectTrigger className="h-8 text-xs" aria-label={`Other cards for ${row.input.name}`}><SelectValue placeholder="Pick a card" /></SelectTrigger>
            <SelectContent>{row.options.map(option => <SelectItem key={option.card.id} value={option.card.id}>{cardLine(option.card, option.version)}</SelectItem>)}</SelectContent>
          </Select>}
        </li>;
      })}
    </ul>
    {other.length > 0 && <div className="space-y-1 border-t border-border pt-2">
      <p className="text-xs font-medium text-muted-foreground">Not placed</p>
      <ul className="space-y-1">{other.map((row, i) => <li key={i}><span className="font-medium">{row.input.name}</span>{row.input.position ? ` (${row.input.position})` : ""}: <span className="text-muted-foreground">{row.reason ?? "No match."}</span></li>)}</ul>
    </div>}
    {!message.undone ? <Button variant="ghost" size="sm" onClick={onUndo}><Undo2 className="mr-2 h-4 w-4" />Undo this</Button> : <p className="text-xs text-muted-foreground">Undone.</p>}
  </div>;
}

/** "Import squad": tell the builder your squad in a chat, or upload a screenshot or a list. Results go straight into the squad (unsaved). */
export function SquadImport({ squad, onChange }: { squad: FutSquad; onChange: (squad: FutSquad | ((current: FutSquad) => FutSquad)) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [fileError, setFileError] = useState<Error | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const squadRef = useRef(squad);
  squadRef.current = squad;
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = useMutation({
    mutationFn: (input: { text?: string; image?: SquadImportImage; label: string; file?: string }) => futApi.importSquad(squadRef.current, { text: input.text, image: input.image }),
    onMutate: input => { setMessages(list => [...list, { id: nextId.current++, role: "user", text: input.label, file: input.file }]); },
    onSuccess: result => {
      const before = squadRef.current;
      setMessages(list => [...list, { id: nextId.current++, role: "bot", result, before }]);
      onChange(current => ({ ...result.squad, id: current.id, name: current.name, budget: current.budget, manager: current.manager }));
    },
  });

  const submit = () => {
    const value = text.trim();
    if (!value || send.isPending) return;
    send.mutate({ text: value, label: value });
    setText("");
  };
  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    try {
      if (file.type.startsWith("image/")) send.mutate({ image: await readImage(file), text: text.trim() || undefined, label: text.trim() || "Read my squad from this screenshot.", file: file.name });
      else {
        const body = (await file.text()).slice(0, MAX_TEXT);
        if (!body.trim()) throw new Error("That file is empty.");
        send.mutate({ text: body, label: `Uploaded ${file.name}`, file: file.name });
      }
      setText("");
    } catch (e) {
      setFileError(e instanceof Error ? e : new Error(String(e)));
    }
  };
  const pick = (slot: string, card: SlotCard) => onChange(current => ({ ...current, slots: current.slots.map(s => s.slot === slot ? { ...s, card } : s.card?.id === card.id ? { ...s, card: null } : s) }));
  const undo = (id: number) => {
    const message = messages.find(m => m.id === id);
    if (!message || message.role !== "bot") return;
    onChange(current => ({ ...message.before, id: current.id, name: current.name, budget: current.budget, manager: current.manager }));
    setMessages(list => list.map(m => m.id === id ? { ...m, undone: true } as Message : m));
  };

  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><MessageSquareText className="mr-2 h-4 w-4" />Import squad</Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Import your squad</SheetTitle>
          <SheetDescription>Type your players, paste a list, or upload a screenshot of your squad from the Web App or console. Players are matched to your cards first, then the market card list. Nothing is saved until you press Save.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.length === 0 && <div className="space-y-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            <p>Try:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>ST Mbappe 91, CAM Odegaard, RW Saka</li>
              <li>One player per line, like "GK Donnarumma"</li>
              <li>"Switch to 4-4-2 and put the TOTW Mbappe up top"</li>
              <li>A screenshot of your squad, or a .csv / .txt list</li>
            </ul>
          </div>}
          {messages.map(message => message.role === "user"
            ? <div key={message.id} className="ml-8 whitespace-pre-wrap break-words rounded-lg bg-primary/10 p-3 text-sm">{message.file && <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" />{message.file}</span>}{message.text}</div>
            : <Reply key={message.id} message={message} squad={squad} onPick={pick} onUndo={() => undo(message.id)} />)}
          {send.isPending && <p className="text-sm text-muted-foreground" role="status">Reading your squad…</p>}
          <ErrorNotice error={send.error ?? fileError} />
          <div ref={bottom} />
        </div>
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); submit(); }}>
          <Textarea value={text} onChange={e => setText(e.target.value)} maxLength={MAX_TEXT} rows={3} placeholder="ST Mbappe 91, CAM Odegaard…" aria-label="Your squad" disabled={send.isPending}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <div className="flex items-center justify-between gap-2">
            <input ref={fileInput} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif,.csv,.txt,text/plain,text/csv" onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <Button type="button" variant="outline" size="sm" disabled={send.isPending} onClick={() => fileInput.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Upload</Button>
            <div className="flex gap-2">
              {messages.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => { setMessages([]); send.reset(); }}><X className="mr-1 h-4 w-4" />Clear chat</Button>}
              <Button type="submit" size="sm" disabled={!text.trim() || send.isPending}><SendHorizontal className="mr-2 h-4 w-4" />Send</Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  </>;
}
