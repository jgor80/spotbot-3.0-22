CREATE TABLE public.player_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  discord_user_id text NOT NULL,
  style text NOT NULL,
  name text NOT NULL,
  storage_path text NOT NULL,
  back_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_cards TO service_role;
ALTER TABLE public.player_cards ENABLE ROW LEVEL SECURITY;
CREATE INDEX player_cards_owner_idx ON public.player_cards (discord_user_id, created_at DESC);