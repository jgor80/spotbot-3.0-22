const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProPhotos } = require('./pro-photos.cjs');

test('every image attachment is ingested even when one is rejected', async () => {
  const oldFetch = global.fetch;
  const requests = [], replies = [];
  global.fetch = async (_, options) => {
    requests.push(JSON.parse(options.body));
    const accepted = requests.length !== 2;
    return { ok: true, json: async () => ({ accepted, analysis: {}, image_url: 'https://example.test/photo.png' }) };
  };
  try {
    const photos = createProPhotos({ supabaseUrl: 'https://example.test', secret: 'test', getGuildState: async () => ({}), isManager: async () => false });
    await photos.onMessage({
      guild: { id: 'guild' }, channel: { name: 'pro-photos' }, author: { id: 'player', username: 'Player' },
      attachments: new Map(['one', 'two', 'three'].map((id) => [id, { contentType: 'image/png', url: `https://example.test/${id}.png` }])),
      mentions: { users: { find: () => null } }, client: { user: { id: 'bot' } },
      reactions: { cache: new Map() }, react: async () => {}, reply: async (r) => { replies.push(r); },
    });
    assert.equal(requests.length, 3);
    assert.ok(requests.every((r) => r.discord_user_id === 'player'));
    assert.match(replies[0].content, /2 of 3 photos saved/);
  } finally { global.fetch = oldFetch; }
});