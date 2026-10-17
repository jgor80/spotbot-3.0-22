// Club actions for AI apps connected with manage access (clubs:manage, OAuth only). Nothing here touches
// the database directly: every action goes through the web Control Room's bridge into the bot
// (public/spotbot/web-panels.cjs), which builds an interaction as the player's real Discord member and
// runs the same handler as the Discord button. So the bot's own permission checks apply (managers vs
// players, channel permissions) and Discord boards refresh exactly as if the player had clicked.
//
// Every change is two calls: without confirm the tool returns a preview and does nothing; with
// confirm: true it runs, is rate limited (CHANGES_PER_HOUR) and lands in mcp_action_log.
import { Tool, ToolError } from "./protocol.ts";
import { Ctx, PanelBridge, resolveGuild } from "./tools.ts";
import { CHANGES_PER_HOUR, changesLastHour } from "./limits.ts";
import { SCOPE_MANAGE } from "../_shared/mcp-tokens.ts";

// Kept out of AI hands even for managers: server setup and admin, premium switches and AI art (costs
// money), live voice drafts, cross-server Network actions, removing players or handing out manager and
// captain, deleting presets or photos, and AI token settings themselves.
export const BLOCKED_AREAS = new Set(["admin", "premium", "drafts"]);
export const BLOCKED_ACTIONS = new Set([
  "aiaccess", "airevoke", "prophoto", "myphotos",
  "ln_vcspots", "ln_posboard",
  "mn_netfriendly", "mn_netbyot", "mn_netclubs",
  "ro_remove", "ro_forcelink", "sq_manager", "sq_captain",
  "ev_presetdel", "rc_post",
  "wb_graphics", "wb_setup",
]);

const FIELD_TYPES: Record<number, string> = {
  3: "text", 4: "whole number", 5: "true/false", 6: "player (Discord user id from find_members)",
  7: "channel id", 8: "role id", 9: "player or role id", 10: "number",
};
const COMPONENT_KINDS: Record<number, string> = { 2: "button", 3: "menu", 5: "player menu", 6: "role menu", 7: "player or role menu", 8: "channel menu" };
const MAX_TEXT = 1500;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const confirmed = (args: Record<string, unknown>) => args.confirm === true || args.confirm === "true";

// deno-lint-ignore no-explicit-any
type Json = any;

function bridge(ctx: Ctx): PanelBridge {
  if (!ctx.panels) throw new ToolError("Club actions only work on the GafferBot server, which isn't reachable from here.");
  return ctx.panels;
}

async function call(ctx: Ctx, op: string, args: Record<string, unknown>): Promise<Json> {
  try {
    return await bridge(ctx).handle(op, { ...args, userId: ctx.discordUserId });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status) throw new ToolError(String(e.message || "GafferBot refused that."));
    throw err;
  }
}

// ---------- Turning panels into something an AI can read ----------

function mentions(text: string, names: Json): string {
  return text.replace(/<(@!?|#|@&)(\d{17,20})>/g, (_m, kind: string, id: string) => {
    if (kind === "#") return `#${names?.channels?.[id] ?? "channel"}`;
    if (kind === "@&") return `@${names?.roles?.[id]?.name ?? "role"}`;
    return `@${names?.users?.[id] ?? "player"}`;
  }).replace(/<t:(\d+)(?::\w)?>/g, (_m, s: string) => new Date(Number(s) * 1000).toISOString());
}

function walk(list: Json[], fn: (c: Json, label?: string) => void, label?: string) {
  for (const c of list || []) {
    if (!c) continue;
    fn(c, label);
    const inner = c.type === 18 ? c.label : undefined;
    if (c.components) walk(c.components, fn, inner);
    if (c.component) walk([c.component], fn, inner ?? c.label);
    if (c.accessory) walk([c.accessory], fn);
  }
}

