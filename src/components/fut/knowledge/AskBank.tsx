import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { BookOpenText, ExternalLink, MessageSquareText, RotateCcw, SendHorizontal } from "lucide-react";
import { futApi, type FinderTurn, type KbAnswer } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sourceLabel } from "./knowledgePresentation";

type Message = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; result: KbAnswer };
const MAX_TEXT = 500;
const STORAGE_KEY = "fut-knowledge-chat";
const EXAMPLES = [
  "What's the meta formation right now?",
  "Best custom tactics for 4-4-2?",
  "Is Explosive AcceleRATE still overpowered?",
  "How do people defend against through balls?",
  "Which skill moves are worth learning?",
  "What are people saying about the latest patch?",
];

function loadSaved(): Message[] {
  try { const list = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(list) ? list.slice(-20) : []; } catch { return []; }
}

/** "[2]" in an answer becomes a link to that source. */
function withCitations(text: string, result: KbAnswer): string {
  return text.replace(/\[(\d{1,3})\]/g, (all, n) => {
    const s = result.sources.find((x) => x.n === Number(n));
    return s?.url ? `[[${n}]](${s.url})` : all;
  });
}

function Answer({ result }: { result: KbAnswer }) {
  return <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown components={{
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">{children}</a>,
        ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        h1: ({ children }) => <p className="font-semibold">{children}</p>, h2: ({ children }) => <p className="font-semibold">{children}</p>, h3: ({ children }) => <p className="font-semibold">{children}</p>,
        img: () => null,
      }}>{withCitations(result.answer, result)}</ReactMarkdown>
    </div>
    {result.sources.length > 0 && <ol className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
      {result.sources.map((s) => <li key={s.id} className="flex gap-1.5"><span className="tabular-nums">[{s.n}]</span>
        {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1 hover:underline"><span className="truncate">{sourceLabel(s)}</span><ExternalLink className="h-3 w-3 shrink-0" /></a> : <span>{sourceLabel(s)}</span>}
      </li>)}
    </ol>}
    {result.via === "search" && result.claims > 0 && <p className="text-xs text-muted-foreground">These are the closest claims in the bank (the AI answer isn't available right now).</p>}
  </div>;
}

/** Ask the bank: answers come only from what the community said, with the sources listed. */
export function AskBank() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>(loadSaved);
  const nextId = useRef(messages.reduce((n, m) => Math.max(n, m.id), 0) + 1);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20))); } catch { /* the chat still works without storage */ }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  const history = (): FinderTurn[] => messages.slice(-6).map((m) => m.role === "user" ? { role: "user", text: m.text } : { role: "assistant", text: m.result.answer });
  const send = useMutation({
    mutationFn: (q: string) => futApi.knowledge.ask(q, history()),
    onMutate: (q) => setMessages((m) => [...m, { id: nextId.current++, role: "user", text: q }]),
    onSuccess: (result) => setMessages((m) => [...m, { id: nextId.current++, role: "assistant", result }]),
  });
  const submit = (value = text) => {
    const q = value.trim().slice(0, MAX_TEXT);
    if (!q || send.isPending) return;
    send.mutate(q); setText("");
  };

  return <section aria-labelledby="ask-title" className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 id="ask-title" className="flex items-center gap-2 font-display text-lg font-semibold"><BookOpenText className="h-4 w-4 text-primary" />Ask the bank</h2>
        <p className="text-sm text-muted-foreground">Answers come only from what the community has said, with links to every post and video used.</p>
      </div>
      {messages.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => { setMessages([]); send.reset(); }}><RotateCcw className="mr-2 h-4 w-4" />New chat</Button>}
    </div>
    {messages.length > 0 && <div ref={list} className="max-h-[32rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
      {messages.map((m) => m.role === "user"
        ? <div key={m.id} className="flex justify-end"><p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{m.text}</p></div>
        : <Answer key={m.id} result={m.result} />)}
      {send.isPending && <p className="text-sm text-muted-foreground">Reading what people have said…</p>}
    </div>}
    {messages.length === 0 && <div className="flex flex-wrap gap-2" aria-label="Example questions">
      {EXAMPLES.map((e) => <Button key={e} type="button" variant="outline" size="sm" className="h-auto whitespace-normal rounded-full py-1 text-left" disabled={send.isPending} onClick={() => submit(e)}>{e}</Button>)}
    </div>}
    <ErrorNotice error={send.error} />
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="relative min-w-0 flex-1">
        <MessageSquareText className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Textarea aria-label="Your question" placeholder="e.g. what are the best player instructions for a CDM?" className="min-h-[44px] resize-none pl-9" rows={1} maxLength={MAX_TEXT}
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
      </div>
      <Button type="submit" size="icon" className="h-11 w-11 shrink-0" aria-label="Send" disabled={!text.trim() || send.isPending}><SendHorizontal className="h-4 w-4" /></Button>
    </form>
  </section>;
}
