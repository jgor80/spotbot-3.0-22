// A GafferBot reply drawn the way Discord shows it: text, embeds, images, then its buttons and menus.
// Buttons and menus stay live: pressing one sends the same custom id back to the bot.
import { useState } from "react";
import { ExternalLink, Loader2, Lock, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { discordMarkdown } from "@/lib/discordMarkdown";
import type { ApiObject, BotMessage, MentionNames, PanelChannel } from "@/lib/webPanel";
import { ChannelPicker, MemberPicker } from "@/components/control/Pickers";

export type ClickHandler = (messageId: string, customId: string, values?: string[]) => Promise<void>;

const BUTTON_VARIANT: Record<number, "default" | "secondary" | "destructive" | "outline"> = {
  1: "default",
  2: "secondary",
  3: "default",
  4: "destructive",
};

function Markdown({ text, names, className }: { text: string | null | undefined; names: MentionNames; className?: string }) {
  if (!text) return null;
  return <div className={cn("break-words text-sm leading-relaxed", className)} dangerouslySetInnerHTML={{ __html: discordMarkdown(text, names) }} />;
}

function emojiOf(c: ApiObject) {
  const e = c.emoji;
  if (!e) return null;
  if (e.id) return <img src={`https://cdn.discordapp.com/emojis/${e.id}.webp?size=32`} alt={e.name || ""} className="h-4 w-4" />;
  return <span aria-hidden>{e.name}</span>;
}

function fileUrl(url: string | undefined, files: BotMessage["payload"]["files"]) {
  if (!url) return null;
  if (url.startsWith("attachment://")) return files.find((f) => f.name === url.slice(13))?.url || null;
  return /^(https?:|data:image\/)/.test(url) ? url : null;
}

function Embed({ embed, names, files }: { embed: ApiObject; names: MentionNames; files: BotMessage["payload"]["files"] }) {
  const color = typeof embed.color === "number" ? `#${embed.color.toString(16).padStart(6, "0")}` : "hsl(var(--primary))";
  const image = fileUrl(embed.image?.url, files);
  const thumb = fileUrl(embed.thumbnail?.url, files);
  const fields: ApiObject[] = embed.fields || [];
  return (
    <div className="flex overflow-hidden rounded-md border border-border/60 bg-muted/30" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="min-w-0 flex-1 space-y-2 p-3">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            {embed.author?.name && (
              <div className="flex items-center gap-2 text-xs font-medium">
                {fileUrl(embed.author.icon_url, files) && <img src={fileUrl(embed.author.icon_url, files)!} alt="" className="h-5 w-5 rounded-full" />}
                {embed.author.name}
              </div>
            )}
            {embed.title &&
              (embed.url && /^https?:/.test(embed.url) ? (
                <a href={embed.url} target="_blank" rel="noopener noreferrer" className="block font-semibold text-primary hover:underline">
                  <Markdown text={embed.title} names={names} className="text-[0.95rem]" />
                </a>
              ) : (
                <Markdown text={embed.title} names={names} className="text-[0.95rem] font-semibold" />
              ))}
            <Markdown text={embed.description} names={names} />
          </div>
          {thumb && <img src={thumb} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />}
        </div>
        {fields.length > 0 && (
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
            {fields.map((f, i) => (
              <div key={i} className={cn("min-w-0", !f.inline && "sm:col-span-3")}>
                <Markdown text={f.name} names={names} className="text-xs font-semibold" />
                <Markdown text={f.value} names={names} />
              </div>
            ))}
          </div>
        )}
        {image && <img src={image} alt="" className="max-h-[520px] w-auto max-w-full rounded" />}
        {(embed.footer?.text || embed.timestamp) && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {fileUrl(embed.footer?.icon_url, files) && <img src={fileUrl(embed.footer.icon_url, files)!} alt="" className="h-4 w-4 rounded-full" />}
            {embed.footer?.text}
            {embed.footer?.text && embed.timestamp && " • "}
            {embed.timestamp && new Date(embed.timestamp).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

function MultiSelect({ c, disabled, onPick }: { c: ApiObject; disabled: boolean; onPick: (values: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => (c.options || []).filter((o: ApiObject) => o.default).map((o: ApiObject) => o.value));
  const max = c.max_values ?? 1;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 w-full justify-between font-normal" disabled={disabled}>
          <span className="truncate">{picked.length ? `${picked.length} picked` : c.placeholder || "Pick options"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-2" align="start">
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {(c.options || []).map((o: ApiObject) => {
            const on = picked.includes(o.value);
            return (
              <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-muted">
                <Checkbox
                  checked={on}
                  disabled={!on && picked.length >= max}
                  onCheckedChange={(v) => setPicked((p) => (v ? [...p, o.value] : p.filter((x) => x !== o.value)))}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  {o.emoji?.name && `${o.emoji.name} `}
                  {o.label}
                  {o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}
                </span>
              </label>
            );
          })}
        </div>
        <Button
          className="mt-2 w-full"
          size="sm"
          disabled={picked.length < (c.min_values ?? 1)}
          onClick={() => {
            setOpen(false);
            onPick(picked);
          }}
        >
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function SelectComponent({ c, guildId, channels, disabled, onPick }: { c: ApiObject; guildId: string; channels: PanelChannel[]; disabled: boolean; onPick: (values: string[]) => void }) {
  if (c.type === 3 && (c.max_values ?? 1) > 1) return <MultiSelect c={c} disabled={disabled} onPick={onPick} />;
  if (c.type === 3) {
    const current = (c.options || []).find((o: ApiObject) => o.default)?.value;
    return (
      <Select value={current} onValueChange={(v) => onPick([v])} disabled={disabled}>
        <SelectTrigger className="h-10">
          <SelectValue placeholder={c.placeholder || "Pick one"} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
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
  if (c.type === 8) {
    const types = c.channel_types?.length ? c.channel_types : [0, 2, 5, 13];
    return <ChannelPicker channels={channels} types={types} value={null} onChange={(id) => onPick([id])} placeholder={c.placeholder || "Pick a channel"} />;
  }
  // User, role and mentionable menus: pick a member (roles are rarely offered this way)
  return <MemberPicker guildId={guildId} value={null} onChange={(id) => id && onPick([id])} />;
}

export function BotMessageView({
  message,
  names,
  guildId,
  channels,
  onClick,
}: {
  message: BotMessage;
  names: MentionNames;
  guildId: string;
  channels: PanelChannel[];
  onClick: ClickHandler;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const { payload } = message;
  const press = async (customId: string, values?: string[]) => {
    setBusy(customId);
    try {
      await onClick(message.id, customId, values);
    } finally {
      setBusy(null);
    }
  };
  const embedImages = new Set(
    (payload.embeds || []).flatMap((e) => [e.image?.url, e.thumbnail?.url, e.author?.icon_url, e.footer?.icon_url]).filter((u): u is string => !!u && u.startsWith("attachment://")).map((u) => u.slice(13))
  );
  const looseFiles = (payload.files || []).filter((f) => !embedImages.has(f.name));
  const channelName = message.channelId ? names.channels[message.channelId] || channels.find((c) => c.id === message.channelId)?.name : null;

  return (
    <div className={cn("space-y-2 rounded-lg border border-border/60 bg-card p-3 shadow-sm", message.deleted && "opacity-50")}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {message.ephemeral ? (
          <Badge variant="secondary" className="gap-1 font-normal">
            <Lock className="h-3 w-3" /> Only you
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-primary/40 font-normal text-primary">
            <Send className="h-3 w-3" /> Posted{channelName ? ` in #${channelName}` : ""}
          </Badge>
        )}
        {message.deleted && <span>Removed</span>}
        {!message.ephemeral && message.discordMessageId && message.channelId && (
          <a
            className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
            href={`https://discord.com/channels/${guildId}/${message.channelId}/${message.discordMessageId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Discord <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {message.thinking ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> GafferBot is working on it…
        </div>
      ) : (
        <>
          <Markdown text={payload.content} names={names} />
          {(payload.embeds || []).map((e, i) => (
            <Embed key={i} embed={e} names={names} files={payload.files || []} />
          ))}
          {looseFiles.map((f) =>
            f.url && /\.(png|jpe?g|gif|webp)$/i.test(f.name) ? (
              <a key={f.name} href={f.url} download={f.name} title="Download">
                <img src={f.url} alt={f.name} className="max-h-[520px] w-auto max-w-full rounded border border-border/60" />
              </a>
            ) : (
              <div key={f.name} className="text-xs text-muted-foreground">
                📎 {f.name}
                {f.tooLarge && " (too large to preview here; it's in Discord)"}
              </div>
            )
          )}
        </>
      )}

      {!message.deleted && (payload.components || []).length > 0 && (
        <div className="space-y-2 pt-1">
          {(payload.components || []).map((row, r) => (
            <div key={r} className="flex flex-wrap gap-2">
              {(row.components || []).map((c: ApiObject, i: number) => {
                if (c.type === 2) {
                  if (c.style === 5 && c.url) {
                    return (
                      <Button key={i} asChild variant="outline" size="sm" className="gap-1.5">
                        <a href={c.url} target="_blank" rel="noopener noreferrer">
                          {emojiOf(c)} {c.label} <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    );
                  }
                  if (!c.custom_id) return null;
                  return (
                    <Button
                      key={i}
                      size="sm"
                      variant={BUTTON_VARIANT[c.style] || "secondary"}
                      className={cn("gap-1.5", c.style === 3 && "bg-green-600 text-white hover:bg-green-600/90")}
                      disabled={c.disabled || !!busy}
                      onClick={() => press(c.custom_id)}
                    >
                      {busy === c.custom_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : emojiOf(c)}
                      {c.label}
                    </Button>
                  );
                }
                return (
                  <div key={i} className="w-full sm:max-w-md">
                    <SelectComponent c={c} guildId={guildId} channels={channels} disabled={c.disabled || !!busy} onPick={(v) => press(c.custom_id, v)} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
