const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./position-tiers.cjs');

test('normalize removes duplicates across tiers and caps each tier', () => {
  const t = T.normalize({ primary: 'st', secondary: ['ST', 'CM', 'cam', 'CM', 'LW', 'RW'], emergency: ['CB', 'LW', 'nope'] });
  assert.deepEqual(t, { primary: 'ST', secondary: ['CM', 'CAM', 'LW'], emergency: ['RW', 'CB'] });
});

test('normalize reads database rows', () => {
  const t = T.normalize({ primary_position: 'GK', secondary_positions: ['CB'], emergency_positions: null });
  assert.deepEqual(t, { primary: 'GK', secondary: ['CB'], emergency: [] });
});

test('picking a new comp position pulls it out of the other tiers', () => {
  const t = T.applyPick({ primary: 'ST', secondary: ['CAM', 'CM'], emergency: ['CB'] }, 'primary', ['CAM']);
  assert.deepEqual(t, { primary: 'CAM', secondary: ['CM'], emergency: ['CB'] });
});

test('secondary pick replaces the list, skips the primary and steals from emergency', () => {
  const t = T.applyPick({ primary: 'ST', secondary: ['CAM'], emergency: ['CB', 'LW'] }, 'secondary', ['ST', 'LW', 'RW']);
  assert.deepEqual(t, { primary: 'ST', secondary: ['LW', 'RW'], emergency: ['CB'] });
});

test('emergency pick ignores positions already played well', () => {
  const t = T.applyPick({ primary: 'ST', secondary: ['LW'] }, 'emergency', ['LW', 'GK']);
  assert.deepEqual(t, { primary: 'ST', secondary: ['LW'], emergency: ['GK'] });
});

test('clearing a tier', () => {
  const t = T.applyPick({ primary: 'ST', secondary: ['LW'], emergency: ['GK'] }, 'secondary', []);
  assert.deepEqual(t, { primary: 'ST', secondary: [], emergency: ['GK'] });
});

test('old three-position panels: first pick is the comp position, the rest play well', () => {
  const t = T.fromLegacyPick({ emergency: ['CM', 'GK'] }, ['CB', 'CM', 'RB']);
  assert.deepEqual(t, { primary: 'CB', secondary: ['CM', 'RB'], emergency: ['GK'] });
});

test('manager adding a new comp position keeps the old one as played well', () => {
  const t = T.addPositions({ primary: 'ST', secondary: ['LW'], emergency: ['CAM'] }, { primary: 'CAM', emergency: 'GK' });
  assert.deepEqual(t, { primary: 'CAM', secondary: ['ST', 'LW'], emergency: ['GK'] });
});

test('tierOf', () => {
  const t = { primary: 'ST', secondary: ['LW'], emergency: ['GK'] };
  assert.equal(T.tierOf(t, 'ST'), 'primary');
  assert.equal(T.tierOf(t, 'LW'), 'secondary');
  assert.equal(T.tierOf(t, 'GK'), 'emergency');
  assert.equal(T.tierOf(t, 'CB'), null);
  assert.equal(T.tierOf(null, 'CB'), null);
});

test('role names split into main and secondary roles', () => {
  const held = T.heldFromRoleNames(['ST', 'cm (2nd)', 'Palermo', 'CB (2ND)', 'XX (2nd)']);
  assert.deepEqual(held, { primary: ['ST'], secondary: ['CM', 'CB'] });
});

test('held roles fill an empty comp position in preference order and never remove anything', () => {
  const t = T.mergeHeldRoles(null, { primary: ['CB', 'ST', 'CM'], secondary: [] }, ['ST', 'CB']);
  assert.deepEqual(t, { primary: 'ST', secondary: ['CB', 'CM'], emergency: [] });
  const kept = T.mergeHeldRoles({ primary: 'GK', secondary: ['CB'], emergency: ['ST'] }, { primary: ['ST'], secondary: ['LB'] });
  assert.deepEqual(kept, { primary: 'GK', secondary: ['CB', 'ST', 'LB'], emergency: [] });
});

test('roleChanges: main role for the comp position, (2nd) roles for played well, none for emergency', () => {
  const { add, remove } = T.roleChanges(
    { primary: 'ST', secondary: ['CM', 'CB'], emergency: ['GK'] },
    ['ST', 'CM', 'CB', 'GK', 'LW (2nd)', 'Members']
  );
  assert.deepEqual(add, ['CM (2nd)', 'CB (2nd)']);
  assert.deepEqual(remove.sort(), ['CB', 'CM', 'GK', 'LW (2nd)'].sort());
});

test('the picker offers only the top-formation positions', () => {
  assert.deepEqual([...T.POSITIONS].sort(), ['CAM', 'CB', 'CM', 'GK', 'LB', 'LM', 'LW', 'RB', 'RM', 'RW', 'ST']);
});

test('every formation spot maps onto a pickable position', () => {
  const formations = require('./formations.json');
  for (const [name, f] of Object.entries(formations)) {
    for (const pos of f.positions) assert.ok(T.cleanPos(pos), `${name}: ${pos}`);
  }
});

