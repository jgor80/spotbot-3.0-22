const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_SKUS = JSON.stringify({ club: '1000000000000000001', pack30: '1000000000000000002' });
const { createPremium } = require('./premium.cjs');

const GUILD = '1529555651762851930';
const USER = '501557839932948490';

function setup(reply) {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => { const body = JSON.parse(options.body); calls.push({ url, body }); return { ok: true, json: async () => reply(body) }; };
  const supabase = { from: () => ({ select() { return this; }, eq() { return this; }, limit() { return Promise.resolve({ data: [] }); }, maybeSingle: () => Promise.resolve({ data: null }) }) };
  const premium = createPremium({ supabase, supabaseUrl: 'https://example.invalid', secret: 'test-only' });
  return { premium, calls, restore: () => { global.fetch = originalFetch; } };
}

test('a Discord pack purchase is credited to the server where the buy button was opened, then consumed', async () => {
  const { premium, calls, restore } = setup(() => ({ applied: true, consume: true }));
  try {
    // The buyer opened the buy buttons in this server first
    premium.buyRows(GUILD, USER, { products: [] });
    let consumed = 0;
    await premium.forwardEntitlement({ id: '77', skuId: '1000000000000000002', userId: USER, guildId: null, consumed: false, consume: async () => { consumed++; } });
    assert.equal(calls[0].url, 'https://example.invalid/functions/v1/billing');
    assert.equal(calls[0].body.action, 'discord_entitlement');
    assert.equal(calls[0].body.guild_hint, GUILD);
    assert.equal(calls[0].body.entitlement.sku_id, '1000000000000000002');
    assert.equal(consumed, 1);
    // Purchases of anything else GafferBot doesn't sell are left alone
    await premium.forwardEntitlement({ id: '78', skuId: '999', userId: USER });
    assert.equal(calls.length, 1);
    // A cancelled subscription is sent as deleted and never consumed
    await premium.forwardEntitlement({ id: '79', skuId: '1000000000000000001', guildId: GUILD, consume: async () => { consumed++; } }, { deleted: true });
    assert.equal(calls[1].body.entitlement.deleted, true);
  } finally { restore(); }
});

test('buy buttons offer Discord store items plus the website, and the panel line reads plainly', () => {
  const { premium, restore } = setup(() => ({}));
  try {
    const status = { limits_on: true, plan: 'Club', monthly: 60, used: 20, pack_balance: 5, left: 45, billing_url: `https://gafferbot.app/billing?guild=${GUILD}`,
      products: [{ key: 'club', type: 'monthly', discord_sku: '1000000000000000001' }, { key: 'pack30', type: 'pack', discord_sku: '1000000000000000002' }, { key: 'pack80', type: 'pack', discord_sku: null }] };
    const rows = premium.buyRows(GUILD, USER, status).map((r) => r.toJSON().components);
    assert.equal(rows[0][0].url, status.billing_url);
    assert.deepEqual(rows[0].slice(1).map((b) => b.sku_id), ['1000000000000000002']);
    assert.deepEqual(rows[1].map((b) => b.sku_id), ['1000000000000000001']);
    assert.equal(premium.imagesLine(status), '🖼️ **45** AI images left on the **Club** plan (40 of 60 this month, 5 from packs).');
    assert.equal(premium.imagesLine({ limits_on: false }), '🖼️ AI images are unlimited for now.');
  } finally { restore(); }
});
