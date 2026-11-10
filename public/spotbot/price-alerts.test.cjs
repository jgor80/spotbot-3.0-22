// FUT price alerts: after a price refresh the bot asks fut-api what fired and DMs the linked Discord account.
const test = require('node:test');
const assert = require('node:assert');
const { priceAlerts } = require('./scheduler.cjs');

const links = (rows) => ({ from: () => { const q = { select: () => q, in: () => q, eq: () => Promise.resolve({ data: rows, error: null }) }; return q; } });

test('price alerts DM each player once, skip unlinked accounts and count closed DMs', async () => {
  const before = process.env.FUT_ENABLED;
  process.env.FUT_ENABLED = 'true';
  try {
    const calls = [], sent = [];
    const callFunction = async (fn, body) => { calls.push([fn, body.job]); return { data: { data: { deliveries: [{ user_id: 'u1', text: 'hi 1' }, { user_id: 'u2', text: 'hi 2' }, { user_id: 'u3', text: 'hi 3' }] } } }; };
    const sendDM = async (id, text) => { if (id === 'd3') throw new Error('Cannot send messages to this user'); sent.push([id, text]); };
    const r = await priceAlerts({ supabase: links([{ auth_user_id: 'u1', discord_user_id: 'd1' }, { auth_user_id: 'u3', discord_user_id: 'd3' }]), callFunction, sendDM });
    assert.deepStrictEqual(calls, [['fut-api', 'price-alerts']]);
    assert.deepStrictEqual(sent, [['d1', 'hi 1']]);
    assert.deepStrictEqual(r, { sent: 1, failed: 1 });
    process.env.PRICE_ALERTS = 'off';
    assert.deepStrictEqual(await priceAlerts({ supabase: links([]), callFunction, sendDM }), { sent: 0 });
  } finally {
    process.env.FUT_ENABLED = before; delete process.env.PRICE_ALERTS;
  }
});
