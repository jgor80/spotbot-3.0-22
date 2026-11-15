import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/notify";

// Your own OpenAI key for AI images, or your server's (the ai-keys function). Graphics Studio draws on the
// requester's key first, then the server's, and those images never use the server's AI image allowance.
// A saved key is never sent back to the browser: only its last 4 characters.
type KeyStatus = { saved: boolean; key_hint?: string | null; updated_at?: string | null; last_used_at?: string | null; last_error?: string | null; unreadable?: boolean };
type Status = { enabled: boolean; can_manage?: boolean; key: KeyStatus };

async function call(body: Record<string, unknown>): Promise<Status> {
  const { data, error } = await supabase.functions.invoke("ai-keys", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error || "AI keys are unavailable right now.");
  }
  return data as Status;
}

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

export function ImageKeySetting({ scope, guildId }: { scope: "me" | "server"; guildId?: string | null }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const base = { scope, ...(scope === "server" ? { guild_id: guildId } : {}) };
  const queryKey = ["ai-image-key", scope, scope === "server" ? guildId : "me"];
  const status = useQuery({ queryKey, enabled: scope === "me" || !!guildId, queryFn: () => call({ action: "status", ...base }) });
  const save = useMutation({
    mutationFn: () => call({ action: "save", ...base, key: draft.trim() }),
    onSuccess: (s) => { setDraft(""); setEditing(false); qc.setQueryData(queryKey, s); toast.success("OpenAI key saved. New AI images use it."); },
  });
  const remove = useMutation({
    mutationFn: () => call({ action: "remove", ...base }),
    onSuccess: (s) => { qc.setQueryData(queryKey, s); toast.success("OpenAI key removed."); },
  });

  const s = status.data;
  const k = s?.key;
  const mine = scope === "me";
  const canManage = mine || !!s?.can_manage;
  const showForm = canManage && (!k?.saved || editing);
  const error = status.error || save.error || remove.error;

  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">
      {mine
        ? "Add an OpenAI API key and the Graphics Studio draws your AI art (cards, posters, banners, lineups) on your own OpenAI account, in Discord, the Control Room and AI apps. Those images don't use your server's free images or packs."
        : "Add an OpenAI API key and every member's AI art in this server is drawn on it, unless they've added their own. Those images don't use the server's free images or packs."}
      {" "}Get one at <a className="underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a>
      {" "}(OpenAI may ask you to verify your organization before it makes images). It's stored encrypted and never shown again, only its last 4 characters.
    </p>

    {s && !s.enabled && <p className="text-sm text-amber-600 dark:text-amber-400">Own AI keys are switched off on this GafferBot server right now, so images use the server's allowance.</p>}

    {k && <p className="text-sm">
      {k.saved
        ? canManage
          ? <>Using {mine ? "your" : "the server's"} key ending {k.key_hint}{day(k.updated_at) ? `, saved ${day(k.updated_at)}` : ""}{day(k.last_used_at) ? `, last used ${day(k.last_used_at)}` : ""}.</>
          : "This server makes AI images on its own OpenAI key, so they don't use its image allowance."
        : mine ? "No key yet: your AI images use your server's image allowance."
        : canManage ? "No server key yet: AI images use the server's allowance, unless a member added their own key."
        : "This server uses GafferBot's image allowance. Add your own key on your profile to draw on your own OpenAI account."}
    </p>}
    {k?.unreadable && <p className="text-sm text-amber-600 dark:text-amber-400">The saved key can't be read any more (the server's secret changed). Paste it again.</p>}
    {k?.saved && canManage && k.last_error && <p className="text-sm text-destructive">Last problem: {k.last_error}</p>}

    {showForm && <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) save.mutate(); }}>
      <Input type="password" autoComplete="off" spellCheck={false} placeholder="sk-proj-…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="OpenAI API key" className="font-mono" />
      <div className="flex gap-2">
        <Button type="submit" disabled={!draft.trim() || save.isPending}><KeyRound className="mr-2 h-4 w-4" />{save.isPending ? "Checking…" : "Save key"}</Button>
        {editing && <Button type="button" variant="ghost" onClick={() => { setEditing(false); setDraft(""); save.reset(); }}>Cancel</Button>}
      </div>
    </form>}

    {k?.saved && canManage && !editing && <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setEditing(true)}><KeyRound className="mr-2 h-4 w-4" />Replace key</Button>
      <Button variant="outline" disabled={remove.isPending} onClick={() => {
        if (window.confirm(mine ? "Remove your OpenAI key? Your AI images go back to using the server's allowance." : "Remove the server's OpenAI key? AI images go back to using the server's allowance.")) remove.mutate();
      }}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>
    </div>}
    {error && <p className="text-sm text-destructive">{error instanceof Error ? error.message : String(error)}</p>}
  </div>;
}
