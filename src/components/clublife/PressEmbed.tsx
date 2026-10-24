import { discordMarkdown } from "@/lib/discordMarkdown";
import type { MentionNames } from "@/lib/webPanel";

type Field = { name: string; value: string; inline?: boolean };
export type PressBody = { title?: string; description?: string; color?: number; fields?: Field[]; footer?: { text?: string }; author?: { name?: string } };

const NO_NAMES: MentionNames = { users: {}, channels: {}, roles: {} };
const md = (text?: string) => ({ __html: discordMarkdown(text, NO_NAMES) });

// A Chronicle edition or match report as the bot posted it, drawn as a newspaper page
export function PressEmbed({ body, printedAt }: { body: PressBody; printedAt: string }) {
  const accent = typeof body.color === "number" ? `#${body.color.toString(16).padStart(6, "0")}` : undefined;
  return (
    <article className="rounded-lg border border-border border-l-4 bg-card p-5" style={accent ? { borderLeftColor: accent } : undefined}>
      {body.author?.name && <p className="text-xs uppercase tracking-widest text-muted-foreground">{body.author.name}</p>}
      {body.title && <h2 className="mt-1 font-display text-2xl font-bold leading-tight" dangerouslySetInnerHTML={md(body.title)} />}
      <p className="mt-1 text-xs text-muted-foreground">{new Date(printedAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</p>
      {body.description && <div className="mt-3 break-words text-sm leading-relaxed" dangerouslySetInnerHTML={md(body.description)} />}
      {!!body.fields?.length && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {body.fields.map((f, i) => (
            <section key={i} className={f.inline ? "" : "sm:col-span-2"}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground" dangerouslySetInnerHTML={md(f.name)} />
              <div className="mt-1 break-words text-sm leading-relaxed" dangerouslySetInnerHTML={md(f.value)} />
            </section>
          ))}
        </div>
      )}
      {body.footer?.text && <p className="mt-4 border-t border-border pt-2 text-xs text-muted-foreground">{body.footer.text}</p>}
    </article>
  );
}