export function panelText(payload: Json, names: Json = {}): string {
  const parts: string[] = [];
  if (payload?.content) parts.push(payload.content);
  for (const e of payload?.embeds || []) {
    if (e.author?.name) parts.push(e.author.name);
    if (e.title) parts.push(`**${e.title}**`);
    if (e.description) parts.push(e.description);
    for (const f of e.fields || []) parts.push(`${f.name}: ${f.value}`);
    if (e.footer?.text) parts.push(e.footer.text);
  }
  walk(payload?.components || [], (c) => {
    if (c.type === 10 && c.content) parts.push(c.content);
  });
  const text = mentions(parts.join("\n"), names).trim();
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

export function panelControls(payload: Json) {
  const out: Json[] = [];
  walk(payload?.components || [], (c) => {
    if (!c.custom_id || !COMPONENT_KINDS[c.type]) return;
    const item: Json = { id: c.custom_id, kind: COMPONENT_KINDS[c.type] };
    if (c.label) item.label = c.label;
    if (c.placeholder) item.label = c.placeholder;
    if (c.disabled) item.disabled = true;
    if (c.type === 3) item.options = (c.options || []).map((o: Json) => ({ label: o.label, value: o.value, ...(o.description ? { description: o.description } : {}) }));
    if (c.type !== 2) Object.assign(item, { min: c.min_values ?? 1, max: c.max_values ?? 1 });
    out.push(item);
  });
  return out.slice(0, 40);
}

export function formFields(form: Json) {
  const out: Json[] = [];
  walk(form?.components || [], (c, label) => {
    if (!c.custom_id || ![3, 4, 5, 6, 7, 8, 19].includes(c.type)) return;
    const f: Json = {
      id: c.custom_id,
      label: c.label || label || c.placeholder || c.custom_id,
      kind: c.type === 4 ? (c.style === 2 ? "long text" : "text") : c.type === 19 ? "file upload (not possible here)" : COMPONENT_KINDS[c.type],
      required: c.required !== false,
    };
    if (c.value) f.current = c.value;
    if (c.max_length) f.max_length = c.max_length;
    if (c.type === 3) f.options = (c.options || []).map((o: Json) => ({ label: o.label, value: o.value }));
    out.push(f);
  });
  return { title: form?.title || "Form", fields: out };
}

// A bridge result (run, click, submit, poll) as an AI-readable summary.
export function summarize(snap: Json) {
  const messages = (snap?.messages || []).filter((m: Json) => !m.deleted).map((m: Json) => ({
    message_id: m.id,
    posted_in_discord: !m.ephemeral,
    ...(m.channelId && !m.ephemeral ? { channel: `#${snap.names?.channels?.[m.channelId] ?? m.channelId}` } : {}),
    text: m.thinking ? "(still working…)" : panelText(m.payload, snap.names),
    controls: panelControls(m.payload),
    ...(m.payload?.files?.length ? { images: m.payload.files.map((f: Json) => f.name) } : {}),
  }));
  return {
    run_id: snap?.runId,
    done: !!snap?.done,
    ...(snap?.error ? { error: snap.error } : {}),
    ...(snap?.modal ? { form: { form_id: snap.runId, ...formFields(snap.modal.json) } } : {}),
    messages,
    next: snap?.modal
      ? "A form opened. Ask the player for the answers, preview with submit_form, then confirm."
      : !snap?.done
      ? "Still running. Call check_action with this run_id in a few seconds."
      : messages.some((m: Json) => m.controls.length)
      ? "Buttons and menus above can be used with press_button (preview first)."
      : "Done.",
  };
}

// ---------- Catalogue ----------

function allowed(action: Json, areaKey: string | null) {
  return !BLOCKED_ACTIONS.has(action.id) && !(areaKey && BLOCKED_AREAS.has(areaKey)) && !action.denied && !action.discordOnly;
}

async function catalogue(ctx: Ctx, guildId: string) {
  const c = await call(ctx, "context", { guildId });
  const actions: Json[] = [];
  const add = (a: Json, area: string, areaKey: string | null) => {
    if (!allowed(a, areaKey)) return;
    actions.push({
      id: a.id,
      label: a.label,
      area,
      ...(a.hint ? { hint: a.hint } : {}),
      fields: (a.fields || []).map((f: Json) => ({
        name: f.name,
        type: f.kind === "when" ? "date/time text (e.g. 2026-10-20 20:00 or 'tomorrow 8pm', server timezone)" : FIELD_TYPES[f.type] || "text",
        required: f.required,
        ...(f.description ? { description: f.description } : {}),
        ...(f.choices ? { choices: f.choices.map((x: Json) => x.value) } : {}),
        ...(f.autocomplete ? { options_from: "get_field_options" } : {}),
        ...(f.min !== undefined ? { min: f.min } : {}),
        ...(f.max !== undefined ? { max: f.max } : {}),
      })),
    });
  };
  for (const a of c.player?.actions || []) add(a, "Player", null);
  for (const area of c.areas || []) for (const a of area.actions || []) add(a, area.label, area.key);
  return { raw: c, actions };
}

export async function logChange(ctx: Ctx, guildId: string, tool: string, target: string, detail: Json, outcome: { ok: boolean; error?: string }) {
  await ctx.db.from("mcp_action_log").insert({
    token_id: ctx.tokenId ?? null,
    discord_user_id: ctx.discordUserId,
    guild_id: guildId,
    tool,
    target: target.slice(0, 200),
    detail,
    ok: outcome.ok,
    error: outcome.error?.slice(0, 300) ?? null,
  }).then(() => {}, (e: unknown) => console.error("[gafferbot-mcp] action log failed:", e));
}

export async function underLimit(ctx: Ctx) {
  if ((await changesLastHour(ctx.db, ctx.discordUserId)) >= CHANGES_PER_HOUR) {
    throw new ToolError(`That's ${CHANGES_PER_HOUR} changes from AI apps in the last hour, the limit. Try again later or use Discord.`);
  }
}

// Runs a confirmed change, logs it either way.
async function change(ctx: Ctx, guildId: string, tool: string, target: string, detail: Json, op: string, args: Record<string, unknown>) {
  await underLimit(ctx);
  try {
    const snap = await call(ctx, op, { guildId, ...args });
    await logChange(ctx, guildId, tool, target, detail, { ok: !snap?.error, error: snap?.error });
    return summarize(snap);
  } catch (err) {
    await logChange(ctx, guildId, tool, target, detail, { ok: false, error: (err as Error).message });
    throw err;
  }
}

const preview = (what: string, extra: Json = {}) => ({
  preview: true,
  nothing_changed_yet: true,
  will: what,
  ...extra,
  next: "Show this to the player. Only if they say yes, call the same tool again with the same arguments plus confirm: true.",
});

const valuesOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

const guildIdProp = { type: "string", description: "Discord server ID from list_servers. Optional when you are in only one server." };
const confirmProp = { type: "boolean", description: "Leave out to preview. true only after the player said yes to the preview." };

export const MANAGE_TOOLS: Tool<Ctx>[] = [
  {
    name: "list_club_actions",
    title: "Club actions I can run",
    scope: SCOPE_MANAGE,
    description: "The Discord panel actions you can run in a server (the same /manager and /me buttons you have in Discord, " +
      "minus admin, premium, Network and removal tools), with each action's fields, plus the channels GafferBot can post in.",
    inputSchema: { type: "object", properties: { guild_id: guildIdProp }, additionalProperties: false },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      const { raw, actions } = await catalogue(ctx, guildId);
      return {
        server: raw.guild?.name,
        you_are: raw.leader ? "a club leader (manager, captain or admin)" : "a player",
        timezone: raw.timezone,
        default_channel_id: raw.defaultChannelId,
        channels: (raw.channels || []).filter((c: Json) => c.canSend).map((c: Json) => ({ id: c.id, name: c.name, ...(c.parent ? { category: c.parent } : {}) })),
        actions,
      };
    },
  },
  {
    name: "find_members",
    title: "Find server members",
    scope: SCOPE_MANAGE,
    description: "Search the server's members by name to get the Discord user id a player field needs.",
    inputSchema: { type: "object", properties: { guild_id: guildIdProp, query: { type: "string", description: "Part of a name." } }, required: ["query"], additionalProperties: false },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      const r = await call(ctx, "members", { guildId, query: str(args.query) || "" });
      return { members: (r.members || []).map((m: Json) => ({ id: m.id, name: m.name, username: m.username })) };
    },
  },
  {
    name: "get_field_options",
    title: "Options for a field",
    scope: SCOPE_MANAGE,
    description: "Suggestions for an action field marked options_from: get_field_options (for example which event to edit).",
    inputSchema: {
      type: "object",
      properties: { guild_id: guildIdProp, action: { type: "string" }, field: { type: "string" }, typed: { type: "string", description: "What to search for (optional)." } },
      required: ["action", "field"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      const r = await call(ctx, "choices", { guildId, actionId: str(args.action), field: str(args.field), focused: str(args.typed) || "" });
      return { options: r.choices || [] };
    },
  },
  {
    name: "run_club_action",
    title: "Run a club action",
    scope: SCOPE_MANAGE,
    readOnly: false,
    description: "Runs one action from list_club_actions as you, exactly like pressing it in Discord. Without confirm it only " +
      "previews. Anything public is posted in channel_id (default: the server's main channel).",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: guildIdProp,
        action: { type: "string", description: "Action id from list_club_actions." },
        values: { type: "object", description: "Field name → value, as listed for the action.", additionalProperties: true },
        channel_id: { type: "string", description: "Channel id from list_club_actions for anything posted publicly." },
        confirm: confirmProp,
      },
      required: ["action"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      const actionId = str(args.action) || "";
      const { raw, actions } = await catalogue(ctx, guildId);
      const action = actions.find((a: Json) => a.id === actionId);
      if (!action) throw new ToolError(`"${actionId}" isn't an action you can run here. Call list_club_actions.`);
      const values = valuesOf(args.values);
      const missing = action.fields.filter((f: Json) => f.required && (values[f.name] === undefined || values[f.name] === "")).map((f: Json) => f.name);
      if (missing.length) throw new ToolError(`Fill in ${missing.join(", ")} first.`);
      const channelId = str(args.channel_id) || raw.defaultChannelId;
      const channel = (raw.channels || []).find((c: Json) => c.id === channelId && c.canSend);
      if (!channel) throw new ToolError("Pick a channel_id from list_club_actions that GafferBot can post in.");
      if (!confirmed(args)) {
        return preview(`Run "${action.label}" (${action.area}) in ${raw.guild?.name} as you. Anything public goes to #${channel.name}.`, { values });
      }
      return change(ctx, guildId, "run_club_action", actionId, { values, channel_id: channelId }, "run", { actionId, values, channelId });
    },
  },
  {
    name: "press_button",
    title: "Press a button or pick from a menu",
    scope: SCOPE_MANAGE,
    readOnly: false,
    description: "Presses a button, or picks options in a menu, on a message a club action returned (its message_id and " +
      "control id). Without confirm it only previews.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: guildIdProp,
        message_id: { type: "string" },
        control_id: { type: "string", description: "The control's id from the message's controls." },
        values: { type: "array", items: { type: "string" }, description: "For menus: the option values (or user/role/channel ids) to pick." },
        confirm: confirmProp,
      },
      required: ["message_id", "control_id"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      const messageId = str(args.message_id) || "";
      const customId = str(args.control_id) || "";
      const values = Array.isArray(args.values) ? args.values.map(String).slice(0, 25) : [];
      const d = await call(ctx, "describe", { guildId, messageId, customId });
      const comp = d.component;
      if (!confirmed(args)) {
        const picked = comp.type === 3
          ? values.map((v) => (comp.options || []).find((o: Json) => o.value === v)?.label ?? v)
          : values;
        const what = comp.type === 2
          ? `Press "${comp.label || customId}" on: ${panelText(d.message).split("\n")[0] || "the panel"}`
          : `Pick ${picked.length ? picked.map((p) => `"${p}"`).join(", ") : "nothing yet"} in "${comp.placeholder || customId}"`;
        return preview(what);
      }
      return change(ctx, guildId, "press_button", comp.label || comp.placeholder || customId, { custom_id: customId, values }, "click", { messageId, customId, values });
    },
  },
  {
    name: "submit_form",
    title: "Fill in a form",
    scope: SCOPE_MANAGE,
    readOnly: false,
    description: "Answers a form that an action or button opened (form_id and field ids from its result). Without confirm it only previews.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: guildIdProp,
        form_id: { type: "string" },
        values: { type: "object", description: "Field id → answer (text, or a list of option values for menus).", additionalProperties: true },
        confirm: confirmProp,
      },
      required: ["form_id", "values"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      const runId = str(args.form_id) || "";
      const values = valuesOf(args.values);
      const d = await call(ctx, "describe", { guildId, runId });
      const form = formFields(d.form);
      const missing = form.fields.filter((f: Json) => f.required && !f.kind.startsWith("file") && (values[f.id] === undefined || values[f.id] === "")).map((f: Json) => f.label);
      if (missing.length) throw new ToolError(`Fill in ${missing.join(", ")} first.`);
      if (!confirmed(args)) {
        return preview(`Send the "${form.title}" form with these answers.`, {
          answers: Object.fromEntries(form.fields.map((f: Json) => [f.label, values[f.id] ?? "(blank)"])),
        });
      }
      return change(ctx, guildId, "submit_form", form.title, { values }, "submit", { runId, values });
    },
  },
  {
    name: "check_action",
    title: "Check on a running action",
    scope: SCOPE_MANAGE,
    description: "The latest result of an action that was still running (run_id from its result).",
    inputSchema: { type: "object", properties: { guild_id: guildIdProp, run_id: { type: "string" } }, required: ["run_id"], additionalProperties: false },
    run: async (args, ctx) => {
      const guildId = await resolveGuild(args, ctx);
      return summarize(await call(ctx, "poll", { guildId, runId: str(args.run_id) }));
    },
  },
];
