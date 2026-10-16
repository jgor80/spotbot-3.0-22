const test = require('node:test');
const assert = require('node:assert');
const { movePlayer, resizeBoard, boardFromNames, boardToSlots, slotsToBoard, MAX_BENCH, FORMATION_SLOTS } = require('./lineup-autofill.cjs');
const { boardSvg, renderBoard, createLineupBoard, fitFor } = require('./lineup-board.cjs');

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
