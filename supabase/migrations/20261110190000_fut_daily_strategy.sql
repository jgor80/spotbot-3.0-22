-- Daily FUT strategy: each user's plan for the day (what to buy, sell and relist), kept so later plans can show how
-- earlier picks did. Advice only: GafferBot never bids, buys or lists. Service role only (fut-api passes the user).
CREATE TABLE IF NOT EXISTS fut.strategy_plans (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  plan_date  DATE NOT NULL,                       -- the UK calendar day the plan is for
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prices_at  TIMESTAMPTZ,                         -- the FUT.GG refresh the plan was built on
  plan       JSONB NOT NULL,
  PRIMARY KEY (user_id, platform, plan_date)
);
ALTER TABLE fut.strategy_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fut.strategy_plans FROM PUBLIC, anon, authenticated;
GRANT ALL ON fut.strategy_plans TO service_role;

-- Price series for the market-wide card list (tracked cards, 1,000+ coins) plus any extra EA item ids the caller
-- passes (the user's club, transfer list and earlier picks), over the last p_days of FUT.GG refreshes on one platform.
-- Each card: catalogue details and its prices oldest first, with each point's age in hours before the latest refresh.
-- The scoring happens in fut-api (_shared/fut/strategy.ts) so it can be tested and changed without a migration.
CREATE OR REPLACE FUNCTION fut.strategy_price_series(p_platform TEXT, p_ids BIGINT[] DEFAULT '{}', p_days INTEGER DEFAULT 7)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE latest TIMESTAMPTZ; since TIMESTAMPTZ; result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') OR p_platform IS NULL THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  IF cardinality(coalesce(p_ids, '{}')) > 5000 THEN RAISE EXCEPTION 'too many item ids'; END IF;
  SELECT max(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform;
  IF latest IS NULL THEN
    RETURN jsonb_build_object('platform', p_platform, 'latest', NULL, 'snapshots', '[]'::JSONB, 'cards', '[]'::JSONB);
  END IF;
  since := latest - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30));
  WITH cards AS MATERIALIZED (
    SELECT DISTINCT ON (c.source_card_key::BIGINT) c.source_card_key::BIGINT AS ea_item_id, c.player_name, c.version, c.overall,
      c.positions[1] AS position, c.club, c.league, c.nation, c.is_icon, c.is_hero, c.market_tracked
    FROM fut.player_cards c
    WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue' AND c.source_card_key ~ '^\d{1,10}$'
      AND (c.market_tracked OR c.source_card_key::BIGINT = ANY (coalesce(p_ids, '{}')))
    ORDER BY c.source_card_key::BIGINT, c.id
  ), pts AS MATERIALIZED (
    SELECT p.ea_item_id, p.price, round(extract(epoch FROM latest - p.published_at) / 3600)::INTEGER AS age_h, p.published_at
    FROM fut.futgg_prices p
    WHERE p.game_year = 27 AND p.platform = p_platform AND p.published_at >= since AND p.published_at <= latest
      AND p.price IS NOT NULL AND p.ea_item_id IN (SELECT ea_item_id FROM cards)
  ), series AS (
    SELECT ea_item_id, jsonb_agg(price ORDER BY published_at) AS prices, jsonb_agg(age_h ORDER BY published_at) AS ages
    FROM pts GROUP BY ea_item_id
  )
  SELECT jsonb_build_object(
    'platform', p_platform, 'latest', latest,
    'snapshots', coalesce((SELECT jsonb_agg(round(extract(epoch FROM latest - s.published_at) / 3600)::INTEGER ORDER BY s.published_at)
      FROM fut.futgg_snapshots s WHERE s.game_year = 27 AND s.platform = p_platform AND s.published_at >= since), '[]'::JSONB),
    'cards', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'ea_item_id', c.ea_item_id, 'name', c.player_name, 'version', c.version, 'rating', c.overall, 'position', c.position,
      'club', c.club, 'league', c.league, 'nation', c.nation, 'is_icon', c.is_icon, 'is_hero', c.is_hero, 'tracked', c.market_tracked,
      'prices', s.prices, 'ages', s.ages))
      FROM cards c JOIN series s ON s.ea_item_id = c.ea_item_id), '[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.strategy_price_series(TEXT, BIGINT[], INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.strategy_price_series(TEXT, BIGINT[], INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
