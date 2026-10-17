import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeTier, billingConfig, creditsFor } from '../_shared/billing.ts';
import { discordChange, lemonChange, verifyLemonSignature } from './events.ts';

const env: Record<string, string> = {
  LEMONSQUEEZY_VARIANTS: JSON.stringify({ club: '111', pack25: '222', lifetime: '333' }),
  DISCORD_SKUS: JSON.stringify({ club: '9001', pack25: '9002', lifetime: '9003' }),
  BILLING_PACKS: JSON.stringify({ pack25: { credits: 35 } }),
};
const config = billingConfig((k) => env[k]);
const GUILD = '1529555651762851930';
const now = new Date('2026-10-17T12:00:00Z');

test('settings override one field and keep the rest', () => {
  assert.equal(config.packs.pack25.credits, 35);
  assert.equal(config.packs.pack25.price, 4.99);
  assert.equal(config.plans.club.monthly, 50);
  assert.equal(config.limitsOn, false);
});

test('web pack purchases add images once per order; refunds and unpaid orders add none', () => {
  const order = (status: string) => ({ meta: { custom_data: { guild_id: GUILD } }, data: { id: '77', attributes: { status, first_order_item: { variant_id: 222 } } } });
  assert.deepEqual(lemonChange('order_created', order('paid'), config), { kind: 'credits', provider: 'lemonsqueezy', guild_id: GUILD, amount: 35, event_id: 'order:77', buyer: null });
  assert.equal(lemonChange('order_created', order('pending'), config).kind, 'ignore');
  assert.equal(lemonChange('order_refunded', order('refunded'), config).kind, 'ignore');
  // No server on the purchase: nothing is credited anywhere
  assert.equal(lemonChange('order_created', { ...order('paid'), meta: {} }, config).kind, 'ignore');
});

test('web subscriptions stay on until a cancelled plan reaches its end date', () => {
  const sub = (status: string, ends_at: string | null = null) => ({ meta: { custom_data: { guild_id: GUILD, discord_user_id: '501557839932948490' } }, data: { id: '5', attributes: { status, variant_id: 111, ends_at } } });
  const live = lemonChange('subscription_created', sub('active'), config, now);
  assert.equal(live.kind === 'subscription' && live.active, true);
  assert.equal(live.kind === 'subscription' && live.buyer, '501557839932948490');
  const cancelled = lemonChange('subscription_cancelled', sub('cancelled', '2026-11-01T00:00:00Z'), config, now);
  assert.equal(cancelled.kind === 'subscription' && cancelled.active, true);
  const ended = lemonChange('subscription_expired', sub('expired', '2026-10-01T00:00:00Z'), config, now);
  assert.equal(ended.kind === 'subscription' && ended.active, false);
  assert.equal(lemonChange('subscription_payment_success', sub('active'), config).kind, 'ignore');
});

test('the one-time Club Activation gives the plan plus its images, on either store', () => {
  const web = lemonChange('order_created', { meta: { custom_data: { guild_id: GUILD } }, data: { id: '9', attributes: { status: 'paid', first_order_item: { variant_id: '333' } } } }, config);
  assert.equal(web.kind, 'subscription');
  if (web.kind === 'subscription') { assert.equal(web.tier, 'lifetime'); assert.deepEqual(web.credits, { amount: 20, event_id: 'order:9' }); }
  const discord = discordChange({ id: 'e1', sku_id: '9003', guild_id: GUILD }, config);
  assert.equal(discord.kind === 'subscription' && discord.status, 'lifetime');
});

test('Discord packs go to the server they were bought for, or the hinted server', () => {
  assert.deepEqual(discordChange({ id: 'e2', sku_id: '9002', user_id: '501557839932948490' }, config, GUILD), { kind: 'credits', provider: 'discord', guild_id: GUILD, amount: 35, event_id: 'ent:e2', buyer: '501557839932948490' });
  assert.equal(discordChange({ id: 'e2', sku_id: '9002' }, config, null).kind, 'ignore');
  assert.equal(discordChange({ id: 'e3', sku_id: 'nope', guild_id: GUILD }, config).kind, 'ignore');
  const sub = discordChange({ id: 'e4', sku_id: '9001', guild_id: GUILD, ends_at: '2026-11-17T00:00:00Z' }, config, null, now);
  assert.equal(sub.kind === 'subscription' && sub.active, true);
  const gone = discordChange({ id: 'e4', sku_id: '9001', guild_id: GUILD, deleted: true }, config, null, now);
  assert.equal(gone.kind === 'subscription' && gone.active, false);
});

test('a server gets the best live plan it holds', () => {
  const rows = [
    { tier: 'starter', status: 'active', active: true, current_period_end: null },
    { tier: 'pro', status: 'cancelled', active: true, current_period_end: '2026-10-01T00:00:00Z' },
  ];
  assert.equal(activeTier(rows, null, now), 'starter');
  assert.equal(activeTier(rows, { enabled: true }, now), 'unlimited');
  assert.equal(activeTier([], { enabled: true, tier: 'club' }, now), 'club');
  assert.equal(activeTier([], { enabled: true, expires_at: '2026-01-01T00:00:00Z' }, now), 'free');
  assert.equal(creditsFor('card', 0), 1);
  assert.equal(creditsFor('poster', 3), 2);
});

test('webhook signatures must match the raw body', async () => {
  const body = '{"meta":{}}';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('shh'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(await verifyLemonSignature('shh', body, sig), true);
  assert.equal(await verifyLemonSignature('shh', body + ' ', sig), false);
  assert.equal(await verifyLemonSignature('', body, sig), false);
});
