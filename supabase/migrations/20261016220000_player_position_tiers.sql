-- Position tiers: each player's comp position (primary, one), positions they play well (secondary,
-- up to three) and positions they can fill in an emergency (up to three), per server.
-- Primary and secondary are mirrored as Discord roles; emergency positions are data only and show
-- on sub requests, free agent listings and player profiles.
-- Additive only: team_rosters.primary_position / secondary_position and free_agents.position /
-- secondary_position stay and are kept in step by the bot, so existing readers keep working.

CREATE TABLE IF NOT EXISTS public.player_positions (
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  primary_position TEXT,
  secondary_positions TEXT[] NOT NULL DEFAULT '{}',
  emergency_positions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, discord_user_id)
);
CREATE INDEX IF NOT EXISTS idx_player_positions_primary ON public.player_positions(guild_id, primary_position);
CREATE INDEX IF NOT EXISTS idx_player_positions_secondary ON public.player_positions USING gin (secondary_positions);
CREATE INDEX IF NOT EXISTS idx_player_positions_emergency ON public.player_positions USING gin (emergency_positions);
-- Only the bot and backend functions (service role) write it; the signed-in website reads it
-- (lineup builder, availability board), never the anonymous key
ALTER TABLE public.player_positions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_positions FROM anon;
DROP POLICY IF EXISTS "Signed-in users can read player positions" ON public.player_positions;
CREATE POLICY "Signed-in users can read player positions" ON public.player_positions
  FOR SELECT TO authenticated USING (true);

-- Existing roster positions become the player's tiers in that server. A player on several club
-- rosters in one server keeps the primary from their earliest roster entry; every other position
-- they had anywhere in that server becomes a secondary, so nothing is lost.
WITH roster AS (
  SELECT t.guild_id, r.discord_user_id, r.primary_position, r.secondary_position, r.joined_at
  FROM public.team_rosters r
  JOIN public.teams t ON t.id = r.team_id
  WHERE r.discord_user_id IS NOT NULL
    AND (r.primary_position IS NOT NULL OR r.secondary_position IS NOT NULL)
),
firsts AS (
  SELECT DISTINCT ON (guild_id, discord_user_id)
    guild_id, discord_user_id, COALESCE(primary_position, secondary_position) AS primary_position
  FROM roster
  ORDER BY guild_id, discord_user_id, (primary_position IS NULL), joined_at NULLS LAST
),
others AS (
  SELECT r.guild_id, r.discord_user_id, p.pos
  FROM roster r
  CROSS JOIN LATERAL (VALUES (r.primary_position), (r.secondary_position)) AS p(pos)
  WHERE p.pos IS NOT NULL
)
INSERT INTO public.player_positions (guild_id, discord_user_id, primary_position, secondary_positions)
SELECT f.guild_id, f.discord_user_id, f.primary_position,
  COALESCE(
    (SELECT array_agg(DISTINCT o.pos) FROM others o
     WHERE o.guild_id = f.guild_id AND o.discord_user_id = f.discord_user_id AND o.pos <> f.primary_position),
    '{}'
  )
FROM firsts f
ON CONFLICT (guild_id, discord_user_id) DO NOTHING;

-- Free agent listings carry the same tiers (the listing is global, one per player)
ALTER TABLE public.free_agents
  ADD COLUMN IF NOT EXISTS secondary_positions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emergency_positions TEXT[] NOT NULL DEFAULT '{}';
UPDATE public.free_agents
SET secondary_positions = ARRAY[secondary_position]
WHERE secondary_position IS NOT NULL AND secondary_position <> position AND secondary_positions = '{}';
