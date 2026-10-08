import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendReferences, teamPrompt } from './team-art.ts';

test('ordered group references preserve separate identities and verified numbers', () => {
  const refs = [
    { userId: '11111', kitNumber: 23, file: new File(['first'], 'first.png', { type: 'image/png' }) },
    { userId: '22222', kitNumber: null, file: new File(['second'], 'second.png', { type: 'image/png' }) },
  ];
  const prompt = teamPrompt({ kind: 'banner', club_name: 'PCN Palermo', mood: 'win', pose: 'celebrate' }, refs, 'vintage', 'Pink club kit');
  assert.match(prompt, /exactly 2 distinct saved players/);
  assert.match(prompt, /Reference image 1 is player 1/);
  assert.match(prompt, /Only player 1 may wear verified number 23/);
  assert.match(prompt, /Player 2 must have no shirt or shorts number/);
  assert.match(prompt, /signature move/);
  assert.match(prompt, /Wide landscape/);
  const form = new FormData();
  appendReferences(form, refs);
  assert.deepEqual(form.getAll('image[]').map((f) => (f as File).name), ['first.png', 'second.png']);
  assert.equal(form.has('image'), false);
  const single = new FormData();
  appendReferences(single, refs.slice(0, 1));
  assert.equal(single.getAll('image').length, 1);
});

test('identity lock anchors each player traits and skips rear-facing shots', async () => {
  const { isRearFacing } = await import('./team-art.ts');
  assert.equal(isRearFacing('Rear-facing player with bright blue curly hair'), true);
  assert.equal(isRearFacing('The pro wears a pink shirt with blue beard'), false);
  const refs = [
    { userId: '1', kitNumber: 23, name: 'AirDangus23', description: 'blue curly hair, full blue beard, orange visor glasses', file: new File(['a'], 'a.png') },
    { userId: '2', kitNumber: null, name: 'Mate', description: 'pink beard and headband', file: new File(['b'], 'b.png') },
  ];
  const p = teamPrompt({ kind: 'poster', club_name: 'PCN Palermo', mood: 'neutral', pose: 'ready' }, refs, 'vintage', 'kit');
  assert.match(p, /player 1 \(AirDangus23\).*full blue beard, orange visor glasses/);
  assert.match(p, /IDENTITY LOCK/);
  assert.match(p, /no player shown from behind/);
});