test('positions saved before the list changed read as their nearest pick', () => {
  const t = T.normalize({ primary: 'CDM', secondary: ['CM', 'LWB', 'CF'], emergency: ['RWB'] });
  assert.deepEqual(t, { primary: 'CM', secondary: ['LB', 'ST'], emergency: ['RB'] });
  assert.equal(T.tierOf({ primary: 'CM', secondary: [], emergency: [] }, 'CDM'), 'primary');
  assert.equal(T.tierOf({ primary: 'ST', secondary: ['LB'], emergency: [] }, 'LWB'), 'secondary');
});

test('old position roles count as their nearest pick and are swapped out', () => {
  assert.deepEqual(T.heldFromRoleNames(['CDM', 'CF (2nd)', 'Members']), { primary: ['CM'], secondary: ['ST'] });
  const { add, remove } = T.roleChanges({ primary: 'CM', secondary: ['ST'] }, ['CDM', 'CF (2nd)']);
  assert.deepEqual(add, ['CM', 'ST (2nd)']);
  assert.deepEqual(remove.sort(), ['CDM', 'CF (2nd)']);
});

test('button taps toggle positions within a tier', () => {
  let r = T.togglePick({}, 'primary', 'ST');
  assert.deepEqual(r.tiers, { primary: 'ST', secondary: [], emergency: [] });
  r = T.togglePick(r.tiers, 'primary', 'ST');
  assert.equal(r.tiers.primary, null);
  r = T.togglePick({ primary: 'ST', secondary: ['LW'], emergency: ['CB'] }, 'secondary', 'CB');
  assert.deepEqual(r.tiers, { primary: 'ST', secondary: ['LW', 'CB'], emergency: [] });
  r = T.togglePick(r.tiers, 'secondary', 'LW');
  assert.deepEqual(r.tiers, { primary: 'ST', secondary: ['CB'], emergency: [] });
  r = T.togglePick({ primary: 'ST', secondary: ['LW', 'RW', 'CAM'] }, 'secondary', 'CM');
  assert.equal(r.note, 'full');
  assert.deepEqual(r.tiers.secondary, ['LW', 'RW', 'CAM']);
  r = T.togglePick({ primary: 'ST', secondary: ['LW'] }, 'emergency', 'LW');
  assert.deepEqual(r.tiers, { primary: 'ST', secondary: [], emergency: ['LW'] });
});

test('formatting', () => {
  const t = { primary: 'ST', secondary: ['CAM'], emergency: ['CB', 'GK'] };
  assert.equal(T.formatInline(t), '⭐ **ST** · ✅ CAM · 🆘 CB, GK');
  assert.equal(T.formatInline(null, { empty: 'ST' }), 'ST');
  assert.match(T.formatLines(t), /Comp position:\*\* ST\n.*Plays well:\*\* CAM\n.*Emergency:\*\* CB, GK/);
  assert.equal(T.formatLines({}), 'Not set yet');
});

// A tiny Supabase stand-in for the save path
function fakeSupabase(tables) {
  const calls = [];
  const from = (table) => {
    const q = { table, filters: [], op: 'select' };
    const run = () => {
      calls.push(q);
      if (q.op === 'select') {
        const rows = (tables[table] || []).filter((r) => q.filters.every(([k, v, kind]) => (kind === 'in' ? v.includes(r[k]) : kind === 'neq' ? r[k] !== v : r[k] === v)));
        return { data: q.single ? rows[0] || null : rows, error: null };
      }
      return { data: null, error: null };
    };
    const chain = {
      select: () => chain,
      eq: (k, v) => (q.filters.push([k, v]), chain),
      neq: (k, v) => (q.filters.push([k, v, 'neq']), chain),
      in: (k, v) => (q.filters.push([k, v, 'in']), chain),
      or: () => chain,
      limit: () => chain,
      maybeSingle: () => ((q.single = true), Promise.resolve(run())),
      upsert: (row) => ((q.op = 'upsert'), (q.row = row), Promise.resolve(run())),
      update: (row) => ((q.op = 'update'), (q.row = row), chain),
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return chain;
  };
  return { from, calls };
}

test('save stores the tiers and keeps rosters and a live free agent listing in step', async () => {
  const db = fakeSupabase({ teams: [{ id: 't1', guild_id: 'g' }] });
  const tiers = T.createPositionTiers({ supabase: db });
  const saved = await tiers.save('g', 'u', { primary: 'ST', secondary: ['CAM', 'ST'], emergency: ['CB'] });
  assert.deepEqual(saved, { primary: 'ST', secondary: ['CAM'], emergency: ['CB'] });
  const upsert = db.calls.find((c) => c.op === 'upsert');
  assert.equal(upsert.table, 'player_positions');
  assert.deepEqual(upsert.row.secondary_positions, ['CAM']);
  const roster = db.calls.find((c) => c.op === 'update' && c.table === 'team_rosters');
  assert.deepEqual(roster.row, { primary_position: 'ST', secondary_position: 'CAM' });
  const fa = db.calls.find((c) => c.op === 'update' && c.table === 'free_agents');
  assert.equal(fa.row.position, 'ST');
  assert.deepEqual(fa.row.emergency_positions, ['CB']);
});

test('clearing positions leaves rosters alone', async () => {
  const db = fakeSupabase({ teams: [{ id: 't1', guild_id: 'g' }] });
  await T.createPositionTiers({ supabase: db }).save('g', 'u', {});
  assert.equal(db.calls.filter((c) => c.op === 'update').length, 0);
});
