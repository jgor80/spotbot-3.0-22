const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBumpReminder, isBumpDone, reminderPayload, DISBOARD_ID, COOLDOWN_MS } = require('./bump-reminder.cjs');

const roles = (names) => ({ cache: { find: (fn) => names.map((n, i) => ({ id: `r${i}`, name: n })).find(fn) } });

test('only Disboard "Bump done" messages count', () => {
  assert.equal(isBumpDone({ author: { id: DISBOARD_ID }, embeds: [{ description: 'Bump done! :thumbsup:' }] }), true);
  assert.equal(isBumpDone({ author: { id: DISBOARD_ID }, embeds: [{ description: 'Please wait another 90 minutes' }] }), false);
  assert.equal(isBumpDone({ author: { id: '123' }, content: 'Bump done!' }), false);
});

test('reminder pings a Bumper role only when the server has one', () => {
  const withRole = reminderPayload({ roles: roles(['Admin', 'Bumper']) });
  assert.match(withRole.content, /^<@&r1>/);
  assert.deepEqual(withRole.allowedMentions, { parse: [], roles: ['r1'] });
  const without = reminderPayload({ roles: roles(['Admin']) });
  assert.doesNotMatch(without.content, /<@&/);
  assert.deepEqual(without.allowedMentions.roles, []);
});

test('a bump schedules one reminder 2 hours later in the same channel, and survives a restart', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bump-')), 'state.json');
  const sent = [];
  const channel = { isTextBased: () => true, send: async (p) => sent.push(p) };
  const guild = { id: 'g1', roles: roles(['bumper']), channels: { fetch: async () => channel } };
  const client = { guilds: { cache: new Map([['g1', guild]]) } };
  let clock = 1_000_000;
  const r = createBumpReminder({ client, stateFile: file, now: () => clock });
  await r.onMessage({ guild, channelId: 'c1', channel, author: { id: DISBOARD_ID }, embeds: [{ description: 'Bump done!' }], interaction: { user: { id: 'u1' } } });
  assert.equal(sent.length, 1, 'thanks the bumper');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).g1.due, clock + COOLDOWN_MS);

  // Restart halfway through the cooldown: the new instance picks the time up from the file
  clock += COOLDOWN_MS / 2;
  const r2 = createBumpReminder({ client, stateFile: file, now: () => clock });
  r2.start();
  t.mock.timers.tick(COOLDOWN_MS / 2);
  await new Promise((res) => setImmediate(res));
  await new Promise((res) => setImmediate(res));
  assert.ok(sent.some((p) => /bump is ready/.test(p.content)), 'posts the reminder');
  assert.equal(r2._state().g1.reminded, true);
});
