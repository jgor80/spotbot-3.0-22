import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRender, judge, pickBest, qaEnabled, qaPrompt, qaRetries, responseText, retryHint, type QaInput } from './quality.ts';

const card: QaInput = { kind: 'card', players: 1, kitColours: ['pink', 'black'], kitNumbers: [23], headshot: false, likeness: 1 };
const clean = { text_free: true, number_ok: true, player_count: 1, faces_ok: true, anatomy_ok: true, framing_ok: true, kit_ok: true, likeness_ok: true, score: 8, issues: [] };

test('a clean render passes and every flaw a fan would notice fails', () => {
  assert.deepEqual(judge(clean, card), { checked: true, pass: true, score: 8, issues: [] });
  assert.deepEqual(judge({ ...clean, text_free: false, issues: ['remove the garbled word on the wall'] }, card).issues, ['stray text or logos', 'remove the garbled word on the wall']);
  assert.match(judge({ ...clean, number_ok: false }, card).issues[0], /23 only/);
  assert.match(judge({ ...clean, player_count: 2 }, card).issues[0], /exactly 1 player$/);
  assert.equal(judge({ ...clean, faces_ok: false }, card).pass, false);
  assert.equal(judge({ ...clean, anatomy_ok: false }, card).pass, false);
  assert.equal(judge({ ...clean, framing_ok: false }, card).pass, false);
  assert.equal(judge({ ...clean, kit_ok: false }, card).pass, false);
  assert.equal(judge({ ...clean, likeness_ok: false }, card).pass, false);
  assert.equal(judge({ ...clean, score: 5 }, card).pass, false, 'a low overall score fails even with every box ticked');
  assert.equal(judge(null, card).pass, false, 'an empty answer never passes');
});

test('silhouettes skip the player count and likeness; groups count every player', () => {
  const silhouette = { ...card, players: 0, likeness: 0, kitNumbers: [] };
  assert.equal(judge({ ...clean, player_count: 0, likeness_ok: false }, silhouette).pass, true);
  const group = { ...card, players: 4, likeness: 4, kitNumbers: [7, 9] };
  assert.equal(judge({ ...clean, player_count: 3 }, group).pass, false);
  assert.match(qaPrompt(group), /Exactly 4 footballers/);
  assert.match(qaPrompt(group), /Images 2 to 5 are reference photos/);
  assert.match(qaPrompt(group), /shirt numbers 7, 9/);
  assert.match(qaPrompt(silhouette), /no text, letters, numbers/);
});

test('retries are capped, the check can be switched off, and the best render wins', () => {
  assert.equal(qaRetries(undefined), 2);
  assert.equal(qaRetries('0'), 0);
  assert.equal(qaRetries('9'), 3);
  assert.equal(qaRetries('x'), 2);
  assert.equal(qaEnabled(() => undefined), true);
  assert.equal(qaEnabled(() => 'off'), false);
  const a = { id: 'a', qa: { checked: true, pass: false, score: 4, issues: ['x'] } };
  const b = { id: 'b', qa: { checked: true, pass: false, score: 7, issues: ['y'] } };
  const c = { id: 'c', qa: { checked: true, pass: true, score: 6, issues: [] } };
  assert.equal(pickBest([a, b])?.id, 'b');
  assert.equal(pickBest([a, c, b])?.id, 'c');
  assert.equal(pickBest([]), null);
  assert.match(retryHint(['distorted face']), /QUALITY FIX.*distorted face/);
  assert.equal(retryHint([]), '');
});

test('the checker reads the render plus the reference, and an outage keeps the render', async () => {
  let sent: any = null;
  const ok = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(clean) }] }] }), { status: 200 });
  }) as typeof fetch;
  const ref = new File([new Uint8Array([1, 2, 3])], 'ref.png', { type: 'image/png' });
  const verdict = await checkRender(ok, 'https://gw', 'key', card, 'AAAA', [ref]);
  assert.equal(verdict.pass, true);
  const images = sent.input[0].content.filter((c: any) => c.type === 'input_image');
  assert.equal(images.length, 2);
  assert.equal(images[1].image_url, 'data:image/png;base64,AQID');
  assert.equal(sent.text.format.strict, true);
  const down = (async () => new Response('nope', { status: 503 })) as typeof fetch;
  assert.deepEqual(await checkRender(down, 'https://gw', 'key', card, 'AAAA', [ref]), { checked: false, pass: true, score: 0, issues: [] });
  const broken = (async () => { throw new Error('socket hang up'); }) as typeof fetch;
  assert.equal((await checkRender(broken, 'https://gw', 'key', card, 'AAAA', [])).checked, false);
  assert.equal(responseText({ output_text: '{"a":1}' }), '{"a":1}');
});
