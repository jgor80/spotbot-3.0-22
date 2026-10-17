-- One row per AI image render (club-art), with the model and what it cost from OpenAI's usage,
-- plus reused card art (cost 0), so per-server usage and real costs can be measured.
create table if not exists public.ai_image_renders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  guild_id text,
  discord_user_id text,
  kind text not null,
  style text,
  model text,
  quality text,
  size text,
  reference_count integer not null default 0,
  ok boolean not null default true,
  reused boolean not null default false,
  text_tokens integer,
  image_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 5)
);

create index if not exists ai_image_renders_guild_created on public.ai_image_renders (guild_id, created_at desc);

-- Service role only (bot and functions); no client policies
alter table public.ai_image_renders enable row level security;
