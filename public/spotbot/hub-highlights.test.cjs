const test = require('node:test');
const assert = require('node:assert');
const { createHubHighlights, clipOf, votesOf, pickWinner } = require('./hub-highlights.cjs');
const { weekKeyOf } = require('./hub-xp.cjs');

test('clips are uploaded videos or video links', () => {
  assert.equal(clipOf({ content: 'what a goal https://youtu.be/abc', attachments: new Map() }), 'https://youtu.be/abc');
  assert.equal(clipOf({ content: '', attachments: new Map([['1', { contentType: 'video/mp4', url: 'https://cdn/x.mp4' }]]) }), 'https://cdn/x.mp4');
  assert.equal(clipOf({ content: 'gg', attachments: new Map([['1', { contentType: 'image/png', url: 'x' }]]) }), null);
});

test('votes leave out the bot and the poster, and ties go to the earlier clip', () => {
  assert.equal(votesOf(['bot', 'me', 'a', 'b'], 'bot', 'me'), 2);
  assert.equal(pickWinner([{ votes: 2, at: 5 }, { votes: 2, at: 3 }, { votes: 1, at: 1 }]).at, 3);
  assert.equal(pickWinner([{ votes: 0, at: 1 }]), null);
});

test('Monday posts last week\'s winner once, with XP and no pings', async () => {
  const lastMonday = new Date(`${weekKeyOf(new Date(Date.now() - 7 * 86400000))}T12:00:00Z`).getTime();
  const msg = (id, author, at, voters) => ({
    id, url: `https://discord.com/${id}`, author: { id: author, bot: false }, createdTimestamp: at, content: 'https://medal.tv/x', attachments: new Map(),
    reactions: { cache: new Map([['⭐', { users: { fetch: async () => new Map(voters.map((v) => [v, {}])) } }]]) },
  });
  const page = new Map([['1', msg('1', 'a', lastMonday, ['bot', 'x', 'y'])], ['2', msg('2', 'b', lastMonday + 1000, ['bot', 'x', 'b'])]]);
  let fetched = 0;
  const sent = [];
  const records = [];
  let hub = { on: true, highlights_channel_id: 'hl', feed_channel_id: 'feed' };
  const guild = {
    id: 'g',
    members: { me: { id: 'bot' } },
    channels: { fetch: async (id) => (id === 'hl' ? { messages: { fetch: async () => (fetched++ ? new Map() : page) } } : { send: async (m) => sent.push(m) }) },
  };
  const hl = createHubHighlights({ hubOf: async () => hub, saveHub: async (g, h) => (hub = h), xp: () => ({ record: async (g, m) => records.push([...m.entries()]) }), client: () => null });
  const win = await hl.weeklyWinner(guild);
  assert.equal(win.author, 'a');
  assert.deepEqual(records, [[['a', { highlights: 1 }]]]);
  assert.match(sent[0].embeds[0].toJSON().description, /<@a>'s clip won with \*\*2\*\*/);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
  assert.equal(await hl.weeklyWinner(guild), null);
});
