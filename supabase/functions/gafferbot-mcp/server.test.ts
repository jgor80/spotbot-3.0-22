import { handleBody } from './protocol.ts';
import { Ctx, TOOLS } from './tools.ts';
import { generateToken, hashToken, looksLikeToken } from '../_shared/mcp-tokens.ts';

const ME = '111111111111111111';
const HOME = '222222222222222222';
const OTHER = '333333333333333333';
const EVENT_HOME = '11111111-1111-4111-8111-111111111111';
const EVENT_OTHER = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;
const TABLES: Record<string, Row[]> = {
  guild_settings: [
    { guild_id: HOME, name: 'Home FC', clubs: [{ key: 'club1', name: 'Home FC', enabled: true, ea_club_id: '9' }, { key: 'club2', name: 'Off', enabled: false }] },
    { guild_id: OTHER, name: 'Rivals', clubs: [] },
  ],
  player_summary: [
    { guild_id: HOME, discord_user_id: ME, discord_username: 'jeff', goals: 5, games_played: 3 },
    { guild_id: HOME, discord_user_id: '444444444444444444', discord_username: 'striker', goals: 9, games_played: 3 },
  ],
  user_roles: [],
  player_streaks: [],
  club_stats: [{ guild_id: HOME, club_key: 'club1', club_name: 'Home FC', wins: 10 }, { guild_id: OTHER, club_key: 'club1', club_name: 'Rivals', wins: 1 }],
  availability_events: [
    { id: EVENT_HOME, guild_id: HOME, title: 'League night', scheduled_at: new Date(Date.now() + 86400000).toISOString(), cancelled: false },
    { id: EVENT_OTHER, guild_id: OTHER, title: 'Secret', scheduled_at: new Date(Date.now() + 86400000).toISOString(), cancelled: false },
  ],
  player_availability: [{ event_id: EVENT_HOME, discord_user_id: ME, response: 'yes' }, { event_id: EVENT_HOME, discord_user_id: '555555555555555555', response: 'no' }, { event_id: EVENT_OTHER, discord_user_id: ME, response: 'no' }],
  profiles: [],
};

// In-memory stand-in for the supabase-js query builder, enough for the tools' filters.
function fakeDb() {
  return {
    from(table: string) {
      let rows = [...(TABLES[table] || [])];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
        gte: (c: string, v: string | number) => { rows = rows.filter((r) => (r[c] as string | number) >= v); return q; },
        lt: (c: string, v: string | number) => { rows = rows.filter((r) => (r[c] as string | number) < v); return q; },
        ilike: (c: string, v: string) => { const n = v.replace(/%/g, '').toLowerCase(); rows = rows.filter((r) => String(r[c]).toLowerCase().includes(n)); return q; },
        is: () => q,
        or: () => q,
        order: (c: string, o?: { ascending?: boolean }) => { rows.sort((a, b) => ((a[c] as number) > (b[c] as number) ? 1 : -1) * (o?.ascending === false ? -1 : 1)); return q; },
        limit: (n: number) => { rows = rows.slice(0, n); return q; },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return q;
    },
  };
}

function ctx(): Ctx {
  return { db: fakeDb(), discordUserId: ME, access: (g) => Promise.resolve(g === HOME ? 'member' : null) };
}

