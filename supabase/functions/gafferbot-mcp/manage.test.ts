// Club actions for manage-scoped AI apps: previews never touch the bot, confirmed changes go through the
// Control Room bridge as the player, get logged, and stop at the hourly limit.
import { handleBody } from "./protocol.ts";
import { Ctx, PanelBridge } from "./tools.ts";
import { MANAGE_TOOLS, summarize } from "./manage.ts";
import { allowCall, CHANGES_PER_HOUR } from "./limits.ts";
import { memoryDb } from "./test-db.ts";

const ME = "111111111111111111";
const HOME = "222222222222222222";
const CHANNEL = "555555555555555555";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

const CONTEXT = {
  guild: { id: HOME, name: "Home FC" },
  leader: true,
  timezone: "Europe/Rome",
  defaultChannelId: CHANNEL,
  channels: [{ id: CHANNEL, name: "general", canSend: true }, { id: "666666666666666666", name: "rules", canSend: false }],
  player: { actions: [{ id: "available", label: "My Events", fields: [] }, { id: "aiaccess", label: "AI Assistant", fields: [] }] },
  areas: [
    { key: "events", label: "Events", actions: [
      { id: "ev_quick_friendly", label: "Friendly", fields: [{ name: "when", kind: "when", type: 3, required: true }] },
      { id: "ev_cancel", label: "Cancel Event", fields: [], denied: "Only managers" },
    ] },
    { key: "roster", label: "Roster", actions: [{ id: "ro_remove", label: "Remove Player", fields: [] }] },
    { key: "admin", label: "Admin", actions: [{ id: "ad_setclub", label: "Link EA Club", fields: [] }] },
  ],
};

function setup() {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const panels: PanelBridge = {
    handle: (op, args) => {
      calls.push({ op, args });
      if (op === "context") return Promise.resolve(CONTEXT);
      if (op === "describe") return Promise.resolve({ kind: "button", component: { type: 2, custom_id: "ev:yes", label: "I'm in" }, message: { content: "League night" } });
      return Promise.resolve({
        runId: "run1", done: true, modal: null,
        messages: [{ id: "m1", ephemeral: false, channelId: CHANNEL, payload: { content: "Friendly posted for <@333333333333333333>", embeds: [], components: [{ type: 1, components: [{ type: 2, custom_id: "ev:yes", label: "I'm in" }, { type: 2, url: "https://x", label: "link" }] }] } }],
        names: { users: { "333333333333333333": "striker" }, channels: { [CHANNEL]: "general" } },
      });
    },
  };
  const db = memoryDb({ mcp_action_log: [] });
  const ctx: Ctx = { db, discordUserId: ME, access: (g) => Promise.resolve(g === HOME ? "leader" : null), tokenId: "tok1", panels };
  // deno-lint-ignore no-explicit-any
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError?: boolean; data: any }> => {
    // deno-lint-ignore no-explicit-any
    const reply: any = await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { guild_id: HOME, ...args } } }, MANAGE_TOOLS, ctx);
    const text = reply.result.content[0].text;
    let data = null;
    try { data = JSON.parse(text); } catch { /* error text */ }
    return { text, isError: reply.result.isError, data };
  };
  return { calls, db, call, ctx };
}

Deno.test("list_club_actions hides blocked, denied and admin actions", async () => {
  const { call } = setup();
  const { data } = await call("list_club_actions");
  const ids = data.actions.map((a: { id: string }) => a.id);
  assert(ids.includes("available") && ids.includes("ev_quick_friendly"), "allowed actions missing");
  for (const id of ["aiaccess", "ev_cancel", "ro_remove", "ad_setclub"]) assert(!ids.includes(id), `${id} exposed`);
  assert(data.channels.length === 1 && data.channels[0].name === "general", "unpostable channel listed");
});

