-- SBC Solver: the challenges (with requirements) of SBC sets the user opened in the EA Web App, as the XI Lab helper
-- copied them, and the market cards the solver may suggest buying. Service role only, like the rest of `fut`.

ALTER TABLE fut.account_state
  ADD COLUMN IF NOT EXISTS sbc_challenges JSONB,
  ADD COLUMN IF NOT EXISTS sbc_challenges_at TIMESTAMPTZ;

-- Cards the solver can use besides the user's own club, on one platform at FUT.GG's latest prices:
--   cheapest p_per_rating cards at every overall, cheapest 40 from each named league/nation/club (p_names),
--   cheapest 40 special (promo) cards, cheapest 15 from each of the 8 biggest leagues and nations (for chemistry),
--   and the catalogue details of p_ids (the user's spare duplicates), priced or not.
CREATE OR REPLACE FUNCTION fut.sbc_card_pool(p_platform TEXT, p_ids BIGINT[] DEFAULT '{}', p_names TEXT[] DEFAULT '{}', p_per_rating INTEGER DEFAULT 8)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE latest TIMESTAMPTZ; per INTEGER := least(greatest(coalesce(p_per_rating, 8), 1), 20); names TEXT[]; result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  IF coalesce(cardinality(p_ids), 0) > 1000 THEN RAISE EXCEPTION 'at most 1000 ids'; END IF;
  IF coalesce(cardinality(p_names), 0) > 30 THEN RAISE EXCEPTION 'at most 30 names'; END IF;
  SELECT array_agg(DISTINCT lower(trim(n))) INTO names FROM unnest(coalesce(p_names, '{}'::TEXT[])) n WHERE length(trim(n)) BETWEEN 1 AND 60;
  SELECT max(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform;
  WITH prices AS MATERIALIZED (
    SELECT ea_item_id::TEXT AS key, price FROM fut.futgg_prices
    WHERE latest IS NOT NULL AND game_year = 27 AND platform = p_platform AND published_at = latest AND price > 0
  ), cat AS MATERIALIZED (
    SELECT c.id, c.player_name, c.version, c.overall, c.positions, c.club, c.league, c.nation, c.is_icon, c.is_hero,
      c.source_card_key::BIGINT AS ea_item_id, prices.price
    FROM fut.player_cards c LEFT JOIN prices ON prices.key = c.source_card_key
    WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue'
  ), priced AS MATERIALIZED (SELECT * FROM cat WHERE price IS NOT NULL),
  cheap AS (
    SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY overall ORDER BY price, id) AS rn FROM priced) x WHERE rn <= per
  ), named AS (
    SELECT id FROM (
      SELECT p.id, row_number() OVER (PARTITION BY n ORDER BY p.price, p.id) AS rn
      FROM priced p JOIN unnest(coalesce(names, '{}'::TEXT[])) n ON n IN (lower(p.league), lower(p.nation), lower(p.club))
    ) x WHERE rn <= 40
  ), special AS (
    SELECT id FROM priced WHERE is_icon OR is_hero OR lower(coalesce(version, '')) NOT IN ('rare', 'common', '') ORDER BY price, id LIMIT 40
  ), big AS (
    SELECT g, k FROM (
      SELECT 'league' AS g, league AS k, count(*) AS n FROM priced WHERE league IS NOT NULL GROUP BY league
      UNION ALL SELECT 'nation', nation, count(*) FROM priced WHERE nation IS NOT NULL GROUP BY nation
    ) t ORDER BY n DESC LIMIT 16
  ), grouped AS (
    SELECT id FROM (
      SELECT p.id, row_number() OVER (PARTITION BY big.g, big.k ORDER BY p.price, p.id) AS rn
      FROM priced p JOIN big ON (big.g = 'league' AND p.league = big.k) OR (big.g = 'nation' AND p.nation = big.k)
    ) x WHERE rn <= 15
  ), picked AS (
    SELECT id FROM cheap UNION SELECT id FROM named UNION SELECT id FROM special UNION SELECT id FROM grouped
  )
  SELECT jsonb_build_object('platform', p_platform, 'published_at', latest,
    'market', coalesce((SELECT jsonb_agg(to_jsonb(priced) ORDER BY priced.overall DESC, priced.price) FROM priced WHERE priced.id IN (SELECT id FROM picked)), '[]'::JSONB),
    'items', coalesce((SELECT jsonb_agg(DISTINCT to_jsonb(cat)) FROM cat WHERE cat.ea_item_id = ANY (coalesce(p_ids, '{}'::BIGINT[]))), '[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.sbc_card_pool(TEXT, BIGINT[], TEXT[], INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.sbc_card_pool(TEXT, BIGINT[], TEXT[], INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