// deno-lint-ignore no-explicit-any
async function call(name: string, args: Row = {}): Promise<{ text: string; isError?: boolean; data: any }> {
  // deno-lint-ignore no-explicit-any
  const reply: any = await handleBody({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, TOOLS, ctx());
  const text = reply.result.content[0].text;
  let data = null;
  try { data = JSON.parse(text); } catch { /* error text */ }
  return { text, isError: reply.result.isError, data };
}

Deno.test('initialize negotiates the protocol version and notifications get no reply', async () => {
  // deno-lint-ignore no-explicit-any
  const init: any = await handleBody({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, TOOLS, ctx());
  if (init.result.protocolVersion !== '2025-03-26' || !init.result.capabilities.tools) throw new Error('Bad initialize');
  // deno-lint-ignore no-explicit-any
  const unknown: any = await handleBody({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, TOOLS, ctx());
  if (unknown.result.protocolVersion !== '2025-06-18') throw new Error('Unsupported version not replaced');
  if ((await handleBody({ jsonrpc: '2.0', method: 'notifications/initialized' }, TOOLS, ctx())) !== null) throw new Error('Notification answered');
  // deno-lint-ignore no-explicit-any
  const missing: any = await handleBody({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, TOOLS, ctx());
  if (missing.error?.code !== -32601) throw new Error('Unknown method accepted');
});

Deno.test('every tool is listed as read-only with an object schema', async () => {
  // deno-lint-ignore no-explicit-any
  const list: any = await handleBody({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, TOOLS, ctx());
  if (list.result.tools.length !== TOOLS.length) throw new Error('Tools missing');
  for (const t of list.result.tools) {
    if (t.inputSchema.type !== 'object' || !t.annotations.readOnlyHint) throw new Error(`${t.name} schema`);
  }
});

Deno.test('list_servers only shows servers the player can access, with enabled clubs', async () => {
  const { data } = await call('list_servers');
  if (data.servers.length !== 1 || data.servers[0].guild_id !== HOME) throw new Error('Leaked or missing server');
  if (data.servers[0].clubs.length !== 1 || !data.servers[0].clubs[0].ea_linked) throw new Error('Clubs wrong');
});

Deno.test('tools refuse servers and events the player cannot access', async () => {
  const club = await call('get_club_stats', { guild_id: OTHER });
  if (!club.isError || !club.text.includes("don't have access")) throw new Error('Other server readable');
  const event = await call('get_event', { event_id: EVENT_OTHER });
  if (!event.isError || event.text.includes('Secret')) throw new Error('Other server event readable');
  const bad = await call('get_club_stats', { guild_id: 'abc' });
  if (!bad.isError) throw new Error('Bad guild id accepted');
});

Deno.test('guild_id defaults to the only server and leaderboards sort by the stat', async () => {
  const club = await call('get_club_stats');
  if (club.data.clubs.length !== 1 || club.data.clubs[0].club_name !== 'Home FC') throw new Error('Default server not used');
  const board = await call('get_players', { sort_by: 'goals' });
  if (board.data.players[0].discord_username !== 'striker') throw new Error('Not sorted');
  const me = await call('get_players', { player: 'me' });
  if (me.data.player.discord_username !== 'jeff') throw new Error('"me" not resolved');
});

Deno.test('list_events counts answers and shows your own', async () => {
  const { data } = await call('list_events');
  if (data.events.length !== 1 || data.events[0].your_answer !== 'yes' || data.events[0].answers.yes !== 1) throw new Error('Event answers wrong');
});

Deno.test('get_event names players with no stats or profile from their Discord server name', async () => {
  const real = globalThis.fetch;
  const hadToken = Deno.env.get('DISCORD_BOT_TOKEN');
  Deno.env.set('DISCORD_BOT_TOKEN', 'bot');
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const u = String(input);
    if (u.endsWith(`/guilds/${HOME}/members/555555555555555555`)) return Promise.resolve(new Response(JSON.stringify({ nick: 'Ragnar', user: { username: 'violentragnar' } })));
    return Promise.resolve(new Response('{}', { status: 404 }));
  }) as typeof fetch;
  try {
    const { data } = await call('get_event', { event_id: EVENT_HOME });
    if (data.yes[0].player !== 'jeff') throw new Error('Stats name not used');
    if (data.no[0].player !== 'Ragnar') throw new Error(`Discord name not used: ${data.no[0].player}`);
  } finally {
    globalThis.fetch = real;
    if (hadToken === undefined) Deno.env.delete('DISCORD_BOT_TOKEN');
    else Deno.env.set('DISCORD_BOT_TOKEN', hadToken);
  }
});

Deno.test('tokens are prefixed, random and stored only as a stable hash', async () => {
  const a = generateToken();
  const b = generateToken();
  if (a === b || !looksLikeToken(a) || looksLikeToken('eyJhbGciOi.jwt')) throw new Error('Token format');
  if ((await hashToken(a)) !== (await hashToken(a)) || (await hashToken(a)).length !== 64) throw new Error('Hash');
});
