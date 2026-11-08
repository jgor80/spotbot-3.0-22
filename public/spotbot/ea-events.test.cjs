// EA event-code decoding (ea-events.cjs) and the stats the bot saves from it (ea-player-stats.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const { eaEventStats, eaEventCounts } = require('./ea-events.cjs');
const { mapPlayer, statColumns } = require('./ea-player-stats.cjs');

// Sample /clubs/matches player row from the FC27 research repo README
const row = {
  playername: 'Tester',
  pos: 'midfielder',
  passesmade: '21',
  passattempts: '26',
  assists: '0',
  match_event_aggregate_0: '0:2,109:3,112:3,121:2,145:5,157:3,164:2,174:19,215:21,216:5,217:1,24:17,25:5,26:1,30:8,31:3,32:3,34:10,35:2,36:3,6:1',
  match_event_aggregate_1: '97:10',
  match_event_aggregate_2: '',
  match_event_aggregate_3: '',
};

test('decodes the research sample with confirmed codes', () => {
  const s = eaEventStats(row);
  assert.equal(s.passesCompleted, 21); // event 215 == EA's own passesmade
  assert.equal(s.dribbles, 19); // 174, not 32 (backward passes)
  assert.equal(s.progressiveCarries, 10); // 97, not 34 (sideways passes)
  assert.equal(s.interceptions, 1); // 6
  assert.equal(s.tacklesWon, 2); // 0
  assert.equal(s.possessionGains, 3); // 108-110
  assert.equal(s.throughBalls, 0); // 152, not 35 (sideways passes failed)
});

test('counts sum repeated codes and skip junk', () => {
  assert.deepEqual(eaEventCounts({ match_event_aggregate_0: '6:1,x:2,6:2', match_event_aggregate_1: '6:3,7:' }), { 6: 6 });
  assert.equal(eaEventStats(undefined).interceptions, 0);
});

test('player rows saved by the bot use the decoded stats', () => {
  const p = mapPlayer(row);
  assert.equal(p.dribbles, 19);
  assert.equal(p.interceptions, 1);
  assert.equal(p.through_balls, 0);
  assert.equal(p.chances_created, 0);
  const cols = statColumns(p, 1);
  assert.equal(cols.dribbles, 19);
  assert.equal(cols.dribble_success, 19);
  assert.equal(cols.progressive_carries, 10);
  assert.equal(cols.possession_gains, 3);
  assert.equal(cols.interceptions, 1);
});

test('falls back to EA named interceptions when no event is sent', () => {
  assert.equal(mapPlayer({ playername: 'x', interceptions: '4' }).interceptions, 4);
});
