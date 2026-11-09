import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageSquareText, RotateCcw, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { futApi, FinderResult, FinderTurn, MarketPlatform } from "@/lib/futApi";
import type { PlayerQuery } from "@/lib/futStats";
import { ErrorNotice } from "./FutShared";
import { numberText } from "./market/marketPresentation";

type Message = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; result: FinderResult };

const MAX_TEXT = 600;
const STORAGE_KEY = "fut-player-finder-chat";
const EXAMPLES = [
  "Fast CB under 50k who can pass",
  "Cheap 5 star skills winger",
  "Tall striker who's strong in the air",
  "Box-to-box CM with high stamina under 100k",
  "Sweeper keeper under 20k",
  "Best left back in my club",
];

function loadSaved(): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(-20) : [];
  } catch { return []; }
}

function Reply({ result }: { result: FinderResult }) {
  const top = result.result.cards.slice(0, 3);
  return <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
    <p>{result.reply}</p>
    {result.summary.length > 0 && <div className="flex flex-wrap gap-1">{result.summary.map(s => <Badge key={s} variant="outline" className="font-normal">{s}</Badge>)}</div>}
    {result.relaxed && <p className="text-xs text-warning">{result.relaxed}</p>}
    {result.result.total === 0
      ? <p className="text-muted-foreground">No cards match that yet. Try loosening the price or position.</p>
      : <p className="text-muted-foreground">
        {numberText(result.result.total)} card{result.result.total === 1 ? "" : "s"} fit. Best: {top.map(c => `${c.player_name} ${c.overall}${c.fit != null ? ` (fit ${c.fit})` : ""}`).join(", ")}.
      </p>}
  </div>;
}

/** "Describe the player you want": each message becomes a search that ranks every card by fit and fills the table below. */
export function PlayerFinder({ platform, query, onResult, onReset }: {
  platform: MarketPlatform; query: PlayerQuery; onResult: (result: FinderResult) => void; onReset: () => void;
}) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>(loadSaved);
  const nextId = useRef(messages.reduce((n, m) => Math.max(n, m.id), 0) + 1);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20))); } catch { /* the chat still works without storage */ }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const history = (): FinderTurn[] => messages.slice(-6).map(m => m.role === "user" ? { role: "user", text: m.text } : { role: "assistant", text: m.result.reply });
  const send = useMutation({
    // Only refine the table's search once the chat has started; a first message starts fresh
    mutationFn: (message: string) => futApi.players.find(message, messages.length ? query : null, history(), platform),
    onMutate: message => { setMessages(m => [...m, { id: nextId.current++, role: "user", text: message }]); },
    onSuccess: result => {
      setMessages(m => [...m, { id: nextId.current++, role: "assistant", result }]);
      onResult(result);
    },
  });
  const submit = (value = text) => {
    const message = value.trim().slice(0, MAX_TEXT);
    if (!message || send.isPending) return;
    send.mutate(message);
    setText("");
  };
  const reset = () => { setMessages([]); send.reset(); onReset(); };

  return <section aria-labelledby="finder-title" className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 id="finder-title" className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles className="h-4 w-4 text-primary" />Find a player</h2>
        <p className="text-sm text-muted-foreground">Describe the player you want and every card is ranked by how well it fits. Follow up to refine ("cheaper", "left footed only").</p>
      </div>
      {messages.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />New search</Button>}
    </div>

    {messages.length > 0 && <div ref={list} className="max-h-80 space-y-3 overflow-y-auto pr-1" aria-live="polite">
      {messages.map(m => m.role === "user"
        ? <div key={m.id} className="flex justify-end"><p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{m.text}</p></div>
        : <Reply key={m.id} result={m.result} />)}
      {send.isPending && <p className="text-sm text-muted-foreground">Looking through every card…</p>}
    </div>}

    {messages.length === 0 && <div className="flex flex-wrap gap-2" aria-label="Example requests">
      {EXAMPLES.map(example => <Button key={example} type="button" variant="outline" size="sm" className="h-auto whitespace-normal rounded-full py-1 text-left" disabled={send.isPending} onClick={() => submit(example)}>{example}</Button>)}
    </div>}

    <ErrorNotice error={send.error} />
    <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); submit(); }}>
      <div className="relative min-w-0 flex-1">
        <MessageSquareText className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Textarea
          aria-label="Describe the player you want"
          placeholder={messages.length ? "Refine it, or describe someone else" : "e.g. fast CB under 50k with good passing"}
          className="min-h-[44px] resize-none pl-9"
          rows={1}
          maxLength={MAX_TEXT}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
      </div>
      <Button type="submit" size="icon" className="h-11 w-11 shrink-0" aria-label="Send" disabled={!text.trim() || send.isPending}><SendHorizontal className="h-4 w-4" /></Button>
    </form>
  </section>;
}
