import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ARRANGEMENTS, CAMERAS, LIGHTING, POSES, SCENES, line } from './variety.ts';

const variants = createRequire(import.meta.url)('../../../public/spotbot/graphics-variants.cjs');

test('every pick the bot can send has a prompt line here', () => {
  for (const [keys, pool] of [[variants.POSES, POSES], [variants.CAMERAS, CAMERAS], [variants.LIGHTING, LIGHTING], [variants.SCENES, SCENES], [variants.ARRANGEMENTS, ARRANGEMENTS]]) {
    for (const k of keys) assert.ok(k in pool, `missing ${k}`);
  }
});

test('a picked key gives its line, a missing one a random line that skips excluded keys', () => {
  assert.equal(line(SCENES, 'tunnel'), SCENES.tunnel);
  for (let i = 0; i < 50; i++) assert.notEqual(line(SCENES, undefined, ['confetti']), SCENES.confetti);
});
