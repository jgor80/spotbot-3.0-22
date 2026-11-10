-- Price alerts: GafferBot DMs a player on Discord when a card on their Market Lab watchlist reaches their buy or sell
-- target, or moves a lot between FUT.GG refreshes. Targets live on fut.market_watchlist already; this adds the
-- player's alert settings and each alert's fired/armed state, plus the lookup the bot's job runs after each refresh.
-- Service role only, like the rest of `fut`.

CREATE TABLE fut.alert_settings (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dm          BOOLEAN NOT NULL DEFAULT true,
  -- Also alert when a watched card moves at least this many percent between two refreshes (null = off).
  move_pct    SMALLINT CHECK (move_pct BETWEEN 3 AND 90),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fut.price_alert_state (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id        UUID NOT NULL REFERENCES fut.player_cards(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  kind           TEXT NOT NULL CHECK (kind IN ('buy', 'sell', 'move')),
  -- A target alert fires once, then re-arms when the price moves back past the target.
  armed          BOOLEAN NOT NULL DEFAULT true,
  last_fired_at  TIMESTAMPTZ,
  last_price     INTEGER,
  PRIMARY KEY (user_id, card_id, platform, kind)
);

GRANT ALL ON fut.alert_settings, fut.price_alert_state TO service_role;
ALTER TABLE fut.alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.price_alert_state ENABLE ROW LEVEL SECURITY;

-- Every watched card with a target (or with move alerts on) and its latest and previous FUT.GG price on its platform.
CREATE OR REPLACE FUNCTION fut.price_alert_candidates()
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE result JSONB;
BEGIN
  WITH snaps AS MATERIALIZED (
    SELECT platform, published_at, row_number() OVER (PARTITION BY platform ORDER BY published_at DESC) AS rn
    FROM fut.futgg_snapshots WHERE game_year = 27
  ), w AS MATERIALIZED (
    SELECT w.user_id, w.card_id, w.platform, w.target_buy, w.target_sell, c.player_name, c.overall, c.source_card_key, s.move_pct
    FROM fut.market_watchlist w
    JOIN fut.player_cards c ON c.id = w.card_id
    LEFT JOIN fut.alert_settings s ON s.user_id = w.user_id
    WHERE coalesce(s.dm, true) AND (w.target_buy IS NOT NULL OR w.target_sell IS NOT NULL OR s.move_pct IS NOT NULL)
      AND c.source_card_key ~ '^[0-9]{1,12}$'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', w.user_id, 'card_id', w.card_id, 'platform', w.platform, 'name', w.player_name, 'overall', w.overall,
    'target_buy', w.target_buy, 'target_sell', w.target_sell, 'move_pct', w.move_pct,
    'price', now_p.price, 'previous_price', prev_p.price, 'published_at', latest.published_at)), '[]'::JSONB)
  INTO result
  FROM w
  JOIN snaps latest ON latest.platform = w.platform AND latest.rn = 1
  LEFT JOIN snaps prev ON prev.platform = w.platform AND prev.rn = 2
  JOIN fut.futgg_prices now_p ON now_p.game_year = 27 AND now_p.platform = w.platform AND now_p.published_at = latest.published_at
    AND now_p.ea_item_id = w.source_card_key::BIGINT AND now_p.price > 0
  LEFT JOIN fut.futgg_prices prev_p ON prev_p.game_year = 27 AND prev_p.platform = w.platform AND prev_p.published_at = prev.published_at
    AND prev_p.ea_item_id = w.source_card_key::BIGINT;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.price_alert_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.price_alert_candidates() TO service_role;

NOTIFY pgrst, 'reload schema';
