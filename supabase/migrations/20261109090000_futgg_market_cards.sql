-- "Market cards" list for Market Lab: every catalogue card from the FUT.GG card list with its latest FUT.GG price on
-- one platform and the change since the previous refresh. Filters, sort and paging run here so the website gets one
-- small page per request. Service role only (fut-api calls it for signed-in users; nothing here is per-user).
CREATE OR REPLACE FUNCTION fut.futgg_market_cards(
  p_platform TEXT DEFAULT 'console', p_q TEXT DEFAULT NULL, p_position TEXT DEFAULT NULL, p_type TEXT DEFAULT NULL,
  p_min_rating INTEGER DEFAULT NULL, p_max_rating INTEGER DEFAULT NULL, p_min_price INTEGER DEFAULT NULL, p_max_price INTEGER DEFAULT NULL,
  p_sort TEXT DEFAULT 'price_desc', p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
-- No nested loops: before the planner has statistics on fresh rows it picks them and the page takes a minute.
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE
  latest TIMESTAMPTZ; previous TIMESTAMPTZ; q TEXT := nullif(lower(trim(p_q)), ''); result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  IF p_sort NOT IN ('price_desc', 'price_asc', 'rating_desc', 'change_desc', 'change_asc', 'name') THEN RAISE EXCEPTION 'unknown sort'; END IF;
  SELECT max(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform;
  SELECT max(published_at) INTO previous FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform AND published_at < latest;
  WITH now_p AS MATERIALIZED (
    SELECT ea_item_id::TEXT AS key, price FROM fut.futgg_prices
    WHERE game_year = 27 AND platform = p_platform AND published_at = latest AND price IS NOT NULL
  ), before_p AS MATERIALIZED (
    SELECT ea_item_id::TEXT AS key, price FROM fut.futgg_prices
    WHERE previous IS NOT NULL AND game_year = 27 AND platform = p_platform AND published_at = previous AND price IS NOT NULL
  ), cards AS (
    SELECT c.id, c.player_name, c.version, c.overall, c.positions[1] AS position, c.club, c.league, c.nation, c.is_icon, c.is_hero,
      c.market_tracked, c.source_card_key::BIGINT AS ea_item_id, now_p.price, before_p.price AS previous_price,
      CASE WHEN before_p.price > 0 THEN round((now_p.price - before_p.price) * 100.0 / before_p.price, 1) END AS change_pct
    FROM fut.player_cards c
    JOIN now_p ON now_p.key = c.source_card_key
    LEFT JOIN before_p ON before_p.key = c.source_card_key
    WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue'
      AND (q IS NULL OR lower(c.player_name) LIKE '%' || q || '%' OR lower(coalesce(c.club, '')) LIKE '%' || q || '%'
        OR lower(coalesce(c.nation, '')) LIKE '%' || q || '%' OR lower(coalesce(c.league, '')) LIKE '%' || q || '%')
      AND (p_position IS NULL OR c.positions[1] = p_position)
      AND (p_type IS NULL OR (p_type = 'icon' AND c.is_icon) OR (p_type = 'hero' AND c.is_hero)
        OR (p_type = 'base' AND NOT c.is_icon AND NOT c.is_hero AND lower(coalesce(c.version, '')) IN ('rare', 'common', ''))
        OR (p_type = 'promo' AND NOT c.is_icon AND NOT c.is_hero AND lower(coalesce(c.version, '')) NOT IN ('rare', 'common', '')))
      AND (p_min_rating IS NULL OR c.overall >= p_min_rating) AND (p_max_rating IS NULL OR c.overall <= p_max_rating)
  ), priced AS (
    SELECT * FROM cards WHERE TRUE
      AND (p_min_price IS NULL OR price >= p_min_price) AND (p_max_price IS NULL OR price <= p_max_price)
  ), ranked AS (
    SELECT priced.*, row_number() OVER (ORDER BY
      CASE WHEN p_sort = 'price_desc' THEN price END DESC NULLS LAST,
      CASE WHEN p_sort = 'price_asc' THEN price END ASC NULLS LAST,
      CASE WHEN p_sort = 'rating_desc' THEN overall END DESC NULLS LAST,
      CASE WHEN p_sort = 'change_desc' THEN change_pct END DESC NULLS LAST,
      CASE WHEN p_sort = 'change_asc' THEN change_pct END ASC NULLS LAST,
      CASE WHEN p_sort = 'name' THEN player_name END ASC,
      overall DESC, price DESC, id) AS rn
    FROM priced
  ), page AS (
    SELECT * FROM ranked WHERE rn > greatest(coalesce(p_offset, 0), 0)
      AND rn <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  SELECT jsonb_build_object(
    'platform', p_platform, 'published_at', latest, 'previous_published_at', previous,
    'catalogue_cards', (SELECT count(*) FROM fut.player_cards WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue'),
    'total', (SELECT count(*) FROM priced),
    'cards', coalesce((SELECT jsonb_agg(to_jsonb(page) - 'rn' ORDER BY rn) FROM page), '[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.futgg_market_cards(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.futgg_market_cards(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) TO service_role;
-- Fix for 20261108160000: the catalogue key index is partial on owner_user_id IS NULL since the club sync
-- migration (20261102090000), so ON CONFLICT must name that predicate too. Without it every save failed.
CREATE OR REPLACE FUNCTION fut.upsert_futgg_catalogue(p_cards JSONB)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE n INTEGER;
BEGIN
  IF jsonb_typeof(p_cards) IS DISTINCT FROM 'array' OR jsonb_array_length(p_cards) > 5000 THEN
    RAISE EXCEPTION 'Catalogue batch must be an array of at most 5000 cards';
  END IF;
  INSERT INTO fut.player_cards AS c (owner_user_id, season, player_name, version, overall, positions, club, league, nation,
    is_icon, is_hero, evidence, source_id, source_card_key, source_updated_at)
  SELECT NULL, 'FC27', left(x.name, 60), left(x.version, 40), x.overall, ARRAY[x.position], left(x.club, 60), left(x.league, 60), left(x.nation, 60),
    coalesce(x.is_icon, false), coalesce(x.is_hero, false), 'game_data', 'futgg_catalogue', x.ea_item_id::TEXT, x.published_at
  FROM jsonb_to_recordset(p_cards) AS x(ea_item_id BIGINT, name TEXT, version TEXT, overall SMALLINT, position TEXT, club TEXT,
    league TEXT, nation TEXT, is_icon BOOLEAN, is_hero BOOLEAN, published_at TIMESTAMPTZ)
  WHERE x.ea_item_id > 0 AND length(trim(x.name)) > 0 AND x.overall BETWEEN 1 AND 99
    AND x.position IN (SELECT code FROM fut.positions)
  ON CONFLICT (source_id, source_card_key) WHERE source_card_key IS NOT NULL AND owner_user_id IS NULL DO UPDATE SET
    player_name = EXCLUDED.player_name, version = EXCLUDED.version, overall = EXCLUDED.overall, positions = EXCLUDED.positions,
    club = EXCLUDED.club, league = EXCLUDED.league, nation = EXCLUDED.nation, is_icon = EXCLUDED.is_icon, is_hero = EXCLUDED.is_hero,
    source_updated_at = EXCLUDED.source_updated_at, updated_at = now()
  WHERE (c.player_name, c.version, c.overall, c.positions, c.club, c.league, c.nation, c.is_icon, c.is_hero)
    IS DISTINCT FROM (EXCLUDED.player_name, EXCLUDED.version, EXCLUDED.overall, EXCLUDED.positions, EXCLUDED.club, EXCLUDED.league,
      EXCLUDED.nation, EXCLUDED.is_icon, EXCLUDED.is_hero);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION fut.upsert_futgg_catalogue(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.upsert_futgg_catalogue(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
