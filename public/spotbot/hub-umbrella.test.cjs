const test = require('node:test');
const assert = require('node:assert');
const { cleanUrl, cleanText, nextSteps } = require('./hub-umbrella.cjs');

test('cleanUrl keeps real links as https and refuses junk', () => {
  assert.equal(cleanUrl('vpg.gg/leagues'), 'https://vpg.gg/leagues');
  assert.equal(cleanUrl('http://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(cleanUrl('javascript:alert(1)'), null);
  assert.equal(cleanUrl('not a link'), null);
  assert.equal(cleanUrl(''), null);
});

test('cleanText strips mentions and markdown', () => {
  assert.equal(cleanText(' <@123>  **Cup**  ', 20), '123 Cup');
});

test('nextSteps ticks what a team has done and says where to press for the rest', () => {
  const none = nextSteps({ eaLinked: false, onNetwork: false, inLeague: false, inCup: false, outside: [] });
  assert.deepEqual(none.map((s) => s.done), [false, false, false, false, false]);
  assert.match(none[4].text, /own server/);
  assert.match(none[0].text, /Link EA Club/);
  assert.match(none[1].text, /Network Setup/);
  const all = nextSteps({ eaLinked: true, onNetwork: true, inLeague: false, inCup: true, outside: ['VPG'], ownServer: 'Owls HQ' });
  assert.deepEqual(all.map((s) => s.done), [true, true, true, true, true]);
  assert.match(all[3].text, /VPG/);
});