Deno.test("run_club_action previews first, then runs through the bridge and logs", async () => {
  const { calls, db, call } = setup();
  const missing = await call("run_club_action", { action: "ev_quick_friendly" });
  assert(missing.isError && missing.text.includes("when"), "missing field not caught");
  const blocked = await call("run_club_action", { action: "ro_remove", confirm: true });
  assert(blocked.isError && !calls.some((c) => c.op === "run"), "blocked action ran");

  const prev = await call("run_club_action", { action: "ev_quick_friendly", values: { when: "tomorrow 8pm" } });
  assert(prev.data.preview && prev.data.will.includes("#general"), "no preview");
  assert(!calls.some((c) => c.op === "run") && db.tables.mcp_action_log.length === 0, "preview changed something");

  const done = await call("run_club_action", { action: "ev_quick_friendly", values: { when: "tomorrow 8pm" }, confirm: true });
  const run = calls.find((c) => c.op === "run")!;
  assert(run.args.userId === ME && run.args.actionId === "ev_quick_friendly" && run.args.channelId === CHANNEL, "bridge args");
  assert(done.data.messages[0].text.includes("@striker") && done.data.messages[0].controls.length === 1, "result not summarized");
  const log = db.tables.mcp_action_log[0];
  assert(log && log.token_id === "tok1" && log.target === "ev_quick_friendly" && log.ok === true, "change not logged");
});

Deno.test("press_button previews the label and stops at the hourly limit", async () => {
  const { calls, db, call } = setup();
  const prev = await call("press_button", { message_id: "m1", control_id: "ev:yes" });
  assert(prev.data.preview && prev.data.will.includes("I'm in") && !calls.some((c) => c.op === "click"), "button pressed on preview");
  for (let i = 0; i < CHANGES_PER_HOUR; i++) db.tables.mcp_action_log.push({ discord_user_id: ME, created_at: new Date().toISOString() });
  const limited = await call("press_button", { message_id: "m1", control_id: "ev:yes", confirm: true });
  assert(limited.isError && limited.text.includes("limit") && !calls.some((c) => c.op === "click"), "limit not enforced");
});

Deno.test("a batch of confirmed changes can't run past the hourly limit", async () => {
  const { db, ctx } = setup();
  for (let i = 0; i < CHANGES_PER_HOUR - 1; i++) db.tables.mcp_action_log.push({ discord_user_id: ME, created_at: new Date().toISOString() });
  const msg = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "run_club_action", arguments: { guild_id: HOME, action: "ev_quick_friendly", values: { when: "tomorrow 8pm" }, confirm: true } } });
  // deno-lint-ignore no-explicit-any
  const replies: any = await handleBody([1, 2, 3, 4, 5].map(msg), MANAGE_TOOLS, ctx);
  const ran = replies.filter((r: { result: { isError?: boolean } }) => !r.result.isError).length;
  assert(ran === 1, `ran ${ran} changes with one left this hour`);
});

Deno.test("manage tools say clearly when the bot isn't reachable", async () => {
  // deno-lint-ignore no-explicit-any
  const reply: any = await handleBody(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_club_actions", arguments: { guild_id: HOME } } },
    MANAGE_TOOLS,
    { db: memoryDb(), discordUserId: ME, access: () => Promise.resolve("leader"), panels: null },
  );
  assert(reply.result.isError && reply.result.content[0].text.includes("GafferBot server"), "no clear error");
});

Deno.test("write tools are marked as changing things; forms are summarized", async () => {
  // deno-lint-ignore no-explicit-any
  const list: any = await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/list" }, MANAGE_TOOLS, {} as Ctx);
  const run = list.result.tools.find((t: { name: string }) => t.name === "run_club_action");
  assert(run.annotations.readOnlyHint === false && run.annotations.destructiveHint === true, "write tool annotated read-only");
  const s = summarize({ runId: "r9", done: true, modal: { json: { title: "Edit event", components: [{ type: 18, label: "Title", component: { type: 4, custom_id: "title", style: 1 } }] } }, messages: [] });
  assert(s.form?.form_id === "r9" && s.form.fields[0].label === "Title" && s.form.fields[0].required, "form not summarized");
});

Deno.test("call limiter allows a burst then blocks", () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 3; i++) assert(allowCall(key, 1000, 3), "blocked too early");
  assert(!allowCall(key, 1000, 3), "not blocked");
  assert(allowCall(key, 70_000, 3), "window didn't slide");
});
