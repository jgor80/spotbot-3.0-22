-- Members' saved Build lab builds (share codes from src/lib/proBuild.ts), from gafferbot.app/build.
-- A member keeps up to 30; the one marked on_cards is what Graphics Studio prints ("With My Build" card
-- fronts and the build back of card). archetype/level are copied out of the code so the site can show
-- the level of each archetype the member has (which also feeds their Masteries).
-- Written only through the player-cards function (the signed-in member's verified Discord link). Service role only.
CREATE TABLE IF NOT EXISTS public.player_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL,
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 40),
  code text NOT NULL CHECK (char_length(code) BETWEEN 8 AND 800),
  archetype text NOT NULL,
  level integer NOT NULL CHECK (level BETWEEN 1 AND 99),
  on_cards boolean NOT NULL DEFAULT false,
  units text NOT NULL DEFAULT 'imperial' CHECK (units IN ('imperial', 'metric')), -- how height and weight are printed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_builds_member_idx ON public.player_builds (discord_user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS player_builds_on_cards_idx ON public.player_builds (discord_user_id) WHERE on_cards;
ALTER TABLE public.player_builds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_builds FROM anon, authenticated;
