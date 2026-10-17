// Channel tools for manage-scoped AI apps: reads go straight through, deletes are leader-only, preview
// without touching anything, then run through the bot as the player, get logged and respect the limit.
import { handleBody } from "./protocol.ts";
import { Ctx, PanelBridge } from "./tools.ts";
import { MODERATION_TOOLS } from "./moderation.ts";
import { CHANGES_PER_HOUR } from "./limits.ts";
import { memoryDb } from "./test-db.ts";

const ME = "111111111111111111";
const HOME = "222222222222222222";
const CHANNEL = "555555555555555555";
const MSG = "777777777777777777";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup(level: "leader" | "member" = "leader") {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const moderation: PanelBridge = {
    handle: (op, args) => {
      calls.push({ op, args });
      const channel = { id: CHANNEL, name: "general" };
      if (op === "read") return Promise.resolve({ channel, messages: [{ id: MSG, author: "striker", text: "hi" }], older: null });
      if (op === "plan") {
        return Promise.resolve(args.mode === "clear"
          ? { channel, mode: "clear", will_delete: 2000, recent_bulk: 300, older_one_by_one: 1700, kept: { pinned: 1, gafferbot_panel: 2 }, more_than_counted: true, max_per_run: 10000 }
          : { channel, mode: "delete", will_delete: 1, recent_bulk: 0, older_one_by_one: 1, kept: { pinned: 0, gafferbot_panel: 0 }, not_found: [], messages: [{ id: MSG }] });
      }
      return Promise.resolve({ job_id: "job1", channel, mode: op, done: op === "delete", deleted: 1, failed: 0, kept: { pinned: 0, gafferbot_panel: 0 } });
    },
  };
  const db = memoryDb({ mcp_action_log: [] });
  const ctx: Ctx = { db, discordUserId: ME, access: (g) => Promise.resolve(g === HOME ? level : null), tokenId: "tok1", moderation };
  // deno-lint-ignore no-explicit-any
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError?: boolean; data: any }> => {
    // deno-lint-ignore no-explicit-any
    const reply: any = await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { guild_id: HOME, ...args } } }, MODERATION_TOOLS, ctx);
    const text = reply.result.content[0].text;
    let data = null;
    try { data = JSON.parse(text); } catch { /* error text */ }
    return { text, isError: reply.result.isError, data };
  };
  return { calls, db, call };
}

Deno.test("read_channel_messages reads as the player without logging a change", async () => {
  const { calls, db, call } = setup("member");
  const { data } = await call("read_channel_messages", { channel_id: CHANNEL, limit: 10 });
  assert(data.messages[0].text === "hi", "messages missing");
  assert(calls[0].op === "read" && calls[0].args.userId === ME && calls[0].args.channelId === CHANNEL, "bridge args");
  assert(db.tables.mcp_action_log.length === 0, "read logged as a change");
  const bad = await call("read_channel_messages", { channel_id: "general" });
  assert(bad.isError && bad.text.includes("list_channels"), "bad channel id accepted");
});

Deno.test("delete_channel_messages is leader only and previews before deleting", async () => {
  const member = setup("member");
  const denied = await member.call("delete_channel_messages", { channel_id: CHANNEL, message_ids: [MSG], confirm: true });
  assert(denied.isError && denied.text.includes("leaders") && !member.calls.length, "member could delete");

  const { calls, db, call } = setup();
  const prev = await call("delete_channel_messages", { channel_id: CHANNEL, message_ids: [MSG] });
  assert(prev.data.preview && prev.data.will.includes("1 message") && prev.data.will.includes("older than 14 days"), "no preview");
  assert(!calls.some((c) => c.op === "delete") && db.tables.mcp_action_log.length === 0, "preview deleted something");

  const done = await call("delete_channel_messages", { channel_id: CHANNEL, message_ids: [MSG], confirm: true });
  const del = calls.find((c) => c.op === "delete")!;
  assert(del.args.userId === ME && (del.args.messageIds as string[])[0] === MSG && del.args.includeKept === false, "bridge args");
  assert(done.data.deleted === 1 && done.data.next === "Done.", "result");
  const log = db.tables.mcp_action_log[0];
  assert(log && log.tool === "delete_channel_messages" && log.target === "#general" && log.ok === true, "not logged");
});

Deno.test("clear_channel previews counts and kept panels, then starts a job; limit applies", async () => {
  const { calls, db, call } = setup();
  const prev = await call("clear_channel", { channel_id: CHANNEL });
  assert(prev.data.will.includes("at least 2000") && prev.data.kept.includes("2 GafferBot panel"), "preview counts");
  assert(calls[0].args.mode === "clear" && !calls.some((c) => c.op === "clear"), "preview cleared");

  const started = await call("clear_channel", { channel_id: CHANNEL, confirm: true });
  assert(started.data.job_id === "job1" && started.data.next.includes("check_channel_cleanup"), "job not returned");

  for (let i = 0; i < CHANGES_PER_HOUR; i++) db.tables.mcp_action_log.push({ discord_user_id: ME, created_at: new Date().toISOString() });
  const limited = await call("clear_channel", { channel_id: CHANNEL, confirm: true });
  assert(limited.isError && limited.text.includes("limit") && calls.filter((c) => c.op === "clear").length === 1, "limit not enforced");
});

Deno.test("channel tools say clearly when the bot isn't reachable", async () => {
  // deno-lint-ignore no-explicit-any
  const reply: any = await handleBody(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_channels", arguments: { guild_id: HOME } } },
    MODERATION_TOOLS,
    { db: memoryDb(), discordUserId: ME, access: () => Promise.resolve("leader"), moderation: null },
  );
  assert(reply.result.isError && reply.result.content[0].text.includes("GafferBot server"), "no clear error");
});
