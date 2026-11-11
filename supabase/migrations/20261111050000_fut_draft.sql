-- Draft simulator and pack opener (for fun): seeded random FC 27 cards from FUT.GG's card list, and the scores
-- players got on a shared draft code (Discord draft nights). Service role only, like the rest of `fut`.

-- p_count catalogue cards rated p_min-p_max (optionally only those whose main position is p_position), picked at
-- random but weighted towards higher ratings: weight (overall - 70) ^ p_power, Efraimidis-Spirakis keys from
-- md5(seed:id), so the same seed always gives the same cards.
CREATE OR REPLACE FUNCTION fut.random_cards(p_seed TEXT, p_count INTEGER, p_min INTEGER, p_max INTEGER, p_position TEXT DEFAULT NULL, p_power NUMERIC DEFAULT 1)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT coalesce(jsonb_agg(c ORDER BY k DESC), '[]'::JSONB) FROM (
    SELECT jsonb_build_object('id', id, 'name', player_name, 'overall', overall, 'positions', positions, 'club', club, 'league', league, 'nation', nation,
      'is_icon', is_icon, 'is_hero', is_hero, 'version', version, 'ea_item_id', source_card_key::BIGINT) AS c,
      ln((('x' || substr(md5(p_seed || ':' || id::TEXT), 1, 8))::BIT(32)::BIGINT + 1)::NUMERIC / 4294967297) / power(greatest(overall - 70, 1), least(greatest(coalesce(p_power, 1), 0), 4)) AS k
    FROM fut.player_cards
    WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND source_card_key ~ '^[1-9][0-9]{0,9}$'
      AND overall BETWEEN greatest(p_min, 1) AND least(p_max, 99) AND (p_position IS NULL OR positions[1] = p_position)
      AND length(coalesce(p_seed, '')) BETWEEN 1 AND 80
    ORDER BY k DESC LIMIT least(greatest(coalesce(p_count, 1), 1), 30)
  ) x;
$$;
REVOKE ALL ON FUNCTION fut.random_cards(TEXT, INTEGER, INTEGER, INTEGER, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.random_cards(TEXT, INTEGER, INTEGER, INTEGER, TEXT, NUMERIC) TO service_role;

-- Each player's best finished draft per draft code.
CREATE TABLE fut.draft_scores (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed        TEXT NOT NULL CHECK (seed ~ '^[a-z0-9]{6,16}$'),
  formation   TEXT NOT NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 99),
  chemistry   SMALLINT NOT NULL CHECK (chemistry BETWEEN 0 AND 33),
  score       SMALLINT NOT NULL,
  squad       JSONB NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, seed)
);
CREATE INDEX fut_draft_scores_seed ON fut.draft_scores (seed, score DESC);
GRANT ALL ON fut.draft_scores TO service_role;
ALTER TABLE fut.draft_scores ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
