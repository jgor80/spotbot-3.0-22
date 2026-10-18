// Lineup tools: suggesting is open to members of the event's server and changes nothing; publishing
// previews first, then posts through the bot, gets logged and respects the hourly limit.
import { handleBody } from "./protocol.ts";
import { Ctx, PanelBridge } from "./tools.ts";
import { LINEUP_TOOLS } from "./lineups.ts";
import { CHANGES_PER_HOUR } from "./limits.ts";
import { memoryDb } from "./test-db.ts";

const ME = "111111111111111111";
const HOME = "222222222222222222";
const EVENT = "3f1c2b4a-1111-4222-8333-444455556666";
const OTHER_EVENT = "3f1c2b4a-1111-4222-8333-777788889999";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup(lineups: PanelBridge | null = null) {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const bridge: PanelBridge = lineups ?? {
    handle: (op, args) => {
      calls.push({ op, args });
      const xi = { formation: "4-3-3 FLAT", starting_xi: [{ slot: 0, position: "GK", player: "keeper", player_id: ME, fit: "comp position" }], bench: [], open_spots: [] };
      if (op === "publish" && args.confirm) return Promise.resolve({ published: true, lineup_id: "l1", ...xi });
      if (op === "publish") return Promise.resolve({ ...xi, replaces_existing_team_sheet: true });
      return Promise.resolve(xi);
    },
  };
  const db = memoryDb({
    mcp_action_log: [],
    availability_events: [{ id: EVENT, guild_id: HOME }, { id: OTHER_EVENT, guild_id: "999999999999999999" }],
  });
  const ctx: Ctx = { db, discordUserId: ME, access: (g) => Promise.resolve(g === HOME ? "member" : null), tokenId: "tok1", lineups: bridge };
  // deno-lint-ignore no-explicit-any
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError?: boolean; data: any }> => {
    // deno-lint-ignore no-explicit-any
    const reply: any = await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, LINEUP_TOOLS, ctx);
    const text = reply.result.content[0].text;
    let data = null;
    try { data = JSON.parse(text); } catch { /* error text */ }
    return { text, isError: reply.result.isError, data };
  };
  return { calls, db, call };
}

Deno.test("suggest_lineup asks the bot as the player and logs nothing", async () => {
  const { calls, db, call } = setup();
  const { data } = await call("suggest_lineup", { event_id: EVENT, formation: "4-3-3 FLAT", changes: [{ slot: 0, player_id: ME }] });
  assert(data.formation === "4-3-3 FLAT" && data.next.includes("publish_lineup"), "no suggestion");
  assert(calls[0].op === "suggest" && calls[0].args.userId === ME && calls[0].args.guildId === HOME && calls[0].args.eventId === EVENT, "bridge args");
  assert((calls[0].args.changes as unknown[]).length === 1, "changes not passed");
  assert(db.tables.mcp_action_log.length === 0, "suggestion logged as a change");
});

Deno.test("events in servers the player isn't in stay hidden", async () => {
  const { calls, call } = setup();
  const other = await call("suggest_lineup", { event_id: OTHER_EVENT });
  assert(other.isError && other.text.includes("not found") && !calls.length, "other server's event reachable");
  const bad = await call("suggest_lineup", { event_id: "tonight" });
  assert(bad.isError && bad.text.includes("list_events"), "bad id accepted");
});

Deno.test("publish_lineup previews, then posts, logs and respects the limit", async () => {
  const { calls, db, call } = setup();
  const prev = await call("publish_lineup", { event_id: EVENT });
  assert(prev.data.preview && prev.data.will.includes("replacing"), "no preview");
  assert(!calls.some((c) => c.args.confirm) && db.tables.mcp_action_log.length === 0, "preview posted something");

  const done = await call("publish_lineup", { event_id: EVENT, confirm: true });
  assert(done.data.published && calls.some((c) => c.op === "publish" && c.args.confirm === true), "not published");
  const log = db.tables.mcp_action_log[0];
  assert(log && log.tool === "publish_lineup" && log.ok === true, "not logged");

  for (let i = 0; i < CHANGES_PER_HOUR; i++) db.tables.mcp_action_log.push({ discord_user_id: ME, created_at: new Date().toISOString() });
  const limited = await call("publish_lineup", { event_id: EVENT, confirm: true });
  assert(limited.isError && limited.text.includes("limit"), "limit not enforced");
});

Deno.test("bot refusals come back as readable errors", async () => {
  const refuse: PanelBridge = { handle: () => Promise.reject(Object.assign(new Error("Only Palermo's leaders can publish a lineup."), { status: 403 })) };
  const { call } = setup(refuse);
  const r = await call("publish_lineup", { event_id: EVENT, confirm: true });
  assert(r.isError && r.text.includes("leaders"), "refusal not shown");
});
