-- Sell or keep: each of the user's cards' FUT.GG price now, about 1, 3 and 7 days ago, and its 14-day low and high,
-- plus the cheapest price at every overall (the "fodder floor"), so fut-api can say which club cards to sell now and
-- which to keep. Read-only and service role only, like the rest of `fut`.

CREATE OR REPLACE FUNCTION fut.card_price_trend(p_platform TEXT, p_ids BIGINT[])
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE latest TIMESTAMPTZ; result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  IF coalesce(cardinality(p_ids), 0) > 2000 THEN RAISE EXCEPTION 'at most 2000 ids'; END IF;
  SELECT max(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform;
  WITH snaps AS MATERIALIZED (
    SELECT published_at FROM fut.futgg_snapshots
    WHERE latest IS NOT NULL AND game_year = 27 AND platform = p_platform AND published_at >= latest - interval '15 days'
  ), marks AS MATERIALIZED (
    -- The newest snapshot at least 20 hours / 3 days / 7 days older than the latest one.
    SELECT (SELECT max(published_at) FROM snaps WHERE published_at <= latest - interval '20 hours') AS d1,
           (SELECT max(published_at) FROM snaps WHERE published_at <= latest - interval '3 days') AS d3,
           (SELECT max(published_at) FROM snaps WHERE published_at <= latest - interval '7 days') AS d7
  ), ids AS MATERIALIZED (
    SELECT DISTINCT unnest(coalesce(p_ids, '{}'::BIGINT[])) AS ea_item_id
  ), hist AS MATERIALIZED (
    SELECT f.ea_item_id, f.published_at, f.price FROM fut.futgg_prices f
    WHERE latest IS NOT NULL AND f.game_year = 27 AND f.platform = p_platform AND f.price > 0
      AND f.published_at >= latest - interval '14 days' AND f.ea_item_id IN (SELECT ea_item_id FROM ids)
  ), per AS (
    SELECT h.ea_item_id,
      max(h.price) FILTER (WHERE h.published_at = latest) AS price,
      max(h.price) FILTER (WHERE h.published_at = m.d1) AS d1,
      max(h.price) FILTER (WHERE h.published_at = m.d3) AS d3,
      max(h.price) FILTER (WHERE h.published_at = m.d7) AS d7,
      min(h.price) AS low14, max(h.price) AS high14, count(*) AS points
    FROM hist h CROSS JOIN marks m GROUP BY h.ea_item_id
  ), floors AS (
    SELECT c.overall, min(f.price) AS price FROM fut.futgg_prices f
    JOIN fut.player_cards c ON c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue' AND c.source_card_key = f.ea_item_id::TEXT
    WHERE latest IS NOT NULL AND f.game_year = 27 AND f.platform = p_platform AND f.published_at = latest AND f.price > 0 AND c.overall >= 75
    GROUP BY c.overall
  )
  SELECT jsonb_build_object('platform', p_platform, 'published_at', latest,
    'items', coalesce((SELECT jsonb_agg(to_jsonb(per) ORDER BY per.ea_item_id) FROM per), '[]'::JSONB),
    'floors', coalesce((SELECT jsonb_object_agg(overall::TEXT, price) FROM floors), '{}'::JSONB)) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.card_price_trend(TEXT, BIGINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.card_price_trend(TEXT, BIGINT[]) TO service_role;

NOTIFY pgrst, 'reload schema';
