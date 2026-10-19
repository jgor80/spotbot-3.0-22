-- Billing hardening: refunds take back unspent pack images, late webhooks can't overwrite a newer plan
-- state, and the server a buyer opened a Discord buy button in survives a bot restart.

alter table public.billing_subscriptions add column if not exists source_updated_at timestamptz;

-- Remove up to p_credits unspent pack images, once per refund event; returns how many were removed
create or replace function public.remove_image_credits(p_guild text, p_credits integer, p_provider text, p_event text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  balance integer;
  removed integer;
begin
  insert into billing_events (provider, event_id) values (p_provider, p_event) on conflict do nothing;
  if not found then return 0; end if;
  select pack_balance into balance from image_credits where guild_id = p_guild for update;
  if balance is null then return 0; end if;
  removed := least(balance, greatest(p_credits, 0));
  update image_credits set pack_balance = balance - removed, updated_at = now() where guild_id = p_guild;
  return removed;
end $$;
revoke all on function public.remove_image_credits(text, integer, text, text) from public, anon, authenticated;

-- Which server a buyer last opened a Discord buy button in; Discord ties packs to the user, not the server
create table if not exists public.billing_buy_hints (
  discord_user_id text primary key,
  guild_id text not null,
  updated_at timestamptz not null default now()
);
alter table public.billing_buy_hints enable row level security;
