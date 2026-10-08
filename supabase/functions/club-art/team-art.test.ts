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
  assert.match(prompt, /Only this player may wear verified number 23/);
  assert.match(prompt, /Reference image 2 is player 2.*no shirt or shorts number/);
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