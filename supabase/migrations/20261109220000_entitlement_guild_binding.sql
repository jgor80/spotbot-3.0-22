-- A Discord purchase stays with the server it was first credited to. Discord ties packs to the user,
-- so the billing function used the buyer's latest buy-button server (billing_buy_hints) every time an
-- entitlement arrived, and a refund or startup replay could debit or move a different server.
-- The billing function now records the first server under event_id 'bind:ent:<entitlement id>' and
-- resolves every later update, replay and refund from it. billing_events is kept by purge_data.
alter table public.billing_events add column if not exists guild_id text;
