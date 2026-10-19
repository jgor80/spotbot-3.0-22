-- Render quality and pay-for-what-you-post.
-- Every club-art attempt logs its quality check; a failed check is redrawn at our cost.
alter table public.ai_image_renders add column if not exists attempt smallint;
alter table public.ai_image_renders add column if not exists qa_pass boolean;
alter table public.ai_image_renders add column if not exists qa_issues text[];

-- Studio graphics are previewed first: images stay reserved until the member posts (done) or
-- discards/redoes (discarded, given back). Discarded images never count toward a server's allowance.
alter table public.image_ledger drop constraint if exists image_ledger_status_check;
alter table public.image_ledger add constraint image_ledger_status_check check (status in ('reserved', 'done', 'refunded', 'discarded'));
create index if not exists image_ledger_discards on public.image_ledger (guild_id, discord_user_id, created_at desc) where status = 'discarded';

-- Same as 20261017120000_image_billing.sql, except discarded images are not counted as used
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
  update image_credits set pack_balance = pack_balance + greatest(p_welcome, 0), welcome_granted = true, updated_at = now()
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

-- A member turned a preview down (Redo or Discard): give the images back, up to p_free discards a day
-- per member per server; past that the render is charged (status done) so redo loops can't be free.
create or replace function public.discard_ai_image(p_id uuid, p_free integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r image_ledger;
  n integer;
begin
  select * into r from image_ledger where id = p_id and status = 'reserved' for update;
  if r.id is null then return jsonb_build_object('ok', false, 'charged', false); end if;
  perform pg_advisory_xact_lock(hashtext('ai_discard:' || r.guild_id || ':' || coalesce(r.discord_user_id, '')));
  select count(*) into n from image_ledger
    where guild_id = r.guild_id and discord_user_id is not distinct from r.discord_user_id
      and status = 'discarded' and created_at >= date_trunc('day', now());
  if n >= greatest(p_free, 0) then
    update image_ledger set status = 'done' where id = p_id;
    return jsonb_build_object('ok', true, 'charged', true);
  end if;
  update image_ledger set status = 'discarded' where id = p_id;
  if r.source = 'pack' then
    update image_credits set pack_balance = pack_balance + r.credits, updated_at = now() where guild_id = r.guild_id;
  end if;
  return jsonb_build_object('ok', true, 'charged', false);
end $$;

revoke all on function public.reserve_ai_image(text, text, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.discard_ai_image(uuid, integer) from public, anon, authenticated;
