// Who sees which tools: read-only callers get only reads, manage callers who lead no club don't see
// leader tools (and can't call them), and leaders see everything but still get checked per server.
import { handleBody } from "./protocol.ts";
import { Ctx, TOOLS, visibleTo } from "./tools.ts";
import { MANAGE_TOOLS } from "./manage.ts";
import { MODERATION_TOOLS } from "./moderation.ts";
import { isClubAdmin, SCOPE_MANAGE, SCOPE_READ } from "../_shared/mcp-tokens.ts";
import { memoryDb } from "./test-db.ts";

const ME = "111111111111111111";
const HOME = "222222222222222222";
const AWAY = "333333333333333333";
const ALL = [...TOOLS, ...MANAGE_TOOLS, ...MODERATION_TOOLS];
const LEADER_TOOLS = ["delete_channel_messages", "clear_channel", "check_channel_cleanup"];

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup(scopes: string[], levels: Record<string, "leader" | "member">, roles: { guild_id: string; role: string }[] = []) {
  const db = memoryDb({
    guild_settings: [{ guild_id: HOME, name: "Home FC", clubs: [] }, { guild_id: AWAY, name: "Away FC", clubs: [] }],
    player_summary: [],
    user_roles: roles.map((r) => ({ ...r, discord_user_id: ME })),
    mcp_action_log: [],
  });
  const ctx: Ctx = {
    db,
    discordUserId: ME,
    access: (g) => Promise.resolve(levels[g] ?? null),
    tokenId: "tok1",
    moderation: { handle: () => Promise.resolve({ job_id: "job1", done: true }) },
  };
  const tools = ALL.filter((t) => !t.scope || scopes.includes(t.scope));
  // deno-lint-ignore no-explicit-any
  const rpc = (method: string, params: Record<string, unknown> = {}): Promise<any> =>
    handleBody({ jsonrpc: "2.0", id: 1, method, params }, tools, ctx, visibleTo(ctx));
  const listed = async () => ((await rpc("tools/list")).result.tools as { name: string; annotations: { readOnlyHint: boolean } }[]);
  return { rpc, listed };
}

Deno.test("read-only callers see only read tools", async () => {
  const { listed } = setup([SCOPE_READ], { [HOME]: "leader" });
  const tools = await listed();
  assert(tools.length === TOOLS.length && tools.every((t) => t.annotations.readOnlyHint), "read token sees manage tools");
});

Deno.test("manage callers who lead no club don't see or reach leader tools", async () => {
  const { listed, rpc } = setup([SCOPE_READ, SCOPE_MANAGE], { [HOME]: "member" });
  const names = (await listed()).map((t) => t.name);
  assert(names.includes("run_club_action") && names.includes("read_channel_messages"), "member tools missing");
  assert(!LEADER_TOOLS.some((n) => names.includes(n)), "leader tools listed for a member");
  const call = await rpc("tools/call", { name: "clear_channel", arguments: { guild_id: HOME, channel_id: "555555555555555555", confirm: true } });
  assert(call.error?.message.includes("Unknown tool"), "hidden tool still callable");
});

Deno.test("a leader of any club sees leader tools, still checked per server", async () => {
  const { listed, rpc } = setup([SCOPE_READ, SCOPE_MANAGE], { [HOME]: "leader", [AWAY]: "member" }, [{ guild_id: HOME, role: "manager" }]);
  const names = (await listed()).map((t) => t.name);
  assert(LEADER_TOOLS.every((n) => names.includes(n)), "leader tools missing for a leader");
  const away = await rpc("tools/call", { name: "check_channel_cleanup", arguments: { guild_id: AWAY, job_id: "job1" } });
  assert(away.result.isError && away.result.content[0].text.includes("leaders"), "leader tool ran in a server they don't lead");
});

Deno.test("Discord server admins with no GafferBot role count as leaders", async () => {
  const { listed } = setup([SCOPE_READ, SCOPE_MANAGE], { [AWAY]: "leader" });
  const names = (await listed()).map((t) => t.name);
  assert(names.includes("clear_channel"), "Discord admin not treated as a leader");
});

Deno.test("club admins: leader roles, web admins and Discord admins of a GafferBot server", async () => {
  const never = () => Promise.resolve(false);
  const base = { guild_settings: [{ guild_id: HOME }], user_discord_links: [], web_admins: [] };
  assert(!(await isClubAdmin(memoryDb({ ...base, user_roles: [{ guild_id: HOME, discord_user_id: ME, role: "player" }] }), ME, never)), "player counted as admin");
  assert(await isClubAdmin(memoryDb({ ...base, user_roles: [{ guild_id: HOME, discord_user_id: ME, role: "captain" }] }), ME, never), "captain not an admin");
  const web = memoryDb({ ...base, user_roles: [], user_discord_links: [{ discord_user_id: ME, auth_user_id: "u1", verified: true }], web_admins: [{ id: "w1", auth_user_id: "u1" }] });
  assert(await isClubAdmin(web, ME, never), "web admin not an admin");
  let asked: string[] = [];
  const discord = await isClubAdmin(memoryDb({ ...base, user_roles: [] }), ME, (ids) => { asked = ids; return Promise.resolve(true); });
  assert(discord && asked[0] === HOME, "Discord admin check not given GafferBot servers");
});
