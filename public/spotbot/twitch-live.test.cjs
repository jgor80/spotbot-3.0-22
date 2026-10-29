const test = require('node:test');
const assert = require('node:assert');
const { createTwitchLive, frameUrl, liveFor } = require('./twitch-live.cjs');

const STREAM = {
  id: 's1', type: 'live', user_login: 'samplays', user_name: 'SamPlays', title: 'Div 1 push', game_name: 'EA SPORTS FC 27',
  viewer_count: 42, started_at: new Date(Date.now() - 75 * 60000).toISOString(),
  thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_samplays-{width}x{height}.jpg',
};

function fakeFetch(state) {
  return async (url) => {
    state.calls.push(String(url));
    const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
    if (String(url).includes('oauth2/token')) return json({ access_token: 't', expires_in: 3600 });
    if (String(url).includes('/helix/streams')) return json({ data: state.live ? [STREAM] : [] });
    if (String(url).includes('/helix/users')) return json({ data: [{ login: 'samplays', display_name: 'SamPlays', profile_image_url: 'https://x/p.png' }] });
    return json({}, 404);
  };
}

function fakeMessage(content, replies) {
  return {
    guild: { id: 'g' }, channelId: 'c1', author: { id: 'u', bot: false }, content,
    reply: async (payload) => { replies.push(payload); return { id: `m${replies.length}` }; },
  };
}

test('frame url is full size and cache-busted; live-for reads hours and minutes', () => {
  assert.strictEqual(frameUrl(STREAM, 123), 'https://static-cdn.jtvnw.net/previews-ttv/live_user_samplays-1280x720.jpg?t=123');
  assert.strictEqual(liveFor(new Date(1000 - 75 * 60000).toISOString(), 1000), '1h 15m');
  assert.strictEqual(liveFor(new Date(1000 - 5 * 60000).toISOString(), 1000), '5m');
});

test('posts a live frame card once per stream for a live channel link', async () => {
  const state = { live: true, calls: [] };
  const replies = [];
  const tl = createTwitchLive({ getClient: () => null, clientId: 'id', clientSecret: 'sec', fetchImpl: fakeFetch(state) });
  await tl.onMessage(fakeMessage('watch me https://www.twitch.tv/SamPlays', replies));
  assert.strictEqual(replies.length, 1);
  const e = replies[0].embeds[0].toJSON();
  assert.match(e.title, /SamPlays is live/);
  assert.match(e.image.url, /1280x720\.jpg\?t=\d+$/);
  assert.deepStrictEqual(e.fields.map((f) => f.name), ['Playing', 'Viewers', 'Live for']);
  assert.strictEqual(replies[0].components[0].toJSON().components[0].url, 'https://twitch.tv/samplays');
  // Posting the link again during the same stream doesn't add a second card
  await tl.onMessage(fakeMessage('twitch.tv/samplays', replies));
  assert.strictEqual(replies.length, 1);
  tl.cards.clear();
});

test('ignores offline channels, bots and missing Twitch keys', async () => {
  const state = { live: false, calls: [] };
  const replies = [];
  const tl = createTwitchLive({ getClient: () => null, clientId: 'id', clientSecret: 'sec', fetchImpl: fakeFetch(state) });
  await tl.onMessage(fakeMessage('twitch.tv/samplays', replies));
  await tl.onMessage({ ...fakeMessage('twitch.tv/samplays', replies), author: { id: 'b', bot: true } });
  assert.strictEqual(replies.length, 0);
  const off = createTwitchLive({ getClient: () => null, clientId: '', clientSecret: '', fetchImpl: fakeFetch(state) });
  assert.strictEqual(off.enabled, false);
  await off.onMessage(fakeMessage('twitch.tv/samplays', replies));
  assert.strictEqual(replies.length, 0);
});

test('refresh updates the frame while live and marks the card ended when the stream stops', async () => {
  const state = { live: true, calls: [] };
  const replies = [];
  const edits = [];
  const client = { channels: { fetch: async () => ({ messages: { fetch: async () => ({ edit: async (p) => edits.push(p) }) } }) } };
  const tl = createTwitchLive({ getClient: () => client, clientId: 'id', clientSecret: 'sec', fetchImpl: fakeFetch(state) });
  await tl.onMessage(fakeMessage('twitch.tv/samplays', replies));
  await tl.refresh();
  assert.match(edits[0].embeds[0].toJSON().title, /is live/);
  state.live = false;
  await tl.refresh();
  const ended = edits[1].embeds[0].toJSON();
  assert.match(ended.title, /was live/);
  assert.strictEqual(ended.image, undefined);
  assert.strictEqual(tl.cards.size, 0);
});
