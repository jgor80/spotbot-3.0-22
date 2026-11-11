-- Fodder index: what the cheapest cards of each rating (81-91, the SBC fodder range) cost at every full FUT.GG
-- refresh over the last p_days (1-90), like a stock index. floor = average of the 5 cheapest priced catalogue cards
-- at that overall (sturdier than the single cheapest); n = how many priced cards it had. Service role only.

CREATE OR REPLACE FUNCTION fut.fodder_index(p_platform TEXT, p_days INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE since TIMESTAMPTZ := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90)); result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') OR p_platform IS NULL THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  WITH cards AS MATERIALIZED (
    SELECT DISTINCT ON (source_card_key) source_card_key::BIGINT AS ea_item_id, overall FROM fut.player_cards
    WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND overall BETWEEN 81 AND 91 AND source_card_key ~ '^[1-9][0-9]{0,9}$'
  ), ranked AS (
    SELECT p.published_at, c.overall, p.price, row_number() OVER (PARTITION BY p.published_at, c.overall ORDER BY p.price) AS rn,
      count(*) OVER (PARTITION BY p.published_at, c.overall) AS n
    FROM fut.futgg_prices p JOIN cards c ON c.ea_item_id = p.ea_item_id
    WHERE p.game_year = 27 AND p.platform = p_platform AND p.published_at >= since AND p.price IS NOT NULL
  ), floors AS (
    SELECT published_at, overall, round(avg(price)) AS floor, max(n) AS n FROM ranked WHERE rn <= 5 GROUP BY published_at, overall
  )
  SELECT jsonb_build_object('platform', p_platform, 'since', since,
    'points', coalesce((SELECT jsonb_agg(jsonb_build_object('t', published_at, 'rating', overall, 'floor', floor, 'n', n) ORDER BY published_at, overall) FROM floors WHERE n >= 3), '[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.fodder_index(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.fodder_index(TEXT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
