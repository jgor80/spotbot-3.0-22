const test = require('node:test');
const assert = require('node:assert');
const { movePlayer, resizeBoard, boardFromNames, boardToSlots, slotsToBoard, groupByPosition, MAX_BENCH, FORMATION_SLOTS, FORMATION_COORDS } = require('./lineup-autofill.cjs');
const { boardSvg, renderBoard, createLineupBoard, fitFor, squadMenu, formationMenu } = require('./lineup-board.cjs');

const board = (starters, bench = []) => ({ starters: [...starters, ...Array(11 - starters.length).fill(null)], bench });

test('dropping a starter on another spot swaps them', () => {
  const s = movePlayer(board(['gk', 'lb', 'cb']), 'lb', { zone: 'pitch', index: 2 });
  assert.deepStrictEqual(s.starters.slice(0, 3), ['gk', 'cb', 'lb']);
});

test('dropping a starter on an open spot leaves their old spot open', () => {
  const s = movePlayer(board(['gk', 'lb']), 'lb', { zone: 'pitch', index: 5 });
  assert.strictEqual(s.starters[1], null);
  assert.strictEqual(s.starters[5], 'lb');
});

test('a bench player dropped on a starter swaps with them (substitution)', () => {
  const s = movePlayer(board(['gk', 'lb'], ['sub1', 'sub2']), 'sub2', { zone: 'pitch', index: 1 });
  assert.strictEqual(s.starters[1], 'sub2');
  assert.deepStrictEqual(s.bench, ['sub1', 'lb']);
});

test('a starter dropped on a bench player swaps with them', () => {
  const s = movePlayer(board(['gk', 'lb'], ['sub1', 'sub2']), 'lb', { zone: 'bench', index: 0 });
  assert.strictEqual(s.starters[1], 'sub1');
  assert.deepStrictEqual(s.bench, ['lb', 'sub2']);
});

test('bringing in a squad player over a starter sends the starter to the bench', () => {
  const s = movePlayer(board(['gk', 'lb']), 'new', { zone: 'pitch', index: 1 });
  assert.strictEqual(s.starters[1], 'new');
  assert.deepStrictEqual(s.bench, ['lb']);
});

test('the bench holds nine and refuses a tenth', () => {
  const full = board(['gk'], Array.from({ length: MAX_BENCH }, (_, i) => `b${i}`));
  assert.strictEqual(movePlayer(full, 'new', { zone: 'bench' }), full);
  assert.strictEqual(movePlayer(full, 'gk', { zone: 'bench' }), full);
});

test('moving to the squad list takes a player out of the lineup', () => {
  const s = movePlayer(board(['gk', 'lb'], ['sub']), 'sub', { zone: 'pool' });
  assert.deepStrictEqual(s.bench, []);
  const t = movePlayer(s, 'gk', { zone: 'pool' });
  assert.strictEqual(t.starters[0], null);
});

test('bench players can be reordered', () => {
  const s = movePlayer(board([], ['a', 'b', 'c']), 'c', { zone: 'bench', index: 0 });
  assert.deepStrictEqual(s.bench, ['c', 'a', 'b']);
});

test('a smaller formation moves players past the end to the bench', () => {
  const s = resizeBoard({ starters: ['a', 'b', 'c'], bench: [] }, 2);
  assert.deepStrictEqual(s, { starters: ['a', 'b'], bench: ['c'] });
});

test('paste names fills the pitch in order, ignores shirt numbers and benches the rest', () => {
  const players = Array.from({ length: 13 }, (_, i) => ({ id: `id${i}`, names: [`Player${i}`, `disc_${i}`] }));
  const text = ['1 Player0', '2. player1', ...Array.from({ length: 9 }, (_, i) => `Player${i + 2}`), 'disc_11', 'Nobody Here'].join('\n');
  const { state, unmatched } = boardFromNames(text, players, 11);
  assert.deepStrictEqual(state.starters, Array.from({ length: 11 }, (_, i) => `id${i}`));
  assert.deepStrictEqual(state.bench, ['id11']);
  assert.deepStrictEqual(unmatched, ['Nobody Here']);
});

test('board <-> saved slots round trip, subs at 11+', () => {
  const positions = FORMATION_SLOTS['4-3-3 FLAT'];
  const s = board(['gk', null, 'cb'], ['sub']);
  const slots = boardToSlots(s, positions);
  assert.deepStrictEqual(slots.find((x) => x.discord_user_id === 'sub'), { slot_index: 11, position: 'SUB', discord_user_id: 'sub', is_substitute: true });
  assert.strictEqual(slots.find((x) => x.discord_user_id === 'cb').position, positions[2]);
  assert.deepStrictEqual(slotsToBoard(slots, 11), s);
  // Event lineups store subs at 100+
  assert.deepStrictEqual(slotsToBoard([{ slot_index: 100, discord_user_id: 'x', is_substitute: true }], 11).bench, ['x']);
});

test('lineup image draws open spots, names and the bench', () => {
  const svg = boardSvg({
    title: 'Palermo Starting XI', formation: '4-3-3 FLAT', kit: { primary: 'pink', secondary: 'black' },
    starters: [{ name: 'Keeper', rating: 80 }, null, ...Array(9).fill({ name: 'Mid <Fielder>' })],
    bench: [{ name: 'Sub One' }],
  });
  assert.match(svg, /PALERMO STARTING XI/);
  assert.match(svg, /BENCH/);
  assert.match(svg, /MID &lt;FIELDER&gt;/);
  assert.match(svg, />LB</); // the open spot shows its position
  const png = renderBoard({ title: 'XI', formation: '4-4-2 FLAT', starters: [], bench: [] });
  assert.strictEqual(Buffer.from(png).subarray(1, 4).toString(), 'PNG');
});

