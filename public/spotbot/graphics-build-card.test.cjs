const test = require('node:test');
const assert = require('node:assert');
const G = require('./graphics.cjs');
const BC = require('./graphics-build-card.cjs');
const P = require('./pro-build.cjs');

const marauder = P.normaliseBuild({ ...P.emptyBuild('marauder'), level: 55, points: { sprintSpeed: 20, acceleration: 15 }, playstyles: ['Jockey'] });
const fakeDb = (row) => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }) };
  return { from: () => q };
};

test('a saved build loads from its share code, with imperial by default', async () => {
  const got = await BC.loadBuild(fakeDb({ code: P.encodeBuild(marauder), units: null }), '123456');
  assert.equal(got.build.archetype, 'marauder');
  assert.equal(got.build.points.sprintSpeed, 20);
  assert.equal(got.units, 'imperial');
  assert.equal((await BC.loadBuild(fakeDb({ code: P.encodeBuild(marauder), units: 'metric' }), '1')).units, 'metric');
  assert.equal(await BC.loadBuild(fakeDb({ code: 'garbage!' }), '1'), null);
  assert.equal(await BC.loadBuild(fakeDb(null), '1'), null);
});

test('build cards print the in-match group ratings the website shows', () => {
  const stats = BC.buildStats(marauder);
  const avg = P.groupAverages(marauder);
  assert.deepEqual(stats.map(([l]) => l), ['PACE', 'SHOOTING', 'PASSING', 'DRIBBLING', 'DEFENDING', 'PHYSICAL']);
  assert.equal(stats[0][1], String(Math.round(avg.pace)));
  assert.deepEqual(BC.buildStats(P.emptyBuild('shotstopper')).map(([l]) => l), ['DIVING', 'HANDLING', 'KICKING', 'REFLEXES', 'POSITIONING', 'PHYSICAL']);
  assert.equal(BC.buildLabels(marauder).seasonLabel, 'MARAUDER BUILD');
});

test('the build back renders for outfielders and keepers, dark and paper', () => {
  for (const [style, build] of [['esports', marauder], ['vintage', P.emptyBuild('sweeperkeeper')]]) {
    const png = BC.renderBuildBack({ style, name: 'Test Player', clubName: 'Test FC', build, units: 'imperial' }, G);
    assert.ok(png.length > 10_000);
    assert.equal(Buffer.from(png).subarray(1, 4).toString(), 'PNG');
  }
});

test('heights and weights print in feet, inches and pounds unless metric is picked', () => {
  assert.equal(P.formatHeight(182), `6'0"`);
  assert.equal(P.formatHeight(175), `5'9"`);
  assert.equal(P.formatWeight(75), '165 lb');
  assert.equal(P.formatHeight(182, 'metric'), '182 cm');
  assert.equal(P.formatWeight(75, 'metric'), '75 kg');
});
