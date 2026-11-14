-- Hub team competitions for Social Hub servers (public/spotbot/hub-league.cjs): a hub league (round
-- robin, a round a week) and a hub cup (knockout) between the teams players started in the hub, plus
-- team friendlies. Captains report scores and the other side confirms. The bot writes with the service
-- role; the server's members can read them.
CREATE TABLE IF NOT EXISTS public.hub_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('league', 'cup')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'signup' CHECK (status IN ('signup', 'running', 'done', 'cancelled')),
  teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_key text,
  winner_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS hub_competitions_guild_idx ON public.hub_competitions (guild_id, status);

CREATE TABLE IF NOT EXISTS public.hub_team_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  competition_id uuid REFERENCES public.hub_competitions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('friendly', 'league', 'cup')),
  round integer NOT NULL DEFAULT 0,
  home_key text NOT NULL,
  away_key text NOT NULL,
  home_name text NOT NULL,
  away_name text NOT NULL,
  home_goals integer,
  away_goals integer,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('pending', 'scheduled', 'reported', 'disputed', 'confirmed', 'walkover', 'void', 'declined')),
  reported_by_key text,
  reported_at timestamptz,
  due_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hub_team_matches_guild_idx ON public.hub_team_matches (guild_id, status);
CREATE INDEX IF NOT EXISTS hub_team_matches_comp_idx ON public.hub_team_matches (competition_id);

ALTER TABLE public.hub_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_team_matches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hub_competitions, public.hub_team_matches TO authenticated;
DROP POLICY IF EXISTS "Members read hub competitions" ON public.hub_competitions;
CREATE POLICY "Members read hub competitions" ON public.hub_competitions FOR SELECT TO authenticated USING (guild_id IN (SELECT public.my_guild_ids()));
DROP POLICY IF EXISTS "Members read hub team matches" ON public.hub_team_matches;
CREATE POLICY "Members read hub team matches" ON public.hub_team_matches FOR SELECT TO authenticated USING (guild_id IN (SELECT public.my_guild_ids()));
