-- Promo / crash calendar: the market's step-by-step moves, by rating band, so GafferBot can back-test FUT's weekly
-- rhythm (TOTW, rewards, Friday promos, Champs weekend) from its own FUT.GG snapshots before saying anything about it.
-- For each twice-daily full refresh in the last p_days (1-90): the median price change since the refresh before,
-- over market-tracked catalogue cards, per rating band (and 'all'). Service role only, like the rest of `fut`.

CREATE OR REPLACE FUNCTION fut.market_steps(p_platform TEXT, p_days INTEGER DEFAULT 90)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE since TIMESTAMPTZ := now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 90)); result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') OR p_platform IS NULL THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  WITH snaps AS MATERIALIZED (
    SELECT published_at, lag(published_at) OVER (ORDER BY published_at) AS prev FROM fut.futgg_snapshots
    WHERE game_year = 27 AND platform = p_platform AND published_at >= since - INTERVAL '2 days'
  ), tracked AS MATERIALIZED (
    SELECT source_card_key::BIGINT AS ea_id,
      CASE WHEN overall >= 91 THEN '91+' WHEN overall >= 88 THEN '88-90' WHEN overall >= 85 THEN '85-87' WHEN overall >= 82 THEN '82-84' ELSE 'under 82' END AS band
    FROM fut.player_cards
    WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND market_tracked AND source_card_key ~ '^[1-9][0-9]{0,9}$'
  ), pairs AS (
    SELECT s.published_at AS t, t.band, a.price::NUMERIC / b.price - 1 AS move
    FROM snaps s
    JOIN fut.futgg_prices a ON a.game_year = 27 AND a.platform = p_platform AND a.published_at = s.published_at AND a.price IS NOT NULL
    JOIN fut.futgg_prices b ON b.game_year = 27 AND b.platform = p_platform AND b.published_at = s.prev AND b.ea_item_id = a.ea_item_id AND b.price IS NOT NULL
    JOIN tracked t ON t.ea_id = a.ea_item_id
    WHERE s.prev IS NOT NULL AND s.published_at >= since
  ), steps AS (
    SELECT t, band, percentile_cont(0.5) WITHIN GROUP (ORDER BY move) AS median_move, count(*) AS cards FROM pairs GROUP BY t, band
    UNION ALL
    SELECT t, 'all', percentile_cont(0.5) WITHIN GROUP (ORDER BY move), count(*) FROM pairs GROUP BY t
  )
  SELECT jsonb_build_object('platform', p_platform, 'since', since,
    'steps', coalesce((SELECT jsonb_agg(jsonb_build_object('t', t, 'band', band, 'move', round((median_move * 100)::NUMERIC, 2), 'cards', cards) ORDER BY t, band) FROM steps WHERE cards >= 10), '[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.market_steps(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.market_steps(TEXT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