test('the Discord editor only answers its own buttons and binds to the opener', async () => {
  const lb = createLineupBoard({ supabase: {}, callEdgeFunction: async () => ({}), getGuildState: async () => ({}), resolveClub: () => null, canManageClub: async () => true });
  assert.strictEqual(await lb.handleInteraction({ isButton: () => true, isStringSelectMenu: () => false, customId: 'hub_sheet:x' }), false);
  let updated = null;
  await lb.handleInteraction({ isButton: () => true, isStringSelectMenu: () => false, customId: 'lb_undo:missing', update: async (o) => { updated = o; } });
  assert.match(updated.content, /expired/);
});

test('spot fit follows position tiers: comp, plays well, emergency', () => {
  const p = { tiers: { primary: 'ST', secondary: ['CAM'], emergency: ['CM'] } };
  assert.deepStrictEqual(['ST', 'CAM', 'CM', 'GK'].map((pos) => fitFor(p, pos)), ['primary', 'secondary', 'emergency', 'none']);
  // Without tiers, the ranked spot preferences stand in
  assert.deepStrictEqual(['CB', 'RB', 'ST'].map((pos) => fitFor({ positions: ['CB', 'RB'] }, pos)), ['primary', 'secondary', 'none']);
});

test('squad list groups by primary position in team-sheet order, best rated first, out players last', () => {
  const groups = groupByPosition([
    { id: 'st1', position: 'ST', rating: 70 },
    { id: 'st2', position: 'ST', rating: 85 },
    { id: 'gk', position: 'GK', rating: 60 },
    { id: 'cb', position: 'CB', rating: 75, out: true },
    { id: 'cb2', position: 'CB', rating: 65 },
    { id: 'x', position: null, rating: 99 },
  ]);
  assert.deepStrictEqual(groups.map((g) => g.position), ['GK', 'CB', 'ST', 'Any']);
  assert.deepStrictEqual(groups[1].players.map((p) => p.id), ['cb2', 'cb']);
  assert.deepStrictEqual(groups[2].players.map((p) => p.id), ['st2', 'st1']);
});

test('Discord bring-in menu keeps every position when the squad is bigger than 25', () => {
  const info = new Map();
  const off = [];
  for (const [pos, n] of [['GK', 4], ['CB', 12], ['CM', 12], ['ST', 6]]) {
    for (let i = 0; i < n; i++) {
      const id = `${pos}${i}`;
      info.set(id, { tiers: { primary: pos }, positions: [pos], rating: 60 + i });
      off.push({ id, answer: null });
    }
  }
  const menu = squadMenu(off, info);
  assert.ok(menu.length <= 25);
  assert.deepStrictEqual([...new Set(menu.map((p) => p.position))], ['GK', 'CB', 'CM', 'ST']);
  assert.strictEqual(menu.find((p) => p.position === 'ST').id, 'ST5'); // best striker first
});

test('the in-game 4-3-3 variants are available and the formation menu pages past 25', () => {
  for (const f of ['4-3-3 HOLDING', '4-3-3 DEFEND', '4-3-3 FALSE 9']) {
    assert.strictEqual(FORMATION_SLOTS[f]?.length, 11, f);
    assert.strictEqual(FORMATION_COORDS[f]?.length, 11, f);
  }
  const all = Object.keys(FORMATION_SLOTS);
  const first = formationMenu(all[0]);
  assert.ok(first.options.length <= 25);
  assert.ok(first.pages >= 2);
  const last = formationMenu(all[all.length - 1]);
  assert.strictEqual(last.page, last.pages - 1);
  assert.ok(last.options.some((o) => o.default && o.value === all[all.length - 1]));
  // Every formation is reachable on some page
  const seen = new Set();
  for (let p = 0; p < first.pages; p++) for (const o of formationMenu(all[0], p).options) seen.add(o.value);
  for (const f of all) assert.ok(seen.has(f), f);
});

test('players with no gamertag or stats show their Discord server name, not "Player"', async () => {
  const rows = { profiles: [{ discord_user_id: '111111', ea_username: 'Lil_Sunny1' }], player_summary: [], position_preferences: [], player_positions: [] };
  const query = (table) => {
    const q = { select: () => q, eq: () => q, in: () => q, then: (ok) => ok({ data: rows[table] }) };
    return q;
  };
  const member = { displayName: 'CBreezy02' };
  const guild = { members: { cache: new Map([['222222', member]]), fetch: async () => { throw new Error('unknown member'); } } };
  const client = { guilds: { cache: new Map([['g1', guild]]) } };
  const lb = createLineupBoard({ supabase: { from: query }, getClient: () => client, getGuildState: async () => ({}), resolveClub: () => null });
  const info = await lb.playerInfo('g1', ['111111', '222222', '333333', 'ea_Bmac']);
  assert.deepStrictEqual(['111111', '222222', '333333', 'ea_Bmac'].map((id) => info.get(id).name), ['Lil_Sunny1', 'CBreezy02', 'Player', 'Bmac']);
});
