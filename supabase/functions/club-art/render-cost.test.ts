import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referenceLimit, renderCost } from './render-cost.ts';

test('render cost follows the model price card and the usage breakdown', () => {
  const usage = { input_tokens: 13300, output_tokens: 1600, input_tokens_details: { text_tokens: 1000, image_tokens: 12300 } };
  // gpt-image-1.5: 1000 × $5 + 12300 × $8 + 1600 × $32 per 1M
  assert.deepEqual(renderCost('gpt-image-1.5', usage), { text_tokens: 1000, image_tokens: 12300, output_tokens: 1600, cost_usd: 0.1546 });
  assert.equal(renderCost('openai/gpt-image-1', usage)?.cost_usd, 0.192);
  assert.equal(renderCost('some-new-model', usage)?.cost_usd, null);
  assert.equal(renderCost('gpt-image-1.5', null), null);
  // No breakdown: input counted as text
  assert.equal(renderCost('gpt-image-1.5', { input_tokens: 1000, output_tokens: 0 })?.text_tokens, 1000);
});

test('reference photos are capped at 1-3, two by default', () => {
  assert.equal(referenceLimit(undefined), 2);
  assert.equal(referenceLimit('1'), 1);
  assert.equal(referenceLimit('9'), 3);
  assert.equal(referenceLimit('0'), 1);
  assert.equal(referenceLimit('lots'), 2);
});
