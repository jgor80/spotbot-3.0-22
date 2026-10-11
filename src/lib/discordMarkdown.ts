// Discord-flavoured markdown to safe HTML for showing bot replies in the web app.
// Everything is HTML-escaped first; only the tags produced here are ever emitted.
import type { MentionNames } from "@/lib/webPanel";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function timestamp(unix: number, style = "f") {
  const d = new Date(unix * 1000);
  if (style === "R") {
    const diff = (d.getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const abs = Math.abs(diff);
    if (abs < 60) return rtf.format(Math.round(diff), "second");
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    return rtf.format(Math.round(diff / 86400), "day");
  }
  const opts: Record<string, Intl.DateTimeFormatOptions> = {
    t: { timeStyle: "short" },
    T: { timeStyle: "medium" },
    d: { dateStyle: "short" },
    D: { dateStyle: "long" },
    f: { dateStyle: "long", timeStyle: "short" },
    F: { dateStyle: "full", timeStyle: "short" },
  };
  return new Intl.DateTimeFormat(undefined, opts[style] || opts.f).format(d);
}

const MENTION = "rounded bg-primary/15 px-1 text-primary font-medium";

function inline(text: string, names: MentionNames) {
  const slots: string[] = [];
  const keep = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`\n]+)`/g, (_, code) => keep(`<code class="rounded bg-muted px-1 py-0.5 text-[0.85em]">${esc(code)}</code>`));
  s = esc(s);
  s = s
    .replace(/&lt;@!?(\d{17,20})&gt;/g, (_, id) => keep(`<span class="${MENTION}">@${esc(names.users[id] || "member")}</span>`))
    .replace(/&lt;@&amp;(\d{17,20})&gt;/g, (_, id) => {
      const role = names.roles[id];
      const style = role?.color ? ` style="color:${esc(role.color)}"` : "";
      return keep(`<span class="${MENTION}"${style}>@${esc(role?.name || "role")}</span>`);
    })
    .replace(/&lt;#(\d{17,20})&gt;/g, (_, id) => keep(`<span class="${MENTION}">#${esc(names.channels[id] || "channel")}</span>`))
    .replace(/&lt;t:(-?\d+)(?::([tTdDfFR]))?&gt;/g, (_, unix, style) => keep(`<span class="rounded bg-muted px-1">${esc(timestamp(Number(unix), style))}</span>`))
    .replace(/&lt;a?:(\w+):(\d{17,20})&gt;/g, (_, name, id) =>
      keep(`<img src="https://cdn.discordapp.com/emojis/${id}.webp?size=48" alt=":${name}:" class="inline h-[1.2em] w-[1.2em] align-[-0.2em]" />`)
    )
    .replace(/&lt;\/([\w -]+):\d{17,20}&gt;/g, (_, name) => keep(`<span class="${MENTION}">/${name}</span>`))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) =>
      keep(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">${label}</a>`)
    )
    .replace(/&lt;(https?:\/\/[^\s]+?)&gt;/g, (_, url) => keep(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${url}</a>`))
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, url) => `${pre}${keep(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${url}</a>`)}`)
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\|\|(.+?)\|\|/g, '<span class="rounded bg-muted px-1">$1</span>')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, "$1<em>$2</em>");
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

export function discordMarkdown(text: string | null | undefined, names: MentionNames): string {
  if (!text) return "";
  const out: string[] = [];
  const parts = text.split(/```(?:[\w+-]*\n)?([\s\S]*?)```/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      out.push(`<pre class="my-1 overflow-x-auto rounded bg-muted p-2 text-xs">${esc(part.replace(/\n$/, ""))}</pre>`);
      return;
    }
    const lines = part.split("\n");
    lines.forEach((line, n) => {
      let m: RegExpMatchArray | null;
      let html: string;
      if ((m = line.match(/^(#{1,3}) (.*)$/))) {
        const size = ["text-lg", "text-base", "text-sm"][m[1].length - 1];
        html = `<div class="${size} font-bold">${inline(m[2], names)}</div>`;
      } else if ((m = line.match(/^-# (.*)$/))) {
        html = `<div class="text-xs text-muted-foreground">${inline(m[1], names)}</div>`;
      } else if ((m = line.match(/^>>?>? ?(.*)$/))) {
        html = `<div class="border-l-4 border-muted-foreground/40 pl-2">${inline(m[1], names) || "&nbsp;"}</div>`;
      } else if ((m = line.match(/^\s*[-*] (.*)$/))) {
        html = `<div class="pl-3">• ${inline(m[1], names)}</div>`;
      } else {
        html = inline(line, names) + (n < lines.length - 1 ? "<br/>" : "");
      }
      out.push(html);
    });
  });
  return out.join("");
}
