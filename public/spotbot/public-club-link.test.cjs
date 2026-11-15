// Club Stats panel links each club's public page (gafferbot.app/club/<platform>/<clubId>)
const test = require('node:test');
const assert = require('node:assert/strict');
const { publicClubUrl } = require('./club-stats.cjs');

test('public club page links use the FC27 platform and the EA club ID', () => {
  assert.equal(publicClubUrl({ ea_club_id: '12345', ea_platform: 'ps5' }), 'https://gafferbot.app/club/common-gen5/12345');
  assert.equal(publicClubUrl({ ea_club_id: 678, ea_platform: 'switch' }), 'https://gafferbot.app/club/nx/678');
  assert.equal(publicClubUrl({ ea_club_id: '', ea_platform: 'ps5' }), null);
  assert.equal(publicClubUrl({}), null);
});
