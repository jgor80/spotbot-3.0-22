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

test('photo browser is private, owner-bound, and requires confirmation before deletion', async () => {
  const oldFetch = global.fetch;
  const requests = [], replies = [];
  const id = '11111111-1111-4111-8111-111111111111';
  global.fetch = async (_, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    return { ok: true, json: async () => body.action === 'delete' ? { deleted: true } : {
      total: 1, photo: { id, image_url: 'https://example.test/photo.png', description: 'Blue beard', created_at: '2026-10-09T00:00:00Z' },
    } };
  };
  try {
    const photos = createProPhotos({ supabaseUrl: 'https://example.test', secret: 'test' });
    const user = { id: '12345' };
    let flags;
    await photos.handleInteraction({ user, commandName: 'myphotos', isChatInputCommand: () => true,
      deferReply: async (v) => { flags = v.flags; }, editReply: async (v) => replies.push(v) });
    assert.equal(flags, 64);
    assert.equal(requests[0].requester_id, user.id);
    assert.equal(requests[0].discord_user_id, user.id);
    const browser = replies[0].components[0].toJSON();
    assert.match(browser.components[2].custom_id, /^pph:12345:ask:/);
    await photos.handleInteraction({ user, customId: `pph:12345:ask:0:${id}`, deferUpdate: async () => {}, editReply: async (v) => replies.push(v) });
    assert.equal(requests.length, 1, 'asking must not delete');
    assert.match(replies[1].content, /Permanently delete/);
    await photos.handleInteraction({ user: { id: '99999' }, customId: `pph:12345:delete:0:${id}`, reply: async (v) => replies.push(v) });
    assert.equal(requests.length, 1, 'another player must not reach deletion');
    assert.equal(replies[2].flags, 64);
    await photos.handleInteraction({ user, customId: `pph:12345:delete:0:${id}`, deferUpdate: async () => {}, editReply: async (v) => replies.push(v) });
    assert.equal(requests[1].action, 'delete');
    assert.equal(requests[1].photo_asset_id, id);
    assert.equal(requests[1].requester_id, user.id);
  } finally { global.fetch = oldFetch; }
});