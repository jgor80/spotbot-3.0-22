-- AI image allowances, packs and paid plans. Server plans and packs belong to a Discord server; a Player
-- Pass (ready in the schema, not sold yet) belongs to one player and covers their own cards in any server. Everything can be bought on the
-- website (Lemon Squeezy) or in Discord's store at the same price; both land in billing_subscriptions,
-- and packs from either add to image_credits. Only the service role (bot and functions) touches these.

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  guild_id text,
  provider text not null check (provider in ('lemonsqueezy', 'discord')),
  external_id text not null,
  tier text not null check (tier in ('lifetime', 'starter', 'club', 'pro', 'unlimited', 'player_pass')),
  status text not null,
  active boolean not null default false,
  current_period_end timestamptz,
  buyer_discord_id text,
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists billing_subscriptions_guild on public.billing_subscriptions (guild_id) where active;
create index if not exists billing_subscriptions_buyer on public.billing_subscriptions (buyer_discord_id) where active;

-- Pack images left; a server's one-time welcome images also start here
create table if not exists public.image_credits (
  guild_id text primary key,
  pack_balance integer not null default 0 check (pack_balance >= 0),
  welcome_granted boolean not null default false,
  updated_at timestamptz not null default now()
);

-- One row per image a server spends (reserved before the AI call, refunded if it fails)
create table if not exists public.image_ledger (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  discord_user_id text,
  kind text not null,
  credits integer not null check (credits > 0),
  source text not null check (source in ('pass', 'allowance', 'fair_use', 'pack')),
  status text not null default 'reserved' check (status in ('reserved', 'done', 'refunded')),
  created_at timestamptz not null default now()
);
create index if not exists image_ledger_guild_created on public.image_ledger (guild_id, created_at desc);

-- Webhook and entitlement ids already handled, so a retried delivery never adds credits twice
create table if not exists public.billing_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- Manual grants (/premium on) can name a plan; empty means Unlimited
alter table public.premium_servers add column if not exists tier text;

alter table public.billing_subscriptions enable row level security;
alter table public.image_credits enable row level security;
alter table public.image_ledger enable row level security;
alter table public.billing_events enable row level security;

-- Spend images for one render: the player's own Pass first (p_pass > 0 only for their own card), then
-- the server's monthly allowance, then (Unlimited) the daily fair-use allowance, then packs.
-- Serialised per server and per player so two renders can't both take the last image.
create or replace function public.reserve_ai_image(
  p_guild text, p_user text, p_kind text, p_credits integer,
  p_monthly integer, p_welcome integer, p_daily integer, p_pass integer default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  used integer;
  pass_used integer := 0;
  today integer;
  balance integer;
  src text;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ai_image:' || p_guild));
  if p_pass > 0 and p_user is not null then
    perform pg_advisory_xact_lock(hashtext('ai_pass:' || p_user));
    select coalesce(sum(credits), 0) into pass_used from image_ledger
      where discord_user_id = p_user and source = 'pass' and status <> 'refunded' and created_at >= date_trunc('month', now());
  end if;
  -- A server's welcome images arrive with its first render, even if it bought a pack before that
  insert into image_credits (guild_id) values (p_guild) on conflict (guild_id) do nothing;
  update image_credits set pack_balance = pack_balance + greatest(p_welcome, 0), welcome_granted = true, updated_at = now()
    where guild_id = p_guild and not welcome_granted;
  select pack_balance into balance from image_credits where guild_id = p_guild;
  select coalesce(sum(credits), 0) into used from image_ledger
    where guild_id = p_guild and source = 'allowance' and status <> 'refunded' and created_at >= date_trunc('month', now());
  if p_pass > 0 and p_user is not null and pass_used + p_credits <= p_pass then
    src := 'pass';
    pass_used := pass_used + p_credits;
  elsif used + p_credits <= p_monthly then
    src := 'allowance';
  else
    select coalesce(sum(credits), 0) into today from image_ledger
      where guild_id = p_guild and source = 'fair_use' and status <> 'refunded' and created_at >= date_trunc('day', now());
    if p_daily > 0 and today + p_credits <= p_daily then
      src := 'fair_use';
    elsif balance >= p_credits then
      src := 'pack';
      update image_credits set pack_balance = pack_balance - p_credits, updated_at = now() where guild_id = p_guild;
      balance := balance - p_credits;
    else
      return jsonb_build_object('ok', false, 'used', used, 'monthly', p_monthly, 'pack_balance', balance, 'pass_used', pass_used, 'pass', p_pass);
    end if;
  end if;
  insert into image_ledger (guild_id, discord_user_id, kind, credits, source)
    values (p_guild, p_user, p_kind, p_credits, src) returning id into new_id;
  if src = 'allowance' then used := used + p_credits; end if;
  return jsonb_build_object('ok', true, 'id', new_id, 'source', src, 'used', used, 'monthly', p_monthly, 'pack_balance', balance, 'pass_used', pass_used, 'pass', p_pass);
end $$;

-- Give images back when the render failed
create or replace function public.refund_ai_image(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r image_ledger;
begin
  update image_ledger set status = 'refunded' where id = p_id and status = 'reserved' returning * into r;
  if r.id is not null and r.source = 'pack' then
    update image_credits set pack_balance = pack_balance + r.credits, updated_at = now() where guild_id = r.guild_id;
  end if;
end $$;

-- Add pack images once per purchase (provider + event id)
create or replace function public.add_image_credits(p_guild text, p_credits integer, p_provider text, p_event text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into billing_events (provider, event_id) values (p_provider, p_event) on conflict do nothing;
  if not found then return false; end if;
  insert into image_credits (guild_id, pack_balance) values (p_guild, p_credits)
    on conflict (guild_id) do update set pack_balance = image_credits.pack_balance + excluded.pack_balance, updated_at = now();
  return true;
end $$;

revoke all on function public.reserve_ai_image(text, text, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.refund_ai_image(uuid) from public, anon, authenticated;
revoke all on function public.add_image_credits(text, integer, text, text) from public, anon, authenticated;
