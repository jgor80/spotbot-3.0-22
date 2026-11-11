import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { toast } from "@/lib/notify";

const statusKey = [...futKeys.all, "ai-key"];
const fullKey = [...futKeys.all, "ai-key", "reveal"];

/** Your own Claude (Anthropic) API key: save, show / copy, replace, remove. Lives on the profile. */
export function ClaudeKeySetting() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(false);
  const status = useQuery({ queryKey: statusKey, queryFn: futApi.market.aiKey });
  // The full key is only fetched when you ask to see or copy it.
  const key = useQuery({ queryKey: fullKey, queryFn: futApi.market.aiKeyReveal, enabled: false, staleTime: 0, gcTime: 0 });
  const refresh = () => {
    qc.removeQueries({ queryKey: fullKey });
    void qc.invalidateQueries({ queryKey: statusKey });
    void qc.invalidateQueries({ queryKey: futKeys.knowledge });
  };
  const save = useMutation({
    mutationFn: () => futApi.market.saveAiKey(draft.trim()),
    onSuccess: () => { setDraft(""); setEditing(false); setShown(false); refresh(); toast.success("Claude key saved. The AI features now use it."); },
  });
  const remove = useMutation({
    mutationFn: futApi.market.removeAiKey,
    onSuccess: () => { setShown(false); refresh(); toast.success("Claude key removed."); },
  });
  const s = status.data;
  const value = key.data?.key ?? null;
  const reveal = async () => {
    if (shown) { setShown(false); return; }
    if (!value) await key.refetch();
    setShown(true);
  };
  const copy = async () => {
    const k = value ?? (await key.refetch()).data?.key ?? null;
    if (!k) return;
    try { await navigator.clipboard.writeText(k); toast.success("Claude key copied"); } catch { setShown(true); toast.error("Couldn't copy. Show the key and copy it by hand."); }
  };
  const showForm = !s?.saved || editing;

  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">
      Paste an API key from <a className="underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
      The squad reader, player finder and Knowledge Bank (Ask and reading the sources you add) then call Claude with your key, on your Anthropic bill, with no hourly limits.
      It's stored encrypted and only you can see it again.
    </p>
    {s && <p className="text-sm">
      {s.saved ? <>Using your key (ending {s.key_hint}){s.updated_at ? `, saved ${new Date(s.updated_at).toLocaleDateString()}` : ""}.</>
        : s.using === "server" ? "Using GafferBot's shared key. Add yours to use your own Anthropic account."
        : "No Claude key yet, so the AI features are off. Add yours to turn them on."}
    </p>}
    {s?.unreadable && <p className="text-sm text-amber-600 dark:text-amber-400">Your saved key can't be read any more (the server's secret changed). Paste it again.</p>}

    {s?.saved && !editing && <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs select-all">{shown && value ? value : `sk-ant-${"•".repeat(16)}${s.key_hint ?? ""}`}</code>
        <Button size="sm" variant="ghost" aria-label={shown ? "Hide key" : "Show key"} disabled={key.isFetching} onClick={() => void reveal()}>{shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
        <Button size="sm" variant="ghost" aria-label="Copy key" disabled={key.isFetching} onClick={() => void copy()}><Copy className="h-4 w-4" /></Button>
      </div>
    </div>}

    {showForm && <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) save.mutate(); }}>
      <Input type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-api03-…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Claude API key" className="font-mono" />
      <div className="flex gap-2">
        <Button type="submit" disabled={!draft.trim() || save.isPending}><KeyRound className="mr-2 h-4 w-4" />{save.isPending ? "Checking…" : "Save key"}</Button>
        {editing && <Button type="button" variant="ghost" onClick={() => { setEditing(false); setDraft(""); save.reset(); }}>Cancel</Button>}
      </div>
    </form>}

    {s?.saved && !editing && <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setEditing(true)}><KeyRound className="mr-2 h-4 w-4" />Replace key</Button>
      <Button variant="outline" disabled={remove.isPending} onClick={() => { if (window.confirm("Remove your Claude key? The AI features go back to GafferBot's shared key, if there is one.")) remove.mutate(); }}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>
    </div>}
    <ErrorNotice error={status.error || key.error || save.error || remove.error} />
  </div>;
}
