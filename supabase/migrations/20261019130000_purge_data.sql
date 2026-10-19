-- Deleting a player's or a server's data on request (privacy policy: within 30 days).
-- purge_data('user', <discord id>) deletes rows about that player and blanks their id where they only
-- acted (created_by..., a manager list); purge_data('guild', <server id>) deletes every row for that server.
-- It finds the columns itself, so tables added later are covered. Billing records are kept for accounting:
-- a player's id is blanked there instead, and a server's billing rows stay. Dry run by default; storage
-- files (photos, cards, crests) are removed by scripts/hetzner/purge-data.mjs, which calls this.
create or replace function public.purge_data(p_kind text, p_id text, p_dry_run boolean default true)
returns table (table_name text, column_name text, action text, row_count bigint)
language plpgsql security definer set search_path = public as $$
declare
  keep_tables constant text[] := array['billing_subscriptions', 'billing_events', 'image_ledger', 'image_credits'];
  -- Columns that identify the player a row is about (the row goes); other *_discord_id columns are actors (blanked)
  about_player constant text[] := array['discord_user_id', 'player_discord_id', 'player_a_discord_id', 'player_b_discord_id',
    'evaluated_discord_id', 'evaluator_discord_id', 'picked_player_discord_id', 'suggested_discord_id'];
  t record;
  mode text;
  n bigint;
  pass integer;
  left_over integer;
begin
  if p_kind not in ('user', 'guild') or p_id !~ '^\d{5,25}$' then
    raise exception 'purge_data: kind must be user or guild, and id a Discord id';
  end if;

  create temp table if not exists purge_plan (tbl text, col text, mode text, nullable boolean, is_array boolean, done boolean default false) on commit drop;
  truncate purge_plan;
  for t in
    select c.table_name as tbl, c.column_name as col, c.is_nullable = 'YES' as nullable, c.data_type = 'ARRAY' as is_array
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and (c.data_type in ('text', 'character varying') or (c.data_type = 'ARRAY' and c.udt_name in ('_text', '_varchar')))
      and (
        (p_kind = 'guild' and (c.column_name = 'guild_id' or c.column_name like '%\_guild\_id'))
        or (p_kind = 'user' and (c.column_name like '%discord\_id' or c.column_name like '%discord\_ids' or c.column_name in ('discord_user_id', 'user_ids')))
      )
  loop
    if t.is_array then mode := 'remove';
    elsif p_kind = 'guild' then mode := case when t.tbl = any(keep_tables) then 'keep' else 'delete' end;
    elsif t.col = any(about_player) and not (t.tbl = any(keep_tables)) then mode := 'delete';
    else mode := case when t.nullable then 'blank' else 'keep' end;
    end if;
    insert into purge_plan (tbl, col, mode, nullable, is_array) values (t.tbl, t.col, mode, t.nullable, t.is_array);
  end loop;

  -- Rows other tables still point at can't go first, so deletes that hit a foreign key are retried
  for pass in 1..6 loop
    left_over := 0;
    for t in select * from purge_plan where not done order by tbl, col loop
      if t.is_array then
        execute format('select count(*) from %I where $1 = any(%I)', t.tbl, t.col) into n using p_id;
      else
        execute format('select count(*) from %I where %I = $1', t.tbl, t.col) into n using p_id;
      end if;
      if p_dry_run or n = 0 or t.mode = 'keep' then
        update purge_plan set done = true where tbl = t.tbl and col = t.col;
        if n > 0 then table_name := t.tbl; column_name := t.col; action := case when p_dry_run then 'would ' else '' end || t.mode; row_count := n; return next; end if;
        continue;
      end if;
      begin
        if t.mode = 'delete' then
          execute format('delete from %I where %I = $1', t.tbl, t.col) using p_id;
        elsif t.mode = 'blank' then
          execute format('update %I set %I = null where %I = $1', t.tbl, t.col, t.col) using p_id;
        else
          execute format('update %I set %I = array_remove(%I, $1) where $1 = any(%I)', t.tbl, t.col, t.col, t.col) using p_id;
        end if;
        update purge_plan set done = true where tbl = t.tbl and col = t.col;
        table_name := t.tbl; column_name := t.col; action := t.mode; row_count := n; return next;
      exception when foreign_key_violation or not_null_violation then
        left_over := left_over + 1;
      end;
    end loop;
    exit when left_over = 0;
  end loop;

  for t in select * from purge_plan where not done loop
    table_name := t.tbl; column_name := t.col; action := 'failed (still referenced)'; row_count := null; return next;
  end loop;
end $$;

revoke all on function public.purge_data(text, text, boolean) from public, anon, authenticated;
