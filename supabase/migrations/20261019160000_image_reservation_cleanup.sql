-- Image credit loose ends.
-- 1. A reservation whose render never finished (the bot restarted mid-render) used to stay
--    'reserved' for good, counting against the server's allowance or keeping pack images. Studio
--    previews mark theirs held; settle_stale_image_reservations() (hourly, scheduler.cjs) refunds
--    unheld reservations older than an hour and charges previews nobody answered within 7 days.
-- 2. Welcome images go to the first server a member renders in, not every new server they make.
alter table public.image_ledger add column if not exists held_at timestamptz;
create index if not exists image_ledger_reserved on public.image_ledger (created_at) where status = 'reserved';
alter table public.image_credits add column if not exists welcome_granted_by text;
create index if not exists image_credits_welcome_by on public.image_credits (welcome_granted_by) where welcome_granted_by is not null;

-- Same as 20261019120000_image_quality_and_discards.sql, except welcome images are once per member
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
      where discord_user_id = p_user and source = 'pass' and status not in ('refunded', 'discarded') and created_at >= date_trunc('month', now());
  end if;
  insert into image_credits (guild_id) values (p_guild) on conflict (guild_id) do nothing;
  -- Welcome images go to a member's first server only, so spinning up new servers can't farm them
  if p_user is not null and exists (select 1 from image_credits where guild_id = p_guild and not welcome_granted) then
    perform pg_advisory_xact_lock(hashtext('ai_welcome:' || p_user));
    if exists (select 1 from image_credits where welcome_granted_by = p_user and guild_id <> p_guild) then
      p_welcome := 0;
    end if;
  end if;
  update image_credits set pack_balance = pack_balance + greatest(p_welcome, 0), welcome_granted = true,
      welcome_granted_by = case when p_welcome > 0 then p_user end, updated_at = now()
    where guild_id = p_guild and not welcome_granted;
  select pack_balance into balance from image_credits where guild_id = p_guild;
  select coalesce(sum(credits), 0) into used from image_ledger
    where guild_id = p_guild and source = 'allowance' and status not in ('refunded', 'discarded') and created_at >= date_trunc('month', now());
  if p_pass > 0 and p_user is not null and pass_used + p_credits <= p_pass then
    src := 'pass';
    pass_used := pass_used + p_credits;
  elsif used + p_credits <= p_monthly then
    src := 'allowance';
  else
    select coalesce(sum(credits), 0) into today from image_ledger
      where guild_id = p_guild and source = 'fair_use' and status not in ('refunded', 'discarded') and created_at >= date_trunc('day', now());
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
revoke all on function public.reserve_ai_image(text, text, text, integer, integer, integer, integer, integer) from public, anon, authenticated;

create or replace function public.settle_stale_image_reservations() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  refunded integer := 0;
  charged integer := 0;
  r image_ledger;
begin
  for r in select * from image_ledger
    where status = 'reserved' and held_at is null and created_at < now() - interval '1 hour'
    for update skip locked
  loop
    update image_ledger set status = 'refunded' where id = r.id;
    if r.source = 'pack' then
      update image_credits set pack_balance = pack_balance + r.credits, updated_at = now() where guild_id = r.guild_id;
    end if;
    refunded := refunded + 1;
  end loop;
  update image_ledger set status = 'done'
    where status = 'reserved' and held_at is not null and held_at < now() - interval '7 days';
  get diagnostics charged = row_count;
  return jsonb_build_object('refunded', refunded, 'charged', charged);
end $$;
revoke all on function public.settle_stale_image_reservations() from public, anon, authenticated;
